const { Ollama } = require('ollama');
const { getSystemPrompt } = require('./prompts');
const { sendToRenderer, initializeNewSession, saveConversationTurn, state: geminiState } = require('./gemini');
const { getPreferences } = require('../storage');
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../utils/logger');

// ── State ──

let ollamaClient = null;
let ollamaModel = null;
let whisperPipeline = null;
let isWhisperLoading = false;
let localConversationHistory = [];
let currentSystemPrompt = null;
let isLocalActive = false;
let whisperEngine = 'cpp'; // 'cpp' | 'transformers'
let whisperModelPath = '';

// VAD state
let isSpeaking = false;
let speechBuffers = [];
let silenceFrameCount = 0;
let speechFrameCount = 0;

// VAD configuration
const VAD_MODES = {
    NORMAL: { energyThreshold: 0.01, speechFramesRequired: 3, silenceFramesRequired: 30 },
    LOW_BITRATE: { energyThreshold: 0.008, speechFramesRequired: 4, silenceFramesRequired: 35 },
    AGGRESSIVE: { energyThreshold: 0.015, speechFramesRequired: 2, silenceFramesRequired: 20 },
    VERY_AGGRESSIVE: { energyThreshold: 0.02, speechFramesRequired: 2, silenceFramesRequired: 15 },
};
let vadConfig = VAD_MODES.VERY_AGGRESSIVE;

// Audio resampling buffer
let resampleRemainder = Buffer.alloc(0);

// ── Audio Resampling (24kHz → 16kHz) ──

function resample24kTo16k(inputBuffer) {
    // Combine with any leftover samples from previous call
    const combined = Buffer.concat([resampleRemainder, inputBuffer]);
    const inputSamples = Math.floor(combined.length / 2); // 16-bit = 2 bytes per sample
    // Ratio: 16000/24000 = 2/3, so for every 3 input samples we produce 2 output samples
    const outputSamples = Math.floor((inputSamples * 2) / 3);
    const outputBuffer = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        // Map output sample index to input position
        const srcPos = (i * 3) / 2;
        const srcIndex = Math.floor(srcPos);
        const frac = srcPos - srcIndex;

        const s0 = combined.readInt16LE(srcIndex * 2);
        const s1 = srcIndex + 1 < inputSamples ? combined.readInt16LE((srcIndex + 1) * 2) : s0;
        const interpolated = Math.round(s0 + frac * (s1 - s0));
        outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    // Store remainder for next call
    const consumedInputSamples = Math.ceil((outputSamples * 3) / 2);
    const remainderStart = consumedInputSamples * 2;
    resampleRemainder = remainderStart < combined.length ? combined.slice(remainderStart) : Buffer.alloc(0);

    return outputBuffer;
}

// ── WAV Header Helper ──

