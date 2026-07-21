const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  monday: {
    apiToken: process.env.MONDAY_API_TOKEN || '',
    dealsBoardId: process.env.DEALS_BOARD_ID || '',
    workOrdersBoardId: process.env.WORK_ORDERS_BOARD_ID || '',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiApiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  }
};

// Runtime dynamic config storage (allows UI to override credentials if not set in .env)
const runtimeConfig = {
  mondayApiToken: config.monday.apiToken,
  dealsBoardId: config.monday.dealsBoardId,
  workOrdersBoardId: config.monday.workOrdersBoardId,
  columnMappings: null, // Stores mappings: { deals: { company: '...', value: '...' }, workOrders: { ... } }
  llmApiKey: config.llm.provider === 'gemini' ? config.llm.geminiApiKey : config.llm.openaiApiKey,
  llmProvider: config.llm.provider,
  openaiApiUrl: config.llm.openaiApiUrl
};

/**
 * Gets the active configuration, prioritizing runtime UI settings over .env files
 */
function getActiveConfig() {
  return {
    port: config.port,
    nodeEnv: config.nodeEnv,
    mondayApiToken: runtimeConfig.mondayApiToken || config.monday.apiToken,
    dealsBoardId: runtimeConfig.dealsBoardId || config.monday.dealsBoardId,
    workOrdersBoardId: runtimeConfig.workOrdersBoardId || config.monday.workOrdersBoardId,
    columnMappings: runtimeConfig.columnMappings,
    llmProvider: runtimeConfig.llmProvider || config.llm.provider,
    llmApiKey: runtimeConfig.llmApiKey || (runtimeConfig.llmProvider === 'gemini' ? config.llm.geminiApiKey : config.llm.openaiApiKey),
    openaiApiUrl: runtimeConfig.openaiApiUrl || config.llm.openaiApiUrl
  };
}

/**
 * Updates the runtime configuration dynamically from the UI
 */
function updateRuntimeConfig(newConfig) {
  if (newConfig.mondayApiToken !== undefined) runtimeConfig.mondayApiToken = newConfig.mondayApiToken;
  if (newConfig.dealsBoardId !== undefined) runtimeConfig.dealsBoardId = newConfig.dealsBoardId;
  if (newConfig.workOrdersBoardId !== undefined) runtimeConfig.workOrdersBoardId = newConfig.workOrdersBoardId;
  if (newConfig.columnMappings !== undefined) runtimeConfig.columnMappings = newConfig.columnMappings;
  if (newConfig.llmProvider !== undefined) runtimeConfig.llmProvider = newConfig.llmProvider;
  if (newConfig.llmApiKey !== undefined) runtimeConfig.llmApiKey = newConfig.llmApiKey;
  if (newConfig.openaiApiUrl !== undefined) runtimeConfig.openaiApiUrl = newConfig.openaiApiUrl;
}

module.exports = {
  config,
  getActiveConfig,
  updateRuntimeConfig
};
