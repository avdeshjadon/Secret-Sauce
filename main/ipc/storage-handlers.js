const { ipcMain } = require('electron');
const storage = require('../services/storage');

function setupStorageIpcHandlers() {
    // Config
    ipcMain.handle('storage:get-config', () => ({ success: true, data: storage.getConfig() }));
    ipcMain.handle('storage:update-config', (e, { key, value }) => ({ success: storage.updateConfig(key, value) }));

    // Credentials
    ipcMain.handle('storage:get-credentials', () => ({ success: true, data: storage.getCredentials() }));
    ipcMain.handle('storage:update-credentials', (e, data) => ({ success: storage.setCredentials(data) }));
    ipcMain.handle('storage:get-api-key', () => ({ success: true, data: storage.getApiKey() }));
    ipcMain.handle('storage:get-groq-api-key', () => ({ success: true, data: storage.getGroqApiKey() }));
    ipcMain.handle('storage:get-openrouter-api-key', () => ({ success: true, data: storage.getOpenRouterApiKey() }));

    // Preferences
    ipcMain.handle('storage:get-preferences', () => ({ success: true, data: storage.getPreferences() }));
    ipcMain.handle('storage:update-preference', (e, { key, value }) => ({ success: storage.updatePreference(key, value) }));

    // History
    ipcMain.handle('storage:get-all-sessions', () => ({ success: true, data: storage.getAllSessions() }));
    ipcMain.handle('storage:get-session', (e, sessionId) => ({ success: true, data: storage.getSession(sessionId) }));
    ipcMain.handle('storage:delete-session', (e, sessionId) => ({ success: storage.deleteSession(sessionId) }));
    ipcMain.handle('storage:delete-all-sessions', () => ({ success: storage.deleteAllSessions() }));

    ipcMain.handle('storage:get-keybinds', () => ({ success: true, data: storage.getKeybinds() }));
    ipcMain.handle('storage:set-keybinds', (e, data) => ({ success: storage.setKeybinds(data) }));

    ipcMain.handle('storage:clear-all-data', () => ({ success: storage.clearAllData() }));
}

module.exports = { setupStorageIpcHandlers };
