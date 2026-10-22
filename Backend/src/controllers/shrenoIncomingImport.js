const xlsx = require('xlsx');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const BottlePerBox = require('../models/BottlePerBox');
const ItemType = require('../models/ItemType');
const ShrenoIncoming = require('../models/ShrenoIncoming');
const PackingMaterialStock = require('../models/PackingMaterialStock');

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
 * Normalize bottle names for matching
 */
const normalizeBottle = (str) => {
    if (!str) return '';
    return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

/**
 * Normalize bottle names for matching (removes only leading/trailing spaces + collapses multiple spaces)
 * Applies: trim, collapse spaces, uppercase
 */
const normalizeBottleForMatching = (str) => {
    if (!str) return '';
    // Trim, collapse multiple spaces, uppercase
    return String(str).toUpperCase().trim().replace(/\s+/g, ' ');
};

/**
 * Levenshtein distance - measures minimum edits (insertions, deletions, substitutions) needed
 */
const levenshteinDistance = (str1, str2) => {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array.from({ length: len2 + 1 }, () => Array(len1 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,      // Insertion
                matrix[j - 1][i] + 1,      // Deletion
                matrix[j - 1][i - 1] + cost // Substitution
            );
        }
    }
    
    return matrix[len2][len1];
};

/**
 * Calculate similarity score (0-1 scale)
 * 1.0 = identical, 0.0 = completely different
 */
const getSimilarityScore = (str1, str2) => {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
};

/**
 * Safe date parser - handles multiple date formats
 */
