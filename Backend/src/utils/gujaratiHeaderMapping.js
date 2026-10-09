/**
 * Gujarati-to-English Header Mapping for Lacquer Plan Excel Import
 * 
 * This module provides canonical mapping from Gujarati column headers
 * to their corresponding ERP English field names and application properties.
 */

/**
 * Exact Gujarati header mappings
 * Key: Gujarati header (normalized for matching)
 * Value: { englishHeader, appProperty, dataType, isRequired }
 */
const GUJARATI_HEADER_MAP = {
  // Sr. No.
  'નંબર': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  'n>br': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  'sr.': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  'sr': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  'sr no': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  'sr. no.': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false, description: 'Serial number' },
  
  // Product Name (with Variant detection)
  'પ્રોડક્ટ નામ': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'પ્રોડક્ટ': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'p[\\idkt nim': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'p[\\idkt': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'bottle name': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'product name': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'product': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  'bottle': { englishHeader: 'Bottle Name + Variant', appProperty: 'bottleName', dataType: 'string', isRequired: true, description: 'Product name' },
  
  // Color/Coating Shade
  'કવર': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'કલર': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'શેડ': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'klr': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'kvr': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'coating shade': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'colour': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'color': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  'shade': { englishHeader: 'Coating Shade', appProperty: 'coatingShade', dataType: 'string', isRequired: false, description: 'Coating color/shade' },
  
  // Brand
  'BRAND': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false, description: 'Brand name' },
  'brand': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false, description: 'Brand name' },
  'બ્રાન્ડ': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false, description: 'Brand name' },
  'company': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false, description: 'Brand name' },
  
  // Process
  'પ્રક્રિયા': { englishHeader: 'Process', appProperty: 'process', dataType: 'string', isRequired: false, description: 'Process name' },
  'p\\(kyi': { englishHeader: 'Process', appProperty: 'process', dataType: 'string', isRequired: false, description: 'Process name' },
  'process': { englishHeader: 'Process', appProperty: 'process', dataType: 'string', isRequired: false, description: 'Process name' },
  
  // Plain Stock
  'પ્લેઈન સ્ટોક': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  'પ્લેઈન': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  '¼l[en ati[k': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  '¼l[en': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  'l[en ati[k': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  'plain stock': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  'plain bottle': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  'stock': { englishHeader: 'Plain Stock', appProperty: 'plainStock', dataType: 'number', isRequired: false, description: 'Plain stock quantity' },
  
  // Order Qty
  'બનાવવાનો ઓર્ડર': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  'bnivvini[ ai[d<r': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  'bnivvini[': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  'order qty': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  'order quantity': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  'order': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false, description: 'Order quantity' },
  
  // Coating Completed Qty
  'કોટીંગ થયેલ માલ': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'કોટીંગ થયેલ': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'ki[t)>g yy[l mil': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'ki[t)>g': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'coating completed qty': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'coating completed': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'coated qty': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  'completed': { englishHeader: 'Coating Completed Qty', appProperty: 'coatingCompletedQty', dataType: 'number', isRequired: false, description: 'Coating completed quantity' },
  
  // Balance still to be made
  'બનાવવાનો બાકી માલ': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'બનાવવાનો બાકી': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'bnivvin[ibik) mil': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'bnivvin[ibik)': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'balance to make': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'balance still to be made': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  'balance': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false, description: 'Balance quantity still to be manufactured' },
  
  // Dispatch Pending Qty
  'મોકલવાનું બાકી માલ': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'મોકલવાનું બાકી': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'm[iklvin& bik) mil': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'm[iklvin&': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'dispatch pending qty': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'dispatch pending': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'dispatch qty': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  'dispatch balance': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchPendingQty', dataType: 'number', isRequired: false, description: 'Dispatch pending quantity' },
  
  // Sold Qty
  'વેચેલ માલ': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'વેચેલ': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'v[c[l mil': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'v[c[l': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'sold qty': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'sold quantity': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  'sold': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false, description: 'Sold quantity' },
  
  // Bottle per Box
  'બોક્સ ના પીસ': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'બોક્સ દીઠ બોટલ': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'બોક્સ પીસ': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'bi[ks ni p)s': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'bi[ks': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'bottle per box': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'box content': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  'per box': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false, description: 'Number of bottles per box' },
  
  // No. of Order Boxes
  'ઓર્ડર બોક્સ': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'ai[d<r bi[x': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'no. of order boxes': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'no of order boxes': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'number of boxes': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'order boxes': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  'order box': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false, description: 'Number of order boxes' },
  
  // Remarks
  'રીમાર્ક': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  'નોંધ': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  'r)mi<k': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  'remark': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  'remarks': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  'note': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false, description: 'Additional remarks or notes' },
  
  // Date
  'તારીખ': { englishHeader: 'Date', appProperty: 'date', dataType: 'string', isRequired: false, description: 'Plan Date' },
  'tir)k': { englishHeader: 'Date', appProperty: 'date', dataType: 'string', isRequired: false, description: 'Plan Date' },
  'date': { englishHeader: 'Date', appProperty: 'date', dataType: 'string', isRequired: false, description: 'Plan Date' }
};

