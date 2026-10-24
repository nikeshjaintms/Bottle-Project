/**
 * Generates official Shayona Delivery Challan HTML document with multi-page pagination support.
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

function buildHeaderHtml() {
  return `
    <div class="challan-header">
      <img class="challan-logo" src="${getChallanLogoDataUri()}" alt="Shayona Glass Decor logo">
      <div class="company-name">SHAYONA GLASS DECOR PVT. LTD.</div>
      <div class="company-sub">Plot.no-128,At &amp; Post Vavdi, Ta. Jambusar, Dist : Bharuch, 392150</div>
      <div class="company-gst">GSTIN NO:-24AAUCS9498K1Z5</div>
      <div class="doc-title">DELIVERY CHALLAN</div>
    </div>
  `;
}

function buildMetaGridHtml(c) {
  const dateTimeStr = [formatDate(c.challanDate), c.challanTime].filter(Boolean).join(' &amp; ');
  const billedTo = c.billedTo || {};
  const shippedTo = c.shippedTo || {};

  return `
    <table class="meta-table">
      <tr class="meta-row-top">
        <td class="meta-cell meta-cell-left border-bottom-dark">
          <div class="meta-line"><strong>DELIVERY CHALLAN NO : </strong>${escapeHtml(c.challanNo)}</div>
          <div class="meta-line"><strong>DATE &amp; TIME : </strong>${escapeHtml(dateTimeStr)}</div>
          <div class="meta-line"><strong>BUYERS ORDER NO : </strong>${escapeHtml(c.buyersOrderNo || '')}</div>
        </td>
        <td class="meta-cell meta-cell-right border-bottom-dark">
          <div class="meta-line"><strong>DISPATCH THROUGH : </strong>${escapeHtml(c.dispatchThrough || '')}</div>
          <div class="meta-line"><strong>LR.NO : </strong>${escapeHtml(c.lrNo || '')}</div>
          <div class="meta-line"><strong>VEHICLE NO : </strong>${escapeHtml(c.vehicleNo || '')}</div>
        </td>
      </tr>
      <tr class="meta-row-bottom">
        <td class="meta-cell meta-cell-left">
          <div class="meta-section-title">BILLED TO :</div>
          <div class="addr-block">
            <div class="fw-bold">${escapeHtml(billedTo.name || c.companyName || '')}</div>
            ${billedTo.addressTitle ? `<div>${escapeHtml(billedTo.addressTitle)}</div>` : ''}
            ${billedTo.addressLine1 ? `<div>${escapeHtml(billedTo.addressLine1)}</div>` : ''}
            ${billedTo.addressLine2 ? `<div>${escapeHtml(billedTo.addressLine2)}</div>` : ''}
            ${billedTo.city ? `<div>TALUKA:${escapeHtml(billedTo.city)} DIST.:${escapeHtml(billedTo.city)}-${escapeHtml(billedTo.pincode || '')}</div>` : ''}
            <div>GSTIN NO - ${escapeHtml(billedTo.gstNo || '')}</div>
            <div>STATE NAME:${escapeHtml(billedTo.state || 'GUJARAT')},CODE :${escapeHtml(billedTo.stateCode || '24')}</div>
          </div>
        </td>
        <td class="meta-cell meta-cell-right">
          <div class="meta-section-title">SHIPPED TO :</div>
          <div class="addr-block">
            <div class="fw-bold">${escapeHtml(shippedTo.name || billedTo.name || c.companyName || '')}</div>
            ${shippedTo.addressTitle ? `<div>${escapeHtml(shippedTo.addressTitle)}</div>` : ''}
            ${shippedTo.addressLine1 ? `<div>${escapeHtml(shippedTo.addressLine1)}</div>` : ''}
            ${shippedTo.addressLine2 ? `<div>${escapeHtml(shippedTo.addressLine2)}</div>` : ''}
            ${shippedTo.city ? `<div>TALUKA:${escapeHtml(shippedTo.city)} DIST.:${escapeHtml(shippedTo.city)}-${escapeHtml(shippedTo.pincode || '')}</div>` : ''}
            <div>GSTIN NO - ${escapeHtml(shippedTo.gstNo || billedTo.gstNo || '')}</div>
            <div>STATE NAME:${escapeHtml(shippedTo.state || billedTo.state || 'GUJARAT')},CODE :${escapeHtml(shippedTo.stateCode || billedTo.stateCode || '24')}</div>
          </div>
        </td>
      </tr>
    </table>
  `;
}

function buildFooterHtml(c, isLastPage) {
  const formattedDate = formatDate(c.challanDate);
  const totalBoxes = c.totalBoxes || 0;
  const totalQty = (c.totalQuantity !== undefined && c.totalQuantity !== null) ? Number(c.totalQuantity).toLocaleString('en-IN') : 0;

  return `
    <table class="totals-table">
      <tr>
        <td class="totals-label">TOTAL</td>
        <td class="totals-box">${isLastPage ? totalBoxes : ''}</td>
        <td class="totals-unit"></td>
        <td class="totals-qty">${isLastPage ? totalQty : ''}</td>
      </tr>
    </table>

    <table class="sign-table">
      <tr class="sign-row-top">
        <td class="sign-col-left border-bottom-dark">
          <div class="checked-title"></div>
        </td>
        <td class="sign-col-right border-bottom-dark">
          <div class="mat-issued">MATERIAL ISSUED BY</div>
        </td>
      </tr>
      <tr class="sign-row-bottom">
        <td class="sign-col-left">
          <div class="mb-1"><strong>Checked :-</strong> ${escapeHtml(c.checkedDate || formattedDate)}</div>
          <div class="mb-1"><strong>Date :-</strong> ${escapeHtml(c.checkedDate || formattedDate)}</div>
          <div><strong>Time :-</strong> ${escapeHtml(c.checkedTime || c.challanTime || '')}</div>
        </td>
        <td class="sign-col-right">
          <div class="sign-box">
            <div class="sign-title">SIGNATURE</div>
            <div class="sign-subtitle">Security Office / Signature of Security</div>
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Groups items by spec title, then calculates chunked pages so items don't overflow.
 */
