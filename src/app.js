const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { AppError } = require('./utils/errors');

const app = express();

// 1. Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple monospaced HTTP Request Logger Middleware
app.use((req, res, next) => {
  logger.info('HTTP', `${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// 2. Serve SPA static assets from src/public
app.use(express.static(path.join(__dirname, 'public')));

// 3. API Endpoints Routing
app.use('/api', apiRoutes);

// 4. Fallback 404 Route handler for API endpoints
app.use('/api/*', (req, res, next) => {
  next(new AppError(`API endpoint '${req.originalUrl}' not found.`, 404, 'NOT_FOUND'));
});

// 5. Fallback 404 Route for browser requests (Index page SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 6. Centralized Error Handler Middleware
app.use(errorHandler);

module.exports = app;
