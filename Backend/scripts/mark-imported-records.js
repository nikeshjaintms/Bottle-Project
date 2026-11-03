const mongoose = require('../node_modules/mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

async function markImportedRecords() {
  const isCommit = process.argv.includes('--commit') || process.argv.includes('--apply');
  const isDryRun = !isCommit;

  console.log('================================================================================');
  console.log(`       MARK IMPORTED RECORDS (${isDryRun ? 'DRY RUN - REPORT ONLY' : 'COMMIT - APPLY CHANGES'})       `);
  console.log('================================================================================\n');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const collections = ['incomings', 'dispatches', 'shrenoincomings'];
  const countsBefore = {};
  const countsAfter = {};

  for (const cName of collections) {
    countsBefore[cName] = await db.collection(cName).countDocuments({});
  }

  console.log('Document Counts BEFORE:');
  console.table(countsBefore);

  // Identify documents carrying reliable import markers
  // Marker criteria: importBatchId, source === 'EXCEL_IMPORT', importedAt
  const reliableFilter = {
    $or: [
      { importBatchId: { $exists: true, $ne: null } },
      { source: 'EXCEL_IMPORT' },
      { sourceFormat: { $in: ['SHRENO', 'DEFAULT', 'TPP'] } },
      { importedAt: { $exists: true, $ne: null } }
    ]
  };

  const toMark = [];
  const lookAlikes = [];

  for (const cName of collections) {
    const col = db.collection(cName);
    const docs = await col.find({}).toArray();

    for (const doc of docs) {
      const hasReliableMarker = Boolean(
        doc.importBatchId ||
        doc.source === 'EXCEL_IMPORT' ||
        doc.importedAt ||
        (doc.sourceFormat && ['SHRENO', 'DEFAULT', 'TPP'].includes(doc.sourceFormat))
      );

      if (hasReliableMarker) {
        toMark.push({ collection: cName, doc });
      } else {
        // Check if it's a look-alike (e.g. created in burst or old stock without po)
        // Here we record any suspicious burst patterns for reporting
        const isBurst = false; // from Step 1, all deltas are >= 63 seconds
        if (doc.deliveryNumber === 'OLD STOCK' || doc.challanNo === 'OLD STOCK') {
          lookAlikes.push({
            collection: cName,
            id: doc._id.toString(),
            reason: 'Challan/DeliveryNumber is OLD STOCK but created manually via UI without batch marker',
            createdAt: doc.createdAt
          });
        }
      }
    }
  }

  console.log(`\nReliable Imported Documents Found to Mark: ${toMark.length}`);
  console.log(`Look-alikes Identified (NOT touched): ${lookAlikes.length}\n`);

  if (lookAlikes.length > 0) {
    console.log('Unmarked Look-Alikes (left intact):');
    console.table(lookAlikes);
  }

  if (toMark.length > 0) {
    // 1. Back up affected documents
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve(__dirname, '../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `mark-imported-${timestamp}.json`);

    fs.writeFileSync(backupPath, JSON.stringify(toMark.map(t => ({ collection: t.collection, doc: t.doc })), null, 2));
    console.log(`[BACKUP] Backed up ${toMark.length} document(s) to ${backupPath}`);

    if (isCommit) {
      console.log('\nApplying isImported: true to reliable documents...');
      const { recomputePlainStock } = require('../src/utils/stockRecompute');
      const affectedPools = new Set();

      for (const item of toMark) {
        await db.collection(item.collection).updateOne(
          { _id: item.doc._id },
          { $set: { isImported: true } }
        );

        if (item.collection === 'incomings' && item.doc.items) {
          for (const it of item.doc.items) {
            if (it.bottleId && item.doc.billToId) {
              affectedPools.add(`${item.doc.billToId}:::${it.bottleId}`);
            }
          }
        }
      }

      console.log(`Updated isImported: true on ${toMark.length} documents.`);

      // Recompute affected pools
      for (const poolKey of affectedPools) {
        const [cId, bId] = poolKey.split(':::');
        console.log(`Recomputing stock for affected pool: Company ${cId}, Bottle ${bId}...`);
        await recomputePlainStock(bId, cId);
      }
    } else {
      console.log('\n[DRY RUN] No modifications made. Run with --commit to apply changes.');
    }
  } else {
    console.log('No documents found with reliable import markers. Database is already clean.');
  }

  for (const cName of collections) {
    countsAfter[cName] = await db.collection(cName).countDocuments({});
  }

  console.log('\nDocument Counts AFTER:');
  console.table(countsAfter);

  let countsMatch = true;
  for (const cName of collections) {
    if (countsBefore[cName] !== countsAfter[cName]) countsMatch = false;
  }
  console.log(`Document count verification: ${countsMatch ? 'PASSED (exact match before and after)' : 'FAILED (counts differed)'}\n`);

  await mongoose.disconnect();
}

markImportedRecords().catch(err => {
  console.error('[MARK ERROR]:', err);
  process.exit(1);
});
