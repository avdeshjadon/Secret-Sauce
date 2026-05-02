let currentSessionId = null;
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;

function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    conversationHistory = [];
    screenAnalysisHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    return currentSessionId;
}

function saveTurn(transcription, aiResponse) {
    conversationHistory.push({ transcription, aiResponse, timestamp: Date.now() });
}

function saveScreenAnalysis(prompt, aiResponse, model) {
    screenAnalysisHistory.push({ prompt, aiResponse, model, timestamp: Date.now() });
}

function getSessionState() {
    return {
        sessionId: currentSessionId,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
        conversationHistory,
        screenAnalysisHistory,
    };
}

module.exports = {
    initializeNewSession,
    saveTurn,
    saveScreenAnalysis,
    getSessionState,
};