function groupItems(items = []) {
  const groups = [];
  let currentGroup = null;

  items.forEach((item) => {
    const titleKey = (item.title || '').trim();
    if (titleKey && currentGroup && currentGroup.title === titleKey) {
      currentGroup.lines.push(item);
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        title: titleKey,
        lines: [item],
      };
    }
  });
  if (currentGroup) groups.push(currentGroup);
  return groups;
}

/**
 * Splits groups across pages based on estimated row height capacity.
 * First page has ~11 lines capacity due to header/meta.
 * Subsequent pages have ~18 lines capacity.
 */
function paginateGroups(groups) {
  const pages = [];
  let currentPage = [];
  let currentLinesCount = 0;
  const maxLinesFirstPage = 10;
  const maxLinesOtherPages = 17;

  groups.forEach((group) => {
    const linesNeeded = 1 + group.lines.length; // 1 for title header + N variant lines
    const limit = pages.length === 0 ? maxLinesFirstPage : maxLinesOtherPages;

    if (currentLinesCount + linesNeeded > limit && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [group];
      currentLinesCount = linesNeeded;
    } else {
      currentPage.push(group);
      currentLinesCount += linesNeeded;
    }
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

const { generateShrenoChallanHtml } = require('./shrenoChallanHtml');

function generateChallanHtml(challan) {
  const c = challan || {};
  const isShreno = c.challanType === 'shreno' ||
    (c.companyName && c.companyName.toLowerCase().includes('shreno')) ||
    (c.companyId && c.companyId.name && c.companyId.name.toLowerCase().includes('shreno')) ||
    (c.billedTo && c.billedTo.name && c.billedTo.name.toLowerCase().includes('shreno'));

  if (isShreno) {
    return generateShrenoChallanHtml(c);
  }

  const groups = groupItems(c.items || []);
  const pages = paginateGroups(groups);
  const totalPages = pages.length;

  let globalSrNo = 1;

  const pagesHtml = pages.map((pageGroups, pageIdx) => {
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === totalPages - 1;
    const pageNum = pageIdx + 1;

    let rowsHtml = '';

    pageGroups.forEach((grp) => {
      const srNum = globalSrNo++;
      // Spec Title Row
      rowsHtml += `
        <tr class="spec-row">
          <td class="col-sr fw-bold">${srNum}</td>
          <td class="col-desc fw-bold spec-title-text" colspan="4"><u>${escapeHtml(grp.title)}</u></td>
        </tr>
      `;

      // Variant lines
      grp.lines.forEach((line) => {
        rowsHtml += `
          <tr class="variant-row">
            <td class="col-sr"></td>
            <td class="col-desc fw-bold">${escapeHtml(line.description || '')}</td>
            <td class="col-box fw-bold">${escapeHtml(line.box || '')}</td>
            <td class="col-unit">${escapeHtml(line.unit || '')}</td>
            <td class="col-qty fw-bold">${line.total ? Number(line.total).toLocaleString('en-IN') : ''}</td>
          </tr>
        `;
      });
    });

    // Fill blank rows to keep table aesthetic consistent
    const currentRenderedRows = pageGroups.reduce((acc, g) => acc + 1 + g.lines.length, 0);
    const targetRows = isFirstPage ? 11 : 18;
    const blankRowsNeeded = Math.max(0, targetRows - currentRenderedRows);
    for (let b = 0; b < blankRowsNeeded; b++) {
      rowsHtml += `
        <tr class="blank-row">
          <td class="col-sr">&nbsp;</td>
          <td class="col-desc">&nbsp;</td>
          <td class="col-box">&nbsp;</td>
          <td class="col-unit">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
        </tr>
      `;
    }

    return `
      <div class="page-container ${!isLastPage ? 'page-break' : ''}">
        <div class="challan-sheet">
          ${buildHeaderHtml()}
          ${isFirstPage ? buildMetaGridHtml(c) : `
            <div class="continued-header">
              <span><strong>DELIVERY CHALLAN NO :</strong> ${escapeHtml(c.challanNo)}</span>
              <span><strong>BUYER :</strong> ${escapeHtml(c.companyName || '')}</span>
              <span>(Continued from Page ${pageNum - 1})</span>
            </div>
          `}

          <table class="items-table">
            <thead>
              <tr class="th-main">
                <th class="col-sr" rowspan="2">Sr No.</th>
                <th class="col-desc" rowspan="2">DESCRIPTION</th>
                <th class="th-qty-group" colspan="3">QUANTITY</th>
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
      <title>Delivery Challan #${escapeHtml(c.challanNo)}</title>
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
          width: 800px;
          background: #fff;
          border: 2px solid #000 !important;
          outline: 2px solid #000;
          position: relative;
          min-height: 1080px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
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
          top: 5px;
          left: 10px;
          width: 140px;
          height: 92px;
          object-fit: contain;
        }

        .company-name {
          font-size: 21px;
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
          text-decoration: underline;
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

        /* META TABLE */
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          border-bottom: 2px solid #000;
        }

        .meta-cell {
          width: 50%;
          vertical-align: top;
          padding: 6px 10px;
          font-size: 12px;
        }

        .meta-cell-left {
          border-right: 2px solid #000;
        }

        .border-bottom-dark {
          border-bottom: 2px solid #000 !important;
        }

        .meta-line {
          margin-bottom: 3px;
        }

        .meta-section-title {
          font-weight: bold;
          text-decoration: underline;
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
          flex-grow: 1;
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
          padding: 6px 4px;
          vertical-align: middle;
          font-size: 12px;
        }

        .items-table thead tr.th-main th.th-qty-group {
          border-bottom: 1px solid #000;
        }

        .items-table thead tr.th-sub th {
          border-bottom: 2px solid #000;
          padding: 4px;
        }

        .items-table th:last-child, .items-table td:last-child {
          border-right: none;
        }

        .items-table tbody td {
          border-right: 2px solid #000;
          border-bottom: 1px solid #000;
          padding: 4px 6px;
          font-size: 12px;
        }

        .th-qty-group {
          text-align: center;
        }

        .col-sr {
          width: 48px;
          text-align: center;
        }

        .col-desc {
          text-align: left;
          padding-left: 8px !important;
        }

        .spec-title-text {
          font-size: 13px;
          letter-spacing: 0.3px;
        }

        .col-box {
          width: 145px;
          text-align: center;
        }

        .col-unit {
          width: 75px;
          text-align: center;
        }

        .col-qty {
          width: 95px;
          text-align: right;
          padding-right: 10px !important;
        }

        .spec-row td {
          padding-top: 6px;
          padding-bottom: 3px;
          border-bottom: none;
        }

        .variant-row td {
          padding-top: 3px;
          padding-bottom: 4px;
        }

        .blank-row td {
          height: 24px;
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
          padding: 5px 6px;
          font-weight: bold;
          font-size: 13px;
          border-right: 2px solid #000;
        }

        .totals-table td:last-child {
          border-right: none;
        }

        .totals-label {
          text-align: center;
          letter-spacing: 1px;
        }

        .totals-box {
          width: 145px;
          text-align: center;
        }

        .totals-unit {
          width: 75px;
        }

        .totals-qty {
          width: 95px;
          text-align: right;
          padding-right: 10px !important;
        }

        /* SIGNATURE TABLE */
        .sign-table {
          width: 100%;
          border-collapse: collapse;
        }

        .sign-col-left {
          width: 50%;
          padding: 8px 10px;
          font-size: 12px;
          vertical-align: bottom;
          border-right: 2px solid #000;
        }

        .sign-col-right {
          width: 50%;
          padding: 8px 12px;
          text-align: right;
          vertical-align: top;
        }

        .mat-issued {
          font-weight: bold;
          font-size: 11px;
          text-transform: uppercase;
          margin-bottom: 25px;
        }

        .sign-box {
          display: inline-block;
          border-top: 1px solid #000;
          min-width: 200px;
          text-align: center;
          padding-top: 3px;
        }

        .sign-title {
          font-weight: bold;
          font-size: 12px;
        }

        .sign-subtitle {
          font-size: 10px;
          color: #333;
        }

        .page-number-footer {
          text-align: center;
          font-size: 10px;
          color: #666;
          padding: 4px;
          border-top: 1px dashed #ccc;
        }

        /* UTILS */
        .fw-bold { font-weight: bold; }
        .mb-1 { margin-bottom: 3px; }

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
            border: 2px solid #000 !important;
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
  generateChallanHtml,
  groupItems,
  paginateGroups,
};
