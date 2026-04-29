import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class StatsView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .stats-container {
                display: flex;
                flex-direction: column;
                gap: var(--space-lg);
            }
            .chart-container {
                height: 200px;
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: var(--space-sm);
                padding: var(--space-md) var(--space-sm) var(--space-xl) var(--space-sm);
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                position: relative;
            }
            .chart-bar-wrap {
                flex: 1;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;
                gap: var(--space-xs);
                position: relative;
            }
            .chart-bar {
                width: 100%;
                max-width: 40px;
                background: var(--accent);
                border-radius: var(--radius-sm) var(--radius-sm) 0 0;
                transition: height 0.5s ease;
                min-height: 2px;
                opacity: 0.8;
            }
            .chart-bar:hover {
                opacity: 1;
                filter: brightness(1.2);
            }
            .chart-label {
                position: absolute;
                bottom: -24px;
                font-size: 10px;
                color: var(--text-muted);
                white-space: nowrap;
            }
            .chart-value {
                position: absolute;
                top: -20px;
                font-size: 10px;
                color: var(--text-secondary);
                font-family: var(--font-mono);
            }
            .activity-list {
                display: flex;
                flex-direction: column;
                gap: var(--space-xs);
            }
            .activity-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-sm) var(--space-md);
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
            }
            .activity-info {
                display: flex;
                flex-direction: column;
            }
            .activity-title {
                font-size: var(--font-size-sm);
                color: var(--text-primary);
            }
            .activity-date {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }
            .activity-stat {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
            }
        `,
    ];

    static properties = {
        stats: { type: Object },
        loading: { type: Boolean },
    };

    constructor() {
        super();
        this.stats = {
            totalSessions: 0,
            totalMessages: 0,
            totalTime: 0,
            topProfile: 'None',
            recentSessions: [],
        };
        this.loading = true;
        this.loadStats();
    }

    async loadStats() {
        try {
            this.loading = true;
            const sessions = await secretSauce.storage.getAllSessions();
            
            let totalMessages = 0;
            let totalTime = 0;
            const profileCounts = {};

            sessions.forEach(s => {
                totalMessages += s.messageCount || 0;
                // Estimate time: assume 5 mins per session if duration not available
                // In a real app, we'd have duration stored
                totalTime += 5; 

                if (s.profile) {
                    profileCounts[s.profile] = (profileCounts[s.profile] || 0) + 1;
                }
            });

            let topProfile = 'None';
            let maxCount = 0;
            for (const [p, count] of Object.entries(profileCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    topProfile = p;
                }
            }

            const profileNames = {
                interview: 'Job Interview',
                sales: 'Sales Call',
                meeting: 'Business Meeting',
                presentation: 'Presentation',
                negotiation: 'Negotiation',
                exam: 'Exam Assistant',
            };

            // Calculate weekly activity
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                last7Days.push({
                    date: date.toISOString().split('T')[0],
                    label: i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
                    count: 0
                });
            }

            sessions.forEach(s => {
                const sessionDate = new Date(s.createdAt).toISOString().split('T')[0];
                const day = last7Days.find(d => d.date === sessionDate);
                if (day) day.count++;
            });

            this.stats = {
                totalSessions: sessions.length,
                totalMessages,
                totalTime,
                topProfile: profileNames[topProfile] || topProfile,
                recentSessions: sessions.slice(0, 5),
                weeklyActivity: last7Days
            };
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            this.loading = false;
            this.requestUpdate();
        }
    }

    formatTime(mins) {
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m`;
    }

    render() {
        const maxActivity = Math.max(...this.stats.weeklyActivity?.map(d => d.count) || [1]);

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Usage Statistics</div>
                    <div class="page-subtitle">Overview of your AI assistant activity</div>

                    <div class="grid-3">
                        <div class="stat-card">
                            <span class="stat-label">Total Sessions</span>
                            <span class="stat-value">${this.stats.totalSessions}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">AI Responses</span>
                            <span class="stat-value">${this.stats.totalMessages}</span>
                        </div>
                        <div class="stat-card">
                            <span class="stat-label">Time Saved (Est.)</span>
                            <span class="stat-value">${this.formatTime(this.stats.totalTime)}</span>
                        </div>
                    </div>

                    <section class="surface">
                        <div class="surface-title">Activity Trend (Last 7 Days)</div>
                        <div class="chart-container">
                            ${this.stats.weeklyActivity?.map(day => html`
                                <div class="chart-bar-wrap">
                                    <div class="chart-value">${day.count > 0 ? day.count : ''}</div>
                                    <div class="chart-bar" style="height: ${(day.count / (maxActivity || 1)) * 100}%"></div>
                                    <div class="chart-label">${day.label}</div>
                                </div>
                            `)}
                        </div>
                    </section>

                    <div class="grid-2">
                        <section class="surface">
                            <div class="surface-title">Top Category</div>
                            <div class="stat-value" style="font-size: var(--font-size-lg); margin-top: var(--space-sm);">
                                ${this.stats.topProfile}
                            </div>
                            <div class="page-subtitle" style="margin-top: 4px;">Your most frequent session type</div>
                        </section>

                        <section class="surface">
                            <div class="surface-title">Recent Sessions</div>
                            <div class="activity-list">
                                ${this.stats.recentSessions.length === 0 
                                    ? html`<div class="muted">No recent activity</div>`
                                    : this.stats.recentSessions.map(s => html`
                                        <div class="activity-item">
                                            <div class="activity-info">
                                                <span class="activity-title">${s.profile || 'Session'}</span>
                                                <span class="activity-date">${new Date(s.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <span class="activity-stat">${s.messageCount || 0} msgs</span>
                                        </div>
                                    `)}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('stats-view', StatsView);
