const WebSocket = require('ws');
const { BrowserWindow } = require('electron');
const { logger } = require('../utils/logger');

// ─── Fix #11: Centralised URL constant ────────────────────────────────────────
const CLOUD_WS_URL = 'wss://api.secretsauce.com/ws';
// For staging/dev, set the environment variable SECRETSAUCE_WS_URL to override:
// e.g.  SECRETSAUCE_WS_URL=wss://staging.secretsauce.com/ws npm start
const resolvedWsUrl = process.env.SECRETSAUCE_WS_URL || CLOUD_WS_URL;
// ──────────────────────────────────────────────────────────────────────────────

let cloudWs = null;
let isCloudConnected = false;
let currentCloudResponse = '';
let currentTranscription = '';
let isFirstChunk = true;
let audioChunkCount = 0;
let onTurnComplete = null;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function setOnTurnComplete(callback) {
    onTurnComplete = callback;
}

/**
 * connectCloud — Fix #3
 *
 * OLD (broken): wss://api.secretsauce.com/ws?token=<TOKEN>
 *   → token visible in server access logs, proxy logs, debug output
 *
 * NEW (fixed): Connect to clean URL, send token in:
 *   1. WebSocket handshake headers (preferred, supported by most servers)
 *   2. First JSON message after 'open' (fallback, guarantees server receives it)
 */
function connectCloud(token, profile, userContext) {
    // Validate token before connecting
    if (!token || typeof token !== 'string' || token.trim() === '') {
        return Promise.reject(new Error('Cloud token is missing or invalid'));
    }

    // Close existing connection
    if (cloudWs) {
        try {
            cloudWs.close();
        } catch (e) {}
        cloudWs = null;
        isCloudConnected = false;
    }

    audioChunkCount = 0;

    return new Promise((resolve, reject) => {
        // ── Fix #3: Token goes in headers, NOT in the URL ──────────────────
        // We log the URL without the token so it's safe to print.
        logger.info('[Cloud] Connecting to', resolvedWsUrl);

        cloudWs = new WebSocket(resolvedWsUrl, {
            headers: {
                // Standard Bearer auth header — never logged by reverse proxies
                Authorization: `Bearer ${token}`,
            },
        });
        // ────────────────────────────────────────────────────────────────────

        const timeout = setTimeout(() => {
            if (!isCloudConnected) {
                try { cloudWs.close(); } catch (e) {}
                reject(new Error('Cloud connection timeout'));
            }
        }, 10000);

        cloudWs.on('open', () => {
            logger.info('[Cloud] WebSocket open');
            isCloudConnected = true;
            clearTimeout(timeout);

            // ── Fix #3 (belt-and-suspenders): also send token as first message
            // Some WebSocket servers cannot read upgrade headers. Sending it as
            // the very first message ensures auth even in those cases.
            const authMessage = JSON.stringify({
                type: 'authenticate',
                token: token,
            });
            cloudWs.send(authMessage);

            // Then immediately send config
            const config = JSON.stringify({
                type: 'set_config',
                profile: profile || 'interview',
                user_context: userContext || '',
            });
            cloudWs.send(config);
            logger.info('[Cloud] Auth + config sent for profile:', profile);

            sendToRenderer('update-status', 'Cloud connected');
            resolve(true);
        });

        cloudWs.on('message', data => {
            try {
                const msg = JSON.parse(data.toString());
                handleMessage(msg);
            } catch (e) {
                logger.error('[Cloud] Parse error:', e);
            }
        });

        cloudWs.on('close', (code, reason) => {
            logger.info('[Cloud] WebSocket closed:', code, reason.toString());
            logger.info('[Cloud] Audio chunks sent before close:', audioChunkCount);
            isCloudConnected = false;
            clearTimeout(timeout);
        });

        cloudWs.on('error', err => {
            logger.error('[Cloud] WebSocket error:', err.message);
            isCloudConnected = false;
            clearTimeout(timeout);
            reject(err);
        });
    });
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'connected':
            logger.info('[Cloud] Server confirmed connected');
            break;

        case 'transcription':
            logger.info('[Cloud] Transcription:', msg.text);
            currentTranscription = msg.text || '';
            sendToRenderer('update-status', 'Generating response...');
            break;

        case 'response_start':
            currentCloudResponse = '';
            isFirstChunk = true;
            break;

        case 'response_chunk':
            currentCloudResponse += msg.text;
            sendToRenderer(isFirstChunk ? 'new-response' : 'update-response', currentCloudResponse);
            isFirstChunk = false;
            break;

        case 'response_end':
            if (onTurnComplete && currentCloudResponse.trim()) {
                onTurnComplete(currentTranscription, currentCloudResponse);
            }
            currentTranscription = '';
            sendToRenderer('update-status', 'Listening...');
            break;

        case 'session_end':
            logger.info('[Cloud] Session ended by server');
            isCloudConnected = false;
            break;

        case 'error':
            logger.error('[Cloud] Server error:', msg.message);
            sendToRenderer('update-status', 'Cloud error: ' + msg.message);
            break;

        default:
            logger.info('[Cloud] Event:', msg.type);
    }
}

function sendCloudAudio(pcmBuffer) {
    if (!cloudWs || !isCloudConnected || cloudWs.readyState !== WebSocket.OPEN) {
        return;
    }

    cloudWs.send(pcmBuffer, { binary: true }, err => {
        if (err) {
            logger.error('[Cloud] Audio send error:', err.message);
        }
    });

    audioChunkCount++;
    process.stdout.write('.');
}

function sendCloudText(text) {
    if (cloudWs && isCloudConnected && cloudWs.readyState === WebSocket.OPEN) {
        cloudWs.send(
            JSON.stringify({
                type: 'test_text',
                text: text,
            })
        );
    }
}

function sendCloudImage(base64Data) {
    if (!cloudWs || !isCloudConnected || cloudWs.readyState !== WebSocket.OPEN) {
        return false;
    }
    cloudWs.send(
        JSON.stringify({
            type: 'image',
            image: base64Data,
        })
    );
    return true;
}

function closeCloud() {
    logger.info('[Cloud] Closing. Audio chunks sent:', audioChunkCount);
    if (cloudWs) {
        try {
            if (cloudWs.readyState === WebSocket.OPEN) {
                cloudWs.send(JSON.stringify({ type: 'end_connection' }));
            }
            cloudWs.close();
        } catch (e) {
            logger.error('[Cloud] Close error:', e);
        }
        cloudWs = null;
    }
    isCloudConnected = false;
    currentCloudResponse = '';
    currentTranscription = '';
    isFirstChunk = true;
    audioChunkCount = 0;
    onTurnComplete = null;
}

function isCloudActive() {
    return isCloudConnected && cloudWs && cloudWs.readyState === WebSocket.OPEN;
}

module.exports = {
    connectCloud,
    sendCloudAudio,
    sendCloudText,
    sendCloudImage,
    closeCloud,
    isCloudActive,
    setOnTurnComplete,
};