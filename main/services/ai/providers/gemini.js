const { GoogleGenAI } = require('@google/genai');
const { getApiKey, incrementLimitCount } = require('../../storage');

async function sendImageToGemini(base64Data, prompt, model) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Gemini API key missing');

    const genAI = new GoogleGenAI(apiKey);
    const aiModel = genAI.getGenerativeModel({ model });

    const contents = [
        {
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Data,
                    },
                },
            ],
        },
    ];

    const result = await aiModel.generateContentStream(contents);
    incrementLimitCount(model);
    return result;
}

module.exports = {
    sendImageToGemini,
};
