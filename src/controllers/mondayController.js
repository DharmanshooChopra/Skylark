const mondayService = require('../services/mondayService');
const cacheService = require('../services/cacheService');
const { getActiveConfig, updateRuntimeConfig } = require('../config');
const logger = require('../utils/logger');

/**
 * Lists all boards mapped from the Monday integration token.
 */
async function getBoards(req, res, next) {
  try {
    const boards = await mondayService.fetchBoards();
    res.status(200).json({
      status: 'success',
      data: boards
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns connection integrity mapping parameters and cache presence.
 */
async function getStatus(req, res, next) {
  try {
    const activeConfig = getActiveConfig();
    const dealsCached = cacheService.has(cacheService.cacheKeys.CLEANED_DEALS);
    const workOrdersCached = cacheService.has(cacheService.cacheKeys.CLEANED_WORK_ORDERS);
    
    res.status(200).json({
      status: 'success',
      data: {
        connected: !!activeConfig.mondayApiToken,
        hasDealsBoard: !!activeConfig.dealsBoardId,
        hasWorkOrdersBoard: !!activeConfig.workOrdersBoardId,
        columnMappings: activeConfig.columnMappings,
        cache: {
          dealsCached,
          workOrdersCached,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Saves column mappings and board configurations from the UI onboarding flow.
 */
async function saveConfig(req, res, next) {
  try {
    const { dealsBoardId, workOrdersBoardId, columnMappings, llmApiKey, llmProvider } = req.body;
    
    logger.info('MondayController', 'Updating runtime configuration parameters');
    
    updateRuntimeConfig({
      dealsBoardId,
      workOrdersBoardId,
      columnMappings,
      llmApiKey,
      llmProvider
    });

    // Invalidate old caches as board config changed
    cacheService.flush();

    res.status(200).json({
      status: 'success',
      message: 'Platform configuration updated. Cache cleared.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Triggers a manual synchronization cycle, bypassing local cache keys.
 */
async function syncData(req, res, next) {
  try {
    logger.info('MondayController', 'Force-synchronizing datasets...');
    
    const activeConfig = getActiveConfig();
    if (!activeConfig.dealsBoardId || !activeConfig.workOrdersBoardId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot sync. Board IDs are not configured. Go to Settings.'
      });
    }

    // 1. Fetch raw datasets from placeholders
    const rawDeals = await mondayService.fetchBoardItems(activeConfig.dealsBoardId);
    const rawWorkOrders = await mondayService.fetchBoardItems(activeConfig.workOrdersBoardId);

    // 2. Cache raw values
    cacheService.set(cacheService.cacheKeys.RAW_DEALS, rawDeals.items);
    cacheService.set(cacheService.cacheKeys.RAW_WORK_ORDERS, rawWorkOrders.items);

    // 3. Mark cache as successfully populated with cleaned placeholders (empty for now)
    cacheService.set(cacheService.cacheKeys.CLEANED_DEALS, []);
    cacheService.set(cacheService.cacheKeys.CLEANED_WORK_ORDERS, []);

    res.status(200).json({
      status: 'success',
      message: 'Mock synchronization completed successfully.',
      data: {
        dealsCount: rawDeals.items.length,
        workOrdersCount: rawWorkOrders.items.length,
        health: {
          score: 100,
          notes: 'Phase 1 static verification success'
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBoards,
  getStatus,
  saveConfig,
  syncData
};
