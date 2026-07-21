const app = require('./app');
const { getMaskedConfigSummary, getActiveConfig } = require('./config');
const logger = require('./utils/logger');

// Catch uncaught exceptions before starting anything
process.on('uncaughtException', (error) => {
  logger.error('System', 'CRITICAL: Uncaught Exception detected!', error);
  process.exit(1);
});

const cfg = getActiveConfig();
const summary = getMaskedConfigSummary();

const server = app.listen(cfg.port, () => {
  logger.info('System', `======================================================`);
  logger.info('System', `SKYLARK TERMINAL IS ONLINE | PORT: ${summary.port}`);
  logger.info('System', `ENVIRONMENT:        ${summary.nodeEnv}`);
  logger.info('System', `Monday Token:       ${summary.mondayToken}`);
  logger.info('System', `Deals Board ID:     ${summary.dealsBoardId}`);
  logger.info('System', `Work Orders Board:  ${summary.workOrdersBoardId}`);
  logger.info('System', `LLM Provider:       ${summary.llmProvider.toUpperCase()} | Key Set: ${summary.llmKeySet}`);
  logger.info('System', `Cache Enabled:      ${summary.cacheEnabled} | TTL: ${summary.cacheTtl}s`);
  logger.info('System', `Request Timeout:    ${summary.requestTimeout}ms`);
  logger.info('System', `======================================================`);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('System', 'CRITICAL: Unhandled Promise Rejection detected!', reason);
  server.close(() => {
    process.exit(1);
  });
});

