const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const db = mongoose.connection.db;
  const total = await db.collection('printingplans').countDocuments();
  const deleted = await db.collection('printingplans').countDocuments({ isDeleted: true });
  const nonDeleted = await db.collection('printingplans').countDocuments({ isDeleted: { $ne: true } });
  console.log('Total:', total, 'Deleted:', deleted, 'Non-deleted:', nonDeleted);

  const sampleDoc = await db.collection('printingplans').findOne();
  console.log('Sample doc fields:', Object.keys(sampleDoc || {}));
  console.log('Sample planDate:', sampleDoc?.planDate, 'typeof:', typeof sampleDoc?.planDate);

  // Group by typeof planDate
  const types = await db.collection('printingplans').aggregate([
    { $group: { _id: { $type: "$planDate" }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('Types of planDate:', types);

  // Group by typeof isDeleted
  const delTypes = await db.collection('printingplans').aggregate([
    { $group: { _id: { $type: "$isDeleted" }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('Types of isDeleted:', delTypes);

  // Date distribution of non-deleted
  const dateDist = await db.collection('printingplans').aggregate([
    { $group: { _id: { isDeleted: "$isDeleted", dateType: { $type: "$planDate" } }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('Date distribution:', dateDist);

  await mongoose.disconnect();
})();
