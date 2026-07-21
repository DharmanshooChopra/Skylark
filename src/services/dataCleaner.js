/**
 * Data Cleaning & Normalization Engine for the Skylark Terminal.
 * Standardizes raw flat rows (Excel exports) and Monday.com GraphQL nodes
 * into high-integrity Canonical Business entities.
 */

const logger = require('../utils/logger');
const constants = require('../utils/constants');

// Memory storage for the latest run metrics (retains statelessness but supports status queries)
let latestReport = {
  totalRecords: 0,
  validRecords: 0,
  invalidRecords: 0,
  removedRecords: 0,
  missingValues: 0,
  imputedValues: 0,
  duplicateHeadersRemoved: 0,
  invalidDates: 0,
  invalidCurrencyFields: 0,
  statusCorrections: 0,
  warnings: [],
  confidenceScore: 100
};

/**
 * Extracts a value from a raw row (supporting flat key-value Excel structures
 * and nested Monday.com column_values arrays).
 * 
 * @param {Object} row 
 * @param {string} mappedKey Column ID or Excel header key
 * @returns {any} Raw uncleaned value
 */
function extractRawValue(row, mappedKey) {
  if (!row || !mappedKey) return null;
  
  if (row.column_values && Array.isArray(row.column_values)) {
    // Monday.com GraphQL Format
    const col = row.column_values.find(c => c.id === mappedKey);
    if (col) {
      // Prioritize plain text over raw JSON value
      return col.text !== undefined && col.text !== null ? col.text : col.value;
    }
    return null;
  }
  
  // Flat Excel Format
  return row[mappedKey];
}

/**
 * Normalizes any date representation (Excel serial, ISO string, DD/MM/YYYY)
 * to UTC ISO-8601 YYYY-MM-DD. Returns 'HEADER_ROW' if it matches repeated header strings.
 */
function normalizeDate(val) {
  if (val === undefined || val === null || val === '') return null;
  
  // Handle numeric Excel date serials
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    // Excel leap year offset bug
    const utcDays = Math.floor(val - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000).toISOString().split('T')[0];
  }
  
  const str = String(val).trim();
  if (!str) return null;
  
  // Detect embedded column headers by keyword match
  const headerStrings = [
    'Close Date (A)', 'Tentative Close Date', 'Created Date', 
    'Data Delivery Date', 'Date of PO/LOI', 'Probable Start Date', 'Probable End Date'
  ];
  if (headerStrings.includes(str)) {
    return 'HEADER_ROW';
  }
  
  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // Format: DD/MM/YYYY or D/M/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // Fallback to standard parser
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Strips formatting (symbols, commas) and coerces values to float.
 */
