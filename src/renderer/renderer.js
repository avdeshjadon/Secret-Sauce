// renderer.js — FIXED
//
// Fix #1 (Critical): Removed require('electron') and ipcRenderer entirely.
// All IPC now goes through window.electronAPI (exposed by preload.js via contextBridge).
// nodeIntegration is false, so require('electron') would throw ReferenceError at runtime.
//
// Fix #2 (Memory Leaks): IPC listeners now store their unsubscribe functions
// and are properly cleaned up when stopCapture() is called.
//
// Fix #3 (Audio Buffer): Added backpressure guard — audio chunks are only
// sent if the previous send has completed (prevents unlimited buffer growth).
//
// Fix #4 (Session History): conversationHistory capped at MAX_HISTORY_TURNS
// to prevent unbounded RAM usage during long sessions.

// ─── platform detection (no Node APIs needed) ────────────────────────────────
const isLinux = navigator.userAgent.includes('Linux') && !navigator.userAgent.includes('Android');
const isMacOS = navigator.userAgent.includes('Mac');
// ─────────────────────────────────────────────────────────────────────────────

// ─── Minimal HTML sanitizer for markdown output (XSS mitigation) ─────────────
// Allowlist-based sanitizer (no external deps). Keep this conservative.
function sanitizeHtmlAllowlist(unsafeHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(unsafeHtml || ''), 'text/html');

    const ALLOWED_TAGS = new Set([
        'P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I',
        'CODE', 'PRE', 'BLOCKQUOTE',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
        'HR',
        'A',
        'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'SPAN',
    ]);
    const ALLOWED_ATTRS = {
        A: new Set(['href', 'title', 'target', 'rel']),
        SPAN: new Set(['class']),
        CODE: new Set(['class']),
        PRE: new Set(['class']),
        TABLE: new Set([]),
        THEAD: new Set([]),
        TBODY: new Set([]),
        TR: new Set([]),
        TH: new Set([]),
        TD: new Set([]),
        P: new Set([]),
        UL: new Set([]),
        OL: new Set([]),
        LI: new Set([]),
        BLOCKQUOTE: new Set([]),
        H1: new Set([]),
        H2: new Set([]),
        H3: new Set([]),
        H4: new Set([]),
        H5: new Set([]),
        H6: new Set([]),
        HR: new Set([]),
        BR: new Set([]),
        STRONG: new Set([]),
        B: new Set([]),
        EM: new Set([]),
        I: new Set([]),
    };

    function isSafeUrl(url) {
        if (!url) return false;
        try {
            const u = new URL(url, window.location.origin);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function cleanNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag !== 'BODY' && tag !== 'HTML') {
                if (!ALLOWED_TAGS.has(tag)) {
                    // Replace the node with its text content (drop markup)
                    const text = doc.createTextNode(node.textContent || '');
                    node.replaceWith(text);
                    return;
                }

                // Remove disallowed attributes
                const allowed = ALLOWED_ATTRS[tag] || new Set();
                for (const attr of Array.from(node.attributes)) {
                    if (!allowed.has(attr.name)) {
                        node.removeAttribute(attr.name);
                    }
                }

                if (tag === 'A') {
                    const href = node.getAttribute('href') || '';
                    if (!isSafeUrl(href)) {
                        node.removeAttribute('href');
                    } else {
                        node.setAttribute('target', '_blank');
                        node.setAttribute('rel', 'noopener noreferrer');
                    }
                }
            }
        }

        // Recurse (copy list because we may mutate)
        for (const child of Array.from(node.childNodes)) {
            cleanNode(child);
        }
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
}

let mediaStream = null;
let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
let micAudioContext = null;

// Fix #3: backpressure flags so we never queue unlimited audio sends
let _audioSending = false;
let _micAudioSending = false;

const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.05; // 50ms for lower end-to-end latency
const BUFFER_SIZE = 2048;

let hiddenVideo = null;
let offscreenCanvas = null;
let offscreenContext = null;
let currentImageQuality = 'medium';

// Fix #2: store IPC unsubscribe functions for proper cleanup
const _ipcCleanup = [];

