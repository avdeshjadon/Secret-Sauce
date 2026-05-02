const { app, BrowserWindow } = require('electron');
const { createWindow } = require('./services/window/manager');
const { initializeStorage } = require('./services/storage');
const { setupIpcHandlers } = require('./ipc');

let mainWindow = null;
const geminiSessionRef = { current: null };

function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

app.whenReady().then(async () => {
    initializeStorage();
    
    // Screen recording permission prompt (macOS)
    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    setupIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow(sendToRenderer, geminiSessionRef);
    }
});
