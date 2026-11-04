/**
 * READ-ONLY AUDIT SCANNER SCRIPT
 * Global rule: No database writes under any circumstance.
 */
const mongoose = require('mongoose');

async function runAuditScanners(targetUri) {
  console.log(`\n======================================================`);
  console.log(`RUNNING READ-ONLY AUDIT SCANNERS ON: ${targetUri}`);
  console.log(`======================================================`);

  const conn = await mongoose.createConnection(targetUri).asPromise();
  const db = conn.db;

  const lacquerColl = db.collection('lacquerplans');
  const printingColl = db.collection('printingplans');
  const rtdColl = db.collection('readytodispatches');
  const stockColl = db.collection('plainbottlestocks');
  const incomingColl = db.collection('incomings');
  const dispatchColl = db.collection('dispatches');
  const bottleColl = db.collection('bottleperboxes');

  const report = {};

  // 1. Allocation sum vs coated quantity (and ready quantity for Printing PLAIN rows)
  console.log('1. Scanning allocation sum vs coatedQty / readyQty...');
  const lacquerRows = await lacquerColl.find({ isDeleted: false }).toArray();
  const cat1_lacquerMismatches = [];
  for (const row of lacquerRows) {
    const coated = Number(row.coatedQty || row.coatingCompletedQty || 0);
    const allocSum = (row.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
    if (coated > 0 && allocSum !== coated) {
      cat1_lacquerMismatches.push({
        _id: row._id,
        planDate: row.planDate,
        bottleName: row.bottleName,
        coatedQty: coated,
        stockAllocationSum: allocSum,
        diff: coated - allocSum
      });
    }
  }

  const printingRows = await printingColl.find({ isDeleted: false }).toArray();
  const cat1_printingMismatches = [];
  for (const row of printingRows) {
    if (row.process === 'PLAIN' || !row.lacquerPlanId) {
      const ready = Number(row.producedQty || 0);
      const allocSum = (row.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
      if (ready > 0 && allocSum !== ready) {
        cat1_printingMismatches.push({
          _id: row._id,
          planDate: row.planDate,
          bottleName: row.bottleName,
          producedQty: ready,
          stockAllocationSum: allocSum,
          diff: ready - allocSum
        });
      }
    }
  }

  report.cat1 = {
    title: 'Allocation Sum vs Coated / Ready Quantity',
    lacquerCount: cat1_lacquerMismatches.length,
    lacquerSamples: cat1_lacquerMismatches.slice(0, 5),
    printingCount: cat1_printingMismatches.length,
    printingSamples: cat1_printingMismatches.slice(0, 5)
  };

  // 2. coatedQty vs coatingCompletedQty vs history sum
  console.log('2. Scanning coatedQty vs coatingCompletedQty vs history sum...');
  const cat2_mismatches = [];
  for (const row of lacquerRows) {
    const c1 = Number(row.coatedQty || 0);
    const c2 = Number(row.coatingCompletedQty || 0);
    const historyCoated = (row.qtyEntries || [])
      .filter(e => e.subType === 'coated' && !e.isDeleted)
      .reduce((sum, e) => sum + (Number(e.qty) || 0), 0);

    if (c1 !== c2 || (row.qtyEntries?.length > 0 && c1 !== historyCoated)) {
      cat2_mismatches.push({
        _id: row._id,
        planDate: row.planDate,
        bottleName: row.bottleName,
        coatedQty: c1,
        coatingCompletedQty: c2,
        historyCoatedSum: historyCoated
      });
    }
  }
  report.cat2 = {
    title: 'coatedQty vs coatingCompletedQty vs History Sum',
    count: cat2_mismatches.length,
    samples: cat2_mismatches.slice(0, 5)
  };

  // 3. carried rows (carriedFromCoatedQty) and double deduction
  console.log('3. Scanning carried rows and double deduction...');
  const cat3_carried = [];
  for (const row of lacquerRows) {
    const carried = Number(row.carriedFromCoatedQty || 0);
    const appliedDeduction = Number(row.appliedStockDeduction || 0);
    if (carried > 0 || row.importedFromId) {
      cat3_carried.push({
        _id: row._id,
        planDate: row.planDate,
        bottleName: row.bottleName,
        carriedFromCoatedQty: carried,
        appliedStockDeduction: appliedDeduction,
        importedFromId: row.importedFromId
      });
    }
  }
  report.cat3 = {
    title: 'Carried Rows and Double Deduction',
    count: cat3_carried.length,
    samples: cat3_carried.slice(0, 5)
  };

  // 4. hidden siblings and soft-removed rows
  console.log('4. Scanning hidden siblings and soft-removed rows...');
  const softRemovedLacquer = await lacquerColl.find({
    $or: [{ isSoftRemoved: true }, { isSibling: true }, { isDeleted: true }]
  }).toArray();
  const softRemovedPrinting = await printingColl.find({
    $or: [{ isDeleted: true }, { isSoftRemoved: true }]
  }).toArray();
  report.cat4 = {
    title: 'Hidden Siblings and Soft-Removed Rows',
    lacquerCount: softRemovedLacquer.length,
    lacquerSamples: softRemovedLacquer.slice(0, 5).map(r => ({ _id: r._id, bottleName: r.bottleName, isDeleted: r.isDeleted, isSoftRemoved: r.isSoftRemoved, isSibling: r.isSibling })),
    printingCount: softRemovedPrinting.length,
    printingSamples: softRemovedPrinting.slice(0, 5).map(r => ({ _id: r._id, bottleName: r.bottleName, isDeleted: r.isDeleted }))
  };

  // 5. orphan or stale links between Lacquer and Printing
  console.log('5. Scanning orphan and stale links between Lacquer and Printing...');
  const cat5_orphanLinks = [];
  for (const pRow of printingRows) {
    if (pRow.lacquerPlanId) {
      const match = await lacquerColl.findOne({ _id: pRow.lacquerPlanId });
      if (!match) {
        cat5_orphanLinks.push({
          printingId: pRow._id,
          lacquerPlanId: pRow.lacquerPlanId,
          reason: 'LacquerPlan document does not exist'
        });
      } else if (match.isDeleted) {
        cat5_orphanLinks.push({
          printingId: pRow._id,
          lacquerPlanId: pRow.lacquerPlanId,
          reason: 'Linked LacquerPlan is marked isDeleted: true'
        });
      }
    }
  }
  report.cat5 = {
    title: 'Orphan or Stale Links Between Lacquer and Printing',
    count: cat5_orphanLinks.length,
    samples: cat5_orphanLinks.slice(0, 5)
  };

  // 6. duplicates by identity
  console.log('6. Scanning duplicates by identity...');
  // In Lacquer: identity is planDate + companyId + brandId + bottleName + coatingShade + process
  const lacquerIdentityMap = new Map();
  const cat6_lacquerDuplicates = [];
  for (const row of lacquerRows) {
    const dStr = row.planDate ? new Date(row.planDate).toISOString().slice(0, 10) : '';
    const key = `${dStr}:::${row.companyId}:::${row.brandId}:::${row.bottleName}:::${row.coatingShade}:::${row.process}`;
    if (lacquerIdentityMap.has(key)) {
      cat6_lacquerDuplicates.push({
        firstId: lacquerIdentityMap.get(key),
        duplicateId: row._id,
        identity: key
      });
    } else {
      lacquerIdentityMap.set(key, row._id);
    }
  }

  // In Printing: identity is planDate + companyId + brandId + bottleName + printingToBeDone
  const printingIdentityMap = new Map();
  const cat6_printingDuplicates = [];
  for (const row of printingRows) {
    const dStr = row.planDate ? new Date(row.planDate).toISOString().slice(0, 10) : '';
    const key = `${dStr}:::${row.companyId}:::${row.brandId}:::${row.bottleName}:::${row.printingToBeDone}`;
    if (printingIdentityMap.has(key)) {
      cat6_printingDuplicates.push({
        firstId: printingIdentityMap.get(key),
        duplicateId: row._id,
        identity: key
      });
    } else {
      printingIdentityMap.set(key, row._id);
    }
  }
  report.cat6 = {
    title: 'Duplicates by Identity',
    lacquerCount: cat6_lacquerDuplicates.length,
    lacquerSamples: cat6_lacquerDuplicates.slice(0, 5),
    printingCount: cat6_printingDuplicates.length,
    printingSamples: cat6_printingDuplicates.slice(0, 5)
  };

  // 7. rows created automatically without an import
  console.log('7. Scanning automatically created rows without import...');
  const cat7_autoRows = [];
  for (const row of printingRows) {
    if (row.process === 'C+P' && !row.importedFromId && row.lacquerPlanId) {
      cat7_autoRows.push({
        _id: row._id,
        planDate: row.planDate,
        bottleName: row.bottleName,
        process: row.process,
        lacquerPlanId: row.lacquerPlanId
      });
    }
  }
  report.cat7 = {
    title: 'Rows Created Automatically Without Import',
    count: cat7_autoRows.length,
    samples: cat7_autoRows.slice(0, 5)
  };

  // 8. imported Incoming/Dispatch/Shreno records still counted in stock
  console.log('8. Scanning imported incoming/dispatch records...');
  const importedIncomings = await incomingColl.find({ isImported: true, isDeleted: false }).toArray();
  const importedDispatches = await dispatchColl.find({ isImported: true, isDeleted: false }).toArray();
  report.cat8 = {
    title: 'Imported Incoming and Dispatch Records',
    importedIncomingCount: importedIncomings.length,
    importedIncomingSamples: importedIncomings.slice(0, 5).map(i => ({ _id: i._id, billToId: i.billToId, itemsCount: i.items?.length })),
    importedDispatchCount: importedDispatches.length,
    importedDispatchSamples: importedDispatches.slice(0, 5).map(d => ({ _id: d._id, companyId: d.companyId, itemsCount: d.items?.length }))
  };

  // 9. deleted bottle masters still referenced
  console.log('9. Scanning deleted bottle masters still referenced...');
  const activeBottleNames = new Set();
  const activeBottles = await bottleColl.find({ isDeleted: false }).toArray();
  for (const b of activeBottles) {
    if (b.plainBottleName) activeBottleNames.add(b.plainBottleName.trim().toUpperCase());
    if (b.bottleName) activeBottleNames.add(b.bottleName.trim().toUpperCase());
    (b.bottleNames || []).forEach(n => activeBottleNames.add(n.trim().toUpperCase()));
  }

  const cat9_unreferencedInLacquer = [];
  for (const row of lacquerRows) {
    const bName = (row.bottleName || '').trim().toUpperCase();
    if (bName && !activeBottleNames.has(bName)) {
      cat9_unreferencedInLacquer.push({ _id: row._id, bottleName: row.bottleName });
    }
  }
  report.cat9 = {
    title: 'Deleted or Missing Bottle Masters Still Referenced',
    count: cat9_unreferencedInLacquer.length,
    samples: cat9_unreferencedInLacquer.slice(0, 5)
  };

  // 10. negative stock or coated quantity above available stock
  console.log('10. Scanning negative stock or excess coated quantities...');
  const negativeStockEntries = await stockColl.find({ quantity: { $lt: 0 } }).toArray();
  const cat10_excessCoated = [];
  for (const row of lacquerRows) {
    const coated = Number(row.coatedQty || 0);
    const stock = Number(row.plainStock || 0);
    if (coated > stock && stock > 0) {
      cat10_excessCoated.push({
        _id: row._id,
        bottleName: row.bottleName,
        coatedQty: coated,
        plainStock: stock,
        excess: coated - stock
      });
    }
  }
  report.cat10 = {
    title: 'Negative Stock or Coated Quantity Above Available Stock',
    negativeStockCount: negativeStockEntries.length,
    negativeStockSamples: negativeStockEntries.slice(0, 5).map(s => ({ _id: s._id, bottleId: s.bottleId, companyId: s.companyId, quantity: s.quantity })),
    excessCoatedCount: cat10_excessCoated.length,
    excessCoatedSamples: cat10_excessCoated.slice(0, 5)
  };

  // 11. Ready To Dispatch quantities that don't match sentToReadyQty
  console.log('11. Scanning Ready To Dispatch quantity mismatches...');
  const cat11_rtdMismatches = [];
  for (const row of lacquerRows) {
    const sentQty = Number(row.sentToReadyQty || 0);
    if (row.readyToDispatch && row.readyToDispatch.sheetId) {
      const sheet = await rtdColl.findOne({ _id: new mongoose.Types.ObjectId(row.readyToDispatch.sheetId) });
      if (!sheet) {
        cat11_rtdMismatches.push({
          planId: row._id,
          sentToReadyQty: sentQty,
          sheetId: row.readyToDispatch.sheetId,
          reason: 'RTD sheet not found'
        });
      }
    }
  }
  for (const row of printingRows) {
    if (row.readyToDispatch && row.readyToDispatch.sheetId) {
      const sheet = await rtdColl.findOne({ _id: new mongoose.Types.ObjectId(row.readyToDispatch.sheetId) });
      if (!sheet) {
        cat11_rtdMismatches.push({
          printingId: row._id,
          sheetId: row.readyToDispatch.sheetId,
          reason: 'RTD sheet not found'
        });
      }
    }
  }
  report.cat11 = {
    title: 'Ready To Dispatch Quantities That Do Not Match sentToReadyQty',
    count: cat11_rtdMismatches.length,
    samples: cat11_rtdMismatches.slice(0, 5)
  };

  console.log(`\n======================================================`);
  console.log(`SCANNER RESULTS FOR ${targetUri}:`);
  console.log(`======================================================`);
  console.log(JSON.stringify(report, null, 2));

  await conn.close();
  return report;
}

const targetUri = process.argv[2] || 'mongodb://127.0.0.1:27020/shayona-test';
runAuditScanners(targetUri).catch(console.error);