function sanitizeCurrency(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? 0.0 : val;
  
  // Strip everything except numbers, points, and minus signs
  const cleaned = String(val).replace(/[^\d\.\-]/g, '');
  if (!cleaned) return null;
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Standardizes Deals statuses.
 */
function normalizeDealStatus(val) {
  if (!val) return 'Open';
  const str = String(val).trim().toLowerCase();
  
  const wonSynonyms = ['won', 'project won', 'closed won', 'g. project won'];
  const deadSynonyms = ['dead', 'lost', 'l. project lost', 'not relevant'];
  const holdSynonyms = ['on hold', 'hold', 'm. projects on hold'];
  
  if (wonSynonyms.includes(str)) return 'Won';
  if (deadSynonyms.some(s => str.includes(s))) return 'Dead';
  if (holdSynonyms.includes(str)) return 'On Hold';
  
  return 'Open';
}

/**
 * Standardizes Work Order statuses.
 */
function normalizeWorkOrderStatus(val) {
  if (!val) return 'Not Started';
  const str = String(val).trim().toLowerCase();
  
  const compSynonyms = ['completed', 'complete'];
  const progressSynonyms = ['ongoing', 'partial completed', 'in progress', 'working on it', 'executed until current month'];
  const stalledSynonyms = ['pause / struck', 'details pending from client', 'stalled', 'pause'];
  
  if (compSynonyms.includes(str)) return 'Completed';
  if (progressSynonyms.includes(str)) return 'In Progress';
  if (stalledSynonyms.includes(str)) return 'Stalled';
  
  return 'Not Started';
}

/**
 * Autodetects mapping keys if explicit config is not present.
 */
function autoMapKeys(sampleRow, type) {
  const keys = Object.keys(sampleRow);
  const mappings = {};
  
  if (type === 'deals') {
    mappings.name = keys.find(k => k.toLowerCase().includes('deal name')) || 'Deal Name';
    mappings.value = keys.find(k => k.toLowerCase().includes('deal value')) || 'Masked Deal value';
    mappings.status = keys.find(k => k.toLowerCase().includes('status')) || 'Deal Status';
    mappings.closeDate = keys.find(k => k.toLowerCase().includes('close date')) || 'Close Date (A)';
    mappings.stage = keys.find(k => k.toLowerCase().includes('stage')) || 'Deal Stage';
    mappings.createdDate = keys.find(k => k.toLowerCase().includes('created date')) || 'Created Date';
    mappings.owner = keys.find(k => k.toLowerCase().includes('owner code')) || 'Owner code';
    mappings.client = keys.find(k => k.toLowerCase().includes('client code')) || 'Client Code';
    mappings.sector = keys.find(k => k.toLowerCase().includes('sector')) || 'Sector/service';
  } else {
    // Work Orders
    mappings.dealName = keys.find(k => k.toLowerCase().includes('deal name') || k === '__EMPTY') || 'Deal name masked';
    mappings.customerCode = keys.find(k => k.toLowerCase().includes('customer name') || k === '__EMPTY_1') || 'Customer Name Code';
    mappings.serialNumber = keys.find(k => k.toLowerCase().includes('serial') || k === '__EMPTY_2') || 'Serial #';
    mappings.executionStatus = keys.find(k => k.toLowerCase().includes('execution status') || k === '__EMPTY_5') || 'Execution Status';
    mappings.dataDeliveryDate = keys.find(k => k.toLowerCase().includes('data delivery') || k === '__EMPTY_6') || 'Data Delivery Date';
    mappings.poDate = keys.find(k => k.toLowerCase().includes('po/loi') || k === '__EMPTY_7') || 'Date of PO/LOI';
    mappings.startDate = keys.find(k => k.toLowerCase().includes('probable start') || k === '__EMPTY_9') || 'Probable Start Date';
    mappings.endDate = keys.find(k => k.toLowerCase().includes('probable end') || k === '__EMPTY_10') || 'Probable End Date';
    mappings.owner = keys.find(k => k.toLowerCase().includes('personnel code') || k === '__EMPTY_11') || 'BD/KAM Personnel code';
    mappings.sector = keys.find(k => k.toLowerCase().includes('sector') || k === '__EMPTY_12') || 'Sector';
    mappings.amountExclGst = keys.find(k => k.toLowerCase().includes('excl of gst') || k === '__EMPTY_17') || 'Amount in Rupees (Excl of GST) (Masked)';
    mappings.amountInclGst = keys.find(k => k.toLowerCase().includes('incl of gst') || k === '__EMPTY_18') || 'Amount in Rupees (Incl of GST) (Masked)';
    mappings.billingStatus = keys.find(k => k.toLowerCase().includes('billing status') || k === '__EMPTY_37') || 'Billing Status';
  }
  
  return mappings;
}

/**
 * Standard Ingestion and Cleaning for Deals.
 */
function cleanDeals(rawItems, customMappings) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  
  const mappings = customMappings || autoMapKeys(rawItems[0], 'deals');
  const cleaned = [];
  
  // Local runs stats
  let total = rawItems.length;
  let valid = 0;
  let invalid = 0;
  let removed = 0;
  let missing = 0;
  let imputed = 0;
  let dupHeaders = 0;
  let badDates = 0;
  let badCurrency = 0;
  let statusCor = 0;
  let warningsList = [];

  const seenRows = new Set();

  rawItems.forEach((row, idx) => {
    // 1. Exact Duplicate Row check
    const rowStr = JSON.stringify(row);
    if (seenRows.has(rowStr)) {
      removed++;
      logger.info('DataCleaner', `Skipping exact duplicate deal row at index: ${idx}`);
      return;
    }
    seenRows.add(rowStr);

    const rawName = extractRawValue(row, mappings.name);
    const rawStatus = extractRawValue(row, mappings.status);
    const rawCloseDate = extractRawValue(row, mappings.closeDate);
    const rawValue = extractRawValue(row, mappings.value);
    const rawCreated = extractRawValue(row, mappings.createdDate);

    // 2. Embedded Header Row Check
    const cleanCloseDate = normalizeDate(rawCloseDate);
    if (rawStatus === 'Deal Status' || cleanCloseDate === 'HEADER_ROW') {
      removed++;
      dupHeaders++;
      logger.info('DataCleaner', `Removed duplicate header row in deal data at index: ${idx}`);
      return;
    }

    // 3. Required Field Validations
    if (!rawName || rawName === 'Deal Name') {
      invalid++;
      removed++;
      warningsList.push({ row: idx, msg: 'Discarded deal: missing opportunity Name.' });
      return;
    }

    // 4. Data Processing
    // Dates
    const cleanCreated = normalizeDate(rawCreated);
    if (rawCreated && !cleanCreated) {
      badDates++;
      warningsList.push({ row: idx, msg: `Invalid created date format: "${rawCreated}".` });
    }

    const finalCreated = cleanCreated || new Date().toISOString().split('T')[0];
    if (!cleanCreated) {
      missing++;
      imputed++;
    }

    if (rawCloseDate && !cleanCloseDate) {
      badDates++;
      warningsList.push({ row: idx, msg: `Invalid close date format: "${rawCloseDate}".` });
    }

    // Currency values
    const cleanVal = sanitizeCurrency(rawValue);
    if (rawValue !== undefined && rawValue !== null && rawValue !== '' && cleanVal === null) {
      badCurrency++;
      warningsList.push({ row: idx, msg: `Corrupted deal value sanitized: "${rawValue}" -> 0.` });
    }
    const finalVal = cleanVal !== null ? cleanVal : constants.CLEANER_DEFAULTS.NUMBER;
    if (cleanVal === null) {
      missing++;
      imputed++;
    }

    // Status mapping
    const finalStatus = normalizeDealStatus(rawStatus);
    if (rawStatus && finalStatus !== rawStatus) {
      statusCor++;
    }

    // Construct Canonical Object
    const canonical = {
      id: row.id || `deal_${idx}`,
      name: String(rawName).trim(),
      ownerCode: String(extractRawValue(row, mappings.owner) || constants.CLEANER_DEFAULTS.STRING).trim(),
      clientCode: String(extractRawValue(row, mappings.client) || constants.CLEANER_DEFAULTS.STRING).trim(),
      status: finalStatus,
      stage: String(extractRawValue(row, mappings.stage) || constants.CLEANER_DEFAULTS.STRING).trim(),
      value: finalVal,
      probability: String(extractRawValue(row, mappings.probability) || 'None').trim(),
      sector: String(extractRawValue(row, mappings.sector) || constants.CLEANER_DEFAULTS.STRING).trim(),
      createdDate: finalCreated,
      closeDate: cleanCloseDate || null
    };

    cleaned.push(canonical);
    valid++;
  });

  // Calculate Metrics
  const confScore = Math.round((valid / total) * 100) || 100;
  
  // Save report updates (accumulating with work orders run if applicable)
  latestReport = {
    totalRecords: latestReport.totalRecords + total,
    validRecords: latestReport.validRecords + valid,
    invalidRecords: latestReport.invalidRecords + invalid,
    removedRecords: latestReport.removedRecords + removed,
    missingValues: latestReport.missingValues + missing,
    imputedValues: latestReport.imputedValues + imputed,
    duplicateHeadersRemoved: latestReport.duplicateHeadersRemoved + dupHeaders,
    invalidDates: latestReport.invalidDates + badDates,
    invalidCurrencyFields: latestReport.invalidCurrencyFields + badCurrency,
    statusCorrections: latestReport.statusCorrections + statusCor,
    warnings: [...latestReport.warnings, ...warningsList],
    confidenceScore: Math.min(latestReport.confidenceScore, confScore)
  };

  return cleaned;
}

