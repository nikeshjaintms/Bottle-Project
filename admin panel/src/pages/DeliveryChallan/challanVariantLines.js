const makeEmptyLine = (template = {}, id) => ({
  ...template,
  id: id || `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  variantId: '',
  materialCode: '',
  materialCodeDirty: true,
  description: '',
  box: '',
  fullBox: '',
  looseBox: template.looseBox || '1',
  looseQty: '',
  total: '',
  boxCount: 0,
  rate: '',
  taxableValue: '',
  jobWorkRate: '',
  jobWorkTaxableValue: '',
  remarks: '',
});

export const withTrailingEmptyVariantLine = (lines) => {
  const currentLines = Array.isArray(lines) ? lines : [];
  if (!currentLines.length) return [makeEmptyLine()];
  const lastLine = currentLines[currentLines.length - 1];
  return lastLine.variantId
    ? [...currentLines, makeEmptyLine(lastLine, `empty_after_${lastLine.id}`)]
    : currentLines;
};

export const setChallanVariantLine = (lines, lineIndex, selectedVariant, updateLine) => {
  const nextLines = withTrailingEmptyVariantLine(lines);
  if (lineIndex < 0 || lineIndex >= nextLines.length) return nextLines;
  const variantId = String(selectedVariant?.variantId || '');
  if (variantId && nextLines.some((line, index) =>
    index !== lineIndex && String(line.variantId || '') === variantId
  )) {
    return nextLines;
  }
  nextLines[lineIndex] = updateLine(nextLines[lineIndex], selectedVariant);
  return withTrailingEmptyVariantLine(nextLines);
};
