// SecretSauceApp.js — FIXED
//
// Fix #1 (Critical): All window.require('electron') calls removed.
//   ipcRenderer → window.electronAPI (contextBridge API from preload.js)
//   webFrame → not needed; zoom blocking is in renderer.js
//
// Fix #2 (Memory Leaks): connectedCallback now stores the unsubscribe
//   functions returned by window.electronAPI.on(). disconnectedCallback
//   calls them all — no more global removeAllListeners.
//
// Fix #5 (Graceful degradation): All API failures now show a meaningful
//   error state instead of a blank screen.

import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { MainView } from '../views/MainView.js';
import { CustomizeView } from '../views/CustomizeView.js';
import { HelpView } from '../views/HelpView.js';
import { HistoryView } from '../views/HistoryView.js';
import { AssistantView } from '../views/AssistantView.js';
import { OnboardingView } from '../views/OnboardingView.js';
import { StatsView } from '../views/StatsView.js';
import { ModelsView } from '../views/ModelsView.js';
import { ProfilesView } from '../views/ProfilesView.js';

export class SecretSauceApp extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: var(--font);
            margin: 0;
            padding: 0;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            height: 100vh;
            background: var(--bg-app);
            color: var(--text-primary);
        }

        .app-shell {
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        .top-drag-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            height: 38px;
            background: transparent;
        }

        .drag-region {
            flex: 1;
            height: 100%;
            -webkit-app-region: drag;
        }

        .top-drag-bar.hidden {
            display: none;
        }

        .traffic-lights {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 var(--space-md);
            height: 100%;
            -webkit-app-region: no-drag;
        }

        .traffic-light {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            padding: 0;
            transition: opacity 0.15s ease;
        }

        .traffic-light:hover { opacity: 0.8; }
        .traffic-light.close { background: #ff5f57; }
        .traffic-light.minimize { background: #febc2e; }
        .traffic-light.maximize { background: #28c840; }

        .sidebar {
            width: var(--sidebar-width);
            min-width: var(--sidebar-width);
            background: var(--bg-surface);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            padding: 42px 0 var(--space-md) 0;
            transition: width var(--transition), min-width var(--transition), opacity var(--transition);
        }

        .sidebar.hidden {
            width: 0;
            min-width: 0;
            padding: 0;
            overflow: hidden;
            border-right: none;
            opacity: 0;
        }

        .sidebar-brand {
            padding: var(--space-sm) var(--space-lg);
            padding-top: var(--space-md);
            margin-bottom: var(--space-lg);
        }

        .sidebar-brand h1 {
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            letter-spacing: -0.01em;
        }

        .sidebar-nav {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
            padding: 0 var(--space-sm);
            -webkit-app-region: no-drag;
            overflow-y: auto;
        }

        .nav-divider {
            height: 1px;
            background: var(--border);
            margin: var(--space-sm) var(--space-md);
            opacity: 0.5;
        }

        .nav-section-title {
            font-size: 10px;
            font-weight: var(--font-weight-bold);
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: var(--space-xs) var(--space-md);
            margin-top: var(--space-xs);
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition: color var(--transition), background var(--transition);
            border: none;
            background: none;
            width: 100%;
            text-align: left;
        }

        .nav-item:hover { color: var(--text-primary); background: var(--bg-hover); }
        .nav-item.active { color: var(--text-primary); background: var(--bg-elevated); }
        .nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
        
        /* Active Profile Badge */
        .active-profile-badge {
            margin: 0 var(--space-sm) var(--space-md) var(--space-sm);
            padding: 10px var(--space-md);
            background: var(--bg-hover);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            cursor: pointer;
            transition: all var(--transition);
            -webkit-app-region: no-drag;
        }

        .active-profile-badge:hover {
            border-color: var(--accent);
            background: var(--bg-elevated);
            transform: translateY(-1px);
        }

        .active-profile-badge .dot {
            width: 6px;
            height: 6px;
            background: var(--accent);
            border-radius: 50%;
            box-shadow: 0 0 8px var(--accent);
        }

        .active-profile-badge .name {
            font-size: 12px;
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            flex: 1;
        }

        .active-profile-badge .type-label {
            font-size: 9px;
            font-weight: var(--font-weight-bold);
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            background: var(--bg-elevated);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .new-session-btn {
            margin: 0 var(--space-sm) var(--space-md) var(--space-sm);
            padding: var(--space-sm) var(--space-md);
            background: var(--accent);
            color: var(--btn-primary-text);
            border: none;
            border-radius: var(--radius-md);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
            transition: background var(--transition);
            -webkit-app-region: no-drag;
        }

        .new-session-btn:hover { background: var(--accent-hover); }

        .sidebar-footer {
            padding: var(--space-sm);
            margin-top: auto;
            border-top: 1px solid var(--border);
            -webkit-app-region: no-drag;
        }

        .update-btn {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            width: 100%;
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            border: 1px solid rgba(239, 68, 68, 0.2);
            background: rgba(239, 68, 68, 0.08);
            color: var(--danger);
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            text-align: left;
            transition: background var(--transition), border-color var(--transition);
            animation: update-wobble 5s ease-in-out infinite;
        }

        .update-btn:hover { background: rgba(239, 68, 68, 0.14); border-color: rgba(239, 68, 68, 0.35); }

        @keyframes update-wobble {
            0%, 90%, 100% { transform: rotate(0deg); }
            92% { transform: rotate(-2deg); }
            94% { transform: rotate(2deg); }
            96% { transform: rotate(-1.5deg); }
            98% { transform: rotate(1.5deg); }
        }

        .update-btn svg { width: 20px; height: 20px; flex-shrink: 0; }
        .version-text { font-size: var(--font-size-xs); color: var(--text-muted); padding: var(--space-xs) var(--space-md); }

        .content {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background: var(--bg-app);
        }

        .live-bar {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 var(--space-md);
            background: var(--bg-surface);
            border-bottom: 1px solid var(--border);
            height: 36px;
            -webkit-app-region: drag;
        }

        .live-bar-left { display: flex; align-items: center; -webkit-app-region: no-drag; z-index: 1; }

        .live-bar-back {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            cursor: pointer;
            background: none;
            border: none;
            padding: var(--space-xs);
            border-radius: var(--radius-sm);
            transition: color var(--transition);
        }

        .live-bar-back:hover { color: var(--text-primary); }
        .live-bar-back svg { width: 14px; height: 14px; }

        .live-bar-center {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-weight: var(--font-weight-medium);
            white-space: nowrap;
            pointer-events: none;
        }

        .live-bar-right {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            -webkit-app-region: no-drag;
            z-index: 1;
        }

        .live-bar-text { font-size: var(--font-size-xs); color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap; }
        .live-bar-text.clickable { cursor: pointer; transition: color var(--transition); }
        .live-bar-text.clickable:hover { color: var(--text-primary); }

        .content-inner { flex: 1; overflow-y: auto; overflow-x: hidden; }
        .content-inner.live { overflow: hidden; display: flex; flex-direction: column; }

        .fullscreen { position: fixed; inset: 0; z-index: 100; background: var(--bg-app); }

        /* Fix #5: error screen */
        .error-screen {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: var(--space-md);
            color: var(--text-secondary);
            font-size: var(--font-size-sm);
            padding: var(--space-xl);
            text-align: center;
        }

        .error-screen .error-icon { font-size: 32px; }
        .error-screen .retry-btn {
            margin-top: var(--space-sm);
            padding: var(--space-sm) var(--space-lg);
            background: var(--accent);
            color: var(--btn-primary-text);
            border: none;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-size: var(--font-size-sm);
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444444; }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        isRecording: { type: Boolean },
        sessionActive: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        _viewInstances: { type: Object, state: true },
        _isClickThrough: { state: true },
        _awaitingNewResponse: { state: true },
        shouldAnimateResponse: { type: Boolean },
        _storageLoaded: { state: true },
        _updateAvailable: { state: true },
        _whisperDownloading: { state: true },
        _sessionError: { state: true },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.isRecording = false;
        this.sessionActive = false;
        this.selectedProfile = 'interview';
        this.selectedLanguage = 'en-US';
        this.selectedScreenshotInterval = '5';
        this.selectedImageQuality = 'medium';
        this.layoutMode = 'normal';
        this.responses = [];
        this.currentResponseIndex = -1;
        this._viewInstances = new Map();
        this._isClickThrough = false;
        this._awaitingNewResponse = false;
        this._currentResponseIsComplete = true;
        this.shouldAnimateResponse = false;
        this._storageLoaded = false;
        this._timerInterval = null;
        this._updateAvailable = false;
        this._whisperDownloading = false;
        this._localVersion = '';
        this._theme = 'dark';
        this._sessionError = null;

        // Fix #2: store IPC unsubscribe fns
        this._ipcUnsubs = [];

        this._loadFromStorage();
        this._checkForUpdates();
    }

    async _toggleTheme() {
        this._theme = this._theme === 'dark' ? 'light' : 'dark';
        await secretSauce.theme.save(this._theme);
        const colors = secretSauce.theme.get(this._theme);
        const prefs = await secretSauce.storage.getPreferences();
        secretSauce.theme.applyBackgrounds(colors.background, prefs.backgroundTransparency || 0.8);
        this.requestUpdate();
    }

    async _checkForUpdates() {
        try {
            this._localVersion = await secretSauce.getVersion();
            this.requestUpdate();
            const res = await fetch('https://raw.githubusercontent.com/avdeshjadon/secret-sauce/refs/heads/master/package.json');
            if (!res.ok) return;
            const remote = await res.json();
            const toNum = v => v.split('.').map(Number);
            const [rMaj, rMin, rPatch] = toNum(remote.version);
            const [lMaj, lMin, lPatch] = toNum(this._localVersion);
            if (rMaj > lMaj || (rMaj === lMaj && rMin > lMin) || (rMaj === lMaj && rMin === lMin && rPatch > lPatch)) {
                this._updateAvailable = true;
                this.requestUpdate();
            }
        } catch (e) { /* silently ignore */ }
    }

    async _loadFromStorage() {
        try {
            const [config, prefs] = await Promise.all([secretSauce.storage.getConfig(), secretSauce.storage.getPreferences()]);
            this.currentView = config.onboarded ? 'main' : 'onboarding';
            this.selectedProfile = prefs.selectedProfile || 'interview';
            this.selectedLanguage = prefs.selectedLanguage || 'en-US';
            this.selectedScreenshotInterval = prefs.selectedScreenshotInterval || '5';
            this.selectedImageQuality = prefs.selectedImageQuality || 'medium';
            this.layoutMode = config.layout || 'normal';
            this._theme = prefs.theme || 'dark';
            this._storageLoaded = true;
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading from storage:', error);
            this._storageLoaded = true;
            this.requestUpdate();
        }
    }

    connectedCallback() {
        super.connectedCallback();

        // Fix #1 + Fix #2: use window.electronAPI, store unsub fns
        this._ipcUnsubs.push(
            window.electronAPI.on('new-response', response => this.addNewResponse(response))
        );
        this._ipcUnsubs.push(
            window.electronAPI.on('update-response', response => this.updateCurrentResponse(response))
        );
        this._ipcUnsubs.push(
            window.electronAPI.on('update-status', status => this.setStatus(status))
        );
        this._ipcUnsubs.push(
            window.electronAPI.on('reconnect-failed', data => {
                // Fix #5: show proper error state instead of blank screen
                this._sessionError = data.message || 'Connection failed. Please restart the session.';
                this.addNewResponse(data.message);
                this.requestUpdate();
            })
        );
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
        // Fix #2: clean up all IPC listeners properly
        this._ipcUnsubs.forEach(unsub => unsub());
        this._ipcUnsubs = [];
    }

    _startTimer() {
        this._stopTimer();
        if (this.startTime) {
            this._timerInterval = setInterval(() => this.requestUpdate(), 1000);
        }
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    getElapsedTime() {
        if (!this.startTime) return '0:00';
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const pad = n => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${m}:${pad(s)}`;
    }

    setStatus(text) {
        this.statusText = text;
        if (text.includes('Ready') || text.includes('Listening') || text.includes('Error')) {
            this._currentResponseIsComplete = true;
        }
    }

    addNewResponse(response) {
        const wasOnLatest = this.currentResponseIndex === this.responses.length - 1;
        this.responses = [...this.responses, response];
        if (wasOnLatest || this.currentResponseIndex === -1) {
            this.currentResponseIndex = this.responses.length - 1;
        }
        this._awaitingNewResponse = false;
        this.requestUpdate();
    }

    updateCurrentResponse(response) {
        if (this.responses.length > 0) {
            this.responses = [...this.responses.slice(0, -1), response];
        } else {
            this.addNewResponse(response);
        }
        this.requestUpdate();
    }

    navigate(view) {
        this.currentView = view;
        this.requestUpdate();
    }

    async handleClose() {
        if (this.currentView === 'assistant') {
            secretSauce.stopCapture();
            try {
                await window.electronAPI.invoke('close-session');
            } catch (e) {
                console.error('close-session error:', e);
            }
            this.sessionActive = false;
            this._sessionError = null;
            this._stopTimer();
            this.currentView = 'main';
        } else {
            try {
                await window.electronAPI.invoke('quit-application');
            } catch (e) {
                console.error('quit error:', e);
            }
        }
    }

    async _handleMinimize() {
        try {
            await window.electronAPI.invoke('window-minimize');
        } catch (e) {
            console.error('minimize error:', e);
        }
    }

    async handleHideToggle() {
        try {
            await window.electronAPI.invoke('toggle-window-visibility');
        } catch (e) {
            console.error('toggle-visibility error:', e);
        }
    }

    async handleStart() {
        this._sessionError = null;
        const prefs = await secretSauce.storage.getPreferences();
        const providerMode = prefs.providerMode || 'byok';

        try {
            if (providerMode === 'cloud') {
                const creds = await secretSauce.storage.getCredentials();
                if (!creds.cloudToken || creds.cloudToken.trim() === '') {
                    this._showApiKeyError();
                    return;
                }
                const success = await secretSauce.initializeCloud(this.selectedProfile);
                if (!success) { this._showApiKeyError(); return; }

            } else if (providerMode === 'local') {
                const success = await secretSauce.initializeLocal(this.selectedProfile);
                if (!success) { this._showApiKeyError(); return; }

            } else {
                const apiKey = await secretSauce.storage.getApiKey();
                if (!apiKey || apiKey === '') { this._showApiKeyError(); return; }
                await secretSauce.initializeGemini(this.selectedProfile, this.selectedLanguage);
            }

            secretSauce.startCapture(this.selectedScreenshotInterval, this.selectedImageQuality);
            this.responses = [];
            this.currentResponseIndex = -1;
            this.startTime = Date.now();
            this.sessionActive = true;
            this.currentView = 'assistant';
            this._startTimer();

        } catch (err) {
            // Fix #5: graceful degradation — show error screen, not blank screen
            this._sessionError = `Failed to start session: ${err.message}`;
            this.setStatus('Error: ' + err.message);
            this.requestUpdate();
        }
    }

    _showApiKeyError() {
        const mainView = this.shadowRoot.querySelector('main-view');
        if (mainView && mainView.triggerApiKeyError) {
            mainView.triggerApiKeyError();
        }
    }

    async handleAPIKeyHelp() {
        await window.electronAPI.invoke('open-external', 'https://secretsauce.com/help/api-key');
    }

    async handleGroqAPIKeyHelp() {
        await window.electronAPI.invoke('open-external', 'https://console.groq.com/keys');
    }

    async handleProfileChange(profile) {
        this.selectedProfile = profile;
        await secretSauce.storage.updatePreference('selectedProfile', profile);
    }

    async handleLanguageChange(language) {
        this.selectedLanguage = language;
        await secretSauce.storage.updatePreference('selectedLanguage', language);
    }

    async handleScreenshotIntervalChange(interval) {
        this.selectedScreenshotInterval = interval;
        await secretSauce.storage.updatePreference('selectedScreenshotInterval', interval);
    }

    async handleImageQualityChange(quality) {
        this.selectedImageQuality = quality;
        await secretSauce.storage.updatePreference('selectedImageQuality', quality);
    }

    async handleLayoutModeChange(layoutMode) {
        this.layoutMode = layoutMode;
        await secretSauce.storage.updateConfig('layout', layoutMode);
        this.requestUpdate();
    }

    async handleExternalLinkClick(url) {
        await window.electronAPI.invoke('open-external', url);
    }

    _getProfileLabel(p) {
        const labels = { interview: 'Interview', sales: 'Sales Call', meeting: 'Meeting', presentation: 'Presentation', negotiation: 'Negotiation', exam: 'Exam' };
        return labels[p] || p;
    }

    _getProfileIcon(p) {
        switch (p) {
            case 'interview': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
            case 'sales': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/><path d="m7 7 5 5-5 5"/><path d="m17 7-5 5 5 5"/></svg>`;
            case 'meeting': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`;
            case 'presentation': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/></svg>`;
            case 'negotiation': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`;
            case 'exam': return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`;
            default: return html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
        }
    }

    async _switchProfile(profile) {
        if (this.selectedProfile === profile) return;
        this.selectedProfile = profile;
        await secretSauce.storage.updatePreference('selectedProfile', profile);
        
        // Inform main process to update system prompt on the fly
        const prefs = await secretSauce.storage.getPreferences();
        await window.electronAPI.invoke('update-active-profile', profile, prefs.customPrompt || '');
        
        this.requestUpdate();
    }

    async handleSendText(message) {
        const result = await window.secretSauce.sendTextMessage(message);
        if (!result.success) {
            this.setStatus('Error sending message: ' + result.error);
        } else {
            this.setStatus('Message sent...');
            this._awaitingNewResponse = true;
        }
    }

    handleResponseIndexChanged(e) {
        this.currentResponseIndex = e.detail.index;
        this.shouldAnimateResponse = false;
        this.requestUpdate();
    }

    handleOnboardingComplete() {
        this.currentView = 'main';
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        // Fix #1: no ipcRenderer — view change notification removed
        // (window.require('electron') would crash here)
    }

    _isLiveMode() {
        return this.currentView === 'assistant';
    }

    renderCurrentView() {
        // Fix #5: if session errored, show error screen in assistant view
        if (this.currentView === 'assistant' && this._sessionError) {
            return html`
                <div class="error-screen">
                    <div class="error-icon">⚠️</div>
                    <div>${this._sessionError}</div>
                    <button class="retry-btn" @click=${() => { this._sessionError = null; this.currentView = 'main'; this.requestUpdate(); }}>
                        Back to Home
                    </button>
                </div>
            `;
        }

        switch (this.currentView) {
            case 'onboarding':
                return html`<onboarding-view .onComplete=${() => this.handleOnboardingComplete()} .onClose=${() => this.handleClose()}></onboarding-view>`;

            case 'main':
                return html`
                    <main-view
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onStart=${() => this.handleStart()}
                        .onExternalLink=${url => this.handleExternalLinkClick(url)}
                        .whisperDownloading=${this._whisperDownloading}
                    ></main-view>
                `;

            case 'stats':
                return html`<stats-view></stats-view>`;

            case 'customize':
                return html`
                    <customize-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .selectedScreenshotInterval=${this.selectedScreenshotInterval}
                        .selectedImageQuality=${this.selectedImageQuality}
                        .layoutMode=${this.layoutMode}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onLanguageChange=${l => this.handleLanguageChange(l)}
                        .onScreenshotIntervalChange=${i => this.handleScreenshotIntervalChange(i)}
                        .onImageQualityChange=${q => this.handleImageQualityChange(q)}
                        .onLayoutModeChange=${lm => this.handleLayoutModeChange(lm)}
                    ></customize-view>
                `;

            case 'help':
                return html`<help-view .onExternalLinkClick=${url => this.handleExternalLinkClick(url)}></help-view>`;

            case 'history':
                return html`<history-view></history-view>`;

            case 'profiles':
                return html`
                    <profiles-view 
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this._switchProfile(p)}
                        .getProfileIcon=${p => this._getProfileIcon(p)}
                        .getProfileLabel=${p => this._getProfileLabel(p)}
                    ></profiles-view>
                `;

            case 'assistant':
                return html`
                    <assistant-view
                        .responses=${this.responses}
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .onSendText=${msg => this.handleSendText(msg)}
                        .shouldAnimateResponse=${this.shouldAnimateResponse}
                        @response-index-changed=${this.handleResponseIndexChanged}
                        @response-animation-complete=${() => {
                            this.shouldAnimateResponse = false;
                            this._currentResponseIsComplete = true;
                            this.requestUpdate();
                        }}
                    ></assistant-view>
                `;

            default:
                return html`<div>Unknown view: ${this.currentView}</div>`;
        }
    }

    renderSidebar() {
        const items = [
            { id: 'main', label: 'Home', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m19 8.71l-5.333-4.148a2.666 2.666 0 0 0-3.274 0L5.059 8.71a2.67 2.67 0 0 0-1.029 2.105v7.2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.2c0-.823-.38-1.6-1.03-2.105"/><path d="M16 15c-2.21 1.333-5.792 1.333-8 0"/></g></svg>` },
            { id: 'stats', label: 'Statistics', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></g></svg>` },
            { id: 'profiles', label: 'Profiles', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
            { id: 'history', label: 'History', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10 20.777a9 9 0 0 1-2.48-.969M14 3.223a9.003 9.003 0 0 1 0 17.554m-9.421-3.684a9 9 0 0 1-1.227-2.592M3.124 10.5c.16-.95.468-1.85.9-2.675l.169-.305m2.714-2.941A9 9 0 0 1 10 3.223"/><path d="M12 8v4l3 3"/></g></svg>` },
            { id: 'customize', label: 'Settings', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M19.875 6.27A2.23 2.23 0 0 1 21 8.218v7.284c0 .809-.443 1.555-1.158 1.948l-6.75 4.27a2.27 2.27 0 0 1-2.184 0l-6.75-4.27A2.23 2.23 0 0 1 3 15.502V8.217c0-.809.443-1.554 1.158-1.947l6.75-3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0"/></g></svg>` },
            { id: 'help', label: 'Help', icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9s-9-1.8-9-9s1.8-9 9-9m0 13v.01"/><path d="M12 13a2 2 0 0 0 .914-3.782a1.98 1.98 0 0 0-2.414.483"/></g></svg>` },
        ];

        return html`
            <div class="sidebar ${this._isLiveMode() ? 'hidden' : ''}">
                <div class="sidebar-brand"><h1>Secret Sauce</h1></div>
                <button class="new-session-btn" @click=${() => this.navigate('main')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
                    New Session
                </button>
                
                <div class="active-profile-badge" @click=${() => this.navigate('profiles')} title="Click to change profile">
                    <div class="dot"></div>
                    <div class="name">${this._getProfileLabel(this.selectedProfile)}</div>
                    <div class="type-label">Profile</div>
                </div>

                <div class="nav-divider"></div>
                
                <nav class="sidebar-nav">
                    ${items.map(item => html`
                        <button class="nav-item ${this.currentView === item.id ? 'active' : ''}" @click=${() => this.navigate(item.id)} title=${item.label}>
                            ${item.icon} ${item.label}
                        </button>
                    `)}
                </nav>
                <div class="sidebar-footer">
                    ${this._updateAvailable
                        ? html`<button class="update-btn" @click=${() => this.handleExternalLinkClick('https://secretsauce.com/download')}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5m-5-7v12"/></svg>
                                Update available
                               </button>`
                        : html`<div class="version-text">v${this._localVersion}</div>`}
                </div>
            </div>
        `;
    }

    renderLiveBar() {
        if (!this._isLiveMode()) return '';
        const profileLabels = { interview: 'Interview', sales: 'Sales Call', meeting: 'Meeting', presentation: 'Presentation', negotiation: 'Negotiation', exam: 'Exam' };
        return html`
            <div class="live-bar">
                <div class="live-bar-left">
                    <button class="live-bar-back" @click=${() => this.handleClose()} title="End session">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd"/></svg>
                    </button>
                </div>
                <div class="live-bar-center">${profileLabels[this.selectedProfile] || 'Session'}</div>
                <div class="live-bar-right">
                    ${this.statusText ? html`<span class="live-bar-text">${this.statusText}</span>` : ''}
                    <span class="live-bar-text">${this.getElapsedTime()}</span>
                    ${this._isClickThrough ? html`<span class="live-bar-text">[click through]</span>` : ''}
                    <span class="live-bar-text clickable" @click=${() => this.handleHideToggle()}>[hide]</span>
                </div>
            </div>
        `;
    }

    render() {
        if (this.currentView === 'onboarding') {
            return html`<div class="fullscreen">${this.renderCurrentView()}</div>`;
        }
        const isLive = this._isLiveMode();
        return html`
            <div class="app-shell">
                <div class="top-drag-bar ${isLive ? 'hidden' : ''}">
                    <div class="traffic-lights">
                        <button class="traffic-light close" @click=${() => this.handleClose()} title="Close"></button>
                        <button class="traffic-light minimize" @click=${() => this._handleMinimize()} title="Minimize"></button>
                        <button class="traffic-light maximize" title="Maximize"></button>
                    </div>
                    <div class="drag-region"></div>
                </div>
                ${this.renderSidebar()}
                <div class="content">
                    ${isLive ? this.renderLiveBar() : ''}
                    <div class="content-inner ${isLive ? 'live' : ''}">${this.renderCurrentView()}</div>
                </div>
            </div>
        `;
    }
}

customElements.define('secret-sauce-app', SecretSauceApp);