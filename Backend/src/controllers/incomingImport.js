const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const BottlePerBox = require('../models/BottlePerBox');
const PlainBottleStock = require('../models/PlainBottleStock');
const Incoming = require('../models/Incoming');
const Dispatch = require('../models/Dispatch');
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
        console.log(`[TPP PARSE DEBUG] Row ${rowIndex + 1} (Excel row ${rowIndex + 1}):`, {
            colA_srNo: { index: 0, raw: rowData[0], value: srNo },
            colB_date: { index: 1, raw: rowData[1], value: date },
            colC_challan: { index: 2, raw: rowData[2], value: challanNo },
            colD_description: { index: 3, raw: rowData[3], value: bottleNameText },
            colE_box: { index: 4, raw: rowData[4], value: box, parsed: !isNaN(parseFloat(box)) ? parseFloat(box) : 'NaN' },
            colF_qty: { index: 5, raw: rowData[5], value: qty, parsed: !isNaN(parseFloat(qty)) ? parseFloat(qty) : 'NaN' },
            colG_total: { index: 6, raw: rowData[6], value: totalQty, parsed: !isNaN(parseFloat(totalQty)) ? parseFloat(totalQty) : 'NaN' }
        });
    }

    const record = {
        excelRowNumber: rowIndex + 1,
        isValid: true,
        errors: [],
        isContinuationRow: false,
        sourceFormat: 'TPP',
        recordType: 'INCOMING'
    };

    // Check if this is an "OLD STOCK" opening balance row (special marker in bottle column)
    const isOldStock = bottleNameText.toUpperCase() === 'OLD STOCK';
    record.isOpeningBalance = isOldStock;

    // Bottle identity comes from sheet name (outer) or row text (inner fallback)
    // sheetBottleId is pre-resolved and passed in; use it directly
    record.bottleNameRaw = sheetBottleId;

    if (!sheetBottleId || sheetBottleId === 'MISSING') {
        record.errors.push(`Bottle name not found in master (sheet: "${sheetName}", row text: "${bottleNameText}")`);
    }

    if (isOldStock) {
        // OLD STOCK rows: no date/challan required
        record.incomingDate = null;
        record.challanNo = 'OLD STOCK';
        record.noOfBox = 0;
        record.qty = 0;
        record.totalQty = !isNaN(parseFloat(totalQty)) ? parseFloat(totalQty) : 0;

        if (record.totalQty <= 0) {
            record.errors.push("Opening balance quantity must be greater than 0");
        }
    } else {
        // Normal challan-based incoming row
        // Note: bottleNameText in column D is descriptive only, not used for matching
        record.incomingDate = parseDate(date);
        record.challanNo = challanNo || null;
        record.noOfBox = !isNaN(parseFloat(box)) ? parseFloat(box) : 0;
        record.qty = !isNaN(parseFloat(qty)) ? parseFloat(qty) : 0;
        record.totalQty = !isNaN(parseFloat(totalQty)) ? parseFloat(totalQty) : 0;

        if (!record.incomingDate) record.errors.push("Incoming date is missing");
        // RELAXED: Challan number is optional - removed this check: if (!record.challanNo) record.errors.push("Challan number is missing");
        // RELAXED: Quantity is now optional - rows with blank Box/Qty/Total are valid if they have bottle/challan/date info
        // Removed: if (record.totalQty <= 0) record.errors.push("Total quantity must be greater than 0");
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
        console.log(`[SHRENO PARSE DEBUG] Row ${rowIndex + 1} (Excel row ${rowIndex + 1}):`, {
            colA_srNo: { index: 0, raw: rowData[0], value: srNo },
            colB_poDate: { index: 1, raw: rowData[1], value: poDate },
            colC_poNo: { index: 2, raw: rowData[2], value: poNo },
            colD_poOrderQty: { index: 3, raw: rowData[3], value: poOrderQty, parsed: !isNaN(parseFloat(poOrderQty)) ? parseFloat(poOrderQty) : 'NaN' },
            colE_description: { index: 4, raw: rowData[4], value: description },
            colF_incomingDate: { index: 5, raw: rowData[5], value: incomingDate },
            colG_challan: { index: 6, raw: rowData[6], value: challanNo },
            colH_noOfBox: { index: 7, raw: rowData[7], value: noOfBox, parsed: !isNaN(parseFloat(noOfBox)) ? parseFloat(noOfBox) : 'NaN' },
            colI_qty: { index: 8, raw: rowData[8], value: qty, parsed: !isNaN(parseFloat(qty)) ? parseFloat(qty) : 'NaN' },
            colJ_incomingQty: { index: 9, raw: rowData[9], value: incomingQty, parsed: !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : 'NaN' }
        });
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
    record.bottleNameRaw = sheetBottleId;

    if (!sheetBottleId || sheetBottleId === 'MISSING') {
        record.errors.push(`Bottle name not found in master (sheet: "${sheetName}", row text: "${description}")`);
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

        if (record.totalQty <= 0) {
            record.errors.push("Opening balance quantity must be greater than 0");
        }
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
        record.totalQty = !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : 0;

        // RELAXED: Date is now optional - do not block validity if date is missing
        // RELAXED: Challan number is optional - removed this check: if (!record.challanNo) record.errors.push("Challan number is missing");
        // RELAXED: Quantity is now optional - rows with blank Box/Qty/Total are valid if they have bottle/challan/date info
        // Removed: if (!record.incomingDate) record.errors.push("Incoming date is missing");
        // Removed: if (record.totalQty <= 0) record.errors.push("Total quantity must be greater than 0");
    }

    record.isValid = record.errors.length === 0;
    return record;
};

