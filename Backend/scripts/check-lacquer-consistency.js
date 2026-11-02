const mongoose = require('mongoose');

async function checkConsistency() {
  const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shayona-production';
  const conn = await mongoose.createConnection(connStr).asPromise();
  const db = conn.db;

  const lpCol = db.collection('lacquerplans');
  const ppCol = db.collection('printingplans');

  const allLacquer = await lpCol.find({ isDeleted: false }).toArray();
  const allPrinting = await ppCol.find({ isDeleted: false }).toArray();

  const incompA = [];
  const incompB = [];
  const incompC = [];
  const incompD = [];

  for (const lp of allLacquer) {
    const c1 = Number(lp.coatedQty) || 0;
    const c2 = Number(lp.coatingCompletedQty) || 0;
    const allocSum = (lp.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);

    // (A) sum of stockAllocation != coatedQty
    if (lp.stockAllocation && lp.stockAllocation.length > 0) {
      if (allocSum !== c1) {
        incompA.push({
          type: 'Lacquer',
          _id: lp._id.toString(),
          planDate: lp.planDate,
          bottleName: lp.bottleName,
          coatingShade: lp.coatingShade,
          coatedQty: c1,
          allocSum,
          stockAllocation: lp.stockAllocation
        });
      }
    }

    // (B) coatedQty != coatingCompletedQty
    if (lp.coatedQty !== lp.coatingCompletedQty && (lp.coatedQty !== undefined || lp.coatingCompletedQty !== undefined)) {
      incompB.push({
        _id: lp._id.toString(),
        planDate: lp.planDate,
        bottleName: lp.bottleName,
        coatingShade: lp.coatingShade,
        coatedQty: lp.coatedQty,
        coatingCompletedQty: lp.coatingCompletedQty
      });
    }

    // (C) sum of history entries != stored coated quantity
    const coatingEntries = (lp.qtyEntries || []).filter(e => 
      e.subType === 'coated' || e.type === 'coatedQty' || (e.type === 'edit-adjustment' && e.subType === 'coated')
    );
    if (coatingEntries.length > 0 || (lp.coatedQtyInitial !== undefined && lp.coatedQtyInitial !== null)) {
      const activeSum = coatingEntries.filter(e => !e.isDeleted).reduce((sum, e) => {
        if (e.action === 'subtract') return sum - (Number(e.qty) || 0);
        return sum + (Number(e.qty) || 0);
      }, 0);
      const init = (typeof lp.coatedQtyInitial === 'number' && lp.coatedQtyInitial >= 0) ? lp.coatedQtyInitial : 0;
      const historyCoatedSum = init + activeSum;
      if (historyCoatedSum !== c1) {
        incompC.push({
          _id: lp._id.toString(),
          planDate: lp.planDate,
          bottleName: lp.bottleName,
          coatingShade: lp.coatingShade,
          coatedQty: c1,
          historyCoatedSum,
          init,
          activeSum,
          entriesCount: coatingEntries.length
        });
      }
    }

    // (D) plans created by import with coated value in sheet but 0 stored
    if (lp.isImported || lp.importGroupId) {
      if (lp.originalImportedValues && Number(lp.originalImportedValues.coatingCompletedQty || lp.originalImportedValues.coatedQty || 0) > 0 && c1 === 0) {
        incompD.push({
          _id: lp._id.toString(),
          planDate: lp.planDate,
          bottleName: lp.bottleName,
          originalCoated: lp.originalImportedValues.coatingCompletedQty || lp.originalImportedValues.coatedQty,
          storedCoated: c1
        });
      }
    }
  }

  // Also check PLAIN printing rows for A
  for (const pp of allPrinting) {
    const isPlain = !pp.shade || pp.shade.trim().toUpperCase() === 'PLAIN' || pp.shade.trim().toUpperCase() === 'PLAIN BOTTLE';
    if (isPlain) {
      const ready = Number(pp.readyQty) || 0;
      if (pp.stockAllocation && pp.stockAllocation.length > 0) {
        const allocSum = pp.stockAllocation.reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
        if (allocSum !== ready) {
          incompA.push({
            type: 'Printing_PLAIN',
            _id: pp._id.toString(),
            planDate: pp.planDate,
            bottleName: pp.itemName || pp.bottleName,
            shade: pp.shade,
            readyQty: ready,
            allocSum,
            stockAllocation: pp.stockAllocation
          });
        }
      }
    }
  }

  console.log(`Consistency Report:`);
  console.log(`  (A) stockAllocation sum != coatedQty (Lacquer & PLAIN Printing): ${incompA.length}`);
  console.log(`  (B) coatedQty != coatingCompletedQty: ${incompB.length}`);
  console.log(`  (C) sum of history entries != stored coatedQty: ${incompC.length}`);
  console.log(`  (D) imported with coated value in sheet but 0 stored: ${incompD.length}`);

  await conn.close();
  return { incompA, incompB, incompC, incompD };
}

if (require.main === module) {
  checkConsistency()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { checkConsistency };

