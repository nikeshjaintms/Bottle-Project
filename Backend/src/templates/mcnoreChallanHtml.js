/**
 * Generates official Mcnore (Mcnroe) Delivery Challan HTML document with multi-page pagination support.
 * Supports both "without_po" (Format 1) and "with_po" (Format 2) modes.
 */
const { getChallanLogoDataUri } = require("./challanLogo");

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatCurrency(val) {
  if (val === undefined || val === null || val === '' || isNaN(val)) return '';
  const num = Number(val);
  if (num === 0) return '';
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHeaderHtml() {
  return `
    <div class="challan-header">
      <img class="challan-logo" src="${getChallanLogoDataUri()}" alt="Shayona Glass Decor logo">
      <div class="company-name">SHAYONA GLASS DECOR PVT. LTD.</div>
      <div class="company-sub">Plot.no-128,At &amp; Post Vavli, Ta. Jambusar, Dist : Bharuch, 392150</div>
      <div class="company-gst">GSTIN NO:-24AAUCS9498K1Z5</div>
      <div class="doc-title">DELIVERY CHALLAN</div>
    </div>
  `;
}

function buildMetaGridHtml(c) {
  const isWithPo = c.poMode === 'with_po';
  const billedTo = c.billedTo || {};
  const shippedTo = c.shippedTo || {};
  const formattedDisDate = formatDate(c.challanDate);
  const formattedTaxInvDate = formatDate(c.taxInvoiceDate);
  const poCombined = isWithPo
    ? [c.poNo, formatDate(c.poDate)].filter(Boolean).join(' - ')
    : '';

  return `
    <table class="mcnore-meta-table">
      <tr>
        <td class="mcnore-meta-label">ORIGINAL TAX INVOICE NO:</td>
        <td class="mcnore-meta-val">${escapeHtml(c.taxInvoiceNo || '')}</td>
      </tr>
      ${isWithPo ? `
        <tr>
          <td class="mcnore-meta-label">PO NO &amp; PO DATE:-</td>
          <td class="mcnore-meta-val fw-bold">${escapeHtml(poCombined)}</td>
        </tr>
      ` : `
        <tr>
          <td class="mcnore-meta-label">ORIGINAL TAX INVOICE DATE:</td>
          <td class="mcnore-meta-val">${escapeHtml(formattedTaxInvDate)}</td>
        </tr>
      `}
      <tr>
        <td class="mcnore-meta-label">DC NO:</td>
        <td class="mcnore-meta-val fw-bold">${escapeHtml(c.challanNo)}</td>
      </tr>
      <tr>
        <td class="mcnore-meta-label">Dis Date :</td>
        <td class="mcnore-meta-val">${escapeHtml(formattedDisDate)}</td>
      </tr>
      <tr>
        <td class="mcnore-meta-label">Time:</td>
        <td class="mcnore-meta-val">${escapeHtml(c.challanTime || '')}</td>
      </tr>
      <tr>
        <td class="mcnore-meta-label">Vehical No:</td>
        <td class="mcnore-meta-val fw-bold">${escapeHtml(c.vehicleNo || '')}</td>
      </tr>
      <tr>
        <td class="mcnore-meta-label">Transporter:</td>
        <td class="mcnore-meta-val">${escapeHtml(c.transporter || c.dispatchThrough || '')}</td>
      </tr>
    </table>

    <div class="consignee-bar">CONSIGNEE</div>

    <table class="consignee-table">
      <tr>
        <td class="consignee-col consignee-left">
          <div class="consignee-head">BILLED TO:</div>
          <div class="addr-block">
            <div class="fw-bold">${escapeHtml(billedTo.name || c.companyName || 'MCNROE CONSUMER PRODUCT PVT.LTD')}</div>
            ${billedTo.addressTitle ? `<div>${escapeHtml(billedTo.addressTitle)}</div>` : ''}
            ${billedTo.addressLine1 ? `<div>${escapeHtml(billedTo.addressLine1)}</div>` : ''}
            ${billedTo.addressLine2 ? `<div>${escapeHtml(billedTo.addressLine2)}</div>` : ''}
            ${billedTo.city ? `<div>TALUKA:${escapeHtml(billedTo.city)} DIST.:${escapeHtml(billedTo.city)}-${escapeHtml(billedTo.pincode || '')}</div>` : ''}
            <div>GST NO-${escapeHtml(billedTo.gstNo || '24AABCM5674J1ZA')}</div>
          </div>
        </td>
        <td class="consignee-col consignee-right">
          <div class="consignee-head">${isWithPo ? 'SHIPPED TO:(PLACE OF SUPPLY)' : 'SHIPPED TO:'}</div>
          <div class="addr-block">
            <div class="fw-bold">${escapeHtml(shippedTo.name || billedTo.name || c.companyName || 'MCNROE CONSUMER PRODUCT PVT.LTD')}</div>
            ${shippedTo.addressTitle ? `<div>${escapeHtml(shippedTo.addressTitle)}</div>` : ''}
            ${shippedTo.addressLine1 ? `<div>${escapeHtml(shippedTo.addressLine1)}</div>` : ''}
            ${shippedTo.addressLine2 ? `<div>${escapeHtml(shippedTo.addressLine2)}</div>` : ''}
            ${shippedTo.city ? `<div>TALUKA:${escapeHtml(shippedTo.city)} DIST.:${escapeHtml(shippedTo.city)}-${escapeHtml(shippedTo.pincode || '')}</div>` : ''}
            <div>GST NO-${escapeHtml(shippedTo.gstNo || billedTo.gstNo || '24AABCM5674J1ZA')}</div>
          </div>
        </td>
      </tr>
    </table>
  `;
}

function buildFooterHtml(c, isLastPage) {
  const isWithPo = c.poMode === 'with_po';
  const formattedDate = formatDate(c.challanDate);
  const totalBoxes = c.totalBoxes || 0;
  const totalQty = (c.totalQuantity !== undefined && c.totalQuantity !== null)
    ? Number(c.totalQuantity).toLocaleString('en-IN')
    : 0;

  const glassBottleValStr = formatCurrency(c.glassBottleValue);
  const jobWorkValStr = formatCurrency(c.jobWorkChargesValue);
  const sgstStr = formatCurrency(c.sgst);
  const cgstStr = formatCurrency(c.cgst);
  const igstStr = formatCurrency(c.igst);
  const grandTotalStr = formatCurrency(c.grandTotalValue);

  return `
    ${isLastPage ? `
      <div class="summary-tax-wrapper">
        <table class="summary-tax-table">
          ${!isWithPo ? `
            <tr>
              <td class="tax-label">GLASS BOTTLE VALUE</td>
              <td class="tax-val">${glassBottleValStr}</td>
            </tr>
            <tr>
              <td class="tax-label">JOB WORK CHARGES VALUE</td>
              <td class="tax-val">${jobWorkValStr}</td>
            </tr>
            <tr>
              <td class="tax-label">JOB WORK CHARGES SGST@9%</td>
              <td class="tax-val">${sgstStr}</td>
            </tr>
            <tr>
              <td class="tax-label">JOB WORK CHARGES CGST@9%</td>
              <td class="tax-val">${cgstStr}</td>
            </tr>
            <tr class="tax-total-row">
              <td class="tax-label fw-bold">TOTAL</td>
              <td class="tax-val fw-bold">${grandTotalStr}</td>
            </tr>
          ` : `
            ${igstStr ? `
              <tr>
                <td class="tax-label">IGST@18%</td>
                <td class="tax-val">${igstStr}</td>
              </tr>
            ` : `
              <tr>
                <td class="tax-label">SGST@9%</td>
                <td class="tax-val">${sgstStr}</td>
              </tr>
              <tr>
                <td class="tax-label">CGST@9%</td>
                <td class="tax-val">${cgstStr}</td>
              </tr>
            `}
            <tr class="tax-total-row">
              <td class="tax-label fw-bold">TOTAL</td>
              <td class="tax-val fw-bold">${grandTotalStr}</td>
            </tr>
          `}
        </table>
      </div>
    ` : ''}

    <table class="mcnore-sign-table">
      <tr class="sign-row-top">
        <td class="sign-col-left"></td>
        <td class="sign-col-right">
          <div class="mat-issued">MATERIAL ISSUED BY</div>
        </td>
      </tr>
      <tr class="sign-row-mid">
        <td class="sign-col-left"></td>
        <td class="sign-col-right">
          <div class="sign-box">
            <div class="sign-title">SIGNATURE</div>
            <div class="sign-subtitle">Security Office</div>
          </div>
        </td>
      </tr>
      <tr class="sign-row-bottom">
        <td class="sign-col-left">
          <div><strong>Checked :-</strong> ${escapeHtml(c.checkedBy || '')}</div>
          <div><strong>Date :-</strong> ${escapeHtml(c.checkedDate || formattedDate)}</div>
          <div><strong>Time :-</strong> ${escapeHtml(c.checkedTime || c.challanTime || '')}</div>
        </td>
        <td class="sign-col-right">
          <div class="sign-sec-text">Signature of Security</div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Paginates items for Mcnore Delivery Challan.
 * In Mcnore format, each item produces 2 rows (or more with description).
 * First page holds ~8 item sets (16 rows) due to meta header.
 * Subsequent pages hold ~14 item sets (28 rows).
 */
function paginateMcnoreItems(items = []) {
  const pages = [];
  let currentPage = [];
  let currentRows = 0;
  const maxRowsFirstPage = 12;
  const maxRowsOtherPages = 22;

  items.forEach((item) => {
    // Each item takes 2 table rows
    const rowsNeeded = 2;
    const limit = pages.length === 0 ? maxRowsFirstPage : maxRowsOtherPages;

    if (currentRows + rowsNeeded > limit && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [item];
      currentRows = rowsNeeded;
    } else {
      currentPage.push(item);
      currentRows += rowsNeeded;
    }
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

function formatMaterialCode(code) {
  if (!code || !String(code).trim()) return 'MATERIAL CODE -';
  const clean = String(code).trim();
  if (/^material\s*code\s*[:-]?\s*/i.test(clean)) {
    return clean.replace(/^material\s*code\s*[:-]?\s*/i, 'MATERIAL CODE -').toUpperCase();
  }
  return `MATERIAL CODE -${clean}`;
}

function generateMcnoreChallanHtml(challan) {
  const c = challan || {};
  const isWithPo = c.poMode === 'with_po';
  const items = c.items || [];
  const pages = paginateMcnoreItems(items);
  const totalPages = pages.length;

  let globalSrNo = 1;

  const pagesHtml = pages.map((pageItems, pageIdx) => {
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;
    const pageNum = pageIdx + 1;

    let rowsHtml = '';

    pageItems.forEach((it) => {
      const sr1 = globalSrNo++;
      const sr2 = globalSrNo++;

      const rateStr = it.rate ? formatCurrency(it.rate) : '';
      const taxValStr = it.taxableValue ? formatCurrency(it.taxableValue) : '';
      const jwRateStr = it.jobWorkRate ? formatCurrency(it.jobWorkRate) : '';
      const jwTaxValStr = it.jobWorkTaxableValue ? formatCurrency(it.jobWorkTaxableValue) : '';

      if (isWithPo || it.materialCode) {
        // FORMAT 2: WITH PO / MATERIAL CODE (Format matching MCNORE DC FORMET 2 .xlsx)
        // Row 1: MATERIAL CODE -<codeNumber> (Sr No 1, spanning HSN, Box, Unit, Total)
        // Row 2: GLASS BOTTLE + Spec title + Variant description (Sr No 2)
        const matCodeLabel = formatMaterialCode(it.materialCode);
        rowsHtml += `
          <tr class="item-row item-mat-row">
            <td class="col-sr fw-bold" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${sr1}</td>
            <td class="col-desc fw-bold" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${escapeHtml(matCodeLabel)}</td>
            <td class="col-hsn" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${escapeHtml(it.hsn || '70109000')}</td>
            <td class="col-box fw-bold" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${escapeHtml(it.box || '')}</td>
            <td class="col-unit" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${escapeHtml(it.unit || '')}</td>
            <td class="col-qty fw-bold" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${it.total ? Number(it.total).toLocaleString('en-IN') : ''}</td>
            <td class="col-rate" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${rateStr}</td>
            <td class="col-taxval" style="border-bottom: none; vertical-align: top; padding-top: 5px;">${taxValStr}</td>
          </tr>
          <tr class="item-row item-spec-row">
            <td class="col-sr fw-bold" style="border-top: none; border-bottom: 1px solid #000; vertical-align: top; padding-top: 2px;">${sr2}</td>
            <td class="col-desc" style="border-top: none; border-bottom: 1px solid #000; vertical-align: top; padding-top: 2px; padding-bottom: 6px;">
              <div class="fw-bold">GLASS BOTTLE</div>
              ${it.title ? `<div class="spec-name">${escapeHtml(it.title)}</div>` : ''}
              ${it.description ? `<div class="spec-desc">${escapeHtml(it.description)}</div>` : ''}
            </td>
            <td class="col-hsn" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
            <td class="col-box" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
            <td class="col-unit" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
            <td class="col-qty" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
            <td class="col-rate" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
            <td class="col-taxval" style="border-top: none; border-bottom: 1px solid #000;">&nbsp;</td>
          </tr>
        `;
      } else {
        // FORMAT 1: WITHOUT PO (Legacy Job Work charges)
        rowsHtml += `
          <tr class="item-row item-bottle-row">
            <td class="col-sr fw-bold">${sr1}</td>
            <td class="col-desc fw-bold">GLASS BOTTLE</td>
            <td class="col-hsn">${escapeHtml(it.hsn || '7010')}</td>
            <td class="col-box fw-bold">${escapeHtml(it.box || '')}</td>
            <td class="col-unit">${escapeHtml(it.unit || '')}</td>
            <td class="col-qty fw-bold">${it.total ? Number(it.total).toLocaleString('en-IN') : ''}</td>
            <td class="col-rate">${rateStr}</td>
            <td class="col-taxval">${taxValStr}</td>
          </tr>
          <tr class="item-row item-jw-row">
            <td class="col-sr fw-bold">${sr2}</td>
            <td class="col-desc">
              <div class="fw-bold">JOB WORK CHARGES</div>
              ${it.title ? `<div class="spec-name">${escapeHtml(it.title)}</div>` : ''}
              ${it.description ? `<div class="spec-desc">${escapeHtml(it.description)}</div>` : ''}
            </td>
            <td class="col-hsn">9988</td>
            <td class="col-box"></td>
            <td class="col-unit"></td>
            <td class="col-qty"></td>
            <td class="col-rate">${jwRateStr}</td>
            <td class="col-taxval">${jwTaxValStr}</td>
          </tr>
        `;
      }
    });

    return `
      <div class="page-container ${!isLastPage ? 'page-break' : ''}">
        <div class="challan-sheet">
          ${buildHeaderHtml()}
          ${isFirstPage ? buildMetaGridHtml(c) : `
            <div class="continued-header">
              <span><strong>DELIVERY CHALLAN NO :</strong> ${escapeHtml(c.challanNo)}</span>
              <span><strong>CONSIGNEE :</strong> ${escapeHtml(c.companyName || 'MCNROE CONSUMER PRODUCT PVT.LTD')}</span>
              <span>(Continued from Page ${pageNum - 1})</span>
            </div>
          `}

          <table class="items-table">
            <thead>
              <tr class="th-main">
                <th class="col-sr" rowspan="2">SR.No.</th>
                <th class="col-desc" rowspan="2">DESCRIPTION</th>
                <th class="col-hsn" rowspan="2">HSN/SAC</th>
                <th class="th-qty-group" colspan="3">QUANTITY</th>
                <th class="col-rate" rowspan="2">RATE</th>
                <th class="col-taxval" rowspan="2">TAXABLE<br/>VALUE</th>
              </tr>
              <tr class="th-sub">
                <th class="col-box">BOX</th>
                <th class="col-unit">UNIT</th>
                <th class="col-qty">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td class="col-sr"></td>
                <td class="col-desc totals-label">TOTAL</td>
                <td class="col-hsn"></td>
                <td class="col-box totals-box">${isLastPage ? (c.totalBoxes || 0) : ''}</td>
                <td class="col-unit"></td>
                <td class="col-qty totals-qty">${isLastPage ? ((c.totalQuantity !== undefined && c.totalQuantity !== null) ? Number(c.totalQuantity).toLocaleString('en-IN') : 0) : ''}</td>
                <td class="col-rate"></td>
                <td class="col-taxval"></td>
              </tr>
            </tfoot>
          </table>

          ${buildFooterHtml(c, isLastPage)}

          <div class="page-number-footer">
            Page ${pageNum} of ${totalPages}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Delivery Challan #${escapeHtml(c.challanNo)} - Mcnroe</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background-color: #f3f4f6;
          font-family: "Times New Roman", Times, serif;
          font-size: 13px;
          line-height: 1.3;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page-container {
          display: flex;
          justify-content: center;
          padding: 20px 0;
        }

        .challan-sheet {
          width: 820px;
          background: #fff;
          border: 1px solid #000 !important;
          outline: none;
          position: relative;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .challan-sheet,
        .challan-sheet * {
          border-width: 1px !important;
        }

        /* HEADER */
        .challan-header {
          position: relative;
          text-align: center;
          padding: 8px 12px 6px;
          border-bottom: 2px solid #000;
        }

        .challan-logo {
          position: absolute;
          top: 0;
          left: 0;
          width: 140px;
          height: 92px;
          object-fit: contain;
        }

        .company-name {
          font-size: 20px;
          font-weight: bold;
          color: #00b2ff;
          letter-spacing: 0.5px;
        }

        .company-sub {
          font-size: 11px;
          font-weight: 600;
          margin-top: 2px;
        }

        .company-gst {
          font-size: 12px;
          font-weight: bold;
          margin-top: 1px;
        }

        .doc-title {
          font-size: 14px;
          font-weight: bold;
          letter-spacing: 1px;
          margin-top: 3px;
        }

        /* CONTINUED HEADER */
        .continued-header {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 2px solid #000;
          font-size: 12px;
          background: #fafafa;
        }

        /* META TABLE (LEFT STACK) */
        .mcnore-meta-table {
          width: 100%;
          border-collapse: collapse;
          border-bottom: 2px solid #000;
        }

        .mcnore-meta-table td {
          padding: 3px 8px;
          font-size: 12px;
          border-bottom: 1px solid #000;
        }

        .mcnore-meta-table tr:last-child td {
          border-bottom: none;
        }

        .mcnore-meta-label {
          width: 200px;
          font-weight: bold;
          border-right: 2px solid #000;
        }

        .mcnore-meta-val {
          padding-left: 10px !important;
        }

        /* CONSIGNEE SECTION */
        .consignee-bar {
          text-align: center;
          font-weight: bold;
          font-size: 13px;
          letter-spacing: 1px;
          padding: 3px 0;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          background: #fff;
        }

        .consignee-table {
          width: 100%;
          border-collapse: collapse;
          border-bottom: 2px solid #000;
        }

        .consignee-col {
          width: 50%;
          vertical-align: top;
          padding: 6px 10px;
          font-size: 12px;
        }

        .consignee-left {
          border-right: 2px solid #000;
        }

        .consignee-head {
          font-weight: bold;
          margin-bottom: 3px;
        }

        .addr-block {
          line-height: 1.35;
          text-transform: uppercase;
        }

        /* ITEMS TABLE */
        .items-table {
          width: 100%;
          border-collapse: collapse;
        }

        .items-table thead tr {
          border-bottom: 2px solid #000;
        }

        .items-table thead th {
          border-right: 2px solid #000;
          border-bottom: 2px solid #000;
          background-color: #fff;
          text-align: center;
          font-weight: bold;
          text-transform: uppercase;
          padding: 5px 3px;
          vertical-align: middle;
          font-size: 11px;
        }

        .items-table thead tr.th-main th.th-qty-group {
          border-bottom: 1px solid #000;
          border-right: 2px solid #000 !important;
        }

        .items-table thead tr.th-sub th {
          border-bottom: 2px solid #000;
          border-right: 2px solid #000 !important;
          padding: 3px;
        }

        .items-table thead tr.th-sub th.col-qty {
          border-right: 2px solid #000 !important;
        }

        .items-table thead tr.th-main th.col-taxval,
        .items-table tbody td.col-taxval,
        .items-table tfoot td.col-taxval {
          border-right: none !important;
        }

        .items-table tbody td {
          border-right: 2px solid #000;
          border-bottom: 1px solid #000;
          padding: 3px 5px;
          font-size: 11.5px;
          vertical-align: top;
        }

        .items-table tfoot tr.totals-row td {
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          border-right: 2px solid #000;
          font-weight: bold;
          font-size: 12px;
          padding: 4px 5px;
          vertical-align: middle;
        }

        .col-sr {
          width: 44px;
          text-align: center;
        }

        .col-desc {
          text-align: left;
          padding-left: 6px !important;
        }

        .col-hsn {
          width: 65px;
          text-align: center;
        }

        .col-box {
          width: 100px;
          text-align: center;
        }

        .col-unit {
          width: 55px;
          text-align: center;
        }

        .col-qty {
          width: 80px;
          text-align: right;
          padding-right: 6px !important;
        }

        .col-rate {
          width: 60px;
          text-align: right;
          padding-right: 4px !important;
        }

        .col-taxval {
          width: 80px;
          text-align: right;
          padding-right: 4px !important;
        }

        .spec-name {
          margin-top: 1px;
        }

        .spec-desc {
          margin-top: 1px;
          font-size: 10.5px;
        }

        .blank-row td {
          height: 22px;
          border-bottom: none;
        }

        /* TOTALS TABLE */
        .totals-table {
          width: 100%;
          border-collapse: collapse;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
        }

        .totals-table td {
          padding: 4px 5px;
          font-weight: bold;
          font-size: 12px;
          border-right: 2px solid #000;
        }

        .totals-table td:last-child {
          border-right: none;
        }

        .totals-label {
          text-align: center;
          letter-spacing: 1px;
        }

        .totals-hsn { width: 65px; }
        .totals-box { width: 100px; text-align: center; }
        .totals-unit { width: 55px; }
        .totals-qty { width: 80px; text-align: right; padding-right: 6px !important; }
        .totals-rate { width: 60px; }
        .totals-val { width: 80px; }

        /* SUMMARY TAX WRAPPER */
        .summary-tax-wrapper {
          display: flex;
          justify-content: flex-end;
          border-bottom: 2px solid #000;
        }

        .summary-tax-table {
          width: 320px;
          border-collapse: collapse;
          border-left: 2px solid #000;
        }

        .summary-tax-table td {
          padding: 3px 6px;
          font-size: 11px;
          border-bottom: 1px solid #000;
        }

        .summary-tax-table tr:last-child td {
          border-bottom: none;
        }

        .tax-label {
          font-weight: bold;
          text-align: right;
          border-right: 2px solid #000;
          width: 220px;
        }

        .tax-val {
          text-align: right;
          font-weight: bold;
          width: 100px;
        }

        /* SIGNATURE TABLE */
        .mcnore-sign-table {
          width: 100%;
          border-collapse: collapse;
        }

        .mcnore-sign-table td {
          padding: 4px 8px;
        }

        .sign-col-left {
          width: 55%;
          vertical-align: bottom;
          border-right: 2px solid #000;
          font-size: 11.5px;
          line-height: 1.5;
        }

        .sign-col-right {
          width: 45%;
          text-align: center;
          vertical-align: top;
        }

        .mat-issued {
          font-weight: bold;
          font-size: 11px;
          letter-spacing: 0.5px;
          padding-top: 4px;
        }

        .sign-box {
          display: inline-block;
          margin-top: 15px;
          text-align: center;
          min-width: 160px;
        }

        .sign-title {
          font-weight: bold;
          font-size: 11.5px;
        }

        .sign-subtitle {
          font-size: 10.5px;
          color: #222;
        }

        .sign-sec-text {
          font-size: 11px;
          font-weight: bold;
          margin-top: 12px;
        }

        .page-number-footer {
          text-align: center;
          font-size: 10px;
          color: #666;
          padding: 3px;
          border-top: 1px dashed #ccc;
        }

        /* UTILS */
        .fw-bold { font-weight: bold; }

        /* PRINT / PDF MEDIA STYLES */
        @media print {
          body {
            background-color: #fff;
          }
          .page-container {
            padding: 0;
            display: block;
          }
          .challan-sheet {
            width: 100%;
            min-height: 100vh;
            border: 1px solid #000 !important;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;
}

module.exports = {
  generateMcnoreChallanHtml,
  paginateMcnoreItems,
};
