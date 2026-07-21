const NodeCache = require('node-cache');
const { getActiveConfig } = require('../config');

// Respect CACHE_TTL from environment (defaults to 300s / 5 minutes)
const ttl = getActiveConfig().cacheTtl || 300;
const cache = new NodeCache({ stdTTL: ttl, checkperiod: 60 });

const cacheKeys = {
  RAW_DEALS: 'raw_deals_data',
  RAW_WORK_ORDERS: 'raw_work_orders_data',
  CLEANED_DEALS: 'cleaned_deals_data',
  CLEANED_WORK_ORDERS: 'cleaned_work_orders_data',
  ANALYTICS_RESULTS: 'analytics_results',
  BOARD_LIST: 'monday_board_list',
  BOARD_METADATA_PREFIX: 'board_metadata_'
};

/**
 * Get a value from the cache
 * @param {string} key 
 * @returns {any} Cached value or undefined
 */
function get(key) {
  return cache.get(key);
}

/**
 * Set a value in the cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} [ttl] Optional custom TTL in seconds
 * @returns {boolean} Success status
 */
function set(key, value, ttl) {
  if (ttl !== undefined) {
    return cache.set(key, value, ttl);
  }
  return cache.set(key, value);
}

/**
 * Delete key(s) from the cache
 * @param {string|string[]} key 
 * @returns {number} Count of deleted keys
 */
function del(key) {
  return cache.del(key);
}

/**
 * Flush all data from the cache
 */
function flush() {
  cache.flushAll();
}

/**
 * Check if a key exists
 * @param {string} key 
 * @returns {boolean} True if exists
 */
function has(key) {
  return cache.has(key);
}

module.exports = {
  cacheKeys,
  get,
  set,
  del,
  flush,
  has
};
