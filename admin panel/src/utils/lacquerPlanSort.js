import { derivePlainBottleName } from './derivePlainBottleName.js';

/**
 * Normalizes bottle name for canonical grouping
 */
export function normalizeBottleName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bROLL\s+ON\b/g, 'ROLLON')
    .replace(/\bROLL-ON\b/g, 'ROLLON');
}

/**
 * Resolves the canonical plain bottle name for a plan.
 * Fallbacks in order: plainBottle -> plainBottleName -> derivePlainBottleName(bottleName) -> bottleName.
 */
export function getCanonicalPlainBottle(plan) {
  if (!plan) return '';
  const raw = plan.plainBottle || plan.plainBottleName || derivePlainBottleName(plan.bottleName) || plan.bottleName || '';
  return normalizeBottleName(raw);
}

/**
 * Extracts the first numeric value from a bottle name for natural sizing.
 * E.g., "20 ML SAAB" -> 20. If no number is found, returns Infinity to put them at the end.
 */
export function extractBottleSize(bottleName) {
  if (!bottleName) return Infinity;
  const match = String(bottleName).match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return Infinity;
}

/**
 * Natural comparator for Bottle Names based on numeric size then lexical string.
 */
export function compareBottleNames(aName, bName) {
  const sizeA = extractBottleSize(aName);
  const sizeB = extractBottleSize(bName);

  if (sizeA !== sizeB) {
    return sizeA - sizeB;
  }

  // Fallback to alphabetical if same size (or both no size)
  const nameA = String(aName || '').toLowerCase();
  const nameB = String(bName || '').toLowerCase();
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return 0;
}

/**
 * Compare brand names, treating missing brands as coming after valid ones.
 */
export function compareBrands(aBrand, bBrand) {
  if (!aBrand && !bBrand) return 0;
  if (!aBrand) return 1;
  if (!bBrand) return -1;

  const brandA = String(aBrand).toLowerCase();
  const brandB = String(bBrand).toLowerCase();
  if (brandA < brandB) return -1;
  if (brandA > brandB) return 1;
  return 0;
}

/**
 * Compare variant names, treating missing variants as coming after valid ones.
 */
export function compareVariants(aVariant, bVariant) {
  if (!aVariant && !bVariant) return 0;
  if (!aVariant) return 1;
  if (!bVariant) return -1;

  const variantA = String(aVariant).toLowerCase();
  const variantB = String(bVariant).toLowerCase();
  if (variantA < variantB) return -1;
  if (variantA > variantB) return 1;
  return 0;
}

function getCompanyName(p) {
  if (!p) return '';
  if (p.companyName) return String(p.companyName).trim();
  if (p.companyId && typeof p.companyId === 'object' && p.companyId.name) return String(p.companyId.name).trim();
  if (p.companyId && typeof p.companyId === 'object' && p.companyId.companyName) return String(p.companyId.companyName).trim();
  return String(p.canonicalCompanyId || (p.companyId?._id || p.companyId) || '').trim();
}

/**
 * Full hierarchical sort for Lacquer Plans:
 * 1. Company (ensures same bottle from two companies NEVER interleaves)
 * 2. Canonical Plain Bottle (Natural size -> alphabetical, normalized)
 * 3. Brand
 * 4. Process
 * 5. Import Group and Index
 * 6. Saved Row Sequence (rowOrder or createdAt)
 * 7. Variant
 *
 * NOTE: Never sort by orderQty to ensure editing quantities or adding rows does not cause rows to jump.
 */
export function sortLacquerPlans(a, b) {
  // 1. Company
  const compA = getCompanyName(a);
  const compB = getCompanyName(b);
  const compCompare = compA.localeCompare(compB, undefined, { numeric: true, sensitivity: 'base' });
  if (compCompare !== 0) return compCompare;

  // 2. Canonical Plain Bottle (plainBottle || bottleName, normalized)
  const bottleA = getCanonicalPlainBottle(a);
  const bottleB = getCanonicalPlainBottle(b);
  const bottleCompare = compareBottleNames(bottleA, bottleB);
  if (bottleCompare !== 0) return bottleCompare;

  // 3. Brand Name
  const brandA = a.brandId?.name || a.brandName;
  const brandB = b.brandId?.name || b.brandName;
  const brandCompare = compareBrands(brandA, brandB);
  if (brandCompare !== 0) return brandCompare;

  // 4. Server Group Key & Row Sequence
  const gKeyA = a.groupKey ? String(a.groupKey) : '';
  const gKeyB = b.groupKey ? String(b.groupKey) : '';
  if (gKeyA && gKeyB && gKeyA === gKeyB) {
    const seqA = a.rowSeq !== undefined && a.rowSeq !== null ? Number(a.rowSeq) : (a.rowOrder !== undefined ? Number(a.rowOrder) : 0);
    const seqB = b.rowSeq !== undefined && b.rowSeq !== null ? Number(b.rowSeq) : (b.rowOrder !== undefined ? Number(b.rowOrder) : 0);
    if (seqA !== seqB) return seqA - seqB;
  } else if (gKeyA && gKeyB) {
    const gCmp = gKeyA.localeCompare(gKeyB);
    if (gCmp !== 0) return gCmp;
  } else if (gKeyA !== gKeyB) {
    return gKeyA ? -1 : 1;
  }

  // 5. Process
  const processA = String(a.process || 'C').trim().toUpperCase();
  const processB = String(b.process || 'C').trim().toUpperCase();
  if (processA !== processB) {
    if (processA < processB) return -1;
    if (processA > processB) return 1;
  }

  // 6. Import Group and Index
  const groupA = a.importGroupId ? String(a.importGroupId) : '';
  const groupB = b.importGroupId ? String(b.importGroupId) : '';
  if (groupA && groupB) {
    if (groupA === groupB) {
      const idxA = Number(a.importGroupIndex) || 0;
      const idxB = Number(b.importGroupIndex) || 0;
      if (idxA !== idxB) return idxA - idxB;
    } else {
      const groupComp = groupA.localeCompare(groupB);
      if (groupComp !== 0) return groupComp;
    }
  } else if (groupA !== groupB) {
    return groupA ? -1 : 1;
  }

  // 7. Saved Row Sequence (rowOrder or createdAt)
  const orderA = a.rowSeq !== undefined && a.rowSeq !== null ? Number(a.rowSeq) : (a.rowOrder !== undefined && a.rowOrder !== null ? Number(a.rowOrder) : null);
  const orderB = b.rowSeq !== undefined && b.rowSeq !== null ? Number(b.rowSeq) : (b.rowOrder !== undefined && b.rowOrder !== null ? Number(b.rowOrder) : null);
  if (orderA !== null && orderB !== null && orderA !== orderB) {
    return orderA - orderB;
  }
  if (orderA !== null && orderB === null) return -1;
  if (orderA === null && orderB !== null) return 1;

  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (createdA !== createdB) {
    return createdA - createdB;
  }

  // 8. Variant Name
  const variantA = a.variantId?.variantName || a.variantName;
  const variantB = b.variantId?.variantName || b.variantName;
  const variantCompare = compareVariants(variantA, variantB);
  if (variantCompare !== 0) return variantCompare;

  // Final deterministic tiebreak
  const idA = String(a._id || '');
  const idB = String(b._id || '');
  return idA.localeCompare(idB);
}
