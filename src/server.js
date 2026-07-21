const app = require('./app');
const { getActiveConfig } = require('./config');
const logger = require('./utils/logger');

// Catch uncaught exceptions before starting anything
process.on('uncaughtException', (error) => {
  logger.error('System', 'CRITICAL: Uncaught Exception detected!', error);
  process.exit(1);
});

const activeConfig = getActiveConfig();
const PORT = activeConfig.port;

const server = app.listen(PORT, () => {
  logger.info('System', `======================================================`);
  logger.info('System', `SKYLARK TERMINAL IS ONLINE | PORT: ${PORT}`);
  logger.info('System', `ENVIRONMENT: ${process.env.NODE_ENV || 'development'}`);
  logger.info('System', `Monday Token Configured: ${activeConfig.mondayApiToken ? 'YES' : 'NO'}`);
  logger.info('System', `LLM Provider Selected: ${activeConfig.llmProvider.toUpperCase()}`);
  logger.info('System', `======================================================`);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('System', 'CRITICAL: Unhandled Promise Rejection detected!', reason);
  // Gracefully close server and exit
  server.close(() => {
    process.exit(1);
  });
});
