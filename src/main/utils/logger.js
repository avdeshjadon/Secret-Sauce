const { createConsola } = require('consola');
const chalk = require('chalk');
const ora = require('ora');

// Custom format reporter can be added if needed, but consola's default
// fancy reporter is very good for CLI interfaces like Claude Code.
const logger = createConsola({
    // Use the default fancy reporter, which provides badges, colors, and timestamps
    fancy: true,
    formatOptions: {
        date: false, // We can turn off date for cleaner CLI look
    },
});

/**
 * A utility to manage spinners that align with the logger
 */
const createSpinner = text => {
    return ora({
        text: text,
        spinner: 'dots',
    });
};

const streamState = new Map();

function normalizeChunk(text) {
    return String(text ?? '')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

const streamLogger = {
    begin(sessionId, source, meta = '') {
        const key = `${sessionId}:${source}`;
        streamState.set(key, 0);
        const tag = source === 'user' ? chalk.cyan('USER') : chalk.green('AI');
        const suffix = meta ? ` ${chalk.gray(meta)}` : '';
        logger.log(`${chalk.gray('┌')} ${tag} ${chalk.bold('stream:start')} ${chalk.gray(`[${sessionId}]`)}${suffix}`);
    },
    chunk(sessionId, source, chunkText) {
        const key = `${sessionId}:${source}`;
        const nextIdx = (streamState.get(key) || 0) + 1;
        streamState.set(key, nextIdx);
        const tag = source === 'user' ? chalk.cyan('USER') : chalk.green('AI');
        const text = normalizeChunk(chunkText);
        logger.log(`${chalk.gray('│')} ${tag} ${chalk.gray(`#${String(nextIdx).padStart(3, '0')}`)} ${text}`);
    },
    end(sessionId, source, meta = '') {
        const key = `${sessionId}:${source}`;
        const count = streamState.get(key) || 0;
        streamState.delete(key);
        const tag = source === 'user' ? chalk.cyan('USER') : chalk.green('AI');
        const suffix = meta ? ` ${chalk.gray(meta)}` : '';
        logger.log(`${chalk.gray('└')} ${tag} ${chalk.bold('stream:end')} ${chalk.gray(`[${sessionId}] chunks=${count}`)}${suffix}`);
    },
};

module.exports = { logger, chalk, createSpinner, streamLogger };
