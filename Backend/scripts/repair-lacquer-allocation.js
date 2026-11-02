const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { replayStockAllocations } = require('../src/utils/stockRecompute');

async function main() {
  const isApply = process.argv.includes('--apply');
  const isDryRun = !isApply;

  const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(connStr);
  const db = mongoose.connection.db;
  const lpCol = db.collection('lacquerplans');

  console.log(`=== REPAIR LACQUER ALLOCATION (${isDryRun ? 'DRY RUN' : 'APPLY MODE'}) ===`);

  const { checkConsistency } = require('./check-lacquer-consistency');
  const initialReport = await checkConsistency();

  // Find all plans with inconsistencies
  const affectedIds = new Set([
    ...initialReport.incompA.map(x => x._id),
    ...initialReport.incompB.map(x => x._id),
    ...initialReport.incompC.map(x => x._id),
    ...initialReport.incompD.map(x => x._id)
  ]);

  console.log(`\nTotal affected documents identified: ${affectedIds.size}`);

  const plannedFixes = [];
  const ambiguousPlans = [];

  for (const idStr of affectedIds) {
    const doc = await lpCol.findOne({ _id: new mongoose.Types.ObjectId(idStr) });
    if (!doc) continue;

    const c1 = Number(doc.coatedQty) || 0;
    const c2 = Number(doc.coatingCompletedQty) || 0;
    const allocSum = (doc.stockAllocation || []).reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
    const coatingEntries = (doc.qtyEntries || []).filter(e => 
      e.subType === 'coated' || e.type === 'coatedQty' || (e.type === 'edit-adjustment' && e.subType === 'coated')
    );

    // Category 1: Carried plan with coated 0 but phantom stockAllocation and/or ghost coated initial/entries
    if (c1 === 0 && (allocSum > 0 || doc.coatedQtyInitial > 0 || coatingEntries.length > 0)) {
      // Find source plan if carried
      let sourceCoated = 0;
      if (doc.importedFromId) {
        const src = await lpCol.findOne({ _id: doc.importedFromId });
        if (src) {
          sourceCoated = Number(src.coatingCompletedQty ?? src.coatedQty ?? 0);
        }
      }
      if (!sourceCoated && allocSum > 0) {
        sourceCoated = allocSum;
      }

      // Filter out ghost coated entries from qtyEntries, preserve order entries
      const cleanedEntries = (doc.qtyEntries || []).filter(e => 
        e.subType !== 'coated' && e.type !== 'coatedQty' && !(e.type === 'edit-adjustment' && e.subType === 'coated')
      );

      plannedFixes.push({
        _id: doc._id,
        planDate: doc.planDate,
        bottleName: doc.bottleName,
        category: 'Clear phantom allocation and ghost coating on carried plan (coated 0)',
        changes: {
          stockAllocation: [],
          stockAllocationInitial: [],
          coatedQtyInitial: 0,
          qtyEntries: cleanedEntries,
          carriedFromCoatedQty: sourceCoated
        }
      });
      continue;
    }

    // Category 2: Plan on 2026-10-29 with coated 2000 where entries sum to 2000 and coatedQtyInitial was 2000
    if (c1 > 0 && doc.coatedQtyInitial > 0 && coatingEntries.length > 0) {
      const activeSum = coatingEntries.filter(e => !e.isDeleted).reduce((sum, e) => {
        if (e.action === 'subtract') return sum - (Number(e.qty) || 0);
        return sum + (Number(e.qty) || 0);
      }, 0);
      if (activeSum === c1) {
        // The entries already represent the 2000, so coatedQtyInitial should be 0
        plannedFixes.push({
          _id: doc._id,
          planDate: doc.planDate,
          bottleName: doc.bottleName,
          category: 'Reset redundant coatedQtyInitial to 0 since entries sum to coatedQty',
          changes: {
            coatedQtyInitial: 0
          }
        });
        continue;
      }
    }

    // Otherwise, ambiguous
    ambiguousPlans.push({
      _id: doc._id,
      planDate: doc.planDate,
      bottleName: doc.bottleName,
      companyId: doc.companyId,
      values: {
        orderQty: doc.orderQty,
        coatedQty: doc.coatedQty,
        coatingCompletedQty: doc.coatingCompletedQty,
        allocSum,
        stockAllocation: doc.stockAllocation,
        entriesCount: coatingEntries.length
      }
    });
  }

  console.log(`\nPlanned unambiguous fixes: ${plannedFixes.length}`);
  for (const f of plannedFixes) {
    console.log(`- [${f._id}] Date: ${f.planDate.toISOString().slice(0, 10)} | ${f.bottleName} | Category: ${f.category}`);
    console.log(`  Changes:`, JSON.stringify(f.changes));
  }

  console.log(`\nAmbiguous plans (untouched): ${ambiguousPlans.length}`);
  for (const a of ambiguousPlans) {
    console.log(`- [${a._id}] Date: ${a.planDate.toISOString().slice(0, 10)} | ${a.bottleName}`);
    console.log(`  Values:`, JSON.stringify(a.values));
  }

  if (isDryRun) {
    console.log('\nDRY RUN COMPLETE. No changes written. Run with --apply to apply.');
    process.exit(0);
  }

  // APPLY MODE:
  // 1. Back up affected documents
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `repair-allocation-${Date.now()}.json`);

  const docsToBackup = await lpCol.find({ _id: { $in: plannedFixes.map(f => f._id) } }).toArray();
  fs.writeFileSync(backupPath, JSON.stringify(docsToBackup, null, 2), 'utf8');
  console.log(`\nBacked up ${docsToBackup.length} affected documents to ${backupPath}`);

  // 2. Apply fixes
  let earliestDate = null;
  const affectedPools = new Map(); // bottleName -> Set of companyIds

  for (const fix of plannedFixes) {
    await lpCol.updateOne(
      { _id: fix._id },
      { $set: fix.changes }
    );
    if (!earliestDate || fix.planDate < earliestDate) {
      earliestDate = fix.planDate;
    }
    const doc = docsToBackup.find(d => d._id.toString() === fix._id.toString());
    if (doc) {
      const bKey = doc.bottleName;
      if (!affectedPools.has(bKey)) affectedPools.set(bKey, new Set());
      if (doc.companyId) affectedPools.get(bKey).add(doc.companyId.toString());
      (doc.stockSources || []).forEach(s => affectedPools.get(bKey).add((s._id || s).toString()));
    }
  }

  console.log(`Applied fixes to ${plannedFixes.length} documents.`);

  // 3. Replay stock allocations from earliest affected date
  console.log(`Replaying stock allocations from earliest date: ${earliestDate.toISOString().slice(0, 10)}...`);
  for (const [bottleName, sourcesSet] of affectedPools.entries()) {
    const sources = Array.from(sourcesSet);
    await replayStockAllocations(bottleName, earliestDate, sources);
    console.log(`Replayed stock allocation for ${bottleName} across sources: ${sources.join(', ')}`);
  }

  // 4. Run consistency check after repair
  console.log('\nRunning post-repair consistency check:');
  const postReport = await checkConsistency();
  console.log(`Post-repair remaining inconsistencies: A: ${postReport.incompA.length}, B: ${postReport.incompB.length}, C: ${postReport.incompC.length}, D: ${postReport.incompD.length}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

