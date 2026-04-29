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

module.exports = { logger, chalk, createSpinner };