const parseDate = (value) => {
    if (!value) return null;
    
    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
        const excelEpoch = new Date(1900, 0, 1);
        const date = new Date(excelEpoch.getTime() + (value - 1) * 24 * 60 * 60 * 1000);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // If it's a string, try multiple formats
    if (typeof value === 'string') {
        const trimmed = String(value).trim();
        if (!trimmed) return null;
        
        // Try DD.MM.YY or DD.MM.YYYY format
        const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
        if (dotMatch) {
            let day = parseInt(dotMatch[1]);
            let month = parseInt(dotMatch[2]);
            let year = parseInt(dotMatch[3]);
            
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
 * Detect the company/format marker from row 1 (the literal header row with company name)
 * Looks for "SHRENO INCOMING", "SHRENO DISPATCH", etc. in row 1 cells
 * Returns { company, marker, markerColumn } or null if not found
 */
const detectCompanyMarkerFromRow1 = (data) => {
    if (!data || data.length === 0) return null;
    
    const row1 = data[0];
    if (!row1) return null;
    
    // Define company markers to look for (case-insensitive, whitespace-tolerant)
    const markers = {
        'SHRENO INCOMING': { company: 'SHRENO', type: 'INCOMING' },
        'SHRENO DISPATCH': { company: 'SHRENO', type: 'DISPATCH' },
        'PACKING MATERIAL': { company: 'SHRENO', type: 'PACKING' },
        'REJECTION DETAIL': { company: 'SHRENO', type: 'REJECTION' },
        'TPP': { company: 'TPP', type: 'TRADE' },
        'TRADE': { company: 'TPP', type: 'TRADE' },
    };
    
    // Scan row 1 cells for known markers
    for (let col = 0; col < row1.length; col++) {
        const cellText = String(row1[col] || '').trim().toUpperCase();
        
        if (!cellText) continue;
        
        // Exact match first
        for (const [markerText, markerInfo] of Object.entries(markers)) {
            if (cellText === markerText) {
                console.log(`[COMPANY_DETECTION] Row 1: Found marker "${markerText}" at column ${col}`);
                return {
                    company: markerInfo.company,
                    type: markerInfo.type,
                    marker: markerText,
                    markerColumn: col
                };
            }
        }
        
        // Partial match for common variations
        if (cellText.includes('SHRENO')) {
            const type = cellText.includes('INCOMING') ? 'INCOMING' : 
                        cellText.includes('DISPATCH') ? 'DISPATCH' :
                        cellText.includes('PACKING') ? 'PACKING' :
                        cellText.includes('REJECTION') ? 'REJECTION' : 'UNKNOWN';
            console.log(`[COMPANY_DETECTION] Row 1: Found SHRENO variant "${cellText}" at column ${col}, type=${type}`);
            return {
                company: 'SHRENO',
                type: type,
                marker: cellText,
                markerColumn: col
            };
        }
        
        if (cellText.includes('TPP') || (cellText.includes('TRADE') && cellText.length < 20)) {
            console.log(`[COMPANY_DETECTION] Row 1: Found TPP/TRADE marker "${cellText}" at column ${col}`);
            return {
                company: 'TPP',
                type: 'TRADE',
                marker: cellText,
                markerColumn: col
            };
        }
    }return null;
};

/**
 * Detect the column mapping from header row using dynamic header text matching
 * Supports both SHRENO (10 columns) and TPP (7 columns) formats
 * Returns: { columnMap, format, headerRowIndex } or null if headers not found
 * 
 * SHRENO Headers: SR NO, PO DATE, PO NO, PO ORDER QTY, DESCRIPTION, DATE, CHALLAN NO, NO OF BOX, QTY, INCOMING QTY
 * TPP Headers: sr.no, date, challan no, bottle name, box, qty, total
 */
const detectHeadersAndBuildColumnMap = (data, detectedCompany = null) => {
    const shrenoHeaderPatterns = {
        srNo: /SR\s*NO/i,
        poDate: /PO\s+DATE/i,
        poNo: /PO\s+NO/i,
        poOrderQty: /PO\s+ORDER\s+QTY/i,
        description: /DESCRIPTION/i,
        date: /^DATE$/i,  // Exact match to avoid matching PODATE or other compounds
        challanNo: /CHALLAN\s+NO/i,
        noOfBox: /NO\s+OF\s+BOX|^BOX$/i,
        qty: /^QTY$|^QTY\s+(PER|BOTTLE)?/i,  // Exact QTY, not part of other words
        incomingQty: /INCOMING\s+QTY|TOTAL\s+QTY/i
        // NOTE: itemType column does NOT exist in real SHRENO Incoming sheets
        // ItemType must be provided by user during manual data entry, not from Excel import
    };

    const tppHeaderPatterns = {
        srNo: /SR|S.?NO/i,
        date: /DATE/i,
        challanNo: /CHALLAN/i,
        description: /BOTTLE|DESCRIPTION/i,
        box: /BOX/i,
        qty: /QTY|QUANTITY/i,
        total: /TOTAL/i
    };

    // Try to find header row (look for SR NO / sr.no in first column)
    let headerRowIndex = -1;
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

    if (headerRowIndex === -1) return null;

    const headerRow = data[headerRowIndex];
    if (!headerRow) return null;

    // Normalize header texts for matching
    const normalizedHeaders = headerRow.map(h => 
        String(h || '').trim().toUpperCase()
    );

    // DEBUG: Log the normalized headers for verification
    console.log(`[HEADER_DETECTION] headerRowIndex=${headerRowIndex}, normalizedHeaders=${JSON.stringify(normalizedHeaders)}`);

    // Try SHRENO format first (has more distinct columns)
    const shrenoMap = {};
    let shrenoMatches = 0;
    
    for (const [key, pattern] of Object.entries(shrenoHeaderPatterns)) {
        for (let col = 0; col < normalizedHeaders.length; col++) {
            if (pattern.test(normalizedHeaders[col])) {
                shrenoMap[key] = col;
                shrenoMatches++;
                console.log(`[HEADER_DETECTION] SHRENO: Matched '${key}' to column ${col} (header="${normalizedHeaders[col]}")`);
                break;
            }
        }
    }

    // If detected company is SHRENO, use SHRENO format if minimum headers found
    if (detectedCompany === 'SHRENO' && shrenoMatches >= 7) {
        console.log(`[HEADER_DETECTION] COMPANY MARKER CONFIRMED SHRENO (${shrenoMatches}/10 headers matched)`);
        return {
            columnMap: shrenoMap,
            format: 'SHRENO',
            detectedCompany: 'SHRENO',
            headerRowIndex: headerRowIndex,
            headerRow: normalizedHeaders,
            trace: {
                shrenoMatches: shrenoMatches,
                mapping: shrenoMap,
                companyMarkerBased: true
            }
        };
    }

    // If we found most SHRENO headers (even without company marker), use SHRENO format
    if (shrenoMatches >= 7) {
        console.log(`[HEADER_DETECTION] DETECTED SHRENO FORMAT (${shrenoMatches}/10 headers matched)`);
        return {
            columnMap: shrenoMap,
            format: 'SHRENO',
            detectedCompany: 'SHRENO',
            headerRowIndex: headerRowIndex,
            headerRow: normalizedHeaders,
            trace: {
                shrenoMatches: shrenoMatches,
                mapping: shrenoMap,
                companyMarkerBased: false
            }
        };
    }

    // Try TPP format
    const tppMap = {};
    let tppMatches = 0;
    
    for (const [key, pattern] of Object.entries(tppHeaderPatterns)) {
        for (let col = 0; col < normalizedHeaders.length; col++) {
            if (pattern.test(normalizedHeaders[col])) {
                tppMap[key] = col;
                tppMatches++;
                console.log(`[HEADER_DETECTION] TPP: Matched '${key}' to column ${col} (header="${normalizedHeaders[col]}")`);
                break;
            }
        }
    }

    // If detected company is TPP, use TPP format if minimum headers found
    if (detectedCompany === 'TPP' && tppMatches >= 5) {
        console.log(`[HEADER_DETECTION] COMPANY MARKER CONFIRMED TPP (${tppMatches}/7 headers matched)`);
        return {
            columnMap: tppMap,
            format: 'TPP',
            detectedCompany: 'TPP',
            headerRowIndex: headerRowIndex,
            headerRow: normalizedHeaders,
            trace: {
                tppMatches: tppMatches,
                mapping: tppMap,
                companyMarkerBased: true
            }
        };
    }

    if (tppMatches >= 5) {
        console.log(`[HEADER_DETECTION] DETECTED TPP FORMAT (${tppMatches}/7 headers matched)`);
        return {
            columnMap: tppMap,
            format: 'TPP',
            detectedCompany: 'TPP',
            headerRowIndex: headerRowIndex,
            headerRow: normalizedHeaders,
            trace: {
                tppMatches: tppMatches,
                mapping: tppMap,
                companyMarkerBased: false
            }
        };
    }

    // Unknown format
    console.log(`[HEADER_DETECTION] UNKNOWN FORMAT (SHRENO=${shrenoMatches}, TPP=${tppMatches}, detectedCompany=${detectedCompany})`);
    return {
        columnMap: {},
        format: 'UNKNOWN',
        detectedCompany: detectedCompany || 'UNKNOWN',
        headerRowIndex: headerRowIndex,
        headerRow: normalizedHeaders,
        trace: {
            shrenoMatches: shrenoMatches,
            tppMatches: tppMatches,
            companyMarkerBased: !!detectedCompany
        }
    };
};

/**
 * Extract field value from row using column map
 * Returns null if column index not found or value is empty
 */
const getFieldValue = (row, colMap, fieldName) => {
    if (!colMap || !row) return null;
    const colIndex = colMap[fieldName];
    if (colIndex === undefined || colIndex === null) return null;
    const val = row[colIndex];
    return val !== undefined && val !== null && val !== '' ? val : null;
};

/**
 * Check if row is skippable (blank, padding, total row, etc.)
 */
const isSkippableRow = (rowData, columnMap = null) => {
    if (!rowData || rowData.length === 0) return true;
    
    // Check if SR NO is empty - this is the primary indicator of a data row
    if (columnMap && columnMap['srNo'] !== undefined) {
        const srNoVal = getFieldValue(rowData, columnMap, 'srNo');
        if (!srNoVal) return true;  // If SR NO is blank, skip this row
    } else {
        // Fallback: check first cell
        if (!rowData[0]) return true;
    }
    
    // At this point, we have a row with SR NO
    // But it might still be a TOTAL/summary row - check for that
    if (columnMap && columnMap['description'] !== undefined) {
        const desc = String(getFieldValue(rowData, columnMap, 'description') || '').trim().toUpperCase();
        if (desc.includes('TOTAL') || desc === 'TOTAL') return true;
    } else {
        const desc = String(rowData[4] || '').trim().toUpperCase();
        if (desc.includes('TOTAL') || desc === 'TOTAL') return true;
    }
    
    // Check if all critical quantity fields are blank (skip if they are)
    // If Box, Qty, and Total are all blank/zero/empty, this is a blank/padding row
    if (columnMap) {
        const noOfBox = getFieldValue(rowData, columnMap, 'noOfBox') || getFieldValue(rowData, columnMap, 'box');
        const qty = getFieldValue(rowData, columnMap, 'qty');
        const incomingQty = getFieldValue(rowData, columnMap, 'incomingQty') || getFieldValue(rowData, columnMap, 'total');
        
        // If all three are empty/blank, skip this row
        if (!noOfBox && !qty && !incomingQty) {
            return true;
        }
    } else {
        // Fallback for non-columnMap case
        if (!rowData[7] && !rowData[8] && !rowData[9]) {
            return true;
        }
    }
    
    // This is a valid data row (has SR NO, isn't a TOTAL row, and has at least some quantity data)
    return false;
};

/**
 * Match bottle name from master - enhanced with multi-stage fallback:
 * Stage 1: Exact match after normalization (trim + collapse spaces + case-insensitive)
 * Stage 2: Strict normalized exact match (alphanumeric only)
 * Stage 3: Partial/suffix matching - search string starts with same words as bottle name
 * Stage 4: Prefix/substring containment - one string contains the other as a prefix
 *          (handles cases like "PSR-810-640-FLORIDA (BIG BOY)" containing "PSR-810-640")
 * Stage 5: Fuzzy matching with suggestions
 * 
 * Returns: { bottleName, unmatched, suggestedBottles, suggestion }
 */
const matchBottleNameFromMaster = (excelText, allBottles) => {
    if (!excelText) return { bottleName: null, unmatched: true, suggestedBottles: [], suggestion: null };
    
    const searchText = String(excelText).trim();
    const normalizedSearch = normalizeBottleForMatching(searchText);
    const strictNormSearch = normalizeBottle(searchText);
    
    // Stage 1: Exact matches after normalization (trim + collapse spaces + case-insensitive)
    for (const bottle of allBottles) {
        const namesToCheck = (bottle.bottleNames && bottle.bottleNames.length > 0)
            ? bottle.bottleNames
            : [bottle.bottleName, bottle.plainBottleName].filter(Boolean);
        
        for (const name of namesToCheck) {
            const normalizedName = normalizeBottleForMatching(name);
            if (normalizedName === normalizedSearch) {
                return { 
                    bottleName: bottle.bottleName, 
                    unmatched: false, 
                    suggestedBottles: [], 
                    suggestion: null,
                    matchMethod: 'EXACT_NORMALIZED'
                };
            }
        }
    }
    
    // Stage 2: Strict normalized exact matches (alphanumeric only)
    for (const bottle of allBottles) {
        const namesToCheck = (bottle.bottleNames && bottle.bottleNames.length > 0)
            ? bottle.bottleNames
            : [bottle.bottleName, bottle.plainBottleName].filter(Boolean);
        
        for (const name of namesToCheck) {
            if (normalizeBottle(name) === strictNormSearch) {
                return { 
                    bottleName: bottle.bottleName, 
                    unmatched: false, 
                    suggestedBottles: [], 
                    suggestion: null,
                    matchMethod: 'STRICT_NORMALIZED'
                };
            }
        }
    }
    
    // Stage 3: Partial/suffix matching - Excel text is beginning of bottle name
    const searchWords = normalizedSearch.split(/\s+/).filter(Boolean);
    let bestMatch = null;
    let bestMatchLength = 0;
    
    for (const bottle of allBottles) {
        const namesToCheck = (bottle.bottleNames && bottle.bottleNames.length > 0)
            ? bottle.bottleNames
            : [bottle.bottleName, bottle.plainBottleName].filter(Boolean);
        
        for (const name of namesToCheck) {
            const normalizedName = normalizeBottleForMatching(name);
            const nameWords = normalizedName.split(/\s+/);
            
            let allWordsMatch = true;
            for (let i = 0; i < searchWords.length; i++) {
                if (i >= nameWords.length || nameWords[i] !== searchWords[i]) {
                    allWordsMatch = false;
                    break;
                }
            }
            
            if (allWordsMatch && normalizedName.length > bestMatchLength) {
                bestMatch = bottle.bottleName;
                bestMatchLength = normalizedName.length;
            }
        }
    }
    
    if (bestMatch) {
        return { 
            bottleName: bestMatch, 
            unmatched: false, 
            suggestedBottles: [], 
            suggestion: null,
            matchMethod: 'PARTIAL_PREFIX_WORDS'
        };
    }
    
    // Stage 4: Prefix/substring containment - handle cases where sheet name contains description as prefix
    // Example: sheet="PSR-810-640-FLORIDA (BIG BOY)" contains description="PSR-810-640"
    // or vice versa
    let prefixMatches = [];
    for (const bottle of allBottles) {
        const namesToCheck = (bottle.bottleNames && bottle.bottleNames.length > 0)
            ? bottle.bottleNames
            : [bottle.bottleName, bottle.plainBottleName].filter(Boolean);
        
        for (const name of namesToCheck) {
            const normalizedName = normalizeBottleForMatching(name);
            
            // Check if search contains name as prefix (or vice versa)
            // Strip trailing punctuation for cleaner comparison
            const searchClean = normalizedSearch.replace(/[()[\]{}]/g, '').trim();
            const nameClean = normalizedName.replace(/[()[\]{}]/g, '').trim();
            
            // One must start with the other (order-independent prefix check)
            if (searchClean.startsWith(nameClean) || nameClean.startsWith(searchClean)) {
                // Calculate how much of the longer string is covered by the shorter
                const minLen = Math.min(searchClean.length, nameClean.length);
                const maxLen = Math.max(searchClean.length, nameClean.length);
                const containmentRatio = minLen / maxLen;
                
                prefixMatches.push({
                    bottleName: bottle.bottleName,
                    plainBottleName: bottle.plainBottleName || bottle.bottleName,
                    matchedName: name,
                    normalizedName: normalizedName,
                    searchClean: searchClean,
                    nameClean: nameClean,
                    containmentRatio: containmentRatio
                });
            }
        }
    }
    
    if (prefixMatches.length === 1) {
        return { 
            bottleName: prefixMatches[0].bottleName, 
            unmatched: false, 
            suggestedBottles: [], 
            suggestion: null,
            matchMethod: 'PREFIX_CONTAINMENT'
        };
    } else if (prefixMatches.length > 1) {
        // Ambiguous prefix matches - rank by containment ratio and take top candidate if strong match
        prefixMatches.sort((a, b) => b.containmentRatio - a.containmentRatio);
        // Lowered threshold to 0.4 (40%) to catch cases where short code is contained in longer name
        if (prefixMatches[0].containmentRatio >= 0.4) {
            return {
                bottleName: prefixMatches[0].bottleName,
                unmatched: false,
                suggestedBottles: [],
                suggestion: null,
                matchMethod: 'PREFIX_CONTAINMENT_STRONG'
            };
        }
        // Otherwise fall through to fuzzy matching
    }
    
    // Stage 5: Fuzzy matching with suggestions
    const fuzzyThreshold = 0.75; // 75% similarity threshold
    const candidates = [];
    
    for (const bottle of allBottles) {
        const namesToCheck = (bottle.bottleNames && bottle.bottleNames.length > 0)
            ? bottle.bottleNames
            : [bottle.bottleName, bottle.plainBottleName].filter(Boolean);
        
        for (const name of namesToCheck) {
            const normalizedName = normalizeBottleForMatching(name);
            const similarity = getSimilarityScore(normalizedSearch, normalizedName);
            
            if (similarity >= fuzzyThreshold) {
                candidates.push({
                    bottleName: bottle.bottleName,
                    plainBottleName: bottle.plainBottleName || bottle.bottleName,
                    similarity: similarity,
                    matchedName: name
                });
            }
        }
    }
    
    // Remove duplicates (keep highest similarity for each bottle)
    const uniqueCandidates = [];
    const seenBottles = new Set();
    candidates.sort((a, b) => b.similarity - a.similarity);
    
    for (const candidate of candidates) {
        if (!seenBottles.has(candidate.bottleName)) {
            uniqueCandidates.push(candidate);
            seenBottles.add(candidate.bottleName);
        }
    }
    
    if (uniqueCandidates.length === 1) {
        // Unambiguous fuzzy match - use it but mark as fuzzy
        return { 
            bottleName: uniqueCandidates[0].bottleName, 
            unmatched: false, 
            suggestedBottles: uniqueCandidates, 
            suggestion: `Matched fuzzy: "${searchText}" → "${uniqueCandidates[0].plainBottleName}"`,
            matchMethod: 'FUZZY_UNAMBIGUOUS'
        };
    } else if (uniqueCandidates.length > 1) {
        // Ambiguous fuzzy matches - return suggestions, don't auto-pick
        return { 
            bottleName: 'MISSING', 
            unmatched: true, 
            suggestedBottles: uniqueCandidates.slice(0, 3), // Top 3 suggestions
            suggestion: `Text "${searchText}" could match: ${uniqueCandidates.slice(0, 3).map(c => c.plainBottleName).join(', ')}`,
            matchMethod: 'FUZZY_AMBIGUOUS'
        };
    }
    
    // No matches found - return without suggestions
    return { 
        bottleName: 'MISSING', 
        unmatched: true, 
        suggestedBottles: [], 
        suggestion: null,
        matchMethod: 'NO_MATCH'
    };
};

/**
 * Parse SHRENO/TPP Incoming Record
 * Uses column map to extract fields (supports both SHRENO 10-col and TPP 7-col formats)
 * 
 * SHRENO Field Mapping: poDate, poNo, poOrderQty, description, date, challanNo, noOfBox, qty, incomingQty
/**
 * Detect and parse PACKING MATERIAL block from the same sheet as Incoming data
 * 
 * Block structure (per real sheet analysis):
 *   Row N: "PACKING MATERIAL" marker at Q1 (col 16)
 *   Row N+1: Dates at R, S (col 17, 18) and "TOTAL AVL IN SHAYONA" at T (col 19)
 *   Row N+2+: Item type names in column Q (col 16), quantities in date columns, totals in column T as vertical key→value list
 * 
 * Returns: { packingRecords: [...], headerRowIndex: N, dateColumnMap: [...] }
 * or null if block not found or parsing fails
 */
const parsePackingMaterialBlock = (data, allItemTypes) => {
    if (!data || data.length < 5) return null;

    // Step 1: Find "PACKING MATERIAL" marker and detect its column
    let blockHeaderRowIndex = null;
    let blockStartColIndex = null;
    
    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
        const row = data[rowIdx];
        if (!row || row.length === 0) continue;
        
        // Check each cell in the row for the marker
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
            const cellText = String(row[colIdx] || '').trim().toUpperCase();
            if (cellText === 'PACKING MATERIAL' || cellText.includes('PACKING MATERIAL')) {
                blockHeaderRowIndex = rowIdx;
                blockStartColIndex = colIdx;  // NEW: Remember which column has PACKING MATERIAL
                console.log(`[PACKING_MATERIAL] Found "PACKING MATERIAL" marker at row ${rowIdx + 1}, col ${colIdx} (index ${colIdx})`);
                break;
            }
        }
        if (blockHeaderRowIndex !== null) break;
    }

    if (blockHeaderRowIndex === null) {return null;
    }

    // Step 2: Parse date columns from the row after the header
    const dateRowIndex = blockHeaderRowIndex + 1;
    if (dateRowIndex >= data.length) {return null;
    }

    const dateRow = data[dateRowIndex];
    if (!dateRow) {return null;
    }

    // Build date column map: { colIndex: date }
    // Start from blockStartColIndex + 1 (the column immediately after PACKING MATERIAL)
    const dateColumnMap = {};
    let totalAvailableColIndex = null;

    for (let colIdx = blockStartColIndex + 1; colIdx < dateRow.length; colIdx++) {
        const cellText = String(dateRow[colIdx] || '').trim();
        
        if (!cellText) continue;

        // Check if this is the "TOTAL AVL IN SHAYONA" column
        if (cellText.toUpperCase().includes('TOTAL AVL') || cellText.toUpperCase().includes('TOTAL')) {
            totalAvailableColIndex = colIdx;
            console.log(`[PACKING_MATERIAL] Found "TOTAL AVL" column at index ${colIdx}`);
            continue;
        }

        // Try to parse as a date
        const parsedDate = parseDate(cellText);
        if (parsedDate && !isNaN(parsedDate.getTime())) {
            dateColumnMap[colIdx] = parsedDate;
            console.log(`[PACKING_MATERIAL] Found date at column ${colIdx}: ${parsedDate.toLocaleDateString()}`);
        }
    }

    if (Object.keys(dateColumnMap).length === 0) {return null;
    }

    console.log(`[PACKING_MATERIAL] Date columns found: ${Object.keys(dateColumnMap).length}, Total column: ${totalAvailableColIndex !== null ? 'YES' : 'NO'}, Item column: ${blockStartColIndex} (index ${blockStartColIndex})`);

    // Step 3: Parse item type rows (rows after date row)
    // Item type names are in column blockStartColIndex, not row[0]
    const packingRecords = [];
    
    for (let rowIdx = dateRowIndex + 1; rowIdx < data.length; rowIdx++) {
        const row = data[rowIdx];
        if (!row || row.length < blockStartColIndex + 1) continue;

        // Item type name is in the same column as "PACKING MATERIAL" header
        const itemTypeName = String(row[blockStartColIndex] || '').trim();
        if (!itemTypeName) continue;

        // Skip if this looks like a footer/total row
        if (itemTypeName.toUpperCase().includes('TOTAL') || itemTypeName.toUpperCase().includes('SUMMARY')) {
            console.log(`[PACKING_MATERIAL] Skipping row: "${itemTypeName}" (looks like summary row)`);
            break;
        }

        // Try to match the item type name to the master ItemType list
        let matchedItemTypeId = null;
        if (allItemTypes && allItemTypes.length > 0) {
            // Exact match first
            const exactMatch = allItemTypes.find(it => it.name.toUpperCase() === itemTypeName.toUpperCase());
            if (exactMatch) {
                matchedItemTypeId = exactMatch._id.toString();
            } else {
                // Fuzzy match (in case of slight variations)
                const normalized = itemTypeName.toUpperCase().replace(/\s+/g, ' ');
                const fuzzyMatch = allItemTypes.find(it => 
                    it.name.toUpperCase().replace(/\s+/g, ' ') === normalized
                );
                if (fuzzyMatch) {
                    matchedItemTypeId = fuzzyMatch._id.toString();
                }
            }
        }

        if (!matchedItemTypeId) {
            console.warn(`[PACKING_MATERIAL] Item type "${itemTypeName}" not found in master list`);
            // Still include it in the record but mark it as unmatched
            matchedItemTypeId = 'UNKNOWN';
        }

        // Extract quantities for each date column
        const dateQuantities = {};
        for (const [colIdx, dateObj] of Object.entries(dateColumnMap)) {
            const colIdxNum = parseInt(colIdx);
            const quantity = row[colIdxNum];
            
            if (quantity !== null && quantity !== undefined && quantity !== '') {
                const qty = parseFloat(quantity);
                if (!isNaN(qty)) {
                    dateQuantities[dateObj.toISOString().split('T')[0]] = qty;
                }
            }
        }

        // Get the total available value if TOTAL column exists
        // NOTE: Column T (TOTAL AVL IN SHAYONA) is NOT row-aligned with Q/R/S.
        // It is a vertical key→value list where:
        //   - Row N, Col T: item name (e.g., "1PC GP")
        //   - Row N+1, Col T: numeric value (e.g., 1692)
        // So we will parse this AFTER collecting all rows, not per-row.
        let totalAvailable = null;
        if (totalAvailableColIndex !== null && row[totalAvailableColIndex]) {
            const cellValue = String(row[totalAvailableColIndex]).trim();
            // If this cell contains a number, it's a value row (previous row had the item name)
            const numValue = parseFloat(cellValue);
            if (!isNaN(numValue)) {
                totalAvailable = numValue;
            }
        }

        packingRecords.push({
            itemTypeName,
            itemTypeId: matchedItemTypeId,
            dateQuantities,      // Map of date (YYYY-MM-DD) -> quantity
            totalAvailable,      // May be null; will be populated from column T if available
            excelRowNumber: rowIdx + 1
        });

        console.log(`[PACKING_MATERIAL] Parsed item: "${itemTypeName}" (ID: ${matchedItemTypeId}), dates: ${Object.keys(dateQuantities).length}, total: ${totalAvailable}`);
    }

    // Step 4: If we have a TOTAL AVL column, parse it as a separate vertical key→value section
    // Column T may have a list like:
    //   Row M: "1PC GP"
    //   Row M+1: 1692
    //   Row M+2: "1PC BULK"
    //   Row M+3: 94
    //   Row M+4: "120MM LID"
    //   Row M+5: 20892
    // We match these item names to our parsed records and update their totalAvailable
    if (totalAvailableColIndex !== null) {  // FIXED: Remove allItemTypes check - match by name first
        console.log(`[PACKING_MATERIAL] Parsing column ${totalAvailableColIndex} (TOTAL AVL) as vertical key→value section...`);
        
        for (let rowIdx = dateRowIndex + 1; rowIdx < data.length - 1; rowIdx++) {
            const row = data[rowIdx];
            const nextRow = data[rowIdx + 1];
            if (!row || !nextRow || row.length <= totalAvailableColIndex || nextRow.length <= totalAvailableColIndex) {
                continue;
            }

            const currentCell = String(row[totalAvailableColIndex] || '').trim();
            const nextCell = String(nextRow[totalAvailableColIndex] || '').trim();

            // Check if the cell contains ONLY a number (not text with numbers like "1PC GP")
            const currentIsNumber = /^\d+(\.\d+)?$/.test(currentCell);
            const nextIsNumber = /^\d+(\.\d+)?$/.test(nextCell);

            if (!currentIsNumber && currentCell && nextIsNumber) {
                // This is a key→value pair: currentCell is item name, nextCell is total available
                const itemKey = currentCell.toUpperCase();
                const totalValue = parseFloat(nextCell);

                console.log(`[PACKING_MATERIAL] Found vertical key→value: "${currentCell}" → ${totalValue}`);

                // Try to match to an item type in the master list OR by name directly
                let matchedRecord = null;

                // First try: Match by item type name directly (most reliable)
                // Normalize: remove/collapse spaces so "120MM LID" matches "120 MM LID"
                const normalizedKey = itemKey.replace(/\s+/g, '');
                matchedRecord = packingRecords.find(rec => 
                    rec.itemTypeName.toUpperCase().replace(/\s+/g, '') === normalizedKey
                );

                // If no direct match, try matching against master list
                if (!matchedRecord && allItemTypes && allItemTypes.length > 0) {
                    // Exact match (after space normalization)
                    const exactMatch = allItemTypes.find(it => it.name.toUpperCase().replace(/\s+/g, '') === normalizedKey);
                    if (exactMatch) {
                        // Find the corresponding record by item type name
                        matchedRecord = packingRecords.find(rec => 
                            rec.itemTypeName.toUpperCase().replace(/\s+/g, '') === exactMatch.name.toUpperCase().replace(/\s+/g, '')
                        );
                    }

                    // Fuzzy match if no exact match
                    if (!matchedRecord) {
                        const fuzzyMatch = allItemTypes.find(it => 
                            it.name.toUpperCase().replace(/\s+/g, '') === normalizedKey
                        );
                        if (fuzzyMatch) {
                            matchedRecord = packingRecords.find(rec => 
                                rec.itemTypeName.toUpperCase().replace(/\s+/g, '') === 
                                fuzzyMatch.name.toUpperCase().replace(/\s+/g, '')
                            );
                        }
                    }
                }

                if (matchedRecord) {
                    matchedRecord.totalAvailable = totalValue;
                    console.log(`[PACKING_MATERIAL] Updated "${matchedRecord.itemTypeName}" total available to ${totalValue}`);
                } else {
                    console.warn(`[PACKING_MATERIAL] No matching record found for vertical key→value item: "${currentCell}"`);
                }
            }
        }
    }

    if (packingRecords.length === 0) {return null;
    }

    console.log(`[PACKING_MATERIAL] Successfully parsed ${packingRecords.length} items from block`);

    return {
        packingRecords,
        headerRowIndex: blockHeaderRowIndex,
        dateColumnMap: Object.values(dateColumnMap).map(d => new Date(d))
    };
};

/**
 * TPP Field Mapping: date, challanNo, description, box, qty, total
 */
const parseShrenoIncomingRecord = (rowData, rowIndex, allBottles, sheetName = null, resolvedBottleId = null, resolvedBottleMethod = null, columnMap = null, format = 'SHRENO') => {
    // Extract fields using column map or hardcoded indices
    const srNo = String(getFieldValue(rowData, columnMap, 'srNo') || rowData[0] || '').trim();
    const poDate = columnMap ? getFieldValue(rowData, columnMap, 'poDate') : rowData[1];
    const poNo = String(columnMap ? (getFieldValue(rowData, columnMap, 'poNo') || '') : (rowData[2] || '')).trim();
    const poOrderQty = columnMap ? getFieldValue(rowData, columnMap, 'poOrderQty') : rowData[3];
    const description = String(columnMap ? (getFieldValue(rowData, columnMap, 'description') || '') : (rowData[4] || '')).trim();
    const incomingDate = columnMap ? getFieldValue(rowData, columnMap, 'date') : rowData[5];
    const challanNo = String(columnMap ? (getFieldValue(rowData, columnMap, 'challanNo') || '') : (rowData[6] || '')).trim();
    const noOfBox = columnMap ? getFieldValue(rowData, columnMap, 'noOfBox') || getFieldValue(rowData, columnMap, 'box') : rowData[7];
    const qty = columnMap ? getFieldValue(rowData, columnMap, 'qty') : rowData[8];
    const incomingQty = columnMap ? (getFieldValue(rowData, columnMap, 'incomingQty') || getFieldValue(rowData, columnMap, 'total')) : rowData[9];

    const record = {
        excelRowNumber: rowIndex + 1,
        isValid: true,
        errors: [],
        isContinuationRow: false,
        sourceFormat: 'SHRENO',
        bottleResolutionAttempts: []  // Track matching attempts
        // NOTE: itemType and configuration are NOT in Excel sheet
        // They must be provided by user during manual entry (ShrenoIncoming form)
    };

    // Check if this is an "OLD STOCK" opening balance row
    const isOldStock = description.toUpperCase() === 'OLD STOCK';
    record.isOpeningBalance = isOldStock;

    // Bottle identity resolution: use pre-resolved ID if provided (from outer→inner fallback),
    // otherwise try to match from description
    let bottleId = resolvedBottleId || null;
    let bottleMethod = resolvedBottleMethod || 'PROVIDED';
    
    if (!bottleId) {
        // No pre-resolved ID, attempt to match from description
        if (isOldStock && !sheetName) {
            record.errors.push("Sheet name not available for OLD STOCK row");
            record.isValid = false;
            return record;
        }
        
        const matchSource = isOldStock ? sheetName : description;
        const matched = matchBottleNameFromMaster(matchSource, allBottles);
        bottleId = matched.bottleName;
        bottleMethod = matched.matchMethod || 'UNKNOWN';
        
        // Record the attempt for tracing
        record.bottleResolutionAttempts.push({
            source: matchSource,
            method: bottleMethod,
            result: bottleId,
            suggestion: matched.suggestion
        });
        
        if (matched.unmatched || bottleId === 'MISSING') {
            record.errors.push(`Bottle not found in master ("${matchSource}"). Attempted: ${bottleMethod}`);
        }
    }
    
    record.bottleNameRaw = bottleId;
    record.bottleResolutionMethod = bottleMethod;

    // Map to CRUD fields
    if (isOldStock) {
        // OLD STOCK rows: special handling - no PO date/no required
        record.date = null;                    // F: DATE
        record.poDate = null;                  // B: PO DATE
        record.poNo = null;                    // C: PO NO
        record.challanNo = 'OLD STOCK';        // G: CHALLAN NO
        record.itemData = {
            bottleNameId: bottleId,            // E: DESCRIPTION (resolved bottle ID)
            poOrderQty: null,                  // D: PO ORDER QTY
            noOfBox: 0,                        // H: NO OF BOX
            qty: 0,                            // I: QTY
            totalQty: !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : 0  // J: INCOMING QTY
        };

        if (record.itemData.totalQty <= 0) {
            record.errors.push("Opening balance quantity must be greater than 0");
        }
    } else {
        // Normal challan-based incoming row - quantity can be blank/zero (row still valid if has bottle/challan/date info)
        record.date = parseDate(incomingDate);                    // F: DATE (mapped to top-level date)
        record.poDate = parseDate(poDate);                        // B: PO DATE
        record.poNo = poNo || null;                              // C: PO NO
        record.challanNo = challanNo || null;                    // G: CHALLAN NO
        
        record.itemData = {
            bottleNameId: bottleId,                             // E: DESCRIPTION (resolved bottle ID)
            poOrderQty: !isNaN(parseFloat(poOrderQty)) ? parseFloat(poOrderQty) : null,  // D: PO ORDER QTY
            noOfBox: !isNaN(parseFloat(noOfBox)) ? parseFloat(noOfBox) : 0,              // H: NO OF BOX
            qty: !isNaN(parseFloat(qty)) ? parseFloat(qty) : 0,                          // I: QTY
            totalQty: !isNaN(parseFloat(incomingQty)) ? parseFloat(incomingQty) : 0      // J: INCOMING QTY
        };

        if (!record.date) record.errors.push("Incoming date (F: DATE) is missing");
        // RELAXED: Quantity is now optional - rows with blank Box/Qty/Total are valid if they have bottle/challan/date info
        // Removed: if (record.itemData.totalQty <= 0) record.errors.push("Total quantity (J: INCOMING QTY) must be greater than 0");
    }

    record.isValid = record.errors.length === 0;
    return record;
};

/**
 * Import Preview for SHRENO Incoming
 */
exports.importPreview = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileBuffer = req.file.buffer;
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

        const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
        const allBottles = await BottlePerBox.find({ isDeleted: false }).lean();
        const allItemTypes = await ItemType.find({ isDeleted: { $ne: true } }).lean();

        // Resolve company
        const companyResolution = resolveCompanyFromFilename(req.file.originalname, allCompanies);
        let resolvedCompany = companyResolution.matched 
            ? allCompanies.find(c => String(c._id) === companyResolution.companyId) 
            : { _id: null, name: companyResolution.companyName };

        if (req.body && req.body.companyId) {
            const c = allCompanies.find(c => String(c._id) === req.body.companyId);
            if (c) resolvedCompany = { _id: c._id, name: c.name };
        }

        const allRecords = [];
        let parsePassCount = 0;
        let companyMismatchWarnings = [];  // NEW: Track company mismatches

        // Parse sheets
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });

            let incomingRecords = [];
            
            // Step 1: Detect company marker from row 1
            const companyMarkerDetection = detectCompanyMarkerFromRow1(data);
            
            // NEW: Check for company mismatch
            if (companyMarkerDetection && companyMarkerDetection.company !== 'SHRENO') {
                const warning = `Sheet "${sheetName}": Detected company is "${companyMarkerDetection.company}", but this is a SHRENO-specific importer. This sheet will be skipped.`;
                console.warn(`[SHRENO IMPORT] ${warning}`);
                companyMismatchWarnings.push({
                    sheetName,
                    detectedCompany: companyMarkerDetection.company,
                    warning
                });
                continue;  // Skip non-SHRENO sheets
            }
            
            // Step 2: Detect headers and build column map dynamically
            const headerDetection = detectHeadersAndBuildColumnMap(data, companyMarkerDetection?.company);
            
            if (!headerDetection) {
                console.log(`[SHRENO IMPORT] Sheet "${sheetName}": No compatible header row found`);
                continue;
            }

            const { columnMap, format, detectedCompany, headerRowIndex } = headerDetection;
            
            // NEW: If format is not SHRENO, warn and skip
            if (format !== 'SHRENO') {
                const warning = `Sheet "${sheetName}": Detected format is "${format}", but this is a SHRENO-specific importer. This sheet will be skipped.`;
                console.warn(`[SHRENO IMPORT] ${warning}`);
                companyMismatchWarnings.push({
                    sheetName,
                    detectedFormat: format,
                    warning
                });
                continue;  // Skip non-SHRENO sheets
            }
            
            console.log(`[SHRENO IMPORT] Sheet: "${sheetName}" | Company: ${detectedCompany} | Format: ${format} | HeaderRow: ${headerRowIndex + 1}`);
            if (companyMarkerDetection) {
                console.log(`  Company marker: "${companyMarkerDetection.marker}" at column ${companyMarkerDetection.markerColumn}`);
            }
            console.log(`  Detected columns: ${JSON.stringify(columnMap)}`);

            if (format === 'UNKNOWN' || Object.keys(columnMap).length < 3) {
                console.log(`[SHRENO IMPORT] Sheet "${sheetName}": Unknown or insufficient column detection - SKIPPING`);
                continue;
            }

            // OUTER → INNER FALLBACK LOGIC
            // Step 1: Try to match the sheet name to a master bottle
            const sheetBottleMatch = matchBottleNameFromMaster(sheetName, allBottles);
            let sheetBottleId = sheetBottleMatch.bottleName;

            // Step 2: If outer (sheet name) didn't match, collect inner results
            let innerRowResults = [];
            let distinctBottlesFound = new Set();
            
            if (sheetBottleId === 'MISSING') {
                // Outer failed - try to match rows individually
                for (let i = headerRowIndex + 1; i < data.length; i++) {
                    const row = data[i];
                    
                    // Skip skippable rows
                    if (isSkippableRow(row, columnMap)) {
                        continue;
                    }
                    
                    const descriptionValue = String(getFieldValue(row, columnMap, 'description') || '').trim();
                    const isOldStock = descriptionValue.toUpperCase() === 'OLD STOCK';
                    
                    console.log(`[SHRENO_IMPORT_DEBUG] Row ${i}: description="${descriptionValue}" (from col ${columnMap['description']}), isOldStock=${isOldStock}`);
                    
                    // Try to match this row's bottle text
                    const innerMatch = matchBottleNameFromMaster(descriptionValue, allBottles);
                    const innerBottleId = innerMatch.bottleName;
                    
                    innerRowResults.push({
                        rowIndex: i,
                        rowBottleId: innerBottleId,
                        description: descriptionValue,
                        isOldStock: isOldStock
                    });
                    
                    // Track distinct bottles found (excluding MISSING and OLD STOCK)
                    if (innerBottleId !== 'MISSING' && !isOldStock) {
                        distinctBottlesFound.add(innerBottleId);
                    }
                }
            }

            // Parse data rows
            let lastValidBottleId = null;  // Track last non-blank bottle for continuation rows
            let lastValidDate = null;      // Track last non-blank date for continuation rows
            
            for (let i = headerRowIndex + 1; i < data.length; i++) {
                const row = data[i];
                
                // Skip blank padding rows and TOTAL rows
                if (isSkippableRow(row, columnMap)) continue;

                // Get the description field to check if this is a continuation row
                const description = String(columnMap ? (getFieldValue(row, columnMap, 'description') || '') : (row[4] || '')).trim();
                const isContinuationRow = !description;  // Empty description = continuation row
                
                // Get the incoming date field
                const incomingDate = columnMap ? getFieldValue(row, columnMap, 'date') : row[5];
                const dateObj = parseDate(incomingDate);

                // For continuation rows: use the last valid bottle and date from the group
                let resolvedBottleId = sheetBottleId; // Default: use outer (sheet name) match if it succeeded
                let resolutionMethod = 'OUTER'; // Track how bottle was resolved
                
                if (isContinuationRow && lastValidBottleId) {
                    // Continuation row - inherit bottle from prior row
                    resolvedBottleId = lastValidBottleId;
                    resolutionMethod = 'INHERITED_FROM_GROUP';
                } else if (sheetBottleId === 'MISSING') {
                    // Outer failed, use inner fallback
                    const rowResult = innerRowResults.find(r => r.rowIndex === i);
                    
                    if (rowResult) {
                        if (rowResult.rowBottleId !== 'MISSING') {
                            // This row's own bottle text matched
                            resolvedBottleId = rowResult.rowBottleId;
                            resolutionMethod = 'INNER_SELF';
                        } else {
                            // This row's bottle text didn't match
                            // Try to use the single distinct bottle found in the sheet (if there's only one)
                            if (distinctBottlesFound.size === 1) {
                                resolvedBottleId = Array.from(distinctBottlesFound)[0];
                                resolutionMethod = 'INNER_FALLBACK_SINGLE';
                            } else if (distinctBottlesFound.size > 1) {
                                // Multiple distinct bottles in sheet, don't guess
                                resolvedBottleId = 'MISSING';
                                resolutionMethod = 'INNER_AMBIGUOUS';
                            } else {
                                // No bottles found in sheet at all
                                resolvedBottleId = 'MISSING';
                                resolutionMethod = 'INNER_NONE';
                            }
                        }
                    }
                }

                const record = parseShrenoIncomingRecord(row, i, allBottles, sheetName, resolvedBottleId, resolutionMethod, columnMap, format);
                record.sheetName = sheetName;
                record.companyId = resolvedCompany._id ? resolvedCompany._id.toString() : null;
                record.companyName = resolvedCompany.name;
                record.detectedCompany = detectedCompany;  // Store the detected company from row 1 marker
                record.sourceFormat = format;              // Store the detected format (SHRENO/TPP/UNKNOWN)
                record.isContinuationRow = isContinuationRow;  // Mark if this is a continuation row
                if (companyMarkerDetection) {
                    record.companyMarker = companyMarkerDetection.marker;  // Store the exact marker text found
                }

                // NEW: For continuation rows with no date, inherit the date from last valid row
                if (isContinuationRow && !dateObj && lastValidDate) {
                    record.date = lastValidDate;
                    // Don't add error since we inherited it
                    record.errors = record.errors.filter(err => !err.includes('Incoming date (F: DATE) is missing'));
                    record.isValid = record.errors.length === 0;
                }

                // Track the last valid bottle and date for continuation rows
                if (!isContinuationRow) {
                    if (resolvedBottleId && resolvedBottleId !== 'MISSING') {
                        lastValidBottleId = resolvedBottleId;
                    }
                    if (dateObj) {
                        lastValidDate = dateObj;
                    }
                }

                incomingRecords.push(record);
            }

            // Parse PACKING MATERIAL block from the same sheet
            const packingMaterialBlock = parsePackingMaterialBlock(data, allItemTypes);
            let packingRecords = [];

            if (packingMaterialBlock) {
                console.log(`[SHRENO IMPORT] Sheet "${sheetName}": Found packing material block with ${packingMaterialBlock.packingRecords.length} items`);
                packingRecords = packingMaterialBlock.packingRecords;
            } else {
                console.log(`[SHRENO IMPORT] Sheet "${sheetName}": No packing material block found`);
            }

            if (incomingRecords.length > 0) {
                allRecords.push({
                    sheetName,
                    incomingRecords,
                    packingRecords,
                    totalRows: incomingRecords.length,
                    validRows: incomingRecords.filter(r => r.isValid).length,
                    invalidRows: incomingRecords.filter(r => !r.isValid).length,
                    packingMaterialCount: packingRecords.length,
                    format: format,
                    invalidReasons: {}
                });

                // Build invalid reasons
                for (const record of incomingRecords) {
                    if (!record.isValid) {
                        for (const err of record.errors) {
                            allRecords[allRecords.length - 1].invalidReasons[err] = (allRecords[allRecords.length - 1].invalidReasons[err] || 0) + 1;
                        }
                    }
                }
            }
        }

        parsePassCount++;

        return res.status(200).json({
            success: true,
            data: {
                fileName: req.file.originalname,
                companyName: resolvedCompany.name,
                companyId: resolvedCompany._id ? resolvedCompany._id.toString() : null,
                totalRows: allRecords.reduce((acc, s) => acc + s.totalRows, 0),
                validRows: allRecords.reduce((acc, s) => acc + s.validRows, 0),
                invalidRows: allRecords.reduce((acc, s) => acc + s.invalidRows, 0),
                sheets: allRecords,
                companyMismatchWarnings: companyMismatchWarnings.length > 0 ? companyMismatchWarnings : null  // NEW: Include warnings
            }
        });
    } catch (error) {
        console.error("[SHRENO INCOMING IMPORT ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Import Commit - Creates ShrenoIncoming documents with properly mapped fields
 * 
 * For each valid record:
 *  - Top-level doc fields: date (F), challanNo (G), poNo (C), poDate (B)
 *  - items array with: bottleName (resolved from E), itemType (must come from form - not in import), 
 *    configuration (must come from form), quantity (J: INCOMING QTY)
 */
exports.commitImport = async (req, res) => {
    try {
        const { sheetsToImport } = req.body;

        if (!sheetsToImport || !Array.isArray(sheetsToImport)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        console.log(`[SHRENO COMMIT] Received ${sheetsToImport.length} sheets to import`);
        console.log(`[SHRENO COMMIT] Full payload keys: ${Object.keys(sheetsToImport[0] || {}).join(', ')}`);
        sheetsToImport.forEach((sheet, idx) => {
            const validCount = sheet.incomingRecords ? sheet.incomingRecords.filter(r => r.isValid).length : 0;
            console.log(`[SHRENO COMMIT] Sheet ${idx + 1} (${sheet.sheetName}): incomingRecords=${sheet.incomingRecords ? sheet.incomingRecords.length : 'undefined'} total, ${validCount} valid`);
            if (!sheet.incomingRecords) {
                console.warn(`[SHRENO COMMIT] WARNING: Sheet ${idx + 1} has NO incomingRecords array!`);
            }
        });

        let totalIncomingImported = 0;
        let totalPackingMaterialUpdated = 0;
        
        // Get resolved company and bottle info to link packing material to the right bottle
        const allCompanies = await Company.find({ isDeleted: { $ne: true } }).lean();
        const allBottles = await BottlePerBox.find({ isDeleted: false }).lean();
        
        // Build a lookup map: bottleName string => ObjectId for quick resolution
        const bottleNameToIdMap = {};
        for (const bottle of allBottles) {
            if (bottle.bottleName) {
                bottleNameToIdMap[bottle.bottleName] = bottle._id;
            }
        }
        console.log(`[SHRENO COMMIT] Built bottleNameToIdMap with ${Object.keys(bottleNameToIdMap).length} entries`);

        for (const sheetData of sheetsToImport) {
            const { sheetName, incomingRecords, packingRecords } = sheetData;
            const validRecords = incomingRecords ? incomingRecords.filter(r => r.isValid) : [];

            console.log(`[SHRENO COMMIT] Processing sheet "${sheetName}": incomingRecords=${incomingRecords ? incomingRecords.length : 'null'}, validRecords=${validRecords.length}`);

            if (validRecords.length === 0 && (!packingRecords || packingRecords.length === 0)) {
                console.log(`[SHRENO COMMIT] Sheet "${sheetName}" has no valid records or packing records, skipping`);
                continue;
            }

            // Resolve bottle for this sheet (same logic as preview)
            const sheetBottleMatch = matchBottleNameFromMaster(sheetName, allBottles);
            let sheetBottleId = sheetBottleMatch.bottleName;

            // Try to find a valid bottle ID from incoming records if sheet name didn't match
            if (sheetBottleId === 'MISSING' && validRecords.length > 0) {
                const bottleFromRecord = validRecords.find(r => r.itemData?.bottleNameId && r.itemData.bottleNameId !== 'MISSING');
                if (bottleFromRecord) {
                    sheetBottleId = bottleFromRecord.itemData.bottleNameId;
                    console.log(`[PACKING MATERIAL COMMIT] Using bottle from first valid incoming record: ${sheetBottleId}`);
                }
            }

            // Get resolved company for this sheet (from first valid record)
            let resolvedCompany = { _id: null, name: 'SHRENO' };
            if (validRecords.length > 0 && validRecords[0].companyId) {
                const company = allCompanies.find(c => String(c._id) === validRecords[0].companyId);
                if (company) {
                    resolvedCompany = company;
                }
            }

            // INCOMING RECORDS
            const shrenoIncomingDocs = [];

            for (const record of validRecords) {
                // For OLD STOCK (opening balance), don't set a date - it's historical stock without a specific incoming date
                const docDate = record.challanNo === 'OLD STOCK' ? null : (record.date || null);

                // Resolve bottle name string to ObjectId
                const bottleNameStr = record.itemData.bottleNameId;
                const bottleObjectId = bottleNameToIdMap[bottleNameStr];
                
                if (!bottleObjectId) {
                    console.warn(`[SHRENO COMMIT] Bottle name "${bottleNameStr}" could not be resolved to ObjectId, skipping record`);
                    continue;
                }

                // Map Excel columns to CRUD fields
                const shrenoIncomingRecord = new ShrenoIncoming({
                    // Top-level fields (one doc per Excel row)
                    date: docDate,                           // F: DATE (incoming entry date)
                    challanNo: record.challanNo,             // G: CHALLAN NO (optional, 'OLD STOCK' for opening balance)
                    poNo: record.poNo,                       // C: PO NO
                    poDate: record.poDate,                   // B: PO DATE
                    
                    // Items array - create one item per row with bottle and quantity data
                    items: [
                        {
                            plainBottle: bottleObjectId,        // FIXED: Use resolved ObjectId instead of string
                            itemType: null,                             // Not available in Excel import (must be filled by user)
                            configuration: null,                        // Not available in Excel import (must be filled by user)
                            // Note: quantity field in model stores the total for this row
                            // In Excel: I = per-box qty, J = total incoming qty
                            // We map J (INCOMING QTY) to quantity field
                            quantity: record.itemData.totalQty          // J: INCOMING QTY (total quantity)
                        }
                    ]
                });

                shrenoIncomingDocs.push(shrenoIncomingRecord);
            }

            // Insert SHRENO Incoming records
            if (shrenoIncomingDocs.length > 0) {
                console.log(`[SHRENO COMMIT] About to save ${shrenoIncomingDocs.length} incoming records for sheet "${sheetName}"`);
                try {
                    for (const doc of shrenoIncomingDocs) {
                        await doc.save();
                        totalIncomingImported++;
                        console.log(`[SHRENO COMMIT] Saved incoming record #${totalIncomingImported}: date=${doc.date}, challanNo=${doc.challanNo}, bottle=${doc.items[0]?.plainBottle}, qty=${doc.items[0]?.quantity}`);
                    }
                    console.log(`[SHRENO COMMIT] Sheet "${sheetName}" saved ${shrenoIncomingDocs.length} records successfully`);
                } catch (err) {
                    console.warn(`[SHRENO INCOMING IMPORT] Error saving record: ${err.message}`);
                }
            }

            // PACKING MATERIAL RECORDS
            if (packingRecords && packingRecords.length > 0 && sheetBottleId !== 'MISSING') {
                console.log(`[PACKING MATERIAL COMMIT] Processing ${packingRecords.length} packing material items for bottle ${sheetBottleId}`);

                // Get bottle reference for linking
                const bottleDoc = allBottles.find(b => b.bottleName === sheetBottleId);
                if (!bottleDoc) {
                    console.warn(`[PACKING MATERIAL COMMIT] Bottle "${sheetBottleId}" not found, skipping packing material records`);
                    continue;
                }

                const bottleId = bottleDoc._id;

                for (const packingItem of packingRecords) {
                    if (packingItem.itemTypeId === 'UNKNOWN') {
                        console.warn(`[PACKING MATERIAL COMMIT] Item type "${packingItem.itemTypeName}" not found in master, skipping`);
                        continue;
                    }

                    try {
                        // Build snapshots array from dateQuantities
                        const snapshots = [];
                        for (const [dateStr, quantity] of Object.entries(packingItem.dateQuantities)) {
                            snapshots.push({
                                date: new Date(dateStr),
                                quantity: quantity
                            });
                        }

                        // Sort snapshots by date
                        snapshots.sort((a, b) => a.date - b.date);

                        // Find or create document for this bottle+company+itemType
                        const filter = {
                            bottleId: bottleId,
                            companyId: resolvedCompany._id,
                            itemType: mongoose.Types.ObjectId(packingItem.itemTypeId)
                        };

                        let existingDoc = await PackingMaterialStock.findOne(filter);

                        if (existingDoc) {
                            // Merge snapshots: add new dates, skip existing dates (don't overwrite)
                            for (const newSnapshot of snapshots) {
                                const existingSnapshotIndex = existingDoc.snapshots.findIndex(
                                    s => s.date.getTime() === newSnapshot.date.getTime()
                                );

                                if (existingSnapshotIndex === -1) {
                                    // New date, add it
                                    existingDoc.snapshots.push(newSnapshot);
                                    console.log(`[PACKING MATERIAL COMMIT] Added new snapshot: ${newSnapshot.date.toLocaleDateString()} = ${newSnapshot.quantity}`);
                                } else {
                                    // Date already exists, skip (don't overwrite)
                                    console.log(`[PACKING MATERIAL COMMIT] Date ${newSnapshot.date.toLocaleDateString()} already exists, skipping`);
                                }
                            }

                            // Update total available
                            if (packingItem.totalAvailable !== null) {
                                existingDoc.totalAvailable = packingItem.totalAvailable;
                            }

                            existingDoc.lastUpdated = new Date();
                            existingDoc.source = 'SHRENO_IMPORT';

                            await existingDoc.save();
                            console.log(`[PACKING MATERIAL COMMIT] Updated existing stock: ${packingItem.itemTypeName}`);
                        } else {
                            // Create new document
                            const newDoc = new PackingMaterialStock({
                                bottleId: bottleId,
                                companyId: resolvedCompany._id,
                                itemType: mongoose.Types.ObjectId(packingItem.itemTypeId),
                                snapshots: snapshots,
                                totalAvailable: packingItem.totalAvailable || 0,
                                lastUpdated: new Date(),
                                source: 'SHRENO_IMPORT'
                            });

                            await newDoc.save();
                            console.log(`[PACKING MATERIAL COMMIT] Created new stock: ${packingItem.itemTypeName}`);
                        }

                        totalPackingMaterialUpdated++;
                    } catch (err) {
                        console.warn(`[PACKING MATERIAL COMMIT] Error processing item "${packingItem.itemTypeName}": ${err.message}`);
                    }
                }
            }
        }

        console.log(`[SHRENO COMMIT] FINAL SUMMARY: totalIncomingImported=${totalIncomingImported}, totalPackingMaterialUpdated=${totalPackingMaterialUpdated}`);

        return res.status(200).json({
            success: true,
            message: `Imported ${totalIncomingImported} SHRENO incoming records and ${totalPackingMaterialUpdated} packing material items`,
            data: {
                incomingImported: totalIncomingImported,
                packingMaterialUpdated: totalPackingMaterialUpdated
            }
        });
    } catch (error) {
        console.error("[SHRENO INCOMING IMPORT COMMIT ERROR]", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


