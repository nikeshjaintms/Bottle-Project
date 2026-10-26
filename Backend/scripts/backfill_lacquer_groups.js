const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const LacquerPlan = require('../src/models/LacquerPlan');
const { computePlanGroupKey } = require('../src/utils/lacquerGroupKey');

async function backfill() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('Connected to MongoDB. Starting backup of lacquerplans...');

  // 1. Back up the collection first
  const existingCollections = await db.listCollections({ name: 'lacquerplans_backup_prompt_j' }).toArray();
  if (existingCollections.length > 0) {
    await db.collection('lacquerplans_backup_prompt_j').drop();
  }
  const allDocs = await db.collection('lacquerplans').find({}).toArray();
  if (allDocs.length > 0) {
    await db.collection('lacquerplans_backup_prompt_j').insertMany(allDocs);
  }
  console.log(`Backed up ${allDocs.length} documents to lacquerplans_backup_prompt_j.`);

  // 2. Count before
  const totalBefore = await LacquerPlan.countDocuments();
  const withKeyBefore = await LacquerPlan.countDocuments({ groupKey: { $ne: null, $exists: true } });
  const withoutKeyBefore = await LacquerPlan.countDocuments({
    $or: [{ groupKey: null }, { groupKey: { $exists: false } }]
  });

  console.log('\n--- Before Backfill ---');
  console.log(`Total plans: ${totalBefore}`);
  console.log(`Plans with groupKey: ${withKeyBefore}`);
  console.log(`Plans without groupKey: ${withoutKeyBefore}`);

  // 3. Compute groupKeys for all active plans
  const plans = await LacquerPlan.find({}).sort({ planDate: 1, createdAt: 1, _id: 1 });
  const grouped = new Map();

  for (const plan of plans) {
    const key = await computePlanGroupKey(plan);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(plan);
  }

  // 4. Update each plan with groupKey and rowSeq
  let updatedCount = 0;
  for (const [key, planList] of grouped.entries()) {
    for (let seq = 0; seq < planList.length; seq++) {
      const p = planList[seq];
      await LacquerPlan.updateOne(
        { _id: p._id },
        {
          $set: {
            groupKey: key,
            rowSeq: seq + 1
          }
        }
      );
      updatedCount++;
    }
  }

  // 5. Count after
  const totalAfter = await LacquerPlan.countDocuments();
  const withKeyAfter = await LacquerPlan.countDocuments({ groupKey: { $ne: null, $exists: true } });
  const withoutKeyAfter = await LacquerPlan.countDocuments({
    $or: [{ groupKey: null }, { groupKey: { $exists: false } }]
  });

  console.log('\n--- After Backfill ---');
  console.log(`Total plans: ${totalAfter}`);
  console.log(`Plans with groupKey: ${withKeyAfter}`);
  console.log(`Plans without groupKey: ${withoutKeyAfter}`);
  console.log(`Updated records: ${updatedCount}`);
  console.log(`Unique groupKeys created: ${grouped.size}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  backfill().catch(console.error);
}

module.exports = { backfill };