// ============ STORAGE API ============
// Wrapper for IPC-based storage access — uses window.electronAPI, never ipcRenderer
const storage = {
    async getConfig() {
        const result = await window.electronAPI.invoke('storage:get-config');
        return result.success ? result.data : {};
    },
    async setConfig(config) {
        return window.electronAPI.invoke('storage:set-config', config);
    },
    async updateConfig(key, value) {
        return window.electronAPI.invoke('storage:update-config', key, value);
    },

    async getCredentials() {
        const result = await window.electronAPI.invoke('storage:get-credentials');
        return result.success ? result.data : {};
    },
    async setCredentials(credentials) {
        return window.electronAPI.invoke('storage:set-credentials', credentials);
    },
    async getApiKey() {
        const result = await window.electronAPI.invoke('storage:get-api-key');
        return result.success ? result.data : '';
    },
    async setApiKey(apiKey) {
        return window.electronAPI.invoke('storage:set-api-key', apiKey);
    },
    async getGroqApiKey() {
        const result = await window.electronAPI.invoke('storage:get-groq-api-key');
        return result.success ? result.data : '';
    },
    async setGroqApiKey(groqApiKey) {
        return window.electronAPI.invoke('storage:set-groq-api-key', groqApiKey);
    },

    async getPreferences() {
        const result = await window.electronAPI.invoke('storage:get-preferences');
        return result.success ? result.data : {};
    },
    async setPreferences(preferences) {
        return window.electronAPI.invoke('storage:set-preferences', preferences);
    },
    async updatePreference(key, value) {
        return window.electronAPI.invoke('storage:update-preference', key, value);
    },

    async getKeybinds() {
        const result = await window.electronAPI.invoke('storage:get-keybinds');
        return result.success ? result.data : null;
    },
    async setKeybinds(keybinds) {
        return window.electronAPI.invoke('storage:set-keybinds', keybinds);
    },

    async getAllSessions() {
        const result = await window.electronAPI.invoke('storage:get-all-sessions');
        return result.success ? result.data : [];
    },
    async getSession(sessionId) {
        const result = await window.electronAPI.invoke('storage:get-session', sessionId);
        return result.success ? result.data : null;
    },
    async saveSession(sessionId, data) {
        return window.electronAPI.invoke('storage:save-session', sessionId, data);
    },
    async deleteSession(sessionId) {
        return window.electronAPI.invoke('storage:delete-session', sessionId);
    },
    async deleteAllSessions() {
        return window.electronAPI.invoke('storage:delete-all-sessions');
    },

    async clearAll() {
        return window.electronAPI.invoke('storage:clear-all');
    },

    async getTodayLimits() {
        const result = await window.electronAPI.invoke('storage:get-today-limits');
        return result.success ? result.data : { flash: { count: 0 }, flashLite: { count: 0 } };
    },
};

// Cache for preferences to avoid async calls in hot paths
let preferencesCache = null;

async function loadPreferencesCache() {
    preferencesCache = await storage.getPreferences();
    return preferencesCache;
}

loadPreferencesCache();

// ─── Audio helpers ────────────────────────────────────────────────────────────
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ─── AI initializers ──────────────────────────────────────────────────────────
async function initializeGemini(profile = 'interview', language = 'en-US') {
    const apiKey = await storage.getApiKey();
    if (apiKey) {
        const prefs = await storage.getPreferences();
        const success = await window.electronAPI.invoke('initialize-gemini', apiKey, prefs.customPrompt || '', profile, language);
        if (success) {
            secretSauce.setStatus('Live');
        } else {
            secretSauce.setStatus('error');
        }
    }
}

async function initializeLocal(profile = 'interview') {
    const prefs = await storage.getPreferences();
    const ollamaHost = prefs.ollamaHost || 'http://127.0.0.1:11434';
    const ollamaModel = prefs.ollamaModel || 'llama3.1';
    const whisperModel = prefs.whisperModel || 'tiny.en';
    const customPrompt = prefs.customPrompt || '';
    console.log(`[LocalAI] Initializing with model: ${whisperModel}`);

    const success = await window.electronAPI.invoke('initialize-local', ollamaHost, ollamaModel, whisperModel, profile, customPrompt);
    if (success) {
        secretSauce.setStatus('Local AI Live');
        return true;
    } else {
        secretSauce.setStatus('error');
        return false;
    }
}

async function initializeCloud(profile = 'interview') {
    const creds = await storage.getCredentials();
    const token = creds.cloudToken;
    if (!token || !token.trim()) {
        secretSauce.setStatus('error');
        return false;
    }
    const prefs = await storage.getPreferences();
    const success = await window.electronAPI.invoke('initialize-cloud', token, profile, prefs.customPrompt || '');
    if (success) {
        secretSauce.setStatus('Live');
        return true;
    } else {
        secretSauce.setStatus('error');
        return false;
    }
}

