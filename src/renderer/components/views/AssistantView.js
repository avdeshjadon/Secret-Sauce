import { html, css, LitElement } from '../../../assets/vendor/lit-core-2.7.4.min.js';

export class AssistantView extends LitElement {
    static styles = css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        * {
            font-family: var(--font);
            cursor: default;
        }

        /* ── Response area ── */

        .response-container {
            flex: 1;
            overflow-y: auto;
            font-size: var(--response-font-size, 15px);
            line-height: var(--line-height);
            background: var(--bg-app);
            padding: var(--space-sm) var(--space-md);
            user-select: text;
            cursor: text;
            color: var(--text-primary);
        }

        .response-container * {
            user-select: text;
            cursor: text;
        }

        .response-container a {
            cursor: pointer;
        }

        /* ── Markdown ── */

        .response-container h1,
        .response-container h2,
        .response-container h3,
        .response-container h4,
        .response-container h5,
        .response-container h6 {
            margin: 1em 0 0.5em 0;
            color: var(--text-primary);
            font-weight: var(--font-weight-semibold);
        }

        .response-container h1 {
            font-size: 1.5em;
        }
        .response-container h2 {
            font-size: 1.3em;
        }
        .response-container h3 {
            font-size: 1.15em;
        }
        .response-container h4 {
            font-size: 1.05em;
        }
        .response-container h5,
        .response-container h6 {
            font-size: 1em;
        }

        .response-container p {
            margin: 0.6em 0;
            color: var(--text-primary);
        }

        .response-container ul,
        .response-container ol {
            margin: 0.6em 0;
            padding-left: 1.5em;
            color: var(--text-primary);
        }

        .response-container li {
            margin: 0.3em 0;
        }

        .response-container blockquote {
            margin: 0.8em 0;
            padding: 0.5em 1em;
            border-left: 2px solid var(--border-strong);
            background: var(--bg-surface);
            border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }

        .response-container code {
            background: var(--bg-elevated);
            padding: 0.15em 0.4em;
            border-radius: var(--radius-sm);
            font-family: var(--font-mono);
            font-size: 0.85em;
        }

        .response-container pre {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: var(--space-md);
            overflow-x: auto;
            margin: 0.8em 0;
        }

        .response-container pre code {
            background: none;
            padding: 0;
        }

        .response-container a {
            color: var(--accent);
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        .response-container strong,
        .response-container b {
            font-weight: var(--font-weight-semibold);
        }

        .response-container hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 1.5em 0;
        }

