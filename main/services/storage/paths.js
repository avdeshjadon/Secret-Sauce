const path = require('path');
const os = require('os');

function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'secret-sauce-config');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'secret-sauce-config');
    } else {
        configDir = path.join(os.homedir(), '.config', 'secret-sauce-config');
    }

    return configDir;
}

const configDir = getConfigDir();

module.exports = {
    configDir,
    configPath: path.join(configDir, 'config.json'),
    credentialsPath: path.join(configDir, 'credentials.json'),
    preferencesPath: path.join(configDir, 'preferences.json'),
    keybindsPath: path.join(configDir, 'keybinds.json'),
    limitsPath: path.join(configDir, 'limits.json'),
    historyDir: path.join(configDir, 'history'),
};