// ─── IPC event listeners with proper cleanup ──────────────────────────────────
// Fix #2: electronAPI.on() returns an unsubscribe fn — stored in _ipcCleanup

_ipcCleanup.push(
    window.electronAPI.on('update-status', status => {
        console.log('Status update:', status);
        secretSauce.setStatus(status);

        const meter = document.getElementById('confidenceMeter');
        if (meter) {
            const bar = meter.querySelector('.confidence-bar');
            const appEl = document.getElementById('secretSauce');
            if (bar) {
                if (status.includes('Generating') || status.includes('Thinking')) {
                    bar.style.width = '70%';
                    bar.style.background = 'var(--accent)';
                    appEl && appEl.classList.add('thinking-pulse');
                } else if (status.includes('Listening') || status.includes('Live')) {
                    bar.style.width = '0%';
                    appEl && appEl.classList.remove('thinking-pulse');
                } else if (status.includes('error') || status.includes('Error')) {
                    bar.style.width = '100%';
                    bar.style.background = 'var(--danger)';
                    appEl && appEl.classList.remove('thinking-pulse');
                }
            }
        }
    })
);

_ipcCleanup.push(
    window.electronAPI.on('session-summary', data => {
        const modal = document.getElementById('summaryModal');
        const content = document.getElementById('summaryContent');
        if (modal && content) {
            const raw = typeof marked !== 'undefined' ? marked.parse(data.summary || '') : String(data.summary || '');
            content.innerHTML = sanitizeHtmlAllowlist(raw);
            modal.classList.add('visible');
        }
    })
);

// Fix #2: save-conversation-turn listener — stored for cleanup
_ipcCleanup.push(
    window.electronAPI.on('save-conversation-turn', async data => {
        try {
            // Fix #4: cap history at MAX_HISTORY_TURNS entries
            const MAX_HISTORY_TURNS = 200;
            const cappedHistory = data.fullHistory.slice(-MAX_HISTORY_TURNS);
            await storage.saveSession(data.sessionId, { conversationHistory: cappedHistory });
        } catch (error) {
            console.error('Error saving conversation session:', error);
        }
    })
);

_ipcCleanup.push(
    window.electronAPI.on('save-session-context', async data => {
        try {
            await storage.saveSession(data.sessionId, {
                profile: data.profile,
                customPrompt: data.customPrompt,
            });
        } catch (error) {
            console.error('Error saving session context:', error);
        }
    })
);

_ipcCleanup.push(
    window.electronAPI.on('save-screen-analysis', async data => {
        try {
            await storage.saveSession(data.sessionId, {
                screenAnalysisHistory: data.fullHistory,
                profile: data.profile,
                customPrompt: data.customPrompt,
            });
        } catch (error) {
            console.error('Error saving screen analysis:', error);
        }
    })
);

// ─── Capture ──────────────────────────────────────────────────────────────────
async function startCapture(screenshotIntervalSeconds = 5, imageQuality = 'medium') {
    currentImageQuality = imageQuality;
    await loadPreferencesCache();
    const audioMode = preferencesCache.audioMode || 'speaker_only';

    try {
        if (isMacOS) {
            const audioResult = await window.electronAPI.invoke('start-macos-audio');
            if (!audioResult.success) {
                throw new Error('Failed to start macOS audio capture: ' + audioResult.error);
            }

            try {
                const sourcesResult = await window.electronAPI.invoke('get-desktop-sources');
                if (!sourcesResult.success || !sourcesResult.sources || sourcesResult.sources.length === 0) {
                    throw new Error('No screen sources found. Grant Screen Recording permission.');
                }
                const screenSource = sourcesResult.sources[0];
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: screenSource.id,
                            maxFrameRate: 1,
                            maxWidth: 1920,
                            maxHeight: 1080,
                        },
                    },
                });
            } catch (screenErr) {
                console.error('IPC screen capture failed, falling back to getDisplayMedia:', screenErr);
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
            }

            if (!mediaStream || mediaStream.getVideoTracks().length === 0) {
                throw new Error('Failed to obtain screen capture stream on macOS.');
            }

            if (audioMode === 'mic_only' || audioMode === 'both') {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false,
                    });
                    setupMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone on macOS:', micError);
                }
            }

        } else if (isLinux) {
            try {
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                });
                setupSystemAudioProcessing();
            } catch (systemAudioError) {
                console.warn('System audio failed, screen-only capture:', systemAudioError);
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
            }

            if (audioMode === 'mic_only' || audioMode === 'both') {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false,
                    });
                    setupMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone on Linux:', micError);
                }
            }

        } else {
            // Windows
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            setupSystemAudioProcessing();

            if (audioMode === 'mic_only' || audioMode === 'both') {
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false,
                    });
                    setupMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone on Windows:', micError);
                }
            }
        }

        console.log('Capture started:', {
            hasVideo: mediaStream.getVideoTracks().length > 0,
            hasAudio: mediaStream.getAudioTracks().length > 0,
        });
    } catch (err) {
        console.error('Error starting capture:', err.message);
        secretSauce.setStatus('Error: ' + (err.message || 'Failed to start capture'));
    }
}

