'use strict';

/**
 * Monday.com GraphQL Integration Service.
 *
 * Responsibilities:
 *  - Authenticated GraphQL client (uses centralized config — never process.env directly)
 *  - Automatic cursor-based pagination via items_page
 *  - Retry with exponential backoff on transient errors
 *  - Timeout handling
 *  - Rate-limit (429) handling
 *  - Structured error responses using MondayAPIError
 *  - Schema Adapter: converts raw Monday items → CanonicalDeal / CanonicalWorkOrder
 *  - Cache integration (cache key lifecycle managed here)
 *
 * Architecture Rule: Monday.com data structures NEVER leave this module.
 *                    Only canonical objects are returned to callers.
 */

const axios    = require('axios');
const { getActiveConfig } = require('../config');
const cacheService        = require('./cacheService');
const logger              = require('../utils/logger');
const { MondayAPIError }  = require('../utils/errors');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_VER = '2024-01';

const MAX_RETRIES     = 3;
const INITIAL_BACKOFF = 1000; // ms

// Discovered column ID mapping (from live schema discovery 2026-07-21)
const DEALS_COLUMN_MAP = {
  name:               'name',                // item.name (not a column_value)
  clientCode:         'dropdown_mm5f9se1',
  status:             'color_mm5f9xkm',
  value:              'numeric_mm5f31m2',
  stage:              'color_mm5fy17b',
  sector:             'color_mm5f7e9t',
  ownerCode:          'color_mm5f5191',
  closureProbability: 'color_mm5fvdrs',
  productType:        'color_mm5f7r9x',
  createdDate:        'date_mm5f7t8a',
  closeDate:          'date_mm5f2cng',
  tentativeCloseDate: 'date_mm5fwj8g',
};

const WO_COLUMN_MAP = {
  dealName:             'name',              // item.name (not a column_value)
  serialNumber:         'dropdown_mm5frdrq',
  customerCode:         'dropdown_mm5fc6hp',
  executionStatus:      'color_mm5fs03f',
  natureOfWork:         'color_mm5fy0w9',
  sector:               'color_mm5fvyse',
  typeOfWork:           'color_mm5fm5fm',
  ownerCode:            'color_mm5f678m',
  amountExclGst:        'numeric_mm5fk36d',
  amountInclGst:        'numeric_mm5f9w47',
  billedValueExclGst:   'numeric_mm5fd8zs',
  billedValueInclGst:   'numeric_mm5fy3k8',
  collectedAmount:      'numeric_mm5fhza8',
  unbilledAmountExclGst:'numeric_mm5fw1n1',
  unbilledAmountInclGst:'numeric_mm5fnhwc',
  amountReceivable:     'numeric_mm5fv6q9',
  billingStatus:        'color_mm5fkc7h',
  invoiceStatus:        'color_mm5f6yrh',
  woStatus:             'color_mm5ffdk3',
  documentType:         'color_mm5f10q9',
  skylarkPlatform:      'color_mm5fmwm2',
  arPriority:           'color_mm5f8rzc',
  startDate:            'date_mm5fzbc5',
  endDate:              'date_mm5fdq7c',
  poDate:               'date_mm5f8wyx',
  deliveryDate:         'date_mm5frpzs',
  lastInvoiceDate:      'date_mm5fdtgz',
  collectionDate:       'text_mm5fttt2',   // ⚠️ free text — parsed in cleaner
  latestInvoiceNo:      'dropdown_mm5fkkr4',
  quantitiesPo:         'dropdown_mm5fcs4',
  quantityByOps:        'numeric_mm5fqbgj',
  quantityBilled:       'numeric_mm5fpf3s',
  balanceQuantity:      'numeric_mm5f3ryn',
  expectedBillingMonth: 'text_mm5ffc1b',
  actualBillingMonth:   'color_mm5fn7wv',
  actualCollectionMonth:'text_mm5f3sqc',
  collectionStatus:     'text_mm5fbvx7',
  lastRecurringMonth:   'color_mm5ft2km',
};

// ─────────────────────────────────────────────────────────────────────────────
// GRAPHQL QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the items_page GraphQL query for a single board page.
 * Uses cursor-based pagination via items_page.
 */
function buildItemsPageQuery(boardId, cursor) {
  const pagination = cursor
    ? `(limit: 100, cursor: "${cursor}")`
    : `(limit: 100)`;

  return `{
    boards(ids: [${boardId}]) {
      id
      name
      items_count
      items_page${pagination} {
        cursor
        items {
          id
          name
          created_at
          updated_at
          column_values {
            id
            text
            value
          }
        }
      }
    }
  }`;
}

