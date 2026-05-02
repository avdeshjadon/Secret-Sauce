const SAMPLE_RATE = 24000;

function createAudioProcessor(audioContext, onAudioData) {
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample or process for Gemini...
        // Original logic was just passing base64 of PCM
        const pcmData = convertFloat32ToInt16(inputData);
        onAudioData(btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer))));
    };
    
    return processor;
}

function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7fff;
    }
    return buf;
}

module.exports = {
    SAMPLE_RATE,
    createAudioProcessor,
};