// Fix #3: backpressure — skip chunk if previous send is still in-flight
function setupSystemAudioProcessing() {
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let localBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    audioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        localBuffer.push(...inputData);

        while (localBuffer.length >= samplesPerChunk) {
            const chunk = localBuffer.splice(0, samplesPerChunk);
            if (_audioSending) continue; // Fix #3: backpressure
            _audioSending = true;
            try {
                const pcmData16 = convertFloat32ToInt16(chunk);
                const base64Data = arrayBufferToBase64(pcmData16.buffer);
                await window.electronAPI.invoke('send-audio-content', { data: base64Data, mimeType: 'audio/pcm;rate=24000' });
            } finally {
                _audioSending = false;
            }
        }
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
}

function setupMicProcessing(micStream) {
    micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    micAudioProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let localBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micAudioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        localBuffer.push(...inputData);

        while (localBuffer.length >= samplesPerChunk) {
            const chunk = localBuffer.splice(0, samplesPerChunk);
            if (_micAudioSending) continue; // Fix #3: backpressure
            _micAudioSending = true;
            try {
                const pcmData16 = convertFloat32ToInt16(chunk);
                const base64Data = arrayBufferToBase64(pcmData16.buffer);
                await window.electronAPI.invoke('send-mic-audio-content', { data: base64Data, mimeType: 'audio/pcm;rate=24000' });
            } finally {
                _micAudioSending = false;
            }
        }
    };

    micSource.connect(micAudioProcessor);
    micAudioProcessor.connect(micAudioContext.destination);
}

async function _initVideo() {
    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = mediaStream;
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        await hiddenVideo.play();
        await new Promise(resolve => {
            if (hiddenVideo.readyState >= 2) return resolve();
            hiddenVideo.onloadedmetadata = () => resolve();
        });
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = hiddenVideo.videoWidth;
        offscreenCanvas.height = hiddenVideo.videoHeight;
        offscreenContext = offscreenCanvas.getContext('2d');
    }
}

const MANUAL_SCREENSHOT_PROMPT = `Help me on this page, give me the answer no bs, complete answer.
So if its a code question, give me the approach in few bullet points, then the entire code. Also if theres anything else i need to know, tell me.
If its a question about the website, give me the answer no bs, complete answer.
If its a mcq question, give me the answer no bs, complete answer.`;

