/**
 * resolveBottle.js
 *
 * Shared utility to resolve a bottleId (ObjectId or string reference) to a normalized plain bottle name.
 * Supports mixed ObjectId/string storage across dispatch entries and lines with missing bottleIds.
 *
 * Returns:
 * - normalized plain bottle name (trimmed, uppercase, spaces collapsed, ROLL ON → ROLLON), or
 * - null if bottleId is invalid, missing, or not found in master
 */

const mongoose = require('mongoose');

/**
 * Normalize a bottle name to match Incoming logic:
 * - trim, uppercase, collapse multiple spaces to single, ROLL ON → ROLLON
 */
function normalizeBottleName(name) {
  if (!name || typeof name !== 'string') return null;
  let normalized = name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' '); // collapse multiple spaces
  
  // ROLL ON → ROLLON (match Incoming logic for consistency)
  normalized = normalized.replace(/\bROLL\s+ON\b/g, 'ROLLON');
  
  return normalized;
}

/**
 * Resolve a bottleId to a normalized plain bottle name.
 * Handles both ObjectId and string bottleIds.
 *
 * @param {string|ObjectId} bottleId - The bottle ID to resolve (may be ObjectId string or populated)
 * @returns {Promise<string|null>} - Normalized plain bottle name, or null if not found
 */
async function resolveBottleToPlainName(bottleId) {
  if (!bottleId) return null;
  
  try {
    // Try to get the BottlePerBox model; if not yet initialized, lazy-load it
    let BottlePerBox;
    try {
      BottlePerBox = mongoose.model('BottlePerBox');
    } catch (e) {
      // Model not yet registered, try requiring it
      BottlePerBox = require('../models/BottlePerBox');
    }
    
    let query = null;
    let bottleDoc = null;
    
    // Case 1: bottleId is already an ObjectId
    if (mongoose.Types.ObjectId.isValid(bottleId)) {
      const objId = new mongoose.Types.ObjectId(bottleId);
      bottleDoc = await BottlePerBox.findById(objId, 'plainBottleName');
      if (bottleDoc) {
        return normalizeBottleName(bottleDoc.plainBottleName);
      }
    }
    
    // Case 2: bottleId is a string reference; try to match bottleNames array
    if (typeof bottleId === 'string') {
      const normalized = normalizeBottleName(bottleId);
      // Try exact match on bottleNames (normalized)
      bottleDoc = await BottlePerBox.findOne(
        {
          bottleNames: { $in: [bottleId, normalized] }
        },
        'plainBottleName'
      );
      if (bottleDoc) {
        return normalizeBottleName(bottleDoc.plainBottleName);
      }
    }
    
    // Not found
    return null;
  } catch (err) {
    console.error('Error resolving bottle:', err.message);
    return null;
  }
}

/**
 * Resolve all bottles for a dispatch entry.
 * Entry-level grouping: collects all unique plain bottle names from entry.items[].bottleId,
 * skipping items with no bottleId (lines inherit from entry).
 *
 * @param {Object} dispatchEntry - Dispatch document with items
 * @returns {Promise<string[]>} - Array of normalized plain bottle names (unique, sorted)
 */
async function resolveEntryBottles(dispatchEntry) {
  if (!dispatchEntry || !dispatchEntry.items) return [];
  
  const plainNames = new Set();
  
  for (const item of dispatchEntry.items) {
    if (item.bottleId) {
      const plainName = await resolveBottleToPlainName(item.bottleId);
      if (plainName) {
        plainNames.add(plainName);
      }
    }
  }
  
  return Array.from(plainNames).sort();
}

module.exports = {
  normalizeBottleName,
  resolveBottleToPlainName,
  resolveEntryBottles
};
