/**
 * General Dispatch Importer - Supports TPP and SHRENO layouts
 * 
 * Rules:
 * - The bottle name comes ONLY from the sheet name.
 * - Validate ONLY the sheet name against the Bottle master, with the same normalization as Incoming.
 * - The product name cell is stored as the product description and is NEVER validated against the master.
 * - If a sheet name is not in master: every row of that sheet is invalid with ONE grouped message per sheet:
 *     Sheet "<name>": bottle not found in master (N rows)
 * - Valid rows are ALWAYS imported, even when other rows or sheets are invalid.
 * - Multiset duplicates rule: row is existing only if a non-deleted record of same company has same bottle,
 *     dispatch date, gate pass (blank = blank), product text, box and qty.
 *     Count existing (N) and file rows (M) and insert M - N.
 * - Reconcile identity: valid rows = inserted + skipped duplicates + failed.
 */

const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const BottlePerBox = require('../models/BottlePerBox');
const Brand = require('../models/Brand');
const BottleSpec = require('../models/Bottlespecs');
const Variant = require('../models/Variant');
const PrintingType = require('../models/PrintingType');
const Dispatch = require('../models/Dispatch');
const { matchBottleNameFromMaster, normalizeBottleForMatching } = require('../utils/bottleMatching');
const { computePlainBottleKeys, updatePlainBottleKeysAtomic, normalizeBottleName } = require('../utils/computePlainBottleKeys');

/**
 * Safely extract text from cell value
 */
const getCellText = (cellValue) => {
  if (cellValue == null) return '';
  if (typeof cellValue === 'object' && cellValue.richText) {
    return cellValue.richText.map(x => x.text).join('');
  }
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
 * Look up cell, consulting real merged ranges (!merges) if cell has no direct value
 */
const getMergedCellValue = (worksheet, r, c) => {
  if (r === undefined || c === undefined || r === null || c === null || r < 0 || c < 0) return null;
  const directVal = getCell(worksheet, r, c);
  if (directVal !== undefined && directVal !== null && String(directVal).trim() !== '') {
    return directVal;
  }
  if (worksheet && worksheet['!merges'] && Array.isArray(worksheet['!merges'])) {
    for (const m of worksheet['!merges']) {
      if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
        const tlVal = getCell(worksheet, m.s.r, m.s.c);
        if (tlVal !== undefined && tlVal !== null && String(tlVal).trim() !== '') {
          return tlVal;
        }
      }
    }
  }
  return directVal;
};

/**
 * Parse numeric value (handle commas, plus notation, etc)
 */
const parseNumber = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

/**
 * Parse dates from various formats (Excel serial number, DD.MM.YY, DD/MM/YY, etc.)
 */
