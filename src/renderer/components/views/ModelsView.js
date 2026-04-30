import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class ModelsView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .model-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
                transition: border-color 0.2s;
            }
            .model-card:hover {
                border-color: var(--text-muted);
            }
            .model-card.active {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.05);
            }
            .model-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .model-name {
                font-weight: var(--font-weight-semibold);
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .status-badge {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: var(--font-weight-bold);
                text-transform: uppercase;
            }
            .status-online {
                background: rgba(34, 197, 94, 0.2);
                color: #4ade80;
            }
            .status-offline {
                background: rgba(156, 163, 175, 0.2);
                color: #9ca3af;
            }

            .model-desc {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                line-height: 1.4;
            }
            .model-footer {
                margin-top: auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 11px;
            }
            .provider-tag {
                color: var(--text-muted);
                font-family: var(--font-mono);
            }
        `,
    ];

    static properties = {
        models: { type: Array },
    };

    constructor() {
        super();
        this.models = [
            {
                id: 'gemini-1.5-flash',
                name: 'Gemini 1.5 Flash',
                provider: 'Google',
                status: 'online',
                desc: 'Fast and versatile model, perfect for real-time transcription and analysis.',
            },
            {
                id: 'gemini-1.5-pro',
                name: 'Gemini 1.5 Pro',
                provider: 'Google',
                status: 'online',
                desc: 'Highly capable model for complex reasoning and deep technical questions.',
            },
            {
                id: 'gemma-2b',
                name: 'Gemma 2B',
                provider: 'Google',
                status: 'online',
                desc: 'Lightweight local model optimized for speed and privacy.',
            },
            {
                id: 'llama-3.1',
                name: 'Llama 3.1',
                provider: 'Ollama',
                status: 'offline',
                desc: 'Powerful open-source model running locally via Ollama.',
            },
            {
                id: 'groq-llama-3',
                name: 'Llama 3 (Groq)',
                provider: 'Groq',
                status: 'online',
                desc: 'Ultra-fast inference using Groq LPU technology.',
            },
        ];
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">AI Models</div>
                    <div class="page-subtitle">Configure and manage your AI providers and models</div>

                    <div class="model-grid">
                        ${this.models.map(
                            m => html`
                                <div class="model-card ${m.status === 'online' ? 'active' : ''}">
                                    <div class="model-header">
                                        <div class="model-name">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                            >
                                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                                            </svg>
                                            ${m.name}
                                        </div>
                                        <span class="status-badge ${m.status === 'online' ? 'status-online' : 'status-offline'}"> ${m.status} </span>
                                    </div>
                                    <p class="model-desc">${m.desc}</p>
                                    <div class="model-footer">
                                        <span class="provider-tag">${m.provider}</span>
                                        ${m.status === 'online' ? html`<span style="color: var(--accent)">Active</span>` : ''}
                                    </div>
                                </div>
                            `
                        )}
                    </div>

                    <section class="surface" style="margin-top: var(--space-xl)">
                        <div class="surface-title">Model Configuration</div>
                        <p class="page-subtitle">You can switch models in the Settings tab or via the New Session profile selection.</p>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('models-view', ModelsView);
