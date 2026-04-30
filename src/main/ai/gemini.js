const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { logger, createSpinner, streamLogger } = require('../utils/logger');
const { saveDebugAudio } = require('../audio/utils');
const { getSystemPrompt } = require('./prompts');
const {
    getAvailableModel,
    incrementLimitCount,
    getApiKey,
    getGroqApiKey,
    incrementCharUsage,
    getModelForToday,
    getPreferences,
    updatePreference,
} = require('../storage');
const { connectCloud, sendCloudAudio, sendCloudText, sendCloudImage, closeCloud, isCloudActive, setOnTurnComplete } = require('./cloud');

// Lazy-loaded to avoid circular dependency (localai.js imports from gemini.js)
let _localai = null;
function getLocalAi() {
    if (!_localai) _localai = require('./localai');
    return _localai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix #5: Single encapsulated state object — no more scattered globals
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_SESSION_STATE = () => ({
    sessionId: null,
    currentTranscription: '',
    conversationHistory: [],
    screenAnalysisHistory: [],
    groqConversationHistory: [],
    profile: null,
    customPrompt: null,
    systemPrompt: null,
    isInitializing: false,
    // Provider
    providerMode: 'byok', // 'byok' | 'cloud' | 'local'
    // Reconnection — Fix #13: always starts at 0 for every fresh session
    isUserClosing: false,
    sessionParams: null,
    reconnectAttempts: 0, // was a module global, now part of state
    // Audio
    systemAudioProc: null,
    messageBuffer: '',
    isAiStreaming: false,
    isUserStreaming: false,
    userStreamTimeout: null,
    userFlushTimeout: null,
});

let state = INITIAL_SESSION_STATE();
let transcriptionFailoverInProgress = false;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// Renderer communication
// ─────────────────────────────────────────────────────────────────────────────

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function streamSessionId() {
    return state.sessionId || 'no-session';
}

function shouldUseGeminiRealtimeTranscription() {
    if (state.providerMode !== 'byok') return false;
    const prefs = getPreferences();
    return (prefs.transcriptionEngine || 'gemini') === 'gemini';
}

function getActiveTranscriptionEngineLabel() {
    const prefs = getPreferences();
    const selected = prefs.transcriptionEngine || 'gemini';
    if (state.providerMode === 'local') return 'whisper-local';
    if (state.providerMode === 'cloud') return 'cloud-transcription';
    return selected === 'whisper' ? 'whisper-local' : 'gemini-cloud';
}

async function flushUserTranscriptionBuffer() {
    const text = (state.currentTranscription || '').trim();
    if (!text) return;
    // If assistant is still streaming previous answer, retry shortly.
    if (state.isAiStreaming) {
        if (state.userFlushTimeout) clearTimeout(state.userFlushTimeout);
        state.userFlushTimeout = setTimeout(() => {
            flushUserTranscriptionBuffer().catch(() => {});
        }, 250);
        return;
    }
    state.currentTranscription = '';
    if (hasGroqKey()) {
        await sendToGroq(text);
    } else {
        await sendToGemma(text);
    }
}

async function failoverToWhisperTranscription(reason = 'Gemini transcription unavailable') {
    if (transcriptionFailoverInProgress) return false;
    transcriptionFailoverInProgress = true;
    try {
        logger.warn(`[Failover] Switching transcription engine to Whisper: ${reason}`);
        updatePreference('transcriptionEngine', 'whisper');
        const prefs = getPreferences();
        const ok = await getLocalAi().initializeLocalSession(
            null,
            null,
            prefs.whisperModel || 'tiny.en',
            state.profile || 'interview',
            state.customPrompt || ''
        );
        if (ok) {
            sendToRenderer('update-status', 'Gemini transcription failed. Switched to local Whisper.');
            return true;
        }
        logger.error('[Failover] Whisper fallback failed to initialize');
        return false;
    } catch (error) {
        logger.error('[Failover] Error switching to Whisper:', error);
        return false;
    } finally {
        transcriptionFailoverInProgress = false;
    }
}

async function failoverToGeminiTranscription(reason = 'Whisper transcription unavailable') {
    if (transcriptionFailoverInProgress) return false;
    transcriptionFailoverInProgress = true;
    try {
        logger.warn(`[Failover] Switching transcription engine to Gemini: ${reason}`);
        updatePreference('transcriptionEngine', 'gemini');
        if (!state.sessionParams?.apiKey) {
            logger.warn('[Failover] No Gemini session params available; cannot reinitialize Gemini transcription');
            return false;
        }
        if (global.geminiSessionRef?.current) {
            try {
                await global.geminiSessionRef.current.close();
            } catch (e) {}
            global.geminiSessionRef.current = null;
        }
        const session = await initializeGeminiSession(
            state.sessionParams.apiKey,
            state.sessionParams.customPrompt,
            state.sessionParams.profile,
            state.sessionParams.language,
            true
        );
        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;
            sendToRenderer('update-status', 'Whisper failed. Switched to Gemini transcription.');
            return true;
        }
        return false;
    } catch (error) {
        logger.error('[Failover] Error switching to Gemini:', error);
        return false;
    } finally {
        transcriptionFailoverInProgress = false;
    }
}

