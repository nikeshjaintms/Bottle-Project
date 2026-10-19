/**
 * General Dispatch Importer - Supports TPP and SHRENO layouts
 * Uses shared bottle-matching logic from Incoming importer
 * Bottle name is the ONLY invalidating rule
 * 
 * Based on reference parser: uses absolute cell addresses, not array indexes
 */

const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const BottlePerBox = require('../models/BottlePerBox');
const Variant = require('../models/Variant');
const PrintingType = require('../models/PrintingType');
const Dispatch = require('../models/Dispatch');
const { matchBottleNameFromMaster } = require('../utils/bottleMatching');

/**
 * Safely extract text from cell value
 */
const getCellText = (cellValue) => {
  if (cellValue == null) return '';
  
  // Handle rich text
  if (typeof cellValue === 'object' && cellValue.richText) {
    return cellValue.richText.map(x => x.text).join('');
  }
  
  // Handle all other values
  return String(cellValue).trim();
};

/**
 * Helper to get lowercase text for comparison
 */
const getLowText = (cellValue) => {
  return getCellText(cellValue).toLowerCase();
};

/**
 * Get value directly from worksheet by absolute address
 */
const getCell = (worksheet, r, c) => {
  const cellRef = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[cellRef];
  return cell ? cell.v : undefined;
};

/**
 * Get text from cell by absolute address
 */
const getCellTextAbs = (worksheet, r, c) => {
  return getCellText(getCell(worksheet, r, c));
};

/**
 * Parse numeric value (handle commas, plus notation, etc)
 */
const parseNumber = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Parse dispatch sheet using absolute cell addresses (like reference parser)
 * Implements two-tier bottle matching: OUTER (sheet name) → INNER (row bottles)
 */
const parseDispatchSheet = (worksheet, sheetName, bottles) => {
  // Get absolute range
  const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const maxRow = range.e.r;
  const maxCol = range.e.c;
  
  // Find marker: scan rows 0-9, all columns, for text containing "dispatch" (case-insensitive)
  let markerRow = -1;
  let markerCol = -1;
  
  for (let r = 0; r <= Math.min(9, maxRow); r++) {
    for (let c = 0; c <= maxCol; c++) {
      const text = getLowText(getCell(worksheet, r, c));
      
      if (text.includes('dispatch')) {
        // Reject headers and totals
        if (/^dispatch date|^dispatch qty|^dispatch detail|^total dispatch/.test(text)) {
          continue;
        }
        
        // Reject TOTAL DISPATCH in left columns (part of different block)
        if (text.includes('total dispatch') && c < 5) {
          continue;
        }
        
        // This is the marker
        markerRow = r;
        markerCol = c;
        break;
      }
    }
    if (markerRow >= 0) break;
  }
  
  if (markerRow < 0) {
    return {
      error: 'No section title containing "dispatch" found in rows 1-10',
      marker: null,
      records: []
    };
  }
  
  const markerCellRef = xlsx.utils.encode_cell({ r: markerRow, c: markerCol });
  
  // Find header columns in the 2 rows below marker
  const columns = {};
  
  for (let r = markerRow + 1; r <= markerRow + 2; r++) {
    for (let c = markerCol; c <= maxCol; c++) {
      const text = getLowText(getCell(worksheet, r, c));
      
      if (!text) continue;
      
      // Map column names by keyword
      if (/dispatch date|^date$/.test(text) && columns.date === undefined) columns.date = c;
      else if (/pass|d\.?\s*c\.?\s*no|challan|gate/.test(text) && columns.gate === undefined) columns.gate = c;
      else if (/^coating/.test(text) && columns.coating === undefined) columns.coating = c;
      else if (/^printing/.test(text) && columns.printing === undefined) columns.printing = c;
      else if (/^foil$|^organic$/.test(text) && columns[text] === undefined) columns[text] = c;
      else if (/^box/.test(text) && columns.box === undefined) columns.box = c;
      else if (/^qty/.test(text) && columns.qty === undefined) columns.qty = c;
      else if (/^total/.test(text) && columns.total === undefined) columns.total = c;
      else if (/^remark/.test(text) && columns.remarks === undefined) columns.remarks = c;
    }
  }
  
  // Must have date and (qty or total)
  if (columns.date === undefined || (columns.qty === undefined && columns.total === undefined)) {
    return {
      error: `Marker at ${markerCellRef} but no Date + Qty/Total header below it`,
      marker: markerCellRef,
      records: []
    };
  }
  
  // Parse data rows
  const records = [];
  let lastDate = '';
  let lastGate = '';
  let endRow = null;
  let innerRowResults = []; // Track bottle matches for INNER fallback
  let distinctBottlesFound = new Set(); // Unique bottles found via INNER matching
  
  // TIER 1: Try to match sheet name to master bottle
  const sheetBottleMatch = matchBottleNameFromMaster(sheetName, bottles);
  let sheetBottleId = sheetBottleMatch.bottleName;
  
  // Collect all data rows first
  for (let r = markerRow + 3; r <= maxRow; r++) {
    // Check for end marker (TOTAL row in marker column)
    const markerColText = getLowText(getCell(worksheet, r, markerCol));
    if (markerColText === 'total') {
      endRow = r;
      break;
    }
    
    // Check if row has any data in the tracked columns
    let hasAnyData = false;
    for (const col of Object.values(columns)) {
      const val = getCellText(getCell(worksheet, r, col));
      if (val) {
        hasAnyData = true;
        break;
      }
    }
    
    if (!hasAnyData) continue;
    
    // Get values
    const dateText = getCellText(getCell(worksheet, r, columns.date));
    const gateText = getCellText(getCell(worksheet, r, columns.gate));
    
    if (dateText) lastDate = dateText;
    if (gateText) lastGate = gateText;
    
    const record = {
      excelRow: r + 1,
      date: dateText || lastDate,
      gatePass: gateText || lastGate,
      shade: getCellText(getCell(worksheet, r, columns.coating)),
      variant: getCellText(getCell(worksheet, r, columns.printing)),
      type: getCellText(getCell(worksheet, r, columns.foil)),
      box: getCellText(getCell(worksheet, r, columns.box)),
      qty: parseNumber(getCell(worksheet, r, columns.qty)),
      total: parseNumber(getCell(worksheet, r, columns.total))
    };
    
    records.push(record);
    
    // TIER 2: INNER - Try to match row's shade/variant as bottle name (fallback)
    if (sheetBottleId === 'MISSING') {
      const rowBottleText = String(record.shade || record.variant || '').trim();
      if (rowBottleText) {
        const innerMatch = matchBottleNameFromMaster(rowBottleText, bottles);
        const innerBottleId = innerMatch.bottleName;
        
        innerRowResults.push({
          rowIndex: records.length - 1,
          rowBottleId: innerBottleId,
          bottleNameText: rowBottleText
        });
        
        if (innerBottleId !== 'MISSING') {
          distinctBottlesFound.add(innerBottleId);
        }
      }
    }
  }
  
  // TIER 2: Determine final sheet bottle from INNER results
  if (sheetBottleId === 'MISSING' && distinctBottlesFound.size > 0) {
    if (distinctBottlesFound.size === 1) {
      // Exactly one unique bottle found - use for entire sheet
      sheetBottleId = Array.from(distinctBottlesFound)[0];
    }
  }
  
  // Calculate total sum
  const sumTotal = records.reduce((a, x) => a + x.total, 0);
  const declaredTotal = endRow !== null ? parseNumber(getCell(worksheet, endRow, columns.total)) : null;
  
  return {
    error: null,
    marker: markerCellRef,
    markerRow,
    markerCol,
    columns,
    records,
    endRow: endRow === null ? null : endRow + 1,
    sumTotal,
    declaredTotal,
    sheetBottleId,
    innerRowResults
  };
};

