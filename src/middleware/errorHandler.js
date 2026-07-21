const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Express global error handling middleware.
 */
function errorHandler(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Default values for unhandled native errors
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred on the server.';
  let details = err.details || null;

  // Log error using structured logger
  logger.error('ErrorHandler', `Error processing request: ${req.method} ${req.url}`, err);

  // If it's not operational (e.g. standard programming bugs like ReferenceError), 
  // mask details in production for security.
  const isOperational = err instanceof AppError ? err.isOperational : false;
  if (!isOperational && isProduction) {
    message = 'A critical system error occurred.';
    errorCode = 'CRITICAL_SYSTEM_ERROR';
    details = null;
  }

  res.status(statusCode).json({
    status: 'error',
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
      ...(!isProduction && { stack: err.stack })
    }
  });
}

module.exports = errorHandler;
