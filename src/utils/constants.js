/**
 * System-wide constants for the Skylark Executive Terminal.
 */

module.exports = {
  // Caching TTLs in seconds
  CACHE_TTL: {
    BOARDS: 300,        // 5 minutes
    METADATA: 1800,     // 30 minutes
    RAW_DATA: 600,      // 10 minutes
    CLEANED_DATA: 600   // 10 minutes
  },

  // Standard schema mappings expected by the core processing engines
  STANDARD_SCHEMAS: {
    DEALS: {
      companyName: 'string',
      dealValue: 'number',
      closeDate: 'date',
      stage: 'string'
    },
    WORK_ORDERS: {
      companyName: 'string',
      startDate: 'date',
      deliveryDate: 'date',
      status: 'string'
    }
  },

  // Default values for data cleaner imputation
  CLEANER_DEFAULTS: {
    NUMBER: 0,
    STRING: 'N/A',
    STATUS: 'Not Started',
    STAGE: 'Qualified'
  },

  // String similarity settings
  SIMILARITY_THRESHOLD: 0.85
};