/**
 * Builds the board schema query (columns only, no items).
 */
function buildSchemaQuery(boardId) {
  return `{
    boards(ids: [${boardId}]) {
      id
      name
      board_kind
      items_count
      columns {
        id
        title
        type
        settings_str
      }
    }
  }`;
}

/**
 * Builds the boards listing query.
 */
function buildBoardsQuery() {
  return `{
    boards(limit: 50) {
      id
      name
      board_kind
      items_count
    }
  }`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP CLIENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a single GraphQL request against Monday.com API.
 * Handles auth, timeout, and raw error parsing.
 * Does NOT handle retries — retries are handled by the caller.
 *
 * @param {string} query    GraphQL query string
 * @param {string} token    Monday API token
 * @param {number} timeout  Request timeout in ms
 * @returns {Promise<Object>} Parsed data from response
 */
async function executeGraphQL(query, token, timeout) {
  const response = await axios.post(
    MONDAY_API_URL,
    { query },
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': token,
        'API-Version':   MONDAY_API_VER,
      },
      timeout,
    }
  );

  const { data: body } = response;

  // Monday returns HTTP 200 even for auth/graph errors — check body
  if (body.errors && body.errors.length > 0) {
    const msg = body.errors.map(e => e.message).join('; ');
    throw new MondayAPIError(`GraphQL error: ${msg}`, 502);
  }

  if (!body.data) {
    throw new MondayAPIError('Monday API returned empty data payload', 502);
  }

  return body.data;
}

/**
 * Executes a GraphQL query with exponential backoff retry.
 * Handles 429 rate-limit and transient 5xx network errors automatically.
 *
 * @param {string} query
 * @returns {Promise<Object>}
 */
