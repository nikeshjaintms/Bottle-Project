const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const BottlePerBox = require('../models/BottlePerBox');
const PlainBottleStock = require('../models/PlainBottleStock');
const Incoming = require('../models/Incoming');
const Dispatch = require('../models/Dispatch');
const Brand = require('../models/Brand');
const BottleSpec = require('../models/Bottlespecs');
const { matchBottleNameFromMaster, normalizeBottleForMatching, levenshteinDistance, getSimilarityScore, normalizeBottle } = require('../utils/bottleMatching');

/**
 * Reused from Printing Plan Import - resolves company from filename
 */
const resolveCompanyFromFilename = (filename, companyMasters) => {
    if (!filename) return { companyId: null, companyName: 'UNKNOWN', matched: false, source: 'filename' };
    const original = String(filename).toUpperCase();

    let clean = original.replace(/\.[A-Z0-9]+$/i, '');

    const genericWords = [
        'INCOMING', 'DISPATCH', 'SUMMARY', 'TRADE', 'TPP', 'PLAN', 'SHEET', 'PLANT',
        'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC',
        '2024', '2025', '2026', '2027', 'XLS', 'XLSX'
    ];

    for (const gw of genericWords) {
        const regex = new RegExp(`\\b${gw}\\b`, 'ig');
        clean = clean.replace(regex, ' ');
    }

    clean = clean.replace(/[0-9().\-_]/g, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();

    if (!clean) clean = original;

    const sortedMasters = [...companyMasters].sort((a, b) => (b.name || '').length - (a.name || '').length);

    for (const c of sortedMasters) {
        const dbName = String(c.name).toUpperCase().trim();
        if (clean.includes(dbName) || original.includes(dbName)) {
            return {
                companyId: c._id.toString(),
                companyName: c.name,
                matched: true,
                source: 'filename'
            };
        }
    }

    return {
        companyId: null,
        companyName: clean || 'UNKNOWN',
        matched: false,
        source: 'filename'
    };
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
            const beforeParen = parenMatch[1].trim();
            const insideParen = parenMatch[2].trim();
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

    // 1. Bottles in BottleSpec for THIS company
    const companyBrands = await Brand.find({ companyId: comp._id, isDeleted: { $ne: true } }).select('_id').lean();
    const companyBrandIds = companyBrands.map(b => b._id);
    const companySpecs = await BottleSpec.find({ brandId: { $in: companyBrandIds }, isDeleted: { $ne: true } }).select('bottleName').lean();
    const companyBottleNames = new Set(companySpecs.map(s => (s.bottleName || '').trim()).filter(Boolean));

    // 2. Bottles in BottleSpec for OTHER companies
    const otherBrands = await Brand.find({ companyId: { $ne: comp._id }, isDeleted: { $ne: true } }).select('_id').lean();
    const otherBrandIds = otherBrands.map(b => b._id);
    const otherSpecs = await BottleSpec.find({ brandId: { $in: otherBrandIds }, isDeleted: { $ne: true } }).select('bottleName').lean();
    const otherBottleNames = new Set(otherSpecs.map(s => (s.bottleName || '').trim()).filter(Boolean));

    // 3. Names of other companies (e.g. SFP, SHRENO, MCNORE)
    const otherCompanyNamesList = allCompanies
        .filter(c => String(c._id) !== String(comp._id))
        .map(c => c.name.trim())
        .filter(n => n.length >= 3 && !['THE', 'AND'].includes(n.toUpperCase()));

    return expandedBottles.filter(b => {
        const allNames = [b.bottleName, b.plainBottleName, ...(b.bottleNames || [])].filter(Boolean);

        // If bottle belongs to this company's specs, definitely include
        const inThisCompany = allNames.some(n => companyBottleNames.has(n.trim()));
        if (inThisCompany) return true;

        // If bottle belongs to another company's specs and not this company, exclude
        const inOtherCompany = allNames.some(n => otherBottleNames.has(n.trim()));
        if (inOtherCompany) return false;

        // If bottle explicitly contains another company's name/code, exclude
        const hasOtherCompanyName = otherCompanyNamesList.some(compName => 
            allNames.some(n => new RegExp(`\\b${compName}\\b`, 'i').test(n))
        );
        if (hasOtherCompanyName) return false;

        // Generic / unassigned bottle: allow as fallback
        return true;
    });
};

/**
 * Parse dates from various formats
 */
const parseDate = (value) => {
    if (!value) return null;
    
    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
        // Excel dates are stored as days since January 0, 1900
        const excelEpoch = new Date(1900, 0, 1);
        const date = new Date(excelEpoch.getTime() + (value - 1) * 24 * 60 * 60 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // If it's a string, try multiple formats
    if (typeof value === 'string') {
        const trimmed = String(value).trim();
        if (!trimmed) return null;
        
        // Try DD.MM.YY or DD.MM.YYYY format (most common in these workbooks)
        const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
        if (dotMatch) {
            let day = parseInt(dotMatch[1]);
            let month = parseInt(dotMatch[2]);
            let year = parseInt(dotMatch[3]);
            
            // Convert 2-digit year to 4-digit (26 -> 2026, etc.)
            if (year < 100) {
                year = year < 50 ? year + 2000 : year + 1900;
            }
            
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Try DD/MM/YY or DD/MM/YYYY format
        const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
            let day = parseInt(slashMatch[1]);
            let month = parseInt(slashMatch[2]);
            let year = parseInt(slashMatch[3]);
            
            if (year < 100) {
                year = year < 50 ? year + 2000 : year + 1900;
            }
            
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime())) return date;
        }
        
        // Fallback: try standard Date parsing
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // If it's already a Date object
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }
    
    return null;
};

