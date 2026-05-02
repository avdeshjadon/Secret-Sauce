const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let audioProcess = null;
let messageBuffer = '';

function startAudioCapture(onTranscription, onStatus) {
    if (audioProcess) return;

    const isDev = !app.isPackaged;
    const binName = process.platform === 'darwin' ? 'SystemAudioDump' : 'SystemAudioDump.exe';
    
    // Path logic from original code
    let binPath = isDev 
        ? path.join(__dirname, '../../../renderer/assets', binName)
        : path.join(process.resourcesPath, binName);

    if (!fs.existsSync(binPath)) {
        console.error(`[Audio] Binary not found at: ${binPath}`);
        onStatus('Error: Audio binary missing');
        return;
    }

    console.log(`[Audio] Starting capture: ${binPath}`);
    audioProcess = spawn(binPath);

    audioProcess.stdout.on('data', (data) => {
        const str = data.toString();
        messageBuffer += str;

        const lines = messageBuffer.split('\n');
        messageBuffer = lines.pop();

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'transcription') {
                        onTranscription(msg.text);
                    } else if (msg.type === 'status') {
                        onStatus(msg.text);
                    }
                } catch (e) {
                    // Ignore partial/invalid JSON
                }
            }
        }
    });

    audioProcess.stderr.on('data', (data) => {
        console.error(`[Audio] Stderr: ${data.toString()}`);
    });

    audioProcess.on('close', (code) => {
        console.log(`[Audio] Process closed with code ${code}`);
        audioProcess = null;
    });
}

function stopAudioCapture() {
    if (audioProcess) {
        audioProcess.kill();
        audioProcess = null;
    }
}

module.exports = {
    startAudioCapture,
    stopAudioCapture,
};