function createWavHeader(dataLength) {
    const buffer = Buffer.alloc(44);
    // RIFF identifier
    buffer.write('RIFF', 0);
    // file length
    buffer.writeUInt32LE(36 + dataLength, 4);
    // RIFF type
    buffer.write('WAVE', 8);
    // format chunk identifier
    buffer.write('fmt ', 12);
    // format chunk length
    buffer.writeUInt32LE(16, 16);
    // sample format (1 is PCM)
    buffer.writeUInt16LE(1, 20);
    // channel count
    buffer.writeUInt16LE(1, 22);
    // sample rate
    buffer.writeUInt32LE(16000, 24);
    // byte rate (sampleRate * channels * bitsPerSample / 8)
    buffer.writeUInt32LE(16000 * 1 * 16 / 8, 28);
    // block align (channels * bitsPerSample / 8)
    buffer.writeUInt16LE(1 * 16 / 8, 32);
    // bits per sample
    buffer.writeUInt16LE(16, 34);
    // data chunk identifier
    buffer.write('data', 36);
    // data chunk length
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

// ── VAD (Voice Activity Detection) ──

function calculateRMS(pcm16Buffer) {
    const samples = pcm16Buffer.length / 2;
    if (samples === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / samples);
}

function processVAD(pcm16kBuffer) {
    const rms = calculateRMS(pcm16kBuffer);
    const isVoice = rms > vadConfig.energyThreshold;

    if (isVoice) {
        speechFrameCount++;
        silenceFrameCount = 0;

        if (!isSpeaking && speechFrameCount >= vadConfig.speechFramesRequired) {
            isSpeaking = true;
            speechBuffers = [];
            logger.info('[LocalAI] Speech started (RMS:', rms.toFixed(4), ')');
            sendToRenderer('update-status', 'Listening... (speech detected)');
        }
    } else {
        silenceFrameCount++;
        speechFrameCount = 0;

        if (isSpeaking && silenceFrameCount >= vadConfig.silenceFramesRequired) {
            isSpeaking = false;
            logger.info('[LocalAI] Speech ended, accumulated', speechBuffers.length, 'chunks');
            sendToRenderer('update-status', 'Transcribing...');

            // Trigger transcription with accumulated audio
            const audioData = Buffer.concat(speechBuffers);
            speechBuffers = [];
            handleSpeechEnd(audioData);
            return;
        }
    }

    // Accumulate audio during speech
    if (isSpeaking) {
        speechBuffers.push(Buffer.from(pcm16kBuffer));
    }
}

// ── Whisper Transcription ──

async function loadWhisperPipeline(modelName) {
    if (whisperPipeline) return whisperPipeline;
    if (isWhisperLoading) return null;

    isWhisperLoading = true;
    logger.info('[LocalAI] Loading Whisper model:', modelName);
    sendToRenderer('whisper-downloading', true);
    sendToRenderer('update-status', 'Loading Whisper model (first time may take a while)...');

    try {
        // Dynamic import for ESM module
        const { pipeline, env } = await import('@huggingface/transformers');
        // Cache models outside the asar archive so ONNX runtime can load them
        const { app } = require('electron');
        const path = require('path');
        env.cacheDir = path.join(app.getPath('userData'), 'whisper-models');
        whisperPipeline = await pipeline('automatic-speech-recognition', modelName, {
            dtype: 'q8',
            device: 'auto',
        });
        logger.info('[LocalAI] Whisper model loaded successfully');
        sendToRenderer('whisper-downloading', false);
        isWhisperLoading = false;
        return whisperPipeline;
    } catch (error) {
        logger.error('[LocalAI] Failed to load Whisper model:', error);
        sendToRenderer('whisper-downloading', false);
        sendToRenderer('update-status', 'Failed to load Whisper model: ' + error.message);
        isWhisperLoading = false;
        return null;
    }
}

function pcm16ToFloat32(pcm16Buffer) {
    const samples = pcm16Buffer.length / 2;
    const float32 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        float32[i] = pcm16Buffer.readInt16LE(i * 2) / 32768;
    }
    return float32;
}

async function transcribeAudio(pcm16kBuffer) {
    if (whisperEngine === 'cpp') {
        return await transcribeWithCpp(pcm16kBuffer);
    } else {
        return await transcribeWithTransformers(pcm16kBuffer);
    }
}

async function transcribeWithTransformers(pcm16kBuffer) {
    if (!whisperPipeline) {
        logger.error('[LocalAI] Whisper pipeline (Transformers) not loaded');
        return null;
    }

    try {
        const float32Audio = pcm16ToFloat32(pcm16kBuffer);
        const result = await whisperPipeline(float32Audio, {
            sampling_rate: 16000,
            language: 'en',
            task: 'transcribe',
        });

        const text = result.text?.trim();
        logger.info('[LocalAI] Transcription (Transformers):', text);
        return text;
    } catch (error) {
        logger.error('[LocalAI] Transformers transcription error:', error);
        return null;
    }
}

