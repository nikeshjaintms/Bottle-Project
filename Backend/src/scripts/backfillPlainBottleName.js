/**
 * backfillPlainBottleName.js
 *
 * Scans all existing BottlePerBox records and computes plainBottleName
 * via derivePlainBottleName utility.
 *
 * Modes:
 *   --dry-run (default): reports all mappings, flags any ambiguous records, writes nothing.
 *   --apply: writes the computed plainBottleName to each record in the database.
 *
 * Usage:
 *   node src/scripts/backfillPlainBottleName.js --dry-run
 *   node src/scripts/backfillPlainBottleName.js --apply
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { derivePlainBottleName } = require('../utils/derivePlainBottleName');
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

async function run() {
  const isApply = process.argv.includes('--apply');
  const modeLabel = isApply ? 'APPLY MODE (LIVE DB UPDATES)' : 'DRY RUN MODE (PREVIEW ONLY)';

  console.log('='.repeat(75));
  console.log(`BACKFILL PLAIN BOTTLE NAME — ${modeLabel}`);
  console.log('='.repeat(75));

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const records = await db.collection('bottleperboxes').find({ isDeleted: { $ne: true } }).sort({ plainBottleName: 1 }).toArray();
  console.log(`\n[1] Total active BottlePerBox records scanned: ${records.length}`);

  // 1. Group records by target computed plainBottleName
  const targetGroups = new Map();
  const individualMismatches = [];

  for (const doc of records) {
    const currentPlain = doc.plainBottleName || doc.bottleName;
    const result = derivePlainBottleName(currentPlain);
    const targetPlain = result.plainBottleName;

    const names = Array.from(new Set([
      ...(doc.bottleNames || []),
      doc.bottleName,
      doc.plainBottleName
    ].filter(Boolean)));

    // Scan each raw name in doc.bottleNames to check if it derives differently
    for (const n of names) {
      const nRes = derivePlainBottleName(n);
      if (nRes.plainBottleName !== targetPlain) {
        individualMismatches.push({
          docId: doc._id,
          currentDocPlain: currentPlain,
          rawName: n,
          derivedPlain: nRes.plainBottleName
        });
      }
    }

    if (!targetGroups.has(targetPlain)) {
      targetGroups.set(targetPlain, {
        targetPlain,
        docs: [],
        allNames: new Set(),
        counts: []
      });
    }

    const group = targetGroups.get(targetPlain);
    group.docs.push(doc);
    names.forEach(n => group.allNames.add(n));
    if (doc.bottlePerBox !== null && doc.bottlePerBox !== undefined) {
      group.counts.push({ docId: doc._id, name: currentPlain, count: doc.bottlePerBox });
    }
  }

  // 2. Identify merge groups (groups with > 1 document)
  const mergeGroups = [];
  const singleUpdates = [];
  const countConflicts = [];

  for (const [targetPlain, group] of targetGroups.entries()) {
    if (group.docs.length > 1) {
      // Evaluate count conflict rule
      const distinctCounts = Array.from(new Set(group.counts.map(c => c.count)));
      let resolvedCount = null;
      let conflict = null;

      if (distinctCounts.length === 1) {
        resolvedCount = distinctCounts[0];
      } else if (distinctCounts.length > 1) {
        conflict = {
          targetPlain,
          conflictingDocs: group.counts
        };
        countConflicts.push(conflict);
      }

      mergeGroups.push({
        targetPlain,
        docs: group.docs,
        allNames: Array.from(group.allNames),
        resolvedCount,
        conflict
      });
    } else {
      const doc = group.docs[0];
      if (doc.plainBottleName !== targetPlain || doc.bottleName !== targetPlain) {
        singleUpdates.push({
          _id: doc._id,
          fromPlain: doc.plainBottleName,
          targetPlain
        });
      }
    }
  }

  console.log(`\n[2] Extraction & Merge Breakdown:`);
  console.log(`  - Total unique target Plain Bottles: ${targetGroups.size}`);
  console.log(`  - Merge groups (multiple docs merging into one Plain Bottle): ${mergeGroups.length}`);
  console.log(`  - Single docs requiring name canonicalization: ${singleUpdates.length}`);
  console.log(`  - Box count conflicts detected: ${countConflicts.length}`);

  console.log(`\n=======================================================`);
  console.log(`[3] PLANNED MERGE GROUPS (${mergeGroups.length} groups):`);
  console.log(`=======================================================`);

  mergeGroups.forEach((mg, idx) => {
    console.log(`\n  Group ${idx + 1}: Target Plain Bottle = "${mg.targetPlain}"`);
    console.log(`    Merging Documents (${mg.docs.length}):`);
    mg.docs.forEach(d => {
      console.log(`      • ID: ${d._id}, plainBottleName: "${d.plainBottleName}", boxCount: ${d.bottlePerBox}`);
      console.log(`        bottleNames: [${(d.bottleNames || []).map(n => `"${n}"`).join(', ')}]`);
    });
    console.log(`    Combined bottleNames (${mg.allNames.length} names): [${mg.allNames.map(n => `"${n}"`).join(', ')}]`);
    if (mg.conflict) {
      console.log(`    ⚠️ COUNT CONFLICT: Documents have differing box counts:`, mg.conflict.conflictingDocs);
    } else {
      console.log(`    ✓ Box Count Preserved: ${mg.resolvedCount !== null ? mg.resolvedCount : 'null (no box count set)'}`);
    }
  });

  if (singleUpdates.length > 0) {
    console.log(`\n=======================================================`);
    console.log(`[4] SINGLE DOCUMENT CANONICALIZATIONS (${singleUpdates.length}):`);
    console.log(`=======================================================`);
    singleUpdates.forEach(su => {
      console.log(`  - ID: ${su._id}: "${su.fromPlain}" ➔ "${su.targetPlain}"`);
    });
  }

  if (individualMismatches.length > 0) {
    console.log(`\n=======================================================`);
    console.log(`[5] RAW VARIANT NAME MAPPING SCAN (${individualMismatches.length} occurrences):`);
    console.log(`=======================================================`);
    individualMismatches.forEach(im => {
      console.log(`  - Doc "${im.currentDocPlain}" (ID: ${im.docId}): variant "${im.rawName}" derives to "${im.derivedPlain}"`);
    });
  }

  // If dry-run, stop here
  if (!isApply) {
    console.log('\n' + '='.repeat(75));
    console.log('DRY RUN COMPLETE — No database modifications made.');
    console.log('To apply these merges to the DB, run with: node src/scripts/backfillPlainBottleName.js --apply');
    console.log('='.repeat(75));
    await mongoose.disconnect();
    return;
  }

  if (countConflicts.length > 0) {
    console.error(`\n❌ ABORTING: Found ${countConflicts.length} box count conflicts. Resolve manually before applying.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // APPLY MODE
  console.log('\n=======================================================');
  console.log('[6] APPLYING MERGES & REPOINTING REFERENCES...');
  console.log('=======================================================');

  // 1. Process merge groups
  for (const mg of mergeGroups) {
    // Pick surviving doc (prefer one whose plainBottleName already matches targetPlain, else first)
    const primaryDoc = mg.docs.find(d => d.plainBottleName === mg.targetPlain) || mg.docs[0];
    const duplicateDocs = mg.docs.filter(d => !d._id.equals(primaryDoc._id));
    const survivingId = primaryDoc._id;

    console.log(`\nMerging into surviving document "${mg.targetPlain}" (${survivingId}):`);

    // Handle each duplicate document
    for (const dup of duplicateDocs) {
      const dupId = dup._id;

      // Merge PlainBottleStock
      const existingStock = await db.collection('plainbottlestocks').findOne({ bottleId: survivingId });
      const dupStock = await db.collection('plainbottlestocks').findOne({ bottleId: dupId });

      if (dupStock) {
        if (existingStock) {
          await db.collection('plainbottlestocks').updateOne(
            { _id: existingStock._id },
            {
              $set: {
                availableQuantity: (existingStock.availableQuantity || 0) + (dupStock.availableQuantity || 0),
                reservedQuantity: (existingStock.reservedQuantity || 0) + (dupStock.reservedQuantity || 0)
              }
            }
          );
          await db.collection('plainbottlestocks').deleteOne({ _id: dupStock._id });
          console.log(`  - Merged stock from duplicate (${dupId}) into surviving (${survivingId})`);
        } else {
          await db.collection('plainbottlestocks').updateOne(
            { _id: dupStock._id },
            { $set: { bottleId: survivingId } }
          );
          console.log(`  - Repointed stock from duplicate (${dupId}) to surviving (${survivingId})`);
        }
      }

      // Repoint Incoming records
      const incRes = await db.collection('incomings').updateMany(
        { 'items.bottleId': dupId },
        { $set: { 'items.$[elem].bottleId': survivingId } },
        { arrayFilters: [{ 'elem.bottleId': dupId }] }
      );
      if (incRes.modifiedCount > 0) {
        console.log(`  - Repointed ${incRes.modifiedCount} incoming items from duplicate (${dupId}) to surviving (${survivingId})`);
      }

      // Delete duplicate BottlePerBox document
      await db.collection('bottleperboxes').deleteOne({ _id: dupId });
      console.log(`  - Deleted duplicate BottlePerBox record "${dup.plainBottleName}" (${dupId})`);
    }

    // Update surviving document
    await db.collection('bottleperboxes').updateOne(
      { _id: survivingId },
      {
        $set: {
          plainBottleName: mg.targetPlain,
          bottleName: mg.targetPlain,
          bottleNames: mg.allNames,
          bottlePerBox: mg.resolvedCount,
          isDeleted: false,
          updatedAt: new Date()
        }
      }
    );
    console.log(`  ✓ Updated surviving record with ${mg.allNames.length} bottleNames.`);
  }

  // 2. Process single document canonicalizations
  for (const su of singleUpdates) {
    await db.collection('bottleperboxes').updateOne(
      { _id: su._id },
      {
        $set: {
          plainBottleName: su.targetPlain,
          bottleName: su.targetPlain,
          updatedAt: new Date()
        }
      }
    );
    console.log(`Updated single doc ID ${su._id}: "${su.fromPlain}" ➔ "${su.targetPlain}"`);
  }

  // Ensure unique index on plainBottleName: 1
  try {
    await db.collection('bottleperboxes').createIndex({ plainBottleName: 1 }, { unique: true });
  } catch (idxErr) {
    console.warn('Index note:', idxErr.message);
  }

  console.log('\n' + '='.repeat(75));
  console.log('APPLICATION COMPLETE — Live database successfully updated!');
  console.log('='.repeat(75));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});
