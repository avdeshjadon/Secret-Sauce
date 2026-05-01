import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class CustomizeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .danger-surface {
                border-color: rgba(239, 68, 68, 0.3);
            }

            .surface-title.danger {
                color: rgba(239, 68, 68, 0.7);
            }

            .warning-callout {
                position: relative;
                margin-top: 4px;
                padding: 8px 12px;
                border: 1px solid var(--danger);
                border-radius: var(--radius-sm);
                color: var(--danger);
                font-size: var(--font-size-xs);
                line-height: 1.4;
                background: rgba(239, 68, 68, 0.06);
            }

            .warning-callout::before {
                content: '';
                position: absolute;
                top: -6px;
                left: 16px;
                width: 10px;
                height: 10px;
                background: var(--bg-surface);
                border-top: 1px solid var(--danger);
                border-left: 1px solid var(--danger);
                transform: rotate(45deg);
            }

            textarea.control {
                width: 100%;
                min-height: 100px;
                resize: vertical;
                line-height: 1.45;
            }

            .model-row {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                flex-wrap: wrap;
            }

            @media (max-width: 480px) {
                .model-row {
                    flex-direction: column;
                    align-items: stretch;
                }
                .control {
                    width: 100% !important;
                }
            }

            .toggle-row {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                padding: var(--space-sm);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
            }

            .toggle-input {
                width: 14px;
                height: 14px;
                accent-color: var(--text-primary);
                cursor: pointer;
            }

            .toggle-label {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                cursor: pointer;
                user-select: none;
            }

            .slider-wrap {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: var(--space-xs);
            }

            .slider-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
            }

            .slider-value {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 2px 8px;
            }

            .slider-input {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: var(--border);
                outline: none;
                cursor: pointer;
            }

            .slider-input::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--text-primary);
                border: none;
            }

            .slider-input::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--text-primary);
                border: none;
            }


            .danger-button {
                border: 1px solid rgba(239, 68, 68, 0.4);
                color: rgba(239, 68, 68, 0.7);
                background: transparent;
                border-radius: var(--radius-sm);
                padding: 9px 12px;
                font-size: var(--font-size-sm);
                cursor: pointer;
                transition: background var(--transition);
            }

            .danger-button:hover {
                background: rgba(241, 76, 76, 0.11);
            }

            .danger-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .status {
                margin-top: var(--space-sm);
                padding: var(--space-sm);
                border-radius: var(--radius-sm);
                border: 1px solid var(--border);
                font-size: var(--font-size-xs);
            }

            .status.success {
                border-color: var(--success);
                color: var(--success);
            }

            .status.error {
                border-color: var(--danger);
                color: var(--danger);
            }
            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: var(--space-lg);
            }
            .page-title-group {
                flex: 1;
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        keybinds: { type: Object },
        backgroundTransparency: { type: Number },
        fontSize: { type: Number },
        theme: { type: String },
        onProfileChange: { type: Function },
        onLanguageChange: { type: Function },
        onImageQualityChange: { type: Function },
        onLayoutModeChange: { type: Function },
        isClearing: { type: Boolean },
        isRestoring: { type: Boolean },
        clearStatusMessage: { type: String },
        clearStatusType: { type: String },
        transcriptionEngine: { type: String },
        whisperModel: { type: String },
        whisperStatus: { type: Object, state: true },
        downloadProgress: { type: Number, state: true },
        mode: { type: String },
    };

    constructor() {
        super();
        this.selectedProfile = 'interview';
        this.selectedLanguage = 'en-US';
        this.selectedImageQuality = 'medium';
        this.layoutMode = 'normal';
        this.onProfileChange = () => {};
        this.onLanguageChange = () => {};
        this.onImageQualityChange = () => {};
        this.onLayoutModeChange = () => {};
        this.isClearing = false;
        this.audioMode = 'speaker_only';
        this.customPrompt = '';
        this.theme = 'dark';
        this.transcriptionEngine = 'gemini';
        this.whisperModel = 'tiny.en';
        this.transformersModel = 'tiny.en';
        this.whisperStatus = {};
        this.transformersStatus = {};
        this.downloadProgress = 0;
        this.downloadingModel = '';
        this.downloadingType = ''; // 'cpp' or 'transformers'
        this.isDownloadingAll = false;
        this._loadFromStorage();
    }

    getThemes() {
        return secretSauce.theme.getAll();
    }

    async _loadFromStorage() {
        try {
            const [prefs, keybinds] = await Promise.all([secretSauce.storage.getPreferences(), secretSauce.storage.getKeybinds()]);
            this.backgroundTransparency = prefs.backgroundTransparency ?? 0.8;
            this.fontSize = prefs.fontSize ?? 20;
            this.audioMode = prefs.audioMode ?? 'speaker_only';
            this.customPrompt = prefs.customPrompt ?? '';
            this.theme = prefs.theme ?? 'dark';
            this.mode = prefs.providerMode ?? 'byok';
            this.transcriptionEngine = prefs.transcriptionEngine ?? 'gemini';

            // Force whisper in local mode
            if (this.mode === 'local' && this.transcriptionEngine !== 'whisper') {
                this.transcriptionEngine = 'whisper';
                secretSauce.storage.updatePreference('transcriptionEngine', 'whisper');
            }

            this.whisperModel = prefs.whisperModel ?? 'tiny.en';
            this.transformersModel = prefs.transformersModel ?? 'tiny.en';
            
            this.updateBackgroundAppearance();
            this.updateFontSize();
            await this._checkAllModels();
            
            // Auto-select smallest downloaded model if current is missing
            this._autoSelectSmallestModels();
            
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadFromStorage();
        this._unsubProgress = secretSauce.on('whisper-download-progress', (data) => {
            this.downloadProgress = data.progress;
            if (data.progress === 100) {
                if (!this.isDownloadingAll) {
                    this.downloadingModel = '';
                    this.downloadingType = '';
                }
                setTimeout(() => this._checkAllModels(), 1000);
            }
            this.requestUpdate();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubProgress) this._unsubProgress();
    }

    async _checkAllModels() {
        const models = ['tiny.en', 'base.en', 'small.en'];
        const wStatus = {};
        const tStatus = {};
        
        const checks = await Promise.all([
            ...models.map(m => secretSauce.invoke('check-whisper-model-exists', m)),
            ...models.map(m => secretSauce.invoke('check-transformers-model-exists', m))
        ]);

        models.forEach((m, i) => {
            wStatus[m] = checks[i];
            tStatus[m] = checks[i + models.length];
        });

        this.whisperStatus = wStatus;
        this.transformersStatus = tStatus;
        this.requestUpdate();
    }

    _autoSelectSmallestModels() {
        const order = ['tiny.en', 'base.en', 'small.en'];
        
        // Whisper CPP
        if (!this.whisperStatus[this.whisperModel]) {
            const best = order.find(m => this.whisperStatus[m]);
            if (best && best !== this.whisperModel) {
                this.whisperModel = best;
                secretSauce.storage.updatePreference('whisperModel', best);
                console.log(`[Customize] Auto-switched Whisper model to ${best}`);
            }
        }

        // Transformers
        if (!this.transformersStatus[this.transformersModel]) {
            const best = order.find(m => this.transformersStatus[m]);
            if (best && best !== this.transformersModel) {
                this.transformersModel = best;
                secretSauce.storage.updatePreference('transformersModel', best);
                console.log(`[Customize] Auto-switched Transformers model to ${best}`);
            }
        }
    }

    async handleTranscriptionEngineChange(e) {
        const engine = e.target.value;
        this.transcriptionEngine = engine;
        await secretSauce.storage.updatePreference('transcriptionEngine', engine);
        this.requestUpdate();
    }

    async handleWhisperModelSelect(e) {
        const model = e.target.value;
        this.whisperModel = model;
        await secretSauce.storage.updatePreference('whisperModel', model);
        this.requestUpdate();
    }

    async handleTransformersModelSelect(e) {
        const model = e.target.value;
        this.transformersModel = model;
        await secretSauce.storage.updatePreference('transformersModel', model);
        this.requestUpdate();
    }

    async handleDownloadModel(type = 'cpp') {
        if (this.downloadProgress > 0 && this.downloadProgress < 100) return;
        
        const modelToDownload = type === 'cpp' ? this.whisperModel : this.transformersModel;
        this.downloadingModel = modelToDownload;
        this.downloadingType = type;

        try {
            this.downloadProgress = 1;
            const channel = type === 'cpp' ? 'download-whisper-model' : 'download-transformers-model';
            const result = await secretSauce.invoke(channel, modelToDownload);
            if (result.success) {
                await this._checkAllModels();
            }
            if (!result.success) {
                await window.secretSauce.alert('Download failed: ' + result.error, 'Download Error');
            }
        } catch (err) {
            await window.secretSauce.alert('Download error: ' + err.message, 'System Error');
        } finally {
            if (!this.isDownloadingAll) {
                this.downloadProgress = 0;
                this.downloadingModel = '';
                this.downloadingType = '';
            }
        }
    }


    async handleDeleteModel(modelName, type = 'cpp') {
        const title = type === 'cpp' ? 'Whisper model' : 'Transformers model';
        const confirmed = await window.secretSauce.confirm(`Are you sure you want to delete the ${modelName} ${title}?`, 'Delete Model');
        if (confirmed) {
            try {
                const channel = type === 'cpp' ? 'delete-whisper-model' : 'clear-transformers-model-cache';
                const result = await secretSauce.invoke(channel, modelName);
                if (result.success) {
                    await this._checkAllModels();
                }
                if (!result.success) {
                    await window.secretSauce.alert('Delete failed: ' + result.error, 'Error');
                }
            } catch (err) {
                await window.secretSauce.alert('Delete error: ' + err.message, 'System Error');
            }
        }
    }

    getProfiles() {
        return [
            { value: 'interview', name: 'Job Interview' },
            { value: 'sales', name: 'Sales Call' },
            { value: 'meeting', name: 'Business Meeting' },
            { value: 'presentation', name: 'Presentation' },
            { value: 'negotiation', name: 'Negotiation' },
            { value: 'exam', name: 'Exam Assistant' },
        ];
    }

    getLanguages() {
        return [
            { value: 'en-US', name: 'English (US)' },
            { value: 'en-GB', name: 'English (UK)' },
            { value: 'en-AU', name: 'English (Australia)' },
            { value: 'en-IN', name: 'English (India)' },
            { value: 'de-DE', name: 'German (Germany)' },
            { value: 'es-US', name: 'Spanish (US)' },
            { value: 'es-ES', name: 'Spanish (Spain)' },
            { value: 'fr-FR', name: 'French (France)' },
            { value: 'fr-CA', name: 'French (Canada)' },
            { value: 'hi-IN', name: 'Hindi (India)' },
            { value: 'pt-BR', name: 'Portuguese (Brazil)' },
            { value: 'ar-XA', name: 'Arabic (Generic)' },
            { value: 'id-ID', name: 'Indonesian (Indonesia)' },
            { value: 'it-IT', name: 'Italian (Italy)' },
            { value: 'ja-JP', name: 'Japanese (Japan)' },
            { value: 'tr-TR', name: 'Turkish (Turkey)' },
            { value: 'vi-VN', name: 'Vietnamese (Vietnam)' },
            { value: 'bn-IN', name: 'Bengali (India)' },
            { value: 'gu-IN', name: 'Gujarati (India)' },
            { value: 'kn-IN', name: 'Kannada (India)' },
            { value: 'ml-IN', name: 'Malayalam (India)' },
            { value: 'mr-IN', name: 'Marathi (India)' },
            { value: 'ta-IN', name: 'Tamil (India)' },
            { value: 'te-IN', name: 'Telugu (India)' },
            { value: 'nl-NL', name: 'Dutch (Netherlands)' },
            { value: 'ko-KR', name: 'Korean (South Korea)' },
            { value: 'cmn-CN', name: 'Mandarin Chinese (China)' },
            { value: 'pl-PL', name: 'Polish (Poland)' },
            { value: 'ru-RU', name: 'Russian (Russia)' },
            { value: 'th-TH', name: 'Thai (Thailand)' },
        ];
    }




    handleProfileSelect(e) {
        this.selectedProfile = e.target.value;
        this.onProfileChange(this.selectedProfile);
    }

    handleLanguageSelect(e) {
        this.selectedLanguage = e.target.value;
        this.onLanguageChange(this.selectedLanguage);
    }

    handleImageQualitySelect(e) {
        this.selectedImageQuality = e.target.value;
        this.onImageQualityChange(this.selectedImageQuality);
    }

    handleLayoutModeSelect(e) {
        this.layoutMode = e.target.value;
        this.onLayoutModeChange(this.layoutMode);
    }

    async handleCustomPromptInput(e) {
        this.customPrompt = e.target.value;
        await secretSauce.storage.updatePreference('customPrompt', this.customPrompt);
    }

    async handleAudioModeSelect(e) {
        this.audioMode = e.target.value;
        await secretSauce.storage.updatePreference('audioMode', this.audioMode);
        this.requestUpdate();
    }

    async handleThemeChange(e) {
        this.theme = e.target.value;
        await secretSauce.theme.save(this.theme);
        this.updateBackgroundAppearance();
        this.requestUpdate();
    }


    async handleBackgroundTransparencyChange(e) {
        this.backgroundTransparency = parseFloat(e.target.value);
        await secretSauce.storage.updatePreference('backgroundTransparency', this.backgroundTransparency);
        this.updateBackgroundAppearance();
        this.requestUpdate();
    }

    updateBackgroundAppearance() {
        const colors = secretSauce.theme.get(this.theme);
        secretSauce.theme.applyBackgrounds(colors.background, this.backgroundTransparency);
    }

    async handleFontSizeChange(e) {
        this.fontSize = parseInt(e.target.value, 10);
        await secretSauce.storage.updatePreference('fontSize', this.fontSize);
        this.updateFontSize();
        this.requestUpdate();
    }

    updateFontSize() {
        document.documentElement.style.setProperty('--response-font-size', `${this.fontSize}px`);
    }




    async restoreAllSettings() {
        if (this.isRestoring) return;
        this.isRestoring = true;
        this.clearStatusMessage = '';
        this.clearStatusType = '';
        this.requestUpdate();
        try {
            // Restore all preferences to defaults
            const defaults = {
                customPrompt: '',
                selectedProfile: 'interview',
                selectedLanguage: 'en-US',
                selectedScreenshotInterval: '5',
                selectedImageQuality: 'medium',
                audioMode: 'speaker_only',
                transcriptionEngine: 'gemini',
                fontSize: 20,
                backgroundTransparency: 0.8,
                theme: 'dark',
            };
            for (const [key, value] of Object.entries(defaults)) {
                await secretSauce.storage.updatePreference(key, value);
            }

            // Restore keybinds
            this.keybinds = this.getDefaultKeybinds();
            await secretSauce.storage.setKeybinds(null);
            window.electronAPI.send('update-keybinds', this.keybinds);

            // Apply to local state
            this.selectedProfile = defaults.selectedProfile;
            this.selectedLanguage = defaults.selectedLanguage;
            this.selectedImageQuality = defaults.selectedImageQuality;
            this.audioMode = defaults.audioMode;
            this.transcriptionEngine = defaults.transcriptionEngine;
            this.fontSize = defaults.fontSize;
            this.backgroundTransparency = defaults.backgroundTransparency;
            this.customPrompt = defaults.customPrompt;
            this.theme = defaults.theme;

            // Notify parent callbacks
            this.onProfileChange(defaults.selectedProfile);
            this.onLanguageChange(defaults.selectedLanguage);
            this.onImageQualityChange(defaults.selectedImageQuality);

            // Apply visual changes
            this.updateBackgroundAppearance();
            this.updateFontSize();
            await secretSauce.theme.save(defaults.theme);

            this.clearStatusMessage = 'All settings restored to defaults';
            this.clearStatusType = 'success';
        } catch (error) {
            console.error('Error restoring settings:', error);
            this.clearStatusMessage = `Error restoring settings: ${error.message}`;
            this.clearStatusType = 'error';
        } finally {
            this.isRestoring = false;
            this.requestUpdate();
        }
    }

    async clearLocalData() {
        if (this.isClearing) return;
        this.isClearing = true;
        this.clearStatusMessage = '';
        this.clearStatusType = '';
        this.requestUpdate();
        try {
            await secretSauce.storage.clearAll();
            this.clearStatusMessage = 'Successfully cleared all local data';
            this.clearStatusType = 'success';
            this.requestUpdate();
            setTimeout(() => {
                this.clearStatusMessage = 'Closing application...';
                this.requestUpdate();
                setTimeout(async () => {
                    if (window.electronAPI) {
                        await window.electronAPI.invoke('quit-application');
                    }
                }, 1000);
            }, 2000);
        } catch (error) {
            console.error('Error clearing data:', error);
            this.clearStatusMessage = `Error clearing data: ${error.message}`;
            this.clearStatusType = 'error';
        } finally {
            this.isClearing = false;
            this.requestUpdate();
        }
    }

    renderTranscriptionSection() {
        const models = [
            { value: 'tiny.en', label: 'Tiny (Fastest, ~75MB)' },
            { value: 'base.en', label: 'Base (Balanced, ~140MB)' },
            { value: 'small.en', label: 'Small (Better accuracy, ~460MB)' },
        ];

        const isDownloaded = this.whisperStatus[this.whisperModel];

        return html`
            <section class="surface">
                <div class="surface-title">Transcription Engine</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Preferred Engine</label>
                        ${this.mode === 'local' ? html`
                            <div class="control" style="background: var(--bg-hover); display: flex; align-items: center; border-color: transparent; cursor: default;">
                                Whisper Model
                            </div>
                        ` : html`
                            <select class="control" .value=${this.transcriptionEngine} @change=${this.handleTranscriptionEngineChange}>
                                <option value="gemini">Gemini (Cloud - Fast & Accurate)</option>
                                <option value="whisper">Whisper (Local - Private & Offline)</option>
                            </select>
                        `}
                        <p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                            ${this.mode === 'local' 
                                ? 'In Local AI mode, transcription is always handled privately on your device.' 
                                : 'Whisper runs on your device for privacy. Gemini requires cloud connectivity.'}
                        </p>
                    </div>

                        <div class="form-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); flex-direction: column; align-items: stretch;">
                            <label class="form-label" style="margin-bottom: 8px;">Whisper Model (Main Engine)</label>
                            <div class="model-row">
                                <select class="control" style="flex: 1; min-width: 150px;" .value=${this.whisperModel} @change=${this.handleWhisperModelSelect}>
                                    ${models.map(m => html`
                                        <option value=${m.value}>
                                            ${m.label} ${this.whisperStatus[m.value] ? '✓' : ''}
                                        </option>
                                    `)}
                                </select>
                                <div style="display: flex; gap: 8px;">
                                    <button 
                                        class="control" 
                                        style="width: auto; padding: 0 16px; height: 38px; display: flex; align-items: center; justify-content: center; background: ${this.whisperStatus[this.whisperModel] ? 'var(--bg-elevated)' : 'var(--accent)'}; color: ${this.whisperStatus[this.whisperModel] ? 'var(--text-secondary)' : 'var(--btn-primary-text)'}"
                                        @click=${() => this.handleDownloadModel('cpp')}
                                        ?disabled=${this.whisperStatus[this.whisperModel] || (this.downloadProgress > 0 && (this.downloadingModel === this.whisperModel && this.downloadingType === 'cpp'))}
                                    >
                                        ${this.downloadProgress > 0 && this.downloadingModel === this.whisperModel && this.downloadingType === 'cpp'
                                            ? `Downloading ${this.downloadProgress}%` 
                                            : (this.whisperStatus[this.whisperModel] ? 'Downloaded' : 'Download')}
                                    </button>
                                    ${this.whisperStatus[this.whisperModel] ? html`
                                        <button 
                                            class="control" 
                                            style="width: auto; padding: 0 10px; height: 38px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);"
                                            @click=${() => this.handleDeleteModel(this.whisperModel, 'cpp')}
                                            title="Delete Model"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                                ${this.whisperStatus[this.whisperModel] && (this.downloadProgress === 0 || this.downloadingModel !== this.whisperModel || this.downloadingType !== 'cpp')
                                    ? html`<span style="color: var(--success)">● Downloaded</span>. You are ready to use local transcription.` 
                                    : 'Model not found. Download it to enable local transcription.'}
                            </p>
                        </div>

                        <div class="form-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); flex-direction: column; align-items: stretch;">
                            <label class="form-label" style="margin-bottom: 8px;">Transformers Model (Offline Fallback)</label>
                            <div class="model-row">
                                <select class="control" style="flex: 1; min-width: 150px;" .value=${this.transformersModel} @change=${this.handleTransformersModelSelect}>
                                    ${models.map(m => html`
                                        <option value=${m.value}>
                                            ${m.label} ${this.transformersStatus[m.value] ? '✓' : ''}
                                        </option>
                                    `)}
                                </select>
                                <div style="display: flex; gap: 8px;">
                                    <button 
                                        class="control" 
                                        style="width: auto; padding: 0 16px; height: 38px; display: flex; align-items: center; justify-content: center; background: ${this.transformersStatus[this.transformersModel] ? 'var(--bg-elevated)' : 'var(--accent)'}; color: ${this.transformersStatus[this.transformersModel] ? 'var(--text-secondary)' : 'var(--btn-primary-text)'}"
                                        @click=${() => this.handleDownloadModel('transformers')}
                                        ?disabled=${this.transformersStatus[this.transformersModel] || (this.downloadProgress > 0 && (this.downloadingModel === this.transformersModel && this.downloadingType === 'transformers'))}
                                    >
                                        ${this.downloadProgress > 0 && this.downloadingModel === this.transformersModel && this.downloadingType === 'transformers'
                                            ? `Downloading ${this.downloadProgress}%` 
                                            : (this.transformersStatus[this.transformersModel] ? 'Downloaded' : 'Download')}
                                    </button>
                                    ${this.transformersStatus[this.transformersModel] ? html`
                                        <button 
                                            class="control" 
                                            style="width: auto; padding: 0 10px; height: 38px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);"
                                            @click=${() => this.handleDeleteModel(this.transformersModel, 'transformers')}
                                            title="Delete Model"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                                ${this.transformersStatus[this.transformersModel] && (this.downloadProgress === 0 || this.downloadingModel !== this.transformersModel || this.downloadingType !== 'transformers')
                                    ? html`<span style="color: var(--success)">● Downloaded</span>. 100% offline fallback ready.` 
                                    : 'Transformers model not cached. Recommended for privacy & reliability.'}
                            </p>
                        </div>

                </div>
            </section>
        `;
    }

    renderAudioSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Audio Input</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Audio Mode</label>
                        <select class="control" .value=${this.audioMode} @change=${this.handleAudioModeSelect}>
                            <option value="speaker_only">Speaker Only (Interviewer)</option>
                            <option value="mic_only">Microphone Only (Me)</option>
                            <option value="both">Both Speaker and Microphone</option>
                        </select>
                    </div>
                    ${this.audioMode !== 'speaker_only'
                        ? html` <div class="warning-callout">May cause unexpected behavior. Only change this if you know what you're doing.</div> `
                        : ''}
                    <div class="form-group">
                        <label class="form-label">Image Quality</label>
                        <select class="control" .value=${this.selectedImageQuality} @change=${this.handleImageQualitySelect}>
                            <option value="high">High Quality</option>
                            <option value="medium">Medium Quality</option>
                            <option value="low">Low Quality</option>
                        </select>
                    </div>
                </div>
            </section>
        `;
    }

    renderLanguageSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Language</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Speech Language</label>
                        <select class="control" .value=${this.selectedLanguage} @change=${this.handleLanguageSelect}>
                            ${this.getLanguages().map(language => html`<option value=${language.value}>${language.name}</option>`)}
                        </select>
                    </div>
                </div>
            </section>
        `;
    }

    renderAppearanceSection() {
        return html`
            <section class="surface">
                <div class="surface-title">Appearance</div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Theme</label>
                        <select class="control" .value=${this.theme} @change=${this.handleThemeChange}>
                            ${this.getThemes().map(theme => html`<option value=${theme.value}>${theme.name}</option>`)}
                        </select>
                    </div>
                    <div class="form-group slider-wrap">
                        <div class="slider-header">
                            <label class="form-label">Background Transparency</label>
                            <span class="slider-value">${Math.round(this.backgroundTransparency * 100)}%</span>
                        </div>
                        <input
                            class="slider-input"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            .value=${this.backgroundTransparency}
                            @input=${this.handleBackgroundTransparencyChange}
                        />
                    </div>
                    <div class="form-group slider-wrap">
                        <div class="slider-header">
                            <label class="form-label">Response Font Size</label>
                            <span class="slider-value">${this.fontSize}px</span>
                        </div>
                        <input
                            class="slider-input"
                            type="range"
                            min="12"
                            max="32"
                            step="1"
                            .value=${this.fontSize}
                            @input=${this.handleFontSizeChange}
                        />
                    </div>
                </div>
            </section>
        `;
    }

    renderKeyboardSection() {
        return html`
        `;
    }


    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-header">
                        <div class="page-title-group">
                            <div class="page-title">Settings</div>
                        </div>
                        <button class="danger-button" @click=${this.restoreAllSettings} ?disabled=${this.isRestoring}>
                            ${this.isRestoring ? 'Restoring...' : 'Restore all settings'}
                        </button>
                    </div>

                    ${this.clearStatusMessage
                        ? html` <div class="status ${this.clearStatusType === 'success' ? 'success' : 'error'}" style="margin-bottom: 20px;">${this.clearStatusMessage}</div> `
                        : ''}

                    ${this.renderTranscriptionSection()}
                    ${this.renderAudioSection()} 
                    ${this.renderLanguageSection()} 
                    ${this.renderAppearanceSection()}
                </div>
            </div>
        `;
    }
}

customElements.define('customize-view', CustomizeView);
