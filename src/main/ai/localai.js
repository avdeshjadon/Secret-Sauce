const { Ollama } = require('ollama');
const { getSystemPrompt } = require('./prompts');
const {
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    state: geminiState,
    handleLocalTranscription,
    failoverToGeminiTranscription,
} = require('./gemini');
const { getPreferences } = require('../storage');
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger, streamLogger } = require('../utils/logger');
const { spawn } = require('child_process');

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
let cppWhisperUnavailable = false;
let consecutiveTranscriptionFailures = 0;
let activeDownloads = new Map(); // modelName -> { request, writer }
function resolveTransformersWhisperModel(modelName) {
    const clean = String(modelName || 'tiny.en').trim();
    if (clean.startsWith('openai/')) return clean;
    const map = {
        'tiny.en': 'onnx-community/whisper-tiny.en',
        'base.en': 'onnx-community/whisper-base.en',
        'small.en': 'onnx-community/whisper-small.en',
    };
    return map[clean] || 'onnx-community/whisper-tiny.en';
}

// Configure Transformers.js cache directory for easier management
async function configureTransformersCache() {
    try {
        const { env } = await import('@huggingface/transformers');
        const { app } = require('electron');
        env.cacheDir = path.join(app.getPath('userData'), 'transformers-cache');
    } catch (e) {
        logger.error('[LocalAI] Failed to configure Transformers cache:', e);
    }
}
configureTransformersCache();
function streamSessionId() {
    return geminiState.sessionId || 'no-session';
}

// VAD state
let isSpeaking = false;
let speechBuffers = [];
let silenceFrameCount = 0;
let speechFrameCount = 0;

// VAD configuration
const VAD_MODES = {
    NORMAL: { energyThreshold: 0.01, speechFramesRequired: 2, silenceFramesRequired: 12 },
    LOW_BITRATE: { energyThreshold: 0.008, speechFramesRequired: 2, silenceFramesRequired: 14 },
    AGGRESSIVE: { energyThreshold: 0.015, speechFramesRequired: 1, silenceFramesRequired: 8 },
    VERY_AGGRESSIVE: { energyThreshold: 0.02, speechFramesRequired: 1, silenceFramesRequired: 6 },
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
    buffer.writeUInt32LE((16000 * 1 * 16) / 8, 28);
    // block align (channels * bitsPerSample / 8)
    buffer.writeUInt16LE((1 * 16) / 8, 32);
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
        isWhisperLoading = false;
        return whisperPipeline;
    } catch (error) {
        logger.error('[LocalAI] Failed to load Whisper model:', error);
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
    if (whisperEngine === 'cpp' && !cppWhisperUnavailable) {
        const cppResult = await transcribeWithCpp(pcm16kBuffer);
        if (cppResult !== null) return cppResult;

        // Only fallback if there was an actual error (null), not just empty string
        cppWhisperUnavailable = true;
        whisperEngine = 'transformers';
        logger.warn('[LocalAI] whisper.cpp error, switching to Transformers fallback');
        sendToRenderer('update-status', 'whisper.cpp unavailable; switching to Transformers...');
        const prefs = getPreferences();
        const fallbackModelId = prefs.transformersModel || prefs.whisperModel || 'tiny.en';
        const pipeline = await loadWhisperPipeline(resolveTransformersWhisperModel(fallbackModelId));
        if (!pipeline) return null;
        return await transcribeWithTransformers(pcm16kBuffer);
    }
    return await transcribeWithTransformers(pcm16kBuffer);
}

