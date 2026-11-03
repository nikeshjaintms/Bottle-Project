const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, searchStr, replaceStr) {
  const content = fs.readFileSync(filePath, 'utf8');
  const isCRLF = content.includes('\r\n');
  const normContent = content.replace(/\r\n/g, '\n');
  const normSearch = searchStr.replace(/\r\n/g, '\n');
  const normReplace = replaceStr.replace(/\r\n/g, '\n');

  if (!normContent.includes(normSearch)) {
    console.log(`[SKIP/WARN] Target not found in ${filePath} (may already be patched)`);
    return;
  }

  const updatedNorm = normContent.replace(normSearch, normReplace);
  const finalContent = isCRLF ? updatedNorm.replace(/\n/g, '\r\n') : updatedNorm;
  fs.writeFileSync(filePath, finalContent, 'utf8');
  console.log(`[SUCCESS] Patched ${filePath}`);
}

console.log('--- Applying Remaining Step 3 Changes ---');

// 6. dispatch.controller.js
const dispCtrlPath = 'Backend/src/controllers/dispatch.controller.js';
replaceInFile(
  dispCtrlPath,
`    if (dispatchDate) dispatch.dispatchDate = dispatchDate;
    if (gatePassNo) dispatch.gatePassNo = gatePassNo;
    if (companyId) dispatch.companyId = companyId;
    if (remarks !== undefined) dispatch.remarks = remarks;

    await dispatch.save();`,
`    const wasImported = Boolean(dispatch.isImported);
    if (dispatchDate) dispatch.dispatchDate = dispatchDate;
    if (gatePassNo) dispatch.gatePassNo = gatePassNo;
    if (companyId) dispatch.companyId = companyId;
    if (remarks !== undefined) dispatch.remarks = remarks;
    if (wasImported) dispatch.isImported = true;

    await dispatch.save();`
);

// 7. shrenoIncoming.controller.js
const shrenoCtrlPath = 'Backend/src/controllers/shrenoIncoming.controller.js';
replaceInFile(
  shrenoCtrlPath,
`    const shrenoIncoming = await ShrenoIncoming.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    ).populate('items.plainBottle').populate('items.itemType');`,
`    const existingShreno = await ShrenoIncoming.findById(req.params.id);
    if (existingShreno && existingShreno.isImported) {
      updateData.isImported = true;
    }
    const shrenoIncoming = await ShrenoIncoming.findByIdAndUpdate(
      req.params.id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    ).populate('items.plainBottle').populate('items.itemType');`
);

// 8. reconcileStockScript.js
const reconcileScriptPath = 'Backend/src/scripts/reconcileStockScript.js';
replaceInFile(
  reconcileScriptPath,
`const incomings = await db.collection('incomings').find({ isDeleted: false }).toArray();`,
`const incomings = await db.collection('incomings').find({ isDeleted: false, isImported: { $ne: true } }).toArray();`
);

// 9. summary.controller.js
const summaryCtrlPath = 'Backend/src/controllers/summary.controller.js';
replaceInFile(
  summaryCtrlPath,
`          allIncomingRows.push({
            _id: \`\${inc._id}_\${item._id || allIncomingRows.length}\`,
            docId: inc._id,
            date: docDate,
            challanNo: inc.deliveryNumber || "-",
            poNo: inc.poNo || "-",
            poDate: inc.poDate || null,
            poOrderQty: inc.poOrderQty || null,
            box,
            qty,
            totalQty
          });`,
`          allIncomingRows.push({
            _id: \`\${inc._id}_\${item._id || allIncomingRows.length}\`,
            docId: inc._id,
            date: docDate,
            challanNo: inc.deliveryNumber || "-",
            poNo: inc.poNo || "-",
            poDate: inc.poDate || null,
            poOrderQty: inc.poOrderQty || null,
            box,
            qty,
            totalQty,
            isImported: Boolean(inc.isImported)
          });`
);

replaceInFile(
  summaryCtrlPath,
`          allDispatchRows.push({
            _id: \`\${disp._id}_\${item._id || allDispatchRows.length}\`,
            docId: disp._id,
            date: docDate,
            gatePassNo: disp.gatePassNo || "-",
            dcNo: disp.gatePassNo || "-",
            productName,
            coating: item.coatingShade || "-",
            printing: (item.variantId && item.variantId.variantName) || item.printing || "-",
            detectedTextColor: item.detectedTextColor || (item.printingTypeId && item.printingTypeId.name) || "-",
            type: (item.variantId && item.variantId.variantName) || item.productName || "-",
            box,
            qty,
            totalQty,
            remarks: disp.remarks || item.remarks || "-"
          });`,
`          allDispatchRows.push({
            _id: \`\${disp._id}_\${item._id || allDispatchRows.length}\`,
            docId: disp._id,
            date: docDate,
            gatePassNo: disp.gatePassNo || "-",
            dcNo: disp.gatePassNo || "-",
            productName,
            coating: item.coatingShade || "-",
            printing: (item.variantId && item.variantId.variantName) || item.printing || "-",
            detectedTextColor: item.detectedTextColor || (item.printingTypeId && item.printingTypeId.name) || "-",
            type: (item.variantId && item.variantId.variantName) || item.productName || "-",
            box,
            qty,
            totalQty,
            remarks: disp.remarks || item.remarks || "-",
            isImported: Boolean(disp.isImported)
          });`
);

replaceInFile(
  summaryCtrlPath,
`          allShrenoRows.push({
            _id: \`\${shreno._id}_\${item._id || allShrenoRows.length}\`,
            docId: shreno._id,
            date: docDate,
            challanNo: shreno.challanNo || "-",
            poNo: shreno.poNo || "-",
            poDate: shreno.poDate || null,
            itemType: item.itemType ? (item.itemType.name || "-") : "-",
            configuration: item.configuration || "-",
            qty
          });`,
`          allShrenoRows.push({
            _id: \`\${shreno._id}_\${item._id || allShrenoRows.length}\`,
            docId: shreno._id,
            date: docDate,
            challanNo: shreno.challanNo || "-",
            poNo: shreno.poNo || "-",
            poDate: shreno.poDate || null,
            itemType: item.itemType ? (item.itemType.name || "-") : "-",
            configuration: item.configuration || "-",
            qty,
            isImported: Boolean(shreno.isImported)
          });`
);

console.log('--- All Step 3 Backend changes completed! ---');
