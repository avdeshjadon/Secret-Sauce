const themes = {
    dark: {
        name: 'Midnight Dark',
        background: '#0a0a0a',
        surface: '#111111',
        elevated: '#191919',
        text: '#f5f5f5',
        secondary: '#999999',
        accent: '#3b82f6',
    },
    ocean: {
        name: 'Deep Ocean',
        background: '#0a0f1e',
        surface: '#11192e',
        elevated: '#19243d',
        text: '#e2e8f0',
        secondary: '#94a3b8',
        accent: '#38bdf8',
    },
    forest: {
        name: 'Dark Forest',
        background: '#0a1a0f',
        surface: '#112918',
        elevated: '#193822',
        text: '#ecfdf5',
        secondary: '#a7f3d0',
        accent: '#10b981',
    },
    crimson: {
        name: 'Crimson Night',
        background: '#1a0a0a',
        surface: '#291111',
        elevated: '#381919',
        text: '#fef2f2',
        secondary: '#fecaca',
        accent: '#ef4444',
    }
};

const themeUtils = {
    getAll: () => Object.entries(themes).map(([value, t]) => ({ value, name: t.name })),
    get: (name) => themes[name] || themes.dark,
    save: async (name) => {
        if (window.secretSauce && window.secretSauce.storage) {
            await window.secretSauce.storage.updatePreference('theme', name);
        }
    },
    applyBackgrounds: (hex, transparency) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        document.documentElement.style.setProperty('--bg-app', `rgba(${r}, ${g}, ${b}, ${transparency})`);
        
        // Also update other theme variables if needed
        const theme = themes[window.secretSauce?.theme?.current || 'dark'];
        if (theme) {
            document.documentElement.style.setProperty('--bg-surface', theme.surface);
            document.documentElement.style.setProperty('--bg-elevated', theme.elevated);
            document.documentElement.style.setProperty('--text-primary', theme.text);
            document.documentElement.style.setProperty('--text-secondary', theme.secondary);
            document.documentElement.style.setProperty('--accent', theme.accent);
        }
    }
};

window.themeUtils = themeUtils;
