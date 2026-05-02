const { ipcRenderer } = require('electron');

// ── Theme Management ──
const themes = {
    dark: {
        name: 'Dark',
        background: '#0a0a0a',
        surface: '#121212',
        elevated: '#1a1a1a',
        text: '#ffffff',
        textSecondary: '#a0a0a0',
        textMuted: '#666666',
        border: '#222222',
        accent: '#3b82f6',
        btnPrimaryBg: '#ffffff',
        btnPrimaryText: '#0a0a0a',
        btnPrimaryHover: '#e0e0e0',
        tooltipBg: '#1a1a1a',
        tooltipText: '#ffffff',
        keyBg: 'rgba(255,255,255,0.08)',
    },
    light: {
        name: 'Light',
        background: '#ffffff',
        surface: '#f8f9fa',
        elevated: '#f1f3f5',
        text: '#1a1a1a',
        textSecondary: '#495057',
        textMuted: '#6c757d',
        border: '#dee2e6',
        accent: '#228be6',
        btnPrimaryBg: '#1a1a1a',
        btnPrimaryText: '#ffffff',
        btnPrimaryHover: '#343a40',
        tooltipBg: '#1a1a1a',
        tooltipText: '#ffffff',
        keyBg: 'rgba(0,0,0,0.05)',
    },
    midnight: {
        name: 'Midnight',
        background: '#0d1117',
        surface: '#161b22',
        elevated: '#21262d',
        text: '#c9d1d9',
        textSecondary: '#8b949e',
        textMuted: '#6e7681',
        border: '#30363d',
        accent: '#58a6ff',
        btnPrimaryBg: '#58a6ff',
        btnPrimaryText: '#0d1117',
        btnPrimaryHover: '#79b8ff',
        tooltipBg: '#161b22',
        tooltipText: '#c9d1d9',
        keyBg: 'rgba(88,166,255,0.12)',
    },
    sepia: {
        name: 'Sepia',
        background: '#f4ecd8',
        surface: '#ebe2cd',
        elevated: '#e0d6bc',
        text: '#433422',
        textSecondary: '#5f4b32',
        textMuted: '#7a6a56',
        border: '#dcd0b9',
        accent: '#8b4513',
        btnPrimaryBg: '#433422',
        btnPrimaryText: '#f4ecd8',
        btnPrimaryHover: '#5f4b32',
        tooltipBg: '#433422',
        tooltipText: '#f4ecd8',
        keyBg: 'rgba(67,52,34,0.12)',
    },
    catppuccin: {
        name: 'Catppuccin',
        background: '#1e1e2e',
        surface: '#181825',
        elevated: '#313244',
        text: '#cdd6f4',
        textSecondary: '#bac2de',
        textMuted: '#a6adc8',
        border: '#313244',
        accent: '#cba6f7',
        btnPrimaryBg: '#cba6f7',
        btnPrimaryText: '#1e1e2e',
        btnPrimaryHover: '#b4befe',
        tooltipBg: '#313244',
        tooltipText: '#cdd6f4',
        keyBg: 'rgba(203,166,247,0.12)',
    },
    gruvbox: {
        name: 'Gruvbox',
        background: '#282828',
        surface: '#1d2021',
        elevated: '#3c3836',
        text: '#ebdbb2',
        textSecondary: '#d5c4a1',
        textMuted: '#a89984',
        border: '#3c3836',
        accent: '#fe8019',
        btnPrimaryBg: '#fe8019',
        btnPrimaryText: '#282828',
        btnPrimaryHover: '#fabd2f',
        tooltipBg: '#3c3836',
        tooltipText: '#ebdbb2',
        keyBg: 'rgba(254,128,25,0.12)',
    },
    rosepine: {
        name: 'Rosé Pine',
        background: '#191724',
        surface: '#1f1d2e',
        elevated: '#26233a',
        text: '#e0def4',
        textSecondary: '#b9b4d1',
        textMuted: '#908caa',
        border: '#26233a',
        accent: '#ebbcba',
        btnPrimaryBg: '#ebbcba',
        btnPrimaryText: '#191724',
        btnPrimaryHover: '#f6c177',
        tooltipBg: '#26233a',
        tooltipText: '#e0def4',
        keyBg: 'rgba(235,188,186,0.12)',
    },
    solarized: {
        name: 'Solarized',
        background: '#002b36',
        surface: '#073642',
        elevated: '#0a4b5a',
        text: '#93a1a1',
        textSecondary: '#839496',
        textMuted: '#657b83',
        border: '#073642',
        accent: '#2aa198',
        btnPrimaryBg: '#2aa198',
        btnPrimaryText: '#002b36',
        btnPrimaryHover: '#268bd2',
        tooltipBg: '#073642',
        tooltipText: '#93a1a1',
        keyBg: 'rgba(42,161,152,0.12)',
    },
    tokyonight: {
        name: 'Tokyo Night',
        background: '#1a1b26',
        surface: '#16161e',
        elevated: '#24283b',
        text: '#c0caf5',
        textSecondary: '#9aa5ce',
        textMuted: '#565f89',
        border: '#292e42',
        accent: '#7aa2f7',
        btnPrimaryBg: '#7aa2f7',
        btnPrimaryText: '#1a1b26',
        btnPrimaryHover: '#bb9af7',
        tooltipBg: '#292e42',
        tooltipText: '#c0caf5',
        keyBg: 'rgba(122,162,247,0.12)',
    },
    nord: {
        name: 'Nord',
        background: '#2e3440',
        surface: '#3b4252',
        elevated: '#434c5e',
        text: '#eceff4',
        textSecondary: '#d8dee9',
        textMuted: '#88c0d0',
        border: '#434c5e',
        accent: '#88c0d0',
        btnPrimaryBg: '#88c0d0',
        btnPrimaryText: '#2e3440',
        btnPrimaryHover: '#8fbcbb',
        tooltipBg: '#3b4252',
        tooltipText: '#eceff4',
        keyBg: 'rgba(136,192,208,0.12)',
    },
};

