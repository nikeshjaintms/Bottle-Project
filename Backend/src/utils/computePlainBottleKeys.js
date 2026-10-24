/**
 * Compute plainBottleKeys for a dispatch entry
 * Entry-level grouping: collect all unique plain bottle names from items
 * Uses a batched lookup for efficiency
 */

const mongoose = require('mongoose');

function normalizeBottleName(name) {
  if (!name) return null;
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bROLL\s+ON\b/g, 'ROLLON')
    .replace(/\bROLL-ON\b/g, 'ROLLON');
}

/**
 * Compute plainBottleKeys for an entry (or raw items)
 * @param {Array} items - Array of { bottleId, plainBottleName, ... }
 * @param {Map} masterMap - Map of bottleId string -> normalized plain name (optional for batched lookup)
 * @returns {Promise<String[]>} - Sorted array of normalized plain bottle names
 */
async function computePlainBottleKeys(items, masterMap = null) {
  if (!items || !Array.isArray(items)) return [];
  
  const plainNames = new Set();
  const bottleIdsToResolve = [];
  
  // Collect all bottle IDs and handle pre-populated objects
  for (const item of items) {
    if (!item) continue;
    if (item.bottleId && typeof item.bottleId === 'object' && item.bottleId._id) {
      const bName = item.bottleId.plainBottleName || item.bottleId.bottleName;
      if (bName) {
        const norm = normalizeBottleName(bName);
        if (norm) plainNames.add(norm);
        continue;
      }
      bottleIdsToResolve.push(String(item.bottleId._id));
    } else if (item.bottleId && mongoose.isValidObjectId(item.bottleId)) {
      bottleIdsToResolve.push(String(item.bottleId));
    } else if (item.plainBottleName) {
      const norm = normalizeBottleName(item.plainBottleName);
      if (norm) plainNames.add(norm);
    }
  }
  
  if (bottleIdsToResolve.length > 0) {
    let resolutionMap = masterMap;
    if (!resolutionMap) {
      const BottlePerBox = mongoose.model('BottlePerBox');
      const uniqueIds = [...new Set(bottleIdsToResolve)];
      const masterDocs = await BottlePerBox.find(
        { _id: { $in: uniqueIds.map(id => new mongoose.Types.ObjectId(id)) } },
        'plainBottleName bottleName'
      ).lean();
      
      resolutionMap = new Map();
      masterDocs.forEach(doc => {
        const name = doc.plainBottleName || doc.bottleName;
        resolutionMap.set(String(doc._id), normalizeBottleName(name));
      });
    }
    
    // Resolve each bottleId
    for (const bottleIdStr of bottleIdsToResolve) {
      const normalizedName = resolutionMap.get(bottleIdStr);
      if (normalizedName) {
        plainNames.add(normalizedName);
      }
    }
  }
  
  return Array.from(plainNames).sort();
}

/**
 * Atomically update plainBottleKeys on a dispatch entry (raw driver update)
 * @param {Object} db - mongoose.connection.db
 * @param {String} entryId - Dispatch _id
 * @param {String[]} plainBottleKeys - Array of normalized names
 */
async function updatePlainBottleKeysAtomic(db, entryId, plainBottleKeys) {
  return db.collection('dispatches').updateOne(
    { _id: new mongoose.Types.ObjectId(entryId) },
    { $set: { plainBottleKeys } }
  );
}

module.exports = {
  computePlainBottleKeys,
  updatePlainBottleKeysAtomic,
  normalizeBottleName
};