async function graphql(query) {
  const cfg     = getActiveConfig();
  const token   = cfg.mondayApiToken;
  const timeout = cfg.requestTimeout;

  if (!token) {
    throw new MondayAPIError('MONDAY_API_TOKEN is not configured', 401);
  }

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await executeGraphQL(query, token, timeout);

    } catch (err) {
      lastError = err;

      // Non-retryable: auth errors or graphql errors from Monday
      if (err instanceof MondayAPIError && err.statusCode === 401) throw err;
      if (err instanceof MondayAPIError && err.statusCode === 400) throw err;

      // Rate limit: wait for Retry-After header or exponential backoff
      const isRateLimit = err.response && err.response.status === 429;
      const isTransient  = err.response && err.response.status >= 500;
      const isTimeout    = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      const isNetwork    = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';

      if (!isRateLimit && !isTransient && !isTimeout && !isNetwork && !(err instanceof MondayAPIError)) {
        throw err; // Not retryable
      }

      if (attempt === MAX_RETRIES) break;

      const retryAfter = isRateLimit && err.response?.headers?.['retry-after']
        ? parseInt(err.response.headers['retry-after'], 10) * 1000
        : INITIAL_BACKOFF * Math.pow(2, attempt);

      logger.warn('MondayService', `Attempt ${attempt + 1} failed. Retrying in ${retryAfter}ms...`, {
        error: err.message,
        isRateLimit,
        isTimeout
      });

      await new Promise(resolve => setTimeout(resolve, retryAfter));
    }
  }

  throw new MondayAPIError(
    `Monday API request failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`,
    lastError.response?.status || 502
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches ALL items from a board using cursor-based pagination.
 * Each page fetches up to 100 items. Iterates until cursor is null.
 *
 * @param {string} boardId
 * @returns {Promise<{boardId, boardName, itemsCount, items: Array}>}
 */
async function fetchAllBoardItems(boardId) {
  const allItems  = [];
  let cursor      = null;
  let boardName   = '';
  let itemsCount  = 0;
  let pageNum     = 0;

  logger.info('MondayService', `Starting paginated fetch for board ${boardId}`);

  do {
    pageNum++;
    const query = buildItemsPageQuery(boardId, cursor);
    const data  = await graphql(query);

    const board = data.boards && data.boards[0];
    if (!board) break;

    boardName  = board.name;
    itemsCount = board.items_count || 0;

    const page = board.items_page;
    if (!page || !page.items || page.items.length === 0) break;

    allItems.push(...page.items);
    cursor = page.cursor || null;

    logger.info('MondayService', `Page ${pageNum}: fetched ${page.items.length} items (total: ${allItems.length}/${itemsCount})`);

  } while (cursor);

  logger.info('MondayService', `Pagination complete for board ${boardId}: ${allItems.length} items across ${pageNum} page(s)`);

  return { boardId, boardName, itemsCount: allItems.length, items: allItems };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALUE EXTRACTORS (Monday field type rules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a lookup map from column_values array for O(1) access.
 * @param {Array} columnValues
 * @returns {Map<string, {text, value}>}
 */
function buildColMap(columnValues) {
  const map = new Map();
  if (!Array.isArray(columnValues)) return map;
  for (const cv of columnValues) {
    map.set(cv.id, { text: cv.text, value: cv.value });
  }
  return map;
}

/**
 * Reads a Status or Dropdown column value using .text display field.
 * Rule: NEVER use raw .value for status/dropdown (it contains {index:n} or {ids:[n]}).
 */
function readText(colMap, colId) {
  const col = colMap.get(colId);
  if (!col) return null;
  return col.text != null && col.text !== '' ? String(col.text).trim() : null;
}

/**
 * Reads a Numbers column value using parseFloat on .text.
 * Rule: .text is already the formatted number string.
 * IMPORTANT: Allows negative values — do not clamp to 0.
 */
function readNumber(colMap, colId) {
  const col = colMap.get(colId);
  if (!col || col.text == null || col.text === '') return null;
  const n = parseFloat(String(col.text).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Reads a Date column value from the .value JSON {"date":"YYYY-MM-DD"}.
 * Rule: NEVER use .text for dates — it can be localized.
 */
function readDate(colMap, colId) {
  const col = colMap.get(colId);
  if (!col || !col.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    return parsed.date || null;
  } catch {
    // Fallback: if value is already a plain date string
    const s = String(col.value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapts a raw Monday.com item (Deals board) → CanonicalDeal.
 *
 * Monday structures NEVER leave this function.
 * Field extraction follows the discovered column ID mapping exactly.
 *
 * @param {Object} item  Raw Monday item
 * @returns {Object}     CanonicalDeal
 */
function adaptDeal(item) {
  const colMap = buildColMap(item.column_values);

  return {
    // Canonical identifier
    id:                 String(item.id),

    // Core identification (item.name is the item title, not a column_value)
    name:               String(item.name || '').trim(),

    // Coded fields — read via .text (dropdown/status labels)
    clientCode:         readText(colMap, DEALS_COLUMN_MAP.clientCode)         || 'N/A',
    ownerCode:          readText(colMap, DEALS_COLUMN_MAP.ownerCode)          || 'N/A',
    status:             readText(colMap, DEALS_COLUMN_MAP.status)             || null,
    stage:              readText(colMap, DEALS_COLUMN_MAP.stage)              || 'N/A',
    sector:             readText(colMap, DEALS_COLUMN_MAP.sector)             || 'N/A',
    closureProbability: readText(colMap, DEALS_COLUMN_MAP.closureProbability) || 'None',
    productType:        readText(colMap, DEALS_COLUMN_MAP.productType)        || 'N/A',

    // Numeric — read via parseFloat(.text)
    value:              readNumber(colMap, DEALS_COLUMN_MAP.value)            ?? 0,

    // Dates — read via .value JSON
    createdDate:        readDate(colMap, DEALS_COLUMN_MAP.createdDate)        || item.created_at?.split('T')[0] || null,
    closeDate:          readDate(colMap, DEALS_COLUMN_MAP.closeDate)          || null,
    tentativeCloseDate: readDate(colMap, DEALS_COLUMN_MAP.tentativeCloseDate) || null,

    // Metadata
    _mondayCreatedAt:   item.created_at  || null,
    _mondayUpdatedAt:   item.updated_at  || null,
  };
}

/**
 * Adapts a raw Monday.com item (Work Orders board) → CanonicalWorkOrder.
 *
 * Monday structures NEVER leave this function.
 * Field extraction follows the discovered column ID mapping exactly.
 *
 * @param {Object} item  Raw Monday item
 * @returns {Object}     CanonicalWorkOrder
 */
function adaptWorkOrder(item) {
  const colMap = buildColMap(item.column_values);

  return {
    // Canonical identifier
    id:                   String(item.id),

    // Core identification
    dealName:             String(item.name || '').trim(),

    // Coded fields — read via .text
    serialNumber:         readText(colMap, WO_COLUMN_MAP.serialNumber)         || 'N/A',
    customerCode:         readText(colMap, WO_COLUMN_MAP.customerCode)         || 'N/A',
    executionStatus:      readText(colMap, WO_COLUMN_MAP.executionStatus)      || null,
    natureOfWork:         readText(colMap, WO_COLUMN_MAP.natureOfWork)         || 'N/A',
    sector:               readText(colMap, WO_COLUMN_MAP.sector)               || 'N/A',
    typeOfWork:           readText(colMap, WO_COLUMN_MAP.typeOfWork)           || 'N/A',
    ownerCode:            readText(colMap, WO_COLUMN_MAP.ownerCode)            || 'N/A',
    documentType:         readText(colMap, WO_COLUMN_MAP.documentType)         || 'N/A',
    skylarkPlatform:      readText(colMap, WO_COLUMN_MAP.skylarkPlatform)      || 'NONE',
    arPriority:           readText(colMap, WO_COLUMN_MAP.arPriority)           || '',
    billingStatus:        readText(colMap, WO_COLUMN_MAP.billingStatus)        || 'Unbilled',
    invoiceStatus:        readText(colMap, WO_COLUMN_MAP.invoiceStatus)        || 'N/A',
    woStatus:             readText(colMap, WO_COLUMN_MAP.woStatus)             || 'Open',
    latestInvoiceNo:      readText(colMap, WO_COLUMN_MAP.latestInvoiceNo)      || null,
    quantitiesPo:         readText(colMap, WO_COLUMN_MAP.quantitiesPo)         || null,
    actualBillingMonth:   readText(colMap, WO_COLUMN_MAP.actualBillingMonth)   || null,
    lastRecurringMonth:   readText(colMap, WO_COLUMN_MAP.lastRecurringMonth)   || null,

    // Text fields (free-form)
    expectedBillingMonth: readText(colMap, WO_COLUMN_MAP.expectedBillingMonth) || null,
    actualCollectionMonth:readText(colMap, WO_COLUMN_MAP.actualCollectionMonth)|| null,
    collectionStatus:     readText(colMap, WO_COLUMN_MAP.collectionStatus)     || null,
    // ⚠️ Collection Date is stored as free text — dataCleaner will parse it
    collectionDate:       readText(colMap, WO_COLUMN_MAP.collectionDate)       || null,

    // Numeric fields — allow negatives (especially unbilledAmountExclGst)
    amountExclGst:         readNumber(colMap, WO_COLUMN_MAP.amountExclGst)         ?? 0,
    amountInclGst:         readNumber(colMap, WO_COLUMN_MAP.amountInclGst)         ?? 0,
    billedValueExclGst:    readNumber(colMap, WO_COLUMN_MAP.billedValueExclGst)    ?? 0,
    billedValueInclGst:    readNumber(colMap, WO_COLUMN_MAP.billedValueInclGst)    ?? 0,
    collectedAmount:       readNumber(colMap, WO_COLUMN_MAP.collectedAmount)       ?? 0,
    unbilledAmountExclGst: readNumber(colMap, WO_COLUMN_MAP.unbilledAmountExclGst) ?? 0, // CAN be negative
    unbilledAmountInclGst: readNumber(colMap, WO_COLUMN_MAP.unbilledAmountInclGst) ?? 0,
    amountReceivable:      readNumber(colMap, WO_COLUMN_MAP.amountReceivable)      ?? 0,
    quantityByOps:         readNumber(colMap, WO_COLUMN_MAP.quantityByOps)         ?? 0,
    quantityBilled:        readNumber(colMap, WO_COLUMN_MAP.quantityBilled)        ?? 0,
    balanceQuantity:       readNumber(colMap, WO_COLUMN_MAP.balanceQuantity)       ?? 0,

    // Date fields — read via .value JSON
    startDate:             readDate(colMap, WO_COLUMN_MAP.startDate)             || null,
    endDate:               readDate(colMap, WO_COLUMN_MAP.endDate)               || null,
    poDate:                readDate(colMap, WO_COLUMN_MAP.poDate)                || null,
    deliveryDate:          readDate(colMap, WO_COLUMN_MAP.deliveryDate)          || null,
    lastInvoiceDate:       readDate(colMap, WO_COLUMN_MAP.lastInvoiceDate)       || null,
    dataDeliveryDate:      readDate(colMap, WO_COLUMN_MAP.deliveryDate)          || null, // alias

    // Metadata
    _mondayCreatedAt:     item.created_at || null,
    _mondayUpdatedAt:     item.updated_at || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches and adapts all items from the Deals board.
 * Uses cache if available.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{boardId, boardName, itemsCount, items: CanonicalDeal[]}>}
 */
async function fetchDeals(forceRefresh = false) {
  const cfg     = getActiveConfig();
  const boardId = cfg.dealsBoardId;
  const cacheKey = `${cacheService.cacheKeys.RAW_DEALS}_adapted`;

  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) {
      logger.info('MondayService', `Cache hit: Deals (${cached.items.length} items)`);
      return cached;
    }
  }

  const raw    = await fetchAllBoardItems(boardId);
  const result = {
    boardId:    raw.boardId,
    boardName:  raw.boardName,
    itemsCount: raw.itemsCount,
    items:      raw.items.map(adaptDeal),
  };

  cacheService.set(cacheKey, result);
  logger.info('MondayService', `Fetched & adapted ${result.items.length} deals from board ${boardId}`);
  return result;
}

/**
 * Fetches and adapts all items from the Work Orders board.
 * Uses cache if available.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{boardId, boardName, itemsCount, items: CanonicalWorkOrder[]}>}
 */
async function fetchWorkOrders(forceRefresh = false) {
  const cfg     = getActiveConfig();
  const boardId = cfg.workOrdersBoardId;
  const cacheKey = `${cacheService.cacheKeys.RAW_WORK_ORDERS}_adapted`;

  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) {
      logger.info('MondayService', `Cache hit: Work Orders (${cached.items.length} items)`);
      return cached;
    }
  }

  const raw    = await fetchAllBoardItems(boardId);
  const result = {
    boardId:    raw.boardId,
    boardName:  raw.boardName,
    itemsCount: raw.itemsCount,
    items:      raw.items.map(adaptWorkOrder),
  };

  cacheService.set(cacheKey, result);
  logger.info('MondayService', `Fetched & adapted ${result.items.length} work orders from board ${boardId}`);
  return result;
}

/**
 * Fetches board metadata (columns schema only, no items).
 * Used by query controller for schema context.
 *
 * @param {string} boardId
 * @returns {Promise<{id, name, columns}>}
 */
async function fetchBoardMetadata(boardId) {
  const cacheKey = `${cacheService.cacheKeys.BOARD_METADATA_PREFIX}${boardId}`;
  const cached   = cacheService.get(cacheKey);
  if (cached) return cached;

  const data  = await graphql(buildSchemaQuery(boardId));
  const board = data.boards && data.boards[0];
  if (!board) throw new MondayAPIError(`Board ${boardId} not found`, 404);

  const result = {
    id:      board.id,
    name:    board.name,
    columns: board.columns || [],
  };

  // Cache board schema for 30 minutes (structural changes are rare)
  cacheService.set(cacheKey, result, 1800);
  return result;
}

/**
 * Lists all accessible boards for the configured token.
 *
 * @returns {Promise<Array<{id, name, board_kind, items_count}>>}
 */
async function fetchBoards() {
  const cacheKey = cacheService.cacheKeys.BOARD_LIST;
  const cached   = cacheService.get(cacheKey);
  if (cached) return cached;

  const data   = await graphql(buildBoardsQuery());
  const boards = (data.boards || []).map(b => ({
    id:          String(b.id),
    name:        b.name,
    type:        b.board_kind,
    itemsCount:  b.items_count || 0,
  }));

  cacheService.set(cacheKey, boards, 300);
  return boards;
}

/**
 * Legacy compatibility wrapper used by queryController.
 * Returns raw (unadapted) items list for a board.
 * @deprecated Use fetchDeals() or fetchWorkOrders() instead.
 */
async function fetchBoardItems(boardId) {
  const cfg = getActiveConfig();
  if (boardId === cfg.dealsBoardId) {
    const result = await fetchDeals();
    return { boardId, boardName: result.boardName, columns: [], items: result.items };
  }
  if (boardId === cfg.workOrdersBoardId) {
    const result = await fetchWorkOrders();
    return { boardId, boardName: result.boardName, columns: [], items: result.items };
  }
  // Unknown board: raw fetch without adaptation
  const raw = await fetchAllBoardItems(boardId);
  return { boardId, boardName: raw.boardName, columns: [], items: raw.items };
}

/**
 * Verifies Monday.com authentication by fetching the current user's account.
 * Returns true on success, throws MondayAPIError on failure.
 *
 * @returns {Promise<boolean>}
 */
async function verifyAuth() {
  const query = `{ me { id name email account { id name } } }`;
  const data  = await graphql(query);
  if (!data.me) throw new MondayAPIError('Authentication failed: no user returned', 401);
  logger.info('MondayService', `Authenticated as: ${data.me.name} (${data.me.email})`);
  return true;
}

module.exports = {
  fetchBoards,
  fetchBoardMetadata,
  fetchBoardItems,   // legacy compat
  fetchDeals,
  fetchWorkOrders,
  verifyAuth,
  // Export adapters for direct use in tests
  adaptDeal,
  adaptWorkOrder,
  // Export column maps for cleaner reference
  DEALS_COLUMN_MAP,
  WO_COLUMN_MAP,
};
