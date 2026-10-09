/**
 * Import Preview Verification Utility
 * 
 * Verifies that the preview display shows:
 * 1. Correct English column names
 * 2. Properly parsed values from Gujarati sources
 * 3. Complete end-to-end flow from source to display
 */

const {
  GUJARATI_HEADER_MAP,
  normalizeGujarati,
  getHeaderMapping
} = require('./gujaratiHeaderMapping');

/**
 * Mapping from internal field names to display column names
 * Used in preview table headers
 */
const DISPLAY_COLUMN_NAMES = {
  excelRowNumber: 'Excel Row',
  companyName: 'Company',
  bottleName: 'Bottle Name',
  variant: 'Variant',
  brandName: 'Brand',
  coatingShade: 'Coating Shade',
  process: 'Process',
  plainStock: 'Plain Stock',
  boxQty: 'Bottle per Box',
  orderQty: 'Order Qty',
  coatingCompletedQty: 'Coating Completed Qty',
  balanceToMake: 'Balance to Make',
  dispatchPendingQty: 'Dispatch Pending Qty',
  soldQty: 'Sold Qty',
  noOfBoxes: 'No. of Order Boxes',
  remarks: 'Remark',
  isValid: 'Status'
};

/**
 * Get the canonical display column order
 * 
 * @returns {Array} - Array of field names in canonical order
 */
function getCanonicalColumnOrder() {
  return [
    'excelRowNumber',
    'companyName',
    'bottleName',
    'variant',
    'brandName',
    'coatingShade',
    'process',
    'plainStock',
    'boxQty',
    'orderQty',
    'coatingCompletedQty',
    'balanceToMake',
    'dispatchPendingQty',
    'soldQty',
    'noOfBoxes',
    'remarks',
    'isValid'
  ];
}

/**
 * Get the display name for a field
 * 
 * @param {string} fieldName - Internal field name
 * @returns {string} - Display column name (English)
 */
function getDisplayColumnName(fieldName) {
  return DISPLAY_COLUMN_NAMES[fieldName] || fieldName;
}

/**
 * Verify that a row has all required display fields
 * 
 * @param {Object} row - Parsed row from preview
 * @returns {Object} - { isComplete: boolean, missingFields: Array, verification: Object }
 */
function verifyRowCompleteness(row) {
  const missingFields = [];
  const verification = {
    hasBottleName: !!row.bottleName,
    hasCoatingShade: row.coatingShade !== null && row.coatingShade !== undefined && row.coatingShade !== '',
    hasOrderQty: row.orderQty !== null && row.orderQty !== undefined,
    hasDetectionMethod: row._importSource?.detectionMethod !== undefined,
    detectionMethod: row._importSource?.detectionMethod,
    gujaratiHeadersDetected: row._importSource?.gujaratiHeaders ? Object.keys(row._importSource.gujaratiHeaders).length : 0
  };
  
  // Bottle Name is required
  if (!verification.hasBottleName) {
    missingFields.push('bottleName');
  }
  
  return {
    isComplete: missingFields.length === 0,
    missingFields,
    verification
  };
}

/**
 * Build a preview summary with header mapping info
 * 
 * @param {Object} previewData - Raw preview data from backend
 * @returns {Object} - Enhanced preview with mapping information
 */
function enhancePreviewWithMappingInfo(previewData) {
  const enhanced = { ...previewData };
  
  enhanced.dates = enhanced.dates.map(dateGroup => {
    const summary = {
      totalRows: dateGroup.totalRows,
      validRows: dateGroup.validRows,
      invalidRows: dateGroup.invalidRows,
      headerDetectionSummary: {
        gujaratiDetected: 0,
        fuzzyFallback: 0
      },
      detectedHeadersList: new Set(),
      rowDetails: []
    };
    
    // Analyze detection methods used
    dateGroup.rows.forEach(row => {
      if (row._importSource?.detectionMethod === 'gujarati') {
        summary.headerDetectionSummary.gujaratiDetected++;
        
        // Collect detected Gujarati headers
        if (row._importSource?.gujaratiHeaders) {
          Object.keys(row._importSource.gujaratiHeaders).forEach(gujarati => {
            summary.detectedHeadersList.add(gujarati);
          });
        }
      } else if (row._importSource?.detectionMethod === 'fuzzy_fallback') {
        summary.headerDetectionSummary.fuzzyFallback++;
      }
    });
    
    summary.detectedHeadersList = Array.from(summary.detectedHeadersList);
    
    return {
      ...dateGroup,
      summary
    };
  });
  
  return enhanced;
}

/**
 * Verify column mapping for a given row
 * Maps between Gujarati source headers and display columns
 * 
 * @param {Object} row - Row with import source info
 * @param {Object} gujaratiHeaders - Detected Gujarati headers
 * @returns {Object} - Column mapping verification
 */
