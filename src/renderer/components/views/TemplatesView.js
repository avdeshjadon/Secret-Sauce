import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class TemplatesView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .templates-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: var(--space-md);
            }
            .template-card {
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
                transition: border-color var(--transition);
                cursor: pointer;
            }
            .template-card:hover {
                border-color: var(--accent);
            }
            .template-card.active {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.05);
            }
            .template-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .template-name {
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
            }
            .template-preview {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                line-height: 1.5;
            }
            .template-actions {
                display: flex;
                gap: var(--space-sm);
                margin-top: auto;
                padding-top: var(--space-sm);
            }
            .action-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 4px;
                border-radius: var(--radius-sm);
                transition: all var(--transition);
            }
            .action-btn:hover {
                color: var(--text-primary);
                background: var(--bg-hover);
            }
            .action-btn.delete:hover {
                color: var(--danger);
                background: rgba(239, 68, 68, 0.1);
            }
            .editor-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: var(--space-xl);
            }
            .editor-card {
                background: var(--bg-app);
                border: 1px solid var(--border);
                border-radius: var(--radius-lg);
                width: 100%;
                max-width: 600px;
                padding: var(--space-lg);
                display: flex;
                flex-direction: column;
                gap: var(--space-md);
            }
            .editor-footer {
                display: flex;
                justify-content: flex-end;
                gap: var(--space-sm);
            }
            .btn {
                padding: 8px 16px;
                border-radius: var(--radius-md);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                transition: all var(--transition);
            }
            .btn-primary {
                background: var(--accent);
                color: var(--btn-primary-text);
                border: none;
            }
            .btn-primary:hover {
                background: var(--accent-hover);
            }
            .btn-secondary {
                background: transparent;
                border: 1px solid var(--border);
                color: var(--text-primary);
            }
            .btn-secondary:hover {
                background: var(--bg-hover);
            }
        `,
    ];

    static properties = {
        templates: { type: Array },
        activeTemplateId: { type: String },
        editingTemplate: { type: Object },
        isEditing: { type: Boolean },
    };

    constructor() {
        super();
        this.templates = [];
        this.activeTemplateId = null;
        this.editingTemplate = null;
        this.isEditing = false;
        this.loadTemplates();
    }

    async loadTemplates() {
        try {
            const prefs = await secretSauce.storage.getPreferences();
            this.templates = prefs.templates || [
                {
                    id: 'default-interview',
                    name: 'Standard Interview',
                    content:
                        'Act as a senior software engineer conducting a technical interview. Focus on clean code, architecture, and problem-solving.',
                },
                {
                    id: 'default-sales',
                    name: 'Sales Closer',
                    content:
                        'Act as a professional sales consultant. Help identify pain points and suggest appropriate solutions based on the conversation.',
                },
            ];
            this.activeTemplateId = prefs.activeTemplateId || (this.templates.length > 0 ? this.templates[0].id : null);
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    async saveTemplates() {
        await secretSauce.storage.updatePreference('templates', this.templates);
        await secretSauce.storage.updatePreference('activeTemplateId', this.activeTemplateId);

        // Also update the legacy customPrompt for backward compatibility
        const active = this.templates.find(t => t.id === this.activeTemplateId);
        if (active) {
            await secretSauce.storage.updatePreference('customPrompt', active.content);
        }
    }

    handleSelect(id) {
        this.activeTemplateId = id;
        this.saveTemplates();
        this.requestUpdate();
    }

    handleEdit(e, template) {
        e.stopPropagation();
        this.editingTemplate = { ...template };
        this.isEditing = true;
    }

    handleDelete(e, id) {
        e.stopPropagation();
        if (confirm('Delete this template?')) {
            this.templates = this.templates.filter(t => t.id !== id);
            if (this.activeTemplateId === id) {
                this.activeTemplateId = this.templates.length > 0 ? this.templates[0].id : null;
            }
            this.saveTemplates();
            this.requestUpdate();
        }
    }

    handleAddNew() {
        this.editingTemplate = { id: Date.now().toString(), name: '', content: '' };
        this.isEditing = true;
    }

    handleSaveEdit() {
        const index = this.templates.findIndex(t => t.id === this.editingTemplate.id);
        if (index > -1) {
            this.templates[index] = this.editingTemplate;
        } else {
            this.templates.push(this.editingTemplate);
        }
        if (!this.activeTemplateId) this.activeTemplateId = this.editingTemplate.id;
        this.saveTemplates();
        this.isEditing = false;
        this.requestUpdate();
    }

    renderEditor() {
        if (!this.isEditing) return '';
        return html`
            <div class="editor-overlay">
                <div class="editor-card">
                    <div class="surface-title">${this.editingTemplate.name ? 'Edit Template' : 'New Template'}</div>
                    <div class="form-group vertical">
                        <label class="form-label">Template Name</label>
                        <input
                            type="text"
                            class="control"
                            style="width: 100%;"
                            .value=${this.editingTemplate.name}
                            @input=${e => (this.editingTemplate.name = e.target.value)}
                            placeholder="e.g. Frontend Interview"
                        />
                    </div>
                    <div class="form-group vertical">
                        <label class="form-label">System Instructions</label>
                        <textarea
                            class="control"
                            .value=${this.editingTemplate.content}
                            @input=${e => (this.editingTemplate.content = e.target.value)}
                            placeholder="Instructions for the AI..."
                        ></textarea>
                    </div>
                    <div class="editor-footer">
                        <button class="btn btn-secondary" @click=${() => (this.isEditing = false)}>Cancel</button>
                        <button class="btn btn-primary" @click=${this.handleSaveEdit}>Save Template</button>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div class="page-title">Quick Templates</div>
                            <div class="page-subtitle">Manage system prompts for different scenarios</div>
                        </div>
                        <button class="btn btn-primary" @click=${this.handleAddNew}>+ New Template</button>
                    </div>

                    <div class="templates-grid">
                        ${this.templates.map(
                            t => html`
                                <div class="template-card ${this.activeTemplateId === t.id ? 'active' : ''}" @click=${() => this.handleSelect(t.id)}>
                                    <div class="template-header">
                                        <span class="template-name">${t.name}</span>
                                        ${this.activeTemplateId === t.id
                                            ? html`<span class="chip" style="background: var(--accent); color: var(--btn-primary-text);">Active</span>`
                                            : ''}
                                    </div>
                                    <div class="template-preview">${t.content}</div>
                                    <div class="template-actions">
                                        <button class="action-btn" title="Edit" @click=${e => this.handleEdit(e, t)}>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                            </svg>
                                        </button>
                                        <button class="action-btn delete" title="Delete" @click=${e => this.handleDelete(e, t.id)}>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <polyline points="3 6 5 6 21 6"></polyline>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            `
                        )}
                    </div>
                </div>
            </div>
            ${this.renderEditor()}
        `;
    }
}

customElements.define('templates-view', TemplatesView);