const themeUtils = {
    current: 'dark',
    getAll: () => Object.entries(themes).map(([value, t]) => ({ value, name: t.name })),
    get: (name) => themes[name] || themes.dark,
    save: async (name) => {
        themeUtils.current = name;
        await storage.updatePreference('theme', name);
    },
    applyBackgrounds: (hex, transparency, themeName) => {
        if (themeName) themeUtils.current = themeName;
        
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        const root = document.documentElement;
        root.style.setProperty('--bg-app-rgb', `${r}, ${g}, ${b}`);
        root.style.setProperty('--bg-app', `rgba(${r}, ${g}, ${b}, ${transparency})`);

        const theme = themes[themeUtils.current];
        if (theme) {
            // Backgrounds
            root.style.setProperty('--bg-surface', theme.surface);
            root.style.setProperty('--bg-elevated', theme.elevated);
            root.style.setProperty('--bg-hover', theme.surface);
            
            // Text
            root.style.setProperty('--text-primary', theme.text);
            root.style.setProperty('--text-secondary', theme.textSecondary);
            root.style.setProperty('--text-muted', theme.textMuted);
            
            // Others
            root.style.setProperty('--border', theme.border);
            root.style.setProperty('--accent', theme.accent);
            root.style.setProperty('--btn-primary-bg', theme.btnPrimaryBg);
            root.style.setProperty('--btn-primary-text', theme.btnPrimaryText);
            root.style.setProperty('--btn-primary-hover', theme.btnPrimaryHover);
            root.style.setProperty('--tooltip-bg', theme.tooltipBg);
            root.style.setProperty('--tooltip-text', theme.tooltipText);
            root.style.setProperty('--key-bg', theme.keyBg);
            
            // Legacy mapping fallback - ensuring all variables in index.html are updated
            root.style.setProperty('--bg-primary', `rgba(${r}, ${g}, ${b}, ${transparency})`);
            root.style.setProperty('--bg-secondary', theme.surface);
            root.style.setProperty('--bg-tertiary', theme.elevated);
            root.style.setProperty('--text-color', theme.text);
            root.style.setProperty('--description-color', theme.textSecondary);
            root.style.setProperty('--placeholder-color', theme.textMuted);
            root.style.setProperty('--border-color', theme.border);
            root.style.setProperty('--input-background', theme.elevated);
            root.style.setProperty('--main-content-background', `rgba(${r}, ${g}, ${b}, ${transparency})`);
            root.style.setProperty('--header-background', theme.surface);
        }
    },
};

// ── Storage Bridge ──
const storage = {
    getConfig: () => ipcRenderer.invoke('storage:get-config').then(r => r.data),
    updateConfig: (key, value) => ipcRenderer.invoke('storage:update-config', { key, value }),
    getCredentials: () => ipcRenderer.invoke('storage:get-credentials').then(r => r.data),
    updateCredentials: (data) => ipcRenderer.invoke('storage:update-credentials', data),
    getPreferences: () => ipcRenderer.invoke('storage:get-preferences').then(r => r.data),
    updatePreference: (key, value) => ipcRenderer.invoke('storage:update-preference', { key, value }),
    getAllSessions: () => ipcRenderer.invoke('storage:get-all-sessions').then(r => r.data),
    getSession: (id) => ipcRenderer.invoke('storage:get-session', id).then(r => r.data),
    deleteSession: (id) => ipcRenderer.invoke('storage:delete-session', id),
    deleteAllSessions: () => ipcRenderer.invoke('storage:delete-all-sessions'),
    clearAllData: () => ipcRenderer.invoke('storage:clear-all-data'),
    fetchOpenRouterModels: (apiKey) => ipcRenderer.invoke('fetch-openrouter-models', apiKey).then(r => r.data),
    getApiKey: () => ipcRenderer.invoke('storage:get-api-key').then(r => r.data),
    getGroqApiKey: () => ipcRenderer.invoke('storage:get-groq-api-key').then(r => r.data),
    getOpenRouterApiKey: () => ipcRenderer.invoke('storage:get-openrouter-api-key').then(r => r.data),
    setApiKey: (key) => ipcRenderer.invoke('storage:update-credentials', { apiKey: key }),
    setGroqApiKey: (key) => ipcRenderer.invoke('storage:update-credentials', { groqApiKey: key }),
    setOpenRouterApiKey: (key) => ipcRenderer.invoke('storage:update-credentials', { openRouterApiKey: key }),
    getKeybinds: () => ipcRenderer.invoke('storage:get-keybinds').then(r => r.data),
    setKeybinds: (keybinds) => ipcRenderer.invoke('storage:set-keybinds', keybinds),
};

// ── Main Bridge ──
const secretSauce = {
    isMacOS: navigator.platform.toUpperCase().indexOf('MAC') >= 0,
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    storage,
    theme: themeUtils,
    
    initializeBYOK: (profile, lang) => ipcRenderer.invoke('initialize-gemini', null, null, profile, lang),
    initializeCloud: (profile) => ipcRenderer.invoke('initialize-cloud', null, profile, null),
    
    startCapture: (interval, quality) => ipcRenderer.invoke('start-capture', interval, quality),
    stopCapture: () => ipcRenderer.invoke('stop-capture'),
    
    sendTextMessage: (msg) => ipcRenderer.invoke('send-text-message', msg),
    
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    
    handleShortcut: (key) => {
        console.log('[Bridge] Handling shortcut:', key);
    },
};

window.secretSauce = secretSauce;
