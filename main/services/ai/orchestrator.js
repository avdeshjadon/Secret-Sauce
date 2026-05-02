const { initializeNewSession, saveTurn, saveScreenAnalysis, getSessionState } = require('./session-manager');
const { startAudioCapture, stopAudioCapture } = require('../audio/orchestrator');
const { sendImageToGemini } = require('./providers/gemini');
const { sendImageToOpenRouter } = require('./providers/openrouter');
const { getPreferences, getOpenRouterApiKey, getCredentials } = require('../storage');

let currentProviderMode = 'byok';
let activeSession = null;

async function initializeSession(mode, options = {}) {
    currentProviderMode = mode;
    activeSession = initializeNewSession(options.profile, options.customPrompt);
    
    if (mode === 'cloud') {
        // Cloud logic would go here
    } else {
        const creds = await getCredentials();
        const prefs = await getPreferences();
        
        const hasGemini = creds.apiKey && creds.apiKey.trim().length > 0;
        const hasGroq = creds.groqApiKey && creds.groqApiKey.trim().length > 0;
        const hasOpenRouter = creds.openRouterApiKey && creds.openRouterApiKey.trim().length > 0 && prefs.openRouterModel;
        
        if (!hasGemini && !hasGroq && !hasOpenRouter) {
            throw new Error('No AI provider configured. Please add an API key in settings.');
        }
    }
    
    return { success: true, sessionId: activeSession };
}

async function startCapture(interval, quality, onTranscription, onStatus) {
    return startAudioCapture(onTranscription, onStatus);
}

async function processImage(data, prompt) {
    const prefs = getPreferences();
    const openRouterKey = getOpenRouterApiKey();
    
    let result;
    try {
        if (openRouterKey && prefs.openRouterModel) {
            result = await sendImageToOpenRouter(data, prompt);
        } else {
            const model = 'gemini-2.0-flash-exp'; 
            result = await sendImageToGemini(data, prompt, model);
        }
        
        saveScreenAnalysis(prompt, result.text || 'Error', result.model || 'unknown');
        return result;
    } catch (error) {
        console.error('[Orchestrator] Image processing failed:', error);
        return { success: false, error: error.message };
    }
}

function closeSession() {
    stopAudioCapture();
    activeSession = null;
}

module.exports = {
    initializeSession,
    processImage,
    startCapture,
    stopCapture: stopAudioCapture,
    closeSession,
    currentProviderMode: () => currentProviderMode,
};