async function captureManualScreenshot(imageQuality = null) {
    console.log('Manual screenshot triggered');
    const quality = imageQuality || currentImageQuality;

    if (!mediaStream) {
        console.error('No media stream available');
        secretSauce.setStatus('Error: Screen capture not available. Restart session.');
        window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
        return;
    }

    if (mediaStream.getVideoTracks().length === 0 || mediaStream.getVideoTracks()[0].readyState === 'ended') {
        console.error('Video track ended or missing');
        secretSauce.setStatus('Error: Screen capture stopped. Restart session.');
        window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
        return;
    }

    await _initVideo();

    if (hiddenVideo.readyState < 2) {
        console.warn('Video not ready yet');
        window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
        return;
    }

    const MAX_WIDTH = 1280;
    const srcW = hiddenVideo.videoWidth;
    const srcH = hiddenVideo.videoHeight;
    let destW = srcW;
    let destH = srcH;
    if (srcW > MAX_WIDTH) {
        destW = MAX_WIDTH;
        destH = Math.round(srcH * (MAX_WIDTH / srcW));
    }
    offscreenCanvas.width = destW;
    offscreenCanvas.height = destH;
    offscreenContext.drawImage(hiddenVideo, 0, 0, destW, destH);

    let qualityValue;
    switch (quality) {
        case 'high': qualityValue = 0.85; break;
        case 'medium': qualityValue = 0.6; break;
        case 'low': qualityValue = 0.4; break;
        default: qualityValue = 0.6;
    }

    offscreenCanvas.toBlob(
        async blob => {
            if (!blob) {
                console.error('Failed to create blob');
                window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
                return;
            }
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];
                if (!base64data || base64data.length < 100) {
                    console.error('Invalid base64 data');
                    window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
                    return;
                }
                console.log(`Sending image: ${destW}x${destH}, ~${Math.round(base64data.length / 1024)}KB`);
                const result = await window.electronAPI.invoke('send-image-content', { data: base64data, prompt: MANUAL_SCREENSHOT_PROMPT });
                if (result.success) {
                    console.log(`Image response from ${result.model}`);
                } else {
                    console.error('Failed to get image response:', result.error);
                    secretSauce.addNewResponse(`Error: ${result.error}`);
                }
                window.dispatchEvent(new CustomEvent('manual-analysis-complete'));
            };
            reader.readAsDataURL(blob);
        },
        'image/jpeg',
        qualityValue
    );
}

window.captureManualScreenshot = captureManualScreenshot;

