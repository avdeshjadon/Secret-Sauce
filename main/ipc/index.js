const { setupStorageIpcHandlers } = require('./storage-handlers');
const { setupWindowIpcHandlers } = require('./window-handlers');
const { setupAiIpcHandlers } = require('./ai-handlers');

function setupIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef) {
    setupStorageIpcHandlers();
    setupWindowIpcHandlers(mainWindow, sendToRenderer, geminiSessionRef);
    setupAiIpcHandlers();
}

module.exports = { setupIpcHandlers };
