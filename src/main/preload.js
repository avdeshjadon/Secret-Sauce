/**
 * preload.js — FIXED
 *
 * Fix #1 (Critical): contextIsolation is now true in window.js.
 * This file is now the ONLY bridge between renderer and main process.
 * All IPC must go through contextBridge — renderer has zero Node access.
 *
 * Every channel exposed here maps 1-to-1 with a handler in index.js or gemini.js.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─────────────────────────────────────────────
// Whitelist of valid IPC channels
// ─────────────────────────────────────────────
const VALID_INVOKE_CHANNELS = new Set([
    // Gemini / AI
    'initialize-gemini',
    'initialize-cloud',
    'initialize-local',
    'close-session',
    'send-audio-content',
    'send-mic-audio-content',
    'send-image-content',
    'send-text-message',
    'generate-summary',
    'start-macos-audio',
    'stop-macos-audio',
    'get-current-session',
    'start-new-session',
    'get-desktop-sources',
    'download-whisper-model',
    'check-whisper-model-exists',
    'delete-whisper-model',
    'update-active-profile',

    // Storage — Config
    'storage:get-config',
    'storage:set-config',
    'storage:update-config',

    // Storage — Credentials
    'storage:get-credentials',
    'storage:set-credentials',
    'storage:get-api-key',
    'storage:set-api-key',
    'storage:get-groq-api-key',
    'storage:set-groq-api-key',

    // Storage — Preferences
    'storage:get-preferences',
    'storage:set-preferences',
    'storage:update-preference',

    // Storage — Keybinds
    'storage:get-keybinds',
    'storage:set-keybinds',

    // Storage — History
    'storage:get-all-sessions',
    'storage:get-session',
    'storage:save-session',
    'storage:delete-session',
    'storage:delete-all-sessions',

    // Storage — Limits
    'storage:get-today-limits',

    // Storage — Clear
    'storage:clear-all',

    // General
    'get-app-version',
    'quit-application',
    'open-external',
    'toggle-window-visibility',
    'window-minimize',
]);

const VALID_SEND_CHANNELS = new Set([
    'update-keybinds',
    'log-message',
]);

const VALID_ON_CHANNELS = new Set([
    'update-status',
    'new-response',
    'update-response',
    'session-initializing',
    'session-summary',
    'reconnect-failed',
    'save-conversation-turn',
    'save-screen-analysis',
    'save-session-context',
    'window-moved',
    'shortcut-triggered',
    'whisper-download-progress',
    // Global shortcut events forwarded from main process
    'trigger-next-step',
    'navigate-previous-response',
    'navigate-next-response',
    'scroll-response-up',
    'scroll-response-down',
]);

// ─────────────────────────────────────────────
// Expose safe API to renderer
// ─────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * invoke(channel, ...args) — request/response IPC
     * Only whitelisted channels are allowed through.
     */
    invoke: (channel, ...args) => {
        if (!VALID_INVOKE_CHANNELS.has(channel)) {
            throw new Error(`[preload] Blocked invoke on unknown channel: "${channel}"`);
        }
        return ipcRenderer.invoke(channel, ...args);
    },

    /**
     * send(channel, data) — fire-and-forget IPC
     */
    send: (channel, data) => {
        if (!VALID_SEND_CHANNELS.has(channel)) {
            throw new Error(`[preload] Blocked send on unknown channel: "${channel}"`);
        }
        ipcRenderer.send(channel, data);
    },

    /**
     * on(channel, callback) — listen to events from main process
     * Returns an unsubscribe function so listeners can be cleaned up.
     */
    on: (channel, callback) => {
        if (!VALID_ON_CHANNELS.has(channel)) {
            throw new Error(`[preload] Blocked listener on unknown channel: "${channel}"`);
        }
        const handler = (event, ...args) => callback(...args);
        ipcRenderer.on(channel, handler);
        // Return cleanup function
        return () => ipcRenderer.removeListener(channel, handler);
    },

    /**
     * once(channel, callback) — one-time listener
     */
    once: (channel, callback) => {
        if (!VALID_ON_CHANNELS.has(channel)) {
            throw new Error(`[preload] Blocked once listener on unknown channel: "${channel}"`);
        }
        ipcRenderer.once(channel, (event, ...args) => callback(...args));
    },

    /**
     * removeAllListeners(channel) — cleanup helper
     */
    removeAllListeners: (channel) => {
        if (!VALID_ON_CHANNELS.has(channel)) return;
        ipcRenderer.removeAllListeners(channel);
    },
});