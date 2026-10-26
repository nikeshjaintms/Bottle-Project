const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const Incoming = require('../src/models/Incoming');
const BottlePerBox = require('../src/models/BottlePerBox');
const Company = require('../src/models/Company');
const Variant = require('../src/models/Variant');
const User = require('../src/models/User');
const { computeLivePlainStock } = require('../src/utils/stockRecompute');

async function setup() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);

  const testDate = '2030-06-15';
  const aroma = await Company.findOne({ name: { $regex: /^AROMA$/i } });
  const bpb100 = await BottlePerBox.findOne({
    $or: [
      { bottleName: { $regex: /100\s*ML\s*MICRON/i } },
      { plainBottleName: { $regex: /100\s*ML\s*MICRON/i } }
    ]
  });
  const user = await User.findOne({ email: 'techomax@gmail.com' });

  const priorStock = await computeLivePlainStock('100 ML MICRON', aroma._id, testDate);
  const existingOpening = Number(priorStock.openingStock || 0);
  const seedQty = Math.max(0, 196000 - existingOpening);

  const inc = await Incoming.create({
    documentDate: new Date(testDate),
    companyId: aroma._id,
    billToId: aroma._id,
    supplierName: 'TEST SUPPLIER PROMPT J',
    invoiceNo: 'TEST-PJ-UI-001',
    createdBy: user._id,
    items: [{
      bottleId: bpb100._id,
      plainBottle: bpb100.plainBottleName || bpb100.bottleName,
      totalQty: seedQty,
      qty: seedQty,
      box: 1
    }],
    isDeleted: false
  });

  const vCherry = await Variant.findById('6aa7c73b56f70dae84c3f3c3');
  let vThird = await Variant.findOne({ variantName: 'SMOKING HOT (TEST)' });
  if (!vThird) {
    vThird = await Variant.create({
      bottleSpecId: vCherry.bottleSpecId,
      variantName: 'SMOKING HOT (TEST)',
      coatingShade: 'TR BLUE',
      isDeleted: false,
      status: true
    });
  }

  console.log('UI test setup complete. Seeded Incoming ID:', inc._id, 'Seed Qty:', seedQty);
  await mongoose.disconnect();
}

setup().catch(console.error);
