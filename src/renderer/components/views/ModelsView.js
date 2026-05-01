import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class ModelsView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .model-section {
                margin-bottom: var(--space-xl);
            }
            .section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: var(--space-md);
            }
            .model-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: var(--space-md);
            }
            .model-card {
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
                position: relative;
                overflow: hidden;
            }
            .model-info {
                flex: 1;
            }
            .model-name {
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
                font-size: var(--font-size-md);
                margin-bottom: 4px;
            }
            .model-meta {
                font-size: 11px;
                color: var(--text-muted);
                display: flex;
                gap: 12px;
            }
            .model-desc {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                margin: 8px 0;
                line-height: 1.4;
            }
            .actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            .btn {
                padding: 6px 12px;
                border-radius: var(--radius-sm);
                font-size: 11px;
                font-weight: var(--font-weight-bold);
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid var(--border);
                background: var(--bg-elevated);
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .btn:hover:not(:disabled) {
                background: var(--bg-hover);
                border-color: var(--accent);
            }
            .btn.primary {
                background: var(--accent);
                color: var(--btn-primary-text);
                border: none;
            }
            .btn.danger {
                color: #f87171;
                border-color: rgba(248, 113, 113, 0.2);
            }
            .btn.danger:hover {
                background: rgba(248, 113, 113, 0.1);
                border-color: #f87171;
            }
            .btn.success {
                background: rgba(34, 197, 94, 0.1);
                color: #4ade80;
                border-color: rgba(34, 197, 94, 0.2);
                cursor: default;
            }
            .progress-bar {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: var(--accent);
                transition: width 0.3s;
            }
            .tab-nav {
                display: flex;
                gap: 20px;
                border-bottom: 1px solid var(--border);
                margin-bottom: 24px;
            }
            .tab-item {
                padding: 10px 0;
                color: var(--text-muted);
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                position: relative;
            }
            .tab-item.active {
                color: var(--accent);
            }
            .tab-item.active::after {
                content: '';
                position: absolute;
                bottom: -1px;
                left: 0;
                right: 0;
                height: 2px;
                background: var(--accent);
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
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.6; }
                100% { opacity: 1; }
            }
            .pulse {
                animation: pulse 1.5s infinite ease-in-out;
            }
            .spinner {
                width: 12px;
                height: 12px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 0.8s linear infinite;
                display: inline-block;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `,
    ];

    static properties = {
        whisperModels: { type: Array },
        ollamaModels: { type: Array },
        whisperStatus: { type: Object },
        transformersStatus: { type: Object },
        downloadingModel: { type: String },
        downloadingEngine: { type: String },
        downloadProgress: { type: Number },
        isDownloadingAll: { type: Boolean },
        isBulkPaused: { type: Boolean },
        partialDownloads: { type: Object },
        modelProgressMap: { type: Object },
        activeTab: { type: String },
    };

    constructor() {
        super();
        this.activeTab = 'cpp';
        this.whisperModels = [
            { id: 'tiny.en', name: 'Tiny', size: '75MB', desc: 'Fastest, low accuracy.' },
            { id: 'base.en', name: 'Base', size: '140MB', desc: 'Balanced speed and accuracy.' },
            { id: 'small.en', name: 'Small', size: '460MB', desc: 'Good accuracy for daily use.' },
        ];
        this.recommendedOllama = [
            { id: 'gemma3:4b', name: 'Gemma 3 (4B)', desc: 'Fast, multimodal (Recommended for screenshots).' },
            { id: 'llama3:8b', name: 'Llama 3 (8B)', desc: 'Powerful for complex reasoning and text analysis.' }
        ];
        this.ollamaModels = [];
        this.whisperStatus = {};
        this.transformersStatus = {};
        this.downloadingModel = '';
        this.downloadingEngine = '';
        this.downloadProgress = 0;
        this.isDownloadingAll = false;
        this.isBulkPaused = false;
        this.partialDownloads = {};
        this.modelProgressMap = {};
        this._unsubProgress = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._refreshAll();
        this._unsubProgress = window.secretSauce.on('whisper-download-progress', (data) => {
            this._handleProgress(data);
        });
    }

    _handleProgress(data) {
        const engine = data.type || 'cpp'; // 'cpp', 'transformers', 'ollama'
        const key = `${engine}:${data.model}`;
        
        // For transformers, avoid flickering by not letting progress go backwards
        if (engine === 'transformers') {
            const currentMax = this.modelProgressMap[key] || 0;
            // Only update if progress is increasing, or if it's 100% (completion)
            if (data.progress < currentMax && data.progress < 100) {
                return; 
            }
        }
        
        if (data.model) {
            this.modelProgressMap = { ...this.modelProgressMap, [key]: data.progress };
        }
        
        if (data.model === this.downloadingModel && engine === this.downloadingEngine) {
            this.downloadProgress = data.progress;
            this.requestUpdate();
        }
        
        if (data.progress === 100) {
            setTimeout(() => this._refreshAll(), 1000);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubProgress) this._unsubProgress();
    }

    async _refreshAll() {
        await Promise.all([
            this._checkWhisperModels(),
            this._checkTransformersModels(),
            this._fetchOllamaModels(),
            this._checkPartialDownloads()
        ]);
    }

    async _checkPartialDownloads() {
        const partials = {};
        for (const m of this.whisperModels) {
            partials[m.id] = await window.secretSauce.invoke('check-whisper-partial-exists', m.id);
        }
        this.partialDownloads = partials;
        this.requestUpdate();
    }

    async _checkWhisperModels() {
        const status = {};
        for (const m of this.whisperModels) {
            status[m.id] = await window.secretSauce.invoke('check-whisper-model-exists', m.id);
        }
        this.whisperStatus = status;
        this.requestUpdate();
    }

    async _checkTransformersModels() {
        const status = {};
        for (const m of this.whisperModels) {
            status[m.id] = await window.secretSauce.invoke('check-transformers-model-exists', m.id);
        }
        console.log('Transformers Status Update:', status);
        this.transformersStatus = { ...status };
        this.requestUpdate();
    }

    async _fetchOllamaModels() {
        const result = await window.secretSauce.invoke('list-local-models');
        if (result.success) {
            this.ollamaModels = result.models;
        }
    }

    async _downloadModel(modelId, engine = 'cpp') {
        if (this.downloadingModel && this.downloadingModel === modelId && this.downloadingEngine === engine) return;
        
        this.downloadingModel = modelId;
        this.downloadingEngine = engine;
        
        const key = `${engine}:${modelId}`;
        // Reset progress map for new download to avoid using old cached progress
        this.modelProgressMap = { ...this.modelProgressMap, [key]: 0 };
        this.downloadProgress = 0;
        
        try {
            let channel = 'download-whisper-model';
            if (engine === 'transformers') channel = 'download-transformers-model';
            if (engine === 'ollama') channel = 'pull-ollama-model';

            const result = await window.secretSauce.invoke(channel, modelId);
            
            if (result.success) {
                await this._refreshAll();
            } else if (result.paused) {
                console.log(`Download paused for ${modelId}`);
                return { paused: true };
            } else {
                await window.secretSauce.alert(`${engine.toUpperCase()} Download failed: ${result.error}`, 'Download Error');
            }
        } catch (err) {
            console.error(`Error in _downloadModel (${engine}):`, err);
            await window.secretSauce.alert(`System error: ${err.message}`, 'System Error');
        } finally {
            if (!this.isDownloadingAll) {
                this.downloadingModel = '';
                this.downloadingEngine = '';
                this.downloadProgress = 0;
            }
            await this._checkPartialDownloads();
            this.requestUpdate();
        }
        return { success: true };
    }

    async _pauseDownload(modelId, engine = 'cpp', isBulkAction = false) {
        if (engine === 'cpp') {
            await window.secretSauce.invoke('pause-whisper-download', modelId);
        }
        if (isBulkAction) {
            this.isBulkPaused = true;
            this.isDownloadingAll = false;
        }
        this.downloadingModel = '';
        this.downloadingEngine = '';
        this.downloadProgress = 0;
        await this._checkPartialDownloads();
        this.requestUpdate();
    }

    async _deleteModel(modelId, engine = 'cpp') {
        const confirmed = await window.secretSauce.confirm(`Are you sure you want to delete ${modelId} (${engine})?`, 'Delete Model');
        if (!confirmed) return;
        
        let result;
        if (engine === 'cpp') {
            result = await window.secretSauce.invoke('delete-whisper-model', modelId);
        } else if (engine === 'transformers') {
            result = await window.secretSauce.invoke('clear-transformers-model-cache', modelId);
        } else if (engine === 'ollama') {
            result = await window.secretSauce.invoke('delete-ollama-model', modelId);
        }
        
        if (result?.success) {
            await this._refreshAll();
        } else {
            await window.secretSauce.alert(`Failed to delete: ${result?.error || 'Unknown error'}`, 'Error');
        }
    }

    async _clearAll() {
        const confirmed = await window.secretSauce.confirm('This will delete ALL local models (Whisper & Transformers) and logs. Are you sure?', 'Clear Data');
        if (!confirmed) return;
        await window.secretSauce.invoke('clear-all-local-data');
        await this._refreshAll();
    }

    async handleDownloadAllModels() {
        if (this.isDownloadingAll) return;

        // 1. Check Ollama Status
        const ollamaCheck = await window.secretSauce.invoke('list-local-models');
        const isOllamaRunning = ollamaCheck.success;
        const localOllamaNames = isOllamaRunning ? (ollamaCheck.models || []).map(m => m.name) : [];

        const platform = await window.secretSauce.invoke('get-platform');
        let ollamaTip = '';
        if (platform === 'darwin') ollamaTip = 'On macOS, make sure the Ollama app is open.';
        else if (platform === 'win32') ollamaTip = 'On Windows, ensure Ollama is running in your system tray.';
        else ollamaTip = 'On Linux, ensure the ollama service is active.';

        let message = '';
        let title = '';
        
        if (isOllamaRunning) {
            message = `Ollama is running! This will download all missing models (6 Whisper, 6 Transformers, and 2 Reasoning models) for a complete offline experience (~8GB total). Skip existing models?`;
            title = 'Bulk Download (Full Setup)';
        } else {
            message = `Ollama is NOT running. ${ollamaTip}\n\nOllama is required for reasoning models (Gemma/Llama). However, you can continue to download all missing Whisper & Transformers models (~6GB total). Proceed?`;
            title = 'Bulk Download (Transcription Only)';
        }

        const confirmed = await window.secretSauce.confirm(message, title);
        if (!confirmed) return;

        this.isDownloadingAll = true;
        this.isBulkPaused = false;
        this.requestUpdate();

        try {
            const whisperIds = this.whisperModels.map(m => m.id);
            const ollamaIds = this.recommendedOllama.map(m => m.id);

            // 1. Whisper CPP
            for (const m of whisperIds) {
                if (this.isBulkPaused) break;
                if (this.whisperStatus[m]) continue;
                const res = await this._downloadModel(m, 'cpp');
                if (res?.paused) continue; // Move to next model if this one was paused individually
                await this._checkWhisperModels();
            }

            // 2. Transformers
            for (const m of whisperIds) {
                if (this.isBulkPaused) break;
                if (this.transformersStatus[m]) continue;
                const res = await this._downloadModel(m, 'transformers');
                if (res?.paused) continue;
                await this._checkTransformersModels();
            }

            // 3. Ollama (if running)
            if (isOllamaRunning) {
                for (const mId of ollamaIds) {
                    if (this.isBulkPaused) break;
                    if (localOllamaNames.some(ln => ln.includes(mId))) continue;
                    const res = await this._downloadModel(mId, 'ollama');
                    if (res?.paused) continue;
                    await this._fetchOllamaModels();
                }
            }

            if (!this.isBulkPaused) {
                await window.secretSauce.alert('All requested models are now available!', 'Bulk Setup Complete');
                this.isDownloadingAll = false;
            }
        } catch (err) {
            await window.secretSauce.alert('Bulk download encountered an error: ' + err.message, 'Error');
            this.isDownloadingAll = false;
        } finally {
            this.downloadingModel = '';
            this.downloadProgress = 0;
            await this._refreshAll();
        }
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-header">
                        <div class="page-title-group">
                            <div class="page-title">Model Manager</div>
                            <div class="page-subtitle">Manage local AI assets for transcription and reasoning</div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            ${this.isDownloadingAll && (this.downloadingEngine === 'transformers' || this.downloadingEngine === 'ollama') ? html`
                                <button class="btn" style="padding: 0 20px; height: 32px; cursor: default; border-color: var(--accent); color: var(--accent);" disabled>
                                    Bulk Progress: ${Math.round(((this.whisperModels.filter(m => this.whisperStatus[m.id]).length + this.whisperModels.filter(m => this.transformersStatus[m.id]).length) / (this.whisperModels.length * 2)) * 100)}%
                                </button>
                            ` : html`
                                <button 
                                    class="btn primary" 
                                    style="padding: 0 20px; height: 32px;"
                                    @click=${this.isDownloadingAll ? () => this._pauseDownload(this.downloadingModel, this.downloadingEngine, true) : this.handleDownloadAllModels} 
                                >
                                    ${this.isDownloadingAll ? `Pause Bulk (${Math.round(((this.whisperModels.filter(m => this.whisperStatus[m.id]).length + this.whisperModels.filter(m => this.transformersStatus[m.id]).length) / (this.whisperModels.length * 2)) * 100)}%)` : (this.isBulkPaused ? 'Resume Bulk Download' : 'Download All Models')}
                                </button>
                            `}
                            <button class="btn danger" style="height: 32px;" @click=${this._clearAll}>Clear All Local Data</button>
                        </div>
                    </div>

                    <div class="tab-nav">
                        <div class="tab-item ${this.activeTab === 'cpp' ? 'active' : ''}" @click=${() => this.activeTab = 'cpp'}>Whisper.cpp (Recommended)</div>
                        <div class="tab-item ${this.activeTab === 'transformers' ? 'active' : ''}" @click=${() => this.activeTab = 'transformers'}>Transformers Fallback</div>
                        <div class="tab-item ${this.activeTab === 'ollama' ? 'active' : ''}" @click=${() => this.activeTab = 'ollama'}>Ollama Reasoning</div>
                    </div>

                    ${this.activeTab === 'cpp' ? this.renderCppTab() : ''}
                    ${this.activeTab === 'transformers' ? this.renderTransformersTab() : ''}
                    ${this.activeTab === 'ollama' ? this.renderOllamaTab() : ''}
                </div>
            </div>
        `;
    }

    renderCppTab() {
        return html`
            <div class="model-section">
                <div class="section-header">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 18px;">Whisper.cpp Models</h2>
                        <p style="font-size: 12px; color: var(--text-muted);">High performance models using GGML format</p>
                    </div>
                </div>
                <div class="model-grid">
                    ${this.whisperModels.map(m => {
                        const isDownloading = this.downloadingModel === m.id && this.downloadingEngine === 'cpp';
                        const isDownloaded = this.whisperStatus[m.id] && !isDownloading;
                        const key = `cpp:${m.id}`;
                        return html`
                            <div class="model-card ${isDownloaded ? 'downloaded' : ''}">
                                <div class="model-info">
                                    <div class="model-name">${m.name}</div>
                                    <div class="model-meta"><span>${m.size}</span><span>GGUF/GGML</span></div>
                                    <p class="model-desc">${m.desc}</p>
                                </div>
                                <div class="actions">
                                    ${isDownloaded ? html`
                                        <button class="btn success" disabled>✓ Downloaded</button>
                                        <button class="btn danger" @click=${() => this._deleteModel(m.id, 'cpp')}>Delete</button>
                                    ` : html`
                                        ${isDownloading ? html`
                                            <button class="btn" @click=${() => this._pauseDownload(m.id, 'cpp')}>Pause ${this.downloadProgress}%</button>
                                        ` : html`
                                            <button class="btn primary" @click=${() => this._downloadModel(m.id, 'cpp')} ?disabled=${this.downloadingModel && !isDownloading}>
                                                ${(this.partialDownloads && this.partialDownloads[m.id]) || this.modelProgressMap[key] ? 'Resume Download' : 'Download'}
                                            </button>
                                        `}
                                    `}
                                </div>
                                ${isDownloading ? html`<div class="progress-bar" style="width: ${this.downloadProgress}%"></div>` : ''}
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    renderTransformersTab() {
        return html`
            <div class="model-section">
                <div class="section-header">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 18px;">Transformers.js Models</h2>
                        <p style="font-size: 12px; color: var(--text-muted);">Backup models used if whisper.cpp fails</p>
                    </div>
                </div>
                <div class="model-grid">
                    ${this.whisperModels.map(m => {
                        const isDownloading = this.downloadingModel === m.id && this.downloadingEngine === 'transformers';
                        const isDownloaded = this.transformersStatus[m.id] && !isDownloading;
                        return html`
                            <div class="model-card ${isDownloaded ? 'downloaded' : ''}">
                                <div class="model-info">
                                    <div class="model-name">${m.name} (ONNX)</div>
                                    <div class="model-meta"><span>~${m.size}</span><span>ONNX (FP16/Q8)</span></div>
                                    <p class="model-desc">Standard backup model for cross-platform support.</p>
                                </div>
                                <div class="actions">
                                    ${isDownloaded ? html`
                                         <button class="btn success" disabled>✓ Downloaded</button>
                                         <button class="btn danger" @click=${() => this._deleteModel(m.id, 'transformers')}>Delete</button>
                                     ` : html`
                                         <button class="btn primary ${isDownloading ? 'pulse' : ''}" @click=${() => this._downloadModel(m.id, 'transformers')} ?disabled=${this.downloadingModel}>
                                             ${isDownloading ? html`<span class="spinner"></span> <span style="margin-left: 6px;">Downloading...</span>` : 'Download Fallback'}
                                         </button>
                                     `}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    renderOllamaTab() {
        const localNames = this.ollamaModels.map(m => m.name);
        const isMac = (window.secretSauce && window.secretSauce.isMacOS) || navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isWin = navigator.platform.toUpperCase().indexOf('WIN') >= 0;
        const isLinux = navigator.platform.toUpperCase().indexOf('LINUX') >= 0;

        let installCmd = 'brew install ollama';
        let installMethod = 'Terminal (Homebrew required)';
        if (isWin) {
            installCmd = 'winget install ollama.ollama';
            installMethod = 'Terminal (Winget)';
        } else if (isLinux) {
            installCmd = 'curl -fsSL https://ollama.com/install.sh | sh';
            installMethod = 'Terminal (Curl)';
        }

        return html`
            <div class="model-section">
                <div style="margin-bottom: 24px; padding: 16px; background: rgba(63, 125, 229, 0.05); border: 1px solid rgba(63, 125, 229, 0.2); border-radius: var(--radius-md);">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <div style="flex: 1;">
                            <div style="color: var(--text-primary); font-weight: 600; margin-bottom: 4px;">Ollama Setup Required</div>
                            <div style="color: var(--text-secondary); font-size: 13px; line-height: 1.5;">
                                Ollama must be installed and running on your machine to use local models. 
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                                <div>
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">1. Install Ollama (${installMethod})</div>
                                    <code style="display: block; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${installCmd}">${installCmd}</code>
                                </div>
                                <div>
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">2. Start Server</div>
                                    <code style="display: block; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; color: var(--accent);">ollama serve</code>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="section-header">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 18px;">Recommended Models</h2>
                        <p style="font-size: 12px; color: var(--text-muted);">Fast models for chat and summaries</p>
                    </div>
                </div>
                <div class="model-grid">
                    ${this.recommendedOllama.map(m => {
                        const isDownloaded = localNames.some(ln => ln.includes(m.id));
                        const isDownloading = this.downloadingModel === m.id;
                        return html`
                            <div class="model-card ${isDownloaded ? 'downloaded' : ''}">
                                <div class="model-info">
                                    <div class="model-name">${m.name}</div>
                                    <div class="model-meta"><span>Ollama</span></div>
                                    <p class="model-desc">${m.desc}</p>
                                </div>
                                <div class="actions">
                                    ${isDownloaded ? html`
                                        <button class="btn success" disabled>✓ Downloaded</button>
                                        <button class="btn danger" @click=${() => this._deleteModel(m.id, 'ollama')}>Delete</button>
                                    ` : html`
                                        <button class="btn primary" @click=${() => this._downloadModel(m.id, 'ollama')} ?disabled=${this.downloadingModel}>
                                            ${isDownloading ? `Pulling ${this.downloadProgress}%` : 'Download'}
                                        </button>
                                    `}
                                </div>
                                ${isDownloading ? html`<div class="progress-bar" style="width: ${this.downloadProgress}%"></div>` : ''}
                            </div>
                        `;
                    })}
                </div>

                <div class="section-header" style="margin-top: 32px;">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 18px;">Other Local Models</h2>
                        <p style="font-size: 12px; color: var(--text-muted);">Existing models in your Ollama library</p>
                    </div>
                    <button class="btn" @click=${this._fetchOllamaModels}>Refresh List</button>
                </div>
                <div class="model-grid">
                    ${this.ollamaModels.filter(m => !this.recommendedOllama.some(r => m.name.includes(r.id))).length === 0 ? html`
                        <div style="color: var(--text-muted); font-size: 13px; grid-column: 1/-1; padding: 20px; border: 1px dashed var(--border); border-radius: 8px; text-align: center;">
                            No other models found.
                        </div>
                    ` : this.ollamaModels.filter(m => !this.recommendedOllama.some(r => m.name.includes(r.id))).map(m => html`
                        <div class="model-card downloaded">
                            <div class="model-info">
                                <div class="model-name">${m.name}</div>
                                <div class="model-meta"><span>${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB</span></div>
                            </div>
                            <div class="actions">
                                <button class="btn danger" @click=${() => this._deleteModel(m.name, 'ollama')}>Delete</button>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('models-view', ModelsView);