const parseDate = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const date = new Date(excelEpoch.getTime() + (value - 1) * 24 * 60 * 60 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
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
  
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Resolves company from filename if not supplied in request
 */
const resolveCompanyFromFilename = (filename, companyMasters) => {
  if (!filename) return { companyId: null, companyName: 'UNKNOWN', matched: false };
  const original = String(filename).toUpperCase();
  let clean = original.replace(/\.[A-Z0-9]+$/i, '');
  const genericWords = [
    'INCOMING', 'DISPATCH', 'SUMMARY', 'TRADE', 'TPP', 'PLAN', 'SHEET', 'PLANT',
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC',
    '2024', '2025', '2026', '2027', 'XLS', 'XLSX'
  ];
  for (const gw of genericWords) {
    clean = clean.replace(new RegExp(`\\b${gw}\\b`, 'ig'), ' ');
  }
  clean = clean.replace(/[0-9().\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) clean = original;

  const sortedMasters = [...companyMasters].sort((a, b) => (b.name || '').length - (a.name || '').length);
  for (const c of sortedMasters) {
    const dbName = String(c.name).toUpperCase().trim();
    if (clean.includes(dbName) || original.includes(dbName)) {
      return { companyId: c._id.toString(), companyName: c.name, matched: true };
    }
  }
  return { companyId: null, companyName: clean || 'UNKNOWN', matched: false };
};

/**
 * Expand bottle master with aliases (e.g. "30 ML ZC GC (VICTOR)" -> "30 ML VICTOR", "30 ML ZC GC", "VICTOR")
 */
const expandBottleWithAliases = (bottle) => {
  if (!bottle) return bottle;
  const names = new Set(bottle.bottleNames || []);
  if (bottle.bottleName) names.add(bottle.bottleName);
  if (bottle.plainBottleName) names.add(bottle.plainBottleName);

  for (const name of Array.from(names)) {
    const parenMatch = name.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (parenMatch) {
      const beforeParen = parenMatch[1].trim(); // e.g. '30 ML ZC GC'
      const insideParen = parenMatch[2].trim(); // e.g. 'VICTOR'
      names.add(beforeParen);
      names.add(insideParen);

      const capMatch = beforeParen.match(/^(\d+(?:\.\d+)?\s*(?:ML|GM|L|KG))\b/i);
      if (capMatch) {
        names.add(`${capMatch[1]} ${insideParen}`);
      }
    }
  }
  return {
    ...bottle,
    bottleNames: Array.from(names)
  };
};

/**
 * Filter bottles by company to ensure bottles belonging to other companies are not matched
 */
const getCompanyFilteredBottles = async (companyId, allCompanies, rawBottles) => {
  const expandedBottles = rawBottles.map(expandBottleWithAliases);
  if (!companyId) return expandedBottles;

  const comp = allCompanies.find(c => String(c._id) === String(companyId));
  if (!comp) return expandedBottles;

  const companyBrands = await Brand.find({ companyId: comp._id, isDeleted: { $ne: true } }).select('_id').lean();
  const companyBrandIds = companyBrands.map(b => b._id);
  const companySpecs = await BottleSpec.find({ brandId: { $in: companyBrandIds }, isDeleted: { $ne: true } }).select('bottleName').lean();
  const companyBottleNames = new Set(companySpecs.map(s => (s.bottleName || '').trim()).filter(Boolean));

  const otherBrands = await Brand.find({ companyId: { $ne: comp._id }, isDeleted: { $ne: true } }).select('_id').lean();
  const otherBrandIds = otherBrands.map(b => b._id);
  const otherSpecs = await BottleSpec.find({ brandId: { $in: otherBrandIds }, isDeleted: { $ne: true } }).select('bottleName').lean();
  const otherBottleNames = new Set(otherSpecs.map(s => (s.bottleName || '').trim()).filter(Boolean));

  const otherCompanyNamesList = allCompanies
    .filter(c => String(c._id) !== String(comp._id))
    .map(c => c.name.trim())
    .filter(n => n.length >= 3 && !['THE', 'AND'].includes(n.toUpperCase()));

  return expandedBottles.filter(b => {
    const allNames = [b.bottleName, b.plainBottleName, ...(b.bottleNames || [])].filter(Boolean);

    const inThisCompany = allNames.some(n => companyBottleNames.has(n.trim()));
    if (inThisCompany) return true;

    const inOtherCompany = allNames.some(n => otherBottleNames.has(n.trim()));
    if (inOtherCompany) return false;

    const hasOtherCompanyName = otherCompanyNamesList.some(compName => 
      allNames.some(n => new RegExp(`\\b${compName}\\b`, 'i').test(n))
    );
    if (hasOtherCompanyName) return false;

    return true;
  });
};

/**
 * Parse dispatch sheet using absolute cell addresses
 * 
 * Bottle Resolution (same as Incoming):
 * 1. Check outer name: sheetName against bottle master.
 * 2. Check inner name: bottle name written in the sheet (e.g. Column D "bottle name" column).
 * 3. If either matches master, that bottle is used.
 */
const parseDispatchSheet = (worksheet, sheetName, bottles) => {
  const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const maxRow = range.e.r;
  const maxCol = range.e.c;
  
  // Find marker: scan rows 0-9 for text containing "dispatch" (case-insensitive)
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
  
  // Date and (qty or total) are optional in header; if not found, columns remain undefined
  // and row values will default gracefully
  
  // DUAL BOTTLE DETECTION (OUTER → INNER FALLBACK, same as Incoming):
  // Step 1: Try to match the sheet name to a master bottle (Outer)
  let sheetBottleMatch = matchBottleNameFromMaster(sheetName, bottles);
  let sheetBottleId = sheetBottleMatch.bottleName;
  let sheetBottleResolutionMethod = 'OUTER';



  let isSheetBottleValid = Boolean(sheetBottleId && sheetBottleId !== 'MISSING');
  let matchedBottleName = isSheetBottleValid ? sheetBottleId : null;

  // Step 2: If outer (sheet name) didn't match, try inner (row text) fallback (same as Incoming)
  let distinctBottlesFound = new Set();
  let innerRowResults = [];

  if (!isSheetBottleValid) {

    let candidateCols = [];
    for (let r = 0; r <= Math.min(6, maxRow); r++) {
      for (let c = 0; c <= Math.min(10, maxCol); c++) {
        const text = getLowText(getCell(worksheet, r, c));
        if (text.includes('bottle') && (text.includes('name') || text.includes('desc') || text === 'bottle')) {
          if (!candidateCols.includes(c)) candidateCols.push(c);
        }
      }
    }
    // Also include default incoming bottle columns: index 3 (Col D) for TPP, index 4 (Col E) for SHRENO
    if (!candidateCols.includes(3)) candidateCols.push(3);
    if (!candidateCols.includes(4)) candidateCols.push(4);

    for (let r = 0; r <= maxRow; r++) {
      for (const col of candidateCols) {
        const val = getCellText(getCell(worksheet, r, col));
        if (val && !/^old\s*stock$|^bottle|^total|^sr|^challan|^date/i.test(val.trim())) {
          const innerMatch = matchBottleNameFromMaster(val.trim(), bottles);
          const innerBottleId = innerMatch.bottleName;
          if (innerBottleId && innerBottleId !== 'MISSING') {
            distinctBottlesFound.add(innerBottleId);
            innerRowResults.push({ row: r + 1, col, text: val.trim(), bottleId: innerBottleId });

          }
        }
      }
    }



    if (distinctBottlesFound.size >= 1) {
      sheetBottleId = Array.from(distinctBottlesFound)[0];
      sheetBottleResolutionMethod = 'INNER_FALLBACK_SINGLE';
      matchedBottleName = sheetBottleId;
      sheetBottleMatch = { bottleName: sheetBottleId };
      isSheetBottleValid = true;


    } else {

    }
  } else {

  }
  
  // Parse data rows
  const records = [];
  let lastDate = '';
  let lastGate = '';
  let lastShade = '';
  let endRow = null;
  
  for (let r = markerRow + 3; r <= maxRow; r++) {
    // Check for end marker (TOTAL row in marker column or first column)
    const markerColText = getLowText(getCell(worksheet, r, markerCol));
    if (markerColText === 'total') {
      endRow = r;
      break;
    }
    
    // Check if row has any data in the tracked columns
    let hasAnyData = false;
    for (const col of Object.values(columns)) {
      const val = getCellText(getMergedCellValue(worksheet, r, col));
      if (val) {
        hasAnyData = true;
        break;
      }
    }
    if (!hasAnyData) continue;
    
    // Extract values with real merges and fallback inheritance
    const dateCell = getMergedCellValue(worksheet, r, columns.date);
    const dateText = getCellText(dateCell);

    const gateCell = getMergedCellValue(worksheet, r, columns.gate);
    const gateText = getCellText(gateCell);

    const isNewGroup = (dateText && dateText !== lastDate) || (gateText && gateText !== lastGate);
    if (dateText) lastDate = dateText;
    if (gateText) lastGate = gateText;

    const shadeCell = getMergedCellValue(worksheet, r, columns.coating);
    let shadeText = getCellText(shadeCell);
    if (!shadeText && !isNewGroup) {
      shadeText = lastShade;
    }
    if (shadeText) {
      lastShade = shadeText;
    } else if (isNewGroup) {
      lastShade = '';
    }

    const variant = getCellText(getMergedCellValue(worksheet, r, columns.printing));
    const foil = getCellText(getMergedCellValue(worksheet, r, columns.foil));
    const organic = getCellText(getMergedCellValue(worksheet, r, columns.organic));
    const box = parseNumber(getMergedCellValue(worksheet, r, columns.box));
    const qty = parseNumber(getMergedCellValue(worksheet, r, columns.qty));
    const total = parseNumber(getMergedCellValue(worksheet, r, columns.total));
    const remarks = columns.remarks !== undefined ? getCellText(getMergedCellValue(worksheet, r, columns.remarks)) : '';

    if (!variant && !total && !box && !shadeText && !gateText && !dateText && !remarks) continue;

    // Read foil detail sub-columns into Print Type & text color
    let textColor = '';
    let printTypeName = '';
    let printingType = '';

    if (foil && organic) {
      textColor = `${foil} / ${organic}`;
      printTypeName = 'FOIL AND  ORG';
      printingType = `${foil}/foil, ${organic}/organic`;
    } else if (organic) {
      textColor = organic;
      printTypeName = 'ORGANIC';
      printingType = `${organic}/organic`;
    } else if (foil) {
      textColor = foil;
      printTypeName = 'FOIL';
      printingType = `${foil}/foil`;
    }
    
    // Product text is stored purely as product description - never validated against master
    const productParts = [shadeText, variant, foil, organic].filter(Boolean);
    const productText = productParts.join(' ').trim() || shadeText || variant || '';
    
    // Row is valid if and only if the sheet bottle matched master
    const isValid = isSheetBottleValid;
    const errors = isValid ? [] : [`Sheet "${sheetName}": bottle not found in master`];
    
    records.push({
      excelRow: r + 1,
      rowNumber: r + 1,
      date: dateText || lastDate,
      gatePass: gateText || lastGate,
      bottleSheetName: sheetName,
      bottleNameRaw: sheetName,
      bottleId: matchedBottleName || 'MISSING',
      shade: shadeText,
      variant,
      printingType,
      printTypeName,
      textColor,
      foil: foil || null,
      organic: organic || null,
      productText,
      box,
      qty,
      total: total || (box * qty),
      remarks,
      isValid,
      errors
    });
  }

  // Group records into groups: sheetName + date + gatePass
  const groups = [];
  let currentGroup = null;
  for (const rec of records) {
    const groupKey = `${sheetName}__${rec.date}__${rec.gatePass}`;
    if (!currentGroup || currentGroup.groupKey !== groupKey) {
      currentGroup = {
        groupKey,
        bottleSheetName: sheetName,
        bottleName: matchedBottleName,
        date: rec.date,
        gatePass: rec.gatePass,
        shade: rec.shade,
        subtotalQty: 0,
        lines: [],
        isValid: true,
        hasInvalid: false
      };
      groups.push(currentGroup);
    }
    currentGroup.lines.push(rec);
    currentGroup.subtotalQty += Number(rec.total) || 0;
    if (!rec.isValid) {
      currentGroup.hasInvalid = true;
    }
  }
  for (const g of groups) {
    g.isValid = g.lines.some(l => l.isValid);
  }
  
  const sumTotal = records.reduce((a, x) => a + x.total, 0);
  const declaredTotal = endRow !== null ? parseNumber(getCell(worksheet, endRow, columns.total)) : null;
  
  return {
    error: null,
    marker: markerCellRef,
    markerRow,
    markerCol,
    columns,
    records,
    groups,
    groupsCount: groups.length,
    endRow: endRow === null ? null : endRow + 1,
    sumTotal,
    declaredTotal,
    sheetBottleMatch,
    isSheetBottleValid,
    matchedBottleName,
    resolutionMethod: sheetBottleResolutionMethod
  };
};

const normalizeText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const getLineSig = (bottle, shade, variant, box, qty, total) => {
  const b = normalizeBottleName(bottle) || normalizeText(bottle);
  const s = normalizeText(shade);
  const v = normalizeText(variant);
  const bx = Number(box) || 0;
  const q = Number(qty) || 0;
  const t = Number(total) || 0;
  return `${b}__${s}__${v}__${bx}__${q}__${t}`;
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
    const rawBottles = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
    const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();

    // Resolve company
    let resolvedCompanyId = req.body && req.body.companyId ? req.body.companyId : null;
    let resolvedCompanyName = 'UNKNOWN';
    if (resolvedCompanyId) {
      const c = allCompanies.find(x => String(x._id) === String(resolvedCompanyId));
      if (c) resolvedCompanyName = c.name;
    } else {
      const compRes = resolveCompanyFromFilename(req.file.originalname, allCompanies);
      if (compRes.matched) {
        resolvedCompanyId = compRes.companyId;
        resolvedCompanyName = compRes.companyName;
      }
    }
    const bottles = rawBottles.map(expandBottleWithAliases);

    // Build bottle name to id map
    const bottleNameToId = new Map();
    for (const b of bottles) {
      if (b.bottleName) bottleNameToId.set(b.bottleName, b._id);
      if (b.plainBottleName) bottleNameToId.set(b.plainBottleName, b._id);
      if (Array.isArray(b.bottleNames)) {
        for (const n of b.bottleNames) bottleNameToId.set(n, b._id);
      }
    }

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

      const sheetValidRows = parseResult.records.filter(r => r.isValid).length;
      const sheetInvalidRows = parseResult.records.length - sheetValidRows;

      // Grouped error summary per sheet: Sheet "<name>": bottle not found in master (N rows)
      const errorSummary = [];
      const invalidReasons = {};
      if (!parseResult.isSheetBottleValid && parseResult.records.length > 0) {
        const msg = `Sheet "${sheetName}": bottle not found in master (${parseResult.records.length} rows)`;
        errorSummary.push(msg);
        invalidReasons[msg] = parseResult.records.length;
      }

      // Check existing records in DB using signature match consistent with commit
      let existingRecordsCount = 0;
      if (resolvedCompanyId && parseResult.isSheetBottleValid && parseResult.groups) {
        for (const grp of parseResult.groups) {
          const docDate = parseDate(grp.date);
          if (!docDate) continue;
          const startDay = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate(), 0, 0, 0, 0);
          const endDay = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate(), 23, 59, 59, 999);
          const query = {
            companyId: new mongoose.Types.ObjectId(resolvedCompanyId),
            isDeleted: false,
            dispatchDate: { $gte: startDay, $lte: endDay }
          };
          if (grp.gatePass) {
            query.gatePassNo = String(grp.gatePass).trim();
          } else {
            query.$or = [{ gatePassNo: null }, { gatePassNo: '' }, { gatePassNo: { $exists: false } }];
          }

          let existingDispatch = null;
          try {
            existingDispatch = await Dispatch.findOne(query).populate('items.variantId items.printingTypeId').lean();
          } catch (err) {
            // ignore find error in preview
          }

          if (existingDispatch && Array.isArray(existingDispatch.items)) {
            const existingSigCounts = new Map();
            for (const item of existingDispatch.items) {
              const itemVarName = item.printing || (item.variantId && item.variantId.variantName) || '';
              let itemBottleName = '';
              if (item.bottleId) {
                const bDoc = bottles.find(b => String(b._id) === String(item.bottleId._id || item.bottleId));
                itemBottleName = bDoc ? (bDoc.plainBottleName || bDoc.bottleName) : (item.bottleId.plainBottleName || item.bottleId.bottleName || String(item.bottleId));
              } else {
                itemBottleName = item.productName || '';
              }
              const sig = getLineSig(itemBottleName, item.coatingShade, itemVarName, item.box, item.qty, item.totalQty);
              existingSigCounts.set(sig, (existingSigCounts.get(sig) || 0) + 1);
            }

            for (const line of grp.lines) {
              if (!line.isValid) continue;
              const lineBottle = parseResult.matchedBottleName || line.bottleId || sheetName;
              const lineSig = getLineSig(
                lineBottle,
                line.shade,
                line.variant,
                line.box,
                line.qty,
                line.total
              );
              const count = existingSigCounts.get(lineSig) || 0;
              if (count > 0) {
                existingSigCounts.set(lineSig, count - 1);
                line.existingPlans = '1';
                existingRecordsCount++;
              } else {
                line.existingPlans = '-';
              }
            }
          } else {
            for (const line of grp.lines) {
              line.existingPlans = '-';
            }
          }
        }
      }

      const detectedFormat = resolvedCompanyName && resolvedCompanyName !== 'UNKNOWN' ? resolvedCompanyName : 'TPP';

      sheets.push({
        sheetName,
        bottleName: parseResult.matchedBottleName || sheetName,
        matchedBottleName: parseResult.matchedBottleName,
        resolutionMethod: parseResult.resolutionMethod || 'OUTER',
        totalRows: parseResult.records.length,
        validRows: sheetValidRows,
        invalidRows: sheetInvalidRows,
        groupsCount: parseResult.groups ? parseResult.groups.length : 0,
        groups: parseResult.groups || [],
        existingRecordsCount,
        existingPlansCount: existingRecordsCount,
        detectedFormat,
        errorSummary,
        invalidReasons,
        bottleMatchDetails: {
          status: parseResult.isSheetBottleValid ? 'matched' : 'unmatched',
          bottleName: parseResult.matchedBottleName,
          suggestion: parseResult.sheetBottleMatch?.suggestion || null,
          suggestedBottles: parseResult.sheetBottleMatch?.suggestedBottles || []
        },
        records: parseResult.records
      });

      totalRows += parseResult.records.length;
      validRows += sheetValidRows;
      invalidRows += sheetInvalidRows;
    }

    const totalGroups = sheets.reduce((sum, s) => sum + (s.groupsCount || 0), 0);
    const detectedFormat = resolvedCompanyName && resolvedCompanyName !== 'UNKNOWN' ? resolvedCompanyName : 'TPP';

    res.json({
      success: true,
      data: {
        fileName: req.file.originalname,
        companyId: resolvedCompanyId,
        companyName: resolvedCompanyName,
        detectedFormat,
        detectedCompanies: [detectedFormat],
        totalRows,
        validRows,
        invalidRows,
        existingPlansCount: sheets.reduce((sum, s) => sum + (s.existingPlansCount || 0), 0),
        totalGroups,
        sheets,
        skippedSheets
      }
    });
  } catch (error) {
    console.error('[DISPATCH IMPORTER] Preview Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Commit API - Imports valid records and applies multiset duplicate rule
 */
exports.commitDispatchImport = async (req, res) => {
  try {
    const { sheetsToImport, companyId } = req.body;

    if (!sheetsToImport || !Array.isArray(sheetsToImport)) {
      return res.status(400).json({ success: false, message: 'Invalid sheets data' });
    }

    const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
    let resolvedCompanyId = companyId || (req.body.previewData && req.body.previewData.companyId);
    if (!resolvedCompanyId && sheetsToImport.length > 0) {
      for (const s of sheetsToImport) {
        if (s.companyId) { resolvedCompanyId = s.companyId; break; }
        if (s.records && s.records[0]?.companyId) { resolvedCompanyId = s.records[0].companyId; break; }
      }
    }
    if (!resolvedCompanyId) {
      const defaultComp = allCompanies.find(c => c.name === 'TPP') || allCompanies[0];
      if (defaultComp) resolvedCompanyId = defaultComp._id.toString();
    }

    if (!resolvedCompanyId) {
      return res.status(400).json({ success: false, message: 'companyId is required for commit' });
    }

    const rawBottles = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
    const allBottles = rawBottles.map(expandBottleWithAliases);
    const bottleNameToId = new Map();
    for (const b of allBottles) {
      if (b.bottleName) bottleNameToId.set(b.bottleName, b._id);
      if (b.plainBottleName) bottleNameToId.set(b.plainBottleName, b._id);
      if (Array.isArray(b.bottleNames)) {
        for (const n of b.bottleNames) bottleNameToId.set(n, b._id);
      }
    }

    let totalValidRows = 0;
    let totalInvalidRows = 0;
    const invalidReasons = [];
    const validRecords = [];

    // Separate valid and invalid rows across sheets
    for (const sheet of sheetsToImport) {
      const records = sheet.records || [];
      const sheetValid = records.filter(r => r.isValid);
      const sheetInvalid = records.filter(r => !r.isValid);

      totalValidRows += sheetValid.length;
      totalInvalidRows += sheetInvalid.length;

      if (sheetInvalid.length > 0) {
        invalidReasons.push(`Sheet "${sheet.sheetName}": bottle not found in master (${sheetInvalid.length} rows)`);
      }

      for (const rec of sheetValid) {
        validRecords.push(rec);
      }
    }

    // If zero valid rows, return summary with grouped reasons
    if (totalValidRows === 0) {
      return res.json({
        success: true,
        message: 'No valid records to import',
        data: {
          dispatchImported: 0,
          dispatchSkipped: 0,
          totalValidRows: 0,
          invalidRows: totalInvalidRows,
          invalidReasons,
          skipSummary: [],
          skippedRecords: [],
          errors: []
        }
      });
    }

    // Resolve bottle IDs for valid records
    for (const rec of validRecords) {
      let bId = bottleNameToId.get(rec.bottleId) || bottleNameToId.get(rec.bottleSheetName);
      if (!bId && rec.bottleId && String(rec.bottleId).match(/^[0-9a-f]{24}$/i)) {
        bId = new mongoose.Types.ObjectId(rec.bottleId);
      }
      if (!bId) {
        const m = matchBottleNameFromMaster(rec.bottleId || rec.bottleSheetName, allBottles);
        if (m.bottleName && m.bottleName !== 'MISSING') {
          bId = bottleNameToId.get(m.bottleName) || m._id;
        }
      }
      rec.resolvedBottleId = bId || null;
    }

    // Pre-fetch all variants and printingTypes for matching
    const allVariants = await Variant.find({ isDeleted: { $ne: true } }).lean();
    const allPrintingTypes = await PrintingType.find({ isDeleted: { $ne: true } }).lean();

    const normalizeText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    const findVariant = (vName) => {
      if (!vName) return null;
      const target = normalizeText(vName);
      return allVariants.find(v => normalizeText(v.variantName) === target);
    };

    const findPrintingType = (ptName) => {
      if (!ptName) return null;
      const target = normalizeText(ptName);
      return allPrintingTypes.find(pt => normalizeText(pt.name) === target);
    };

    // Group valid records into dispatch groups: company + bottle + date + gate pass
    const dispatchGroups = new Map();

    for (const rec of validRecords) {
      const docDate = parseDate(rec.date) || new Date();
      const dateKey = docDate.toISOString().slice(0, 10);
      const bKey = rec.resolvedBottleId ? String(rec.resolvedBottleId) : String(rec.bottleSheetName || 'NO_BOTTLE');
      const gpKey = String(rec.gatePass || '').trim().toUpperCase();

      const groupKey = `${resolvedCompanyId}__${bKey}__${dateKey}__${gpKey}`;
      if (!dispatchGroups.has(groupKey)) {
        dispatchGroups.set(groupKey, {
          groupKey,
          companyId: new mongoose.Types.ObjectId(resolvedCompanyId),
          bottleId: rec.resolvedBottleId,
          bottleSheetName: rec.bottleSheetName,
          docDate,
          gatePass: String(rec.gatePass || '').trim(),
          remarks: rec.remarks || '',
          records: []
        });
      }
      dispatchGroups.get(groupKey).records.push(rec);
    }

    let dispatchImported = 0;
    let dispatchSkipped = 0;
    let affectedGroupsCount = 0;
    const skipSummary = [];
    const skippedRecords = [];
    const errors = [];

    const getLineSig = (bottle, shade, variant, box, qty, total) => {
      const b = normalizeBottleName(bottle) || normalizeText(bottle);
      const s = normalizeText(shade);
      const v = normalizeText(variant);
      const bx = Number(box) || 0;
      const q = Number(qty) || 0;
      const t = Number(total) || 0;
      return `${b}__${s}__${v}__${bx}__${q}__${t}`;
    };

    for (const dGroup of dispatchGroups.values()) {
      const startDay = new Date(dGroup.docDate.getFullYear(), dGroup.docDate.getMonth(), dGroup.docDate.getDate(), 0, 0, 0, 0);
      const endDay = new Date(dGroup.docDate.getFullYear(), dGroup.docDate.getMonth(), dGroup.docDate.getDate(), 23, 59, 59, 999);

      const query = {
        companyId: dGroup.companyId,
        isDeleted: false,
        dispatchDate: { $gte: startDay, $lte: endDay }
      };
      if (dGroup.gatePass) {
        query.gatePassNo = dGroup.gatePass;
      } else {
        query.$or = [{ gatePassNo: null }, { gatePassNo: '' }, { gatePassNo: { $exists: false } }];
      }

      let existingDispatch = null;
      try {
        existingDispatch = await Dispatch.findOne(query);
      } catch (findErr) {
        console.error('[DISPATCH IMPORTER] Error finding existing dispatch:', findErr);
      }

      // Count existing matching lines in this dispatch
      const existingSigCounts = new Map();
      if (existingDispatch && Array.isArray(existingDispatch.items)) {
        for (const item of existingDispatch.items) {
          let itemVarName = item.printing || '';
          if (!itemVarName && item.variantId) {
            const vDoc = allVariants.find(v => String(v._id) === String(item.variantId));
            if (vDoc) itemVarName = vDoc.variantName;
          }

          let itemBottleName = '';
          if (item.bottleId) {
            const bDoc = allBottles.find(b => String(b._id) === String(item.bottleId._id || item.bottleId));
            itemBottleName = bDoc ? (bDoc.plainBottleName || bDoc.bottleName) : (item.bottleId.plainBottleName || item.bottleId.bottleName || String(item.bottleId));
          } else {
            itemBottleName = item.productName || '';
          }

          const sig = getLineSig(itemBottleName, item.coatingShade, itemVarName, item.box, item.qty, item.totalQty);
          existingSigCounts.set(sig, (existingSigCounts.get(sig) || 0) + 1);
        }
      }

      // Multiset split: for file lines matching existing, skip first N, insert M - N
      const linesToInsert = [];
      const seenSigCounts = new Map();

      for (const rec of dGroup.records) {
        let recBottleName = '';
        if (rec.resolvedBottleId) {
          const bDoc = allBottles.find(b => String(b._id) === String(rec.resolvedBottleId));
          recBottleName = bDoc ? (bDoc.plainBottleName || bDoc.bottleName) : (rec.bottleId || rec.bottleSheetName || String(rec.resolvedBottleId));
        } else {
          recBottleName = rec.bottleId || rec.bottleSheetName || '';
        }

        const recSig = getLineSig(
          recBottleName,
          rec.shade,
          rec.variant,
          rec.box,
          rec.qty,
          rec.total
        );

        const seen = seenSigCounts.get(recSig) || 0;
        const existingN = existingSigCounts.get(recSig) || 0;

        if (seen < existingN) {
          dispatchSkipped++;
          const reason = `Sheet "${rec.bottleSheetName}" Row ${rec.rowNumber}: Duplicate of existing entry (Gate Pass ${dGroup.gatePass || 'N/A'}, ${rec.variant || rec.shade || 'line'})`;
          skipSummary.push(reason);
          skippedRecords.push({
            rowNumber: rec.rowNumber,
            sheetName: rec.bottleSheetName,
            gatePass: dGroup.gatePass,
            reason: 'Duplicate of existing entry'
          });
          seenSigCounts.set(recSig, seen + 1);
        } else {
          linesToInsert.push(rec);
          seenSigCounts.set(recSig, seen + 1);
        }
      }

      if (linesToInsert.length > 0) {
        try {
          const newItems = linesToInsert.map(rec => {
            const box = Number(rec.box) || 0;
            const qty = Number(rec.qty) || 0;
            const totalQty = Number(rec.total) || (box * qty);

            const vDoc = findVariant(rec.variant);
            const ptDoc = findPrintingType(rec.printTypeName);

            return {
              bottleId: rec.resolvedBottleId,
              variantId: vDoc ? vDoc._id : null,
              coatingShade: rec.shade || null,
              printingTypeId: ptDoc ? ptDoc._id : null,
              detectedTextColor: rec.textColor || rec.organic || rec.foil || 'Not Detected',
              productName: rec.productText || null,
              printing: rec.variant || null,
              foil: rec.foil || null,
              organic: rec.organic || null,
              box,
              qty,
              totalQty
            };
          });

          if (existingDispatch) {
            existingDispatch.items.push(...newItems);
            await existingDispatch.save();
            // Update plainBottleKeys
            const plainBottleKeys = await computePlainBottleKeys(existingDispatch.items);
            await updatePlainBottleKeysAtomic(mongoose.connection.db, existingDispatch._id, plainBottleKeys);
          } else {
            const newDispatch = new Dispatch({
              dispatchDate: dGroup.docDate,
              gatePassNo: dGroup.gatePass || null,
              companyId: dGroup.companyId,
              items: newItems,
              remarks: dGroup.remarks || ''
            });
            await newDispatch.save();
            // Update plainBottleKeys
            const plainBottleKeys = await computePlainBottleKeys(newItems);
            await updatePlainBottleKeysAtomic(mongoose.connection.db, newDispatch._id, plainBottleKeys);
          }

          dispatchImported += linesToInsert.length;
          affectedGroupsCount++;
        } catch (saveErr) {
          console.error(`[DISPATCH IMPORTER] Save error for group ${dGroup.groupKey}:`, saveErr);
          errors.push(`Group Gate Pass ${dGroup.gatePass}: ${saveErr.message}`);
        }
      }
    }

    // Reconcile identity: validRows = imported + skipped + errors
    const accounted = dispatchImported + dispatchSkipped + errors.length;
    console.log(`[DISPATCH IMPORTER] Reconcile Identity: valid (${totalValidRows}) = inserted (${dispatchImported}) + skipped (${dispatchSkipped}) + failed (${errors.length}) [sum=${accounted}] -> match: ${totalValidRows === accounted}`);


    let message = `Imported ${dispatchImported} of ${totalValidRows} valid lines in ${affectedGroupsCount} groups.`;
    if (dispatchSkipped > 0) {
      message += ` Skipped ${dispatchSkipped} (already existing).`;
    }

    res.json({
      success: true,
      message,
      data: {
        dispatchImported,
        dispatchSkipped,
        totalValidRows,
        invalidRows: totalInvalidRows,
        groupsCount: affectedGroupsCount,
        invalidReasons,
        skipSummary,
        skippedRecords,
        errors
      }
    });
  } catch (error) {
    console.error('[DISPATCH IMPORTER] Commit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