function verifyColumnMapping(row, gujaratiHeaders) {
  const mapping = {};
  
  for (const [gujarati, headerInfo] of Object.entries(gujaratiHeaders || {})) {
    const headerMapping = getHeaderMapping(gujarati);
    if (headerMapping) {
      const displayName = getDisplayColumnName(headerMapping.appProperty);
      mapping[gujarati] = {
        english: headerMapping.englishHeader,
        appProperty: headerMapping.appProperty,
        displayName: displayName,
        columnIndex: headerInfo.columnIndex,
        verified: true
      };
    }
  }
  
  return mapping;
}

/**
 * Create a field value trace for debugging
 * Shows: Gujarati source → English field → Parsed value → Display value
 * 
 * @param {Object} row - Parsed row
 * @param {Object} gujaratiHeaders - Detected Gujarati headers
 * @returns {Array} - Array of value traces
 */
function createValueTraces(row, gujaratiHeaders) {
  const traces = [];
  
  if (!gujaratiHeaders) return traces;
  
  for (const [gujarati, headerInfo] of Object.entries(gujaratiHeaders)) {
    const headerMapping = getHeaderMapping(gujarati);
    if (!headerMapping) continue;
    
    const appProperty = Array.isArray(headerMapping.appProperty) 
      ? headerMapping.appProperty[0] 
      : headerMapping.appProperty;
    
    const value = row[appProperty];
    
    traces.push({
      gujaratiSource: gujarati,
      englishHeader: headerMapping.englishHeader,
      appProperty: appProperty,
      displayName: getDisplayColumnName(appProperty),
      columnIndex: headerInfo.columnIndex,
      value: value,
      dataType: headerMapping.dataType,
      isRequired: headerMapping.isRequired,
      isNull: value === null || value === undefined || value === '',
      description: headerMapping.description
    });
  }
  
  return traces;
}

/**
 * Generate a comprehensive preview validation report
 * 
 * @param {Object} previewData - Raw preview data
 * @returns {Object} - Validation report with all details
 */
function generatePreviewValidationReport(previewData) {
  const report = {
    timestamp: new Date().toISOString(),
    detectedSheets: previewData.detectedSheets,
    totalRows: previewData.totalRows,
    validRows: previewData.validRows,
    dateGroupReports: []
  };
  
  previewData.dates.forEach(dateGroup => {
    const dateReport = {
      date: dateGroup.date,
      totalRows: dateGroup.totalRows,
      validRows: dateGroup.validRows,
      invalidRows: dateGroup.invalidRows,
      rowValidation: {
        allComplete: dateGroup.rows.every(r => r.bottleName),
        missingBottleNames: dateGroup.rows.filter(r => !r.bottleName).length,
        hasGujaratiHeaders: dateGroup.rows.some(r => r._importSource?.detectionMethod === 'gujarati'),
        gujaratiRowCount: dateGroup.rows.filter(r => r._importSource?.detectionMethod === 'gujarati').length,
        fuzzyFallbackCount: dateGroup.rows.filter(r => r._importSource?.detectionMethod === 'fuzzy_fallback').length
      },
      sampleRows: dateGroup.rows.slice(0, 3).map(r => ({
        bottleName: r.bottleName,
        detectionMethod: r._importSource?.detectionMethod,
        gujaratiHeadersCount: r._importSource?.gujaratiHeaders ? Object.keys(r._importSource.gujaratiHeaders).length : 0,
        hasAllOptionalFields: {
          coatingShade: !!r.coatingShade,
          orderQty: r.orderQty !== null && r.orderQty !== undefined,
          boxQty: r.boxQty !== null && r.boxQty !== undefined,
          noOfBoxes: r.noOfBoxes !== null && r.noOfBoxes !== undefined,
          coatingCompletedQty: r.coatingCompletedQty !== null && r.coatingCompletedQty !== undefined,
          balanceToMake: r.balanceToMake !== null && r.balanceToMake !== undefined,
          dispatchPendingQty: r.dispatchPendingQty !== null && r.dispatchPendingQty !== undefined,
          soldQty: r.soldQty !== null && r.soldQty !== undefined,
          plainStock: r.plainStock !== null && r.plainStock !== undefined
        }
      }))
    };
    
    report.dateGroupReports.push(dateReport);
  });
  
  return report;
}

module.exports = {
  DISPLAY_COLUMN_NAMES,
  getCanonicalColumnOrder,
  getDisplayColumnName,
  verifyRowCompleteness,
  enhancePreviewWithMappingInfo,
  verifyColumnMapping,
  createValueTraces,
  generatePreviewValidationReport
};
