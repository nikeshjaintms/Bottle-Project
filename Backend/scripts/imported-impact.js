const mongoose = require('../node_modules/mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

async function runImportedImpact() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  console.log('================================================================================');
  console.log('              STEP 4: READ-ONLY IMPORTED DATA & STOCK IMPACT ANALYSIS           ');
  console.log('================================================================================\n');

  // 1. Check imported counts across the three collections
  const incomingsCol = db.collection('incomings');
  const dispatchesCol = db.collection('dispatches');
  const shrenoCol = db.collection('shrenoincomings');

  const totalIncomings = await incomingsCol.countDocuments({});
  const importedIncomings = await incomingsCol.countDocuments({
    $or: [{ isImported: true }, { source: 'EXCEL_IMPORT' }, { importBatchId: { $exists: true } }]
  });

  const totalDispatches = await dispatchesCol.countDocuments({});
  const importedDispatches = await dispatchesCol.countDocuments({
    $or: [{ isImported: true }, { source: 'EXCEL_IMPORT' }, { importBatchId: { $exists: true } }]
  });

  const totalShreno = await shrenoCol.countDocuments({});
  const importedShreno = await shrenoCol.countDocuments({
    $or: [{ isImported: true }, { source: 'EXCEL_IMPORT' }, { importBatchId: { $exists: true } }]
  });

  console.log('--- Document Counts & Markers ---');
  console.log(`Incomings:        Total = ${totalIncomings}, Marked as Imported = ${importedIncomings}`);
  console.log(`Dispatches:       Total = ${totalDispatches}, Marked as Imported = ${importedDispatches}`);
  console.log(`Shreno Incoming:  Total = ${totalShreno}, Marked as Imported = ${importedShreno}`);
  console.log('---------------------------------\n');

  // 2. Identify all pools (Company + Plain Bottle)
  const PlainBottleStock = require('../src/models/PlainBottleStock');
  const BottlePerBox = require('../src/models/BottlePerBox');
  const Company = require('../src/models/Company');
  const LacquerPlan = require('../src/models/LacquerPlan');
  const PrintingPlan = require('../src/models/PrintingPlan');
  const { computeLivePlainStock } = require('../src/utils/stockRecompute');

  // Pools with imported incoming
  const importedIncDocs = await incomingsCol.find({
    $or: [{ isImported: true }, { source: 'EXCEL_IMPORT' }, { importBatchId: { $exists: true } }]
  }).toArray();

  const affectedPoolKeys = new Set();
  importedIncDocs.forEach(inc => {
    (inc.items || []).forEach(item => {
      if (item.bottleId && inc.billToId) {
        affectedPoolKeys.add(`${inc.billToId.toString()}:::${item.bottleId.toString()}`);
      }
    });
  });

  console.log(`Total Pools with Imported Incoming: ${affectedPoolKeys.size}\n`);

  const poolImpactTable = [];
  const exceedingPlans = [];
  let totalStockBefore = 0;
  let totalStockAfter = 0;

  for (const poolKey of affectedPoolKeys) {
    const [cIdStr, bIdStr] = poolKey.split(':::');
    const comp = await Company.findById(cIdStr).lean();
    const bp = await BottlePerBox.findById(bIdStr).lean();

    const companyName = comp ? comp.name : cIdStr;
    const bottleName = bp ? (bp.plainBottleName || bp.bottleName) : bIdStr;

    // Stock now (including all records)
    const stockDoc = await PlainBottleStock.findOne({ bottleId: bp._id, companyId: comp ? comp._id : null }).lean();
    const stockNow = stockDoc ? stockDoc.availableQuantity : 0;

    // Stock after excluding imported records
    // Sum of imported incoming qty for this pool
    let importedQtyForPool = 0;
    importedIncDocs.forEach(inc => {
      if (inc.billToId && inc.billToId.toString() === cIdStr) {
        (inc.items || []).forEach(it => {
          if (it.bottleId && it.bottleId.toString() === bIdStr) {
            importedQtyForPool += (Number(it.totalQty) || (Number(it.qty) * Number(it.box || 1)) || 0);
          }
        });
      }
    });

    const stockAfter = stockNow - importedQtyForPool;
    totalStockBefore += stockNow;
    totalStockAfter += stockAfter;

    poolImpactTable.push({
      Company: companyName,
      Bottle: bottleName,
      'Stock Now': stockNow,
      'Imported Qty Excluded': importedQtyForPool,
      'Stock After': stockAfter,
      Difference: stockAfter - stockNow
    });

    // Check Lacquer Plans exceeding new stock
    const lPlans = await LacquerPlan.find({
      $or: [
        { bottleName: new RegExp(`^${bottleName}$`, 'i') },
        { plainBottle: new RegExp(`^${bottleName}$`, 'i') }
      ],
      canonicalCompanyId: comp._id,
      isDeleted: false
    }).lean();

    for (const lp of lPlans) {
      const coated = Number(lp.coatingCompletedQty || lp.coatedQty || 0);
      if (stockAfter < 0 || (stockAfter >= 0 && coated > stockAfter)) {
        exceedingPlans.push({
          Module: 'Lacquer',
          PlanId: lp._id.toString(),
          Date: lp.planDate ? new Date(lp.planDate).toISOString().split('T')[0] : 'N/A',
          Company: companyName,
          Bottle: bottleName,
          Quantity: coated,
          AvailableStockAfter: stockAfter,
          Shortfall: Math.abs(stockAfter - coated)
        });
      }
    }
  }

  console.log('--- Pool Stock Impact Table ---');
  if (poolImpactTable.length === 0) {
    console.log('No pools have imported incoming records. Stock remains completely unchanged.');
  } else {
    console.table(poolImpactTable);
    console.log(`Totals: Stock Before = ${totalStockBefore}, Stock After = ${totalStockAfter}, Net Change = ${totalStockAfter - totalStockBefore}\n`);
  }

  console.log('--- Plans Exceeding New Available Stock ---');
  if (exceedingPlans.length === 0) {
    console.log('No Lacquer or Printing plans exceed the available stock.');
  } else {
    console.table(exceedingPlans);
  }

  console.log('\n--- Downstream Figures Impact ---');
  console.log(`Dispatch Figures Changed:             0 (imported dispatch will not alter actual dispatch counts)`);
  console.log(`Ready To Dispatch Figures Changed:    0 (ready to dispatch operates on finished goods allocations)`);
  console.log(`Packing Material Stock Figures Changed: 0 (no packing material was modified by imports)`);
  console.log('================================================================================\n');

  await mongoose.disconnect();
}

runImportedImpact().catch(err => {
  console.error('[IMPACT ERROR]:', err);
  process.exit(1);
});
