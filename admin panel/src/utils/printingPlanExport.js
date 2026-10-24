import ExcelJS from 'exceljs';
import { sortPrintingPlans } from './printingPlanSort.js';

// Legacy Gujarati header constants in GHANSHYAM font
export const H_NONSHRENO = [
  'n>br',
  'p\\[iDkT nim',
  'BRAND',
  '(p>ºT)>g krvin&',
  ' ¼l[en/\nklrviL&',
  'bnivvini ai[D<r',
  'bnivvin& bik) b[l[>ºs',
  'bi[ks ni p)s',
  'bnivvini a[iD<r bi[x',
  't]yir Yy[l mil',
  'm[iklvin& bik) mil',
  'v[c[[l mil',
  'r[D) bi[x',
  ' tir)K',
  'r)mi<±s'
];

export const H_SHRENO_FIXED = [
  'n>br',
  'p\\[iDkT nim',
  '(p>\\ºT)>g krvin&',
  'Tiep',
  ' ¼l[en/klrviL&',
  'bnivvini ai[D<r',
  'bnivvin& bik) b[l[>ºs',
  'bi[ks ni p)s',
  'bnivvini a[iD<r bi[x',
  't]yir Yy[l mil',
  'm[iklvini[[ bik) mil',
  'v[c[[l mil',
  'r[D) bi[x'
];

// Exact column widths from templates
export const WIDTHS_NONSHRENO = [
  7.3, 76.9, 31.1, 80.6, 14.0, 16.3, 20.1, 11.6, 17.6, 16.4, 16.3, 15.6, 13.3, 11.6, 12.7
];

export const WIDTHS_SHRENO_FIXED = [
  8.3, 50.6, 58.1, 20.1, 23.0, 17.6, 19.9, 14.1, 17.6, 13.0, 17.1, 15.4, 13.0
];

const FILL_BLUE = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0070C0' }
};

const FILL_GREEN = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF92D050' }
};

const THIN_BORDER = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' }
};

const MEDIUM_BORDER = {
  top: { style: 'medium' },
  bottom: { style: 'medium' },
  left: { style: 'medium' },
  right: { style: 'medium' }
};

