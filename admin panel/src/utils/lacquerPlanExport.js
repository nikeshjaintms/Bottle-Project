import ExcelJS from 'exceljs';
import { derivePlainBottleName } from './derivePlainBottleName.js';
import { sortLacquerPlans } from './lacquerPlanSort.js';

const GUJARATI_HEADERS = [
  'n>br',
  'p[\\iDkT nim',
  'klr',
  'BRAND',
  'p\\(kyi',
  '¼l[en ATi[k',
  'bnivvini[ ai[D<r ',
  'ki[T)>g Yy[l mil',
  'bnivvin[ibik) mil',
  'm[iklvin& bik) mil',
  'v[c[l mil',
  'bi[ks ni p)s',
  'ai[D<r bi[x ',
  'r)mi<k',
  'tir)K'
];

const COLUMN_WIDTHS_15 = [
  7, 58.57, 44.29, 20.71, 13.29, 13.71, 14.86, 13.86, 15, 12.29, 10.14, 10.57, 12.71, 11.29, 9.14
];

function getPlanDateStr(plan) {
  if (!plan || !plan.planDate) return '';
  const d = new Date(plan.planDate);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function formatDateToSheetName(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y.slice(-2)}`;
}

/**
 * Builds the full ExcelJS Workbook according to the company layout spec.
 * Can be called both in browser and Node.js.
 */
export async function buildLacquerPlanWorkbook(plans, options = {}) {
  const {
    selectedDate = '',
    fromDate = '',
    toDate = '',
    companies = []
  } = options;

  const validPlans = (plans || []).filter(p => !p.isDeleted);
  if (validPlans.length === 0) {
    throw new Error('No data to export');
  }

  // 1. Group plans by date
  const plansByDate = new Map();
  validPlans.forEach(plan => {
    let dateStr = getPlanDateStr(plan);
    if (!dateStr && selectedDate) dateStr = selectedDate;
    if (!dateStr) return;

    if (!plansByDate.has(dateStr)) {
      plansByDate.set(dateStr, []);
    }
    plansByDate.get(dateStr).push(plan);
  });

  const sortedDates = Array.from(plansByDate.keys()).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) {
    throw new Error('No valid dates found in data');
  }

  const workbook = new ExcelJS.Workbook();

  // 2. Iterate each date -> one worksheet per plan date
  for (const dateStr of sortedDates) {
    const datePlans = plansByDate.get(dateStr);
    if (!datePlans || datePlans.length === 0) continue;

    const sheetName = formatDateToSheetName(dateStr);
    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }]
    });

    // Set sheet-level column widths
    COLUMN_WIDTHS_15.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    // Group plans by company for this date
    const plansByCompany = new Map();
    datePlans.forEach(plan => {
      const compId = (plan.canonicalCompanyId || plan.companyId?._id || plan.companyId || 'UNASSIGNED').toString();
      const compName = plan.companyName || plan.company?.name || plan.companyId?.name || (compId === 'UNASSIGNED' ? 'UNASSIGNED' : 'Unassigned');
      if (!plansByCompany.has(compId)) {
        plansByCompany.set(compId, { id: compId, name: compName, plans: [] });
      }
      plansByCompany.get(compId).plans.push(plan);
    });

    // Company sorting: TPP first, then remaining in company order
    const sortedCompanies = Array.from(plansByCompany.values()).sort((a, b) => {
      const isTppA = a.name.toUpperCase().startsWith('TPP') || a.name.toUpperCase() === 'TPP';
      const isTppB = b.name.toUpperCase().startsWith('TPP') || b.name.toUpperCase() === 'TPP';
      if (isTppA && !isTppB) return -1;
      if (!isTppA && isTppB) return 1;

      if (companies && Array.isArray(companies) && companies.length > 0) {
        const idxA = companies.findIndex(c => (c._id || c.id)?.toString() === a.id);
        const idxB = companies.findIndex(c => (c._id || c.id)?.toString() === b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
      }
      return a.name.localeCompare(b.name);
    });

    let currentRow = 1;

    // 3. Stacking blocks per company
    for (let compIdx = 0; compIdx < sortedCompanies.length; compIdx++) {
      const compGroup = sortedCompanies[compIdx];
      const compPlans = [...compGroup.plans].sort(sortLacquerPlans);
      if (compPlans.length === 0) continue;

      // Determine if block has brand
      const hasBrand = compPlans.some(p => {
        const b = p.brandId?.name || p.brandName || '';
        return b && b.trim() !== '' && b.trim() !== '-' && b.trim().toUpperCase() !== 'N/A';
      });

      const totalCols = hasBrand ? 15 : 14;
      const lastColLetter = hasBrand ? 'O' : 'N';

      // --- ROW 1: TITLE ---
      const r1 = currentRow;
      ws.getRow(r1).height = 19.5;
      ws.mergeCells(`A${r1}:${lastColLetter}${r1}`);
      const a1 = ws.getCell(`A${r1}`);
      a1.value = `LACQUER PLANT PLAN SHEET (${compGroup.name.toUpperCase()})`;
      const isTpp = compGroup.name.toUpperCase().startsWith('TPP') || compGroup.name.toUpperCase() === 'TPP';
      a1.font = { name: isTpp ? 'Aptos Narrow' : 'Calibri', size: 16, bold: true };
      a1.alignment = { horizontal: 'center', vertical: 'middle' };
      a1.border = {
        top: { style: 'medium' },
        bottom: { style: 'thin' },
        left: { style: 'medium' },
        right: { style: 'medium' }
      };

      // --- ROW 2: DATE ---
      const r2 = currentRow + 1;
      ws.getRow(r2).height = 21.0;
      ws.mergeCells(`A${r2}:${lastColLetter}${r2}`);
      const a2 = ws.getCell(`A${r2}`);
      const [yr, mo, da] = dateStr.split('-');
      a2.value = new Date(Date.UTC(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(da, 10)));
      a2.font = { name: 'Calibri', size: 20, bold: true };
      a2.alignment = { horizontal: 'center', vertical: 'middle' };
      a2.numFmt = '[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy';
      a2.border = {
        top: { style: 'thin' },
        left: { style: 'medium' },
        right: { style: 'medium' }
      };

      // --- ROW 3: HEADERS ---
      const r3 = currentRow + 2;
      ws.getRow(r3).height = 38.25;

      const headerTexts = hasBrand
        ? GUJARATI_HEADERS
        : GUJARATI_HEADERS.filter((_, i) => i !== 3); // skip BRAND (index 3)

      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(r3, c);
        cell.value = headerTexts[c - 1];
        cell.font = {
          name: (hasBrand && c === 4) ? 'Calibri' : 'GHANSHYAM',
          size: 16,
          bold: true
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'medium' },
          bottom: { style: 'medium' },
          left: c === 1 ? { style: 'medium' } : { style: 'thin' },
          right: c === totalCols ? { style: 'medium' } : { style: 'thin' }
        };
      }

      // --- DATA ROWS ---
      const dataStartRow = currentRow + 3;

      // Group by contiguous plain bottle
      const bottleGroups = [];
      let curGroup = [];
      let curPlain = null;

      compPlans.forEach(plan => {
        const plainBottle = (plan.plainBottle || plan.plainBottleName || derivePlainBottleName(plan.bottleName) || plan.bottleName || '').trim().toUpperCase();
        if (curPlain === null || plainBottle !== curPlain) {
          if (curGroup.length > 0) bottleGroups.push(curGroup);
          curGroup = [plan];
          curPlain = plainBottle;
        } else {
          curGroup.push(plan);
        }
      });
      if (curGroup.length > 0) bottleGroups.push(curGroup);

      let currentDataRow = dataStartRow;
      let blockSrNo = 1;

      for (const group of bottleGroups) {
        const groupStartRow = currentDataRow;
        const groupEndRow = currentDataRow + group.length - 1;

        for (let pIdx = 0; pIdx < group.length; pIdx++) {
          const plan = group[pIdx];
          const rowNum = currentDataRow;
          const srNo = blockSrNo++;

          const plainBottle = (plan.plainBottle || plan.plainBottleName || derivePlainBottleName(plan.bottleName) || plan.bottleName || '').trim();

          let variantText = '';
          if (Array.isArray(plan.variants) && plan.variants.length > 0) {
            variantText = plan.variants.map(v => v.variantName || v.name || v).filter(Boolean).join(', ');
          } else {
            variantText = plan.variantId?.variantName || plan.variantName || '';
          }
          variantText = String(variantText).trim();

          // Product name rule
          let prodName = '';
          if (pIdx === 0) {
            prodName = variantText ? `${plainBottle} - ${variantText}` : plainBottle;
          } else {
            prodName = variantText ? variantText : plainBottle;
          }

          const coatingShade = plan.coatingShade || plan.colour || '';
          const process = plan.process || '';
          const plainStock = (plan.plainStock !== null && plan.plainStock !== undefined) ? plan.plainStock : 0;
          const orderQty = (plan.orderQty !== null && plan.orderQty !== undefined) ? plan.orderQty : '';
          const coatedQty = (plan.coatingCompletedQty ?? plan.coatedQty) || null;
          const dispatchPending = (plan.dispatchPendingQty ?? plan.dispatchBalance) > 0 ? (plan.dispatchPendingQty ?? plan.dispatchBalance) : null;
          const soldQty = plan.soldQty > 0 ? plan.soldQty : null;
          const bottlePerBox = (plan.boxQty !== null && plan.boxQty !== undefined && plan.boxQty > 0) ? plan.boxQty : (plan.bottlePerBox ?? '');
          const orderBoxes = (plan.noOfBoxes !== null && plan.noOfBoxes !== undefined) ? plan.noOfBoxes : '';
          const remarks = plan.remarks || '';

          ws.getRow(rowNum).height = 32.25;

          if (hasBrand) {
            const brand = plan.brandId?.name || plan.brandName || '';
            ws.getCell(rowNum, 1).value = srNo;
            ws.getCell(rowNum, 2).value = prodName;
            ws.getCell(rowNum, 3).value = coatingShade;
            ws.getCell(rowNum, 4).value = brand;
            ws.getCell(rowNum, 5).value = process;
            if (pIdx === 0) ws.getCell(rowNum, 6).value = plainStock;
            ws.getCell(rowNum, 7).value = orderQty;
            if (coatedQty !== null) ws.getCell(rowNum, 8).value = coatedQty;
            if (coatedQty !== null) ws.getCell(rowNum, 9).value = { formula: `H${rowNum}-G${rowNum}` };
            if (dispatchPending !== null) ws.getCell(rowNum, 10).value = dispatchPending;
            if (soldQty !== null) ws.getCell(rowNum, 11).value = soldQty;
            if (pIdx === 0) ws.getCell(rowNum, 12).value = bottlePerBox;
            ws.getCell(rowNum, 13).value = orderBoxes;
            ws.getCell(rowNum, 14).value = remarks;
          } else {
            // Without brand: Brand column shifted out
            ws.getCell(rowNum, 1).value = srNo;
            ws.getCell(rowNum, 2).value = prodName;
            ws.getCell(rowNum, 3).value = coatingShade;
            ws.getCell(rowNum, 4).value = process;
            if (pIdx === 0) ws.getCell(rowNum, 5).value = plainStock;
            ws.getCell(rowNum, 6).value = orderQty;
            if (coatedQty !== null) ws.getCell(rowNum, 7).value = coatedQty;
            if (coatedQty !== null) ws.getCell(rowNum, 8).value = { formula: `G${rowNum}-F${rowNum}` };
            if (dispatchPending !== null) ws.getCell(rowNum, 9).value = dispatchPending;
            if (soldQty !== null) ws.getCell(rowNum, 10).value = soldQty;
            if (pIdx === 0) ws.getCell(rowNum, 11).value = bottlePerBox;
            ws.getCell(rowNum, 12).value = orderBoxes;
            ws.getCell(rowNum, 13).value = remarks;
          }

          // Format non-merged cell borders and styles
          const plainStockCol = hasBrand ? 6 : 5;
          const boxQtyCol = hasBrand ? 12 : 11;
          const processCol = hasBrand ? 5 : 4;

          for (let c = 1; c <= totalCols; c++) {
            const cell = ws.getCell(rowNum, c);
            cell.font = { name: 'Calibri', size: 16, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

            if (c === plainStockCol || c === boxQtyCol || c === processCol) {
              // Merged column cell borders will be set separately
              continue;
            }

            if (rowNum === dataStartRow) {
              cell.border = {
                left: c === 1 ? { style: 'medium' } : { style: 'thin' },
                right: c === totalCols ? { style: 'medium' } : ((hasBrand && c === 11) ? undefined : { style: 'thin' }),
                bottom: c === 2 ? { style: 'thin' } : undefined
              };
            } else {
              cell.border = {
                left: { style: 'thin' },
                right: c === totalCols ? { style: 'medium' } : { style: 'thin' },
                top: { style: 'thin' },
                bottom: { style: 'thin' }
              };
            }
          }

          currentDataRow++;
        }

        // Apply merges for this bottle group
        const plainStockCol = hasBrand ? 6 : 5;
        const boxQtyCol = hasBrand ? 12 : 11;
        const processCol = hasBrand ? 5 : 4;

        // Plain stock merge
        if (groupEndRow > groupStartRow) {
          ws.mergeCells(groupStartRow, plainStockCol, groupEndRow, plainStockCol);
        }
        const mStock = ws.getCell(groupStartRow, plainStockCol);
        mStock.font = { name: 'Calibri', size: 16, bold: true };
        mStock.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        mStock.border = {
          top: groupStartRow === dataStartRow ? { style: 'medium' } : { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Bottle per box merge
        if (groupEndRow > groupStartRow) {
          ws.mergeCells(groupStartRow, boxQtyCol, groupEndRow, boxQtyCol);
        }
        const mBox = ws.getCell(groupStartRow, boxQtyCol);
        mBox.font = { name: 'Calibri', size: 16, bold: true };
        mBox.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        mBox.border = {
          top: groupStartRow === dataStartRow ? { style: 'medium' } : { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };

        // Process merges: merge consecutive rows with same process
        let procStart = groupStartRow;
        let procVal = group[0]?.process || '';
        for (let i = 1; i < group.length; i++) {
          const nextProc = group[i]?.process || '';
          if (nextProc !== procVal) {
            const procEnd = groupStartRow + i - 1;
            if (procEnd > procStart) {
              ws.mergeCells(procStart, processCol, procEnd, processCol);
            }
            const mProc = ws.getCell(procStart, processCol);
            mProc.font = { name: 'Calibri', size: 16, bold: true };
            mProc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            mProc.border = {
              top: procStart === dataStartRow ? { style: 'medium' } : { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' }
            };
            procStart = groupStartRow + i;
            procVal = nextProc;
          }
        }
        const procEnd = groupEndRow;
        if (procEnd > procStart) {
          ws.mergeCells(procStart, processCol, procEnd, processCol);
        }
        const mProc = ws.getCell(procStart, processCol);
        mProc.font = { name: 'Calibri', size: 16, bold: true };
        mProc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        mProc.border = {
          top: procStart === dataStartRow ? { style: 'medium' } : { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      }

      // --- TOTALS ROW ---
      const totalsRow = currentDataRow;
      const lastDataRow = totalsRow - 1;
      ws.getRow(totalsRow).height = 28.5;

      if (hasBrand) {
        ws.getCell(totalsRow, 6).value = { formula: `SUM(F${dataStartRow}:F${lastDataRow})` };
        ws.getCell(totalsRow, 7).value = { formula: `SUM(G${dataStartRow}:G${lastDataRow})` };
        ws.getCell(totalsRow, 13).value = { formula: `SUM(M${dataStartRow}:M${lastDataRow})` };
      } else {
        ws.getCell(totalsRow, 5).value = { formula: `SUM(E${dataStartRow}:E${lastDataRow})` };
        ws.getCell(totalsRow, 6).value = { formula: `SUM(F${dataStartRow}:F${lastDataRow})` };
        ws.getCell(totalsRow, 12).value = { formula: `SUM(L${dataStartRow}:L${lastDataRow})` };
      }

      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(totalsRow, c);
        cell.font = { name: 'Calibri', size: 16, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'medium' },
          bottom: { style: 'medium' },
          left: c === 1 ? { style: 'medium' } : { style: 'thin' },
          right: c === totalCols ? { style: 'medium' } : { style: 'thin' }
        };
      }

      // Next block begins after 2 blank rows
      currentRow = totalsRow + 3;
    }
  }

  return workbook;
}

/**
 * Browser download helper
 */
export async function downloadLacquerPlanExcel(plans, options = {}) {
  const workbook = await buildLacquerPlanWorkbook(plans, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  let filename = 'Lacquer_Plan';
  if (options.selectedDate) filename += `_${options.selectedDate}`;
  if (options.fromDate) filename += `_from_${options.fromDate}`;
  if (options.toDate) filename += `_to_${options.toDate}`;
  filename += '.xlsx';

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
