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
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#00000000',
    });

    const { session, desktopCapturer } = require('electron');
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
    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        emergencyErase: isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef) {
    logger.info('Updating global shortcuts with:', keybinds);

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const isMac = process.platform === 'darwin';
    const prefix = isMac ? 'mac_' : 'win_';
    
    // Normalize keybinds for the current platform
    const activeKeybinds = {};
    const actions = [
        'moveUp', 'moveDown', 'moveLeft', 'moveRight', 'toggleVisibility', 
        'toggleClickThrough', 'nextStep', 'previousResponse', 'nextResponse', 
        'scrollUp', 'scrollDown', 'emergencyErase'
    ];
    
    actions.forEach(action => {
        activeKeybinds[action] = keybinds[`${prefix}${action}`] || keybinds[action] || getDefaultKeybinds()[action];
    });

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    Object.keys(movementActions).forEach(action => {
        const keybind = activeKeybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
                logger.info(`Registered ${action}: ${keybind}`);
            } catch (error) {
                logger.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (activeKeybinds.toggleVisibility) {
        try {
            globalShortcut.register(activeKeybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
            logger.info(`Registered toggleVisibility: ${activeKeybinds.toggleVisibility}`);
        } catch (error) {
            logger.error(`Failed to register toggleVisibility (${activeKeybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (activeKeybinds.toggleClickThrough) {
        try {
            globalShortcut.register(activeKeybinds.toggleClickThrough, () => {
                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    logger.info('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    logger.info('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            logger.info(`Registered toggleClickThrough: ${activeKeybinds.toggleClickThrough}`);
        } catch (error) {
            logger.error(`Failed to register toggleClickThrough (${activeKeybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (activeKeybinds.nextStep) {
        try {
            globalShortcut.register(activeKeybinds.nextStep, async () => {
                logger.info('Next step shortcut triggered');
                try {
                    // Determine the shortcut key format
                    const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';

                    // Use the new handleShortcut function
                    await mainWindow.webContents.executeJavaScript(`
                        secretSauce.handleShortcut('${shortcutKey}');
                    `);
                } catch (error) {
                    logger.error('Error handling next step shortcut:', error);
                }
            });
            logger.info(`Registered nextStep: ${activeKeybinds.nextStep}`);
        } catch (error) {
            logger.error(`Failed to register nextStep (${activeKeybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (activeKeybinds.previousResponse) {
        try {
            globalShortcut.register(activeKeybinds.previousResponse, () => {
                logger.info('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            logger.info(`Registered previousResponse: ${activeKeybinds.previousResponse}`);
        } catch (error) {
            logger.error(`Failed to register previousResponse (${activeKeybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (activeKeybinds.nextResponse) {
        try {
            globalShortcut.register(activeKeybinds.nextResponse, () => {
                logger.info('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            logger.info(`Registered nextResponse: ${activeKeybinds.nextResponse}`);
        } catch (error) {
            logger.error(`Failed to register nextResponse (${activeKeybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (activeKeybinds.scrollUp) {
        try {
            globalShortcut.register(activeKeybinds.scrollUp, () => {
                logger.info('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            logger.info(`Registered scrollUp: ${activeKeybinds.scrollUp}`);
        } catch (error) {
            logger.error(`Failed to register scrollUp (${activeKeybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (activeKeybinds.scrollDown) {
        try {
            globalShortcut.register(activeKeybinds.scrollDown, () => {
                logger.info('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            logger.info(`Registered scrollDown: ${activeKeybinds.scrollDown}`);
        } catch (error) {
            logger.error(`Failed to register scrollDown (${activeKeybinds.scrollDown}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (activeKeybinds.emergencyErase) {
        try {
            globalShortcut.register(activeKeybinds.emergencyErase, () => {
                logger.info('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (geminiSessionRef.current) {
                        geminiSessionRef.current.close();
                        geminiSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
            logger.info(`Registered emergencyErase: ${activeKeybinds.emergencyErase}`);
        } catch (error) {
            logger.error(`Failed to register emergencyErase (${activeKeybinds.emergencyErase}):`, error);
        }
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    ipcMain.on('view-changed', (event, view) => {
        if (!mainWindow.isDestroyed()) {
            if (view !== 'assistant') {
                mainWindow.setIgnoreMouseEvents(false);
            }
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            return { success: true };
        } catch (error) {
            logger.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
};
