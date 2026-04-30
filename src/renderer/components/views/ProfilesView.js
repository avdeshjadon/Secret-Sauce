import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class ProfilesView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
        .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: var(--space-md);
            animation: fadeInUp 0.6s ease-out;
        }

        .profile-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 10px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 6px;
            position: relative;
            overflow: hidden;
        }

        .profile-card:hover {
            border-color: var(--accent);
            background: var(--bg-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .profile-card.active {
            border-color: var(--accent);
            background: rgba(6, 182, 212, 0.03);
        }

        .profile-card.active::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 20px;
            height: 20px;
            background: var(--accent);
            clip-path: polygon(100% 0, 0 0, 100% 100%);
            opacity: 0.15;
        }

        .icon-box {
            width: 28px;
            height: 28px;
            border-radius: 4px;
            background: var(--bg-elevated);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
        }

        .profile-card:hover .icon-box {
            background: var(--accent);
            color: white;
        }

        .profile-card.active .icon-box {
            background: var(--accent);
            color: white;
        }

        .icon-box svg {
            width: 14px;
            height: 14px;
        }

        .profile-info h3 {
            font-size: 12px;
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            margin-bottom: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .profile-info p {
            font-size: 10px;
            color: var(--text-muted);
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .status-badge {
            align-self: flex-start;
            font-size: 8px;
            font-weight: var(--font-weight-bold);
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 4px;
            background: var(--bg-elevated);
            color: var(--text-muted);
        }

        .profile-card.active .status-badge {
            background: var(--accent);
            color: white;
        }

        @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `,
    ];

    static properties = {
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        getProfileIcon: { type: Function },
        getProfileLabel: { type: Function },
    };

    render() {
        const profiles = [
            { id: 'interview', desc: 'Discreet on-screen teleprompter for technical and behavioral interviews. Keeps your answers concise and direct.' },
            { id: 'sales', desc: 'Real-time objection handling, value propositions, and closing tactics for high-stakes sales calls.' },
            { id: 'meeting', desc: 'Live meeting assistant for transcription, action items, and summarizing group discussions.' },
            { id: 'presentation', desc: 'Speaker notes, timing cues, and audience engagement tips for your slides and decks.' },
            { id: 'negotiation', desc: 'Strategic advice for salary, contract, or deal negotiations. Helps you maintain leverage.' },
            { id: 'exam', desc: 'Fast, accurate answers for certifications and academic tests. Focuses on speed and correct choices.' },
        ];

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Active Profiles</div>
                    <div class="page-subtitle">Switch your AI's persona and logic to match your current situation.</div>

                    <div class="grid" style="margin-top: var(--space-md);">
                        ${profiles.map(
                            p => html`
                                <div class="profile-card ${this.selectedProfile === p.id ? 'active' : ''}" @click=${() => this.onProfileChange(p.id)}>
                                    <div class="icon-box">
                                        ${this.getProfileIcon(p.id)}
                                    </div>
                                    <div class="profile-info">
                                        <h3>${this._getProfileLabel(p.id)}</h3>
                                        <p>${p.desc}</p>
                                    </div>
                                    <div class="status-badge">${this.selectedProfile === p.id ? 'Active' : 'Select'}</div>
                                </div>
                            `
                        )}
                    </div>
                </div>
            </div>
        `;
    }

    _getProfileLabel(p) {
        if (this.getProfileLabel) return this.getProfileLabel(p);
        const labels = { interview: 'Interview', sales: 'Sales Call', meeting: 'Meeting', presentation: 'Presentation', negotiation: 'Negotiation', exam: 'Exam' };
        return labels[p] || p;
    }
}

customElements.define('profiles-view', ProfilesView);
