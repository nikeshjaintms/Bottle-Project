/**
 * importedFilter.js
 * 
 * Single source of truth for filtering imported documents (Incoming, Dispatch, ShrenoIncoming).
 * Imported records are display-only and must be excluded from stock recompute, allocations,
 * dropdown options, reconcile, and downstream inventory calculations.
 */

// Query fragment to exclude imported documents in Mongoose and Mongo queries
const NOT_IMPORTED_FILTER = { isImported: { $ne: true } };

/**
 * Returns a filter query object with imported documents excluded
 * @param {Object} [additionalFilter={}] - Existing query filter
 * @returns {Object} Combined filter
 */
function getNotImportedFilter(additionalFilter = {}) {
  return {
    ...additionalFilter,
    isImported: { $ne: true }
  };
}

/**
 * Returns an aggregation $match stage with imported documents excluded
 * @param {Object} [additionalMatch={}] - Existing match object
 * @returns {Object} Aggregation pipeline stage: { $match: { ...additionalMatch, isImported: { $ne: true } } }
 */
function getNotImportedMatch(additionalMatch = {}) {
  return {
    $match: {
      ...additionalMatch,
      isImported: { $ne: true }
    }
  };
}

module.exports = {
  NOT_IMPORTED_FILTER,
  getNotImportedFilter,
  getNotImportedMatch
};