async function transcribeWithCpp(pcm16kBuffer) {
    const tempDir = path.join(os.tmpdir(), 'secret-sauce-audio');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempWav = path.join(tempDir, `chunk_${Date.now()}.wav`);
    const wavHeader = createWavHeader(pcm16kBuffer.length);
    const wavData = Buffer.concat([wavHeader, pcm16kBuffer]);

    try {
        fs.writeFileSync(tempWav, wavData);

        // whisper-node usage
        const whisper = require('whisper-node');
        const options = {
            modelPath: whisperModelPath,
            whisperOptions: {
                language: 'en',
                gen_file_txt: false,
                gen_file_vtt: false,
                gen_file_srt: false,
                gen_file_lrc: false,
                gen_file_json: false,
                split_on_word: false,
                no_timestamps: true,
            },
        };

        const results = await whisper(tempWav, options);
        
        // Clean up temp file
        try { fs.unlinkSync(tempWav); } catch (e) {}

        if (results && results.length > 0) {
            const text = results.map(r => r.speech).join(' ').trim();
            
            // Match Gemini Live style and suppress wave
            geminiState.isUserStreaming = true;
            console.log(`\x1b[34m[USER] >\x1b[0m ${text}`);
            
            if (geminiState.userStreamTimeout) clearTimeout(geminiState.userStreamTimeout);
            geminiState.userStreamTimeout = setTimeout(() => {
                geminiState.isUserStreaming = false;
            }, 1000);

            return text;
        }
        return null;
    } catch (error) {
        logger.error('[LocalAI] whisper.cpp transcription error:', error);
        try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
        return null;
    }
}

// ── Speech End Handler ──

async function handleSpeechEnd(audioData) {
    if (!isLocalActive) return;

    // Minimum audio length check (~0.5 seconds at 16kHz, 16-bit)
    if (audioData.length < 16000) {
        logger.info('[LocalAI] Audio too short, skipping');
        sendToRenderer('update-status', 'Listening...');
        return;
    }

    const transcription = await transcribeAudio(audioData);

    if (!transcription || transcription.trim() === '' || transcription.trim().length < 2) {
        logger.info('[LocalAI] Empty transcription, skipping');
        sendToRenderer('update-status', 'Listening...');
        return;
    }

    sendToRenderer('update-status', 'Generating response...');
    
    // Check if we should send to Ollama or if this is for cloud AI
    if (isLocalActive && ollamaClient) {
        await sendToOllama(transcription);
    } else {
        // This transcription will be handled by the module that requested it (e.g. gemini.js)
        logger.info('[LocalAI] Transcription ready for external use:', transcription);
        sendToRenderer('transcription-ready', transcription);
    }
}

// ── Ollama Chat ──

