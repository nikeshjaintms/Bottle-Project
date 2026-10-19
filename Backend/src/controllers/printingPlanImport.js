const xlsx = require('xlsx');
const mongoose = require('mongoose');
const { detectPrintingHeaders, buildColumnMap, normalizeGujarati, detectComponentHeaders, GUJARATI_PRINTING_HEADER_MAP } = require('../utils/printingPlanHeaderMapping');
const PrintingPlan = require('../models/PrintingPlan');
const PrintingPlanComponent = require('../models/PrintingPlanComponent');
const Company = require('../models/Company');
const BottleSpec = require('../models/Bottlespecs');
const Brand = require('../models/Brand');
const BottlePerBox = require('../models/BottlePerBox');
const PrintingColor = require('../models/PrintingColor');
const Variant = require('../models/Variant');
const PlainBottleStock = require('../models/PlainBottleStock');
const { resolveBottleAndShade } = require('../utils/bottleShadeParser');
const { recomputePlainStock } = require('../utils/stockRecompute');

exports.importPreview = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

        const allRows = [];

        const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();

        // 1. Detect Company (File-level resolution from Filename)
        const resolveCompanyFromFilename = (filename, companyMasters) => {
            if (!filename) return { companyId: null, companyName: 'UNKNOWN', matched: false, source: 'filename' };
            const original = String(filename).toUpperCase();

            let clean = original.replace(/\.[A-Z0-9]+$/i, '');

            const genericWords = [
                'PRINTING', 'PLAN', 'SHEET', 'PLANT',
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
                // Match canonical name as a whole word if possible, or simple includes
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

        const companyResolution = resolveCompanyFromFilename(req.file.originalname, allCompanies);
        let resolvedCompany = companyResolution.matched ? allCompanies.find(c => String(c._id) === companyResolution.companyId) : { _id: null, name: companyResolution.companyName };

        // Explicitly override with req.body.companyId if provided from the frontend modal
        if (req.body && req.body.companyId) {
            const c = allCompanies.find(c => String(c._id) === req.body.companyId);
            if (c) {
                resolvedCompany = { _id: c._id, name: c.name };
            }
        }


        // 2. Fetch Bottle Master for dynamic bottle vs shade detection
        const allBottles = await BottlePerBox.find({ isDeleted: false }).lean();
        const allPlainStocks = await PlainBottleStock.find({}).lean();
        const masterBottlePerBoxNameMap = new Map();
        const masterBottlePerBoxMap = new Map();
        const masterPlainStockMap = new Map();
        const normalizeBottle = (str) => {
            if (!str) return '';
            return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
        };
        allBottles.forEach(b => {
            const namesToMap = (b.bottleNames && b.bottleNames.length > 0)
                ? b.bottleNames
                : [b.bottleName, b.plainBottleName].filter(Boolean);

            const stock = allPlainStocks.find(s => String(s.bottleId) === String(b._id));

            namesToMap.forEach(name => {
                if (name) {
                    const normalized = normalizeBottle(name);
                    masterBottlePerBoxNameMap.set(normalized, name);
                    masterBottlePerBoxMap.set(normalized, b.bottlePerBox);
                    if (stock) {
                        masterPlainStockMap.set(normalized, stock.availableQuantity || 0);
                    }
                }
            });
        });
        // 3. Fetch PrintingColor Master, Variant Master and BottleSpec early for accurate shade matching
        const allColors = await PrintingColor.find({}).lean();
        const allVariants = await Variant.find({ isDeleted: { $ne: true } }).select('variantName coatingShade').lean();
        const allBottleSpecs = await BottleSpec.find({ isDeleted: false }).populate('brandId', 'name').lean();

        const masterShadesSet = new Set(
            allVariants
                .map(v => (v.coatingShade || '').trim().toUpperCase())
                .filter(Boolean)
        );
        const { BOTTLE_CODE_REGEX } = require('../utils/shrenoParser');

        const detectShrenoCoreColumns = (sheetData, startRow) => {
            if (startRow === -1 || !sheetData || !sheetData[startRow]) return null;

            let dataRows = [];
            for (let i = startRow; i < Math.min(startRow + 10, sheetData.length); i++) {
                const r = sheetData[i];
                if (!r || r.length === 0) continue;
                const colA = String(r[0] || '').trim();
                if (/^\s*\d+\s*\.?\s*$/.test(colA)) {
                    dataRows.push(r);
                }
            }

            if (dataRows.length < 2) return null; // Need at least a couple rows to score

            let stats = [];
            for (let colIdx = 0; colIdx < 10; colIdx++) { // Check first 10 columns
                let values = [];
                let totalStrLength = 0;
                let bottleCodeMatches = 0;
                let textValues = [];

                for (const row of dataRows) {
                    if (row[colIdx] === undefined || row[colIdx] === null) continue;
                    const valStr = String(row[colIdx]).trim();
                    if (valStr === '') continue;

                    values.push(valStr);
                    textValues.push(valStr.toUpperCase());
                    totalStrLength += valStr.length;

                    if (BOTTLE_CODE_REGEX.test(valStr)) {
                        bottleCodeMatches++;
                    }
                }

                const count = values.length || 1;
                const cardinality = new Set(textValues).size;

                stats.push({
                    colIdx,
                    valuesCount: values.length,
                    bottleScore: bottleCodeMatches / count,
                    avgLen: totalStrLength / count,
                    cardinalityRatio: values.length > 0 ? cardinality / values.length : 1
                });
            }

            // Product Column: highest bottle score (must be > 0.3 to be confident)
            let bottleCol = -1;
            let highestBottle = 0.3; // threshold
            for (const st of stats) {
                if (st.colIdx === 0 || st.valuesCount === 0) continue;
                if (st.bottleScore >= highestBottle) {
                    highestBottle = st.bottleScore;
                    bottleCol = st.colIdx;
                }
            }

            if (bottleCol === -1) return null; // Can't find anchor

            // Among remaining TEXT columns, find longest avg string for Printing, lowest cardinality for Color
            let remainingCols = stats.filter(st => st.colIdx !== 0 && st.colIdx !== bottleCol && st.valuesCount > 0);

            // Filter out obvious numeric columns
            remainingCols = remainingCols.filter(st => {
                let numCount = 0;
                for (const row of dataRows) {
                    const v = String(row[st.colIdx] || '').trim();
                    if (v !== '' && !isNaN(parseFloat(v))) numCount++;
                }
                return (numCount / st.valuesCount) < 0.5; // less than half are pure numbers
            });

            // Sort by avg len desc
            remainingCols.sort((a, b) => b.avgLen - a.avgLen);
            let printingCol = remainingCols.length > 0 ? remainingCols[0].colIdx : -1;

            // Remove printing col from remaining
            remainingCols = remainingCols.filter(st => st.colIdx !== printingCol);

            // Sort by cardinality ratio asc (lower cardinality ratio = more repeated values)
            remainingCols.sort((a, b) => a.cardinalityRatio - b.cardinalityRatio);
            let colorCol = remainingCols.length > 0 ? remainingCols[0].colIdx : -1;

            if (bottleCol !== -1 && printingCol !== -1 && colorCol !== -1) {
                return {
                    bottleCol,
                    printingCol,
                    colorCol
                };
            }

            return null;
        };

        const matchBottleNameFromMaster = (excelText) => {
            if (!excelText) return { bottleName: '*', shade: null, unmatched: true };
            const originalText = String(excelText).trim();
            const normalizedText = normalizeBottle(originalText);

            let longestPrefixMatch = null;
            let maxLength = -1;

            for (const [normMaster, masterName] of masterBottlePerBoxNameMap.entries()) {
                if (normalizedText.startsWith(normMaster)) {
                    let originalIndex = 0;
                    let normIndex = 0;
                    while (originalIndex < originalText.length && normIndex < normMaster.length) {
                        const char = originalText[originalIndex];
                        const upperChar = char.toUpperCase();
                        if ((upperChar >= 'A' && upperChar <= 'Z') || (upperChar >= '0' && upperChar <= '9')) {
                            normIndex++;
                        }
                        originalIndex++;
                    }

                    let trailingNonAlpha = 0;
                    for (let i = masterName.length - 1; i >= 0; i--) {
                        const c = masterName[i].toUpperCase();
                        if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) break;
                        trailingNonAlpha++;
                    }

                    let consumed = 0;
                    while (originalIndex < originalText.length && consumed < trailingNonAlpha) {
                        const c = originalText[originalIndex].toUpperCase();
                        if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) break;
                        originalIndex++;
                        consumed++;
                    }

                    let remainingText = originalText.substring(originalIndex).trim();
                    remainingText = remainingText.replace(/^[-+]\s*/, '').trim();

                    if (normMaster.length > maxLength) {
                        maxLength = normMaster.length;
                        longestPrefixMatch = { bottleName: masterName, shade: remainingText || null, unmatched: false };
                    }
                }
            }

            if (longestPrefixMatch) {
                return longestPrefixMatch;
            }

            return { bottleName: 'MISSING', shade: null, unmatched: true };
        };



        const extractVariantAndColor = (excelText) => {
            if (!excelText) return { variant: null, color: null };
            const textStr = String(excelText);
            if (!textStr.includes('-')) return { variant: textStr.trim(), color: null };

            const normColors = allColors.map(c => (c.name || c.colorName || '').toUpperCase().trim());
            const normVariants = allVariants.map(v => (v.variantName || '').toUpperCase().trim());

            let bestVariant = textStr.trim();
            let bestColor = null;

            // Color indicators
            const colorKeywords = ['ORGANIC', 'ORG', 'FOIL', 'COLOR', 'NEW ARTWORK', 'PASS', 'VARNIS', 'VARNISH', 'MATT', 'SHINE'];

            const parts = textStr.split('-');
            if (parts.length > 1) {
                for (let i = parts.length - 1; i >= 1; i--) {
                    const varPart = parts.slice(0, i).join('-').trim();
                    const colPart = parts.slice(i).join('-').trim();
                    const normVarPart = varPart.toUpperCase();
                    const normColPart = colPart.toUpperCase();

                    // Very strong split if variant matches master exactly
                    const hasVariantMatch = normVariants.some(v => v === normVarPart);

                    // Color match if colPart contains color keywords or matches color master
                    const hasColorMatch = normColors.some(c => c && (c === normColPart || normColPart.includes(c) || c.includes(normColPart))) ||
                        colorKeywords.some(kw => normColPart.includes(kw));

                    if (hasVariantMatch && hasColorMatch) {
                        bestVariant = varPart;
                        bestColor = colPart;
                        break; // Absolute best split found!
                    } else if (hasColorMatch && !bestColor) {
                        // Fallback to the first color match we find (starting from right side)
                        // For example, FINE LIKE WINE-NEW ARTWORK -> we check NEW ARTWORK first. It's a color! So we split here.
                        bestVariant = varPart;
                        bestColor = colPart;
                    } else if (hasVariantMatch && !bestColor) {
                        // Just a variant match, with whatever leftover on right side
                        bestVariant = varPart;
                        bestColor = colPart;
                    }
                }
            }

            return { variant: bestVariant, color: bestColor };
        };

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });

            let currentCompany = resolvedCompany;
            let firstShrenoDataRow = -1;

            if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                for (let r = 0; r < data.length; r++) {
                    const rowData = data[r];
                    if (!rowData || rowData.length === 0) continue;

                    const colA = String(rowData[0] || '').trim();
                    const colB = String(rowData[1] || '').trim();
                    const colC = String(rowData[2] || '').trim();
                    const colD = String(rowData[3] || '').trim();

                    const rowText = rowData.map(c => String(c || '').trim().toUpperCase()).join(' ');
                    if (!colA && !colB && !colC && !colD) continue;
                    if (/TOTAL|SUBTOTAL|GRAND TOTAL|SUMMARY|NET TOTAL/i.test(rowText)) continue;
                    if (colB.toUpperCase().includes('PRODUCT') || colB.toUpperCase().includes('પ્રોડક્ટ') || colA.toUpperCase() === 'SR' || colA.toUpperCase() === 'SR.') continue;

                    const m = matchBottleNameFromMaster(colB);
                    const hasMaster = m && !m.unmatched && m.bottleName !== '*' && m.bottleName !== 'MISSING';
                    const hasNumericSerial = /^\s*\d+\s*\.?\s*$/.test(colA);

                    if (hasMaster || (hasNumericSerial && colB.length > 2)) {
                        firstShrenoDataRow = r;
                        break;
                    }
                }
            }

            let colMap = null;
            let componentHeaders = [];
            let currentBottleName = null;
            let currentShade = null;
            let currentBrandName = null;
            let currentProcessVal = null;
            let currentPlainStock = null;
            let currentBoxQty = null;
            let shrenoGroupContext = { endRow: -1, bottleName: null, coatingShade: null };

            // Attempt to extract date from sheet name
            let parsedDate = null;
            const dateMatch = sheetName.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
            if (dateMatch) {
                let year = dateMatch[3];
                if (year.length === 2) year = '20' + year;
                parsedDate = new Date(`${year}-${dateMatch[2]}-${dateMatch[1]}`);
                if (isNaN(parsedDate.getTime())) parsedDate = null;
            }

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0 || row.every(c => c === null || String(c).trim() === '')) continue;

                const rowText = row.map(c => String(c || '').trim().toUpperCase()).join(' ');

                // Company detection from row is removed since it's resolved globally per file.

                // Try to extract a date from a date row if not found in sheet name
                if (!parsedDate && rowText.includes('202') && row.filter(c => c).length === 1) {
                    const possibleDate = new Date(row.find(c => c));
                    if (!isNaN(possibleDate.getTime())) {
                        parsedDate = possibleDate;
                        continue;
                    }
                }

                // Detect Headers
                const detectedHeaders = detectPrintingHeaders(row);

                // For SHRENO, the legacy headers might be completely broken or missing.
                // We MUST force the column mapping unconditionally based on exact array indices.
                if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                    if (!colMap) {
                        colMap = {};

                        // First, attempt to detect columns structurally
                        const coreCols = detectShrenoCoreColumns(data, firstShrenoDataRow);
                        let bCol = 1;
                        let pCol = 2;
                        let cCol = 3;

                        if (coreCols) {
                            bCol = coreCols.bottleCol;
                            pCol = coreCols.printingCol;
                            cCol = coreCols.colorCol;
                            console.log(`[SHRENO IMPORT] Core columns detected structurally: Bottle=${bCol}, Printing=${pCol}, Color=${cCol}`);
                        } else {
                            console.warn(`[SHRENO IMPORT WARNING] Structural scoring failed or was ambiguous for core text columns. Falling back to hardcoded offsets (Bottle=1, Printing=2, Color=3). The spreadsheet structure may have shifted. Please manually verify the imported text fields!`);
                        }

                        // Sanity check the structure before trusting these offsets for numeric columns
                        if (firstShrenoDataRow !== -1 && data[firstShrenoDataRow]) {
                            const firstDataRow = data[firstShrenoDataRow];

                            // Column E (bCol + 3) should be Plain Bottle Stock (numeric or empty)
                            // Column F (bCol + 4) should be Order Qty (numeric or empty)
                            const getVal = (idx) => firstDataRow[idx] !== undefined && firstDataRow[idx] !== null ? String(firstDataRow[idx]).trim() : '';
                            const isNum = (str) => str === '' || !isNaN(parseFloat(str));

                            if (!isNum(getVal(bCol + 3)) || !isNum(getVal(bCol + 4))) {
                                console.warn(`[SHRENO IMPORT WARNING] Structural mismatch detected at row ${firstShrenoDataRow + 1}. Expected numeric quantities at offsets +3 and +4 from product name, but found non-numeric data. The SHRENO spreadsheet structure may have shifted. Derived numeric columns may populate incorrectly!`);
                            }
                        }

                        colMap['bottleName'] = bCol;
                        colMap['printingToBeDone'] = pCol;
                        colMap['textColor'] = cCol;
                        colMap['plainBottleStock'] = bCol + 3;
                        colMap['orderQty'] = bCol + 4;
                        colMap['balanceToMake'] = bCol + 5;
                        colMap['boxQty'] = bCol + 6;
                        colMap['noOfBoxes'] = bCol + 7;
                        colMap['producedQty'] = bCol + 8;
                        colMap['dispatchBalance'] = bCol + 9;
                        colMap['soldQty'] = bCol + 10;
                        colMap['readyBoxes'] = bCol + 11;

                        // Dynamic Component Detection
                        const headerRowIndex = firstShrenoDataRow > 0 ? firstShrenoDataRow - 1 : 2; // Usually row 3 (index 2)
                        const headerRow = data[headerRowIndex];
                        let componentsStartIndex = bCol + 12;

                        if (headerRow) {
                            for (let c = componentsStartIndex; c < headerRow.length; c++) {
                                const val = String(headerRow[c] || '').trim();
                                if (!val) continue;

                                const upperVal = val.toUpperCase();

                                // Stop condition: Remark (marks end of components, we need its index)
                                if (upperVal === 'REMARK' || upperVal.includes('REMARK') || upperVal.includes('R)MI<K') || upperVal === 'NOTE') {
                                    colMap['remarks'] = c;
                                    break;
                                }

                                // General Check: If the column matches ANY known standard header (like a duplicate Ready Box),
                                // we skip it so it doesn't get rendered as a false component.
                                let isKnownStandardHeader = false;
                                const normalizedVal = normalizeGujarati(val);
                                for (const [gujaratiHeader, mapping] of Object.entries(GUJARATI_PRINTING_HEADER_MAP)) {
                                    if (normalizedVal === normalizeGujarati(gujaratiHeader) || normalizedVal.includes(normalizeGujarati(gujaratiHeader))) {
                                        isKnownStandardHeader = true;
                                        break;
                                    }
                                }
                                if (isKnownStandardHeader) {
                                    continue; // Exclude from component display
                                }

                                let baseCategory = 'UNKNOWN';
                                if (upperVal.includes('GP')) baseCategory = 'GP';
                                else if (upperVal.includes('BULK')) baseCategory = 'BULK';
                                else if (upperVal.includes('LID')) baseCategory = 'LID';
                                else if (upperVal.includes('CAP')) baseCategory = 'CAP';
                                else if (upperVal.includes('PUMP')) baseCategory = 'PUMP';
                                else if (upperVal.includes('INNER')) baseCategory = 'INNER';
                                else if (upperVal.includes('WAD')) baseCategory = 'WAD';
                                else if (upperVal.includes('COLLAR')) baseCategory = 'COLLAR';
                                else if (upperVal.includes('BOX')) baseCategory = 'BOX';

                                if (baseCategory === 'UNKNOWN') {
                                    console.warn(`[SHRENO IMPORT WARNING] Component header '${val}' does not match any known base category (GP/BULK/LID/CAP/etc). Extracting exactly as '${val}'.`);
                                }

                                componentHeaders.push({
                                    columnIndex: c,
                                    componentType: val, // Store the exact string
                                    baseCategory: baseCategory
                                });
                            }
                        }

                        if (colMap['remarks'] === undefined) {
                            colMap['remarks'] = componentsStartIndex; // fallback if remark not found dynamically
                        }
                    }

                    // We might still want to merge anything else found (e.g. srNo)
                    for (const [key, val] of Object.entries(buildColumnMap(detectedHeaders))) {
                        if (!(key in colMap)) {
                            colMap[key] = val;
                        }
                    }
                    delete colMap['coatingShade']; // NEVER read as a separate column for Shreno
                }
                else if (Object.keys(detectedHeaders).length >= 3) {
                    // Normal Printing Plan behavior
                    colMap = buildColumnMap(detectedHeaders);

                    console.log("[PRINTING HEADER MAP]", {
                        sheetName,
                        bottleColumnIndex: colMap['bottleName'],
                        brandColumnIndex: colMap['brand'],
                        printingColumnIndex: colMap['printingToBeDone'],
                        textColorColumnIndex: colMap['textColor'],
                        stockColumnIndex: colMap['plainBottleStock'],
                        orderQtyColumnIndex: colMap['orderQty']
                    });
                    continue;
                }

                // Parse Data Row
                if (colMap && Object.keys(colMap).length > 0) {

                    const classifyPrintingPlanRow = (rowData, rowIndex) => {
                        if (!rowData || rowData.length === 0) return 'EMPTY';

                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                            if (firstShrenoDataRow !== -1 && rowIndex < firstShrenoDataRow) {
                                const isTrulyEmpty = rowData.every(c => c === null || String(c).trim() === '');
                                if (isTrulyEmpty) return 'EMPTY';
                                return 'HEADER';
                            }
                        }

                        let isTotal = false;
                        for (let c of rowData) {
                            if (typeof c === 'string' && /TOTAL|SUBTOTAL|GRAND TOTAL|SUMMARY|NET TOTAL/i.test(c)) {
                                isTotal = true;
                                break;
                            }
                        }
                        if (isTotal) return 'TOTAL';

                        const v = (idx) => rowData[idx] !== undefined && rowData[idx] !== null ? String(rowData[idx]).trim() : '';

                        const hasText = !!v(colMap['printingToBeDone']) || !!v(colMap['brand']) || !!v(colMap['process']) || !!v(colMap['remarks']) || !!v(colMap['bottleName']) || !!v(colMap['coatingShade']) || !!v(colMap['textColor']);
                        const hasQty = !!v(colMap['orderQty']) || !!v(colMap['producedQty']) || !!v(colMap['plainBottleStock']) || !!v(colMap['dispatchBalance']) || !!v(colMap['soldQty']);

                        if (hasQty && !hasText) {
                            return 'TOTAL';
                        }

                        if (!hasText && !hasQty) {
                            // If even serial number isn't there, it's fully empty
                            return 'EMPTY';
                        }

                        return 'DATA';
                    };

                    const classification = classifyPrintingPlanRow(row, i);

                    if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO') && (classification === 'DATA' || classification === 'TOTAL' || classification === 'HEADER')) {
                        console.log('[SHRENO CLASSIFICATION]', {
                            excelRow: i + 1,
                            colA: row[0],
                            colB: row[1],
                            colC: row[2],
                            colD: row[3],
                            classification,
                            reason: classification === 'HEADER' ? 'Structural header skip' : 'Classified based on keywords and content presence'
                        });
                    }

                    if (classification !== 'DATA') {
                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                            console.log('[SHRENO CLASSIFICATION]', {
                                excelRow: i + 1,
                                classification: classification,
                                reason: classification === 'HEADER' ? 'Structural header row (before first data row)' : (classification === 'EMPTY' ? 'Row has no product, printing, type, or serial data' : 'Row classified as TOTAL/SUMMARY')
                            });
                        }
                        currentBottleName = null;
                        currentShade = null;
                        currentBrandName = null;
                        currentProcessVal = null;
                        currentPlainStock = null;
                        currentBoxQty = null;
                        continue;
                    }


                    // Extract values safely with merged-cell support
                    const getMergedValue = (propKey) => {
                        let colIndex = colMap[propKey];
                        if (colIndex === undefined || colIndex === null) return null;

                        if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
                            return row[colIndex];
                        }

                        if (sheet['!merges']) {
                            for (let merge of sheet['!merges']) {
                                if (colIndex >= merge.s.c && colIndex <= merge.e.c) {
                                    if (i >= merge.s.r && i <= merge.e.r) {
                                        if (data[merge.s.r] && data[merge.s.r][merge.s.c] !== undefined && data[merge.s.r][merge.s.c] !== null) {
                                            const val = String(data[merge.s.r][merge.s.c]).trim();
                                            return val !== '' ? val : null;
                                        }
                                    }
                                }
                            }
                        }
                        return null;
                    };

                    const getParentRowIndex = () => {
                        let parentIndex = i;
                        if (sheet['!merges']) {
                            for (let merge of sheet['!merges']) {
                                if (i >= merge.s.r && i <= merge.e.r) {
                                    const c = merge.s.c;
                                    if (c === colMap['printingToBeDone'] || c === colMap['boxQty'] || c === colMap['brand'] || c === colMap['bottleName']) {
                                        parentIndex = Math.min(parentIndex, merge.s.r);
                                    }
                                }
                            }
                        }
                        return parentIndex;
                    };
                    const extractCoatingAndSuffix = (text) => {
                        if (!text) return { shade: null, suffix: null };
                        let shade = String(text).trim();
                        const suffixRegex = /(?:-|\s)*\b(\d+\s*PC\s*GP)\b/i;
                        const match = shade.match(suffixRegex);
                        let suffix = null;
                        if (match) {
                            const rawSuffix = match[1].toUpperCase();
                            const numMatch = rawSuffix.match(/\d+/);
                            suffix = numMatch ? `${numMatch[0]}PC GP` : rawSuffix;
                            shade = shade.replace(suffixRegex, '').trim();
                        }
                        shade = shade.replace(/^-+|-+$/g, '').trim();
                        return { shade: shade || null, suffix };
                    };

                    if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                        console.log('[SHRENO RAW PRINTING]', {
                            row: i + 1,
                            product: row[colMap['bottleName']],
                            printingColumnIndex: colMap['printingToBeDone'],
                            rawPrinting: row[colMap['printingToBeDone']],
                            type: row[colMap['textColor']]
                        });
                    }

                    let cellBottleName = row[colMap['bottleName']];
                    let ownBottleValue = cellBottleName !== undefined && cellBottleName !== null ? String(cellBottleName).trim() : '';

                    let rowBottle = '*';
                    let rowShade = null;
                    let printingSuffix = null;
                    let textToParseForShade = ''; // defined here for broader scope

                    let parentRowIdx = getParentRowIndex();

                    let isTotalRow = false;
                    let isEmptyRow = false;
                    let rowClassType = 'DATA';

                    // 1. Detect Empty/Total BEFORE inheritance
                    const printingToBeDoneRaw = row[colMap['printingToBeDone']];
                    const rawBottleStr = ownBottleValue.toUpperCase();

                    if (!ownBottleValue && !printingToBeDoneRaw && !row[colMap['orderQty']]) {
                        rowClassType = 'EMPTY';
                        isEmptyRow = true;
                    } else if (rawBottleStr.includes('TOTAL') || rawBottleStr.includes('SUBTOTAL') || rawBottleStr.includes('SUMMARY') || (printingToBeDoneRaw && String(printingToBeDoneRaw).toUpperCase().includes('TOTAL'))) {
                        rowClassType = 'TOTAL';
                        isTotalRow = true;
                    }

                    if (currentCompany?.name?.toUpperCase().includes('SHRENO')) {
                        // Determine max merge end for this row
                        let maxMergeEnd = i;
                        if (sheet['!merges']) {
                            for (let merge of sheet['!merges']) {
                                if (i >= merge.s.r && i <= merge.e.r) {
                                    maxMergeEnd = Math.max(maxMergeEnd, merge.e.r);
                                }
                            }
                        }
                        if (isTotalRow || isEmptyRow) {
                            shrenoGroupContext.bottleName = null;
                            shrenoGroupContext.coatingShade = null;
                        }

                        if (isTotalRow || isEmptyRow) {
                            rowBottle = 'MISSING';
                            rowShade = null;
                        } else {
                            // EXACT SHRENO BUSINESS RULES
                            const { parseProduct } = require('../utils/shrenoParser');
                            const parsed = parseProduct(ownBottleValue, shrenoGroupContext.bottleName);

                            rowBottle = parsed.bottleName;
                            if (parsed.bottleIsNew) {
                                shrenoGroupContext.bottleName = rowBottle;
                                shrenoGroupContext.endRow = Math.max(shrenoGroupContext.endRow, maxMergeEnd);
                            }

                            rowShade = parsed.coatingShade || null;
                            printingSuffix = parsed.variant || null;
                        }
                    } else {
                        // TPP or others (NORMAL)
                        if (isTotalRow || isEmptyRow) {
                            rowBottle = 'MISSING';
                            rowShade = null;
                        } else {
                            let isContinuationRow = false;

                            const activeGroup = currentBottleName;
                            const activeShade = currentShade;

                            const activeBottleGroupBefore = currentBottleName;
                            const activeCoatingShadeBefore = currentShade;

                            // Even if ownBottleValue is empty (e.g. blank cell in the bottle column), we pass activeGroup to parser
                            // so that the parser can inherit it.
                            let parseVal = ownBottleValue || '';

                            const res = resolveBottleAndShade(parseVal, activeGroup, activeShade, matchBottleNameFromMaster);

                            rowBottle = res.bottleName;
                            rowShade = res.coatingShade;
                            if (res.printingSuffix && !printingSuffix) printingSuffix = res.printingSuffix;

                            if (res.resolutionMethod === 'INHERITED_GROUP') {
                                isContinuationRow = true;
                            }

                            // Explicit shade column always overrides and starts a new context
                            let explicitShadeCol = getMergedValue('coatingShade');
                            if (explicitShadeCol && String(explicitShadeCol).trim()) {
                                const extractedExplicit = extractCoatingAndSuffix(String(explicitShadeCol).trim());
                                rowShade = extractedExplicit.shade;
                                if (extractedExplicit.suffix) printingSuffix = extractedExplicit.suffix;
                                res.normalizedShade = rowShade;
                            }

                            // ONLY update context if we established a NEW group, or we explicitly found a new shade
                            if (res.resolutionMethod === 'MASTER_MATCH' || res.resolutionMethod === 'FALLBACK_PARSED') {
                                currentBottleName = rowBottle !== 'MISSING' ? rowBottle : null;
                                currentShade = rowShade;
                            } else if (isContinuationRow) {
                                // Keep currentBottleName
                                // Update shade context only if this row explicitly defined a new one
                                if (res.normalizedShade) {
                                    currentShade = rowShade;
                                }
                            } else {
                                // UNRESOLVED row, completely clear context
                                currentBottleName = null;
                                currentShade = null;
                            }

                            console.log("[PRINTING GROUP CONTEXT DEBUG]", {
                                excelRow: i + 1,
                                rawProduct: res.rawProduct,
                                rawPrinting: printingToBeDoneRaw || null,
                                activeBottleGroupBefore,
                                activeCoatingShadeBefore,
                                matchedBottleMaster: res.matchedBottleMaster === 'MISSING' ? null : res.matchedBottleMaster,
                                bottleResolution: res.resolutionMethod,
                                isContinuationRow: isContinuationRow,
                                bottleName: rowBottle,
                                coatingShade: rowShade,
                                activeBottleGroupAfter: currentBottleName,
                                activeCoatingShadeAfter: currentShade,
                                rowClassification: rowClassType
                            });
                        }
                    }

                    // A row is considered a data row if it has an order quantity or printing variant
                    const orderQtyRaw = getMergedValue('orderQty');
                    const variantRaw = getMergedValue('printingToBeDone');

                    if ((orderQtyRaw !== undefined && orderQtyRaw !== null) || (variantRaw && String(variantRaw).trim())) {

                        let rawBrand = getMergedValue('brand');
                        let brandName = rawBrand ? String(rawBrand).trim() : null;
                        // Validate Brand is not numeric
                        if (brandName && /^\d+(\.\d+)?$/.test(brandName)) {
                            brandName = null; // Reject numeric brand
                        }

                        // Resolve from BottleSpec if missing
                        if (!brandName && rowBottle !== '*') {
                            const spec = allBottleSpecs.find(s => normalizeBottle(s.bottleName) === normalizeBottle(rowBottle));
                            if (spec && spec.brandId) {
                                brandName = spec.brandId.name;
                            }
                        }

                        let coatingShade = rowShade;

                        let printingVariant = '';
                        let textCol = '';
                        const { buildPrintingToBeDone } = require('../utils/shrenoParser');

                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                            let basePrinting = getMergedValue('printingToBeDone');
                            let rawTextColor = getMergedValue('textColor');

                            printingVariant = buildPrintingToBeDone(basePrinting, printingSuffix);
                            textCol = rawTextColor ? String(rawTextColor).trim() : '';

                            let mBottle = matchBottleNameFromMaster(ownBottleValue);
                            console.log(`\n[SHRENO VERIFIED]\n\nRow:\n${ownBottleValue || ''}\n\nBottle:\n${rowBottle || ''}\n\nShade:\n${rowShade || ''}\n\nVariant:\n${printingSuffix || ''}\n\nPrinting:\n${printingVariant || ''}\n\nText Color:\n${textCol || ''}\n`);

                            // Also log the old format for tracing just in case
                            console.log("[SHRENO FINAL PARSED]", {
                                rawProduct: ownBottleValue,
                                rawPrinting: basePrinting || null,
                                rawTextColor: rawTextColor || null,

                                matchedBottleMaster: mBottle && mBottle.bottleName !== 'MISSING' && mBottle.bottleName !== '*' ? mBottle.bottleName : null,
                                activeBottleGroup: shrenoGroupContext.bottleName,

                                bottleName: rowBottle,
                                coatingShade: rowShade,

                                rawVariant: printingSuffix || '',
                                normalizedVariant: printingSuffix || '',

                                basePrintingToBeDone: basePrinting || null,
                                finalPrintingToBeDone: printingVariant || null,

                                textColor: textCol || null
                            });
                        } else {
                            const rawPrinting = getMergedValue('printingToBeDone');
                            const rawTextColor = getMergedValue('textColor');

                            let detectionMethod = 'EMPTY';

                            if (rawTextColor && String(rawTextColor).trim()) {
                                // Explicit text color column is present (either structural or header matched)
                                printingVariant = rawPrinting ? String(rawPrinting).trim() : '';
                                textCol = String(rawTextColor).trim();
                                detectionMethod = 'EXPLICIT_COLUMN';
                            } else if (rawPrinting) {
                                // No explicit text color column (or it's blank), try to extract from combined text
                                const parsedVariant = extractVariantAndColor(rawPrinting);
                                printingVariant = parsedVariant.variant || '';
                                textCol = parsedVariant.color || '';
                                detectionMethod = textCol ? 'COMBINED_TEXT_FALLBACK' : 'EMPTY';
                            }

                            console.log("[PRINTING TEXT COLOR]", {
                                excelRow: i + 1,
                                printingColumnIndex: colMap['printingToBeDone'],
                                textColorColumnIndex: colMap['textColor'],
                                rawPrinting: rawPrinting || null,
                                rawTextColor: rawTextColor || null,
                                normalizedPrinting: printingVariant,
                                normalizedTextColor: textCol,
                                detectionMethod
                            });
                        }

                        const getNum = (prop) => {
                            const val = getMergedValue(prop);
                            if (val === null || val === undefined || val === '') return null;
                            const num = parseFloat(val);
                            return isNaN(num) ? null : num;
                        };

                        let plainBottleStock = getNum('plainBottleStock');
                        let boxQty = getNum('boxQty');

                        // Fallback to Master exactly like Lacquer Plan
                        if (rowBottle) {
                            const bNorm = normalizeBottle(rowBottle);
                            if (masterBottlePerBoxMap.has(bNorm)) {
                                const mQty = masterBottlePerBoxMap.get(bNorm);
                                if (typeof mQty === 'number' && mQty > 0) {
                                    boxQty = mQty;
                                }
                            }
                        }

                        let stockSource = 'NONE';
                        if (plainBottleStock !== null && plainBottleStock !== undefined) {
                            const rawColIndex = colMap['plainBottleStock'];
                            if (rawColIndex !== undefined && row[rawColIndex] !== undefined && row[rawColIndex] !== null && String(row[rawColIndex]).trim() !== '') {
                                stockSource = 'EXPLICIT_CELL';
                            } else {
                                stockSource = 'MERGED_CELL';
                            }
                        }

                        const normalizedCoatingShade = coatingShade ? String(coatingShade).trim().toUpperCase() : '';
                        const isPlainCoating = normalizedCoatingShade === 'PLAIN';
                        const stockCellIsMerged = stockSource === 'MERGED_CELL';
                        const stockGroupAllowed = isPlainCoating && stockCellIsMerged;

                        console.log("[PRINTING STOCK GROUP DEBUG]", {
                            excelRow: i + 1,
                            bottleName: rowBottle,
                            coatingShade: coatingShade,
                            normalizedCoatingShade,
                            isPlainCoating,
                            rawStock: getMergedValue('plainBottleStock'),
                            normalizedStock: plainBottleStock,
                            stockCellIsMerged,
                            stockMergeRange: null, // Just placeholder
                            stockGroupAllowed,
                            stockGroupKey: stockGroupAllowed ? (currentBottleName || rowBottle) : null
                        });

                        let orderQty = getNum('orderQty');
                        let producedQty = getNum('producedQty');
                        let dispatchBalance = getNum('dispatchBalance');
                        let soldQty = getNum('soldQty');
                        let noOfBoxes = getNum('noOfBoxes');
                        let readyBoxes = getNum('readyBoxes');
                        let balanceToMake = getNum('balanceToMake');

                        const compNameStr = currentCompany ? currentCompany.name : 'Unknown';
                        let effectiveParentIdx = parentRowIdx;
                        if (currentCompany?.name?.toUpperCase().includes('SHRENO')) {
                            effectiveParentIdx = shrenoGroupContext.endRow;
                        }
                        const sourceGroupId = `${compNameStr}_${parsedDate.toISOString()}_${effectiveParentIdx}`;

                        const record = {
                            sourceGroupId,
                            excelRowNumber: i + 1,
                            company: compNameStr,
                            companyId: currentCompany ? currentCompany._id : null,
                            date: parsedDate,
                            bottleName: rowBottle,
                            printingToBeDone: printingVariant || '',
                            textColor: textCol || '',
                            brandName: brandName,
                            coatingShade: coatingShade,
                            plainBottleStock,
                            orderQty,
                            balanceToMake,
                            producedQty,
                            dispatchBalance,
                            soldQty,
                            boxQty,
                            noOfBoxes,
                            readyBoxes,
                            remarks: getMergedValue('remarks'),
                            components: [],
                            componentHeadersList: currentCompany && currentCompany.name.toUpperCase().includes('SHRENO') ? componentHeaders.map(c => c.componentType) : [],
                            isValid: true,
                            errors: []
                        };

                        // Extract Components if Shreno
                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO') && componentHeaders.length > 0) {
                            for (const ch of componentHeaders) {
                                const compVal = getMergedValue('comp_' + ch.columnIndex); // We can't use getMergedValue directly like this because it looks up in colMap.
                                // Custom component extraction
                                let rawVal = row[ch.columnIndex];
                                if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
                                    if (sheet['!merges']) {
                                        for (let merge of sheet['!merges']) {
                                            if (ch.columnIndex >= merge.s.c && ch.columnIndex <= merge.e.c) {
                                                if (i >= merge.s.r && i <= merge.e.r) {
                                                    if (data[merge.s.r] && data[merge.s.r][merge.s.c] !== undefined && data[merge.s.r][merge.s.c] !== null) {
                                                        rawVal = data[merge.s.r][merge.s.c];
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
                                    const numVal = parseFloat(rawVal);
                                    if (!isNaN(numVal)) {
                                        record.components.push({
                                            itemType: ch.componentType,
                                            componentType: ch.componentType,
                                            quantity: numVal
                                        });
                                    }
                                }
                            }
                        }

                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                            console.log("[SHRENO RECORD OUTPUT]", {
                                rowNumber: record.excelRowNumber,
                                bottleGroup: shrenoGroupContext.bottleName,
                                bottleName: record.bottleName,
                                rawPrinting: getMergedValue('printingToBeDone'),
                                rawVariant: printingSuffix,
                                normalizedVariant: printingSuffix,
                                coatingShade: record.coatingShade,
                                finalPrintingToBeDone: record.printingToBeDone,
                                databaseValue: record.printingToBeDone
                            });
                        }

                        if (!currentCompany) record.errors.push(`Company not identified from filename (${req.file.originalname}) or section heading.`);
                        if (!parsedDate) record.errors.push("Plan Date could not be identified.");
                        if (!rowBottle) record.errors.push("Bottle Name is missing.");

                        if (record.errors.length > 0) {
                            record.isValid = false;
                        }

                        if (currentCompany && currentCompany.name.toUpperCase().includes('SHRENO')) {
                            console.log("[SHRENO RECORD OUTPUT]", {
                                rowNumber: record.excelRowNumber,
                                bottleName: record.bottleName,
                                coatingShade: record.coatingShade,
                                printingToBeDone: record.printingToBeDone,
                                textColor: record.textColor,
                                components: record.components
                            });
                        }

                        allRows.push(record);
                    }
                }
            }
        }

        // Group by Date
        const dateMap = {};
        for (const r of allRows) {
            const dateStr = r.date ? r.date.toISOString().split('T')[0] : 'Unknown Date';
            if (!dateMap[dateStr]) {
                dateMap[dateStr] = {
                    date: dateStr,
                    totalRows: 0,
                    validRows: 0,
                    invalidRows: 0,
                    invalidReasons: {},
                    componentHeadersList: [],
                    rows: []
                };
            }

            if (dateMap[dateStr].componentHeadersList.length === 0 && r.componentHeadersList && r.componentHeadersList.length > 0) {
                dateMap[dateStr].componentHeadersList = r.componentHeadersList;
            }

            dateMap[dateStr].totalRows++;
            if (r.isValid) {
                dateMap[dateStr].validRows++;
            } else {
                dateMap[dateStr].invalidRows++;
                r.errors.forEach(err => {
                    dateMap[dateStr].invalidReasons[err] = (dateMap[dateStr].invalidReasons[err] || 0) + 1;
                });
            }
            dateMap[dateStr].rows.push(r);
        }

        const dates = Object.values(dateMap);
        dates.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Fetch existing counts for each date
        for (const d of dates) {
            if (d.date !== 'Unknown Date') {
                const start = new Date(d.date); start.setUTCHours(0, 0, 0, 0);
                const end = new Date(d.date); end.setUTCHours(23, 59, 59, 999);

                const companyIds = [...new Set(d.rows.map(r => r.companyId).filter(Boolean))];
                if (companyIds.length > 0) {
                    const companyBrands = await Brand.find({ companyId: { $in: companyIds } }).select('_id');
                    const brandIds = companyBrands.map(b => b._id);

                    d.existingCount = await PrintingPlan.countDocuments({
                        planDate: { $gte: start, $lte: end },
                        isDeleted: false,
                        $or: [
                            { companyId: { $in: companyIds } },
                            { brandId: { $in: brandIds } }
                        ]
                    });
                } else {
                    d.existingCount = 0;
                }
            } else {
                d.existingCount = 0;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                totalRows: allRows.length,
                validRows: allRows.filter(r => r.isValid).length,
                dates,
                companyName: companyResolution.companyName || 'UNASSIGNED'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.commitImport = async (req, res) => {
    try {
        const { datesToImport } = req.body;

        if (!datesToImport || !Array.isArray(datesToImport)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        let totalImported = 0;
        const importedResults = [];

        for (const item of datesToImport) {
            const { date, rows, replaceExisting } = item;

            if (date === 'Unknown Date') continue;

            const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);

            if (replaceExisting) {
                // Find the companies included in these rows
                const companyIds = [...new Set(rows.map(r => r.companyId).filter(Boolean))];
                if (companyIds.length > 0) {
                    const companyBrands = await Brand.find({ companyId: { $in: companyIds } }).select('_id');
                    const brandIds = companyBrands.map(b => b._id);

                    await PrintingPlan.updateMany(
                        {
                            planDate: { $gte: startOfDay, $lte: endOfDay },
                            isDeleted: false,
                            $or: [
                                { companyId: { $in: companyIds } },
                                { brandId: { $in: brandIds } }
                            ]
                        },
                        { $set: { isDeleted: true } }
                    );
                    await PrintingPlanComponent.updateMany(
                        { planDate: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false, companyId: { $in: companyIds } },
                        { $set: { isDeleted: true } }
                    );
                }
            }

            const validRows = rows.filter(r => r.isValid);

            // Pre-fetch brands
            const companyIds = [...new Set(validRows.map(r => r.companyId).filter(Boolean))];
            const allBrands = await Brand.find({ companyId: { $in: companyIds } });

            const newPlans = [];
            const newComponents = [];
            for (const p of validRows) {
                const planId = new mongoose.Types.ObjectId();
                const planToSave = new PrintingPlan({
                    _id: planId,
                    planDate: p.date,
                    sourceGroupId: p.sourceGroupId,
                    companyId: p.companyId,
                    bottleName: p.bottleName,
                    brandName: p.brandName,
                    printingToBeDone: p.printingToBeDone,
                    textColor: p.textColor,
                    coatingShade: p.coatingShade,
                    plainBottleStock: p.plainBottleStock,
                    orderQty: p.orderQty,
                    balanceToMake: p.balanceToMake,
                    producedQty: p.producedQty,
                    dispatchBalance: p.dispatchBalance,
                    soldQty: p.soldQty,
                    boxQty: p.boxQty,
                    noOfBoxes: p.noOfBoxes,
                    readyBoxes: p.readyBoxes,
                    remarks: p.remarks,
                    components: p.components || [],
                    componentHeadersList: p.componentHeadersList || [],
                    originalImportedValues: {
                      orderQty: p.orderQty,
                      producedQty: p.producedQty,
                      balanceToMake: p.balanceToMake,
                      boxQty: p.boxQty,
                      noOfBoxes: p.noOfBoxes,
                      dispatchBalance: p.dispatchBalance,
                      soldQty: p.soldQty,
                      readyBoxes: p.readyBoxes,
                      plainBottleStock: p.plainBottleStock,
                      remarks: p.remarks,
                      printingToBeDone: p.printingToBeDone,
                      textColor: p.textColor,
                      coatingShade: p.coatingShade
                    },
                    isEditedAfterImport: false
                });

                if (p.companyId) {
                    const brand = allBrands.find(b => b.name === p.brandName && b.companyId.toString() === p.companyId);
                    if (brand) planToSave.brandId = brand._id;
                }

                if (p.sourceGroupId && String(p.sourceGroupId).toUpperCase().includes('SHRENO')) {
                    console.log("[SHRENO DB PRINT VALUE]", {
                        bottleName: planToSave.bottleName,
                        coatingShade: planToSave.coatingShade,
                        printingToBeDone: planToSave.printingToBeDone
                    });
                }

                newPlans.push(planToSave);

                if (p.components && p.components.length > 0) {
                    for (const comp of p.components) {
                        newComponents.push(new PrintingPlanComponent({
                            printingPlanId: planId,
                            companyId: p.companyId,
                            planDate: p.date,
                            componentType: comp.componentType,
                            quantity: comp.quantity
                        }));
                    }
                }
            }

            if (newPlans.length > 0) {
                await PrintingPlan.insertMany(newPlans);
                if (newComponents.length > 0) {
                    await PrintingPlanComponent.insertMany(newComponents);
                }
                
                // Sync plain stock deduction for PLAIN shade rows
                for (const plan of newPlans) {
                  const isPlainShade = (plan.coatingShade || "").trim().toUpperCase() === "PLAIN";
                  if (isPlainShade && plan.bottleName && plan.companyId) {
                    await recomputePlainStock(plan.bottleName, plan.companyId, req.user?._id);
                  }
                }
                
                totalImported += newPlans.length;
                importedResults.push({ date, imported: newPlans.length, componentsImported: newComponents.length });
            } else {
                importedResults.push({ date, imported: 0 });
            }
        }

        return res.status(200).json({ success: true, message: `${totalImported} plans imported successfully`, data: { totalImported, importedResults } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
