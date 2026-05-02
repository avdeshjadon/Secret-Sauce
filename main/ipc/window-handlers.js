const { ipcMain, shell } = require('electron');
const { updateGlobalShortcuts } = require('../services/window/shortcuts');

function setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    ipcMain.on('view-changed', (event, view) => {
        if (!mainWindow.isDestroyed() && view !== 'assistant') {
            mainWindow.setIgnoreMouseEvents(false);
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) mainWindow.minimize();
    });

    ipcMain.handle('toggle-window-visibility', () => {
        if (mainWindow.isDestroyed()) return { success: false };
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.showInactive();
        return { success: true };
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-app-version', () => {
        const { app } = require('electron');
        return app.getVersion();
    });

    ipcMain.handle('quit-application', () => {
        const { app } = require('electron');
        app.quit();
    });
}

module.exports = { setupWindowIpcHandlers };
