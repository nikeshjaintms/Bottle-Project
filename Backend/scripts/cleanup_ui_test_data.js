const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const Incoming = require('../src/models/Incoming');
const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const PlainBottleStock = require('../src/models/PlainBottleStock');
const Variant = require('../src/models/Variant');
const Company = require('../src/models/Company');
const { recomputePlainStock } = require('../src/utils/stockRecompute');

async function cleanup() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  await Incoming.deleteMany({ documentDate: { $gte: new Date('2030-01-01') } });
  await LacquerPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await PrintingPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await Variant.deleteMany({ variantName: 'SMOKING HOT (TEST)' });

  const aroma = await Company.findOne({ name: { $regex: /^AROMA$/i } });
  if (aroma) {
    await recomputePlainStock('100 ML MICRON', aroma._id);
  }

  const counts = {
    LacquerPlan: await db.collection('lacquerplans').countDocuments(),
    PrintingPlan: await db.collection('printingplans').countDocuments(),
    PlainBottleStock: await db.collection('plainbottlestocks').countDocuments(),
    Incoming: await db.collection('incomings').countDocuments(),
    BottlePerBox: await db.collection('bottleperboxes').countDocuments()
  };
  console.log('Post-UI Cleanup Baseline Counts:', counts);
  await mongoose.disconnect();
}

cleanup().catch(console.error);
