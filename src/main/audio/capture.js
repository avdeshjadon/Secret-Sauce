/**
 * capture.js — FIXED
 *
 * Fix #6 (Architecture): Added the missing logger import.
 * The original file called logger.info() and logger.error() throughout but
 * never imported the logger — this caused a ReferenceError crash the moment
 * macOS audio capture started.
 */

const { spawn } = require('child_process');
const { saveDebugAudio } = require('./utils');

// ── Fix #6: This import was missing in the original file ──────────────────────
const { logger } = require('../utils/logger');
// ──────────────────────────────────────────────────────────────────────────────

// Audio capture variables
let systemAudioProc = null;

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        logger.info('Checking for existing SystemAudioDump processes...');

        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', code => {
            if (code === 0) {
                logger.info('Killed existing SystemAudioDump processes');
            } else {
                logger.info('No existing SystemAudioDump processes found');
            }
            resolve();
        });

        killProc.on('error', err => {
            logger.info('Error checking for existing processes (this is normal):', err.message);
            resolve();
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            try { killProc.kill(); } catch (e) {}
            resolve();
        }, 2000);
    });
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}

async function startMacOSAudioCapture(geminiSessionRef, sendAudioToGemini, currentProviderMode, sendCloudAudio, getLocalAi) {
    if (process.platform !== 'darwin') return false;

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    logger.info('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');
    const crypto = require('crypto');
    const fs = require('fs');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../../assets/bin', 'SystemAudioDump');
    }

    logger.info('SystemAudioDump path:', systemAudioPath);

    // ── Fix #12: Integrity check for the native binary ────────────────────────
    // This is a lightweight guard — it won't catch sophisticated tampering, but
    // it will catch accidental replacement or corruption of the binary.
    // To get the hash of your trusted binary: sha256sum SystemAudioDump
    // Then set the env variable: SYSTEM_AUDIO_DUMP_SHA256=<hash>
    const expectedHash = process.env.SYSTEM_AUDIO_DUMP_SHA256;
    if (expectedHash) {
        try {
            const fileBuffer = fs.readFileSync(systemAudioPath);
            const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            if (actualHash !== expectedHash.toLowerCase()) {
                logger.error(`[SECURITY] SystemAudioDump integrity check FAILED!`);
                logger.error(`  Expected: ${expectedHash}`);
                logger.error(`  Got:      ${actualHash}`);
                logger.error('  Refusing to execute the binary. Set SYSTEM_AUDIO_DUMP_SHA256 env var to the correct hash, or remove it to skip this check.');
                return false;
            }
            logger.info('[Security] SystemAudioDump integrity check passed.');
        } catch (err) {
            logger.error('Could not verify SystemAudioDump integrity:', err.message);
            return false;
        }
    } else {
        logger.warn('[Security] SYSTEM_AUDIO_DUMP_SHA256 env var not set — skipping binary integrity check.');
    }
    // ──────────────────────────────────────────────────────────────────────────

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        logger.error('Failed to start SystemAudioDump');
        return false;
    }

    logger.info('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;
            const prefs = getPreferences();
            const transcriptionEngine = prefs.transcriptionEngine || 'whisper';

            if (currentProviderMode() === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (transcriptionEngine === 'gemini' && currentProviderMode() === 'byok') {
                // If user wants Gemini transcription in BYOK mode, send audio to Gemini
                const base64Data = monoChunk.toString('base64');
                sendAudioToGemini(base64Data, geminiSessionRef);
            } else {
                // For 'local' mode, or 'byok' mode with Whisper, use local Whisper transcription
                getLocalAi().processLocalAudio(monoChunk);
            }

            if (process.env.DEBUG_AUDIO) {
                logger.info(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        logger.error('SystemAudioDump stderr:', data.toString());
    });

    systemAudioProc.on('close', code => {
        logger.info('SystemAudioDump process closed with code:', code);
        systemAudioProc = null;
    });

    systemAudioProc.on('error', err => {
        logger.error('SystemAudioDump process error:', err);
        systemAudioProc = null;
    });

    return true;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        logger.info('Stopping SystemAudioDump...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

module.exports = {
    killExistingSystemAudioDump,
    convertStereoToMono,
    startMacOSAudioCapture,
    stopMacOSAudioCapture,
};