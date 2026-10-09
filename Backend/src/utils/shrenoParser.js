/**
 * SHRENO-only Printing Plan row parser.
 *
 * This module is ISOLATED to the SHRENO company import path. It must never
 * be imported by, or change behaviour for, any other company's printing
 * plan import.
 *
 * Excel structure for a SHRENO sheet (verified against the real uploaded
 * workbook "9. SHRENO PRINTING PLAN SHEET SEPT-26.xlsx"):
 *   Row 1: title text               -> skip
 *   Row 2: date                     -> skip
 *   Row 3: garbled legacy header    -> skip
 *   Row 4+: data rows
 *     Col A: serial number (1, 2, 3, ...)
 *     Col B: raw product string     -> bottleName + coatingShade + variant
 *     Col C: base printing design   -> printingToBeDone (+ variant suffix)
 *     Col D: text color             -> textColor (verbatim, never touched)
 *     Col E: plain/coloured bottle stock qty (not part of the 4 fields)
 *   Trailing row(s): blank / total  -> skip, never produce MISSING
 */

// Matches a bottle code prefix such as:
//   JR-275            ISR-530-335(DALLAS)      BS-350
//   PSR-550-425 (MIAMI)   T11FC   TS10HB   T12RIB   BM12O   B11RIB   TH10ALG
// A code is: 1-5 letters, optional hyphen, 1-4 digits, optional 0-4 trailing
// letters, optional up to two "-NNN" groups, optional "(NAME)" annotation.
// The negative lookahead `(?!\s*PC\b)` right after the first digit group is
// what tells a real bottle code (BS-350, T11FC, TS10HB...) apart from a
// shade+variant like "PINK-4PC GP" or "GREY-1PC GP", which would otherwise
// match the same letters-digits-letters shape.
const BOTTLE_CODE_REGEX =
  /^([A-Z]{1,5}-?\d{1,4}(?!\s*PC\b)[A-Z]{0,4}(?:-\d{2,4}){0,2}(?:\s*\([A-Z0-9 .&]+\))?)/i;

// Matches a pack-size variant like "2PC GP", "4PC", "3PC BULK".
const VARIANT_REGEX = /(\d+\s*PC(?:\s*(?:GP|BULK))?)/i;

// Trailing parenthetical annotation, e.g. "(TUPPERWARE)".
const TRAILING_PAREN_REGEX = /\s*\(([^)]+)\)\s*$/;

const TOTAL_ROW_REGEX = /^(GRAND\s*TOTAL|SUB\s*TOTAL|NET\s*TOTAL|TOTAL|SUMMARY)\b/i;

