const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const PlainBottleStock = require('../src/models/PlainBottleStock');
const Incoming = require('../src/models/Incoming');
const BottlePerBox = require('../src/models/BottlePerBox');
const { recomputePlainStock } = require('../src/utils/stockRecompute');
const Company = require('../src/models/Company');

async function main() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // Clean any test docs on 2030-06-15
  await Incoming.deleteMany({
    $or: [
      { supplierName: { $regex: /TEST/i } },
      { documentDate: { $gte: new Date('2030-01-01') } }
    ]
  });
  await LacquerPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await PrintingPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });


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
  console.log('Current Clean Baseline Counts:', counts);

  // Check existing stock of 100 ML MICRON for AROMA
  const { computeLivePlainStock } = require('../src/utils/stockRecompute');
  const stockInfo = await computeLivePlainStock('100 ML MICRON', aroma._id, '2030-06-15');
  console.log('Stock for AROMA 100 ML MICRON on 2030-06-15 before test seed:', stockInfo);

  await mongoose.disconnect();
}

main().catch(console.error);
