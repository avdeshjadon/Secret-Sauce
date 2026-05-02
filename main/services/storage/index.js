const fs = require('fs');
const { configPath, credentialsPath, preferencesPath, keybindsPath, historyDir, configDir } = require('./paths');
const { CONFIG_VERSION, DEFAULT_CONFIG, DEFAULT_CREDENTIALS, DEFAULT_PREFERENCES, DEFAULT_KEYBINDS } = require('./constants');
const { readJsonFile, writeJsonFile } = require('./io');
const history = require('./history');
const limits = require('./limits');

function initializeStorage() {
    const configExists = fs.existsSync(configPath);
    if (!configExists) {
        resetConfigDir();
    } else {
        try {
            const config = readJsonFile(configPath, {});
            if (!config.configVersion || config.configVersion !== CONFIG_VERSION) {
                resetConfigDir();
            } else if (!fs.existsSync(historyDir)) {
                fs.mkdirSync(historyDir, { recursive: true });
            }
        } catch {
            resetConfigDir();
        }
    }
}

function resetConfigDir() {
    if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
    }
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });
    writeJsonFile(configPath, DEFAULT_CONFIG);
    writeJsonFile(credentialsPath, DEFAULT_CREDENTIALS);
    writeJsonFile(preferencesPath, DEFAULT_PREFERENCES);
}

// Config
const getConfig = () => readJsonFile(configPath, DEFAULT_CONFIG);
const setConfig = (data) => writeJsonFile(configPath, { ...getConfig(), ...data, configVersion: CONFIG_VERSION });
const updateConfig = (key, value) => {
    const data = getConfig();
    data[key] = value;
    return writeJsonFile(configPath, data);
};

// Credentials
const getCredentials = () => readJsonFile(credentialsPath, DEFAULT_CREDENTIALS);
const setCredentials = (data) => writeJsonFile(credentialsPath, { ...getCredentials(), ...data });
const getApiKey = () => getCredentials().apiKey || '';
const setApiKey = (apiKey) => setCredentials({ apiKey });
const getGroqApiKey = () => getCredentials().groqApiKey || '';
const setGroqApiKey = (groqApiKey) => setCredentials({ groqApiKey });
const getOpenRouterApiKey = () => getCredentials().openRouterApiKey || '';
const setOpenRouterApiKey = (openRouterApiKey) => setCredentials({ openRouterApiKey });

// Preferences
const getPreferences = () => ({ ...DEFAULT_PREFERENCES, ...readJsonFile(preferencesPath, {}) });
const setPreferences = (data) => writeJsonFile(preferencesPath, { ...getPreferences(), ...data });
const updatePreference = (key, value) => {
    const data = getPreferences();
    data[key] = value;
    return writeJsonFile(preferencesPath, data);
};

// Keybinds
const getKeybinds = () => readJsonFile(keybindsPath, DEFAULT_KEYBINDS);
const setKeybinds = (data) => writeJsonFile(keybindsPath, data);

const clearAllData = () => {
    resetConfigDir();
    return true;
};

module.exports = {
    initializeStorage,
    resetConfigDir,
    clearAllData,
    getConfig,
    setConfig,
    updateConfig,
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGroqApiKey,
    setGroqApiKey,
    getOpenRouterApiKey,
    setOpenRouterApiKey,
    getPreferences,
    setPreferences,
    updatePreference,
    getKeybinds,
    setKeybinds,
    ...history,
    ...limits,
};