function clean(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function stripLeadingSeparators(s) {
  return s.replace(/^[\s-]+/, '').trim();
}

function stripTrailingSeparators(s) {
  return s.replace(/[\s-]+$/, '').trim();
}

/**
 * Classifies a raw Excel row and, for genuine data rows, returns whether it
 * is a header/title/date/total/blank row to be skipped.
 */
function isSkippableRow(colA, colB) {
  const bText = clean(colB);
  if (bText === '') return true; // blank product cell -> blank/total row
  if (TOTAL_ROW_REGEX.test(bText)) return true;
  const aNum = typeof colA === 'number' ? colA : Number(colA);
  const looksLikeSerial = colA !== null && colA !== undefined && colA !== '' && !Number.isNaN(aNum);
  if (!looksLikeSerial) return true; // title / date / garbled header rows
  return false;
}

/**
 * Parses Column B (raw product) into { bottleName, bottleIsNew, coatingShade, variant }.
 * `activeBottleGroup` is the bottle name carried over from the previous row
 * when this row has no bottle-code prefix of its own (a continuation row).
 */
function parseProduct(rawProduct, activeBottleGroup) {
  const raw = clean(rawProduct);
  const codeMatch = raw.match(BOTTLE_CODE_REGEX);

  let bottleName;
  let remainder;
  let bottleIsNew;

  if (codeMatch) {
    bottleName = codeMatch[1].trim();
    remainder = raw.slice(codeMatch[1].length);
    bottleIsNew = true;
  } else {
    bottleName = activeBottleGroup || null;
    remainder = raw;
    bottleIsNew = false;
  }

  remainder = stripLeadingSeparators(remainder);

  // Pull a trailing parenthetical (e.g. "(TUPPERWARE)") off before looking
  // for the variant, so it can be re-attached to the shade afterwards.
  let trailingAnnotation = '';
  const parenMatch = remainder.match(TRAILING_PAREN_REGEX);
  if (parenMatch) {
    trailingAnnotation = parenMatch[1].trim();
    remainder = remainder.slice(0, parenMatch.index);
  }

  let variant = null;
  const variantMatch = remainder.match(VARIANT_REGEX);
  if (variantMatch) {
    variant = variantMatch[1].replace(/\s+/g, ' ').trim();
    remainder = remainder.slice(0, variantMatch.index) + remainder.slice(variantMatch.index + variantMatch[0].length);
  }

  remainder = stripTrailingSeparators(stripLeadingSeparators(remainder));

  let coatingShade = remainder;
  if (trailingAnnotation) {
    coatingShade = coatingShade ? `${coatingShade} (${trailingAnnotation})` : `(${trailingAnnotation})`;
  }

  return {
    bottleName: bottleName || 'MISSING',
    bottleIsNew,
    coatingShade: coatingShade || '',
    variant,
  };
}

function buildPrintingToBeDone(basePrintingText, variant) {
  const base = clean(basePrintingText).replace(/-+$/, '').trim();
  const suffix = variant ? clean(variant) : '';
  if (base && suffix) return `${base} - ${suffix}`;
  if (!base && suffix) return suffix;
  return base;
}

/**
 * Parses one SHRENO sheet (array-of-arrays, 1 row = 1 array, 0-indexed cols
 * A=0, B=1, C=2, D=3) into normalized records.
 * Returns { records, skipped } where skipped lists the row indices (1-based,
 * matching Excel row numbers) that were skipped and why.
 */
function parseShrenoSheet(rows) {
  const records = [];
  const skipped = [];
  let activeBottleGroup = null;
  let sawFirstDataRow = false;
  let consecutiveBlankAfterData = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx] || [];
    const excelRow = idx + 1;
    const colA = row[0];
    const colB = row[1];
    const colC = row[2];
    const colD = row[3];

    if (isSkippableRow(colA, colB)) {
      skipped.push({ excelRow, reason: 'header/blank/total', rawProduct: clean(colB) });
      if (sawFirstDataRow) {
        consecutiveBlankAfterData += 1;
        // Stop once the sheet has clearly run out of data (avoids walking
        // hundreds of trailing blank rows the workbook pads every sheet with).
        if (consecutiveBlankAfterData >= 10) break;
      }
      continue;
    }
    sawFirstDataRow = true;
    consecutiveBlankAfterData = 0;

    const rawProduct = clean(colB);
    const rawPrinting = clean(colC);
    const rawTextColor = clean(colD);

    const { bottleName, bottleIsNew, coatingShade, variant } = parseProduct(rawProduct, activeBottleGroup);

    if (bottleIsNew) {
      activeBottleGroup = bottleName;
    }

    const printingToBeDone = buildPrintingToBeDone(rawPrinting, variant);

    records.push({
      excelRow,
      bottleName,
      coatingShade,
      printingToBeDone,
      textColor: rawTextColor,
      // internal/debug fields - never substitute for the four above
      rawProduct,
      rawPrinting,
      rawTextColor,
      variant,
      bottleGroup: activeBottleGroup,
    });
  }

  return { records, skipped };
}

module.exports = {
  parseShrenoSheet,
  parseProduct,
  buildPrintingToBeDone,
  BOTTLE_CODE_REGEX,
  VARIANT_REGEX,
};
