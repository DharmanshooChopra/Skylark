const aiService = require('../services/aiService');
const analyticsEngine = require('../services/analyticsEngine');
const cacheService = require('../services/cacheService');
const dataCleaner = require('../services/dataCleaner');
const mondayService = require('../services/mondayService');
const { getActiveConfig } = require('../config');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

/**
 * Main query controller handling natural language queries.
 */
async function runQuery(req, res, next) {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ValidationError('Query field is required and must be a non-empty string.');
    }

    logger.info('QueryController', `Incoming Query: "${query}"`);

    const activeConfig = getActiveConfig();
    if (!activeConfig.dealsBoardId || !activeConfig.workOrdersBoardId) {
      throw new ValidationError('Board connections are unconfigured. Please configure them in Settings.');
    }

    // 1. Fetch metadata/schemas
    const dealsSchema = await mondayService.fetchBoardMetadata(activeConfig.dealsBoardId);
    const workOrdersSchema = await mondayService.fetchBoardMetadata(activeConfig.workOrdersBoardId);

    // 2. Fetch or sync datasets
    let cleanDeals = cacheService.get(cacheService.cacheKeys.CLEANED_DEALS);
    let cleanWorkOrders = cacheService.get(cacheService.cacheKeys.CLEANED_WORK_ORDERS);

    if (!cleanDeals || !cleanWorkOrders) {
      logger.info('QueryController', 'Cache miss. Synching live Monday boards dynamically...');
      
      const rawDeals = await mondayService.fetchBoardItems(activeConfig.dealsBoardId);
      const rawWorkOrders = await mondayService.fetchBoardItems(activeConfig.workOrdersBoardId);
      
      // Reset data cleaner stats before clean run
      dataCleaner.resetReport();
      
      cleanDeals = dataCleaner.cleanDeals(rawDeals.items, activeConfig.columnMappings);
      cleanWorkOrders = dataCleaner.cleanWorkOrders(rawWorkOrders.items, activeConfig.columnMappings);

      cacheService.set(cacheService.cacheKeys.CLEANED_DEALS, cleanDeals);
      cacheService.set(cacheService.cacheKeys.CLEANED_WORK_ORDERS, cleanWorkOrders);
    }

    // 3. Stage 1: AI Intent Parsing
    const plan = await aiService.parseIntent(query, {
      deals: dealsSchema.columns,
      workOrders: workOrdersSchema.columns
    });

    // 4. Run Analytics Engine Calculations
    const analysisResults = analyticsEngine.runCustomAnalysis(cleanDeals, cleanWorkOrders, plan);

    // 5. Stage 2: AI Response Synthesis
    const synthesized = await aiService.synthesizeResponse(query, analysisResults);

    // 6. Fetch data health reports
    const dataHealth = dataCleaner.getDataHealthReport();

    // 7. Compile Execution Reasoning Timeline details
    const reasoningTimeline = [
      { step: 'Understanding Request', status: 'completed', details: `Intent parser extracted: ${plan.intent || 'CUSTOM'}` },
      { step: 'Planning Analysis', status: 'completed', details: `Selected KPIs: ${plan.metrics ? plan.metrics.join(', ') : 'All'}` },
      { step: 'Fetching Monday Data', status: 'completed', details: 'Loaded active boards datasets from in-memory cache' },
      { step: 'Cleaning Data', status: 'completed', details: `Normalized ${cleanDeals.length} deals and ${cleanWorkOrders.length} work orders` },
      { step: 'Running Analytics', status: 'completed', details: `Joined ${analysisResults.joins.matchedCount} operational pairs` },
      { step: 'Generating Executive Brief', status: 'completed', details: 'Formulated markdown report layout' }
    ];

    res.status(200).json({
      status: 'success',
      data: {
        answer: synthesized.answer,
        chartData: synthesized.chartData,
        confidence: synthesized.confidence,
        dataHealth,
        reasoningTimeline
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  runQuery
};
