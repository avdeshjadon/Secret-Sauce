const fs = require('fs');
const path = require('path');

function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`[Storage] Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`[Storage] Error writing ${filePath}:`, error.message);
        return false;
    }
}

module.exports = {
    readJsonFile,
    writeJsonFile,
};
