const { globalShortcut, screen } = require('electron');

let mouseEventsIgnored = false;

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
    console.log('[Shortcuts] Updating shortcuts:', keybinds);
    globalShortcut.unregisterAll();

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [x, y] = mainWindow.getPosition();
            mainWindow.setPosition(x, y - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [x, y] = mainWindow.getPosition();
            mainWindow.setPosition(x, y + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [x, y] = mainWindow.getPosition();
            mainWindow.setPosition(x - moveIncrement, y);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [x, y] = mainWindow.getPosition();
            mainWindow.setPosition(x + moveIncrement, y);
        },
    };

    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
            } catch (e) {
                console.error(`[Shortcuts] Failed to register ${action}:`, e);
            }
        }
    });

    if (keybinds.toggleVisibility) {
        globalShortcut.register(keybinds.toggleVisibility, () => {
            if (mainWindow.isVisible()) mainWindow.hide();
            else mainWindow.showInactive();
        });
    }

    if (keybinds.toggleClickThrough) {
        globalShortcut.register(keybinds.toggleClickThrough, () => {
            mouseEventsIgnored = !mouseEventsIgnored;
            mainWindow.setIgnoreMouseEvents(mouseEventsIgnored, { forward: true });
            sendToRenderer('click-through-toggled', mouseEventsIgnored);
        });
    }

    if (keybinds.nextStep) {
        globalShortcut.register(keybinds.nextStep, () => {
            const isMac = process.platform === 'darwin';
            const key = isMac ? 'cmd+enter' : 'ctrl+enter';
            mainWindow.webContents.executeJavaScript(`secretSauce.handleShortcut('${key}');`);
        });
    }

    const simpleActions = {
        previousResponse: 'navigate-previous-response',
        nextResponse: 'navigate-next-response',
        scrollUp: 'scroll-response-up',
        scrollDown: 'scroll-response-down',
    };

    Object.entries(simpleActions).forEach(([key, channel]) => {
        if (keybinds[key]) {
            globalShortcut.register(keybinds[key], () => sendToRenderer(channel));
        }
    });

    if (keybinds.emergencyErase) {
        globalShortcut.register(keybinds.emergencyErase, () => {
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
    }
}

module.exports = {
    getDefaultKeybinds,
    updateGlobalShortcuts,
};