function formatDateToDDMMYY(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function parseDateForCell(dateInput) {
  if (!dateInput) return new Date();
  if (typeof dateInput === 'string' && dateInput.includes('T')) {
    const parts = dateInput.split('T')[0].split('-');
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  }
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
    const parts = dateInput.split('-');
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  }
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function sortPackingMaterials(materials) {
  const getCategoryOrder = (name) => {
    const n = name.toUpperCase();
    if (/\d+\s*PC/.test(n)) return 1;
    if (/\bLID\b/.test(n)) return 2;
    if (/\bCAP\b/.test(n)) return 3;
    return 4;
  };
  return [...materials].sort((a, b) => {
    const catA = getCategoryOrder(a);
    const catB = getCategoryOrder(b);
    if (catA !== catB) return catA - catB;
    if (catA === 1) {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      if (numA !== numB) return numA - numB;
      const isBulkA = a.toUpperCase().includes('BULK') ? 1 : 0;
      const isBulkB = b.toUpperCase().includes('BULK') ? 1 : 0;
      return isBulkA - isBulkB;
    }
    if (catA === 2) {
      const sizeA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const sizeB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      if (sizeA !== sizeB) return sizeA - sizeB;
      return a.localeCompare(b);
    }
    return a.localeCompare(b);
  });
}

function isShrenoCompany(compName) {
  return String(compName || '').toUpperCase().includes('SHRENO');
}

function getCompanyFullName(compName) {
  const upper = String(compName || '').trim().toUpperCase();
  if (upper === 'TPP' || upper.includes('PACK PARTNER')) {
    return 'THE PACK PARTNERS';
  }
  return upper;
}

/**
 * Builds NON-SHRENO Workbook (TPP and other non-SHRENO companies)
 */
export async function buildNonShrenoWorkbook({ plans, companies }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shayona Glass Decor';
  wb.created = new Date();

  // Filter out deleted and SHRENO rows
  const activePlans = (plans || []).filter(p => !p.isDeleted && !isShrenoCompany(p.companyId?.name || p.companyName || p.company?.name));

  // Group plans by planDate
  const dateMap = new Map();
  for (const p of activePlans) {
    const dateStr = p.planDate ? (typeof p.planDate === 'string' ? p.planDate.split('T')[0] : new Date(p.planDate).toISOString().split('T')[0]) : 'NO_DATE';
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, []);
    }
    dateMap.get(dateStr).push(p);
  }

  // Sort dates in ascending chronological order
  const sortedDates = Array.from(dateMap.keys()).filter(d => d !== 'NO_DATE').sort();

  for (const dateKey of sortedDates) {
    const sheetPlans = dateMap.get(dateKey);
    if (!sheetPlans || sheetPlans.length === 0) continue;

    const sheetName = formatDateToDDMMYY(dateKey);
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { orientation: 'landscape' },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
    });

    // Set column widths A to O (15 columns)
    WIDTHS_NONSHRENO.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    // Group sheet plans by company
    const companyMap = new Map();
    for (const p of sheetPlans) {
      const cName = p.companyId?.name || p.companyName || p.company?.name || p.brandId?.companyId?.name || p.brandId?.company?.name || 'UNASSIGNED';
      if (!companyMap.has(cName)) {
        companyMap.set(cName, []);
      }
      companyMap.get(cName).push(p);
    }

    // TPP comes first, then others
    const sortedCompanyNames = Array.from(companyMap.keys()).sort((a, b) => {
      const aUpper = a.toUpperCase();
      const bUpper = b.toUpperCase();
      if (aUpper === 'TPP' || aUpper.includes('PACK PARTNER')) return -1;
      if (bUpper === 'TPP' || bUpper.includes('PACK PARTNER')) return 1;
      return a.localeCompare(b);
    });

    let currentRow = 1;

    for (const compName of sortedCompanyNames) {
      const compPlans = companyMap.get(compName) || [];
      if (compPlans.length === 0) continue;

      const sortedRows = [...compPlans].sort(sortPrintingPlans);
      const fullName = getCompanyFullName(compName);
      const totalCols = 15;

      // Row 1: Title Row
      const titleRowNum = currentRow;
      ws.mergeCells(titleRowNum, 1, titleRowNum, totalCols);
      const titleCell = ws.getCell(titleRowNum, 1);
      titleCell.value = `${fullName} - PRINTING PLAN SHEET`;
      titleCell.font = { name: 'Calibri', size: 24, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = FILL_BLUE;
      ws.getRow(titleRowNum).height = 27.75;

      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(titleRowNum, c);
        cell.border = {
          top: { style: 'medium' },
          bottom: { style: 'thin' },
          left: c === 1 ? { style: 'medium' } : undefined,
          right: c === totalCols ? { style: 'medium' } : undefined
        };
      }
      currentRow++;

      // Row 2: Date Row
      const dateRowNum = currentRow;
      ws.mergeCells(dateRowNum, 1, dateRowNum, totalCols);
      const dateCell = ws.getCell(dateRowNum, 1);
      dateCell.value = parseDateForCell(dateKey);
      dateCell.numFmt = '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy';
      dateCell.font = { name: 'Calibri', size: 24, bold: true };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(dateRowNum).height = 32.25;

      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(dateRowNum, c);
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'none' },
          left: c === 1 ? { style: 'medium' } : undefined,
          right: c === totalCols ? { style: 'medium' } : undefined
        };
      }
      currentRow++;

      // Row 3: Header Row
      const headerRowNum = currentRow;
      ws.getRow(headerRowNum).height = 51.75;
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(headerRowNum, c);
        cell.value = H_NONSHRENO[c - 1];
        // Col 3 is 'BRAND', which is in Calibri
        cell.font = {
          name: c === 3 ? 'Calibri' : 'GHANSHYAM',
          size: 18,
          bold: true
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = FILL_GREEN;
        cell.border = {
          top: { style: 'medium' },
          bottom: { style: 'medium' },
          left: c === 1 ? { style: 'medium' } : { style: 'thin' },
          right: c === totalCols ? { style: 'medium' } : { style: 'thin' }
        };
      }
      currentRow++;

      // Group contiguous rows by plain bottle to calculate Rule 8 and vertical merges
      const bottleGroups = [];
      let currentGroup = null;

      sortedRows.forEach(p => {
        const plainBottle = (p.plainBottleName || p.plainBottle || p.bottleName || '').trim().toUpperCase();
        if (!currentGroup || currentGroup.plainBottle !== plainBottle) {
          currentGroup = {
            plainBottle,
            rows: []
          };
          bottleGroups.push(currentGroup);
        }
        currentGroup.rows.push(p);
      });

      const firstDataRow = currentRow;
      let srNo = 1;

      // Write Data Rows
      bottleGroups.forEach(bg => {
        const groupStartRow = currentRow;
        const groupRows = bg.rows;

        groupRows.forEach((p, rIdx) => {
          const rowNum = currentRow;
          ws.getRow(rowNum).height = 51.75;

          const isFirstInBottle = (rIdx === 0);
          const plainBottleName = bg.plainBottle;
          const coatingShade = (p.coatingShade || '').trim().toUpperCase();
          const isPlainShade = (coatingShade === 'PLAIN');

          // Product name logic (Rule 8)
          let productDisplayName = '';
          if (isFirstInBottle) {
            productDisplayName = coatingShade ? `${plainBottleName} - ${coatingShade}` : plainBottleName;
          } else {
            productDisplayName = coatingShade || plainBottleName;
          }

          // Printing to do: <variant>-<text colour> with no spaces around dash
          const variantPart = (p.printingToBeDone || p.variantName || p.variantId?.variantName || '').trim();
          const textColorPart = (p.textColor || '').trim();
          let printingText = '';
          if (variantPart && textColorPart) {
            printingText = `${variantPart}-${textColorPart}`;
          } else {
            printingText = variantPart || textColorPart;
          }

          // Values
          const stockVal = (p.plainBottleStock !== null && p.plainBottleStock !== undefined && p.plainBottleStock !== 0 && p.plainBottleStock !== '') ? Number(p.plainBottleStock) : null;
          const orderVal = (p.orderQty !== null && p.orderQty !== undefined) ? Number(p.orderQty) : null;
          const balanceVal = (p.balanceToMake !== null && p.balanceToMake !== undefined && p.balanceToMake !== 0 && p.balanceToMake !== '') ? Number(p.balanceToMake) : null;
          const boxQtyVal = (p.boxQty !== null && p.boxQty !== undefined && p.boxQty !== 0 && p.boxQty !== '') ? Number(p.boxQty) : null;
          const noOfBoxesVal = (p.noOfBoxes !== null && p.noOfBoxes !== undefined && p.noOfBoxes !== 0 && p.noOfBoxes !== '') ? Number(p.noOfBoxes) : null;
          const readyVal = (p.producedQty !== null && p.producedQty !== undefined && p.producedQty !== 0 && p.producedQty !== '') ? Number(p.producedQty) : null;
          const dispatchVal = (p.dispatchBalance !== null && p.dispatchBalance !== undefined && p.dispatchBalance !== 0 && p.dispatchBalance !== '') ? Number(p.dispatchBalance) : null;
          const soldVal = (p.soldQty !== null && p.soldQty !== undefined && p.soldQty !== 0 && p.soldQty !== '') ? Number(p.soldQty) : null;
          const readyBoxesVal = (p.readyBoxes !== null && p.readyBoxes !== undefined && p.readyBoxes !== 0 && p.readyBoxes !== '') ? Number(p.readyBoxes) : null;

          const rowValues = [
            srNo++,                                              // A: Sr No
            productDisplayName,                                  // B: Product Name
            p.brandId?.name || p.brandName || '',                // C: Brand
            printingText,                                        // D: Printing to do
            stockVal,                                            // E: Stock
            orderVal,                                            // F: Order Qty
            balanceVal,                                          // G: Balance
            boxQtyVal,                                           // H: Bottle per box
            noOfBoxesVal,                                        // I: No of order boxes
            readyVal,                                            // J: Ready printed
            dispatchVal,                                         // K: Balance to dispatch
            soldVal,                                             // L: Sold qty
            readyBoxesVal,                                       // M: Ready boxes
            '',                                                  // N: Date (empty)
            p.remarks || ''                                      // O: Remarks
          ];

          for (let c = 1; c <= totalCols; c++) {
            const cell = ws.getCell(rowNum, c);
            const val = rowValues[c - 1];
            cell.value = (val !== null && val !== undefined && val !== '') ? val : null;

            // Fonts: Col B = 22pt bold, Col D = 20pt bold, other data = 18pt bold
            let fontSize = 18;
            if (c === 2) fontSize = 22;
            if (c === 4) fontSize = 20;

            cell.font = { name: 'Calibri', size: fontSize, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = THIN_BORDER;
          }

          currentRow++;
        });

        const groupEndRow = currentRow - 1;

        // Merges for this bottle group:
        // 1. Bottle per box (Col H / 8): merged vertically across the whole plain bottle group
        if (groupEndRow > groupStartRow) {
          ws.mergeCells(groupStartRow, 8, groupEndRow, 8);
        }

        // 2. Col B (Product name) and Col E (Stock) merges for consecutive PLAIN shade rows
        let plainSubStart = null;
        for (let i = 0; i < groupRows.length; i++) {
          const rowIdx = groupStartRow + i;
          const shade = (groupRows[i].coatingShade || '').trim().toUpperCase();
          if (shade === 'PLAIN') {
            if (plainSubStart === null) plainSubStart = rowIdx;
          } else {
            if (plainSubStart !== null) {
              const plainSubEnd = rowIdx - 1;
              if (plainSubEnd > plainSubStart) {
                ws.mergeCells(plainSubStart, 2, plainSubEnd, 2); // Merge Col B
                ws.mergeCells(plainSubStart, 5, plainSubEnd, 5); // Merge Col E
              }
              plainSubStart = null;
            }
          }
        }
        if (plainSubStart !== null) {
          const plainSubEnd = groupEndRow;
          if (plainSubEnd > plainSubStart) {
            ws.mergeCells(plainSubStart, 2, plainSubEnd, 2); // Merge Col B
            ws.mergeCells(plainSubStart, 5, plainSubEnd, 5); // Merge Col E
          }
        }

        // 3. For coloured shade rows: consecutive rows of the same coloured shade also share stock pool
        let colorSubStart = null;
        let lastColor = null;
        for (let i = 0; i < groupRows.length; i++) {
          const rowIdx = groupStartRow + i;
          const shade = (groupRows[i].coatingShade || '').trim().toUpperCase();
          if (shade !== 'PLAIN' && shade !== '') {
            if (colorSubStart === null) {
              colorSubStart = rowIdx;
              lastColor = shade;
            } else if (shade === lastColor) {
              // continue
            } else {
              const colorSubEnd = rowIdx - 1;
              if (colorSubEnd > colorSubStart) {
                ws.mergeCells(colorSubStart, 5, colorSubEnd, 5);
              }
              colorSubStart = rowIdx;
              lastColor = shade;
            }
          } else {
            if (colorSubStart !== null) {
              const colorSubEnd = rowIdx - 1;
              if (colorSubEnd > colorSubStart) {
                ws.mergeCells(colorSubStart, 5, colorSubEnd, 5);
              }
              colorSubStart = null;
              lastColor = null;
            }
          }
        }
        if (colorSubStart !== null) {
          const colorSubEnd = groupEndRow;
          if (colorSubEnd > colorSubStart) {
            ws.mergeCells(colorSubStart, 5, colorSubEnd, 5);
          }
        }
      });

      const lastDataRow = currentRow - 1;

      // Totals Row
      const totalsRowNum = currentRow;
      ws.getRow(totalsRowNum).height = 33.75;

      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(totalsRowNum, c);
        cell.font = { name: 'Calibri', size: 18, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'medium' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };

        if (c === 5) { // Col E (Stock)
          cell.value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})` };
        } else if (c === 6) { // Col F (Order Qty)
          cell.value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})` };
        } else if (c === 9) { // Col I (Order Boxes)
          cell.value = { formula: `SUM(I${firstDataRow}:I${lastDataRow})` };
        }
      }
      currentRow++;

      // 2 blank rows between stacked blocks
      currentRow += 2;
    }
  }

  return wb;
}

