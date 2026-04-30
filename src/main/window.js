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
    setupGlobalShortcuts(savedKeybinds, mainWindow, sendToRenderer, geminiSessionRef);

    mainWindow.on('moved', () => {
        const bounds = mainWindow.getBounds();
        sendToRenderer('window-moved', bounds);
    });

    return mainWindow;
}

function setupGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    globalShortcut.unregisterAll();

    const isMac = process.platform === 'darwin';

    if (!keybinds) {
        keybinds = {
            mac_moveUp: 'Option+Up',
            win_moveUp: 'Ctrl+Up',
            mac_moveDown: 'Option+Down',
            win_moveDown: 'Ctrl+Down',
            mac_moveLeft: 'Option+Left',
            win_moveLeft: 'Ctrl+Left',
            mac_moveRight: 'Option+Right',
            win_moveRight: 'Ctrl+Right',
            mac_toggleVisibility: 'Cmd+\\',
            win_toggleVisibility: 'Ctrl+\\',
            mac_toggleClickThrough: 'Cmd+M',
            win_toggleClickThrough: 'Ctrl+M',
            mac_nextStep: 'Cmd+Enter',
            win_nextStep: 'Ctrl+Enter',
            mac_previousResponse: 'Cmd+[',
            win_previousResponse: 'Ctrl+[',
            mac_nextResponse: 'Cmd+]',
            win_nextResponse: 'Ctrl+]',
            mac_scrollUp: 'Cmd+Shift+Up',
            win_scrollUp: 'Ctrl+Shift+Up',
            mac_scrollDown: 'Cmd+Shift+Down',
            win_scrollDown: 'Ctrl+Shift+Down'
        };
    }

    const prefix = isMac ? 'mac_' : 'win_';
    const getBind = (name) => keybinds[prefix + name] || keybinds[name] || null;

    const registerBind = (bind, action) => {
        if (!bind) return;
        try {
            globalShortcut.register(bind, action);
        } catch (err) {
            logger.error(`Failed to register shortcut ${bind}:`, err);
        }
    };

    const toggleClickThrough = getBind('toggleClickThrough') || getBind('clickThrough');
    registerBind(toggleClickThrough, () => {
        mouseEventsIgnored = !mouseEventsIgnored;
        mainWindow.setIgnoreMouseEvents(mouseEventsIgnored, { forward: true });
        sendToRenderer('shortcut-triggered', { action: 'toggle-click-through', value: mouseEventsIgnored });
    });

    registerBind(getBind('moveLeft'), () => {
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, x: Math.max(0, bounds.x - 50) });
    });

    registerBind(getBind('moveRight'), () => {
        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, x: Math.min(screenWidth - bounds.width, bounds.x + 50) });
    });

    registerBind(getBind('moveUp'), () => {
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, y: Math.max(0, bounds.y - 50) });
    });

    registerBind(getBind('moveDown'), () => {
        const { height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const bounds = mainWindow.getBounds();
        mainWindow.setBounds({ ...bounds, y: Math.min(screenHeight - bounds.height, bounds.y + 50) });
    });

    registerBind(getBind('toggleVisibility'), () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
        }
    });

    registerBind(getBind('nextStep'), () => {
        sendToRenderer('trigger-next-step');
    });

    registerBind(getBind('previousResponse'), () => {
        sendToRenderer('navigate-previous-response');
    });

    registerBind(getBind('nextResponse'), () => {
        sendToRenderer('navigate-next-response');
    });

    registerBind(getBind('scrollUp'), () => {
        sendToRenderer('scroll-response-up');
    });

    registerBind(getBind('scrollDown'), () => {
        sendToRenderer('scroll-response-down');
    });
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    setupGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
}

module.exports = { createWindow, updateGlobalShortcuts };