/**
 * Validate a dispatch row - implements two-tier bottle matching like Incoming
 * TIER 1: OUTER - Sheet name matching
 * TIER 2: INNER - Individual row bottle column matching (fallback)
 * 
 * Validation rules:
 * - If bottle name is empty → VALID (OK to have no bottle)
 * - If bottle name has value → Check if it exists in master:
 *   - Exists → VALID
 *   - Not exists → INVALID
 */
const validateDispatchRow = (sheetName, rowData, sheetBottleId, bottles) => {
  let bottleId = sheetBottleId;
  let bottleNameRaw = sheetName;
  let errors = [];
  
  // If sheet bottle is MISSING, try row's bottle column as fallback
  if (!bottleId || bottleId === 'MISSING') {
    // Check if row has explicit bottle text in a column
    const rowBottleText = String(rowData.shade || rowData.variant || '').trim();
    
    if (rowBottleText) {
      // Bottle name has a value - must check if it exists in master
      const match = matchBottleNameFromMaster(rowBottleText, bottles);
      if (match && match.bottleName !== 'MISSING') {
        // Bottle found in master - VALID
        bottleId = match.bottleName;
        bottleNameRaw = rowBottleText;
      } else {
        // Bottle not found in master - INVALID
        bottleNameRaw = rowBottleText;
        errors.push(`Bottle name not found in master (sheet: "${sheetName}", row text: "${rowBottleText}")`);
        bottleId = 'MISSING';
      }
    } else {
      // Bottle name is empty - OK, VALID (no bottle required)
      bottleId = 'NO_BOTTLE';
      bottleNameRaw = '';
    }
  }
  
  // Mark as valid:
  // - If bottle was found in master, OR
  // - If no bottle name was provided (empty is OK)
  const isValid = errors.length === 0;
  
  return {
    isValid,
    errors,
    bottleId: bottleId,
    bottleNameRaw: bottleNameRaw
  };
};

/**
 * Preview API
 */
