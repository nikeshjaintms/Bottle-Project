/**
 * Generates official Shreno Delivery Challan HTML document matching the exact Shreno format.
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
      <div class="company-sub">Plot.no-128,At &amp; Post Vavli, Ta. Jambusar, Dist : Bharuch, 392150</div>
      <div class="company-gst">GSTIN NO:-24AAUCS9498K1Z5</div>
      <div class="doc-title-row">
        <span class="doc-title">DELIVERY CHALLAN</span>
      </div>
    </div>
  `;
}

function buildMetaGridHtml(c) {
  const challanDateStr = formatDate(c.challanDate);
  const poDateStr = formatDate(c.poDate || c.buyersOrderDate || '');
  const poNoStr = c.poNo || c.buyersOrderNo || '';
  const billedTo = c.billedTo || {};

  const consigneeName = billedTo.name || c.companyName || 'M/S SHRENO LTD';
  const consigneeAddr1 = billedTo.addressLine1 || billedTo.addressTitle || 'ALEMBIC ROAD';
  const consigneeCity = billedTo.city || 'VADODRA';
  const consigneeGst = billedTo.gstNo || '24AABCA7953Q1Z6';

  return `
    <table class="meta-table">
      <tr>
        <td class="meta-cell meta-cell-left">
          <div class="meta-line"><strong>GATE PASS NO:</strong> ${escapeHtml(c.challanNo || '')}</div>
          <div class="meta-line"><strong>P.O. DATE:</strong>${escapeHtml(poDateStr)}</div>
          <div class="meta-line"><strong>P.O. NO.:</strong>${escapeHtml(poNoStr)}</div>
          <div class="meta-line"><strong>Date :</strong>${escapeHtml(challanDateStr)}</div>
          <div class="meta-line"><strong>Time:</strong>${escapeHtml(c.challanTime || '')}</div>
          <div class="meta-line"><strong>VEHICLE NO:</strong> ${escapeHtml(c.vehicleNo || '')}</div>
        </td>
        <td class="meta-cell meta-cell-right">
          <div class="consignee-title">CONSIGNEE</div>
          <div class="consignee-name">${escapeHtml(consigneeName)}</div>
          <div class="consignee-line">${escapeHtml(consigneeAddr1)}</div>
          <div class="consignee-line">${escapeHtml(consigneeCity)}</div>
          <div class="consignee-line"><strong>GSTIN:</strong> ${escapeHtml(consigneeGst)}</div>
        </td>
      </tr>
    </table>
  `;
}

function buildItemsTableHtml(items = [], totalBoxes, totalQuantity) {
  let rowsHtml = '';
  let srNo = 1;

  items.forEach((item) => {
    const boxVal = item.box || item.boxCount || '';
    const unitVal = item.unit || '';
    const totalVal = item.total ? Number(item.total).toLocaleString('en-IN') : '';

    rowsHtml += `
      <tr class="item-row">
        <td class="col-sr fw-bold">${srNo++}</td>
        <td class="col-desc">
          ${item.materialCode ? `<div><u><b>${escapeHtml(item.materialCode)}</b></u></div>` : ''}
          ${item.title ? `<div><u><b>${escapeHtml(item.title)}</b></u></div>` : ''}
          ${item.description ? `<div><b>${escapeHtml(item.description)}</b></div>` : ''}
        </td>
        <td class="col-box fw-bold">${escapeHtml(boxVal)}</td>
        <td class="col-unit fw-bold">${escapeHtml(unitVal)}</td>
        <td class="col-qty fw-bold">${escapeHtml(totalVal)}</td>
      </tr>
    `;
  });

  const totalQtyFormatted = totalQuantity ? Number(totalQuantity).toLocaleString('en-IN') : '0';

  return `
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
        <tr class="totals-row">
          <td class="totals-label" colspan="2">TOTAL</td>
          <td class="col-box fw-bold">${escapeHtml(totalBoxes || 0)}</td>
          <td class="col-unit"></td>
          <td class="col-qty fw-bold">${escapeHtml(totalQtyFormatted)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildFooterHtml(c) {
  const formattedDate = formatDate(c.challanDate);
  const checkedDateStr = c.checkedDate ? formatDate(c.checkedDate) : formattedDate;

  return `
    <div class="footer-wrapper">
      <div class="signatures-section">
        <div class="sign-block-right">
          <div class="mat-issued-title">MATERIAL ISSUED BY</div>
          <div class="mat-sign-space"></div>
          <div class="mat-sign-title">SIGNATURE</div>
        </div>
      </div>

      <table class="security-table">
        <tr>
          <td class="sec-col-left">
            <div><strong>Checked :-</strong> ${escapeHtml(c.checkedBy || '')}</div>
            <div><strong>Date :-</strong> ${escapeHtml(checkedDateStr)}</div>
            <div><strong>Time :-</strong> ${escapeHtml(c.checkedTime || c.challanTime || '')}</div>
          </td>
          <td class="sec-col-right">
            <div class="sec-office-title">Security Office</div>
            <div class="sec-office-space"></div>
            <div class="sec-office-sign">Signature of Security</div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function generateShrenoChallanHtml(challan) {
  const c = challan || {};
  const items = c.items || [];
  const totalBoxes = c.totalBoxes || items.reduce((acc, it) => acc + (Number(it.boxCount) || Number(it.box) || 0), 0);
  const totalQuantity = c.totalQuantity || items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Delivery Challan #${escapeHtml(c.challanNo)} - Shreno</title>
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
          line-height: 1.35;
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
          border: 2px solid #000 !important;
          position: relative;
          min-height: 1080px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        /* HEADER */
        .challan-header {
          position: relative;
          text-align: center;
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
          padding-top: 8px;
        }

        .company-sub {
          font-size: 11px;
          font-weight: bold;
          margin-top: 2px;
        }

        .company-gst {
          font-size: 11px;
          font-weight: bold;
          margin-top: 2px;
          padding-bottom: 6px;
        }

        .doc-title-row {
          border-top: 2px solid #000;
          padding: 5px 0;
        }

        .doc-title {
          font-size: 15px;
          font-weight: bold;
          text-decoration: underline;
          letter-spacing: 1px;
        }

        /* METADATA GRID */
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          border-bottom: 2px solid #000;
        }

        .meta-cell {
          vertical-align: middle;
          padding: 8px 12px;
          font-size: 13px;
        }

        .meta-cell-left {
          width: 50%;
          border-right: 2px solid #000;
          line-height: 1.5;
        }

        .meta-cell-right {
          width: 50%;
          text-align: center;
          line-height: 1.45;
        }

        .meta-line {
          font-weight: bold;
          margin-bottom: 2px;
        }

        .consignee-title {
          font-weight: bold;
          margin-bottom: 3px;
          font-size: 13px;
        }

        .consignee-name {
          font-weight: bold;
          margin-bottom: 3px;
          font-size: 14px;
        }

        .consignee-line {
          font-weight: bold;
          margin-bottom: 2px;
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
          font-size: 13px;
        }

        .items-table thead tr.th-main th.th-qty-group {
          border-bottom: 2px solid #000;
        }

        .items-table thead tr.th-sub th {
          border-bottom: 2px solid #000;
          padding: 4px;
        }

        .items-table th:last-child,
        .items-table td:last-child {
          border-right: none;
        }

        .items-table tbody td {
          border-right: 2px solid #000;
          border-bottom: 2px solid #000;
          padding: 8px 10px;
          font-size: 13px;
        }

        .col-sr {
          width: 60px;
          text-align: center;
          vertical-align: middle;
        }

        .col-desc {
          text-align: left;
          line-height: 1.5;
          vertical-align: middle;
        }

        .col-box {
          width: 110px;
          text-align: center;
          vertical-align: middle;
        }

        .col-unit {
          width: 80px;
          text-align: center;
          vertical-align: middle;
        }

        .col-qty {
          width: 120px;
          text-align: center;
          vertical-align: middle;
        }

        /* TOTALS ROW */
        .totals-row td {
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          padding: 7px 10px;
          font-size: 14px;
        }

        .totals-label {
          text-align: center;
          font-weight: bold;
          letter-spacing: 1.5px;
        }

        /* FOOTER / SIGNATURES */
        .footer-wrapper {
          margin-top: auto;
        }

        .signatures-section {
          padding: 15px 25px 25px;
          display: flex;
          justify-content: flex-end;
          border-bottom: 2px solid #000;
        }

        .sign-block-right {
          text-align: center;
          min-width: 220px;
        }

        .mat-issued-title {
          font-weight: bold;
          font-size: 12px;
          letter-spacing: 0.5px;
        }

        .mat-sign-space {
          height: 45px;
        }

        .mat-sign-title {
          font-weight: bold;
          font-size: 12px;
          letter-spacing: 0.5px;
        }

        /* SECURITY TABLE */
        .security-table {
          width: 100%;
          border-collapse: collapse;
        }

        .sec-col-left {
          width: 50%;
          border-right: 2px solid #000;
          padding: 8px 14px;
          font-size: 12px;
          line-height: 1.7;
          vertical-align: middle;
        }

        .sec-col-right {
          width: 50%;
          text-align: center;
          padding: 8px 14px;
          vertical-align: top;
        }

        .sec-office-title {
          font-weight: bold;
          font-size: 12px;
        }

        .sec-office-space {
          height: 35px;
        }

        .sec-office-sign {
          font-weight: bold;
          font-size: 12px;
        }

        .fw-bold { font-weight: bold; }

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
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        <div class="challan-sheet">
          ${buildHeaderHtml()}
          ${buildMetaGridHtml(c)}
          ${buildItemsTableHtml(items, totalBoxes, totalQuantity)}
          ${buildFooterHtml(c)}
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  generateShrenoChallanHtml,
};
