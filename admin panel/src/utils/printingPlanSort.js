export function extractBottleSize(bottleName) {
  if (!bottleName) return Infinity;
  const match = String(bottleName).match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return Infinity;
}

export function compareBottleNames(aName, bName) {
  const sizeA = extractBottleSize(aName);
  const sizeB = extractBottleSize(bName);

  if (sizeA !== sizeB) {
    return sizeA - sizeB;
  }

  const nameA = String(aName || '').toLowerCase();
  const nameB = String(bName || '').toLowerCase();
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return 0;
}

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

export function sortPrintingPlans(a, b) {
  const isShreno = (a.companyId?.name || a.companyName || a.company?.name || '')?.toUpperCase().includes('SHRENO');
  if (isShreno && a.excelRowNumber && b.excelRowNumber) {
      return a.excelRowNumber - b.excelRowNumber;
  }

  // 1. Bottle Name
  const bottleCompare = compareBottleNames(a.bottleName, b.bottleName);
  if (bottleCompare !== 0) return bottleCompare;

  // 1.5. Source Group ID (keeps Excel merged groups strictly contiguous)
  if (a.sourceGroupId && b.sourceGroupId) {
      if (a.sourceGroupId < b.sourceGroupId) return -1;
      if (a.sourceGroupId > b.sourceGroupId) return 1;
  } else if (a.sourceGroupId) {
      return -1;
  } else if (b.sourceGroupId) {
      return 1;
  }

  // 2. Brand Name
  const brandA = a.brandId?.name || a.brandName;
  const brandB = b.brandId?.name || b.brandName;
  const brandCompare = compareBrands(brandA, brandB);
  if (brandCompare !== 0) return brandCompare;

  // 3. Variant / Printing To Be Done
  const varA = String(a.printingToBeDone || '').toLowerCase();
  const varB = String(b.printingToBeDone || '').toLowerCase();
  if (varA < varB) return -1;
  if (varA > varB) return 1;

  // 4. Coating Shade
  const shadeA = String(a.coatingShade || '').toLowerCase();
  const shadeB = String(b.coatingShade || '').toLowerCase();
  if (shadeA < shadeB) return -1;
  if (shadeA > shadeB) return 1;

  // 5. Text Color
  const textA = String(a.textColor || '').toLowerCase();
  const textB = String(b.textColor || '').toLowerCase();
  if (textA < textB) return -1;
  if (textA > textB) return 1;

  return 0;
}