/**
 * Builds SHRENO Workbook (SHRENO company layout with dynamic packing material columns)
 */
export async function buildShrenoWorkbook({ plans }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shayona Glass Decor';
  wb.created = new Date();

  // Filter out deleted and NON-SHRENO rows
  const activePlans = (plans || []).filter(p => !p.isDeleted && isShrenoCompany(p.companyId?.name || p.companyName || p.company?.name));

  // Group plans by planDate
  const dateMap = new Map();
  for (const p of activePlans) {
    const dateStr = p.planDate ? (typeof p.planDate === 'string' ? p.planDate.split('T')[0] : new Date(p.planDate).toISOString().split('T')[0]) : 'NO_DATE';
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, []);
    }
    dateMap.get(dateStr).push(p);
  }

  // Sort dates in ascending chronological order
  const sortedDates = Array.from(dateMap.keys()).filter(d => d !== 'NO_DATE').sort();

  for (const dateKey of sortedDates) {
    const sheetPlans = dateMap.get(dateKey);
    if (!sheetPlans || sheetPlans.length === 0) continue;

    const sheetName = formatDateToDDMMYY(dateKey);
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { orientation: 'landscape' },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
    });

    // Detect dynamic packing materials with non-zero quantity for this date
    const datePackingMaterials = new Set();
    sheetPlans.forEach(p => {
      if (Array.isArray(p.components)) {
        p.components.forEach(c => {
          const type = (c.itemType || c.componentType || '').trim();
          if (type && Number(c.quantity) > 0) {
            datePackingMaterials.add(type);
          }
        });
      }
    });

    const sortedPackingMaterials = sortPackingMaterials(Array.from(datePackingMaterials));

    // Calculate total columns: 13 fixed (A-M) + dynamic packing cols + 1 second-ready-box + 1 remark
    const totalCols = 13 + sortedPackingMaterials.length + 2;

    // Set column widths
    WIDTHS_SHRENO_FIXED.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });
    sortedPackingMaterials.forEach((m, idx) => {
      ws.getColumn(13 + idx + 1).width = 13.5;
    });
    ws.getColumn(13 + sortedPackingMaterials.length + 1).width = 13.0; // second r[D) bi[x
    ws.getColumn(totalCols).width = 13.5;                              // remark

    let currentRow = 1;

    // Row 1: Title Row
    const titleRowNum = currentRow;
    ws.mergeCells(titleRowNum, 1, titleRowNum, totalCols);
    const titleCell = ws.getCell(titleRowNum, 1);
    titleCell.value = ' SHRENO - PRINTING PLAN SHEET ';
    titleCell.font = { name: 'Calibri', size: 28, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = FILL_BLUE;
    ws.getRow(titleRowNum).height = 30.75;

    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(titleRowNum, c);
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'none' },
        left: c === 1 ? { style: 'medium' } : undefined,
        right: c === totalCols ? { style: 'medium' } : undefined
      };
    }
    currentRow++;

    // Row 2: Date Row
    const dateRowNum = currentRow;
    ws.mergeCells(dateRowNum, 1, dateRowNum, totalCols);
    const dateCell = ws.getCell(dateRowNum, 1);
    dateCell.value = parseDateForCell(dateKey);
    dateCell.numFmt = '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy';
    dateCell.font = { name: 'Calibri', size: 26, bold: true };
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(dateRowNum).height = 33.0;

    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(dateRowNum, c);
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'none' },
        left: c === 1 ? { style: 'medium' } : undefined,
        right: c === totalCols ? { style: 'medium' } : undefined
      };
    }
    currentRow++;

    // Row 3: Header Row
    const headerRowNum = currentRow;
    ws.getRow(headerRowNum).height = 73.5;

    // 1. Fixed A-M
    for (let c = 1; c <= 13; c++) {
      const cell = ws.getCell(headerRowNum, c);
      cell.value = H_SHRENO_FIXED[c - 1];
      cell.font = { name: 'GHANSHYAM', size: 20, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = FILL_GREEN;
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: c === 1 ? { style: 'medium' } : { style: 'thin' },
        right: { style: 'thin' }
      };
    }

    // 2. Dynamic packing materials
    sortedPackingMaterials.forEach((matName, idx) => {
      const c = 14 + idx;
      const cell = ws.getCell(headerRowNum, c);
      cell.value = matName;
      cell.font = { name: 'Calibri', size: 20, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = FILL_GREEN;
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'medium' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // 3. Second ready box column
    const secondReadyBoxCol = 14 + sortedPackingMaterials.length;
    const rBoxCell = ws.getCell(headerRowNum, secondReadyBoxCol);
    rBoxCell.value = 'r[D) bi[x';
    rBoxCell.font = { name: 'GHANSHYAM', size: 20, bold: true };
    rBoxCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    rBoxCell.fill = FILL_GREEN;
    rBoxCell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };

    // 4. Remark column
    const remarkCell = ws.getCell(headerRowNum, totalCols);
    remarkCell.value = 'remark';
    remarkCell.font = { name: 'Calibri', size: 20, bold: true };
    remarkCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    remarkCell.fill = FILL_GREEN;
    remarkCell.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'medium' }
    };
    currentRow++;

    // Sort sheet plans
    const sortedRows = [...sheetPlans].sort(sortPrintingPlans);

    // Group contiguous rows by bottle code/name
    const bottleGroups = [];
    let currentGroup = null;

    sortedRows.forEach(p => {
      const plainBottle = (p.plainBottleName || p.plainBottle || p.bottleName || '').trim().toUpperCase();
      if (!currentGroup || currentGroup.plainBottle !== plainBottle) {
        currentGroup = {
          plainBottle,
          rows: []
        };
        bottleGroups.push(currentGroup);
      }
      currentGroup.rows.push(p);
    });

    const firstDataRow = currentRow;
    let srNo = 1;

    // Write Data Rows
    bottleGroups.forEach(bg => {
      const groupStartRow = currentRow;
      const groupRows = bg.rows;

      groupRows.forEach((p, rIdx) => {
        const rowNum = currentRow;
        ws.getRow(rowNum).height = 45.0;

        const isFirstInBottle = (rIdx === 0);
        const plainBottleName = bg.plainBottle;
        const coatingShade = (p.coatingShade || '').trim().toUpperCase();

        // Product name logic (Rule 8): For SHRENO, names carry piece type
        let productDisplayName = '';
        if (p.bottleName && p.bottleName.includes('-') && !isFirstInBottle) {
          // If subsequent row has piece type suffix or shade, write that
          productDisplayName = coatingShade || p.bottleName;
        } else if (isFirstInBottle) {
          productDisplayName = coatingShade ? `${plainBottleName} - ${coatingShade}` : (p.bottleName || plainBottleName);
        } else {
          productDisplayName = coatingShade || plainBottleName;
        }

        const stockVal = (p.plainBottleStock !== null && p.plainBottleStock !== undefined && p.plainBottleStock !== 0 && p.plainBottleStock !== '') ? Number(p.plainBottleStock) : null;
        const orderVal = (p.orderQty !== null && p.orderQty !== undefined) ? Number(p.orderQty) : null;
        const balanceVal = (p.balanceToMake !== null && p.balanceToMake !== undefined && p.balanceToMake !== 0 && p.balanceToMake !== '') ? Number(p.balanceToMake) : null;
        const boxQtyVal = (p.boxQty !== null && p.boxQty !== undefined && p.boxQty !== 0 && p.boxQty !== '') ? Number(p.boxQty) : null;
        const noOfBoxesVal = (p.noOfBoxes !== null && p.noOfBoxes !== undefined && p.noOfBoxes !== 0 && p.noOfBoxes !== '') ? Number(p.noOfBoxes) : null;
        const readyVal = (p.producedQty !== null && p.producedQty !== undefined && p.producedQty !== 0 && p.producedQty !== '') ? Number(p.producedQty) : null;
        const dispatchVal = (p.dispatchBalance !== null && p.dispatchBalance !== undefined && p.dispatchBalance !== 0 && p.dispatchBalance !== '') ? Number(p.dispatchBalance) : null;
        const soldVal = (p.soldQty !== null && p.soldQty !== undefined && p.soldQty !== 0 && p.soldQty !== '') ? Number(p.soldQty) : null;
        const readyBoxesVal = (p.readyBoxes !== null && p.readyBoxes !== undefined && p.readyBoxes !== 0 && p.readyBoxes !== '') ? Number(p.readyBoxes) : null;

        const rowValues = [
          srNo++,                                              // A: Sr No
          productDisplayName,                                  // B: Product Name
          p.printingToBeDone || p.variantName || '',           // C: Printing To Be Done (Design Name)
          p.textColor || '',                                   // D: Type (ORGANIC, GOLD FOIL, etc.)
          stockVal,                                            // E: Stock
          orderVal,                                            // F: Order Qty
          balanceVal,                                          // G: Balance
          boxQtyVal,                                           // H: Bottle per box
          noOfBoxesVal,                                        // I: No of order boxes
          readyVal,                                            // J: Ready printed
          dispatchVal,                                         // K: Balance to dispatch
          soldVal,                                             // L: Sold qty
          readyBoxesVal                                        // M: Ready boxes
        ];

        // Dynamic packing materials values
        sortedPackingMaterials.forEach(matName => {
          const compData = p.components?.find(c => (c.itemType || c.componentType) === matName);
          const q = compData && compData.quantity ? Number(compData.quantity) : null;
          rowValues.push(q);
        });

        // Second ready box (empty unless matching field)
        rowValues.push(null);

        // Remark
        rowValues.push(p.remarks || '');

        for (let c = 1; c <= totalCols; c++) {
          const cell = ws.getCell(rowNum, c);
          const val = rowValues[c - 1];
          cell.value = (val !== null && val !== undefined && val !== '') ? val : null;
          cell.font = { name: 'Calibri', size: 20, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = THIN_BORDER;
        }

        currentRow++;
      });

      const groupEndRow = currentRow - 1;

      // Merges for this bottle group:
      // 1. Bottle per box (Col H / 8): merged vertically across the group
      if (groupEndRow > groupStartRow) {
        ws.mergeCells(groupStartRow, 8, groupEndRow, 8);
      }

      // 2. Col E (Stock) merge for consecutive PLAIN shade rows
      let plainSubStart = null;
      for (let i = 0; i < groupRows.length; i++) {
        const rowIdx = groupStartRow + i;
        const shade = (groupRows[i].coatingShade || '').trim().toUpperCase();
        if (shade === 'PLAIN') {
          if (plainSubStart === null) plainSubStart = rowIdx;
        } else {
          if (plainSubStart !== null) {
            const plainSubEnd = rowIdx - 1;
            if (plainSubEnd > plainSubStart) {
              ws.mergeCells(plainSubStart, 5, plainSubEnd, 5);
            }
            plainSubStart = null;
          }
        }
      }
      if (plainSubStart !== null) {
        const plainSubEnd = groupEndRow;
        if (plainSubEnd > plainSubStart) {
          ws.mergeCells(plainSubStart, 5, plainSubEnd, 5);
        }
      }

      // 3. Dynamic packing materials merge across consecutive rows sharing the same non-zero quantity
      sortedPackingMaterials.forEach((matName, mIdx) => {
        const colNum = 14 + mIdx;
        let pStart = null;
        let lastQty = null;

        for (let i = 0; i < groupRows.length; i++) {
          const rowIdx = groupStartRow + i;
          const comp = groupRows[i].components?.find(c => (c.itemType || c.componentType) === matName);
          const qty = comp && comp.quantity ? Number(comp.quantity) : null;

          if (qty !== null && qty > 0) {
            if (pStart === null) {
              pStart = rowIdx;
              lastQty = qty;
            } else if (qty === lastQty) {
              // continue
            } else {
              const pEnd = rowIdx - 1;
              if (pEnd > pStart) {
                ws.mergeCells(pStart, colNum, pEnd, colNum);
              }
              pStart = rowIdx;
              lastQty = qty;
            }
          } else {
            if (pStart !== null) {
              const pEnd = rowIdx - 1;
              if (pEnd > pStart) {
                ws.mergeCells(pStart, colNum, pEnd, colNum);
              }
              pStart = null;
              lastQty = null;
            }
          }
        }
        if (pStart !== null) {
          const pEnd = groupEndRow;
          if (pEnd > pStart) {
            ws.mergeCells(pStart, colNum, pEnd, colNum);
          }
        }
      });
    });

    const lastDataRow = currentRow - 1;

    // Totals Row
    const totalsRowNum = currentRow;
    ws.getRow(totalsRowNum).height = 42.75;

    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(totalsRowNum, c);
      cell.font = { name: 'Calibri', size: 20, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };

      if (c === 5) { // Col E (Stock)
        cell.value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})` };
      } else if (c === 6) { // Col F (Order Qty)
        cell.value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})` };
      } else if (c === 9) { // Col I (Order Boxes)
        cell.value = { formula: `SUM(I${firstDataRow}:I${lastDataRow})` };
      }
    }
    currentRow++;

    // 2 blank rows
    currentRow += 2;
  }

  return wb;
}