/**
 * Check if row is skippable (blank padding or total row)
 * A row is skippable if:
 * - It's completely empty, OR
 * - It contains only generic labels (TOTAL, SUBTOTAL, etc.) and no meaningful data
 */
const isSkippableRow = (rowData) => {
    if (!rowData || rowData.length === 0) return true;
    
    // Rule 1: Check for footer/summary labels
    const footerLabels = [
        'TOTAL', 'SUB TOTAL', 'NET TOTAL', 'GRAND TOTAL',
        'TOTAL INCOMING', 'TOTAL DISPATCH',
        'COATED', 'READY TO DISPATCH',
        'PLAIN JAR AVL', 'SAMPLE',
        'PROCESS REJECTION/BROKEN', 'PLAIN REJECTION/BROKEN'
    ];
    
    const rowText = rowData.map(c => String(c || '').trim()).join(' | ');
    const upperRowText = rowText.toUpperCase();
    
    for (const label of footerLabels) {
        if (upperRowText.includes(label.toUpperCase())) {
            return true;
        }
    }
    
    // Rule 2: Row is entirely empty
    const nonEmptyCount = rowData.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
    if (nonEmptyCount === 0) return true;
    
    // Rule 3: Check if this is an OLD STOCK row (special case - no date/challan required)
    const bottle = String(rowData[3] || '').trim();
    if (bottle.toUpperCase() === 'OLD STOCK') {
        // OLD STOCK rows are valid data, don't skip them
        return false;
    }
    
    // Rule 4: Row must have a serial number (sr.no in column A) to be data
    // Without a sr.no, it's padding/header/footer and should be skipped
    const srNo = String(rowData[0] || '').trim();
    if (!srNo) return true;
    
    // Rule 5: Check if sr.no looks like a number (not a header like "SR.NO")
    if (isNaN(parseInt(srNo))) return true;
    
    // Row has sr.no and is not empty - it's a data row
    // Don't skip here; let parsing handle validation of individual fields
    return false;
};


/**
 * Parse TPP format (cols A-G for Incoming at row 3 headers)
 * 
 * CRITICAL: Bottle identity is resolved from SHEET NAME for ALL rows, not per-row lookup.
 * The bottleNameText in column D is descriptive text within that bottle's sheet and is NOT
 * used for bottle identity resolution. This ensures consistent per-bottle-sheet processing.
 */
const parseTppIncoming = (rowData, rowIndex, allBottles, sheetName = null, sheetBottleId = null) => {
    // Columns: A(sr.no) B(date) C(challan no) D(bottle name) E(box) F(qty) G(total)
    const srNo = String(rowData[0] || '').trim();
    const date = rowData[1];
    const challanNo = String(rowData[2] || '').trim();
    const bottleNameText = String(rowData[3] || '').trim();
    const box = rowData[4];
    const qty = rowData[5];
    const totalQty = rowData[6];

    // DIAGNOSTIC LOGGING: Trace raw cell values for debugging combined sheet issues
    if (rowIndex < 10 || rowIndex % 5 === 0) { // Log first 10 rows and every 5th row after

    }

    const record = {
        excelRowNumber: rowIndex + 1,
        isValid: true,
        errors: [],
        isContinuationRow: false,
        sourceFormat: 'TPP',
        recordType: 'INCOMING'
    };

    record.isOpeningBalance = false;

    // Bottle identity comes from sheet name (outer) or row text (inner fallback)
    // sheetBottleId is pre-resolved and passed in; use it directly
    record.bottleNameRaw = (sheetBottleId && sheetBottleId !== 'MISSING') ? sheetBottleId : (sheetName || bottleNameText || 'MISSING');

    if (!sheetBottleId || sheetBottleId === 'MISSING') {
        record.errors.push(`Sheet "${sheetName}": bottle not found in master`);
    }

    // CRITICAL: PO fields (poDate, poNo, poOrderQty) are NOT supported in DEFAULT/TPP format
    // They are only for SHRENO imports. Set them explicitly to null.
    record.poDate = null;
    record.poNo = null;
    record.poOrderQty = null;

    // Validate SR.NO (serial number) - only error if provided and not a number
    if (srNo && isNaN(parseInt(srNo))) {
        record.errors.push("INVALID SR.NO");
    }

    // Check if this is an "OLD STOCK" opening balance row (special marker in bottle column)
    const isOldStock = bottleNameText.toUpperCase() === 'OLD STOCK';

    if (isOldStock) {
        // OLD STOCK rows: no date/challan required
        record.isOpeningBalance = true;
        record.incomingDate = null;
        record.challanNo = 'OLD STOCK';
        record.noOfBox = 0;
        record.qty = 0;
        record.totalQty = !isNaN(parseFloat(totalQty)) ? parseFloat(totalQty) : 0;
    } else {
        // Normal challan-based incoming row
        // Note: bottleNameText in column D is descriptive only, not used for matching
        record.incomingDate = parseDate(date);
        record.challanNo = challanNo || null;
        record.noOfBox = !isNaN(parseFloat(box)) ? parseFloat(box) : 0;
        record.qty = !isNaN(parseFloat(qty)) ? parseFloat(qty) : 0;
        record.totalQty = !isNaN(parseFloat(totalQty)) ? parseFloat(totalQty) : (record.noOfBox * record.qty);

        // Validation checks for incoming date: optional, only error if provided but invalid
        if (date !== null && date !== undefined && String(date).trim() !== '' && (!record.incomingDate || isNaN(record.incomingDate.getTime()))) {
            record.errors.push("INVALID DATE");
        }

        // Validation checks for quantities: optional, only error if provided and not a valid number
        const boxRaw = rowData[4];
        const qtyRaw = rowData[5];
        const totalQtyRaw = rowData[6];

        if (boxRaw !== null && boxRaw !== undefined && String(boxRaw).trim() !== '' && isNaN(parseFloat(boxRaw))) {
            record.errors.push("INVALID BOX");
        }

        if (qtyRaw !== null && qtyRaw !== undefined && String(qtyRaw).trim() !== '' && isNaN(parseFloat(qtyRaw))) {
            record.errors.push("INVALID QTY");
        }

        if (totalQtyRaw !== null && totalQtyRaw !== undefined && String(totalQtyRaw).trim() !== '' && isNaN(parseFloat(totalQtyRaw))) {
            record.errors.push("INVALID TOTAL QTY");
        }
    }

    record.isValid = record.errors.length === 0;
    return record;
};

