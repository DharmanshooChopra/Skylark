const express = require('express');
const router = express.Router();
const mondayController = require('../controllers/mondayController');
const queryController = require('../controllers/queryController');
const { validateBody } = require('../middleware/validator');

/**
 * Health check endpoint.
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

/**
 * Monday Connection & Board Listing.
 */
router.get('/monday/boards', mondayController.getBoards);

/**
 * Connection integrity mappings and cache status.
 */
router.get('/monday/status', mondayController.getStatus);

/**
 * Update terminal board mappings and credentials dynamically.
 */
router.post(
  '/monday/config',
  validateBody({
    dealsBoardId: { required: true, type: 'string' },
    workOrdersBoardId: { required: true, type: 'string' }
  }),
  mondayController.saveConfig
);

/**
 * Manual cache clearing and dynamic sync.
 */
router.post('/monday/sync', mondayController.syncData);

/**
 * Conversational Natural Language Query Terminal.
 */
router.post(
  '/query',
  validateBody({
    query: { required: true, type: 'string' }
  }),
  queryController.runQuery
);

module.exports = router;
