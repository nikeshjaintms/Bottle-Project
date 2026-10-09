function normalizeCoatingShade(rawShade) {
    if (!rawShade) return null;
    let s = String(rawShade).trim();
    // Remove harmless separators at start and end
    s = s.replace(/^[-+(]+/g, '').replace(/[-+)]+$/g, '').trim();
    
    if (!s) return null;
    
    // Case whitespace normalization for comparison
    const upper = s.toUpperCase().replace(/\s+/g, ' ');
    
    // Controlled fuzzy match for PLAIN
    if (
        upper === 'PLAIN' || 
        upper === 'PLIAN' || 
        upper === 'PLANN' || 
        upper === 'PLAINN' || 
        upper === 'PLAİN' || 
        upper === 'PLAIN COLOUR'
    ) {
        return 'PLAIN';
    }
    
    return s || null;
}

function resolveBottleAndShade(rawProduct, activeBottleGroup, activeCoatingShade, matchBottleNameFromMaster) {
    let ownBottleValue = rawProduct !== undefined && rawProduct !== null ? String(rawProduct).trim() : '';
    
    let printingSuffix = null;
    let productTextWithoutVariant = ownBottleValue;
    
    // Extract variant FIRST and completely independently from bottle master
    const suffixRegex = /(?:-|\s)*\b(\d+\s*PC(?:\s*(?:GP|BULK))?)\b/i;
    const variantMatch = ownBottleValue.match(suffixRegex);
    if (variantMatch) {
        const rawSuffix = variantMatch[1].toUpperCase();
        const numMatch = rawSuffix.match(/\d+/);
        const typeMatch = rawSuffix.match(/(GP|BULK)/);
        if (typeMatch) {
            printingSuffix = `${numMatch[0]}PC ${typeMatch[1]}`;
        } else {
            printingSuffix = `${numMatch[0]}PC`;
        }
        productTextWithoutVariant = ownBottleValue.replace(suffixRegex, '').trim();
        productTextWithoutVariant = productTextWithoutVariant.replace(/^-+|-+$/g, '').trim();
    }
    
    let resolutionMethod = 'UNRESOLVED';
    let matchedBottleMaster = 'MISSING';
    let rowBottle = 'MISSING';
    
    // 1. Exact / Longest Bottle Master Match
    if (productTextWithoutVariant) {
        let match = matchBottleNameFromMaster(productTextWithoutVariant);
        if (match && match.bottleName && match.bottleName !== 'MISSING' && match.bottleName !== '*') {
            resolutionMethod = 'MASTER_MATCH';
            matchedBottleMaster = match.bottleName;
            rowBottle = match.bottleName;
        }
    }
    
    // 2 & 3. Active Bottle Group Context OR Dynamic Fallback
    if (resolutionMethod === 'UNRESOLVED') {
        let dynamicBottle = null;
        let hasSeparator = false;
        
        if (productTextWithoutVariant) {
            if (productTextWithoutVariant.includes(' - ')) {
                dynamicBottle = productTextWithoutVariant.split(' - ')[0].trim();
                hasSeparator = true;
            } else if (productTextWithoutVariant.includes(' -')) {
                dynamicBottle = productTextWithoutVariant.split(' -')[0].trim();
                hasSeparator = true;
            } else if (productTextWithoutVariant.includes('- ')) {
                dynamicBottle = productTextWithoutVariant.split('- ')[0].trim();
                hasSeparator = true;
            }
        }
        
        if (hasSeparator && dynamicBottle) {
            // Priority 3: Dynamic Product-Structure Fallback (strong indicator)
            rowBottle = dynamicBottle;
            resolutionMethod = 'FALLBACK_PARSED';
        } else {
            // Priority 2: Active Bottle Group Context (Child Row)
            if (activeBottleGroup && activeBottleGroup !== 'MISSING' && activeBottleGroup !== '*') {
                rowBottle = activeBottleGroup;
                resolutionMethod = 'INHERITED_GROUP';
            } else if (productTextWithoutVariant) {
                // Priority 3: Fallback by last hyphen if no active group exists
                const lastHyphenIdx = productTextWithoutVariant.lastIndexOf('-');
                if (lastHyphenIdx > 0) {
                    dynamicBottle = productTextWithoutVariant.substring(0, lastHyphenIdx).trim();
                    rowBottle = dynamicBottle;
                    resolutionMethod = 'FALLBACK_PARSED';
                } else {
                    // 4. UNRESOLVED
                    rowBottle = 'MISSING';
                }
            } else {
                rowBottle = 'MISSING';
            }
        }
    }

    // --- STRICT COATING SHADE CALCULATION ---
    let remainingAfterBottle = productTextWithoutVariant;
    
    if (rowBottle !== 'MISSING' && rowBottle) {
        // Explicitly remove ONLY the matched bottle prefix from the product
        const escapedBottle = rowBottle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefixRegex = new RegExp(`^${escapedBottle}(?:\\s*-+\\s*|\\s+)`, 'i');
        
        if (prefixRegex.test(remainingAfterBottle)) {
            remainingAfterBottle = remainingAfterBottle.replace(prefixRegex, '').trim();
        } else {
            const exactPrefix = new RegExp(`^${escapedBottle}`, 'i');
            if (exactPrefix.test(remainingAfterBottle)) {
                remainingAfterBottle = remainingAfterBottle.replace(exactPrefix, '').trim();
                remainingAfterBottle = remainingAfterBottle.replace(/^[-+\s]+/, '').trim();
            }
        }
    }
    
    let rawShade = remainingAfterBottle || null;
    let normalizedShade = normalizeCoatingShade(rawShade);
    
    // Failsafe validation
    if (rowBottle && normalizedShade) {
        const normBottle = rowBottle.toUpperCase().replace(/\s+/g, '');
        const normShade = normalizedShade.toUpperCase().replace(/\s+/g, '');
        if (normBottle === normShade) {
            normalizedShade = null;
        }
    }
    
    // Context Inheritance for Shade
    if (resolutionMethod === 'INHERITED_GROUP' && !normalizedShade && activeCoatingShade) {
        normalizedShade = activeCoatingShade;
    }

    return {
        rawProduct: ownBottleValue,
        productWithoutVariant: productTextWithoutVariant,
        matchedBottleMaster,
        activeBottleGroup,
        remainingAfterBottle,
        rawShade,
        normalizedShade,
        
        resolutionMethod,
        bottleName: rowBottle,
        coatingShade: normalizedShade,
        printingSuffix
    };
}

module.exports = { resolveBottleAndShade, normalizeCoatingShade };
