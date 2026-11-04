const mongoose = require('mongoose');

async function getCounts() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const collections = [
    'lacquerplans',
    'printingplans',
    'readytodispatches',
    'plainbottlestocks',
    'incomings',
    'dispatches',
    'bottleperboxes',
    'bottlespecs',
    'variants',
    'companies',
    'brands'
  ];

  const counts = {};
  for (const collName of collections) {
    try {
      counts[collName] = await db.collection(collName).countDocuments();
    } catch (e) {
      counts[collName] = e.message;
    }
  }

  // Also find largest documents per collection (by BSON Object size or fields)
  const largest = {};
  for (const collName of ['lacquerplans', 'printingplans', 'incomings', 'dispatches']) {
    try {
      const docs = await db.collection(collName).find().toArray();
      let maxDoc = null;
      let maxSize = 0;
      for (const d of docs) {
        const sz = Buffer.byteLength(JSON.stringify(d));
        if (sz > maxSize) {
          maxSize = sz;
          maxDoc = { _id: d._id, sizeBytes: sz, planDate: d.planDate || d.date, bottleName: d.bottleName || (d.items && d.items.length) };
        }
      }
      largest[collName] = maxDoc;
    } catch (e) {
      largest[collName] = e.message;
    }
  }

  console.log(JSON.stringify({ timestamp: new Date().toISOString(), counts, largest }, null, 2));
  await mongoose.connection.close();
}

getCounts().catch(e => {
  console.error(e);
  process.exit(1);
});

