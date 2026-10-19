/**
 * Shared Bottle Matching Utility
 * Used by both Incoming and Dispatch importers to maintain consistent bottle resolution logic
 */

/**
 * Normalize bottle names for matching - improved to handle spaces and typos
 * Applies: trim, collapse spaces, uppercase
 */
const normalizeBottleForMatching = (str) => {
    if (!str) return '';
    return String(str).trim().replace(/\s+/g, ' ').toUpperCase();
};

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 * Measures minimum edits (insertions, deletions, substitutions) needed
 */
const levenshteinDistance = (str1, str2) => {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }

    return matrix[len2][len1];
};

/**
 * Calculate similarity score (0-1) between two strings
 * 1.0 = identical, 0.0 = completely different
 */
const getSimilarityScore = (str1, str2) => {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    const distance = levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
};

/**
 * Normalize bottle names for matching (removes non-alphanumeric for strict comparison)
 */
const normalizeBottle = (str) => {
    if (!str) return '';
    return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '');
};

/**
 * Enhanced bottle matching with fuzzy fallback and suggestions
 * Used by both Incoming and Dispatch importers
 * 
 * @param {string} excelText - The bottle name text from the Excel file
 * @param {Array} allBottles - Array of bottle objects from database with bottleName, plainBottleName, bottleNames fields
 * @returns {Object} { bottleName, unmatched, suggestedBottles, suggestion }
 *   - bottleName: matched bottle name or 'MISSING'
 *   - unmatched: boolean indicating if match failed
 *   - suggestedBottles: array of fuzzy match suggestions for the UI Add button
 *   - suggestion: human-readable suggestion text
 */
const matchBottleNameFromMaster = (excelText, allBottles) => {
    if (!excelText) return { bottleName: 'MISSING', unmatched: true, suggestedBottles: [], suggestion: null };
    
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
                    suggestion: null 
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
                    suggestion: null 
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
            suggestion: null 
        };
    }
    
    // Stage 4: Fuzzy matching with suggestions
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
            suggestion: `Matched fuzzy: "${searchText}" → "${uniqueCandidates[0].plainBottleName}"` 
        };
    } else if (uniqueCandidates.length > 1) {
        // Ambiguous fuzzy matches - return suggestions, don't auto-pick
        return { 
            bottleName: 'MISSING', 
            unmatched: true, 
            suggestedBottles: uniqueCandidates.slice(0, 3),
            suggestion: `Sheet name "${searchText}" could match: ${uniqueCandidates.slice(0, 3).map(c => c.plainBottleName).join(', ')}` 
        };
    }
    
    // No matches found - return without suggestions
    return { 
        bottleName: 'MISSING', 
        unmatched: true, 
        suggestedBottles: [], 
        suggestion: null 
    };
};

module.exports = {
    normalizeBottleForMatching,
    levenshteinDistance,
    getSimilarityScore,
    normalizeBottle,
    matchBottleNameFromMaster
};