async function transcribeWithTransformers(pcm16kBuffer) {
    if (!whisperPipeline) {
        logger.error('[LocalAI] Whisper pipeline (Transformers) not loaded');
        return null;
    }

    try {
        const float32Audio = pcm16ToFloat32(pcm16kBuffer);
        
        // Determine if model is English-only to avoid generation errors
        const isEnglishOnly = whisperModelPath?.toLowerCase().includes('.en') || 
                             whisperPipeline?.model?.config?._name_or_path?.toLowerCase().includes('.en');

        const options = {
            sampling_rate: 16000,
        };

        if (!isEnglishOnly) {
            options.language = 'en';
            options.task = 'transcribe';
        }

        const result = await whisperPipeline(float32Audio, options);

        const text = result.text?.trim();
        logger.info('[LocalAI] Transcription (Transformers)', text ? `(len=${text.length})` : '(empty)');
        return text;
    } catch (error) {
        logger.error('[LocalAI] Transformers transcription error:', error);
        return null;
    }
}

async function runWhisperBinary(audioPath, modelPath) {
    return new Promise((resolve, reject) => {
        const { app } = require('electron');
        let binaryPath = '';

        const platform = process.platform;
        let binaryName = 'main_darwin';
        if (platform === 'win32') binaryName = 'main_win.exe';
        else if (platform === 'linux') binaryName = 'main_linux';

        if (app.isPackaged) {
            binaryPath = path.join(process.resourcesPath, 'src', 'assets', 'bin', 'whisper', binaryName);
        } else {
            binaryPath = path.join(app.getAppPath(), 'src', 'assets', 'bin', 'whisper', binaryName);
        }

        // Final safety check/fallback
        if (!fs.existsSync(binaryPath)) {
            binaryPath = path.join(app.getAppPath(), 'src', 'assets', 'bin', 'whisper', binaryName);
        }

        const args = [
            '--model', modelPath,
            '--file', audioPath,
            '--language', 'en',
            '--no-timestamps',
            '--threads', Math.max(1, os.cpus().length - 1).toString(),
        ];

        logger.debug('[LocalAI] Running whisper binary:', binaryPath, args.join(' '));

        const whisperProcess = spawn(binaryPath, args, {
            cwd: path.dirname(binaryPath)
        });
        let stdout = '';
        let stderr = '';

        whisperProcess.stdout.on('data', data => stdout += data.toString());
        whisperProcess.stderr.on('data', data => stderr += data.toString());

        const timeout = setTimeout(() => {
            whisperProcess.kill();
            reject(new Error('Whisper transcription timed out after 30s (Large models take time to load)'));
        }, 30000);

        whisperProcess.on('close', code => {
            clearTimeout(timeout);
            if (code !== 0) {
                logger.error('[LocalAI] Whisper binary error:', stderr);
                return reject(new Error(`Whisper process exited with code ${code}`));
            }

            const lines = stdout.split('\n');
            const transcription = lines
                .filter(l => l.trim() && !l.includes('whisper_init') && !l.includes('whisper_model'))
                .map(l => l.replace(/\[\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+\]\s+/, ''))
                .join(' ')
                .trim();

            resolve(transcription || null);
        });

        whisperProcess.on('error', err => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function transcribeWithCpp(pcm16kBuffer) {
    const tempDir = path.join(os.tmpdir(), 'secret-sauce-audio');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempWav = path.join(tempDir, `chunk_${Date.now()}.wav`);
    const wavHeader = createWavHeader(pcm16kBuffer.length);
    const wavData = Buffer.concat([wavHeader, pcm16kBuffer]);

    try {
        fs.writeFileSync(tempWav, wavData);
        const text = await runWhisperBinary(tempWav, whisperModelPath);
        
        // Clean up temp file
        try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}

        logger.info('[LocalAI] Transcription (Whisper.cpp)', text ? `(len=${text.length})` : '(empty)');
        return text;
    } catch (error) {
        logger.error('[LocalAI] Whisper.cpp transcription error:', error);
        try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
        return null;
    }
}

// ── Speech End Handler ──

async function handleSpeechEnd(audioData) {
    if (!isLocalActive) return;

    // Minimum audio length check (~0.2 seconds at 16kHz, 16-bit)
    if (audioData.length < 6400) {
        logger.info('[LocalAI] Audio too short, skipping');
        sendToRenderer('update-status', 'Listening...');
        return;
    }

    const transcription = await transcribeAudio(audioData);

    if (!transcription || transcription.trim() === '' || transcription.trim().length < 2) {
        logger.info('[LocalAI] Empty transcription, skipping');
        consecutiveTranscriptionFailures++;
        if (consecutiveTranscriptionFailures >= 2) {
            await failoverToGeminiTranscription('Local Whisper transcription failed repeatedly');
            consecutiveTranscriptionFailures = 0;
        }
        sendToRenderer('update-status', 'Listening...');
        return;
    }
    consecutiveTranscriptionFailures = 0;

    sendToRenderer('update-status', 'Generating response...');

    // Check if we should send to Ollama or if this is for cloud AI
    if (isLocalActive && ollamaClient) {
        await sendToOllama(transcription);
    } else {
        // Route transcription inside main process (no renderer IPC).
        logger.info('[LocalAI] Transcription ready for provider routing', `(len=${transcription.length})`);
        await handleLocalTranscription(transcription);
    }
}

// ── Ollama Chat ──

async function sendToOllama(transcription) {
    if (!ollamaClient || !ollamaModel) {
        logger.error('[LocalAI] Ollama not configured');
        return;
    }

    logger.info('[LocalAI] Sending to Ollama:', transcription.substring(0, 100) + '...');
    streamLogger.begin(streamSessionId(), 'user', `provider=ollama model=${ollamaModel || 'unknown'}`);
    streamLogger.chunk(streamSessionId(), 'user', transcription.trim());
    streamLogger.end(streamSessionId(), 'user');

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
        streamLogger.begin(streamSessionId(), 'ai', `provider=ollama model=${ollamaModel || 'unknown'}`);

        geminiState.isAiStreaming = true;
        try {
            for await (const part of response) {
                const token = part.message?.content || '';
                if (token) {
                    fullText += token;
                    streamLogger.chunk(streamSessionId(), 'ai', token);
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
            }
        } finally {
            geminiState.isAiStreaming = false;
            streamLogger.end(streamSessionId(), 'ai', `chars=${fullText.length}`);
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

async function initializeLocalSession(ollamaHost, model, whisperModel, profile, customPrompt, transformersModel) {
    const { app } = require('electron');
    const prefs = getPreferences();
    whisperEngine = prefs.whisperEngine || 'cpp';
    cppWhisperUnavailable = false;
    consecutiveTranscriptionFailures = 0;
    // whisper-node/cpp wrapper is unstable in many Electron macOS setups.
    // Prefer Transformers on macOS unless explicitly overridden.
    // On macOS, whisper.cpp is actually very stable and fast with Metal.
    // We only fallback if specifically requested or if it fails.
    if (process.platform === 'darwin' && whisperEngine === 'cpp') {
        logger.info('[LocalAI] Using whisper.cpp on macOS (Metal support enabled)');
    }

    // Dynamically calculate model path based on selected whisperModel name
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    whisperModelPath = path.join(modelsDir, `ggml-${whisperModel || 'tiny.en'}.bin`);

    logger.info('[LocalAI] Initializing session:', { ollamaHost, model, whisperModel, transformersModel, whisperEngine, whisperModelPath, profile });

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
            const transformersModel = resolveTransformersWhisperModel(whisperModel);
            const pipeline = await loadWhisperPipeline(transformersModel);
            if (!pipeline) {
                sendToRenderer('session-initializing', false);
                return false;
            }
            logger.info(`[ENGINE_ACTIVE] transcription=whisper-transformers model=${transformersModel}`);
            sendToRenderer('update-status', 'Engine: Whisper local (Transformers)');
        } else {
            // Validate whisper.cpp model path
            if (!whisperModelPath || !fs.existsSync(whisperModelPath)) {
                logger.error('[LocalAI] whisper.cpp model not found at:', whisperModelPath);
                sendToRenderer('session-initializing', false);
                sendToRenderer('update-status', 'whisper.cpp model not found. Please check settings.');
                return false;
            }
            logger.info('[LocalAI] Using whisper.cpp model:', whisperModelPath);
            logger.info(`[ENGINE_ACTIVE] transcription=whisper-cpp model=${whisperModelPath}`);
            sendToRenderer('update-status', 'Engine: Whisper local (cpp)');
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

        logger.info('[LocalAI] Session initialized successfully');
        return true;
    } catch (error) {
        logger.error('[LocalAI] Initialization error:', error);
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
    logger.info('[LocalAI] Closing local session');
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
        logger.info('[LocalAI] Sending image to Ollama');
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
        streamLogger.begin(streamSessionId(), 'user', `image-prompt model=${ollamaModel || 'unknown'}`);
        streamLogger.chunk(streamSessionId(), 'user', prompt);
        streamLogger.end(streamSessionId(), 'user');
        streamLogger.begin(streamSessionId(), 'ai', `provider=ollama-image model=${ollamaModel || 'unknown'}`);

        for await (const part of response) {
            const token = part.message?.content || '';
            if (token) {
                fullText += token;
                streamLogger.chunk(streamSessionId(), 'ai', token);
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                isFirst = false;
            }
        }
        streamLogger.end(streamSessionId(), 'ai', `chars=${fullText.length}`);

        if (fullText.trim()) {
            localConversationHistory.push({ role: 'assistant', content: fullText.trim() });
            saveConversationTurn(prompt, fullText);
        }

        logger.info('[LocalAI] Image response completed');
        sendToRenderer('update-status', 'Listening...');
        return { success: true, text: fullText, model: ollamaModel };
    } catch (error) {
        logger.error('[LocalAI] Image error:', error);
        sendToRenderer('update-status', 'Ollama error: ' + error.message);
        return { success: false, error: error.message };
    }
}

async function downloadWhisperModel(modelName) {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    const tempPath = modelPath + '.tmp';
    
    // Check if already finished
    if (fs.existsSync(modelPath)) {
        return { success: true, path: modelPath };
    }

    let currentUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName}.bin`;
    let redirects = 0;
    const maxRedirects = 5;

    while (redirects < maxRedirects) {
        try {
            const result = await new Promise((resolve, reject) => {
                const https = require('https');
                
                // Get current size if resuming
                let startPos = 0;
                if (fs.existsSync(tempPath)) {
                    startPos = fs.statSync(tempPath).size;
                }

                const options = {
                    headers: startPos > 0 ? { 'Range': `bytes=${startPos}-` } : {}
                };

                const request = https.get(currentUrl, options, response => {
                    // Handle Redirects
                    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                        const nextUrl = response.headers.location;
                        response.resume();
                        resolve({ isRedirect: true, nextUrl });
                        return;
                    }

                    // 206 Partial Content or 200 OK
                    if (response.statusCode !== 200 && response.statusCode !== 206) {
                        response.resume();
                        reject(new Error(`Failed to download model: ${response.statusCode} ${response.statusMessage}`));
                        return;
                    }

                    const contentRange = response.headers['content-range'];
                    let totalSize = parseInt(response.headers['content-length'], 10);
                    if (contentRange) {
                        const match = contentRange.match(/\/(\d+)$/);
                        if (match) totalSize = parseInt(match[1], 10);
                    } else if (startPos > 0 && response.statusCode === 200) {
                        // Server doesn't support Range, must restart
                        startPos = 0;
                        fs.truncateSync(tempPath, 0);
                    }

                    let downloadedSize = startPos;
                    const writer = fs.createWriteStream(tempPath, { flags: startPos > 0 ? 'a' : 'w' });

                    activeDownloads.set(modelName, { request, writer });

                    // Send initial progress immediately for smoother resume
                    if (startPos > 0 && totalSize) {
                        const initialProgress = Math.round((startPos / totalSize) * 100);
                        sendToRenderer('whisper-download-progress', { 
                            progress: initialProgress,
                            model: modelName,
                            type: 'cpp'
                        });
                    }

                    response.on('data', chunk => {
                        downloadedSize += chunk.length;
                        writer.write(chunk);
                        if (totalSize) {
                            const progress = (downloadedSize / totalSize) * 100;
                            sendToRenderer('whisper-download-progress', { 
                                progress: Math.round(progress),
                                model: modelName,
                                type: 'cpp'
                            });
                        }
                    });

                    response.on('end', () => {
                        writer.end();
                        activeDownloads.delete(modelName);
                        resolve({ isRedirect: false, path: tempPath });
                    });

                    response.on('error', err => {
                        writer.close();
                        activeDownloads.delete(modelName);
                        reject(err);
                    });
                });

                request.on('error', err => {
                    activeDownloads.delete(modelName);
                    reject(err);
                });
            });

            if (result.isRedirect) {
                currentUrl = result.nextUrl;
                redirects++;
                continue;
            }

            // Finalize
            fs.renameSync(tempPath, modelPath);
            logger.info('[LocalAI] Model downloaded and finalized:', modelPath);
            return { success: true, path: modelPath };
        } catch (error) {
            if (error.message === 'aborted' || error.message === 'Aborted' || error.code === 'ECONNRESET') {
                return { success: false, error: 'Paused', paused: true };
            }
            logger.error('[LocalAI] Model download failed:', error);
            return { success: false, error: error.message };
        }
    }

    return { success: false, error: 'Too many redirects' };
}

ipcMain.handle('download-whisper-model', async (event, modelName) => {
    return await downloadWhisperModel(modelName);
});

ipcMain.handle('check-whisper-partial-exists', async (event, modelName) => {
    try {
        const { app } = require('electron');
        const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
        const tempPath = path.join(modelsDir, `ggml-${modelName}.bin.tmp`);
        return fs.existsSync(tempPath);
    } catch (e) {
        return false;
    }
});

ipcMain.handle('check-whisper-model-exists', async (event, modelName) => {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    return fs.existsSync(modelPath);
});

ipcMain.handle('list-whisper-models', async () => {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    try {
        if (!fs.existsSync(modelsDir)) return { success: true, models: [] };
        const files = fs.readdirSync(modelsDir);
        const models = files
            .filter(f => f.startsWith('ggml-') && f.endsWith('.bin'))
            .map(f => f.replace('ggml-', '').replace('.bin', ''));
        return { success: true, models };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-whisper-model', async (event, modelName) => {
    const { app } = require('electron');
    const modelsDir = path.join(app.getPath('userData'), 'whisper-models');
    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);
    try {
        if (fs.existsSync(modelPath)) {
            fs.unlinkSync(modelPath);
            logger.info(`[LocalAI] Deleted model: ${modelName}`);
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('clear-all-local-data', async () => {
    const { app } = require('electron');
    const userData = app.getPath('userData');
    const dirs = [
        path.join(userData, 'whisper-models'),
        path.join(userData, 'transformers-cache'),
        path.join(userData, 'logs'),
    ];
    try {
        for (const dir of dirs) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('download-transformers-model', async (event, modelId) => {
    try {
        const fullModelName = resolveTransformersWhisperModel(modelId);
        logger.info(`[LocalAI] Pre-downloading Transformers model: ${fullModelName}`);
        
        const { pipeline, env } = await import('@huggingface/transformers');
        
        // Ensure cache dir is set
        const { app } = require('electron');
        env.cacheDir = path.join(app.getPath('userData'), 'transformers-cache');

        // This will trigger the download and caching with progress updates
        await pipeline('automatic-speech-recognition', fullModelName, {
            device: 'auto',
            dtype: 'q8',
            progress_callback: (info) => {
                if (info.status === 'progress') {
                    const progress = info.progress || (info.loaded && info.total ? (info.loaded / info.total) * 100 : 0);
                    sendToRenderer('whisper-download-progress', { 
                        progress: Math.round(progress),
                        model: modelId,
                        type: 'transformers'
                    });
                }
                if (info.status === 'done') {
                    sendToRenderer('whisper-download-progress', { 
                        progress: 100, 
                        model: modelId,
                        type: 'transformers'
                    });
                }
            }
        });
        
        logger.info(`[LocalAI] Transformers model ${modelId} cached successfully`);
        return { success: true };
    } catch (e) {
        logger.error(`[LocalAI] Transformers pre-download failed for ${modelId}:`, e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pull-ollama-model', async (event, modelName) => {
    try {
        const client = ollamaClient || new Ollama({ host: 'http://127.0.0.1:11434' });
        logger.info(`[LocalAI] Pulling Ollama model: ${modelName}`);
        
        // This is a streaming response, but for simplicity we'll wait for completion
        // and send progress if we can. 
        // For a better UX, we'd use a stream here.
        const stream = await client.pull({ model: modelName, stream: true });
        
        for await (const part of stream) {
            if (part.total) {
                const progress = Math.round((part.completed / part.total) * 100);
                sendToRenderer('whisper-download-progress', { 
                    progress, 
                    model: modelName,
                    type: 'ollama'
                });
            }
        }
        
        return { success: true };
    } catch (e) {
        logger.error(`[LocalAI] Failed to pull Ollama model ${modelName}:`, e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-ollama-model', async (event, modelName) => {
    try {
        const client = ollamaClient || new Ollama({ host: 'http://127.0.0.1:11434' });
        await client.delete({ model: modelName });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('check-transformers-model-exists', async (event, modelId) => {
    try {
        const { app } = require('electron');
        const fullModelName = resolveTransformersWhisperModel(modelId);
        const cacheDir = path.join(app.getPath('userData'), 'transformers-cache');
        
        // Correct path found via find: repo/name
        const modelPath = path.join(cacheDir, fullModelName);
        
        const exists = fs.existsSync(modelPath);
        logger.debug(`[LocalAI] Checking Transformers cache for ${modelId}: ${modelPath} -> ${exists}`);
        
        if (exists) {
            // Check for specific essential files to ensure it's not just an empty/partial folder
            // Transformers.js models usually have a config.json or an onnx folder
            const hasConfig = fs.existsSync(path.join(modelPath, 'config.json'));
            const hasTokenizer = fs.existsSync(path.join(modelPath, 'tokenizer.json'));
            
            return hasConfig || hasTokenizer;
        }
        return false;
    } catch (e) {
        logger.error(`[LocalAI] Error checking Transformers cache for ${modelId}:`, e);
        return false;
    }
});

ipcMain.handle('clear-transformers-model-cache', async (event, modelId) => {
    try {
        const { app } = require('electron');
        const fullModelName = resolveTransformersWhisperModel(modelId);
        const cacheDir = path.join(app.getPath('userData'), 'transformers-cache');
        const modelPath = path.join(cacheDir, fullModelName);
        
        if (fs.existsSync(modelPath)) {
            fs.rmSync(modelPath, { recursive: true, force: true });
            logger.info(`[LocalAI] Deleted Transformers cache for ${modelId}`);
            return { success: true };
        }
        return { success: false, error: 'Cache folder not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('pause-whisper-download', async (event, modelName) => {
    const download = activeDownloads.get(modelName);
    if (download) {
        download.request.destroy();
        download.writer.close();
        activeDownloads.delete(modelName);
        logger.info(`[LocalAI] Paused download for ${modelName}`);
        return { success: true };
    }
    return { success: false, error: 'No active download found' };
});

ipcMain.handle('list-local-models', async (event, host) => {
    try {
        const { Ollama } = require('ollama');
        const client = host ? new Ollama({ host }) : (ollamaClient || new Ollama({ host: 'http://127.0.0.1:11434' }));
        const response = await client.list();
        return { success: true, models: response.models || [] };
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