/**
 * Import Preview
 */
exports.importPreview = async (req, res) => {
    console.log('[INCOMING IMPORTER] importPreview called - incomingImport.js');
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

        const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
        const allBottles = await BottlePerBox.find({ isDeleted: false }).lean();

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
            const c = allCompanies.find(c => String(c._id) === req.body.companyId);
            if (c) resolvedCompany = { _id: c._id, name: c.name };
        }

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
                    console.log(`[FORMAT DETECTION] Sheet "${sheetName}": Row 1 contains "SHRENO" marker → Using SHRENO schema (10 columns)`);
                } else {
                    console.log(`[FORMAT DETECTION] Sheet "${sheetName}": No SHRENO marker detected → Using default schema (7 columns) for company "${resolvedCompany.name}"`);
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

            console.log(`[SHEET BOTTLE RESOLUTION - START] Sheet: "${sheetName}", Outer match result: ${sheetBottleId}`);

            // Step 2: If outer (sheet name) didn't match, we need to try inner (row text) fallback
            // First, collect all rows and attempt inner matching for each
            let innerRowResults = []; // Track {rowIndex, rowBottleId, bottleNameText, isOldStock}
            let distinctBottlesFound = new Set(); // Track unique bottles found via inner matching
            
            if (sheetBottleId === 'MISSING') {
                // Outer failed - try to match rows individually to understand what bottles are in this sheet
                console.log(`[INNER LOOP START] Sheet "${sheetName}": Starting to scan rows for inner bottle matching`);
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
                        console.log(`  [INNER LOOP] Row ${i}: SKIPPED (isSkippableRow=true)`);
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
                    console.log(`  [INNER LOOP] Row ${i}: Added to innerRowResults with bottleText="${bottleNameText}", matched bottleId="${innerBottleId}"`);
                    
                    // Track distinct bottles found (excluding MISSING)
                    if (innerBottleId !== 'MISSING' && !isOldStock) {
                        distinctBottlesFound.add(innerBottleId);
                    }
                }
                
                // IMPORTANT: Determine sheet-level bottle once from inner results
                // If exactly one distinct bottle was found across all rows, use it for the entire sheet
                console.log(`[SHEET BOTTLE RESOLUTION - INNER PHASE COMPLETE] Sheet: "${sheetName}", distinctBottlesFound size: ${distinctBottlesFound.size}, contents: ${Array.from(distinctBottlesFound).join(', ')}`);
                
                if (distinctBottlesFound.size === 1) {
                    sheetBottleId = Array.from(distinctBottlesFound)[0];
                    sheetBottleResolutionMethod = 'INNER_FALLBACK_SINGLE';
                    console.log(`[SHEET BOTTLE RESOLUTION - FINAL] Sheet "${sheetName}": INNER_FALLBACK_SINGLE set sheetBottleId to: ${sheetBottleId}`);
                    console.log(`[SHEET BOTTLE RESOLUTION] Sheet "${sheetName}": Using single detected bottle for all rows: ${sheetBottleId}`);
                } else if (distinctBottlesFound.size > 1) {
                    // Multiple distinct bottles found - this is ambiguous, leave as MISSING
                    // Rows with their own matching text will resolve to their text; others remain MISSING
                    sheetBottleResolutionMethod = 'INNER_AMBIGUOUS';
                    console.log(`[SHEET BOTTLE RESOLUTION] Sheet "${sheetName}": Found ${distinctBottlesFound.size} different bottles; rows will be evaluated individually`);
                } else {
                    // No bottles found in any row
                    sheetBottleResolutionMethod = 'INNER_NONE';
                    console.log(`[SHEET BOTTLE RESOLUTION] Sheet "${sheetName}": No bottles found in any row`);
                }
            }

            // Parse data rows (starting after header)
            console.log(`[ROW LOOP START] Sheet: "${sheetName}", About to process ${data.length - (headerRowIndex + 1)} rows, sheetBottleId is currently: ${sheetBottleId}`);
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
                
                console.log(`[ROW ITERATION] Sheet: "${sheetName}", Format: ${sheetFormat}, Row index: ${i}, SR.NO: "${srNoVal}", Bottle Text: "${bottleVal}"`);
                
                // Skip blank padding rows and TOTAL rows
                if (isSkippableRow(row)) {
                    console.log(`  → SKIPPED (isSkippableRow returned true)`);
                    continue;
                }

                console.log(`  → PROCESSING as data row`);

                // **CRITICAL BOTTLE DETERMINATION PHASE:**
                // Step 1: If sheet has a pre-resolved bottle (from outer or inner matching), USE IT for all rows
                // Step 2: Otherwise, try per-row matching as fallback
                // This ensures once a sheet's bottle is known, ALL rows in that sheet inherit it
                
                let resolvedBottleId = sheetBottleId; // Start with sheet-level resolution
                let resolutionMethod = sheetBottleId !== 'MISSING' ? 'SHEET_LEVEL' : null;
                
                console.log(`  → [BOTTLE DETERMINATION] Initial: sheetBottleId="${sheetBottleId}", will use resolutionMethod="${resolutionMethod || 'per-row fallback'}"`);
                
                // If sheet-level bottle wasn't resolved, try per-row fallback logic
                if (sheetBottleId === 'MISSING') {
                    // Inner-loop fallback: use per-row and sheet-wide analysis
                    const rowResult = innerRowResults.find(r => r.rowIndex === i);
                    
                    if (rowResult && rowResult.rowBottleId !== 'MISSING') {
                        // Row's own bottle text matched
                        resolvedBottleId = rowResult.rowBottleId;
                        resolutionMethod = 'ROW_SELF';
                        console.log(`  → [BOTTLE FALLBACK] ROW_SELF: Row's bottle text "${rowResult.bottleNameText}" matched to ${resolvedBottleId}`);
                    } else if (distinctBottlesFound.size === 1) {
                        // Only one distinct bottle found across entire sheet - all rows inherit it
                        resolvedBottleId = Array.from(distinctBottlesFound)[0];
                        resolutionMethod = 'SHEET_FALLBACK_SINGLE';
                        console.log(`  → [BOTTLE FALLBACK] SHEET_FALLBACK_SINGLE: Using the one bottle found in sheet: ${resolvedBottleId}`);
                    } else if (distinctBottlesFound.size > 1) {
                        // Ambiguous - multiple bottles in sheet, can't pick one for rows with no text
                        resolvedBottleId = 'MISSING';
                        resolutionMethod = 'AMBIGUOUS';
                        console.log(`  → [BOTTLE FALLBACK] AMBIGUOUS: Sheet has ${distinctBottlesFound.size} different bottles, can't resolve this row`);
                    } else {
                        // No bottles found anywhere - remain MISSING
                        resolvedBottleId = 'MISSING';
                        resolutionMethod = 'NO_BOTTLES';
                        console.log(`  → [BOTTLE FALLBACK] NO_BOTTLES: No bottles found anywhere in sheet`);
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
                console.log(`  → ADDED to incomingRecords (total: ${incomingRecords.length}), Resolution: ${resolutionMethod}, Format: ${sheetFormat}`);
            }

            if (incomingRecords.length > 0) {
                const sheetSummary = {
                    sheetName,
                    incomingRecords,
                    totalRows: incomingRecords.length,
                    validRows: incomingRecords.filter(r => r.isValid).length,
                    invalidRows: incomingRecords.filter(r => !r.isValid).length,
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
 * Only allows SHRENO format imports (rejects DEFAULT/TPP)
 */
exports.commitImport = async (req, res) => {
    try {
        const { sheetsToImport } = req.body;

        if (!sheetsToImport || !Array.isArray(sheetsToImport)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        // Validate: Only SHRENO format imports are allowed
        for (const sheetData of sheetsToImport) {
            const { incomingRecords } = sheetData;
            const validRecords = incomingRecords.filter(r => r.isValid);
            
            if (validRecords.length > 0) {
                const hasNonShreno = validRecords.some(r => r.sourceFormat !== 'SHRENO');
                if (hasNonShreno) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Only SHRENO format imports are supported. Please use a SHRENO-formatted file.' 
                    });
                }
            }
        }

        let totalIncomingImported = 0;
        let totalBottlesUpdated = 0;

        for (const sheetData of sheetsToImport) {
            const { sheetName, incomingRecords } = sheetData;
            const validRecords = incomingRecords.filter(r => r.isValid);

            if (validRecords.length === 0) continue;

            // Resolve bottle IDs from names
            const bottleNameToId = new Map();
            const allBottles = await BottlePerBox.find({ isDeleted: false }).lean();
            
            for (const record of validRecords) {
                if (!bottleNameToId.has(record.bottleNameRaw)) {
                    const bottle = allBottles.find(b => b.bottleName === record.bottleNameRaw);
                    bottleNameToId.set(record.bottleNameRaw, bottle ? bottle._id : null);
                }
            }

            // Create Incoming records
            const incomingDocs = [];
            const stockBulkOps = [];

            for (const record of validRecords) {
                const bottleId = bottleNameToId.get(record.bottleNameRaw);
                if (!bottleId) {
                    console.warn(`[INCOMING IMPORT] Bottle "${record.bottleNameRaw}" ID not found`);
                    continue;
                }

                // For OLD STOCK records, use today's date as documentDate since no actual date is provided
                const docDate = record.isOpeningBalance ? new Date() : record.incomingDate;

                // For OLD STOCK records, qty may be 0 (unknown), so set to 1 for validation
                const itemQty = record.isOpeningBalance ? Math.max(1, record.qty) : record.qty;
                
                const incomingRecord = new Incoming({
                    date: docDate,
                    documentDate: docDate,
                    deliveryNumber: record.challanNo,
                    billToId: new mongoose.Types.ObjectId(record.companyId),
                    createdBy: req.user._id, // From auth middleware
                    items: [
                        {
                            bottleId,
                            box: record.noOfBox,
                            qty: itemQty,
                            totalQty: record.totalQty
                        }
                    ]
                });

                if (record.poDate) incomingRecord.poDate = record.poDate;
                if (record.poNo) incomingRecord.poNo = record.poNo;
                if (record.poOrderQty) incomingRecord.poOrderQty = record.poOrderQty;

                incomingDocs.push(incomingRecord);

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
                    for (const doc of incomingDocs) {
                        await doc.save();
                        totalIncomingImported++;
                    }
                } catch (err) {
                    console.warn(`[INCOMING IMPORT] Error creating Incoming record: ${err.message}`);
                }
            }

            // Update stock
            if (stockBulkOps.length > 0) {
                try {
                    await PlainBottleStock.bulkWrite(stockBulkOps);
                    totalBottlesUpdated += stockBulkOps.length;
                } catch (err) {
                    console.warn(`[INCOMING IMPORT] Error updating stock: ${err.message}`);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Imported ${totalIncomingImported} incoming records`,
            data: {
                incomingImported: totalIncomingImported,
                bottlesUpdated: totalBottlesUpdated
            }
        });
    } catch (error) {
        console.error("[INCOMING IMPORT COMMIT ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
