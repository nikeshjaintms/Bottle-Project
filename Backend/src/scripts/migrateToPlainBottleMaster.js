/**
 * migrateToPlainBottleMaster.js
 *
 * Groups existing BottlePerBox records by their plainBottleName.
 * For each Plain Bottle, creates a single master document with:
 *   - plainBottleName: "20 ML SAAB"
 *   - bottleNames: ["20 ML SAAB", "20 ML SAAB-(BLACK ORG)", "20 ML SAAB-(GOLD FOIL)", ...]
 *   - bottlePerBox: adopts resolved count
 * Repoints all foreign references (PlainBottleStock, Incoming) from old variant IDs to surviving ID.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

async function migrate() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  console.log('='.repeat(70));
  console.log('MIGRATING BOTTLEPERBOX TO PLAIN BOTTLE MASTER + BOTTLENAMES ARRAY');
  console.log('='.repeat(70));

  // Drop old unique index on bottleName if it exists
  try {
    await db.collection('bottleperboxes').dropIndex('bottleName_1');
    console.log('✓ Dropped old index bottleName_1');
  } catch (e) {
    // index may not exist or named differently
  }

  // Backup current state
  const backupDir = path.join(__dirname, `../../backups/pre_array_migration_${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const existingDocs = await db.collection('bottleperboxes').find({}).toArray();
  fs.writeFileSync(path.join(backupDir, 'bottleperboxes.json'), JSON.stringify(existingDocs, null, 2), 'utf8');
  console.log(`✓ Backed up ${existingDocs.length} records to ${backupDir}`);

  // Group by plainBottleName
  const groups = new Map();
  for (const doc of existingDocs) {
    const plainName = (doc.plainBottleName || doc.bottleName).trim();
    if (!groups.has(plainName)) {
      groups.set(plainName, []);
    }
    groups.get(plainName).push(doc);
  }

  console.log(`\nFound ${groups.size} unique Plain Bottle groups from ${existingDocs.length} records.`);

  const survivingDocs = [];

  for (const [plainName, docList] of groups.entries()) {
    // Pick the best doc to be the surviving record (prefer exact match or one with non-null bottlePerBox)
    let primaryDoc = docList.find(d => d.bottleName === plainName) ||
      docList.find(d => d.bottlePerBox !== null && d.bottlePerBox !== undefined) ||
      docList[0];

    const allVariantNames = Array.from(new Set(
      docList.flatMap(d => [d.bottleName, ...(d.bottleNames || [])]).filter(Boolean)
    ));
    if (!allVariantNames.includes(plainName)) {
      allVariantNames.unshift(plainName);
    }

    // Resolve bottlePerBox count: non-null count from primary or any variant
    let resolvedCount = primaryDoc.bottlePerBox;
    if (resolvedCount === null || resolvedCount === undefined) {
      const withCount = docList.find(d => d.bottlePerBox !== null && d.bottlePerBox !== undefined);
      if (withCount) resolvedCount = withCount.bottlePerBox;
    }

    const survivingId = primaryDoc._id;

    // Repoint other docs in this group to survivingId
    const otherDocs = docList.filter(d => !d._id.equals(survivingId));
    for (const other of otherDocs) {
      const otherId = other._id;

      // PlainBottleStock
      const existingStock = await db.collection('plainbottlestocks').findOne({ bottleId: survivingId });
      const otherStock = await db.collection('plainbottlestocks').findOne({ bottleId: otherId });
      if (otherStock) {
        if (existingStock) {
          await db.collection('plainbottlestocks').updateOne(
            { _id: existingStock._id },
            {
              $set: {
                availableQuantity: (existingStock.availableQuantity || 0) + (otherStock.availableQuantity || 0),
                reservedQuantity: (existingStock.reservedQuantity || 0) + (otherStock.reservedQuantity || 0)
              }
            }
          );
          await db.collection('plainbottlestocks').deleteOne({ _id: otherStock._id });
        } else {
          await db.collection('plainbottlestocks').updateOne(
            { _id: otherStock._id },
            { $set: { bottleId: survivingId } }
          );
        }
      }

      // Incoming
      await db.collection('incomings').updateMany(
        { 'items.bottleId': otherId },
        { $set: { 'items.$[elem].bottleId': survivingId } },
        { arrayFilters: [{ 'elem.bottleId': otherId }] }
      );
    }

    // Build the consolidated master record
    survivingDocs.push({
      _id: survivingId,
      plainBottleName: plainName,
      bottleName: plainName,
      bottleNames: allVariantNames,
      bottlePerBox: resolvedCount || null,
      status: docList.some(d => d.status !== false),
      isDeleted: false,
      createdAt: primaryDoc.createdAt || new Date(),
      updatedAt: new Date()
    });
  }

  // Replace collection contents with surviving consolidated master records
  await db.collection('bottleperboxes').deleteMany({});
  await db.collection('bottleperboxes').insertMany(survivingDocs);

  // Ensure unique index on plainBottleName
  try {
    await db.collection('bottleperboxes').createIndex({ plainBottleName: 1 }, { unique: true });
    console.log('✓ Created unique index on plainBottleName: 1');
  } catch (e) {
    console.warn('Index creation warning:', e.message);
  }

  console.log(`\n✓ Consolidation complete! Surviving records: ${survivingDocs.length}`);

  // Sample check
  const saab = await db.collection('bottleperboxes').findOne({ plainBottleName: '20 ML SAAB' });
  console.log('\nSample 20 ML SAAB master doc:');
  console.log(JSON.stringify(saab, null, 2));

  await mongoose.disconnect();
}

migrate().catch(console.error);
