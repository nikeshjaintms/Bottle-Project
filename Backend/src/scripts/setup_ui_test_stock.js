const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const BottlePerBox = require('../models/BottlePerBox');
const Incoming = require('../models/Incoming');
const User = require('../models/User');
const { computeLivePlainStock } = require('../utils/stockRecompute');

async function setup() {
  await mongoose.connect('mongodb://127.0.0.1:27017/shayona-production');
  const TEST_DATE = '2029-12-15';
  await Incoming.deleteMany({ documentDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });

  const bpb = await BottlePerBox.findOne({
    $or: [{ bottleName: /20 ML SAAB/i }, { plainBottleName: /20 ML SAAB/i }]
  }).lean();

  const u = await User.findOne().lean();
  const currentStock = await computeLivePlainStock('20 ML SAAB', '6a17e8ede933dc474615eb96', TEST_DATE, null);
  const needed = 195000 - currentStock;

  const inc = await Incoming.create({
    billToId: '6a17e8ede933dc474615eb96',
    supplierId: '6a17e8ede933dc474615eb96',
    incomingType: 'PLAIN',
    inwardType: 'PLAIN_BOTTLE',
    documentDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
    createdBy: u._id,
    items: [{
      bottleId: bpb._id,
      plainBottleName: '20 ML SAAB',
      totalQty: needed,
      qty: Math.floor(needed / 100),
      box: 100
    }],
    status: 'RECEIVED'
  });

  const verified = await computeLivePlainStock('20 ML SAAB', '6a17e8ede933dc474615eb96', TEST_DATE, null);
  console.log(`UI Test Stock Ready! Incoming ID: ${inc._id}, Verified stock: ${verified}`);
  await mongoose.disconnect();
}

setup().catch(console.error);
