/**
 * Custom Error definitions for the Skylark platform.
 * Standardizes API error responses.
 */

class AppError extends Error {
  /**
   * @param {string} message 
   * @param {number} statusCode 
   * @param {string} errorCode 
   */
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true; // Indicates runtime errors that are expected and handled
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  /**
   * @param {string} message 
   * @param {any} details 
   */
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class MondayAPIError extends AppError {
  /**
   * @param {string} message 
   * @param {number} statusCode 
   */
  constructor(message, statusCode = 502) {
    super(message, statusCode, 'MONDAY_API_ERROR');
  }
}

class AIAPIError extends AppError {
  /**
   * @param {string} message 
   * @param {number} statusCode 
   */
  constructor(message, statusCode = 502) {
    super(message, statusCode, 'AI_API_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  MondayAPIError,
  AIAPIError
};
