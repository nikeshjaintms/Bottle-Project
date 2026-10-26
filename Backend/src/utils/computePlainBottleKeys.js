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

function is24HexObjectId(val) {
  if (!val) return false;
  if (val instanceof mongoose.Types.ObjectId) return true;
  return typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
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
  const itemsToResolve = [];
  
  // Collect all bottle IDs and handle pre-populated objects
  for (const item of items) {
    if (!item) continue;
    if (item.bottleId && typeof item.bottleId === 'object') {
      const bName = item.bottleId.plainBottleName || item.bottleId.bottleName;
      if (bName) {
        const norm = normalizeBottleName(bName);
        if (norm) plainNames.add(norm);
        continue;
      }
      if (item.bottleId._id && is24HexObjectId(item.bottleId._id)) {
        itemsToResolve.push({
          id: String(item.bottleId._id),
          fallback: item.plainBottleName || item.bottleName
        });
        continue;
      }
    } else if (item.bottleId && is24HexObjectId(item.bottleId)) {
      itemsToResolve.push({
        id: String(item.bottleId),
        fallback: item.plainBottleName || item.bottleName
      });
      continue;
    }
    
    // Fallback when bottleId is not a 24-hex ObjectId or missing
    const directName = item.plainBottleName || item.bottleName || (typeof item.bottleId === 'string' ? item.bottleId : null);
    if (directName) {
      const norm = normalizeBottleName(directName);
      if (norm) plainNames.add(norm);
    }
  }
  
  if (itemsToResolve.length > 0) {
    let resolutionMap = masterMap;
    if (!resolutionMap) {
      const BottlePerBox = mongoose.model('BottlePerBox');
      const uniqueIds = [...new Set(itemsToResolve.map(x => x.id))];
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
    
    // Resolve each item with fallback
    for (const { id, fallback } of itemsToResolve) {
      const normalizedName = resolutionMap.get(id) || normalizeBottleName(fallback);
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
