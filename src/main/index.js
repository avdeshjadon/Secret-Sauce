/**
 * index.js — FIXED
 *
 * Fix #8 (Code Quality): All IPC handlers now validate and sanitize
 * their input parameters before passing them to storage or AI functions.
 * This prevents crashes and injection from malformed renderer messages.
 *
 * Fix #1 side effect: Since contextIsolation is now true, the renderer
 * can no longer call ipcRenderer directly with arbitrary channels.
 * The preload.js whitelist is the security gate; this file adds a second
 * layer of validation on all data payloads.
 */

if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./ai/gemini');
const storage = require('./storage');
const { logger } = require('./utils/logger');

const geminiSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    return mainWindow;
}

app.whenReady().then(async () => {
    storage.initializeStorage();

    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isString — returns true only for non-empty strings (or empty strings if
 * allowEmpty is true).
 */
function isString(val, allowEmpty = false) {
    if (typeof val !== 'string') return false;
    return allowEmpty ? true : val.trim().length > 0;
}

/**
 * isPlainObject — returns true for {} style objects (not arrays, not null).
 */
function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * sanitizeString — trims and strips null bytes to prevent log injection.
 */
function sanitizeString(val) {
    return String(val).replace(/\0/g, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage IPC handlers — all with input validation
// ─────────────────────────────────────────────────────────────────────────────

function setupStorageIpcHandlers() {
    // ── CONFIG ──────────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            logger.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        // Fix #8: validate input
        if (!isPlainObject(config)) {
            return { success: false, error: 'Invalid config: must be an object' };
        }
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            logger.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        if (!isString(key)) {
            return { success: false, error: 'Invalid key: must be a non-empty string' };
        }
        try {
            storage.updateConfig(sanitizeString(key), value);
            return { success: true };
        } catch (error) {
            logger.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ── CREDENTIALS ─────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-credentials', async () => {
        try {
            return { success: true, data: storage.getCredentials() };
        } catch (error) {
            logger.error('Error getting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        if (!isPlainObject(credentials)) {
            return { success: false, error: 'Invalid credentials: must be an object' };
        }
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            logger.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-api-key', async () => {
        try {
            return { success: true, data: storage.getApiKey() };
        } catch (error) {
            logger.error('Error getting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-api-key', async (event, apiKey) => {
        // API keys must be non-empty strings
        if (!isString(apiKey)) {
            return { success: false, error: 'Invalid API key: must be a non-empty string' };
        }
        try {
            storage.setApiKey(sanitizeString(apiKey));
            return { success: true };
        } catch (error) {
            logger.error('Error setting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            logger.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, groqApiKey) => {
        if (!isString(groqApiKey)) {
            return { success: false, error: 'Invalid Groq API key: must be a non-empty string' };
        }
        try {
            storage.setGroqApiKey(sanitizeString(groqApiKey));
            return { success: true };
        } catch (error) {
            logger.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ── PREFERENCES ─────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            logger.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        if (!isPlainObject(preferences)) {
            return { success: false, error: 'Invalid preferences: must be an object' };
        }
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            logger.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        if (!isString(key)) {
            return { success: false, error: 'Invalid preference key' };
        }
        try {
            storage.updatePreference(sanitizeString(key), value);
            return { success: true };
        } catch (error) {
            logger.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ── KEYBINDS ────────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            logger.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        // keybinds can be null (reset to defaults) or an object
        if (keybinds !== null && !isPlainObject(keybinds)) {
            return { success: false, error: 'Invalid keybinds: must be an object or null' };
        }
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            logger.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ── HISTORY ─────────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-all-sessions', async () => {
        try {
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            logger.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        if (!isString(sessionId)) {
            return { success: false, error: 'Invalid sessionId' };
        }
        try {
            return { success: true, data: storage.getSession(sanitizeString(sessionId)) };
        } catch (error) {
            logger.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        if (!isString(sessionId) || !isPlainObject(data)) {
            return { success: false, error: 'Invalid sessionId or data' };
        }
        try {
            storage.saveSession(sanitizeString(sessionId), data);
            return { success: true };
        } catch (error) {
            logger.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        if (!isString(sessionId)) {
            return { success: false, error: 'Invalid sessionId' };
        }
        try {
            storage.deleteSession(sanitizeString(sessionId));
            return { success: true };
        } catch (error) {
            logger.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            logger.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ── LIMITS ──────────────────────────────────────────────────────────────

    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            logger.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    // ── CLEAR ALL ───────────────────────────────────────────────────────────

    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            logger.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// General IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

function setupGeneralIpcHandlers() {
    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async () => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            logger.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        // Fix #8: validate URL before opening
        if (!isString(url)) {
            return { success: false, error: 'Invalid URL' };
        }
        const sanitizedUrl = sanitizeString(url);
        // Only allow http/https URLs — block file:// and other protocols
        if (!/^https?:\/\//i.test(sanitizedUrl)) {
            logger.warn('Blocked open-external for non-http URL:', sanitizedUrl);
            return { success: false, error: 'Only http/https URLs are allowed' };
        }
        try {
            await shell.openExternal(sanitizedUrl);
            return { success: true };
        } catch (error) {
            logger.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        // Fix #8: only accept object or null
        if (newKeybinds !== null && !isPlainObject(newKeybinds)) {
            logger.warn('Blocked update-keybinds: invalid payload type');
            return;
        }
        if (mainWindow) {
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        if (isString(msg, true)) {
            logger.info('[Renderer]', sanitizeString(msg));
        }
    });
}