async function sendToOllama(transcription) {
    if (!ollamaClient || !ollamaModel) {
        logger.error('[LocalAI] Ollama not configured');
        return;
    }

    logger.info('[LocalAI] Sending to Ollama:', transcription.substring(0, 100) + '...');

    localConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    // Keep history manageable
    if (localConversationHistory.length > 20) {
        localConversationHistory = localConversationHistory.slice(-20);
    }

    try {
        const messages = [{ role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' }, ...localConversationHistory];

        const response = await ollamaClient.chat({
            model: ollamaModel,
            messages,
            stream: true,
        });

        let fullText = '';
        let isFirst = true;

        geminiState.isAiStreaming = true;
        try {
            for await (const part of response) {
                const token = part.message?.content || '';
                if (token) {
                    fullText += token;
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    
                    // Real-time terminal chunk logging
                    console.log(`\x1b[32m[AI] <\x1b[0m ${token.trim()}`);
                    
                    isFirst = false;
                }
            }
        } finally {
            geminiState.isAiStreaming = false;
        }

        if (fullText.trim()) {
            localConversationHistory.push({
                role: 'assistant',
                content: fullText.trim(),
            });

            saveConversationTurn(transcription, fullText);
        }

        logger.info('[LocalAI] Ollama response completed');
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        logger.error('[LocalAI] Ollama error:', error);
        sendToRenderer('update-status', 'Ollama error: ' + error.message);
    }
}

// ── Public API ──

async function initializeLocalSession(ollamaHost, model, whisperModel, profile, customPrompt) {
    const { app } = require('electron');
    const prefs = getPreferences();
    whisperEngine = prefs.whisperEngine || 'cpp';
    
    // Dynamically calculate model path based on selected whisperModel name
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    whisperModelPath = path.join(modelsDir, `ggml-${whisperModel || 'tiny.en'}.bin`);

    logger.info('[LocalAI] Initializing session:', { ollamaHost, model, whisperModel, whisperEngine, whisperModelPath, profile });

    sendToRenderer('session-initializing', true);

    try {
        // Setup system prompt
        currentSystemPrompt = getSystemPrompt(profile, customPrompt, false);

        if (ollamaHost && model) {
            // Initialize Ollama client
            ollamaClient = new Ollama({ host: ollamaHost });
            ollamaModel = model;

            // Test Ollama connection
            try {
                await ollamaClient.list();
                logger.info('[LocalAI] Ollama connection verified');
            } catch (error) {
                logger.error('[LocalAI] Cannot connect to Ollama at', ollamaHost, ':', error.message);
                sendToRenderer('session-initializing', false);
                sendToRenderer('update-status', 'Cannot connect to Ollama at ' + ollamaHost);
                return false;
            }
        }

        // Load Whisper model
        if (whisperEngine === 'transformers') {
            const pipeline = await loadWhisperPipeline(whisperModel);
            if (!pipeline) {
                sendToRenderer('session-initializing', false);
                return false;
            }
        } else {
            // Validate whisper.cpp model path
            if (!whisperModelPath || !fs.existsSync(whisperModelPath)) {
                logger.error('[LocalAI] whisper.cpp model not found at:', whisperModelPath);
                sendToRenderer('session-initializing', false);
                sendToRenderer('update-status', 'whisper.cpp model not found. Please check settings.');
                return false;
            }
            logger.info('[LocalAI] Using whisper.cpp model:', whisperModelPath);
        }

        // Reset VAD state
        isSpeaking = false;
        speechBuffers = [];
        silenceFrameCount = 0;
        speechFrameCount = 0;
        resampleRemainder = Buffer.alloc(0);
        localConversationHistory = [];

        // Initialize conversation session
        initializeNewSession(profile, customPrompt);

        isLocalActive = true;
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', 'AI ready - Listening...');

        console.log('[LocalAI] Session initialized successfully');
        return true;
    } catch (error) {
        console.error('[LocalAI] Initialization error:', error);
        sendToRenderer('session-initializing', false);
        sendToRenderer('update-status', 'AI error: ' + error.message);
        return false;
    }
}

function processLocalAudio(monoChunk24k) {
    // Process audio even if local session isn't "active" in the Ollama sense,
    // as long as we want local transcription (e.g. for Gemini BYOK mode)
    const pcm16k = resample24kTo16k(monoChunk24k);
    if (pcm16k.length > 0) {
        processVAD(pcm16k);
    }
}

function closeLocalSession() {
    console.log('[LocalAI] Closing local session');
    isLocalActive = false;
    isSpeaking = false;
    speechBuffers = [];
    silenceFrameCount = 0;
    speechFrameCount = 0;
    resampleRemainder = Buffer.alloc(0);
    localConversationHistory = [];
    ollamaClient = null;
    ollamaModel = null;
    currentSystemPrompt = null;
    // Note: whisperPipeline is kept loaded to avoid reloading on next session
}

function isLocalSessionActive() {
    return isLocalActive;
}

// ── Send text directly to Ollama (for manual text input) ──

async function sendLocalText(text) {
    if (!isLocalActive || !ollamaClient) {
        return { success: false, error: 'No active local session' };
    }

    try {
        await sendToOllama(text);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendLocalImage(base64Data, prompt) {
    if (!isLocalActive || !ollamaClient) {
        return { success: false, error: 'No active local session' };
    }

    try {
        console.log('[LocalAI] Sending image to Ollama');
        sendToRenderer('update-status', 'Analyzing image...');

        const userMessage = {
            role: 'user',
            content: prompt,
            images: [base64Data],
        };

        // Store text-only version in history
        localConversationHistory.push({ role: 'user', content: prompt });

        if (localConversationHistory.length > 20) {
            localConversationHistory = localConversationHistory.slice(-20);
        }

        const messages = [
            { role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' },
            ...localConversationHistory.slice(0, -1),
            userMessage,
        ];

        const response = await ollamaClient.chat({
            model: ollamaModel,
            messages,
            stream: true,
        });

        let fullText = '';
        let isFirst = true;

        for await (const part of response) {
            const token = part.message?.content || '';
            if (token) {
                fullText += token;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                isFirst = false;
            }
        }

        if (fullText.trim()) {
            localConversationHistory.push({ role: 'assistant', content: fullText.trim() });
            saveConversationTurn(prompt, fullText);
        }

        console.log('[LocalAI] Image response completed');
        sendToRenderer('update-status', 'Listening...');
        return { success: true, text: fullText, model: ollamaModel };
    } catch (error) {
        console.error('[LocalAI] Image error:', error);
        sendToRenderer('update-status', 'Ollama error: ' + error.message);
        return { success: false, error: error.message };
    }
}

async function downloadWhisperModel(modelName = 'base.en') {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    if (fs.existsSync(modelPath)) {
        logger.info('[LocalAI] Model already exists at:', modelPath);
        return { success: true, path: modelPath };
    }

    sendToRenderer('update-status', `Downloading Whisper model (${modelName})...`);
    sendToRenderer('whisper-download-progress', { progress: 0 });

    let currentUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName}.bin`;
    let redirects = 0;
    const MAX_REDIRECTS = 5;

    while (redirects < MAX_REDIRECTS) {
        try {
            const result = await new Promise((resolve, reject) => {
                const https = require('https');
                const request = https.get(currentUrl, { rejectUnauthorized: false }, (response) => {
                    // Handle Redirects
                    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                        const nextUrl = response.headers.location;
                        response.resume(); // Consume response to free up memory
                        resolve({ isRedirect: true, nextUrl });
                        return;
                    }
                    
                    if (response.statusCode !== 200) {
                        response.resume();
                        reject(new Error(`Failed to download model: ${response.statusCode} ${response.statusMessage}`));
                        return;
                    }

                    const totalSize = parseInt(response.headers['content-length'], 10);
                    let downloadedSize = 0;
                    const writer = fs.createWriteStream(modelPath);

                    response.on('data', (chunk) => {
                        downloadedSize += chunk.length;
                        writer.write(chunk);
                        if (totalSize) {
                            const progress = (downloadedSize / totalSize) * 100;
                            sendToRenderer('whisper-download-progress', { progress: Math.round(progress) });
                        }
                    });

                    response.on('end', () => {
                        writer.end();
                        resolve({ isRedirect: false, path: modelPath });
                    });

                    response.on('error', (err) => {
                        writer.close();
                        if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
                        reject(err);
                    });
                });

                request.on('error', (err) => {
                    if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
                    reject(err);
                });
            });

            if (result.isRedirect) {
                currentUrl = result.nextUrl;
                redirects++;
                logger.info(`[LocalAI] Redirecting to: ${currentUrl} (Attempt ${redirects})`);
                continue;
            }

            logger.info('[LocalAI] Model downloaded successfully to:', result.path);
            return { success: true, path: result.path };

        } catch (error) {
            logger.error('[LocalAI] Model download failed:', error);
            if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
            return { success: false, error: error.message };
        }
    }

    return { success: false, error: 'Too many redirects' };
}

ipcMain.handle('download-whisper-model', async (event, modelName) => {
    return await downloadWhisperModel(modelName);
});

ipcMain.handle('check-whisper-model-exists', async (event, modelName) => {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    return fs.existsSync(modelPath);
});

ipcMain.handle('delete-whisper-model', async (event, modelName) => {
    try {
        const { app } = require('electron');
        const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
        const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
        if (fs.existsSync(modelPath)) {
            fs.unlinkSync(modelPath);
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

module.exports = {
    initializeLocalSession,
    processLocalAudio,
    closeLocalSession,
    isLocalSessionActive,
    sendLocalText,
    sendLocalImage,
    downloadWhisperModel,
};
