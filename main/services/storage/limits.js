const { limitsPath } = require('./paths');
const { DEFAULT_LIMITS } = require('./constants');
const { readJsonFile, writeJsonFile } = require('./io');

function getLimits() {
    return readJsonFile(limitsPath, DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(limitsPath, limits);
}

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry) {
        if (!todayEntry.groq) {
            todayEntry.groq = {
                'qwen3-32b': { chars: 0, limit: 1500000 },
                'gpt-oss-120b': { chars: 0, limit: 600000 },
                'gpt-oss-20b': { chars: 0, limit: 600000 },
                'kimi-k2-instruct': { chars: 0, limit: 600000 },
            };
        }
        if (!todayEntry.gemini) {
            todayEntry.gemini = { 'gemma-3-27b-it': { chars: 0 } };
        }
        setLimits(limits);
        return todayEntry;
    }

    limits.data = limits.data.filter(entry => entry.date === today);
    const newEntry = {
        date: today,
        flash: { count: 0 },
        flashLite: { count: 0 },
        groq: {
            'qwen3-32b': { chars: 0, limit: 1500000 },
            'gpt-oss-120b': { chars: 0, limit: 600000 },
            'gpt-oss-20b': { chars: 0, limit: 600000 },
            'kimi-k2-instruct': { chars: 0, limit: 600000 },
        },
        gemini: { 'gemma-3-27b-it': { chars: 0 } },
    };
    limits.data.push(newEntry);
    setLimits(limits);
    return newEntry;
}

function incrementLimitCount(model) {
    const limits = getLimits();
    const today = getTodayDateString();
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        limits.data = [];
        todayEntry = { date: today, flash: { count: 0 }, flashLite: { count: 0 } };
        limits.data.push(todayEntry);
    } else {
        limits.data = limits.data.filter(entry => entry.date === today);
    }

    if (model === 'gemini-2.5-flash') todayEntry.flash.count++;
    else if (model === 'gemini-2.5-flash-lite') todayEntry.flashLite.count++;

    setLimits(limits);
    return todayEntry;
}

function incrementCharUsage(provider, model, charCount) {
    getTodayLimits();
    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry[provider] && todayEntry[provider][model]) {
        todayEntry[provider][model].chars += charCount;
        setLimits(limits);
    }
    return todayEntry;
}

function getAvailableModel() {
    const todayLimits = getTodayLimits();
    if (todayLimits.flash.count < 20) return 'gemini-2.5-flash';
    if (todayLimits.flashLite.count < 20) return 'gemini-2.5-flash-lite';
    return 'gemini-2.5-flash';
}

function getModelForToday() {
    const todayEntry = getTodayLimits();
    const groq = todayEntry.groq;

    if (groq['qwen3-32b'].chars < groq['qwen3-32b'].limit) return 'qwen/qwen3-32b';
    if (groq['gpt-oss-120b'].chars < groq['gpt-oss-120b'].limit) return 'openai/gpt-oss-120b';
    if (groq['gpt-oss-20b'].chars < groq['gpt-oss-20b'].limit) return 'openai/gpt-oss-20b';
    if (groq['kimi-k2-instruct'].chars < groq['kimi-k2-instruct'].limit) return 'moonshotai/kimi-k2-instruct';
    return null;
}

module.exports = {
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    incrementCharUsage,
    getAvailableModel,
    getModelForToday,
};