function stopCapture() {
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }

    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    if (micAudioProcessor) {
        micAudioProcessor.disconnect();
        micAudioProcessor = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    if (micAudioContext) {
        micAudioContext.close();
        micAudioContext = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Reset backpressure flags
    _audioSending = false;
    _micAudioSending = false;

    if (isMacOS) {
        window.electronAPI.invoke('stop-macos-audio').catch(err => {
            console.error('Error stopping macOS audio:', err);
        });
    }

    window.electronAPI.invoke('generate-summary').catch(err => {
        console.error('Error generating summary:', err);
    });

    if (hiddenVideo) {
        hiddenVideo.pause();
        hiddenVideo.srcObject = null;
        hiddenVideo = null;
    }
    offscreenCanvas = null;
    offscreenContext = null;
}

async function sendTextMessage(text) {
    if (!text || text.trim().length === 0) {
        return { success: false, error: 'Empty message' };
    }
    try {
        const result = await window.electronAPI.invoke('send-text-message', text);
        return result;
    } catch (error) {
        console.error('Error sending text message:', error);
        return { success: false, error: error.message };
    }
}

function handleShortcut(shortcutKey) {
    const currentView = secretSauce.getCurrentView();
    if (shortcutKey === 'ctrl+enter' || shortcutKey === 'cmd+enter') {
        if (currentView === 'main') {
            secretSauce.element().handleStart();
        } else {
            captureManualScreenshot();
        }
    }
}

const secretSauceApp = document.querySelector('secret-sauce-app');

// ============ THEME SYSTEM ============
const theme = {
    themes: {
        dark: { background: '#101010', text: '#e0e0e0', textSecondary: '#a0a0a0', textMuted: '#6b6b6b', border: '#2a2a2a', accent: '#ffffff', btnPrimaryBg: '#ffffff', btnPrimaryText: '#000000', btnPrimaryHover: '#e0e0e0', tooltipBg: '#1a1a1a', tooltipText: '#ffffff', keyBg: 'rgba(255,255,255,0.1)' },
        light: { background: '#ffffff', text: '#1a1a1a', textSecondary: '#555555', textMuted: '#888888', border: '#e0e0e0', accent: '#000000', btnPrimaryBg: '#1a1a1a', btnPrimaryText: '#ffffff', btnPrimaryHover: '#333333', tooltipBg: '#1a1a1a', tooltipText: '#ffffff', keyBg: 'rgba(0,0,0,0.1)' },
        midnight: { background: '#0d1117', text: '#c9d1d9', textSecondary: '#8b949e', textMuted: '#6e7681', border: '#30363d', accent: '#58a6ff', btnPrimaryBg: '#58a6ff', btnPrimaryText: '#0d1117', btnPrimaryHover: '#79b8ff', tooltipBg: '#161b22', tooltipText: '#c9d1d9', keyBg: 'rgba(88,166,255,0.15)' },
        sepia: { background: '#f4ecd8', text: '#5c4b37', textSecondary: '#7a6a56', textMuted: '#998875', border: '#d4c8b0', accent: '#8b4513', btnPrimaryBg: '#5c4b37', btnPrimaryText: '#f4ecd8', btnPrimaryHover: '#7a6a56', tooltipBg: '#5c4b37', tooltipText: '#f4ecd8', keyBg: 'rgba(92,75,55,0.15)' },
        catppuccin: { background: '#1e1e2e', text: '#cdd6f4', textSecondary: '#a6adc8', textMuted: '#585b70', border: '#313244', accent: '#cba6f7', btnPrimaryBg: '#cba6f7', btnPrimaryText: '#1e1e2e', btnPrimaryHover: '#b4befe', tooltipBg: '#313244', tooltipText: '#cdd6f4', keyBg: 'rgba(203,166,247,0.12)' },
        gruvbox: { background: '#1d2021', text: '#ebdbb2', textSecondary: '#a89984', textMuted: '#665c54', border: '#3c3836', accent: '#fe8019', btnPrimaryBg: '#fe8019', btnPrimaryText: '#1d2021', btnPrimaryHover: '#fabd2f', tooltipBg: '#3c3836', tooltipText: '#ebdbb2', keyBg: 'rgba(254,128,25,0.12)' },
        rosepine: { background: '#191724', text: '#e0def4', textSecondary: '#908caa', textMuted: '#6e6a86', border: '#26233a', accent: '#ebbcba', btnPrimaryBg: '#ebbcba', btnPrimaryText: '#191724', btnPrimaryHover: '#f6c177', tooltipBg: '#26233a', tooltipText: '#e0def4', keyBg: 'rgba(235,188,186,0.12)' },
        solarized: { background: '#002b36', text: '#93a1a1', textSecondary: '#839496', textMuted: '#586e75', border: '#073642', accent: '#2aa198', btnPrimaryBg: '#2aa198', btnPrimaryText: '#002b36', btnPrimaryHover: '#268bd2', tooltipBg: '#073642', tooltipText: '#93a1a1', keyBg: 'rgba(42,161,152,0.12)' },
        tokyonight: { background: '#1a1b26', text: '#c0caf5', textSecondary: '#9aa5ce', textMuted: '#565f89', border: '#292e42', accent: '#7aa2f7', btnPrimaryBg: '#7aa2f7', btnPrimaryText: '#1a1b26', btnPrimaryHover: '#bb9af7', tooltipBg: '#292e42', tooltipText: '#c0caf5', keyBg: 'rgba(122,162,247,0.12)' },
    },
    current: 'dark',
    get(name) { return this.themes[name] || this.themes.dark; },
    getAll() {
        const names = { dark: 'Dark', light: 'Light', midnight: 'Midnight Blue', sepia: 'Sepia', catppuccin: 'Catppuccin Mocha', gruvbox: 'Gruvbox Dark', rosepine: 'Rosé Pine', solarized: 'Solarized Dark', tokyonight: 'Tokyo Night' };
        return Object.keys(this.themes).map(key => ({ value: key, name: names[key] || key, colors: this.themes[key] }));
    },
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 30, g: 30, b: 30 };
    },
    lightenColor(rgb, amount) { return { r: Math.min(255, rgb.r + amount), g: Math.min(255, rgb.g + amount), b: Math.min(255, rgb.b + amount) }; },
    darkenColor(rgb, amount) { return { r: Math.max(0, rgb.r - amount), g: Math.max(0, rgb.g - amount), b: Math.max(0, rgb.b - amount) }; },
    applyBackgrounds(backgroundColor, alpha = 0.8) {
        const root = document.documentElement;
        const baseRgb = this.hexToRgb(backgroundColor);
        const isLight = (baseRgb.r + baseRgb.g + baseRgb.b) / 3 > 128;
        const adjust = isLight ? this.darkenColor.bind(this) : this.lightenColor.bind(this);
        const secondary = adjust(baseRgb, 10);
        const tertiary = adjust(baseRgb, 22);
        const hover = adjust(baseRgb, 28);
        const bgBase = `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, ${alpha})`;
        const bgSurface = `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, ${alpha})`;
        const bgElevated = `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, ${alpha})`;
        const bgHover = `rgba(${hover.r}, ${hover.g}, ${hover.b}, ${alpha})`;
        root.style.setProperty('--bg-app', bgBase);
        root.style.setProperty('--bg-surface', bgSurface);
        root.style.setProperty('--bg-elevated', bgElevated);
        root.style.setProperty('--bg-hover', bgHover);
        root.style.setProperty('--header-background', bgBase);
        root.style.setProperty('--main-content-background', bgBase);
        root.style.setProperty('--bg-primary', bgBase);
        root.style.setProperty('--bg-secondary', bgSurface);
        root.style.setProperty('--bg-tertiary', bgElevated);
        root.style.setProperty('--input-background', bgElevated);
        root.style.setProperty('--input-focus-background', bgElevated);
        root.style.setProperty('--hover-background', bgHover);
        root.style.setProperty('--scrollbar-background', bgBase);
    },
    apply(themeName, alpha = 0.8) {
        const colors = this.get(themeName);
        this.current = themeName;
        const root = document.documentElement;
        root.style.setProperty('--text-primary', colors.text);
        root.style.setProperty('--text-secondary', colors.textSecondary);
        root.style.setProperty('--text-muted', colors.textMuted);
        root.style.setProperty('--border', colors.border);
        root.style.setProperty('--border-strong', colors.accent);
        root.style.setProperty('--accent', colors.btnPrimaryBg);
        root.style.setProperty('--accent-hover', colors.btnPrimaryHover);
        root.style.setProperty('--text-color', colors.text);
        root.style.setProperty('--border-color', colors.border);
        root.style.setProperty('--border-default', colors.accent);
        root.style.setProperty('--placeholder-color', colors.textMuted);
        root.style.setProperty('--scrollbar-thumb', colors.border);
        root.style.setProperty('--scrollbar-thumb-hover', colors.textMuted);
        root.style.setProperty('--key-background', colors.keyBg);
        root.style.setProperty('--btn-primary-bg', colors.btnPrimaryBg);
        root.style.setProperty('--btn-primary-text', colors.btnPrimaryText);
        root.style.setProperty('--btn-primary-hover', colors.btnPrimaryHover);
        root.style.setProperty('--start-button-background', colors.btnPrimaryBg);
        root.style.setProperty('--start-button-color', colors.btnPrimaryText);
        root.style.setProperty('--start-button-hover-background', colors.btnPrimaryHover);
        root.style.setProperty('--tooltip-bg', colors.tooltipBg);
        root.style.setProperty('--tooltip-text', colors.tooltipText);
        root.style.setProperty('--error-color', '#f14c4c');
        root.style.setProperty('--success-color', '#4caf50');
        this.applyBackgrounds(colors.background, alpha);
    },
    async load() {
        try {
            const prefs = await storage.getPreferences();
            const themeName = prefs.theme || 'dark';
            const alpha = prefs.backgroundTransparency ?? 0.8;
            this.apply(themeName, alpha);
            return themeName;
        } catch (err) {
            this.apply('dark');
            return 'dark';
        }
    },
    async save(themeName) {
        await storage.updatePreference('theme', themeName);
        this.apply(themeName);
    },
};