/**
 * Normalize Gujarati text for matching
 * Handles various Unicode representations and extra spaces
 */
function normalizeGujarati(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .toLowerCase();
}

/**
 * Detect Gujarati headers in a row
 * Returns a map of detected Gujarati headers to their column indices
 * 
 * @param {Array} row - Excel row containing headers
 * @returns {Object} - Map of { appProperty: { columnIndex, englishHeader, appProperty, dataType, isRequired } }
 */
function detectGujaratiHeaders(row) {
  if (!row || !Array.isArray(row)) return {};
  
  const detectedHeaders = {};
  const mappedCols = new Set();
  
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const cell = row[colIdx];
    if (!cell) continue;
    
    const cellText = String(cell).trim();
    const normalized = normalizeGujarati(cellText);
    
    // Try exact match against all Gujarati headers
    for (const [gujaratiHeader, mapping] of Object.entries(GUJARATI_HEADER_MAP)) {
      const normalizedHeader = normalizeGujarati(gujaratiHeader);
      
      if (normalized === normalizedHeader) {
        const prop = Array.isArray(mapping.appProperty) ? mapping.appProperty[0] : mapping.appProperty;
        if (!detectedHeaders[prop] && !mappedCols.has(colIdx)) {
          detectedHeaders[prop] = {
            columnIndex: colIdx,
            originalCell: cellText,
            ...mapping
          };
          mappedCols.add(colIdx);
          break; // Found match for this column
        }
      }
    }
  }
  
  return detectedHeaders;
}

/**
 * Build a column map from detected Gujarati headers
 * Returns mapping from appProperty to column index for data extraction
 * 
 * @param {Object} detectedHeaders - Output from detectGujaratiHeaders()
 * @returns {Object} - Map of { appProperty: columnIndex }
 */
function buildColumnMapFromGujarati(detectedHeaders) {
  const colMap = {};
  
  for (const [propKey, headerInfo] of Object.entries(detectedHeaders)) {
    const { appProperty, columnIndex } = headerInfo;
    
    if (Array.isArray(appProperty)) {
      // For composite fields like bottleName+variant, store the column index
      appProperty.forEach(prop => {
        colMap[prop] = columnIndex;
      });
    } else {
      colMap[appProperty] = columnIndex;
    }
  }
  
  return colMap;
}

/**
 * Validate that all required headers are present
 * 
 * @param {Object} detectedHeaders - Output from detectGujaratiHeaders()
 * @returns {Object} - { isValid: boolean, missingHeaders: Array }
 */
function validateRequiredHeaders(detectedHeaders) {
  const missingHeaders = [];
  
  for (const [gujarati, mapping] of Object.entries(GUJARATI_HEADER_MAP)) {
    if (mapping.isRequired && !detectedHeaders[gujarati]) {
      missingHeaders.push({
        gujarati,
        english: mapping.englishHeader,
        property: mapping.appProperty
      });
    }
  }
  
  return {
    isValid: missingHeaders.length === 0,
    missingHeaders
  };
}

/**
 * Get header mapping information for a specific Gujarati header
 * 
 * @param {string} gujaratiHeader - The Gujarati header text
 * @returns {Object|null} - Mapping info or null if not found
 */
function getHeaderMapping(gujaratiHeader) {
  const normalized = normalizeGujarati(gujaratiHeader);
  
  for (const [gujarati, mapping] of Object.entries(GUJARATI_HEADER_MAP)) {
    if (normalizeGujarati(gujarati) === normalized) {
      return mapping;
    }
  }
  
  return null;
}

/**
 * Get all Gujarati headers
 * 
 * @returns {Array} - Array of Gujarati header strings
 */
function getAllGujaratiHeaders() {
  return Object.keys(GUJARATI_HEADER_MAP);
}

/**
 * Get all English headers with their mappings
 * 
 * @returns {Array} - Array of { gujarati, english, property, dataType, isRequired }
 */
function getMappingReference() {
  return Object.entries(GUJARATI_HEADER_MAP).map(([gujarati, mapping]) => ({
    gujarati,
    english: mapping.englishHeader,
    property: Array.isArray(mapping.appProperty) ? mapping.appProperty.join('+') : mapping.appProperty,
    dataType: mapping.dataType,
    isRequired: mapping.isRequired,
    description: mapping.description
  }));
}

module.exports = {
  GUJARATI_HEADER_MAP,
  normalizeGujarati,
  detectGujaratiHeaders,
  buildColumnMapFromGujarati,
  validateRequiredHeaders,
  getHeaderMapping,
  getAllGujaratiHeaders,
  getMappingReference
};