exports.previewDispatchImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const bottles = await BottlePerBox.find({ status: true });

    const sheets = [];
    const skippedSheets = [];
    let totalRows = 0;
    let validRows = 0;
    let invalidRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const parseResult = parseDispatchSheet(worksheet, sheetName, bottles);

      if (parseResult.error) {
        skippedSheets.push({ sheetName, reason: parseResult.error });
        continue;
      }

      // Empty dispatch blocks (marker + headers but no data) still go in sheets array
      // Only skip if marker or headers are missing

      // Validate all rows against bottle name (with two-tier matching)
      const records = parseResult.records.map((rec, idx) => {
        // For dispatch, we validate using the sheet-level bottle ID
        // OR per-row matching if sheet level is MISSING
        const validation = validateDispatchRow(
          sheetName, 
          rec, 
          parseResult.sheetBottleId,
          bottles
        );
        
        return {
          rowNumber: rec.excelRow,
          date: rec.date,
          gatePass: rec.gatePass,
          bottleSheetName: sheetName,
          bottleNameRaw: validation.bottleNameRaw,
          shade: rec.shade,
          variant: rec.variant,
          printingType: rec.type,
          box: rec.box,
          qty: rec.qty,
          total: rec.total,
          isValid: validation.isValid,
          errors: validation.errors,
          bottleId: validation.bottleId
        };
      });

      const sheetValidRows = records.filter(r => r.isValid).length;
      const sheetInvalidRows = records.length - sheetValidRows;

      sheets.push({
        sheetName,
        totalRows: records.length,
        validRows: sheetValidRows,
        invalidRows: sheetInvalidRows,
        errorSummary: records.filter(r => r.errors.length > 0).map(r => r.errors[0]),
        invalidRowsDetails: records.filter(r => !r.isValid).map(r => ({
          rowNumber: r.rowNumber,
          gatePass: r.gatePass,
          bottleSheetName: r.bottleSheetName,
          errors: r.errors
        })),
        records
      });

      totalRows += records.length;
      validRows += sheetValidRows;
      invalidRows += sheetInvalidRows;
    }

    res.json({
      success: true,
      data: { totalRows, validRows, invalidRows, sheets, skippedSheets }
    });
  } catch (error) {
    console.error('[DISPATCH IMPORTER] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Commit API
 */
exports.commitDispatchImport = async (req, res) => {
  try {
    const { sheetsToImport, companyId } = req.body;

    if (!sheetsToImport || !Array.isArray(sheetsToImport)) {
      return res.status(400).json({ success: false, message: 'Invalid sheets data' });
    }

    let dispatchImported = 0;
    let dispatchSkipped = 0;
    const skipSummary = [];
    const errors = [];

    const parseDate = (value) => {
      if (!value) return null;
      if (typeof value === 'number') {
        const excelEpoch = new Date(1900, 0, 1);
        return new Date(excelEpoch.getTime() + (value - 1) * 24 * 60 * 60 * 1000);
      }
      
      const str = String(value).trim();
      if (!str) return null;
      
      const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (dotMatch) {
        let day = parseInt(dotMatch[1]);
        let month = parseInt(dotMatch[2]);
        let year = parseInt(dotMatch[3]);
        if (year < 100) year = year < 50 ? year + 2000 : year + 1900;
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
      }
      
      const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        let day = parseInt(slashMatch[1]);
        let month = parseInt(slashMatch[2]);
        let year = parseInt(slashMatch[3]);
        if (year < 100) year = year < 50 ? year + 2000 : year + 1900;
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
      }
      
      return null;
    };

    for (const sheet of sheetsToImport) {
      for (const record of sheet.records || []) {
        // Skip invalid records (bottle not found in master)
        if (!record.isValid) {
          dispatchSkipped++;
          if (record.errors && record.errors.length > 0) {
            record.errors.forEach(err => {
              if (!skipSummary.includes(err)) skipSummary.push(err);
            });
          }
          continue;
        }

        try {
          // Find the bottle in database to get its ID
          let bottleId = record.bottleId;
          let bottleToSave = bottleId;
          
          // Handle special cases
          if (bottleId === 'NO_BOTTLE') {
            // Row has no bottle - save as null or empty string
            bottleToSave = null;
          } else if (typeof bottleId === 'string' && !bottleId.match(/^[0-9a-f]{24}$/i)) {
            // bottleId is a plain bottle name, need to find the database ID
            const matchedBottle = await BottlePerBox.findOne({
              $or: [
                { plainBottleName: bottleId },
                { bottleName: bottleId },
                { bottleNames: bottleId }
              ],
              status: true
            });
            if (matchedBottle) {
              bottleToSave = matchedBottle._id;
            } else {
              // Should not happen since we validated in preview
              bottleToSave = bottleId;
            }
          }

          const newDispatch = new Dispatch({
            dispatchDate: parseDate(record.date) || new Date(),
            gatePassNo: record.gatePass,
            companyId: companyId,
            items: [{
              bottleId: bottleToSave,
              variantId: record.variant,
              coatingShade: record.shade,
              printingTypeId: record.printingType,
              box: record.box || 0,
              qty: record.qty || 0,
              totalQty: record.total || 0
            }],
            remarks: ''
          });

          await newDispatch.save();
          dispatchImported++;
        } catch (err) {
          errors.push(`Row ${record.rowNumber}: ${err.message}`);
        }
      }
    }

    res.json({
      success: true,
      data: { dispatchImported, dispatchSkipped, skipSummary, errors }
    });
  } catch (error) {
    console.error('[DISPATCH IMPORTER] Commit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
