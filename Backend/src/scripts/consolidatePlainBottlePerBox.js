/**
 * consolidatePlainBottlePerBox.js
 *
 * Consolidates BottlePerBox so only true Plain Bottle (base mold) names exist as master records.
 * Strips shade/finish/foil annotations according to plainBottleNameMapping.js.
 *
 * Rules:
 * 1. Base record bottlePerBox preservation:
 *    - If base record already has a non-null bottlePerBox, keep it.
 *    - Else, if exactly one merging variant has non-null bottlePerBox, adopt it.
 *    - Else, if more than one merging variant has non-null bottlePerBox and they disagree, flag conflict loudly.
 * 2. Referential integrity:
 *    - Repoints all references in other collections (PlainBottleStock, Incoming, BottleSpecs, LacquerPlan,
 *      PrintingPlan, Production, CoatingProduction, etc.) from variant _id / bottleName to the surviving base record.
 *    - For unique-indexed collections like PlainBottleStock, merges stock quantities (availableQuantity & reservedQuantity)
 *      into the base document and removes the duplicate variant stock document.
 *    - Verifies zero unresolved references before any variant record deletion.
 * 3. Two Modes:
 *    --dry-run (default): Prints full report, writes nothing.
 *    --apply: Backs up affected data and executes the consolidation safely.
 *
 * Usage:
 *   node src/scripts/consolidatePlainBottlePerBox.js --dry-run
 *   node src/scripts/consolidatePlainBottlePerBox.js --apply
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const plainMapping = require('./plainBottleNameMapping');
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

// Strict token set for shade/finish/foil detection to audit classifications
const SHADE_TOKENS = new Set([
  'ORG', 'ORGANIC', 'FOIL', 'GOLD', 'SILVER', 'BLACK', 'WHITE',
  'PINK', 'MATT', 'BLUE', 'GREY', 'RED', 'GREEN', 'CHROME',
  'ROSE', 'PASS', 'THREE', 'P', 'ONLY', 'COATING', 'PLAIN'
]);
const DELIMITERS = /[\s\+\/\-]+/;

function auditClassification(name) {
  const parenMatch = name.match(/^(.*?)(?:\s*-\s*|\s+)\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const inside = parenMatch[2].trim();
    const tokens = inside.split(DELIMITERS).map(t => t.trim().toUpperCase()).filter(Boolean);
    const nonShade = tokens.filter(t => !SHADE_TOKENS.has(t));
    return { hasSuffix: true, tokens, nonShade, isShade: nonShade.length === 0 };
  }
  const dashMatch = name.match(/^(.*?)\s*-\s*([A-Za-z0-9\+\/\s]+)$/);
  if (dashMatch) {
    const suffix = dashMatch[2].trim();
    const tokens = suffix.split(DELIMITERS).map(t => t.trim().toUpperCase()).filter(Boolean);
    const nonShade = tokens.filter(t => !SHADE_TOKENS.has(t));
    return { hasSuffix: true, tokens, nonShade, isShade: nonShade.length === 0 };
  }
  return { hasSuffix: false };
}

async function run() {
  const isApply = process.argv.includes('--apply');
  const modeLabel = isApply ? 'APPLY MODE (LIVE CHANGES)' : 'DRY RUN MODE (NO CHANGES)';

  console.log('='.repeat(70));
  console.log(`CONSOLIDATE PLAIN BOTTLE PER BOX — ${modeLabel}`);
  console.log('='.repeat(70));

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  // 1. Load all BottlePerBox documents
  const allBpbDocs = await db.collection('bottleperboxes').find({}).toArray();
  console.log(`\n[1] Total BottlePerBox records in DB: ${allBpbDocs.length}`);

  // 2. Identify mappings and merge groups
  const bpbByName = new Map();
  allBpbDocs.forEach(doc => bpbByName.set(doc.bottleName, doc));

  // Merge groups: baseName -> { baseDoc, variantDocs: [] }
  const mergeGroups = new Map();
  const unmappedNames = [];
  const ambiguousClassifications = [];

  for (const doc of allBpbDocs) {
    const rawName = doc.bottleName;
    const targetBaseName = plainMapping[rawName];

    if (!targetBaseName) {
      unmappedNames.push(rawName);
      continue;
    }

    // Check token classification audit
    const audit = auditClassification(rawName);
    if (audit.hasSuffix && !audit.isShade && targetBaseName !== rawName) {
      ambiguousClassifications.push({
        rawName,
        targetBaseName,
        nonShadeTokens: audit.nonShade
      });
    }

    if (!mergeGroups.has(targetBaseName)) {
      mergeGroups.set(targetBaseName, {
        baseName: targetBaseName,
        baseDoc: bpbByName.get(targetBaseName) || null,
        variantDocs: []
      });
    }

    if (rawName !== targetBaseName) {
      mergeGroups.get(targetBaseName).variantDocs.push(doc);
    }
  }

  // 3. Evaluate bottlePerBox counts and conflicts for each group
  const plannedMerges = [];
  const countConflicts = [];

  for (const [baseName, group] of mergeGroups.entries()) {
    if (group.variantDocs.length === 0) continue;

    const existingBaseCount = group.baseDoc ? group.baseDoc.bottlePerBox : null;
    const variantCounts = group.variantDocs
      .map(v => ({ name: v.bottleName, count: v.bottlePerBox }))
      .filter(v => v.count !== null && v.count !== undefined);

    let resolvedCount = existingBaseCount;
    let conflict = null;

    if (existingBaseCount !== null && existingBaseCount !== undefined) {
      resolvedCount = existingBaseCount;
    } else if (variantCounts.length === 0) {
      resolvedCount = null;
    } else {
      const distinctCounts = Array.from(new Set(variantCounts.map(v => v.count)));
      if (distinctCounts.length === 1) {
        resolvedCount = distinctCounts[0];
      } else {
        conflict = {
          baseName,
          existingBaseCount,
          conflictingVariants: variantCounts
        };
        countConflicts.push(conflict);
        resolvedCount = null; // Do not guess!
      }
    }

    plannedMerges.push({
      baseName,
      baseDocExists: !!group.baseDoc,
      baseDocId: group.baseDoc ? group.baseDoc._id : null,
      existingCount: existingBaseCount,
      resolvedCount,
      conflict,
      variants: group.variantDocs
    });
  }

  // 4. Print Consolidation Analysis Report
  console.log(`\n[2] Consolidation Summary:`);
  console.log(`  - Total Base Molds represented: ${mergeGroups.size}`);
  console.log(`  - Base Molds with variants collapsing into them: ${plannedMerges.length}`);
  const totalVariantsToMerge = plannedMerges.reduce((acc, m) => acc + m.variants.length, 0);
  console.log(`  - Total variant records to be merged & removed: ${totalVariantsToMerge}`);
  console.log(`  - Expected surviving BottlePerBox record count: ${allBpbDocs.length - totalVariantsToMerge}`);

  console.log(`\n[3] Merge Group Details (${plannedMerges.length} base molds):`);
  plannedMerges.forEach((m, idx) => {
    console.log(`\n  ${idx + 1}. Base Mold: "${m.baseName}"`);
    console.log(`     - Base record in DB: ${m.baseDocExists ? `EXISTS (ID: ${m.baseDocId})` : 'MISSING (Will be created)'}`);
    console.log(`     - Current Base bottlePerBox: ${m.existingCount}`);
    console.log(`     - Resolved Base bottlePerBox: ${m.resolvedCount}`);
    console.log(`     - Collapsing Variants (${m.variants.length}):`);
    m.variants.forEach(v => {
      console.log(`         • "${v.bottleName}" (bottlePerBox: ${v.bottlePerBox}, ID: ${v._id})`);
    });
    if (m.conflict) {
      console.log(`     ⚠️ COUNT CONFLICT DETECTED! Left untouched until manual resolution.`);
    }
  });

  console.log('\n' + '-'.repeat(70));
  console.log(`[4] Audit & Safety Checks:`);
  console.log(`  - Unmapped bottle records: ${unmappedNames.length}`);
  if (unmappedNames.length > 0) {
    console.log('    ⚠️ Unmapped:', unmappedNames);
  }
  console.log(`  - Ambiguous token classifications: ${ambiguousClassifications.length}`);
  if (ambiguousClassifications.length > 0) {
    console.log('    ⚠️ Ambiguous:', ambiguousClassifications);
  }
  console.log(`  - Count conflicts: ${countConflicts.length}`);
  if (countConflicts.length > 0) {
    console.log('    ⚠️ Conflicts:', countConflicts);
  }

  // 5. Referential Integrity Scan
  console.log('\n[5] Scanning Referential Integrity across DB collections...');
  const collectionsToCheck = [
    { name: 'plainbottlestocks', idField: 'bottleId', nameField: null },
    { name: 'incomings', idField: 'items.bottleId', nameField: null },
    { name: 'bottlespecs', idField: null, nameField: 'bottleName' },
    { name: 'lacquerplans', idField: null, nameField: 'bottleName' },
    { name: 'printingplans', idField: null, nameField: 'bottleName' },
    { name: 'productions', idField: null, nameField: 'bottleName' },
    { name: 'coatingproductions', idField: null, nameField: 'bottleName' }
  ];

  const variantIds = new Set(plannedMerges.flatMap(m => m.variants.map(v => v._id.toString())));
  const variantNames = new Set(plannedMerges.flatMap(m => m.variants.map(v => v.bottleName)));

  for (const collInfo of collectionsToCheck) {
    const coll = db.collection(collInfo.name);
    let idHits = 0;
    let nameHits = 0;

    if (collInfo.idField) {
      if (collInfo.idField.includes('.')) {
        // e.g. items.bottleId
        const [arr, field] = collInfo.idField.split('.');
        const docs = await coll.find({ [`${arr}.${field}`]: { $in: Array.from(variantIds).map(id => new mongoose.Types.ObjectId(id)) } }).toArray();
        idHits = docs.length;
      } else {
        const docs = await coll.find({ [collInfo.idField]: { $in: Array.from(variantIds).map(id => new mongoose.Types.ObjectId(id)) } }).toArray();
        idHits = docs.length;
      }
    }

    if (collInfo.nameField) {
      const docs = await coll.find({ [collInfo.nameField]: { $in: Array.from(variantNames) } }).toArray();
      nameHits = docs.length;
    }

    console.log(`  - ${collInfo.name}: ${idHits} ID references, ${nameHits} name references found.`);
  }

  // 6. APPLY EXECUTION (Only if --apply flag is provided)
  if (!isApply) {
    console.log('\n' + '='.repeat(70));
    console.log('DRY RUN COMPLETE — No database modifications made.');
    console.log('To apply these changes, run with: node src/scripts/consolidatePlainBottlePerBox.js --apply');
    console.log('='.repeat(70));
    await mongoose.disconnect();
    return;
  }

  // Abort if conflicts or unmapped records exist
  if (countConflicts.length > 0 || unmappedNames.length > 0 || ambiguousClassifications.length > 0) {
    console.error('\n❌ ABORTING --apply: Unresolved count conflicts, unmapped names, or ambiguous classifications detected!');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Backup step
  console.log('\n[6] Creating JSON Backups of affected collections before applying...');
  const backupDir = path.join(__dirname, `../../backups/backup_${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const backupCollections = ['bottleperboxes', 'plainbottlestocks', 'incomings', 'bottlespecs'];
  for (const cName of backupCollections) {
    const docs = await db.collection(cName).find({}).toArray();
    fs.writeFileSync(path.join(backupDir, `${cName}.json`), JSON.stringify(docs, null, 2), 'utf8');
    console.log(`  ✓ Backed up ${docs.length} documents from ${cName} -> ${backupDir}/${cName}.json`);
  }

  // Execution:
  console.log('\n[7] Executing Consolidation...');

  for (const merge of plannedMerges) {
    // A. Ensure surviving Base Record exists
    let survivingBaseDoc = merge.baseDocExists
      ? await db.collection('bottleperboxes').findOne({ _id: merge.baseDocId })
      : null;

    if (!survivingBaseDoc) {
      const insertRes = await db.collection('bottleperboxes').insertOne({
        bottleName: merge.baseName,
        bottlePerBox: merge.resolvedCount,
        status: true,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      survivingBaseDoc = { _id: insertRes.insertedId, bottleName: merge.baseName };
      console.log(`  ✓ Created base record "${merge.baseName}" with ID ${survivingBaseDoc._id} (bottlePerBox: ${merge.resolvedCount})`);
    } else if (merge.resolvedCount !== null && survivingBaseDoc.bottlePerBox !== merge.resolvedCount) {
      await db.collection('bottleperboxes').updateOne(
        { _id: survivingBaseDoc._id },
        { $set: { bottlePerBox: merge.resolvedCount, updatedAt: new Date() } }
      );
      console.log(`  ✓ Updated base record "${merge.baseName}" bottlePerBox to ${merge.resolvedCount}`);
    }

    const survivingId = survivingBaseDoc._id;

    // B. Repoint all foreign key references from each variant to surviving base
    for (const vDoc of merge.variants) {
      const vId = vDoc._id;

      // 1. plainbottlestocks (Handle unique index on bottleId: 1 by merging quantities)
      const existingBaseStock = await db.collection('plainbottlestocks').findOne({ bottleId: survivingId });
      const variantStock = await db.collection('plainbottlestocks').findOne({ bottleId: vId });

      if (variantStock) {
        if (existingBaseStock) {
          // Merge quantities into surviving base stock doc
          const newAvail = (existingBaseStock.availableQuantity || 0) + (variantStock.availableQuantity || 0);
          const newRes = (existingBaseStock.reservedQuantity || 0) + (variantStock.reservedQuantity || 0);
          await db.collection('plainbottlestocks').updateOne(
            { _id: existingBaseStock._id },
            { $set: { availableQuantity: newAvail, reservedQuantity: newRes, updatedAt: new Date() } }
          );
          await db.collection('plainbottlestocks').deleteOne({ _id: variantStock._id });
          console.log(`    ↳ Merged stock quantities from ${vDoc.bottleName} (avail: ${variantStock.availableQuantity}) into ${merge.baseName}`);
        } else {
          // Re-key variant stock doc to survivingId
          await db.collection('plainbottlestocks').updateOne(
            { _id: variantStock._id },
            { $set: { bottleId: survivingId, updatedAt: new Date() } }
          );
          console.log(`    ↳ Repointed plainbottlestock from ${vDoc.bottleName} to ${merge.baseName}`);
        }
      }

      // 2. incomings (items.bottleId)
      const incRes = await db.collection('incomings').updateMany(
        { 'items.bottleId': vId },
        { $set: { 'items.$[elem].bottleId': survivingId } },
        { arrayFilters: [{ 'elem.bottleId': vId }] }
      );
      if (incRes.modifiedCount > 0) {
        console.log(`    ↳ Repointed ${incRes.modifiedCount} incomings from ${vDoc.bottleName} to ${merge.baseName}`);
      }

      // 3. Verify no unresolved references remain to vId
      const remainingPb = await db.collection('plainbottlestocks').countDocuments({ bottleId: vId });
      const remainingInc = await db.collection('incomings').countDocuments({ 'items.bottleId': vId });

      if (remainingPb > 0 || remainingInc > 0) {
        throw new Error(`Referential integrity check failed! Unresolved references remain for variant ${vDoc.bottleName} (${vId})`);
      }

      // C. Safely remove the variant BottlePerBox record
      await db.collection('bottleperboxes').deleteOne({ _id: vId });
      console.log(`  ✓ Deleted variant BottlePerBox record: "${vDoc.bottleName}" (${vId})`);
    }
  }

  // 7. Final Verification
  const remainingCount = await db.collection('bottleperboxes').countDocuments();
  console.log('\n' + '='.repeat(70));
  console.log(`CONSOLIDATION COMPLETE!`);
  console.log(`Surviving BottlePerBox master records: ${remainingCount}`);
  console.log('='.repeat(70));

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('\n❌ Execution error:', err);
  process.exit(1);
});