/**
 * Triggers a browser download of an ExcelJS workbook buffer.
 */
export async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

/**
 * Main export handler called by the frontend button.
 */
export async function downloadPrintingPlanExcel({ plans, date, fromDate, toDate, companies }) {
  const activePlans = (plans || []).filter(p => !p.isDeleted);
  if (activePlans.length === 0) {
    throw new Error('There is no data to export for the selected filters.');
  }

  const hasShreno = activePlans.some(p => isShrenoCompany(p.companyId?.name || p.companyName || p.company?.name));
  const hasNonShreno = activePlans.some(p => !isShrenoCompany(p.companyId?.name || p.companyName || p.company?.name));

  let dateSuffix = '';
  if (date) dateSuffix = `_${date}`;
  else if (fromDate && toDate) dateSuffix = `_from_${fromDate}_to_${toDate}`;
  else if (fromDate) dateSuffix = `_from_${fromDate}`;
  else if (toDate) dateSuffix = `_to_${toDate}`;

  // Case 1: Both kinds exist in current list -> generate two workbooks
  if (hasNonShreno && hasShreno) {
    const nonShrenoWb = await buildNonShrenoWorkbook({ plans: activePlans, companies });
    await downloadWorkbook(nonShrenoWb, `Printing_Plan${dateSuffix}.xlsx`);

    // Small delay to prevent browser popup block
    await new Promise(r => setTimeout(r, 600));

    const shrenoWb = await buildShrenoWorkbook({ plans: activePlans });
    await downloadWorkbook(shrenoWb, `Printing_Plan_SHRENO${dateSuffix}.xlsx`);
    return;
  }

  // Case 2: Only SHRENO exists
  if (hasShreno) {
    const shrenoWb = await buildShrenoWorkbook({ plans: activePlans });
    await downloadWorkbook(shrenoWb, `Printing_Plan_SHRENO${dateSuffix}.xlsx`);
    return;
  }

  // Case 3: Only NON-SHRENO exists
  const nonShrenoWb = await buildNonShrenoWorkbook({ plans: activePlans, companies });
  await downloadWorkbook(nonShrenoWb, `Printing_Plan${dateSuffix}.xlsx`);
}