        .response-container table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.8em 0;
        }

        .response-container th,
        .response-container td {
            border: 1px solid var(--border);
            padding: var(--space-sm);
            text-align: left;
        }

        .response-container th {
            background: var(--bg-surface);
            font-weight: var(--font-weight-semibold);
        }

        .response-container::-webkit-scrollbar {
            width: 6px;
        }

        .response-container::-webkit-scrollbar-track {
            background: transparent;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: #444444;
        }

        /* ── Response navigation strip ── */

        .response-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-md);
            border-top: 1px solid var(--border);
            background: var(--bg-app);
        }

        .nav-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: var(--space-xs);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color var(--transition);
        }

        .nav-btn:hover:not(:disabled) {
            color: var(--text-primary);
        }

        .nav-btn:disabled {
            opacity: 0.25;
            cursor: default;
        }

        .nav-btn svg {
            width: 14px;
            height: 14px;
        }

        .response-counter {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-family: var(--font-mono);
            min-width: 40px;
            text-align: center;
        }

        /* ── Bottom input bar ── */

        .input-bar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-md);
            background: var(--bg-app);
        }

        .input-bar-inner {
            display: flex;
            align-items: center;
            flex: 1;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 100px;
            padding: 0 var(--space-md);
            height: 32px;
            transition: border-color var(--transition);
        }

        .input-bar-inner:focus-within {
            border-color: var(--accent);
        }

        .input-bar-inner input {
            flex: 1;
            background: none;
            color: var(--text-primary);
            border: none;
            padding: 0;
            font-size: var(--font-size-sm);
            font-family: var(--font);
            height: 100%;
            outline: none;
        }

        .input-bar-inner input::placeholder {
            color: var(--text-muted);
        }

        .analyze-btn {
            position: relative;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--text-primary);
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            white-space: nowrap;
            padding: var(--space-xs) var(--space-md);
            border-radius: 100px;
            height: 32px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
            overflow: hidden;
            z-index: 1;
        }

        .analyze-btn:hover:not(.analyzing) {
            border-color: var(--accent);
            background: var(--bg-surface);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .analyze-btn:active:not(.analyzing) {
            transform: translateY(0);
        }

        .analyze-btn.analyzing {
            cursor: default;
            border-color: transparent;
            background: transparent;
            color: var(--text-primary);
        }

        /* The spinning gradient border */
        .analyze-btn.analyzing::before {
            content: '';
            position: absolute;
            width: 300%;
            height: 300%;
            top: -100%;
            left: -100%;
            background: conic-gradient(
                from 0deg,
                transparent 0%,
                transparent 40%,
                var(--accent, #6366f1) 50%,
                var(--danger, #ec4899) 60%,
                var(--accent, #6366f1) 70%,
                transparent 100%
            );
            animation: spin 3s linear infinite;
            filter: blur(8px);
            z-index: -2;
            will-change: transform;
        }

        /* Inner Background to obscure the middle of the conic gradient */
        .analyze-btn.analyzing::after {
            content: '';
            position: absolute;
            inset: 1.5px; /* Thicker border */
            background: var(--bg-elevated, #1e1e1e);
            border-radius: 100px;
            z-index: -1;
        }

        /* Subtle Shimmer Overlay */
        .analyze-shimmer {
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
            transform: translateX(-100%);
            z-index: 0;
            pointer-events: none;
            border-radius: 100px;
            opacity: 0;
            transition: opacity 0.5s;
        }

        .analyze-btn.analyzing .analyze-shimmer {
            opacity: 1;
            animation: shimmer 2s infinite ease-in-out;
            will-change: transform;
        }

        /* Glow effect */
        .analyze-glow {
            position: absolute;
            inset: 0;
            border-radius: 100px;
            box-shadow: 0 0 20px var(--accent, rgba(99, 102, 241, 0.4));
            opacity: 0;
            transition: opacity 0.5s ease;
            z-index: -3;
        }

        .analyze-btn.analyzing .analyze-glow {
            opacity: 1;
            animation: pulseGlow 3s ease-in-out infinite alternate;
        }

        .end-session-btn {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            color: var(--danger);
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            padding: var(--space-xs) var(--space-md);
            border-radius: 100px;
            height: 32px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all var(--transition);
        }

        .end-session-btn:hover {
            background: var(--danger);
            color: white;
            border-color: var(--danger);
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .live-profile-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            padding: 4px 10px;
            border-radius: 100px;
            font-size: 10px;
            color: var(--text-secondary);
            font-weight: var(--font-weight-semibold);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .live-profile-badge .dot {
            width: 6px;
            height: 6px;
            background: var(--accent);
            border-radius: 50%;
            box-shadow: 0 0 5px var(--accent);
        }

        .analyze-btn.analyzing .analyze-btn-content {
            animation: breatheText 2s ease-in-out infinite alternate;
        }

        .analyze-btn-content {
            display: flex;
            align-items: center;
            gap: 6px;
            z-index: 1;
            position: relative;
        }

        /* ── Audio Visualizer ── */
        .visualizer-container {
            height: 20px;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            margin-bottom: -10px;
            pointer-events: none;
        }

        #visualizer {
            width: 120px;
            height: 100%;
            opacity: 0.6;
        }

        .spinner {
            animation: spin 1.2s linear infinite;
        }

        @keyframes spin {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }

        @keyframes shimmer {
            0% {
                transform: translateX(-100%);
            }
            100% {
                transform: translateX(100%);
            }
        }

        @keyframes pulseGlow {
            0% {
                opacity: 0.4;
            }
            100% {
                opacity: 0.9;
            }
        }

        @keyframes breatheText {
            0% {
                opacity: 0.7;
            }
            100% {
                opacity: 1;
            }
        }
    `;

    static properties = {
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        onEndSession: { type: Function },
        shouldAnimateResponse: { type: Boolean },
        isAnalyzing: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.responses = [];
        this.currentResponseIndex = -1;
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this.onEndSession = () => {};
        this.isAnalyzing = false;
        this._animFrame = null;
        this._audioContext = null;
        this._audioStream = null;
    }

    getProfileNames() {
        return {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
    }

    getCurrentResponse() {
        const profileNames = this.getProfileNames();
        return this.responses.length > 0 && this.currentResponseIndex >= 0
            ? this.responses[this.currentResponseIndex]
            : `Listening to your ${profileNames[this.selectedProfile] || 'session'}...`;
    }

    renderMarkdown(content) {
        if (typeof window !== 'undefined' && window.marked) {
            try {
                window.marked.setOptions({
                    breaks: true,
                    gfm: true,
                    // SECURITY: marked's legacy sanitize option is not a safe sanitizer.
                });
                let rendered = window.marked.parse(content);
                return this.sanitizeHtmlAllowlist(rendered);
            } catch (error) {
                console.warn('Error parsing markdown:', error);
                return this.renderPlainText(content);
            }
        }
        // If marked isn't available, never treat model output as HTML.
        return this.renderPlainText(content);
    }

    renderPlainText(text) {
        const safe = this.escapeHtml(String(text ?? ''));
        // Preserve line breaks in a minimal way.
        return safe.replace(/\n/g, '<br/>');
    }

    escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Allowlist sanitizer (kept in component to avoid new build tooling/deps)
    sanitizeHtmlAllowlist(unsafeHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(unsafeHtml || ''), 'text/html');

        const ALLOWED_TAGS = new Set([
            'P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I',
            'CODE', 'PRE', 'BLOCKQUOTE',
            'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'HR',
            'A',
            'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
            'SPAN',
        ]);
        const ALLOWED_ATTRS = {
            A: new Set(['href', 'title', 'target', 'rel']),
            SPAN: new Set(['class']),
            CODE: new Set(['class']),
            PRE: new Set(['class']),
        };

        function isSafeUrl(url) {
            if (!url) return false;
            try {
                const u = new URL(url, window.location.origin);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch {
                return false;
            }
        }

        function cleanNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName;
                if (tag !== 'BODY' && tag !== 'HTML') {
                    if (!ALLOWED_TAGS.has(tag)) {
                        const text = doc.createTextNode(node.textContent || '');
                        node.replaceWith(text);
                        return;
                    }

                    const allowed = ALLOWED_ATTRS[tag] || new Set();
                    for (const attr of Array.from(node.attributes)) {
                        if (!allowed.has(attr.name)) node.removeAttribute(attr.name);
                    }

                    if (tag === 'A') {
                        const href = node.getAttribute('href') || '';
                        if (!isSafeUrl(href)) {
                            node.removeAttribute('href');
                        } else {
                            node.setAttribute('target', '_blank');
                            node.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                }
            }
            for (const child of Array.from(node.childNodes)) cleanNode(child);
        }

        cleanNode(doc.body);
        return doc.body.innerHTML;
    }

    navigateToPreviousResponse() {
        if (this.currentResponseIndex > 0) {
            this.currentResponseIndex--;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    navigateToNextResponse() {
        if (this.currentResponseIndex < this.responses.length - 1) {
            this.currentResponseIndex++;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    scrollResponseUp() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
        }
    }

    scrollResponseDown() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + scrollAmount);
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // Secure IPC: listen via contextBridge API (works with contextIsolation)
        this._unsubs = [];
        this._unsubs.push(window.electronAPI.on('navigate-previous-response', () => this.navigateToPreviousResponse()));
        this._unsubs.push(window.electronAPI.on('navigate-next-response', () => this.navigateToNextResponse()));
        this._unsubs.push(window.electronAPI.on('scroll-response-up', () => this.scrollResponseUp()));
        this._unsubs.push(window.electronAPI.on('scroll-response-down', () => this.scrollResponseDown()));
        this._unsubs.push(
            window.electronAPI.on('trigger-next-step', () => {
                if (this.handleScreenAnswer) this.handleScreenAnswer();
            })
        );

        window.addEventListener('manual-analysis-complete', this.handleAnalysisComplete);
        
        // Start visualizer after a short delay to ensure DOM is ready
        setTimeout(() => this._initVisualizer(), 100);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubs) {
            this._unsubs.forEach(fn => fn());
            this._unsubs = [];
        }

        if (this.handleAnalysisComplete) {
            window.removeEventListener('manual-analysis-complete', this.handleAnalysisComplete);
        }

        if (this._animFrame) cancelAnimationFrame(this._animFrame);
        if (this._audioStream) {
            this._audioStream.getTracks().forEach(track => track.stop());
        }
        if (this._audioContext) {
            this._audioContext.close();
        }
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = '';
            await this.onSendText(message);
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    async handleScreenAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureManualScreenshot) {
            this.isAnalyzing = true;
            window.captureManualScreenshot();
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.response-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    firstUpdated() {
        super.firstUpdated();
        this.scheduleResponseUpdate();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('responses') || changedProperties.has('currentResponseIndex')) {
            this.scheduleResponseUpdate();
        }

        if (changedProperties.has('isAnalyzing')) {
            // CSS animations handle the state changes automatically via the .analyzing class
        }
    }

    scheduleResponseUpdate() {
        if (this._updatePending) return;
        this._updatePending = true;
        // Throttle innerHTML updates to ~16-20fps to prevent deep DOM thrashing and text blinking
        setTimeout(() => {
            this._updatePending = false;
            this.updateResponseContent();
        }, 50);
    }

    updateResponseContent() {
        const container = this.shadowRoot.querySelector('#responseContainer');
        if (container) {
            const wasAtBottom = Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 20;
            const currentResponse = this.getCurrentResponse();
            const renderedResponse = this.renderMarkdown(currentResponse);
            
            // Set HTML quickly
            container.innerHTML = renderedResponse;
            
            // Ensure smooth visual continuity if scrolling
            if (wasAtBottom) {
                container.scrollTop = container.scrollHeight;
            }
            
            if (this.shouldAnimateResponse) {
                this.dispatchEvent(new CustomEvent('response-animation-complete', { bubbles: true, composed: true }));
            }
        }
    }

    async _initVisualizer() {
        try {
            const canvas = this.shadowRoot.querySelector('#visualizer');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // Set internal resolution
            canvas.width = 120;
            canvas.height = 20;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._audioStream = stream;
            
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this._audioContext = new AudioContext();
            
            const analyser = this._audioContext.createAnalyser();
            const source = this._audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            analyser.fftSize = 32;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const draw = () => {
                this._animFrame = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const barWidth = 4;
                const gap = 2;
                const totalWidth = bufferLength * (barWidth + gap);
                const startX = (canvas.width - totalWidth) / 2;
                
                ctx.fillStyle = getComputedStyle(this).getPropertyValue('--accent') || '#06b6d4';
                
                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i];
                    const percent = value / 255;
                    const height = Math.max(2, percent * canvas.height);
                    const y = (canvas.height - height) / 2;
                    
                    // Rounded bars
                    ctx.beginPath();
                    ctx.roundRect(startX + i * (barWidth + gap), y, barWidth, height, 2);
                    ctx.fill();
                }
            };
            
            draw();
        } catch (err) {
            console.warn('Audio visualizer failed:', err);
        }
    }

    render() {
        const hasMultipleResponses = this.responses.length > 1;

        return html`
            <div class="response-container" id="responseContainer"></div>

            ${hasMultipleResponses
                ? html`
                      <div class="response-nav">
                          <button
                              class="nav-btn"
                              @click=${this.navigateToPreviousResponse}
                              ?disabled=${this.currentResponseIndex <= 0}
                              title="Previous response"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path
                                      fill-rule="evenodd"
                                      d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                                      clip-rule="evenodd"
                                  />
                              </svg>
                          </button>
                          <span class="response-counter">${this.currentResponseIndex + 1} of ${this.responses.length}</span>
                          <button
                              class="nav-btn"
                              @click=${this.navigateToNextResponse}
                              ?disabled=${this.currentResponseIndex >= this.responses.length - 1}
                              title="Next response"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path
                                      fill-rule="evenodd"
                                      d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                                      clip-rule="evenodd"
                                  />
                              </svg>
                          </button>
                      </div>
                  `
                : ''}

            <div class="visualizer-container">
                <canvas id="visualizer"></canvas>
            </div>

            <div class="input-bar">
                <div class="live-profile-badge">
                    <div class="dot"></div>
                    <span>${this.getProfileNames()[this.selectedProfile]}</span>
                </div>

                <div class="input-bar-inner">
                    <input type="text" id="textInput" placeholder="Type a message..." @keydown=${this.handleTextKeydown} />
                </div>

                <button class="end-session-btn" @click=${this.onEndSession} title="End current session">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                    End
                </button>

                <button class="analyze-btn ${this.isAnalyzing ? 'analyzing' : ''}" @click=${this.handleScreenAnswer}>
                    <div class="analyze-glow"></div>
                    <div class="analyze-shimmer"></div>
                    <span class="analyze-btn-content">
                        ${this.isAnalyzing
                            ? html`
                                  <svg
                                      class="spinner"
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
                                      <line x1="12" y1="2" x2="12" y2="6"></line>
                                      <line x1="12" y1="18" x2="12" y2="22"></line>
                                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                      <line x1="2" y1="12" x2="6" y2="12"></line>
                                      <line x1="18" y1="12" x2="22" y2="12"></line>
                                      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                  </svg>
                                  Analyzing...
                              `
                            : html`
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                                      <path
                                          fill="none"
                                          stroke="currentColor"
                                          stroke-linecap="round"
                                          stroke-linejoin="round"
                                          stroke-width="2"
                                          d="M13 3v7h6l-8 11v-7H5z"
                                      />
                                  </svg>
                                  Analyze Screen
                              `}
                    </span>
                </button>
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);
