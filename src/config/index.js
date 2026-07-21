'use strict';

/**
 * Centralized Configuration Module.
 *
 * Responsibilities:
 *  - Load .env via dotenv (must be the FIRST thing that runs)
 *  - Validate required variables and FAIL FAST if any are missing
 *  - Apply typed defaults
 *  - Export a frozen config object and runtime-override helpers
 *  - Mask secrets in all log output
 *
 * RULE: No other module may access process.env directly.
 *       All configuration must come through this module.
 */

const dotenv = require('dotenv');
const path   = require('path');

// Load .env before anything else reads process.env
dotenv.config({ path: path.join(__dirname, '../../.env') });

// ─────────────────────────────────────────────────────────────────────────────
// 1. REQUIRED VARIABLE DECLARATIONS
//    Startup will terminate with a clear error if any of these are absent.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED = [
  'MONDAY_API_TOKEN',
  'MONDAY_DEALS_BOARD_ID',
  'MONDAY_WORKORDER_BOARD_ID',
];

const missing = REQUIRED.filter(key => !process.env[key] || !process.env[key].trim());
if (missing.length > 0) {
  // Use process.stderr directly — logger is not yet initialized at this point
  process.stderr.write(
    `\n[CONFIG] FATAL: Missing required environment variables:\n` +
    missing.map(k => `  • ${k}`).join('\n') +
    `\n\nCopy .env.example to .env and fill in the required values.\n\n`
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARSED & TYPED CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const config = Object.freeze({
  port:    parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev:   (process.env.NODE_ENV || 'development') === 'development',

  monday: Object.freeze({
    apiToken:         process.env.MONDAY_API_TOKEN,
    dealsBoardId:     process.env.MONDAY_DEALS_BOARD_ID,
    workOrdersBoardId: process.env.MONDAY_WORKORDER_BOARD_ID,
    apiVersion:       '2024-01',
    apiUrl:           'https://api.monday.com/v2',
  }),

  llm: Object.freeze({
    provider:     process.env.LLM_PROVIDER || 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiApiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  }),

  security: Object.freeze({
    jwtSecret: process.env.JWT_SECRET || 'skylark_dev_secret_replace_in_prod',
  }),

  cache: Object.freeze({
    ttl:     parseInt(process.env.CACHE_TTL || '300', 10),
    enabled: (process.env.ENABLE_CACHE || 'true') !== 'false',
  }),

  http: Object.freeze({
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
  }),

  features: Object.freeze({
    enableAI:        (process.env.ENABLE_AI        || 'true') !== 'false',
    enableAnalytics: (process.env.ENABLE_ANALYTICS || 'true') !== 'false',
    enableDebug:     (process.env.ENABLE_DEBUG     || 'false') === 'true',
  }),

  logging: Object.freeze({
    level: process.env.LOG_LEVEL || 'info',
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RUNTIME OVERRIDES
//    Allows the UI settings panel to override credentials at runtime without
//    requiring a server restart. Board IDs from .env are the canonical defaults.
// ─────────────────────────────────────────────────────────────────────────────
const _runtime = {
  mondayApiToken:     config.monday.apiToken,
  dealsBoardId:       config.monday.dealsBoardId,
  workOrdersBoardId:  config.monday.workOrdersBoardId,
  columnMappings:     null,
  llmProvider:        config.llm.provider,
  llmApiKey:          config.llm.provider === 'gemini' ? config.llm.geminiApiKey : config.llm.openaiApiKey,
  openaiApiUrl:       config.llm.openaiApiUrl,
};

/**
 * Returns the merged active configuration.
 * Runtime UI overrides take precedence over .env values.
 * Never exposes raw secrets — token is masked in logs by callers.
 *
 * @returns {Object}
 */
function getActiveConfig() {
  return {
    port:             config.port,
    nodeEnv:          config.nodeEnv,
    isDev:            config.isDev,

    // Monday
    mondayApiToken:   _runtime.mondayApiToken || config.monday.apiToken,
    dealsBoardId:     _runtime.dealsBoardId   || config.monday.dealsBoardId,
    workOrdersBoardId: _runtime.workOrdersBoardId || config.monday.workOrdersBoardId,
    mondayApiVersion: config.monday.apiVersion,
    mondayApiUrl:     config.monday.apiUrl,
    columnMappings:   _runtime.columnMappings,

    // LLM
    llmProvider: _runtime.llmProvider || config.llm.provider,
    llmApiKey:   _runtime.llmApiKey   || (
      (_runtime.llmProvider || config.llm.provider) === 'gemini'
        ? config.llm.geminiApiKey
        : config.llm.openaiApiKey
    ),
    openaiApiUrl: _runtime.openaiApiUrl || config.llm.openaiApiUrl,

    // Operational
    cacheTtl:       config.cache.ttl,
    cacheEnabled:   config.cache.enabled,
    requestTimeout: config.http.requestTimeout,
    features:       config.features,
    logLevel:       config.logging.level,
  };
}

/**
 * Updates runtime configuration dynamically from the UI settings panel.
 * Only whitelisted keys are accepted — all others are ignored.
 *
 * @param {Object} patch
 */
function updateRuntimeConfig(patch) {
  const allowed = [
    'mondayApiToken', 'dealsBoardId', 'workOrdersBoardId',
    'columnMappings', 'llmProvider', 'llmApiKey', 'openaiApiUrl',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      _runtime[key] = patch[key];
    }
  }
}

/**
 * Returns a safely masked summary of the current configuration for log output.
 * NEVER logs secret values in full.
 *
 * @returns {Object}
 */
function getMaskedConfigSummary() {
  const active = getActiveConfig();
  return {
    port:             active.port,
    nodeEnv:          active.nodeEnv,
    mondayToken:      active.mondayApiToken ? `${active.mondayApiToken.slice(0, 10)}...` : 'NOT SET',
    dealsBoardId:     active.dealsBoardId,
    workOrdersBoardId: active.workOrdersBoardId,
    llmProvider:      active.llmProvider,
    llmKeySet:        !!active.llmApiKey,
    cacheTtl:         active.cacheTtl,
    cacheEnabled:     active.cacheEnabled,
    requestTimeout:   active.requestTimeout,
    features:         active.features,
  };
}

module.exports = {
  config,
  getActiveConfig,
  updateRuntimeConfig,
  getMaskedConfigSummary,
};
