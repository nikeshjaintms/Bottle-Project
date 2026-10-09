export function buildContiguousGroups(items, keySelector, idKey = '_contiguousId') {
    const visibleGroupSpans = {};
    let currentGroupId = null;
    let currentGroupCount = 0;
    
    const contiguousList = items.map((r) => {
        const keyValue = keySelector(r);
        const isMissing = !keyValue || String(keyValue).toUpperCase() === 'MISSING' || keyValue === '*';
        
        if (isMissing) {
             return { ...r, [idKey]: null };
        }
        
        // Normalize value for comparison (e.g. trim spaces)
        const normalizedKey = String(keyValue).replace(/\s+/g, ' ').trim().toUpperCase();
        
        if (normalizedKey !== currentGroupId) {
             currentGroupId = normalizedKey;
             currentGroupCount++;
        }
        
        const groupIdentifier = `${idKey}-block-${currentGroupCount}`;
        visibleGroupSpans[groupIdentifier] = (visibleGroupSpans[groupIdentifier] || 0) + 1;
        return { ...r, [idKey]: groupIdentifier };
    });
    
    return { contiguousList, visibleGroupSpans };
}

export function buildMultipleContiguousGroups(items, groupConfigs) {
    const groupSpans = {};
    const currentGroupIds = {};
    const currentGroupCounts = {};
    
    groupConfigs.forEach(config => {
        groupSpans[config.idKey] = {};
        currentGroupIds[config.idKey] = null;
        currentGroupCounts[config.idKey] = 0;
    });
    
    const contiguousList = items.map((r) => {
        const newRow = { ...r };
        
        groupConfigs.forEach(config => {
            const keyValue = config.keySelector(newRow);
            const isMissing = !keyValue || String(keyValue).toUpperCase() === 'MISSING' || keyValue === '*';
            
            // Allow the keySelector to explicitly return a unique non-groupable string (like nogroup_...) 
            // that will break the group, but we don't want to map it to null if it shouldn't be null.
            if (isMissing && !String(keyValue).startsWith('nogroup_')) {
                newRow[config.idKey] = null;
                return;
            }
            
            const normalizedKey = String(keyValue).replace(/\s+/g, ' ').trim().toUpperCase();
            
            if (normalizedKey !== currentGroupIds[config.idKey]) {
                currentGroupIds[config.idKey] = normalizedKey;
                currentGroupCounts[config.idKey]++;
            }
            
            const groupIdentifier = `${config.idKey}-block-${currentGroupCounts[config.idKey]}`;
            groupSpans[config.idKey][groupIdentifier] = (groupSpans[config.idKey][groupIdentifier] || 0) + 1;
            newRow[config.idKey] = groupIdentifier;
        });
        
        return newRow;
    });
    
    return { contiguousList, groupSpans };
}
