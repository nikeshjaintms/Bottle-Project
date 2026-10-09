/**
 * Gujarati-to-English Header Mapping for Printing Plan Excel Import
 */

const GUJARATI_PRINTING_HEADER_MAP = {
  // Sr. No.
  'નંબર': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false },
  'n>br': { englishHeader: 'Sr.', appProperty: 'srNo', dataType: 'number', isRequired: false },
  
  // Product Name
  'પ્રોડક્ટ નામ': { englishHeader: 'Bottle Name', appProperty: 'bottleName', dataType: 'string', isRequired: true },
  'p[\\idkt nim': { englishHeader: 'Bottle Name', appProperty: 'bottleName', dataType: 'string', isRequired: true },
  'p\\[idkt nim': { englishHeader: 'Bottle Name', appProperty: 'bottleName', dataType: 'string', isRequired: true },
  'product name': { englishHeader: 'Bottle Name', appProperty: 'bottleName', dataType: 'string', isRequired: true },
  
  // Brand
  'BRAND': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false },
  'brand': { englishHeader: 'Brand', appProperty: 'brand', dataType: 'string', isRequired: false },

  
  // Printing to be done (Variant/Design)
  'પ્રિન્ટિંગ કરવાનું': { englishHeader: 'Printing to be done', appProperty: 'printingToBeDone', dataType: 'string', isRequired: false },
  'ipr>t)>g krvin&': { englishHeader: 'Printing to be done', appProperty: 'printingToBeDone', dataType: 'string', isRequired: false },
  '(p>ºt)>g krvin&': { englishHeader: 'Printing to be done', appProperty: 'printingToBeDone', dataType: 'string', isRequired: false },
  'printing to be done': { englishHeader: 'Printing to be done', appProperty: 'printingToBeDone', dataType: 'string', isRequired: false },
  
  // Plain / Coloured stock
  'પ્લેઈન / કલરવાળું બોટલ સ્ટોક': { englishHeader: 'Plain/Coloured stock', appProperty: 'plainBottleStock', dataType: 'number', isRequired: false },
  'પ્લેઈન/ કલરવાળું': { englishHeader: 'Plain/Coloured stock', appProperty: 'plainBottleStock', dataType: 'number', isRequired: false },
  '¼l[en/ klrvil&': { englishHeader: 'Plain/Coloured stock', appProperty: 'plainBottleStock', dataType: 'number', isRequired: false },
  
  // Type / Text Color
  'ટાઇપ': { englishHeader: 'Type', appProperty: 'textColor', dataType: 'string', isRequired: false },
  'type': { englishHeader: 'Type', appProperty: 'textColor', dataType: 'string', isRequired: false },
  
  // Order Qty
  'બનાવવાનો ઓર્ડર': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false },
  'bnivvini[ ai[d<r': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false },
  'bnivvini ai[d<r': { englishHeader: 'Order Qty', appProperty: 'orderQty', dataType: 'number', isRequired: false },
  
  // Balance still to be made
  'બનાવવાનો બાકી માલ': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false },
  'બનાવવાનો બાકી': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false },
  'bnivvin& bik) b[l[>ºs': { englishHeader: 'Balance still to be made', appProperty: 'balanceToMake', dataType: 'number', isRequired: false },
  
  // Bottle per box
  'બોક્સના પીસ': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false },
  'બોક્સ ના પીસ': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false },
  'bi[ks ni p)s': { englishHeader: 'Bottle per Box', appProperty: 'boxQty', dataType: 'number', isRequired: false },
  
  // No. of Order Boxes
  'ઓર્ડર બોક્સ': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false },
  'બનાવવાનો ઓર્ડર બોક્સ': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false },
  'bnivvini a[id<r bi[x': { englishHeader: 'No. of Order Boxes', appProperty: 'noOfBoxes', dataType: 'number', isRequired: false },
  
  // Ready printed Qty
  'તૈયાર થયેલ માલ': { englishHeader: 'Ready printed Qty', appProperty: 'producedQty', dataType: 'number', isRequired: false },
  't{yir yy[l mil': { englishHeader: 'Ready printed Qty', appProperty: 'producedQty', dataType: 'number', isRequired: false },
  't]yir yy[l mil': { englishHeader: 'Ready printed Qty', appProperty: 'producedQty', dataType: 'number', isRequired: false },
  
  // Dispatch Pending Qty
  'મોકલવાનું બાકી માલ': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchBalance', dataType: 'number', isRequired: false },
  'મોકલવાનું બાકી': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchBalance', dataType: 'number', isRequired: false },
  'm[iklvin& bik) mil': { englishHeader: 'Dispatch Pending Qty', appProperty: 'dispatchBalance', dataType: 'number', isRequired: false },
  
  // Sold Qty
  'વેચેલ માલ': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false },
  'v[c[l mil': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false },
  'v[c[[l mil': { englishHeader: 'Sold Qty', appProperty: 'soldQty', dataType: 'number', isRequired: false },
  
  // Ready boxes
  'રેડી બોક્સ': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'રેડી બોક્ષ': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'r[f) bi[ks': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'ready boxes': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'ready box': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'r[d) bi[x': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'r[d] bi[x': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  'r[d] bi[k': { englishHeader: 'Ready boxes', appProperty: 'readyBoxes', dataType: 'number', isRequired: false },
  
  // Date
  'તારીખ': { englishHeader: 'Date', appProperty: 'date', dataType: 'string', isRequired: false },
  'tir)k': { englishHeader: 'Date', appProperty: 'date', dataType: 'string', isRequired: false },
  
  // Remarks
  'રીમાર્ક': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false },
  'r)mi<k': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false },
  'r)mi<±s': { englishHeader: 'Remark', appProperty: 'remarks', dataType: 'string', isRequired: false }
};

