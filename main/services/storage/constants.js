const CONFIG_VERSION = 1;

const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    groqApiKey: '',
    openRouterApiKey: '',
};

const DEFAULT_PREFERENCES = {
    customPrompt: '',
    providerMode: 'byok',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    whisperModel: 'Xenova/whisper-small',
    openRouterModel: '',
};

const DEFAULT_KEYBINDS = null;

const DEFAULT_LIMITS = {
    data: [],
};

module.exports = {
    CONFIG_VERSION,
    DEFAULT_CONFIG,
    DEFAULT_CREDENTIALS,
    DEFAULT_PREFERENCES,
    DEFAULT_KEYBINDS,
    DEFAULT_LIMITS,
};