// ── Local transcription routing (main-process to main-process; no IPC) ──
function shouldLogContent() {
    return process.env.DEBUG_LOG_CONTENT === '1';
}

async function handleLocalTranscription(text) {
    if (!text || String(text).trim() === '') return;
    const clean = String(text).trim();
    logger.info('[LocalTranscription] Received', shouldLogContent() ? `: ${clean}` : `(len=${clean.length})`);
    streamLogger.begin(streamSessionId(), 'user', 'local-whisper');
    streamLogger.chunk(streamSessionId(), 'user', clean);
    streamLogger.end(streamSessionId(), 'user');

    if (state.providerMode !== 'byok') return;

    if (global.geminiSessionRef && global.geminiSessionRef.current) {
        try {
            await global.geminiSessionRef.current.sendRealtimeInput({ text: clean });
        } catch (error) {
            logger.error('[Gemini] Error sending local transcription to Gemini Live:', error);
        }
        return;
    }

    if (hasGroqKey()) {
        await sendToGroq(clean);
        return;
    }

    await sendToGemma(clean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker diarization
// ─────────────────────────────────────────────────────────────────────────────

function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript && result.speakerId) {
            const speakerLabel = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session management
// ─────────────────────────────────────────────────────────────────────────────

function initializeNewSession(profile = null, customPrompt = null, systemPrompt = null) {
    // Fix #13: atomic state reset — reconnectAttempts goes back to 0 here
    const fresh = INITIAL_SESSION_STATE();
    fresh.sessionId = Date.now().toString();
    fresh.profile = profile;
    fresh.customPrompt = customPrompt;
    if (systemPrompt) fresh.systemPrompt = systemPrompt;
    // Preserve providerMode across session resets
    fresh.providerMode = state.providerMode;
    state = fresh;

    logger.info('New conversation session started:', state.sessionId, 'profile:', profile);

    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: state.sessionId,
            profile: profile,
            customPrompt: customPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!state.sessionId) {
        initializeNewSession();
    }

    const turn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    state.conversationHistory.push(turn);
    // Minimal terminal logging by default (avoid leaking sensitive content).
    // Set DEBUG_LOG_CONTENT=1 to include full text.
    if (shouldLogContent()) {
        logger.info('[Turn] USER:', turn.transcription);
        logger.info('[Turn] AI  :', turn.ai_response);
    } else {
        logger.info('[Turn] saved', { userLen: turn.transcription.length, aiLen: turn.ai_response.length });
    }

    sendToRenderer('save-conversation-turn', {
        sessionId: state.sessionId,
        turn,
        fullHistory: state.conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model) {
    if (!state.sessionId) {
        initializeNewSession();
    }

    const entry = {
        timestamp: Date.now(),
        prompt,
        response: response.trim(),
        model,
    };

    state.screenAnalysisHistory.push(entry);
    if (shouldLogContent()) {
        logger.info('[ScreenAnalysis]', { model, prompt: entry.prompt, response: entry.response });
    } else {
        logger.info('[ScreenAnalysis] saved', { model, promptLen: String(entry.prompt || '').length, responseLen: entry.response.length });
    }

    sendToRenderer('save-screen-analysis', {
        sessionId: state.sessionId,
        analysis: entry,
        fullHistory: state.screenAnalysisHistory,
        profile: state.profile,
        customPrompt: state.customPrompt,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: state.sessionId,
        history: state.conversationHistory,
    };
}

function buildContextMessage() {
    const lastTurns = state.conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(t => t.transcription?.trim() && t.ai_response?.trim());
    if (validTurns.length === 0) return null;

    const lines = validTurns.map(t => `[Interviewer]: ${t.transcription.trim()}\n[Your answer]: ${t.ai_response.trim()}`);
    return `Session reconnected. Here's the conversation so far:\n\n${lines.join('\n\n')}\n\nContinue from here.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary generation
// ─────────────────────────────────────────────────────────────────────────────

async function generateSessionSummary() {
    if (!state.conversationHistory || state.conversationHistory.length === 0) {
        logger.info('No conversation history to summarize');
        return null;
    }

    const apiKey = getApiKey();
    if (!apiKey) return null;

    logger.info('Generating session summary...');
    sendToRenderer('update-status', 'Generating summary...');

    try {
        const ai = new GoogleGenAI({ apiKey });
        const historyText = state.conversationHistory.map(t => `[Interviewer]: ${t.transcription}\n[Candidate]: ${t.ai_response}`).join('\n\n');

        const prompt = `You are a professional meeting assistant. Based on the following conversation history from a ${state.profile || 'session'}, provide a concise, high-level summary.
        
        Include:
        1. **Key Discussion Points**
        2. **Action Items / Next Steps**
        3. **Overall Sentiment / Feedback**
        
        Keep it professional and formatted in **markdown**.
        
        Conversation History:
        ${historyText}`;

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const summary = result.response.text();

        if (summary) {
            logger.info('Summary generated successfully');
            sendToRenderer('session-summary', { sessionId: state.sessionId, summary });
            return summary;
        }
    } catch (error) {
        logger.error('Error generating summary:', error);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix #9 + Fix (getStoredSetting):
// Read Google Search setting from storage (main process) — not from renderer
// localStorage via executeJavaScript. That approach was fragile and insecure.
// ─────────────────────────────────────────────────────────────────────────────

function getEnabledTools() {
    try {
        const prefs = getPreferences();
        const googleSearchEnabled = prefs.googleSearchEnabled === true || prefs.googleSearchEnabled === 'true';
        logger.info('Google Search enabled:', googleSearchEnabled);

        if (googleSearchEnabled) {
            logger.info('Added Google Search tool');
            return [{ googleSearch: {} }];
        }
    } catch (error) {
        logger.error('Error reading preferences for tools:', error);
    }
    logger.info('Google Search tool disabled');
    return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider helpers
// ─────────────────────────────────────────────────────────────────────────────

function hasGroqKey() {
    const key = getGroqApiKey();
    return key && key.trim() !== '';
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
    if (!history || history.length === 0) return [];
    let totalChars = 0;
    const trimmed = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const turnChars = (turn.content || '').length;
        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        trimmed.unshift(turn);
    }
    return trimmed;
}

function stripThinkingTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq provider
// ─────────────────────────────────────────────────────────────────────────────

async function sendToGroq(transcription) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) {
        logger.info('No Groq API key configured, skipping Groq response');
        return;
    }
    if (!transcription || transcription.trim() === '') {
        logger.info('Empty transcription, skipping Groq');
        return;
    }

    const modelToUse = getModelForToday();
    if (!modelToUse) {
        logger.info('All Groq daily limits exhausted');
        sendToRenderer('update-status', 'Groq limits reached for today');
        return;
    }

    logger.info(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + '...');
    streamLogger.begin(streamSessionId(), 'user', `provider=groq model=${modelToUse}`);
    streamLogger.chunk(streamSessionId(), 'user', transcription.trim());
    streamLogger.end(streamSessionId(), 'user');

    const brevityReminder = "(Answer in 1-2 sentences ONLY, direct words to say): ";
    state.groqConversationHistory.push({ role: 'user', content: brevityReminder + transcription.trim() });
    if (state.groqConversationHistory.length > 20) {
        state.groqConversationHistory = state.groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [{ role: 'system', content: state.systemPrompt || getSystemPrompt('interview') }, ...state.groqConversationHistory],
                stream: true,
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Groq API error:', response.status, errorText);
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;
        streamLogger.begin(streamSessionId(), 'ai', `provider=groq model=${modelToUse}`);

        state.isAiStreaming = true; // Used by audio-wave logic
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices?.[0]?.delta?.content || '';
                            if (token) {
                                fullText += token;
                                streamLogger.chunk(streamSessionId(), 'ai', token);
                                const displayText = stripThinkingTags(fullText);
                                if (displayText) {
                                    sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);

                                    isFirst = false;
                                }
                            }
                        } catch (e) {
                            // Ignore partial JSON
                        }
                    }
                }
            }
        } finally {
            state.isAiStreaming = false; // Reset flag
            streamLogger.end(streamSessionId(), 'ai', `chars=${fullText.length}`);
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const modelKey = modelToUse.split('/').pop();
        const systemPromptChars = (state.systemPrompt || 'You are a helpful assistant.').length;
        const historyChars = state.groqConversationHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        incrementCharUsage('groq', modelKey, systemPromptChars + historyChars + cleanedResponse.length);

        if (cleanedResponse) {
            state.groqConversationHistory.push({ role: 'assistant', content: cleanedResponse });
            saveConversationTurn(transcription, cleanedResponse);
        }

        logger.info(`Groq response completed (${modelToUse})`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        logger.error('Error calling Groq API:', error);
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemma provider
// ─────────────────────────────────────────────────────────────────────────────

async function sendToGemma(transcription) {
    const apiKey = getApiKey();
    if (!apiKey) {
        logger.info('No Gemini API key configured');
        return;
    }
    if (!transcription || transcription.trim() === '') {
        logger.info('Empty transcription, skipping Gemma');
        return;
    }

    logger.info('Sending to Gemma:', transcription.substring(0, 100) + '...');
    streamLogger.begin(streamSessionId(), 'user', 'provider=gemma');
    streamLogger.chunk(streamSessionId(), 'user', transcription.trim());
    streamLogger.end(streamSessionId(), 'user');
    const brevityReminder = "(Answer in 1-2 sentences ONLY, direct words to say): ";
    state.groqConversationHistory.push({ role: 'user', content: brevityReminder + transcription.trim() });

    const trimmedHistory = trimConversationHistoryForGemma(state.groqConversationHistory, 42000);

    try {
        const ai = new GoogleGenAI({ apiKey });
        const messages = trimmedHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const systemPrompt = state.systemPrompt || getSystemPrompt('interview');
        
        const response = await ai.models.generateContentStream({
            model: 'gemma-3-27b-it',
            contents: messages,
            systemInstruction: { parts: [{ text: systemPrompt }] }
        });

        let fullText = '';
        let isFirst = true;
        streamLogger.begin(streamSessionId(), 'ai', 'provider=gemma');

        state.isAiStreaming = true;
        try {
            for await (const chunk of response) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullText += chunkText;
                    streamLogger.chunk(streamSessionId(), 'ai', chunkText);
                    sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                    isFirst = false;
                }
            }
        } finally {
            state.isAiStreaming = false; // Reset flag
            streamLogger.end(streamSessionId(), 'ai', `chars=${fullText.length}`);
        }

        const systemPromptChars = systemPrompt.length;
        const historyChars = trimmedHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        incrementCharUsage('gemini', 'gemma-3-27b-it', systemPromptChars + historyChars + fullText.length);

        if (fullText.trim()) {
            state.groqConversationHistory.push({ role: 'assistant', content: fullText.trim() });
            if (state.groqConversationHistory.length > 40) {
                state.groqConversationHistory = state.groqConversationHistory.slice(-40);
            }
            saveConversationTurn(transcription, fullText);
        }

        logger.info('Gemma response completed');
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        if (error.message.includes('503') || error.message.includes('UNAVAILABLE')) {
            logger.warn('[Gemma] Busy; falling back to Gemini Flash');
            state.isAiStreaming = true;
            try {
                const ai = new GoogleGenAI({ apiKey });
                const response = await ai.models.generateContentStream({
                    model: "gemini-1.5-flash",
                    contents: [{ role: 'user', parts: [{ text: transcription }] }]
                });
                
                let fullText = '';
                let isFirst = true;
                streamLogger.begin(streamSessionId(), 'ai', 'provider=gemini-flash-fallback');
                for await (const chunk of response) {
                    const chunkText = chunk.text;
                    if (chunkText) {
                        fullText += chunkText;
                        streamLogger.chunk(streamSessionId(), 'ai', chunkText);
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                        isFirst = false;
                    }
                }
                if (fullText.trim()) {
                    state.conversationHistory.push({ role: 'assistant', content: fullText.trim() });
                    saveConversationTurn(transcription, fullText);
                }
                return;
            } catch (fallbackError) {
                logger.error('Double failure (Gemma + Gemini Flash):', fallbackError);
            } finally {
                state.isAiStreaming = false; // Reset flag
                streamLogger.end(streamSessionId(), 'ai');
            }
        }

        logger.warn('[Gemma] Cloud failed; trying Local Ollama fallback', error.message);

        // Attempt fallback to Local AI (Ollama) if available
        const localAi = require('./localai');
        if (localAi.isLocalSessionActive()) {
            await localAi.sendLocalText(transcription);
        } else {
            logger.error('Error calling Gemma API and no local fallback available:', error);
            sendToRenderer('update-status', 'Gemma error: ' + error.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Live session
// ─────────────────────────────────────────────────────────────────────────────

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (state.isInitializing) {
        logger.info('Session initialization already in progress');
        return false;
    }

    state.isInitializing = true;
    if (!isReconnect) {
        sendToRenderer('session-initializing', true);
        // Fix #13: store params and reset counter on fresh session
        state.sessionParams = { apiKey, customPrompt, profile, language };
        state.reconnectAttempts = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    // Fix: read from storage, not from renderer localStorage
    const enabledTools = getEnabledTools();
    const googleSearchEnabled = enabledTools.some(t => t.googleSearch);
    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled);
    state.systemPrompt = systemPrompt;

    if (!isReconnect) {
        initializeNewSession(profile, customPrompt, systemPrompt);
    } else {
        state.systemPrompt = systemPrompt;
    }

    // Initialize transcription engine
    const prefs = getPreferences();
    const engineToUse = prefs.transcriptionEngine || 'gemini';
    let isUsingWhisper = false;

    if (process.env.DEBUG_LOG_CONTENT === '1') logger.info('='.repeat(60));
    if (engineToUse === 'whisper') {
        logger.info(`[ENGINE] >>> USING LOCAL WHISPER (PRIVATE) <<< Model: ${prefs.whisperModel}`);
        const whisperSuccess = await getLocalAi().initializeLocalSession(null, null, prefs.whisperModel, profile, customPrompt);
        if (whisperSuccess) {
            isUsingWhisper = true;
            logger.info(`[ENGINE_ACTIVE] transcription=${getActiveTranscriptionEngineLabel()}`);
            sendToRenderer('update-status', 'Engine: Whisper local');
        } else {
            logger.warn('[Whisper] Failed to start; falling back to Gemini internal');
            logger.warn('[Gemini] Failed to initialize local Whisper, falling back to Gemini internal transcription');
            updatePreference('transcriptionEngine', 'gemini');
            sendToRenderer('update-status', 'Whisper unavailable. Switched to Gemini transcription.');
            logger.info(`[ENGINE_ACTIVE] transcription=${getActiveTranscriptionEngineLabel()}`);
        }
    } else {
        logger.info('[ENGINE] >>> USING GEMINI CLOUD TRANSCRIPTION (FASTEST) <<<');
        isUsingWhisper = false;
        logger.info(`[ENGINE_ACTIVE] transcription=${getActiveTranscriptionEngineLabel()}`);
        sendToRenderer('update-status', 'Engine: Gemini cloud');
    }
    if (process.env.DEBUG_LOG_CONTENT === '1') logger.info('='.repeat(60));

    try {
        const session = await client.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    streamLogger.begin(streamSessionId(), 'user', 'provider=gemini-live');
                    streamLogger.begin(streamSessionId(), 'ai', 'provider=gemini-live');
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: message => {
                    // 1. Handle Input Transcription (User Speaking) - TRUE CHUNKS
                    if (message.serverContent?.inputTranscription) {
                        state.isUserStreaming = true; // Silence wave
                        const text =
                            message.serverContent.inputTranscription.text || formatSpeakerResults(message.serverContent.inputTranscription.results);
                        if (text && text.trim() !== '') {
                            state.currentTranscription += text;
                            streamLogger.chunk(streamSessionId(), 'user', text.trim());
                            // Early flush for lower latency (don't wait only for generationComplete).
                            if (state.userFlushTimeout) clearTimeout(state.userFlushTimeout);
                            state.userFlushTimeout = setTimeout(() => {
                                flushUserTranscriptionBuffer().catch(err => {
                                    logger.error('Early transcription flush failed:', err);
                                });
                            }, 450);
                        }

                        // Reset flag after 1 second of no new transcription chunks
                        if (state.userStreamTimeout) clearTimeout(state.userStreamTimeout);
                        state.userStreamTimeout = setTimeout(() => {
                            state.isUserStreaming = false;
                        }, 1000);
                    }

                    // 2. Handle Model Response (AI Speaking) - TRUE CHUNKS
                    if (message.serverContent?.modelTurn?.parts) {
                        state.isAiStreaming = true; // Set flag to silence wave
                        const text = message.serverContent.modelTurn.parts.map(p => p.text || '').join('');
                        if (text && text.trim() !== '') {
                            state.messageBuffer += text;
                            streamLogger.chunk(streamSessionId(), 'ai', text.trim());
                        }
                    }

                    if (message.serverContent?.generationComplete) {
                        state.isAiStreaming = false; // Reset flag when done
                        streamLogger.end(streamSessionId(), 'ai');
                        if (state.currentTranscription.trim() !== '') {
                            streamLogger.end(streamSessionId(), 'user');
                            flushUserTranscriptionBuffer().catch(err => {
                                logger.error('Final transcription flush failed:', err);
                            });
                        }
                        state.messageBuffer = '';
                    }

                    if (message.serverContent?.turnComplete) {
                        streamLogger.begin(streamSessionId(), 'user', 'provider=gemini-live');
                        streamLogger.begin(streamSessionId(), 'ai', 'provider=gemini-live');
                        sendToRenderer('update-status', 'Listening...');
                    }
                },
                onerror: e => {
                    logger.error('Session error:', e.message);
                    sendToRenderer('update-status', 'Error: ' + e.message);
                    const prefs = getPreferences();
                    if ((prefs.transcriptionEngine || 'gemini') === 'gemini') {
                        failoverToWhisperTranscription(`Gemini onerror: ${e.message}`);
                    }
                },
                onclose: e => {
                    logger.info('Session closed:', e.reason);

                    if (state.isUserClosing) {
                        state.isUserClosing = false;
                        sendToRenderer('update-status', 'Session closed');
                        return;
                    }

                    // Fix #13: reconnectAttempts is inside state, always fresh per session
                    if (state.sessionParams && state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        attemptReconnect();
                    } else {
                        sendToRenderer('update-status', 'Session closed');
                    }
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                proactivity: { proactiveAudio: true },
                outputAudioTranscription: {},
                tools: enabledTools,
                inputAudioTranscription: {
                    enabled: !isUsingWhisper, // Enable if not using local Whisper
                    enableSpeakerDiarization: !isUsingWhisper,
                    minSpeakerCount: 2,
                    maxSpeakerCount: 2,
                },
                contextWindowCompression: { slidingWindow: {} },
                speechConfig: { languageCode: language },
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
            },
        });

        state.isInitializing = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return session;
    } catch (error) {
        logger.error('[CRITICAL] Failed to initialize Gemini session:', error.message);

        // Fallback to local Whisper if cloud session fails
        const prefs = getPreferences();
        if (prefs.transcriptionEngine !== 'whisper') {
            logger.warn('[FALLBACK] Attempting to start Local Whisper due to Gemini failure...');
            await failoverToWhisperTranscription(`Gemini init failed: ${error.message}`);
        }

        logger.error('Failed to initialize Gemini session:', error);
        state.isInitializing = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

async function attemptReconnect() {
    state.reconnectAttempts++;
    logger.info(`Reconnection attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    state.messageBuffer = '';
    state.currentTranscription = '';
    if (state.userFlushTimeout) {
        clearTimeout(state.userFlushTimeout);
        state.userFlushTimeout = null;
    }

    sendToRenderer('update-status', `Reconnecting... (${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeGeminiSession(
            state.sessionParams.apiKey,
            state.sessionParams.customPrompt,
            state.sessionParams.profile,
            state.sessionParams.language,
            true // isReconnect
        );

        if (session && global.geminiSessionRef) {
            global.geminiSessionRef.current = session;

            const contextMessage = buildContextMessage();
            if (contextMessage) {
                try {
                    logger.info('Restoring conversation context...');
                    await session.sendRealtimeInput({ text: contextMessage });
                } catch (contextError) {
                    logger.error('Failed to restore context:', contextError);
                }
            }

            sendToRenderer('update-status', 'Reconnected! Listening...');
            logger.info('Session reconnected successfully');
            return true;
        }
    } catch (error) {
        logger.error(`Reconnection attempt ${state.reconnectAttempts} failed:`, error);
    }

    if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect();
    }

    logger.info('Max reconnection attempts reached');
    sendToRenderer('reconnect-failed', {
        message: 'Tried 3 times to reconnect. Must be upstream/network issues. Try restarting or download updated app from site.',
    });
    state.sessionParams = null;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio capture (macOS SystemAudioDump)
// Kept here for backwards compatibility; also lives in capture.js
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process');

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        logger.info('Checking for existing SystemAudioDump processes...');
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], { stdio: 'ignore' });

        killProc.on('close', code => {
            logger.info(code === 0 ? 'Killed existing SystemAudioDump processes' : 'No existing SystemAudioDump processes found');
            resolve();
        });

        killProc.on('error', err => {
            logger.info('Error checking for existing processes (normal):', err.message);
            resolve();
        });

        setTimeout(() => {
            try {
                killProc.kill();
            } catch (e) {}
            resolve();
        }, 2000);
    });
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }
    return monoBuffer;
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    await killExistingSystemAudioDump();
    logger.info('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../../assets/bin', 'SystemAudioDump');
    }
    logger.info('SystemAudioDump path:', systemAudioPath);

    state.systemAudioProc = spawn(systemAudioPath, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
    });

    if (!state.systemAudioProc.pid) {
        logger.error('Failed to start SystemAudioDump');
        return false;
    }

    logger.info('SystemAudioDump started with PID:', state.systemAudioProc.pid);

    const CHUNK_DURATION = 0.05;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;
    let audioBuffer = Buffer.alloc(0);

    state.systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);
            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

            if (state.providerMode === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (state.providerMode === 'local') {
                getLocalAi().processLocalAudio(monoChunk);
            } else if (shouldUseGeminiRealtimeTranscription()) {
                sendAudioToGemini(monoChunk.toString('base64'), geminiSessionRef);
            } else {
                getLocalAi().processLocalAudio(monoChunk);
            }

            if (process.env.DEBUG_AUDIO) {
                logger.info(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    state.systemAudioProc.stderr.on('data', data => {
        logger.error('SystemAudioDump stderr:', data.toString());
    });

    state.systemAudioProc.on('close', code => {
        logger.info('SystemAudioDump process closed with code:', code);
        state.systemAudioProc = null;
    });

    state.systemAudioProc.on('error', err => {
        logger.error('SystemAudioDump process error:', err);
        state.systemAudioProc = null;
    });

    return true;
}

function stopMacOSAudioCapture() {
    if (state.systemAudioProc) {
        logger.info('Stopping SystemAudioDump...');
        state.systemAudioProc.kill('SIGTERM');
        state.systemAudioProc = null;
    }
}

// Helper for visual audio activity
let waveIndex = 0;
const waveChars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '▆', '▅', '▄', '▃', '▂'];

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    if (!geminiSessionRef.current) return;
    try {
        // Minimal terminal output by default; enable wave only if explicitly requested.
        if (process.env.SHOW_AUDIO_WAVE === '1' && !state.isAiStreaming && !state.isUserStreaming) {
            const char = waveChars[waveIndex % waveChars.length];
            process.stdout.write(`\r\x1b[K\x1b[33m${char} [STREAMING AUDIO]\x1b[0m`);
            waveIndex++;
        }

        await geminiSessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=24000' },
        });
    } catch (error) {
        logger.error('Error sending audio to Gemini:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Image (screenshot) analysis
// ─────────────────────────────────────────────────────────────────────────────

async function sendImageToGeminiHttp(base64Data, prompt) {
    const model = getAvailableModel();
    const apiKey = getApiKey();
    if (!apiKey) return { success: false, error: 'No API key configured' };

    let spinner;
    try {
        const ai = new GoogleGenAI({ apiKey });
        const contents = [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: prompt }];

        spinner = createSpinner(`Sending image to ${model} (streaming)...`).start();
        const response = await ai.models.generateContentStream({ model, contents });
        spinner.succeed(`Connected to ${model} stream`);

        incrementLimitCount(model);

        let fullText = '';
        let isFirst = true;
        for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                isFirst = false;
            }
        }

        logger.info(`Image response completed from ${model}`);
        saveScreenAnalysis(prompt, fullText, model);
        return { success: true, text: fullText, model };
    } catch (error) {
        if (spinner) spinner.fail(`Failed to send image to ${model}`);
        logger.error('Error sending image to Gemini HTTP:', error.message || error);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handler setup — Fix #8: all inputs validated
// ─────────────────────────────────────────────────────────────────────────────

function isString(val, allowEmpty = false) {
    if (typeof val !== 'string') return false;
    return allowEmpty ? true : val.trim().length > 0;
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-cloud', async (event, token, profile, userContext) => {
        if (!isString(token)) return { success: false, error: 'Invalid token' };
        try {
            state.providerMode = 'cloud';
            initializeNewSession(profile);
            setOnTurnComplete((transcription, response) => {
                saveConversationTurn(transcription, response);
            });
            sendToRenderer('session-initializing', true);
            await connectCloud(token, profile, userContext);
            sendToRenderer('session-initializing', false);
            return true;
        } catch (err) {
            logger.error('[Cloud] Init error:', err);
            state.providerMode = 'byok';
            sendToRenderer('session-initializing', false);
            return false;
        }
    });

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        if (!isString(apiKey)) return false;
        state.providerMode = 'byok';
        try {
            const session = await initializeGeminiSession(apiKey, customPrompt || '', profile, language);
            if (session) {
                geminiSessionRef.current = session;
                return true;
            }
        } catch (error) {
            logger.error('initialize-gemini error:', error);
        }
        return false;
    });

    ipcMain.handle('update-active-profile', async (event, profile, customPrompt) => {
        try {
            if (!isString(profile)) return { success: false, error: 'Invalid profile' };
            state.profile = profile;
            state.customPrompt = customPrompt || '';
            state.systemPrompt = getSystemPrompt(profile, state.customPrompt);
            logger.info('Active profile updated to:', profile);
            return { success: true };
        } catch (error) {
            logger.error('Error updating active profile:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('initialize-local', async (event, ollamaHost, ollamaModel, whisperModel, profile, customPrompt) => {
        state.providerMode = 'local';
        try {
            const success = await getLocalAi().initializeLocalSession(ollamaHost, ollamaModel, whisperModel, profile, customPrompt);
            if (!success) state.providerMode = 'byok';
            return success;
        } catch (error) {
            logger.error('initialize-local error:', error);
            state.providerMode = 'byok';
            return false;
        }
    });

    ipcMain.handle('send-audio-content', async (event, payload) => {
        if (!payload || typeof payload !== 'object' || !isString(payload.data)) {
            return { success: false, error: 'Invalid audio payload' };
        }
        const { data, mimeType } = payload;

        try {
            if (state.providerMode === 'cloud') {
                sendCloudAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (state.providerMode === 'local') {
                getLocalAi().processLocalAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (shouldUseGeminiRealtimeTranscription() && geminiSessionRef.current) {
                await geminiSessionRef.current.sendRealtimeInput({ audio: { data, mimeType } });
                return { success: true };
            }
            if (state.providerMode === 'byok') {
                getLocalAi().processLocalAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

            if (process.env.SHOW_AUDIO_WAVE === '1' && !state.isAiStreaming) {
                const char = waveChars[waveIndex % waveChars.length];
                process.stdout.write(`\r\x1b[K\x1b[33m${char} [STREAMING AUDIO]\x1b[0m`);
                waveIndex++;
            }

            await geminiSessionRef.current.sendRealtimeInput({ audio: { data, mimeType } });
            return { success: true };
        } catch (error) {
            logger.error('Error sending system audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-mic-audio-content', async (event, payload) => {
        if (!payload || typeof payload !== 'object' || !isString(payload.data)) {
            return { success: false, error: 'Invalid mic audio payload' };
        }
        const { data, mimeType } = payload;

        try {
            if (state.providerMode === 'cloud') {
                sendCloudAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (state.providerMode === 'local') {
                getLocalAi().processLocalAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (shouldUseGeminiRealtimeTranscription() && geminiSessionRef.current) {
                await geminiSessionRef.current.sendRealtimeInput({ audio: { data, mimeType } });
                return { success: true };
            }
            if (state.providerMode === 'byok') {
                getLocalAi().processLocalAudio(Buffer.from(data, 'base64'));
                return { success: true };
            }
            if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

            if (process.env.SHOW_AUDIO_WAVE === '1' && !state.isAiStreaming) {
                const char = waveChars[waveIndex % waveChars.length];
                process.stdout.write(`\r\x1b[K\x1b[33m${char} [STREAMING MIC]\x1b[0m`);
                waveIndex++;
            }

            await geminiSessionRef.current.sendRealtimeInput({ audio: { data, mimeType } });
            return { success: true };
        } catch (error) {
            logger.error('Error sending mic audio:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, payload) => {
        if (!payload || typeof payload !== 'object' || !isString(payload.data)) {
            return { success: false, error: 'Invalid image payload' };
        }
        const { data, prompt } = payload;

        try {
            const buffer = Buffer.from(data, 'base64');
            if (buffer.length < 1000) {
                return { success: false, error: 'Image buffer too small' };
            }

            if (process.env.SHOW_IMAGE_PINGS === '1') process.stdout.write('!');

            if (state.providerMode === 'cloud') {
                const sent = sendCloudImage(data);
                return sent ? { success: true, model: 'cloud' } : { success: false, error: 'Cloud connection not active' };
            }

            if (state.providerMode === 'local') {
                return await getLocalAi().sendLocalImage(data, prompt);
            }

            return await sendImageToGeminiHttp(data, prompt);
        } catch (error) {
            logger.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!isString(text)) {
            return { success: false, error: 'Invalid text message' };
        }
        const cleanText = text.trim();

        try {
            if (state.providerMode === 'cloud') {
                sendCloudText(cleanText);
                return { success: true };
            }
            if (state.providerMode === 'local') {
                return await getLocalAi().sendLocalText(cleanText);
            }

            if (hasGroqKey()) {
                await sendToGroq(cleanText);
            } else {
                await sendToGemma(cleanText);
            }

            if (geminiSessionRef.current) {
                await geminiSessionRef.current.sendRealtimeInput({ text: cleanText });
            }
            return { success: true };
        } catch (error) {
            logger.error('Error sending text message:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('generate-summary', async () => {
        try {
            const summary = await generateSessionSummary();
            return { success: true, summary };
        } catch (error) {
            logger.error('Error in generate-summary handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async () => {
        if (process.platform !== 'darwin') {
            return { success: false, error: 'macOS audio capture only available on macOS' };
        }
        try {
            const success = await startMacOSAudioCapture(geminiSessionRef);
            return { success };
        } catch (error) {
            logger.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async () => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            logger.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async () => {
        try {
            stopMacOSAudioCapture();

            if (state.providerMode === 'cloud') {
                closeCloud();
                state.providerMode = 'byok';
                return { success: true };
            }

            if (state.providerMode === 'local') {
                getLocalAi().closeLocalSession();
                state.providerMode = 'byok';
                return { success: true };
            }

            state.isUserClosing = true;
            state.sessionParams = null;

            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            }

            return { success: true };
        } catch (error) {
            logger.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-current-session', async () => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            logger.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async () => {
        try {
            initializeNewSession();
            return { success: true, sessionId: state.sessionId };
        } catch (error) {
            logger.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            logger.info('Google Search setting updated to:', enabled);
            return { success: true };
        } catch (error) {
            logger.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    initializeGeminiSession,
    getEnabledTools,
    sendToRenderer,
    handleLocalTranscription,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
    failoverToGeminiTranscription,
    failoverToWhisperTranscription,
    state,
};