function normalizeGujarati(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ').replace(/\n/g, ' ').toLowerCase();
}

function detectPrintingHeaders(row) {
  if (!row || !Array.isArray(row)) return {};
  const detectedHeaders = {};
  const mappedCols = new Set();
  
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const cell = row[colIdx];
    if (!cell) continue;
    
    const cellText = String(cell).trim();
    const normalized = normalizeGujarati(cellText);
    
    for (const [gujaratiHeader, mapping] of Object.entries(GUJARATI_PRINTING_HEADER_MAP)) {
      if (normalized === normalizeGujarati(gujaratiHeader) || normalized.includes(normalizeGujarati(gujaratiHeader))) {
        const prop = mapping.appProperty;
        if (!detectedHeaders[prop] && !mappedCols.has(colIdx)) {
          detectedHeaders[prop] = {
            columnIndex: colIdx,
            originalCell: cellText,
            ...mapping
          };
          mappedCols.add(colIdx);
          break;
        }
      }
    }
    
    if (!mappedCols.has(colIdx)) {
        if (/p[\(\[\\]*\s*kyi/i.test(cellText) || /^process$/i.test(cellText) || /P[\(\[\\]*\s*KYI/i.test(cellText)) {
            detectedHeaders['process'] = {
                columnIndex: colIdx,
                originalCell: cellText,
                englishHeader: 'Process', 
                appProperty: 'process', 
                dataType: 'string'
            };
            mappedCols.add(colIdx);
        }
    }
  }
  
  // Structural fallback for Text Color (Column immediately after Printing To Be Done)
  if (!detectedHeaders['textColor'] && detectedHeaders['printingToBeDone']) {
      const printIdx = detectedHeaders['printingToBeDone'].columnIndex;
      const stockIdx = detectedHeaders['plainBottleStock'] ? detectedHeaders['plainBottleStock'].columnIndex : null;
      const orderIdx = detectedHeaders['orderQty'] ? detectedHeaders['orderQty'].columnIndex : null;
      
      let nextColIsTextColor = false;
      if (stockIdx !== null && stockIdx > printIdx) {
          nextColIsTextColor = true;
      } else if (orderIdx !== null && orderIdx > printIdx) {
          nextColIsTextColor = true;
      }
      
      if (nextColIsTextColor) {
          const textColIdx = printIdx + 1;
          if (!mappedCols.has(textColIdx) && (stockIdx === null || textColIdx < stockIdx) && (orderIdx === null || textColIdx < orderIdx)) {
              detectedHeaders['textColor'] = {
                  columnIndex: textColIdx,
                  originalCell: row[textColIdx] ? String(row[textColIdx]) : '',
                  englishHeader: 'Text Color',
                  appProperty: 'textColor',
                  dataType: 'string',
                  isRequired: false
              };
              mappedCols.add(textColIdx);
          }
      }
  }
  
  // Also structural fallback for Printing To Be Done (if missing) based on Bottle Name and Text Color
  if (!detectedHeaders['printingToBeDone'] && detectedHeaders['bottleName']) {
      const bottleIdx = detectedHeaders['bottleName'].columnIndex;
      const typeIdx = detectedHeaders['textColor'] ? detectedHeaders['textColor'].columnIndex : null;
      
      if (typeIdx !== null && typeIdx > bottleIdx && (typeIdx - bottleIdx === 1 || typeIdx - bottleIdx === 2)) {
          const printIdx = typeIdx - 1;
          if (!mappedCols.has(printIdx)) {
              detectedHeaders['printingToBeDone'] = {
                  columnIndex: printIdx,
                  originalCell: row[printIdx] ? String(row[printIdx]) : '',
                  englishHeader: 'Printing to be done',
                  appProperty: 'printingToBeDone',
                  dataType: 'string',
                  isRequired: false
              };
              mappedCols.add(printIdx);
          }
      } else if (typeIdx === null) {
          // If neither printing nor type is found, assume Printing is immediately after Bottle Name 
          // and Text Color is immediately after Printing if stock is far enough away
          const stockIdx = detectedHeaders['plainBottleStock'] ? detectedHeaders['plainBottleStock'].columnIndex : null;
          const orderIdx = detectedHeaders['orderQty'] ? detectedHeaders['orderQty'].columnIndex : null;
          
          let nextCol = bottleIdx + 1;
          
          // Let's not blindly assume if we have no anchors, but if we do have stock/order:
          if ((stockIdx !== null && stockIdx > nextCol) || (orderIdx !== null && orderIdx > nextCol)) {
              if (!mappedCols.has(nextCol)) {
                  detectedHeaders['printingToBeDone'] = {
                      columnIndex: nextCol,
                      originalCell: row[nextCol] ? String(row[nextCol]) : '',
                      englishHeader: 'Printing to be done',
                      appProperty: 'printingToBeDone',
                      dataType: 'string',
                      isRequired: false
                  };
                  mappedCols.add(nextCol);
                  
                  const textColIdx = nextCol + 1;
                  if (!mappedCols.has(textColIdx) && (stockIdx === null || textColIdx < stockIdx) && (orderIdx === null || textColIdx < orderIdx)) {
                      detectedHeaders['textColor'] = {
                          columnIndex: textColIdx,
                          originalCell: row[textColIdx] ? String(row[textColIdx]) : '',
                          englishHeader: 'Text Color',
                          appProperty: 'textColor',
                          dataType: 'string',
                          isRequired: false
                      };
                      mappedCols.add(textColIdx);
                  }
              }
          }
      }
  }

  return detectedHeaders;
}

function buildColumnMap(detectedHeaders) {
  const colMap = {};
  for (const [propKey, headerInfo] of Object.entries(detectedHeaders)) {
    colMap[headerInfo.appProperty] = headerInfo.columnIndex;
  }
  return colMap;
}

function detectComponentHeaders(row) {
  if (!row || !Array.isArray(row)) return [];
  const components = [];
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const cell = row[colIdx];
    if (!cell) continue;
    const cellText = String(cell).trim().toUpperCase();
    
    // Look for component indicators: GP, BULK, LID, CAP
    if (cellText.match(/\b(GP|BULK|LID|CAP)\b/)) {
        components.push({
            columnIndex: colIdx,
            componentType: cellText
        });
    }
  }
  return components;
}

module.exports = {
  GUJARATI_PRINTING_HEADER_MAP,
  detectPrintingHeaders,
  buildColumnMap,
  normalizeGujarati,
  detectComponentHeaders
};
