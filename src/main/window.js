/**
 * window.js — FIXED
 *
 * Fix #1 (Critical): contextIsolation: true, nodeIntegration: false
 * The renderer no longer has any Node.js access. All IPC now goes through
 * the contextBridge defined in preload.js.
 */

const { BrowserWindow, globalShortcut, ipcMain, screen, desktopCapturer } = require('electron');
const { logger } = require('./utils/logger');
const path = require('node:path');
const storage = require('./storage');

let mouseEventsIgnored = false;

const DEFAULT_MAIN_WINDOW_SIZE = { width: 1100, height: 800 };
const MIN_WINDOW_SIZE = { width: 700, height: 320 };

function createWindow(sendToRenderer, geminiSessionRef) {
    let windowWidth = DEFAULT_MAIN_WINDOW_SIZE.width;
    let windowHeight = DEFAULT_MAIN_WINDOW_SIZE.height;

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: MIN_WINDOW_SIZE.width,
        minHeight: MIN_WINDOW_SIZE.height,
        resizable: true,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        webPreferences: {
            // ─── FIX #1 (CRITICAL) ─────────────────────────────────────────
            // contextIsolation MUST be true so the renderer runs in a separate
            // JS context from Node.js. Combined with nodeIntegration: false,
            // this means renderer code cannot access require(), process, fs, etc.
            // All IPC now goes through the contextBridge in preload.js.
            contextIsolation: true,       // was: false
            nodeIntegration: false,        // was: true
            // ───────────────────────────────────────────────────────────────
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
            visualZoomLevel: 1.0,
        },
        backgroundColor: '#00000000',
    });

    const { session } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer
            .getSources({ types: ['screen'] })
            .then(sources => {
                if (sources.length > 0) {
                    logger.info('Auto-selecting screen source:', sources[0].name);
                    callback({ video: sources[0], audio: 'loopback' });
                } else {
                    logger.error('No screen sources found for display media handler');
                    callback({});
                }
            })
            .catch(err => {
                logger.error('Error getting screen sources:', err);
                callback({});
            });
    });

    // IPC handler for renderer to get screen sources (desktopCapturer is main-process only)
    ipcMain.handle('get-desktop-sources', async () => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1, height: 1 },
            });
            return {
                success: true,
                sources: sources.map(s => ({ id: s.id, name: s.name })),
            };
        } catch (error) {
            logger.error('Error getting desktop sources:', error);
            return { success: false, error: error.message };
        }
    });

    mainWindow.setContentProtection(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Hide from Windows taskbar
    if (process.platform === 'win32') {
        try {
            mainWindow.setSkipTaskbar(true);
        } catch (error) {
            logger.warn('Could not hide from taskbar:', error.message);
        }
    }

    // Hide from Mission Control on macOS
    if (process.platform === 'darwin') {
        try {
            mainWindow.setHiddenInMissionControl(true);
        } catch (error) {
            logger.warn('Could not hide from Mission Control:', error.message);
        }
    }

    if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // After window is created, initialize keybinds
    const savedKeybinds = storage.getKeybinds();
    if (savedKeybinds) {
        setupGlobalShortcuts(savedKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
    } else {
        setupDefaultShortcuts(mainWindow, sendToRenderer, geminiSessionRef);
    }

    mainWindow.on('moved', () => {
        const bounds = mainWindow.getBounds();
        sendToRenderer('window-moved', bounds);
    });

    return mainWindow;
}

function setupDefaultShortcuts(mainWindow, sendToRenderer, geminiSessionRef) {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? 'Command' : 'Control';

    // Toggle click-through / mouse-ignore mode
    globalShortcut.register(`${modifier}+M`, () => {
        mouseEventsIgnored = !mouseEventsIgnored;
        mainWindow.setIgnoreMouseEvents(mouseEventsIgnored, { forward: true });
        sendToRenderer('shortcut-triggered', { action: 'toggle-click-through', value: mouseEventsIgnored });
    });

    // Move window left
    globalShortcut.register(`${modifier}+Left`, () => {
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, x: Math.max(0, bounds.x - 50) });
    });

    // Move window right
    globalShortcut.register(`${modifier}+Right`, () => {
        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, x: Math.min(screenWidth - bounds.width, bounds.x + 50) });
    });

    // Move window up
    globalShortcut.register(`${modifier}+Up`, () => {
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, y: Math.max(0, bounds.y - 50) });
    });

    // Move window down
    globalShortcut.register(`${modifier}+Down`, () => {
        const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, y: Math.min(screenHeight - bounds.height, bounds.y + 50) });
    });
}

function setupGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    globalShortcut.unregisterAll();

    if (!keybinds) {
        setupDefaultShortcuts(mainWindow, sendToRenderer, geminiSessionRef);
        return;
    }

    try {
        if (keybinds.clickThrough) {
            globalShortcut.register(keybinds.clickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                mainWindow.setIgnoreMouseEvents(mouseEventsIgnored, { forward: true });
                sendToRenderer('shortcut-triggered', { action: 'toggle-click-through', value: mouseEventsIgnored });
            });
        }

        if (keybinds.moveLeft) {
            globalShortcut.register(keybinds.moveLeft, () => {
                const bounds = mainWindow.getBounds();
                mainWindow.setBounds({ ...bounds, x: Math.max(0, bounds.x - 50) });
            });
        }

        if (keybinds.moveRight) {
            globalShortcut.register(keybinds.moveRight, () => {
                const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
                const bounds = mainWindow.getBounds();
                mainWindow.setBounds({ ...bounds, x: Math.min(screenWidth - bounds.width, bounds.x + 50) });
            });
        }

        if (keybinds.moveUp) {
            globalShortcut.register(keybinds.moveUp, () => {
                const bounds = mainWindow.getBounds();
                mainWindow.setBounds({ ...bounds, y: Math.max(0, bounds.y - 50) });
            });
        }

        if (keybinds.moveDown) {
            globalShortcut.register(keybinds.moveDown, () => {
                const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
                const bounds = mainWindow.getBounds();
                mainWindow.setBounds({ ...bounds, y: Math.min(screenHeight - bounds.height, bounds.y + 50) });
            });
        }
    } catch (error) {
        logger.error('Error registering global shortcuts:', error);
        // Fall back to defaults if custom keybinds fail
        setupDefaultShortcuts(mainWindow, sendToRenderer, geminiSessionRef);
    }
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    setupGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
}

module.exports = { createWindow, updateGlobalShortcuts };