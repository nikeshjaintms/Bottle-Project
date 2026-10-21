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

/**
 * Full hierarchical sort for Lacquer Plans:
 * 1. Bottle Name (Natural size -> alphabetical)
 * 2. Brand (Alphabetical)
 * 3. Import Group (Preserves Excel grouping structure for same bottle + brand)
 * 4. Variant (Alphabetical)
 */
export function sortLacquerPlans(a, b) {
  // 1. Plain Bottle (Group all variants belonging to the same plain bottle together)
  const bottleA = a.plainBottle || a.bottleName;
  const bottleB = b.plainBottle || b.bottleName;
  const bottleCompare = compareBottleNames(bottleA, bottleB);
  if (bottleCompare !== 0) return bottleCompare;

  // 2. Brand Name
  const brandA = a.brandId?.name || a.brandName;
  const brandB = b.brandId?.name || b.brandName;
  const brandCompare = compareBrands(brandA, brandB);
  if (brandCompare !== 0) return brandCompare;

  // 3. Process (Group variants of the same bottle by process)
  const processA = String(a.process || 'C').trim().toUpperCase();
  const processB = String(b.process || 'C').trim().toUpperCase();
  if (processA !== processB) {
      if (processA < processB) return -1;
      if (processA > processB) return 1;
  }

  // 4. Import Group (Preserve grouped records together if they share the exact same bottle + brand + process)
  if (a.importGroupId && b.importGroupId && a.importGroupId === b.importGroupId) {
      return (a.importGroupIndex || 0) - (b.importGroupIndex || 0);
  }
  const idA = a.importGroupId || '';
  const idB = b.importGroupId || '';
  if (idA !== idB) {
      if (idA < idB) return -1;
      if (idA > idB) return 1;
  }
  
  const orderQtyA = a.orderQty || 0;
  const orderQtyB = b.orderQty || 0;
  if (orderQtyA !== orderQtyB) return orderQtyA - orderQtyB;

  // 5. Variant Name
  const variantA = a.variantId?.variantName || a.variantName;
  const variantB = b.variantId?.variantName || b.variantName;
  return compareVariants(variantA, variantB);
}
