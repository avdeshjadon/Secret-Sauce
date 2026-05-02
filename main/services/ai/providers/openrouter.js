const { getOpenRouterApiKey, getPreferences } = require('../../storage');

async function sendImageToOpenRouter(base64Data, prompt) {
    const apiKey = getOpenRouterApiKey();
    const prefs = getPreferences();
    const model = prefs.openRouterModel || 'google/gemini-2.0-flash-exp:free';

    if (!apiKey) throw new Error('OpenRouter API key missing');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/avdeshjadon/secret-sauce',
            'X-Title': 'Secret Sauce',
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Data}`,
                            },
                        },
                    ],
                },
            ],
            stream: false, // For now, handle non-streaming
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'OpenRouter API error');
    }

    const data = await response.json();
    return {
        success: true,
        text: data.choices[0].message.content,
        model: data.model,
    };
}

async function fetchModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
    });
    if (!response.ok) throw new Error('Failed to fetch OpenRouter models');
    const data = await response.json();
    return data.data; // List of models
}

module.exports = {
    sendImageToOpenRouter,
    fetchModels,
};
