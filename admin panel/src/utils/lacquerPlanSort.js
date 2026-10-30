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

  // 3. Process
  const processA = String(a.process || 'C').trim().toUpperCase();
  const processB = String(b.process || 'C').trim().toUpperCase();
  if (processA !== processB) {
    if (processA < processB) return -1;
    if (processA > processB) return 1;
  }

  // 4. Brand Name
  const brandA = a.brandId?.name || a.brandName;
  const brandB = b.brandId?.name || b.brandName;
  const brandCompare = compareBrands(brandA, brandB);
  if (brandCompare !== 0) return brandCompare;

  // 5. Import Group and Index / GroupId
  const groupA = a.importGroupId || a.groupId ? String(a.importGroupId || a.groupId) : '';
  const groupB = b.importGroupId || b.groupId ? String(b.importGroupId || b.groupId) : '';
  if (groupA && groupB) {
    if (groupA === groupB) {
      const idxA = a.importGroupIndex !== null && a.importGroupIndex !== undefined ? Number(a.importGroupIndex) : null;
      const idxB = b.importGroupIndex !== null && b.importGroupIndex !== undefined ? Number(b.importGroupIndex) : null;
      if (idxA !== null && idxB !== null && idxA !== idxB) {
        return idxA - idxB;
      }
    } else {
      const groupComp = groupA.localeCompare(groupB);
      if (groupComp !== 0) return groupComp;
    }
  } else if (groupA !== groupB) {
    return groupA ? -1 : 1;
  }

  // 6. Saved Row Sequence (rowOrder or rowSeq)
  const orderA = a.rowOrder !== undefined && a.rowOrder !== null ? Number(a.rowOrder) : (a.rowSeq !== undefined && a.rowSeq !== null ? Number(a.rowSeq) : null);
  const orderB = b.rowOrder !== undefined && b.rowOrder !== null ? Number(b.rowOrder) : (b.rowSeq !== undefined && b.rowSeq !== null ? Number(b.rowSeq) : null);
  if (orderA !== null && orderB !== null && orderA !== orderB) {
    return orderA - orderB;
  }
  if (orderA !== null && orderB === null) return -1;
  if (orderA === null && orderB !== null) return 1;

  // 7. Variant Name
  const variantA = a.variantId?.variantName || a.variantName;
  const variantB = b.variantId?.variantName || b.variantName;
  const variantCompare = compareVariants(variantA, variantB);
  if (variantCompare !== 0) return variantCompare;

  // Final deterministic tiebreak
  const idA = String(a._id || '');
  const idB = String(b._id || '');
  return idA.localeCompare(idB);
}
