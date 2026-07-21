'use strict';

/**
 * Monday.com Controller.
 *
 * Handles all board-related REST endpoints.
 * Delegates to mondayService (GraphQL) and analyticsEngine (KPI computation).
 * Never accesses process.env directly — uses centralized config.
 */

const mondayService   = require('../services/mondayService');
const cacheService    = require('../services/cacheService');
const dataCleaner     = require('../services/dataCleaner');
const analyticsEngine = require('../services/analyticsEngine');
const { getActiveConfig, updateRuntimeConfig } = require('../config');
const logger          = require('../utils/logger');
const { AppError }    = require('../utils/errors');

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Fetch, clean, and cache canonical datasets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches live data from both boards, cleans it, and stores in cache.
 * This is the single source of truth for the refresh cycle.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{deals, workOrders, health}>}
 */
async function syncLiveData(forceRefresh = false) {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cachedDeals = cacheService.get(cacheService.cacheKeys.CLEANED_DEALS);
    const cachedWOs   = cacheService.get(cacheService.cacheKeys.CLEANED_WORK_ORDERS);
    if (cachedDeals && cachedWOs) {
      logger.info('MondayController', `Cache hit: ${cachedDeals.length} deals, ${cachedWOs.length} work orders`);
      return {
        deals:      cachedDeals,
        workOrders: cachedWOs,
        health:     dataCleaner.getDataHealthReport(),
        fromCache:  true,
      };
    }
  }

  logger.info('MondayController', 'Fetching live data from Monday.com boards...');

  // Reset cleaner metrics for a fresh run
  dataCleaner.resetReport();

  // Parallel fetch of both boards (already adapted by mondayService)
  const [dealsResult, woResult] = await Promise.all([
    mondayService.fetchDeals(forceRefresh),
    mondayService.fetchWorkOrders(forceRefresh),
  ]);

  // The mondayService adapter already produces canonical-structured objects.
  // dataCleaner normalizes statuses, dates, and quality-flags them.
  const canonicalDeals = dataCleaner.cleanDeals(dealsResult.items, {
    name:        'name',
    status:      'status',
    value:       'value',
    stage:       'stage',
    createdDate: 'createdDate',
    closeDate:   'closeDate',
    owner:       'ownerCode',
    client:      'clientCode',
    sector:      'sector',
    probability: 'closureProbability',
  });

  const canonicalWOs = dataCleaner.cleanWorkOrders(woResult.items, {
    dealName:        'dealName',
    serialNumber:    'serialNumber',
    customerCode:    'customerCode',
    executionStatus: 'executionStatus',
    dataDeliveryDate:'dataDeliveryDate',
    poDate:          'poDate',
    startDate:       'startDate',
    endDate:         'endDate',
    owner:           'ownerCode',
    sector:          'sector',
    amountExclGst:   'amountExclGst',
    amountInclGst:   'amountInclGst',
    billingStatus:   'billingStatus',
    natureOfWork:    'natureOfWork',
    collectionDate:  'collectionDate',
  });

  // Store in cache
  cacheService.set(cacheService.cacheKeys.CLEANED_DEALS,       canonicalDeals);
  cacheService.set(cacheService.cacheKeys.CLEANED_WORK_ORDERS,  canonicalWOs);

  const health = dataCleaner.getDataHealthReport();

  logger.info('MondayController', `Sync complete: ${canonicalDeals.length} deals, ${canonicalWOs.length} work orders`, {
    score: health.confidenceScore
  });

  return {
    deals:      canonicalDeals,
    workOrders: canonicalWOs,
    health,
    fromCache:  false,
    meta: {
      dealsBoardName: dealsResult.boardName,
      woBoardName:    woResult.boardName,
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/monday/boards
 * Lists all Monday.com boards accessible with the configured token.
 */
async function getBoards(req, res, next) {
  try {
    const boards = await mondayService.fetchBoards();
    res.status(200).json({ status: 'success', data: boards });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/monday/status
 * Returns connection integrity, cache presence, and board config.
 */
async function getStatus(req, res, next) {
  try {
    const activeConfig    = getActiveConfig();
    const dealsCached     = cacheService.has(cacheService.cacheKeys.CLEANED_DEALS);
    const workOrdersCached= cacheService.has(cacheService.cacheKeys.CLEANED_WORK_ORDERS);

    res.status(200).json({
      status: 'success',
      data: {
        connected:          !!activeConfig.mondayApiToken,
        hasDealsBoard:      !!activeConfig.dealsBoardId,
        hasWorkOrdersBoard: !!activeConfig.workOrdersBoardId,
        dealsBoardId:       activeConfig.dealsBoardId,
        workOrdersBoardId:  activeConfig.workOrdersBoardId,
        columnMappings:     activeConfig.columnMappings,
        cache: {
          dealsCached,
          workOrdersCached,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/monday/config
 * Saves board configurations and credentials from UI settings panel.
 */
async function saveConfig(req, res, next) {
  try {
    const { dealsBoardId, workOrdersBoardId, columnMappings, llmApiKey, llmProvider, mondayApiToken } = req.body;

    logger.info('MondayController', 'Updating runtime configuration parameters');

    updateRuntimeConfig({
      dealsBoardId,
      workOrdersBoardId,
      columnMappings,
      llmApiKey,
      llmProvider,
      ...(mondayApiToken ? { mondayApiToken } : {}),
    });

    // Invalidate all data caches — board config changed
    cacheService.flush();

    res.status(200).json({
      status:  'success',
      message: 'Platform configuration updated. Cache cleared.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/monday/sync  (also aliased as POST /api/refresh)
 * Forces a full re-fetch from Monday.com, bypassing all caches.
 */
async function syncData(req, res, next) {
  try {
    logger.info('MondayController', 'Force-synchronizing live Monday.com datasets...');

    const activeConfig = getActiveConfig();
    if (!activeConfig.dealsBoardId || !activeConfig.workOrdersBoardId) {
      return res.status(400).json({
        status:  'fail',
        message: 'Cannot sync: board IDs are not configured.',
      });
    }

    const result = await syncLiveData(true); // force refresh

    res.status(200).json({
      status:  'success',
      message: 'Live Monday.com data synchronized successfully.',
      data: {
        dealsCount:       result.deals.length,
        workOrdersCount:  result.workOrders.length,
        fromCache:        result.fromCache,
        health: {
          score:      result.health.confidenceScore,
          validRecords: result.health.validRecords,
          warnings:   result.health.warnings.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard
 * Returns KPIs + data health — the main payload for the dashboard view.
 * Uses cache if available; triggers live sync on cache miss.
 */
async function getDashboard(req, res, next) {
  try {
    const { deals, workOrders, health } = await syncLiveData(false);

    // Run analytics on canonical data
    const analysisResult = analyticsEngine.runCustomAnalysis(deals, workOrders, { intent: 'DASHBOARD' });

    res.status(200).json({
      status: 'success',
      data: {
        kpis:         analysisResult.kpis,
        insights:     analysisResult.insights,
        confidence:   analysisResult.confidence,
        joins:        analysisResult.joins,
        dataHealth:   health,
        recordCounts: {
          deals:      deals.length,
          workOrders: workOrders.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/analytics
 * Returns the full analytics result (KPIs + insights + joins).
 */
async function getAnalytics(req, res, next) {
  try {
    const { deals, workOrders } = await syncLiveData(false);
    const result = analyticsEngine.runCustomAnalysis(deals, workOrders, { intent: 'FULL_ANALYTICS' });

    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/analytics/kpis
 * Returns only the KPI block for lightweight widget polling.
 */
async function getKPIs(req, res, next) {
  try {
    const { deals, workOrders } = await syncLiveData(false);
    const result = analyticsEngine.runCustomAnalysis(deals, workOrders, { intent: 'KPIS_ONLY' });

    res.status(200).json({ status: 'success', data: result.kpis });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/data-health
 * Returns the data cleaner quality report for the last sync run.
 */
async function getDataHealth(req, res, next) {
  try {
    // Ensure data has been loaded at least once
    await syncLiveData(false);
    const health = dataCleaner.getDataHealthReport();

    res.status(200).json({ status: 'success', data: health });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBoards,
  getStatus,
  saveConfig,
  syncData,
  getDashboard,
  getAnalytics,
  getKPIs,
  getDataHealth,
  // Internal helper exported for use by queryController
  syncLiveData,
};
