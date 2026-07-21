'use strict';

const express     = require('express');
const router      = express.Router();
const monday      = require('../controllers/mondayController');
const queryCtrl   = require('../controllers/queryController');
const { validateBody } = require('../middleware/validator');

// ─── Health ───────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
  const { getActiveConfig } = require('../config');
  const cfg = getActiveConfig();
  res.status(200).json({
    status:    'success',
    timestamp: new Date().toISOString(),
    env:       cfg.nodeEnv,
    monday: {
      configured:  !!cfg.mondayApiToken,
      dealsBoardId: cfg.dealsBoardId,
      workOrdersBoardId: cfg.workOrdersBoardId,
    },
  });
});

// ─── Monday Board Utilities ───────────────────────────────────────────────────

/** List accessible Monday.com boards */
router.get('/monday/boards', monday.getBoards);

/** Connection integrity and cache status */
router.get('/monday/status', monday.getStatus);

/** Update board mappings and credentials from UI settings panel */
router.post(
  '/monday/config',
  validateBody({
    dealsBoardId:      { required: true, type: 'string' },
    workOrdersBoardId: { required: true, type: 'string' },
  }),
  monday.saveConfig
);

/** Force full re-sync from Monday.com, bypasses all caches */
router.post('/monday/sync', monday.syncData);

// ─── Dashboard & Analytics ───────────────────────────────────────────────────

/** GET /api/dashboard — KPIs + insights + data health for main dashboard view */
router.get('/dashboard', monday.getDashboard);

/** GET /api/analytics — Full analytics result (KPIs + insights + joins) */
router.get('/analytics', monday.getAnalytics);

/** GET /api/analytics/kpis — Lightweight KPI-only endpoint */
router.get('/analytics/kpis', monday.getKPIs);

/** GET /api/data-health — Data cleaner quality report */
router.get('/data-health', monday.getDataHealth);

/** POST /api/refresh — Alias for /monday/sync */
router.post('/refresh', monday.syncData);

// ─── AI Query Terminal ────────────────────────────────────────────────────────

/** POST /api/query — Natural language BI query endpoint */
router.post(
  '/query',
  validateBody({
    query: { required: true, type: 'string' },
  }),
  queryCtrl.runQuery
);

module.exports = router;