/**
 * Standard Ingestion and Cleaning for Work Orders.
 */
function cleanWorkOrders(rawItems, customMappings) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  
  const mappings = customMappings || autoMapKeys(rawItems[0], 'workorders');
  const cleaned = [];
  
  let total = rawItems.length;
  let valid = 0;
  let invalid = 0;
  let removed = 0;
  let missing = 0;
  let imputed = 0;
  let dupHeaders = 0;
  let badDates = 0;
  let badCurrency = 0;
  let statusCor = 0;
  let warningsList = [];

  const seenRows = new Set();

  rawItems.forEach((row, idx) => {
    // 1. Exact duplicate check
    const rowStr = JSON.stringify(row);
    if (seenRows.has(rowStr)) {
      removed++;
      logger.info('DataCleaner', `Skipping exact duplicate work order row at index: ${idx}`);
      return;
    }
    seenRows.add(rowStr);

    const rawDealName = extractRawValue(row, mappings.dealName);
    const rawSerial = extractRawValue(row, mappings.serialNumber);
    const rawStatus = extractRawValue(row, mappings.executionStatus);
    const rawAmtExcl = extractRawValue(row, mappings.amountExclGst);
    
    // 2. Duplicate header row check
    if (rawDealName === 'Deal name masked' || rawSerial === 'Serial #') {
      removed++;
      dupHeaders++;
      logger.info('DataCleaner', `Removed duplicate header row in work order tracker at index: ${idx}`);
      return;
    }

    // 3. Required Fields
    if (!rawDealName || !rawSerial) {
      invalid++;
      removed++;
      warningsList.push({ row: idx, msg: 'Discarded work order: missing Serial # or Deal Name.' });
      return;
    }

    // 4. Processing
    // Status
    const finalStatus = normalizeWorkOrderStatus(rawStatus);
    if (rawStatus && finalStatus !== rawStatus) {
      statusCor++;
    }

    // Currency values
    const cleanAmt = sanitizeCurrency(rawAmtExcl);
    if (rawAmtExcl !== undefined && rawAmtExcl !== null && rawAmtExcl !== '' && cleanAmt === null) {
      badCurrency++;
      warningsList.push({ row: idx, msg: `Corrupted work order value sanitized: "${rawAmtExcl}" -> 0.` });
    }
    const finalAmt = cleanAmt !== null ? cleanAmt : constants.CLEANER_DEFAULTS.NUMBER;
    if (cleanAmt === null) {
      missing++;
      imputed++;
    }

    // Dates
    const rawDelivery = extractRawValue(row, mappings.dataDeliveryDate);
    const rawPo = extractRawValue(row, mappings.poDate);
    const rawStart = extractRawValue(row, mappings.startDate);
    const rawEnd = extractRawValue(row, mappings.endDate);

    const cleanDelivery = normalizeDate(rawDelivery);
    const cleanPo = normalizeDate(rawPo);
    const cleanStart = normalizeDate(rawStart);
    const cleanEnd = normalizeDate(rawEnd);

    if (rawDelivery && !cleanDelivery) badDates++;
    if (rawPo && !cleanPo) badDates++;
    if (rawStart && !cleanStart) badDates++;
    if (rawEnd && !cleanEnd) badDates++;

    // Canonical representation
    const canonical = {
      id: row.id || String(rawSerial).trim(),
      serialNumber: String(rawSerial).trim(),
      dealName: String(rawDealName).trim(),
      customerCode: String(extractRawValue(row, mappings.customerCode) || constants.CLEANER_DEFAULTS.STRING).trim(),
      natureOfWork: String(extractRawValue(row, mappings.natureOfWork) || constants.CLEANER_DEFAULTS.STRING).trim(),
      executionStatus: finalStatus,
      dataDeliveryDate: cleanDelivery || null,
      poDate: cleanPo || null,
      startDate: cleanStart || null,
      endDate: cleanEnd || null,
      ownerCode: String(extractRawValue(row, mappings.owner) || constants.CLEANER_DEFAULTS.STRING).trim(),
      sector: String(extractRawValue(row, mappings.sector) || constants.CLEANER_DEFAULTS.STRING).trim(),
      amountExclGst: finalAmt,
      amountInclGst: sanitizeCurrency(extractRawValue(row, mappings.amountInclGst)) || 0.0,
      billingStatus: String(extractRawValue(row, mappings.billingStatus) || 'Unbilled').trim()
    };

    cleaned.push(canonical);
    valid++;
  });

  const confScore = Math.round((valid / total) * 100) || 100;
  
  latestReport = {
    totalRecords: latestReport.totalRecords + total,
    validRecords: latestReport.validRecords + valid,
    invalidRecords: latestReport.invalidRecords + invalid,
    removedRecords: latestReport.removedRecords + removed,
    missingValues: latestReport.missingValues + missing,
    imputedValues: latestReport.imputedValues + imputed,
    duplicateHeadersRemoved: latestReport.duplicateHeadersRemoved + dupHeaders,
    invalidDates: latestReport.invalidDates + badDates,
    invalidCurrencyFields: latestReport.invalidCurrencyFields + badCurrency,
    statusCorrections: latestReport.statusCorrections + statusCor,
    warnings: [...latestReport.warnings, ...warningsList],
    confidenceScore: Math.min(latestReport.confidenceScore, confScore)
  };

  return cleaned;
}

/**
 * Returns latest runs quality metrics.
 */
function getDataHealthReport() {
  return latestReport;
}

/**
 * Reset local runs logs.
 */
function resetReport() {
  latestReport = {
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    removedRecords: 0,
    missingValues: 0,
    imputedValues: 0,
    duplicateHeadersRemoved: 0,
    invalidDates: 0,
    invalidCurrencyFields: 0,
    statusCorrections: 0,
    warnings: [],
    confidenceScore: 100
  };
}

module.exports = {
  cleanDeals,
  cleanWorkOrders,
  getDataHealthReport,
  resetReport,
  normalizeDate,
  sanitizeCurrency,
  normalizeDealStatus,
  normalizeWorkOrderStatus
};
