const { BrowserWindow, desktopCapturer, session } = require('electron');
const path = require('path');
const storage = require('../storage');
const { getDefaultKeybinds, updateGlobalShortcuts } = require('./shortcuts');

const DEFAULT_SIZE = { width: 1100, height: 800 };
const MIN_SIZE = { width: 700, height: 320 };

function createWindow(sendToRenderer, geminiSessionRef) {
    const mainWindow = new BrowserWindow({
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height,
        minWidth: MIN_SIZE.width,
        minHeight: MIN_SIZE.height,
        resizable: true,
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
        },
        backgroundColor: '#00000000',
    });

    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
            callback({ video: sources[0], audio: 'loopback' });
        });
    }, { useSystemPicker: true });

    mainWindow.setContentProtection(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (process.platform === 'win32') {
        mainWindow.setSkipTaskbar(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    } else if (process.platform === 'darwin') {
        mainWindow.setHiddenInMissionControl(true);
    }

    mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));

    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            const savedKeybinds = storage.getKeybinds();
            const keybinds = savedKeybinds ? { ...defaultKeybinds, ...savedKeybinds } : defaultKeybinds;
            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }, 150);
    });

    return mainWindow;
}

module.exports = {
    createWindow,
};
