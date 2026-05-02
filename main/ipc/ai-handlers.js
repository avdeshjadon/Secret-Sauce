const { ipcMain, BrowserWindow } = require('electron');
const ai = require('../services/ai/orchestrator');

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function setupAiIpcHandlers() {
    ipcMain.handle('initialize-cloud', async (e, token, profile, context) => {
        return await ai.initializeSession('cloud', { profile, customPrompt: context });
    });

    ipcMain.handle('initialize-gemini', async (e, apiKey, customPrompt, profile, language) => {
        return await ai.initializeSession('byok', { profile, customPrompt, language });
    });

    ipcMain.handle('send-image-content', async (e, { data, prompt }) => {
        return await ai.processImage(data, prompt);
    });

    ipcMain.handle('fetch-openrouter-models', async (e, apiKey) => {
        const { fetchModels } = require('../services/ai/providers/openrouter');
        try {
            const models = await fetchModels(apiKey);
            return { success: true, data: models };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-capture', (e, interval, quality) => {
        ai.startCapture(
            interval, 
            quality, 
            (text) => sendToRenderer('new-transcription', text),
            (status) => sendToRenderer('update-status', status)
        );
        return { success: true };
    });

    ipcMain.handle('stop-capture', () => {
        ai.stopCapture();
        return { success: true };
    });

    ipcMain.handle('close-session', () => {
        ai.stopCapture();
        // Additional cleanup...
        return { success: true };
    });
}

module.exports = { setupAiIpcHandlers };
