/**
 * Shared Keyset Pagination Utilities
 * Used by Summary, Printing Plan, and other paginated list endpoints
 * 
 * Keyset pagination prevents duplicates/gaps when records are inserted/deleted mid-scroll
 * by using (sortKey, _id) as the cursor instead of offset-based pagination.
 */

const mongoose = require('mongoose');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Decode cursor from string format: "sortValue|_id"
 * Example: "2024-01-15T10:30:00.000Z|507f1f77bcf86cd799439011"
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parts = cursor.split('|');
    if (parts.length !== 2) return null;
    
    return {
      sortValue: isNaN(Date.parse(parts[0])) ? parts[0] : new Date(parts[0]),
      _id: parts[1]
    };
  } catch {
    return null;
  }
}

/**
 * Encode cursor to string format: "sortValue|_id"
 * Handles Date, Number, and String sort values.
 */
function encodeCursor(doc, sortKeyName = 'createdAt') {
  if (!doc || !doc._id) return null;
  
  const sortValue = doc[sortKeyName];
  if (sortValue === undefined || sortValue === null) return null;
  
  let sortStr;
  if (sortValue instanceof Date) {
    sortStr = sortValue.toISOString();
  } else if (typeof sortValue === 'number') {
    sortStr = sortValue.toString();
  } else {
    sortStr = String(sortValue);
  }
  
  return `${sortStr}|${doc._id.toString()}`;
}

/**
 * Build a keyset pagination query fragment for MongoDB
 * Returns a $or query that excludes already-fetched records
 */
function buildKeysetQuery(cursorData, sortKeyName = 'createdAt', sortOrder = -1) {
  if (!cursorData) return null;
  
  const operator = sortOrder === -1 ? '$lt' : '$gt';
  const equalityOperator = sortOrder === -1 ? '$lt' : '$gt';
  
  // Handle ObjectId creation properly
  let objectId;
  try {
    objectId = new mongoose.Types.ObjectId(cursorData._id);
  } catch (err) {
    return null;
  }
  
  return {
    $or: [
      { [sortKeyName]: { [operator]: cursorData.sortValue } },
      {
        [sortKeyName]: cursorData.sortValue,
        _id: { [equalityOperator]: objectId }
      }
    ]
  };
}

/**
 * Validate and parse limit parameter
 */
function parseLimit(limitParam, defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT) {
  const parsed = parseInt(limitParam) || defaultLimit;
  return Math.min(Math.max(parsed, 1), maxLimit);
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeCursor,
  encodeCursor,
  buildKeysetQuery,
  parseLimit
};