/**
 * Parse SHRENO format (cols A-J for Incoming)
 * 
 * CRITICAL: Bottle identity is resolved from SHEET NAME for ALL rows, not per-row lookup.
 * The description in column E is descriptive text within that bottle's sheet and is NOT
 * used for bottle identity resolution. This ensures consistent per-bottle-sheet processing.
 */
const parseShrenoIncoming = (rowData, rowIndex, allBottles, sheetName = null, sheetBottleId = null) => {
    // Columns: A(SR NO) B(PO DATE) C(PO NO) D(PO ORDER QTY) E(DESCRIPTION) F(DATE) G(CHALLAN NO) H(NO OF BOX) I(QTY) J(INCOMING QTY)
    const srNo = String(rowData[0] || '').trim();
    const poDate = rowData[1];
    const poNo = String(rowData[2] || '').trim();
    const poOrderQty = rowData[3];
    const description = String(rowData[4] || '').trim();
    const incomingDate = rowData[5];
    const challanNo = String(rowData[6] || '').trim();
    const noOfBox = rowData[7];
    const qty = rowData[8];
    const incomingQty = rowData[9];

    // DIAGNOSTIC LOGGING: Trace raw cell values for debugging combined sheet issues
    if (rowIndex < 10 || rowIndex % 5 === 0) { // Log first 10 rows and every 5th row after

    }

    const record = {
        excelRowNumber: rowIndex + 1,
        isValid: true,
        errors: [],
        isContinuationRow: false,
        sourceFormat: 'SHRENO',
        recordType: 'INCOMING'
    };

    // Check if this is an "OLD STOCK" opening balance row (special marker in description column)
    const isOldStock = description.toUpperCase() === 'OLD STOCK';
    record.isOpeningBalance = isOldStock;

    // Bottle identity comes from sheet name (outer) or row text (inner fallback)
    // sheetBottleId is pre-resolved and passed in; use it directly
    record.bottleNameRaw = (sheetBottleId && sheetBottleId !== 'MISSING') ? sheetBottleId : (sheetName || description || 'MISSING');

    if (!sheetBottleId || sheetBottleId === 'MISSING') {
        record.errors.push(`Sheet "${sheetName}": bottle not found in master`);
    }

    // Validate SR.NO (serial number) - only error if provided and not a number
    if (srNo && isNaN(parseInt(srNo))) {
        record.errors.push("INVALID SR.NO");
    }

    if (isOldStock) {
        // OLD STOCK rows: no date/challan required
        record.poDate = null;
        record.poNo = null;
        record.poOrderQty = null;
        record.incomingDate = null;
        record.challanNo = 'OLD STOCK';
        record.noOfBox = 0;
        record.qty = 0;
        record.totalQty = !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : 0;
    } else {
        // Normal challan-based incoming row
        // Note: description in column E is descriptive text for this record
        record.poDate = parseDate(poDate);
        record.poNo = poNo || null;
        record.poOrderQty = !isNaN(parseFloat(poOrderQty)) ? parseFloat(poOrderQty) : null;
        
        record.incomingDate = parseDate(incomingDate);
        record.challanNo = challanNo || null;
        record.noOfBox = !isNaN(parseFloat(noOfBox)) ? parseFloat(noOfBox) : 0;
        record.qty = !isNaN(parseFloat(qty)) ? parseFloat(qty) : 0;
        record.totalQty = !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : (record.noOfBox * record.qty);

        // Validation checks for PO fields: optional, only error if provided but invalid
        const poDatRaw = rowData[1];
        const poOrderQtyRaw = rowData[3];

        if (poDatRaw !== null && poDatRaw !== undefined && String(poDatRaw).trim() !== '' && (!record.poDate || isNaN(record.poDate.getTime()))) {
            record.errors.push("INVALID PO DATE");
        }

        if (poOrderQtyRaw !== null && poOrderQtyRaw !== undefined && String(poOrderQtyRaw).trim() !== '' && (isNaN(parseFloat(poOrderQtyRaw)) || parseFloat(poOrderQtyRaw) < 0)) {
            record.errors.push("INVALID PO QUANTITY");
        }

        // Validation checks for incoming date: optional, only error if provided but invalid
        const incomingDateRaw = rowData[5];
        if (incomingDateRaw !== null && incomingDateRaw !== undefined && String(incomingDateRaw).trim() !== '' && (!record.incomingDate || isNaN(record.incomingDate.getTime()))) {
            record.errors.push("INVALID DATE");
        }

        // Validation checks for quantities: optional, only error if provided and not a valid number
        const boxRaw = rowData[7];
        const qtyRaw = rowData[8];
        const incomingQtyRaw = rowData[9];

        if (boxRaw !== null && boxRaw !== undefined && String(boxRaw).trim() !== '' && isNaN(parseFloat(boxRaw))) {
            record.errors.push("INVALID BOX");
        }

        if (qtyRaw !== null && qtyRaw !== undefined && String(qtyRaw).trim() !== '' && isNaN(parseFloat(qtyRaw))) {
            record.errors.push("INVALID QTY");
        }

        if (incomingQtyRaw !== null && incomingQtyRaw !== undefined && String(incomingQtyRaw).trim() !== '' && isNaN(parseFloat(incomingQtyRaw))) {
            record.errors.push("INVALID INCOMING QTY");
        }
    }

    record.isValid = record.errors.length === 0;
    return record;
};

