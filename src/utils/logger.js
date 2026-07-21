/**
 * Structured logger for the Skylark Executive Terminal.
 * Outputs clean, readable log lines with timestamps and levels.
 */

const levels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

function formatMessage(level, context, message, meta) {
  const timestamp = new Date().toISOString();
  const metaString = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] [${context}] ${message}${metaString}`;
}

const logger = {
  info: (context, message, meta) => {
    console.log(formatMessage(levels.INFO, context, message, meta));
  },
  warn: (context, message, meta) => {
    console.warn(formatMessage(levels.WARN, context, message, meta));
  },
  error: (context, message, errorObject) => {
    const errMsg = errorObject instanceof Error ? errorObject.stack || errorObject.message : errorObject;
    console.error(formatMessage(levels.ERROR, context, message, { error: errMsg }));
  },
  debug: (context, message, meta) => {
    try {
      const { isDev } = require('../config').getActiveConfig();
      if (isDev) {
        console.log(formatMessage(levels.DEBUG, context, message, meta));
      }
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.log(formatMessage(levels.DEBUG, context, message, meta));
      }
    }
  }
};

module.exports = logger;
