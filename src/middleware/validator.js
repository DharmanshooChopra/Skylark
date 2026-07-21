const { ValidationError } = require('../utils/errors');

/**
 * Validation helper middleware maker for Express.
 * Checks request body keys against a validation schema definition.
 * 
 * @param {Object} schema Map of keys to validations (e.g. { query: { required: true, type: 'string' } })
 */
function validateBody(schema) {
  return (req, res, next) => {
    if (!req.body) {
      return next(new ValidationError('Request body is missing.'));
    }

    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      const value = req.body[key];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${key}' is required.`);
        continue;
      }

      // Check type if value is present
      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`Field '${key}' must be of type '${rules.type}'. Received '${typeof value}'.`);
        }
      }
    }

    if (errors.length > 0) {
      return next(new ValidationError('Request validation failed.', errors));
    }

    next();
  };
}

module.exports = {
  validateBody
};