/**
 * Import Preview
 */
exports.importPreview = async (req, res) => {

    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

        const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
        const rawBottles = await BottlePerBox.find({ isDeleted: false }).lean();

        // Pre-detect format from all sheets to determine company
        let hasShrenoFormat = false;
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
            if (data && data[0]) {
                const row1 = data[0];
                const row1Text = row1.map(cell => String(cell || '').trim().toUpperCase()).join(' ');
                if (row1Text.includes('SHRENO')) {
                    hasShrenoFormat = true;
                    break;
                }
            }
        }

        // Resolve company
        let resolvedCompany;
        if (hasShrenoFormat) {
            // If SHRENO format detected, use SHRENO company
            const shrenoCompany = allCompanies.find(c => c.name === 'SHRENO');
            if (shrenoCompany) {
                resolvedCompany = shrenoCompany;
            } else {
                // Fallback if SHRENO company doesn't exist in database
                resolvedCompany = { _id: null, name: 'SHRENO' };
            }
        } else {
            // Use filename-based company resolution for DEFAULT format
            const companyResolution = resolveCompanyFromFilename(req.file.originalname, allCompanies);
            resolvedCompany = companyResolution.matched 
                ? allCompanies.find(c => String(c._id) === companyResolution.companyId) 
                : { _id: null, name: companyResolution.companyName };
        }

        // Override if user explicitly selected company
        if (req.body && req.body.companyId) {
            const c = allCompanies.find(c => String(c._id) === String(req.body.companyId));
            if (c) resolvedCompany = { _id: c._id, name: c.name };
        }

        const allBottles = await getCompanyFilteredBottles(resolvedCompany?._id, allCompanies, rawBottles);

        const allRecords = [];

        // Parse sheets
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });

            // CRITICAL: Detect format per-sheet from row 1 marker, NOT from filename
            // FORMAT DETECTION: Binary choice - SHRENO or DEFAULT
            // SHRENO requires specific column schema (PO DATE, PO NO, PO ORDER QTY, DESCRIPTION, etc.)
            // All other companies use the same generic/default schema
            let sheetFormat = 'DEFAULT'; // Default schema for all non-SHRENO companies
            if (data && data[0]) {
                const row1 = data[0];
                const row1Text = row1.map(cell => String(cell || '').trim().toUpperCase()).join(' ');
                
                // SHRENO is the only format with its own dedicated column schema
                if (row1Text.includes('SHRENO')) {
                    sheetFormat = 'SHRENO';

                } else {

                }
            }

            let incomingRecords = [];
            let headerRowIndex = -1;

            // Detect header row (same logic for both formats, they both have SR NO in column A)
            for (let i = 0; i < Math.min(5, data.length); i++) {
                const row = data[i];
                if (row && row[0]) {
                    const colA = String(row[0] || '').trim().toUpperCase();
                    if (colA.includes('SR') && (colA.includes('NO') || colA === 'SR.')) {
                        headerRowIndex = i;
                        break;
                    }
                }
            }

            // Fallback: if not found in first 5 rows, assume row 3 (index 2)
            if (headerRowIndex === -1) {
                headerRowIndex = 2;
            }

            if (headerRowIndex === -1) continue;

            // OUTER → INNER FALLBACK LOGIC
            // Step 1: Try to match the sheet name to a master bottle
            const sheetBottleMatch = matchBottleNameFromMaster(sheetName, allBottles);
            let sheetBottleId = sheetBottleMatch.bottleName;
            let sheetBottleResolutionMethod = 'OUTER';



            // Step 2: If outer (sheet name) didn't match, we need to try inner (row text) fallback
            // First, collect all rows and attempt inner matching for each
            let innerRowResults = []; // Track {rowIndex, rowBottleId, bottleNameText, isOldStock}
            let distinctBottlesFound = new Set(); // Track unique bottles found via inner matching
            
            if (sheetBottleId === 'MISSING') {
                // Outer failed - try to match rows individually to understand what bottles are in this sheet

                for (let i = headerRowIndex + 1; i < data.length; i++) {
                    const row = data[i];
                    
                    // Get row bottle text based on format
                    let bottleNameText = '';
                    let isOldStock = false;
                    
                    if (sheetFormat === 'SHRENO') {
                        // SHRENO format: column E (index 4) has description
                        bottleNameText = String(row[4] || '').trim();
                    } else {
                        // DEFAULT format: column D (index 3) has bottle name
                        bottleNameText = String(row[3] || '').trim();
                    }
                    
                    isOldStock = bottleNameText.toUpperCase() === 'OLD STOCK';
                    
                    // Skip skippable rows
                    if (isSkippableRow(row)) {

                        continue;
                    }
                    
                    // Try to match this row's bottle text
                    const innerMatch = matchBottleNameFromMaster(bottleNameText, allBottles);
                    const innerBottleId = innerMatch.bottleName;
                    
                    innerRowResults.push({
                        rowIndex: i,
                        rowBottleId: innerBottleId,
                        bottleNameText: bottleNameText,
                        isOldStock: isOldStock,
                        isSkippable: isSkippableRow(row)
                    });

                    
                    // Track distinct bottles found (excluding MISSING)
                    if (innerBottleId !== 'MISSING' && !isOldStock) {
                        distinctBottlesFound.add(innerBottleId);
                    }
                }
                
                // IMPORTANT: Determine sheet-level bottle once from inner results
                // If exactly one distinct bottle was found across all rows, use it for the entire sheet

                
                if (distinctBottlesFound.size === 1) {
                    sheetBottleId = Array.from(distinctBottlesFound)[0];
                    sheetBottleResolutionMethod = 'INNER_FALLBACK_SINGLE';


                } else if (distinctBottlesFound.size > 1) {
                    // Multiple distinct bottles found - this is ambiguous, leave as MISSING
                    // Rows with their own matching text will resolve to their text; others remain MISSING
                    sheetBottleResolutionMethod = 'INNER_AMBIGUOUS';

                } else {
                    // No bottles found in any row
                    sheetBottleResolutionMethod = 'INNER_NONE';

                }
            }

            // Parse data rows (starting after header)

            for (let i = headerRowIndex + 1; i < data.length; i++) {
                const row = data[i];
                
                // Log every row to track iteration
                const srNoVal = String(row[0] || '').trim();
                let bottleVal = '';
                if (sheetFormat === 'SHRENO') {
                    bottleVal = String(row[4] || '').trim();
                } else {
                    bottleVal = String(row[3] || '').trim();
                }
                

                
                // Skip blank padding rows and TOTAL rows
                if (isSkippableRow(row)) {

                    continue;
                }



                // **CRITICAL BOTTLE DETERMINATION PHASE:**
                // Step 1: If sheet has a pre-resolved bottle (from outer or inner matching), USE IT for all rows
                // Step 2: Otherwise, try per-row matching as fallback
                // This ensures once a sheet's bottle is known, ALL rows in that sheet inherit it
                
                let resolvedBottleId = sheetBottleId; // Start with sheet-level resolution
                let resolutionMethod = sheetBottleId !== 'MISSING' ? 'SHEET_LEVEL' : null;
                

                
                // If sheet-level bottle wasn't resolved, try per-row fallback logic
                if (sheetBottleId === 'MISSING') {
                    // Inner-loop fallback: use per-row and sheet-wide analysis
                    const rowResult = innerRowResults.find(r => r.rowIndex === i);
                    
                    if (rowResult && rowResult.rowBottleId !== 'MISSING') {
                        // Row's own bottle text matched
                        resolvedBottleId = rowResult.rowBottleId;
                        resolutionMethod = 'ROW_SELF';

                    } else if (distinctBottlesFound.size === 1) {
                        // Only one distinct bottle found across entire sheet - all rows inherit it
                        resolvedBottleId = Array.from(distinctBottlesFound)[0];
                        resolutionMethod = 'SHEET_FALLBACK_SINGLE';

                    } else if (distinctBottlesFound.size > 1) {
                        // Ambiguous - multiple bottles in sheet, can't pick one for rows with no text
                        resolvedBottleId = 'MISSING';
                        resolutionMethod = 'AMBIGUOUS';

                    } else {
                        // No bottles found anywhere - remain MISSING
                        resolvedBottleId = 'MISSING';
                        resolutionMethod = 'NO_BOTTLES';

                    }
                }

                let record;
                if (sheetFormat === 'SHRENO') {
                    // SHRENO-specific parser: 10-column schema with PO info
                    record = parseShrenoIncoming(row, i, allBottles, sheetName, resolvedBottleId);
                } else {
                    // DEFAULT parser: generic 7-column schema for all non-SHRENO companies
                    record = parseTppIncoming(row, i, allBottles, sheetName, resolvedBottleId);
                }

                // Add resolution method and format to record for debugging
                record.bottleResolutionMethod = resolutionMethod;
                record.sourceFormat = sheetFormat;
                
                record.companyId = resolvedCompany._id ? resolvedCompany._id.toString() : null;
                record.companyName = resolvedCompany.name;
                record.sheetName = sheetName;

                incomingRecords.push(record);

            }

            if (incomingRecords.length > 0) {

                
                // CHECK EXISTING PLANS: For each record, count how many matching records exist in database
                // This helps users see what duplicates already exist
                const bottleNameToId = new Map();
                for (const bottle of allBottles) {
                    bottleNameToId.set(bottle.bottleName, bottle._id);
                }

                let checkedCount = 0;
                let foundCount = 0;
                
                for (const record of incomingRecords) {
                    // Default: no existing plans
                    record.existingPlans = '-';

                    // Only check for valid records and non-OLD-STOCK records
                    if (!record.isValid || record.isOpeningBalance) {
                        record.existingPlans = '-';
                        continue;
                    }

                    // Get bottle ID - use bottle master to get bottleName for plan lookup
                    const bottleId = bottleNameToId.get(record.bottleNameRaw);
                    if (!bottleId) {
                        record.existingPlans = '-';
                        continue;
                    }

                    // Find the bottle name from master for plan lookup
                    const bottleMaster = allBottles.find(b => b._id?.toString() === bottleId?.toString());
                    const bottleNameForPlan = bottleMaster ? (bottleMaster.bottleName || bottleMaster.plainBottleName) : record.bottleNameRaw;

                    // Check for existing LACQUER PLANS on the same date - not duplicate incoming!
                    const planDate = record.incomingDate;
                    const planStartDate = new Date(planDate);
                    planStartDate.setHours(0, 0, 0, 0);
                    const planEndDate = new Date(planDate);
                    planEndDate.setHours(23, 59, 59, 999);

                    // Count LacquerPlan rows for this bottle on this date
                    const LacquerPlan = require('../models/LacquerPlan');
                    const lacquerPlans = await LacquerPlan.countDocuments({
                        companyId: new mongoose.Types.ObjectId(record.companyId),
                        bottleName: bottleNameForPlan,
                        planDate: {
                            $gte: planStartDate,
                            $lte: planEndDate
                        },
                        isDeleted: false
                    });

                    // If Lacquer plans exist, show count
                    if (lacquerPlans > 0) {
                        record.existingPlans = lacquerPlans.toString();
                        foundCount++;
                    } else {
                        record.existingPlans = '-';
                    }

                    checkedCount++;

                }
                


                const sheetSummary = {
                    sheetName,
                    incomingRecords,
                    totalRows: incomingRecords.length,
                    validRows: incomingRecords.filter(r => r.isValid).length,
                    invalidRows: incomingRecords.filter(r => !r.isValid).length,
                    existingPlansCount: incomingRecords.reduce((sum, r) => {
                        // Count records with existing plans (not "-")
                        // Only sum up numeric values (actual counts)
                        if (r.existingPlans && r.existingPlans !== '-') {
                            const count = parseInt(r.existingPlans);
                            if (!isNaN(count)) {

                                return sum + count;
                            }
                        }
                        return sum;
                    }, 0),
                    detectedFormat: sheetFormat,  // ADD: Format detected from row 1 marker
                    invalidReasons: {},
                    bottleMatchDetails: null,
                    bottleResolutionMethod: sheetBottleId !== 'MISSING' ? 'OUTER' : 'INNER_FALLBACK'
                };
                


                // If outer bottle matching failed, add suggestions from inner fallback
                if (sheetBottleId === 'MISSING') {
                    // Collect distinct bottles found in rows
                    const distinctBottles = {};
                    for (const record of incomingRecords) {
                        if (record.bottleNameRaw && record.bottleNameRaw !== 'MISSING') {
                            if (!distinctBottles[record.bottleNameRaw]) {
                                // Find the bottle in allBottles to get plainBottleName
                                const bottle = allBottles.find(b => b.bottleName === record.bottleNameRaw);
                                distinctBottles[record.bottleNameRaw] = bottle ? bottle.plainBottleName || bottle.bottleName : record.bottleNameRaw;
                            }
                        }
                    }
                    
                    const distinctBottlesList = Object.entries(distinctBottles).map(([bottleName, plainBottleName]) => ({
                        bottleName,
                        plainBottleName
                    }));
                    
                    if (distinctBottlesList.length > 0) {
                        sheetSummary.bottleMatchDetails = {
                            status: 'inner_fallback_used',
                            searchText: sheetName,
                            resolutionMethod: 'INNER_FALLBACK',
                            suggestion: `Sheet name "${sheetName}" did not match a master bottle. Using bottles detected in rows: ${distinctBottlesList.map(b => b.plainBottleName).join(', ')}`,
                            detectedBottles: distinctBottlesList
                        };
                    }
                } else if (sheetBottleMatch.suggestedBottles && sheetBottleMatch.suggestedBottles.length > 0 && sheetBottleId === 'MISSING') {
                    // Original fuzzy matching suggestions (for completeness)
                    sheetSummary.bottleMatchDetails = {
                        status: 'ambiguous_or_unmatched',
                        searchText: sheetName,
                        suggestion: sheetBottleMatch.suggestion,
                        suggestedBottles: sheetBottleMatch.suggestedBottles.map(c => ({
                            bottleName: c.bottleName,
                            plainBottleName: c.plainBottleName,
                            similarity: (c.similarity * 100).toFixed(1) + '%'
                        }))
                    };
                }

                // Build invalid reasons
                for (const record of incomingRecords) {
                    if (!record.isValid) {
                        for (const err of record.errors) {
                            sheetSummary.invalidReasons[err] = (sheetSummary.invalidReasons[err] || 0) + 1;
                        }
                    }
                }

                allRecords.push(sheetSummary);
            }
        }

        // Collect distinct detected formats across all sheets
        const detectedFormats = new Set();
        for (const sheet of allRecords) {
            if (sheet.detectedFormat) {
                detectedFormats.add(sheet.detectedFormat);
            }
        }
        const detectedFormatsList = Array.from(detectedFormats).sort();



        return res.status(200).json({
            success: true,
            data: {
                fileName: req.file.originalname,
                companyName: resolvedCompany.name,
                companyId: resolvedCompany._id ? resolvedCompany._id.toString() : null,
                detectedCompanies: detectedFormatsList.length > 0 ? detectedFormatsList : ['TPP'],  // Summary of detected formats
                totalRows: allRecords.reduce((acc, s) => acc + s.totalRows, 0),
                validRows: allRecords.reduce((acc, s) => acc + s.validRows, 0),
                invalidRows: allRecords.reduce((acc, s) => acc + s.invalidRows, 0),
                sheets: allRecords
            }
        });
    } catch (error) {
        console.error("[INCOMING IMPORT ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Import Commit - creates Incoming records and updates PlainBottleStock
 * Supports both SHRENO and DEFAULT format imports
 */
exports.commitImport = async (req, res) => {
    try {
        const { sheetsToImport } = req.body;

        if (!sheetsToImport || !Array.isArray(sheetsToImport)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }


        
        // CRITICAL: Log the incoming payload structure
        let totalRecordsInPayload = 0;
        let totalValidRecordsInPayload = 0;
        for (const sheet of sheetsToImport) {
            const sheetValid = sheet.incomingRecords ? sheet.incomingRecords.filter(r => r.isValid).length : 0;
            totalRecordsInPayload += sheet.incomingRecords ? sheet.incomingRecords.length : 0;
            totalValidRecordsInPayload += sheetValid;

        }


        let totalIncomingImported = 0;
        let totalBottlesUpdated = 0;
        let totalSkipped = 0;
        let plansCreated = 0;
        const skippedRecords = []; // Track skipped records with reasons

        for (const sheetData of sheetsToImport) {
            const { sheetName, incomingRecords } = sheetData;

            
            const validRecords = incomingRecords.filter(r => r.isValid);


            if (validRecords.length === 0) {

                continue;
            }

            // Resolve bottle IDs from names
            const bottleNameToId = new Map();
            const rawBottles = await BottlePerBox.find({ isDeleted: false }).lean();
            const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
            let commitCompanyId = req.body && req.body.companyId ? req.body.companyId : null;
            if (!commitCompanyId && validRecords.length > 0 && validRecords[0].companyId) {
                commitCompanyId = validRecords[0].companyId;
            }
            const allBottles = await getCompanyFilteredBottles(commitCompanyId, allCompanies, rawBottles);

            
            for (const record of validRecords) {
                if (!bottleNameToId.has(record.bottleNameRaw)) {
                    const bottle = allBottles.find(b => 
                        b.bottleName === record.bottleNameRaw ||
                        b.plainBottleName === record.bottleNameRaw ||
                        (Array.isArray(b.bottleNames) && b.bottleNames.includes(record.bottleNameRaw))
                    );
                    if (!bottle) {
                        console.warn(`[INCOMING IMPORT COMMIT] Bottle name "${record.bottleNameRaw}" not found in master. Available bottles:`, allBottles.map(b => b.bottleName));
                    }
                    bottleNameToId.set(record.bottleNameRaw, bottle ? bottle._id : null);
                }
            }

            // Create Incoming records with duplicate detection
            const incomingDocs = [];
            const docSourceRecordMap = []; // Map: docIndex -> sourceRecord
            const stockBulkOps = [];
            
            // CRITICAL FIX: Don't check for duplicates against rows we just inserted in the same batch!
            // First pass: collect all rows that should be inserted
            const rowsToInsert = [];
            
            for (const record of validRecords) {
                const bottleId = bottleNameToId.get(record.bottleNameRaw);
                if (!bottleId) {
                    console.warn(`[INCOMING IMPORT COMMIT] Row ${record.excelRowNumber}: Bottle "${record.bottleNameRaw}" ID not found`);
                    totalSkipped++;
                    skippedRecords.push({
                        excelRowNumber: record.excelRowNumber,
                        reason: `Bottle "${record.bottleNameRaw}" ID not found`
                    });
                    continue;
                }
                
                rowsToInsert.push({ record, bottleId });
            }
            

            
            // Second pass: check only against EXISTING database records (not against rows in this batch)
            for (const { record, bottleId } of rowsToInsert) {
                // For OLD STOCK (opening balance), don't set a date - it's historical stock without a specific incoming date
                const docDate = record.isOpeningBalance ? null : record.incomingDate;
                const itemQty = record.qty;
                

                
                // Query for exact duplicate - CRITICAL: Only check against existing DB records with isDeleted: false
                const duplicateQuery = {
                    billToId: new mongoose.Types.ObjectId(record.companyId),
                    documentDate: docDate,
                    deliveryNumber: record.challanNo || null,
                    'items.bottleId': bottleId,
                    'items.box': record.noOfBox,
                    'items.qty': itemQty,
                    'items.totalQty': record.totalQty,
                    isDeleted: false  // CRITICAL: Only non-deleted records count as existing
                };
                
                const existingDuplicate = await Incoming.findOne(duplicateQuery);

                if (existingDuplicate) {

                    totalSkipped++;
                    skippedRecords.push({
                        excelRowNumber: record.excelRowNumber,
                        reason: `Duplicate of existing entry (ID: ${existingDuplicate._id})`
                    });
                    continue;
                } else {

                }

                // For records without a date, use today's date as documentDate
                const effectiveDate = docDate || new Date();
                const incomingRecord = new Incoming({
                    date: effectiveDate,
                    documentDate: effectiveDate,
                    deliveryNumber: record.challanNo || null,
                    billToId: new mongoose.Types.ObjectId(record.companyId),
                    createdBy: req.user?._id || null,
                    items: [
                        {
                            bottleId,
                            box: Number(record.noOfBox) || 0,
                            qty: Number(itemQty) || 0,
                            totalQty: Number(record.totalQty) || 0
                        }
                    ]
                });

                // Only add PO fields for SHRENO format (where they come from the parser)
                // For DEFAULT format, PO fields are never populated, so they won't be added
                if (record.sourceFormat === 'SHRENO') {
                    if (record.poDate) incomingRecord.poDate = record.poDate;
                    if (record.poNo) incomingRecord.poNo = record.poNo;
                    if (record.poOrderQty) incomingRecord.poOrderQty = record.poOrderQty;
                }

                incomingDocs.push(incomingRecord);
                docSourceRecordMap.push(record); // ADD: Map the record to this doc

                // Add stock update operation
                stockBulkOps.push({
                    updateOne: {
                        filter: { bottleId },
                        update: {
                            $inc: { availableQuantity: record.totalQty }
                        },
                        upsert: true
                    }
                });
            }



            // Insert Incoming records
            if (incomingDocs.length > 0) {
                try {
                    for (let i = 0; i < incomingDocs.length; i++) {
                        const doc = incomingDocs[i];
                        const sourceRecord = docSourceRecordMap[i]; // Use the mapping
                        try {
                            const saved = await doc.save();

                            totalIncomingImported++;

                            // NEW: Create dispatch plans from this incoming record
                            // For each item in the incoming, create a LacquerPlan row
                            const LacquerPlan = require('../models/LacquerPlan');
                            for (const item of saved.items) {
                                try {
                                    // Find bottle name from BottlePerBox master
                                    const bottt = await BottlePerBox.findById(item.bottleId);
                                    if (!bottt) {
                                        console.warn(`[INCOMING IMPORT COMMIT] Row ${sourceRecord.excelRowNumber}: Bottle master not found for ID ${item.bottleId}`);
                                        continue;
                                    }

                                    const bottleNameForPlan = bottt.bottleName || bottt.plainBottleName;

                                    // Check if plan already exists for this bottle on this date
                                    const planDate = new Date(saved.documentDate);
                                    const planStartDate = new Date(planDate);
                                    planStartDate.setHours(0, 0, 0, 0);
                                    const planEndDate = new Date(planDate);
                                    planEndDate.setHours(23, 59, 59, 999);

                                    const existingPlan = await LacquerPlan.findOne({
                                        companyId: saved.billToId,
                                        bottleName: bottleNameForPlan,
                                        planDate: {
                                            $gte: planStartDate,
                                            $lte: planEndDate
                                        },
                                        isDeleted: false
                                    });

                                    if (existingPlan) {

                                        continue;
                                    }

                                    // Create new LacquerPlan from incoming
                                    const newPlan = new LacquerPlan({
                                        planDate: saved.documentDate,
                                        bottleName: bottleNameForPlan,
                                        companyId: saved.billToId,
                                        orderQty: item.totalQty || 0,
                                        coatingCompletedQty: 0,
                                        balanceToMake: item.totalQty || 0,
                                        status: true,
                                        remarks: `Created from incoming: ${saved.deliveryNumber || 'No challan'}`,
                                        plainStock: item.totalQty || 0,
                                        importGroupId: null,
                                        isEditedAfterImport: false
                                    });

                                    await newPlan.save();
                                    plansCreated++;

                                } catch (planErr) {
                                    console.error(`[INCOMING IMPORT COMMIT] Row ${sourceRecord.excelRowNumber}: Error creating plan: ${planErr.message}`);
                                }
                            }
                        } catch (docErr) {
                            console.error(`[INCOMING IMPORT COMMIT] FAILED to save Row ${sourceRecord.excelRowNumber}: ${docErr.message}`, docErr);
                            totalSkipped++;
                            skippedRecords.push({
                                excelRowNumber: sourceRecord.excelRowNumber,
                                reason: `Save error: ${docErr.message}`
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[INCOMING IMPORT COMMIT] Error in save loop: ${err.message}`, err);
                }
            }

            // Update stock
            if (stockBulkOps.length > 0) {
                try {
                    await PlainBottleStock.bulkWrite(stockBulkOps);
                    totalBottlesUpdated += stockBulkOps.length;

                } catch (err) {
                    console.warn(`[INCOMING IMPORT COMMIT] Error updating stock: ${err.message}`);
                }
            }
        }

        // Build response message with skip details
        let message = `Imported ${totalIncomingImported} of ${totalValidRecordsInPayload} valid incoming records`;
        if (totalSkipped > 0) {
            message += `, Skipped ${totalSkipped} duplicate(s)`;
        }
        if (plansCreated > 0) {
            message += `, Created ${plansCreated} dispatch plan(s)`;
        }




        return res.status(200).json({
            success: true,
            message: message,
            data: {
                incomingImported: totalIncomingImported,
                plansCreated: plansCreated,
                bottlesUpdated: totalBottlesUpdated,
                skipped: totalSkipped,
                validRowsReceived: totalValidRecordsInPayload,
                skippedRecords: totalSkipped > 0 ? skippedRecords : undefined
            }
        });
    } catch (error) {
        console.error("[INCOMING IMPORT COMMIT ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