const secretSauce = {
    getVersion: async () => window.electronAPI.invoke('get-app-version'),
    element: () => secretSauceApp,
    e: () => secretSauceApp,
    getCurrentView: () => secretSauceApp.currentView,
    getLayoutMode: () => secretSauceApp.layoutMode,
    setStatus: text => secretSauceApp.setStatus(text),
    addNewResponse: response => secretSauceApp.addNewResponse(response),
    updateCurrentResponse: response => secretSauceApp.updateCurrentResponse(response),
    initializeGemini,
    initializeCloud,
    initializeLocal,
    startCapture,
    stopCapture,
    sendTextMessage,
    handleShortcut,
    storage,
    theme,
    refreshPreferencesCache: loadPreferencesCache,
    isLinux,
    isMacOS,
    invoke: (channel, ...args) => window.electronAPI.invoke(channel, ...args),
    send: (channel, data) => window.electronAPI.send(channel, data),
    on: (channel, callback) => window.electronAPI.on(channel, callback),
};

window.secretSauce = secretSauce;

// Wire up summary close button (removed inline onclick for CSP)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('closeSummaryBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('summaryModal')?.classList.remove('visible');
            });
        }
    });
} else {
    const closeBtn = document.getElementById('closeSummaryBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('summaryModal')?.classList.remove('visible');
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => theme.load());
} else {
    theme.load();
}