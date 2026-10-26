const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const LacquerPlan = require('../models/LacquerPlan');
const PrintingPlan = require('../models/PrintingPlan');
const PlainBottleStock = require('../models/PlainBottleStock');
const Incoming = require('../models/Incoming');

async function cleanup() {
  await mongoose.connect('mongodb://127.0.0.1:27017/shayona-production');
  const TEST_DATE = '2029-12-15';
  await Incoming.deleteMany({ documentDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
  await LacquerPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
  await PrintingPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });

  const finalCounts = {
    lacquer: await LacquerPlan.countDocuments(),
    printing: await PrintingPlan.countDocuments(),
    stock: await PlainBottleStock.countDocuments()
  };
  console.log('--- DB Counts After Cleanup ---', finalCounts);
  await mongoose.disconnect();
}

cleanup().catch(console.error);
