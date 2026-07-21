'use strict';

/**
 * Query Controller.
 *
 * Handles POST /api/query — the natural language BI terminal endpoint.
 * Uses syncLiveData from mondayController to avoid duplicate fetch logic.
 * Feeds canonical datasets to the AI + Analytics pipeline.
 */

const aiService         = require('../services/aiService');
const analyticsEngine   = require('../services/analyticsEngine');
const dataCleaner       = require('../services/dataCleaner');
const { syncLiveData }  = require('./mondayController');
const logger            = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

/**
 * POST /api/query
 * Accepts a natural language query, runs the AI+Analytics pipeline,
 * and returns an executive briefing.
 */
async function runQuery(req, res, next) {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ValidationError('Query field is required and must be a non-empty string.');
    }

    logger.info('QueryController', `Incoming Query: "${query}"`);

    // 1. Fetch canonical datasets (uses cache when available)
    const { deals, workOrders, health } = await syncLiveData(false);

    // 2. Stage 1: AI Intent Parsing
    //    Pass compact column context (no raw Monday structures)
    const schemaContext = {
      deals: [
        { id: 'name', title: 'Deal Name', type: 'text' },
        { id: 'clientCode', title: 'Client Code', type: 'text' },
        { id: 'status', title: 'Deal Status', type: 'status' },
        { id: 'value', title: 'Deal Value', type: 'number' },
        { id: 'stage', title: 'Deal Stage', type: 'status' },
        { id: 'sector', title: 'Sector', type: 'status' },
        { id: 'ownerCode', title: 'Owner Code', type: 'status' },
        { id: 'createdDate', title: 'Created Date', type: 'date' },
        { id: 'closeDate', title: 'Close Date', type: 'date' },
      ],
      workOrders: [
        { id: 'dealName', title: 'Deal Name', type: 'text' },
        { id: 'serialNumber', title: 'Serial Number', type: 'text' },
        { id: 'executionStatus', title: 'Execution Status', type: 'status' },
        { id: 'amountExclGst', title: 'Amount Excl GST', type: 'number' },
        { id: 'billingStatus', title: 'Billing Status', type: 'status' },
        { id: 'sector', title: 'Sector', type: 'status' },
        { id: 'startDate', title: 'Start Date', type: 'date' },
        { id: 'endDate', title: 'End Date', type: 'date' },
        { id: 'amountReceivable', title: 'Amount Receivable', type: 'number' },
      ],
    };

    const plan = await aiService.parseIntent(query, schemaContext);

    // 3. Run Analytics Engine
    const analysisResults = analyticsEngine.runCustomAnalysis(deals, workOrders, plan);

    // 4. Stage 2: AI Response Synthesis
    const synthesized = await aiService.synthesizeResponse(query, analysisResults);

    // 5. Build reasoning timeline
    const reasoningTimeline = [
      { step: 'Understanding Request',      status: 'completed', details: `Intent: ${plan.intent || 'CUSTOM'}` },
      { step: 'Planning Analysis',          status: 'completed', details: `Selected metrics: ${plan.metrics ? plan.metrics.join(', ') : 'All KPIs'}` },
      { step: 'Fetching Monday.com Data',   status: 'completed', details: `Loaded ${deals.length} deals + ${workOrders.length} work orders` },
      { step: 'Cleaning & Normalizing',     status: 'completed', details: `Confidence score: ${health.confidenceScore}%` },
      { step: 'Running Analytics',          status: 'completed', details: `Joined ${analysisResults.joins.matchedCount} operational pairs` },
      { step: 'Generating Executive Brief', status: 'completed', details: 'Executive summary compiled' },
    ];

    res.status(200).json({
      status: 'success',
      data: {
        answer:            synthesized.answer,
        chartData:         synthesized.chartData,
        confidence:        synthesized.confidence,
        dataHealth:        health,
        kpis:              analysisResults.kpis,
        insights:          analysisResults.insights,
        joins:             analysisResults.joins,
        reasoningTimeline,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { runQuery };
