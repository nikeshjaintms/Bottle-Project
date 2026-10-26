const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });

const LacquerPlan = require('../models/LacquerPlan');
const PrintingPlan = require('../models/PrintingPlan');
const PlainBottleStock = require('../models/PlainBottleStock');
const BottlePerBox = require('../models/BottlePerBox');
const Company = require('../models/Company');
const Brand = require('../models/Brand');
const Variant = require('../models/Variant');
const Incoming = require('../models/Incoming');

const BASE_URL = 'http://localhost:5000/api';

const connectDB = require('../config/db');

async function run() {
  const uri = 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);
  console.log('Connected to', uri);

  const TEST_DATE = '2029-12-15';
  await Incoming.deleteMany({ documentDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
  await LacquerPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
  await PrintingPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });

  const initialCounts = {
    lacquer: await LacquerPlan.countDocuments(),
    printing: await PrintingPlan.countDocuments(),
    stock: await PlainBottleStock.countDocuments()
  };

  console.log('--- Initial Counts ---', initialCounts);


  const company = await Company.findOne({ name: /TPP/i }).lean();
  let bpb = await BottlePerBox.findOne({
    $or: [{ bottleName: /20 ML SAAB/i }, { plainBottleName: /20 ML SAAB/i }]
  }).lean();

  if (!bpb) {
    bpb = await BottlePerBox.create({
      bottleName: '20 ML SAAB',
      plainBottleName: '20 ML SAAB',
      bottlePerBox: 100,
      status: true
    });
  }

  const brand1 = await Brand.findById('6a18077ce933dc474615ebbc').lean(); // BEARDO
  const brand2 = await Brand.findById('6a17e921e933dc474615eb97').lean(); // YARDLEY LONDON
  const variant1 = '6a3a5359a7a2fa427e5b19a8'; // DEVIL OUD
  const variant2 = '6a3e86e1a7a2fa427e5b1ab7'; // DON
  const brand2Variant = '6a1a60f930ade06a099b49a1'; // GOLD 

  console.log(`Using Company: ${company.name} (${company._id})`);
  console.log(`Using Plain Bottle: ${bpb.plainBottleName || bpb.bottleName} (${bpb._id})`);
  console.log(`Using Brand1: ${brand1.name}, Brand2: ${brand2.name}`);

const User = require('../models/User');

  const adminUser = await User.findOne().lean();
  console.log(`Using Admin User: ${adminUser ? adminUser._id : 'none'}`);

  const { computeLivePlainStock } = require('../utils/stockRecompute');
  const bottleName = bpb.plainBottleName || bpb.bottleName;
  const currentStock = await computeLivePlainStock(bottleName, company._id, TEST_DATE, null);
  const incomingQty = 195000 - currentStock;
  console.log(`Current stock before test incoming: ${currentStock}. Adding incoming: ${incomingQty} so available = 195,000.`);

  // 1. Create test Incoming stock so available becomes exactly 195,000 on TEST_DATE
  let testIncoming = null;
  testIncoming = await Incoming.create({
    billToId: company._id,
    supplierId: company._id,
    incomingType: 'PLAIN',
    inwardType: 'PLAIN_BOTTLE',
    documentDate: new Date(`${TEST_DATE}T00:00:00.000Z`),
    createdBy: adminUser ? adminUser._id : new mongoose.Types.ObjectId(),
    items: [
      {
        bottleId: bpb._id,
        plainBottleName: bottleName,
        totalQty: incomingQty,
        qty: Math.floor(incomingQty / 100),
        box: 100
      }
    ],
    status: 'RECEIVED'
  });
  const verifiedStock = await computeLivePlainStock(bottleName, company._id, TEST_DATE, null);
  console.log(`Verified available stock on ${TEST_DATE}: ${verifiedStock}`);
  console.log(`Created test Incoming of 195,000 bottles on ${TEST_DATE} (ID: ${testIncoming._id})`);

  const createdPlanIds = [];

  try {
    // -------------------------------------------------------------
    // Test Case 5: Direct API call with coated above available (196000 > 195000)
    // -------------------------------------------------------------
    console.log('\n--- Running Test Case 5: Direct API call with coated 196,000 (above available 195,000) ---');
    try {
      await axios.post(`${BASE_URL}/lacquer-plan`, {
        planDate: TEST_DATE,
        companyId: company._id,
        brandId: brand1._id,
        variantId: variant1,
        bottleName: '20 ML SAAB',
        colour: 'GOLD',
        process: 'C',
        orderQty: 5000,
        coatedQty: 196000
      });
      console.error('FAIL: Test Case 5 did not return 400 error!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✔ SUCCESS: Returned 400 with message: "${err.response.data.message}"`);
        if (err.response.data.message.includes('Only 195000 bottles available')) {
          console.log('✔ Message accurately reports available 195000 and total entry.');
        }
      } else {
        console.error('FAIL: Unexpected response in Test Case 5:', err.message);
      }
    }

    // -------------------------------------------------------------
    // Test Case 6: Order Qty above available (250,000 > 195,000) saves fine with yellow warning
    // -------------------------------------------------------------
    console.log('\n--- Running Test Case 6: Order Qty 250,000 > 195,000 with coated 1,000 ---');
    const resCase6 = await axios.post(`${BASE_URL}/lacquer-plan`, {
      planDate: TEST_DATE,
      companyId: company._id,
      brandId: brand1._id,
      variantId: variant1,
      bottleName: '20 ML SAAB',
      colour: 'GOLD',
      process: 'C',
      orderQty: 250000,
      coatedQty: 1000
    });
    console.log(`✔ SUCCESS: Order Qty > available saves without blocking. ID: ${resCase6.data.data._id}`);
    createdPlanIds.push(resCase6.data.data._id);

    // Clean up case 6 plan before next pool tests
    await LacquerPlan.findByIdAndDelete(resCase6.data.data._id);
    await PrintingPlan.deleteMany({ lacquerPlanId: resCase6.data.data._id });
    createdPlanIds.pop();

    // -------------------------------------------------------------
    // Test Case 2: Multi-row pool total (100000 + 95000 = 195000 saves, 100000 + 95001 = 195001 fails)
    // -------------------------------------------------------------
    console.log('\n--- Running Test Case 2: Multi-row pool total 195,001 fails; 195,000 saves ---');
    try {
      await axios.post(`${BASE_URL}/lacquer-plan`, [
        {
          planDate: TEST_DATE,
          companyId: company._id,
          brandId: brand1._id,
          variantId: variant1,
          bottleName: '20 ML SAAB',
          colour: 'GOLD',
          process: 'C',
          orderQty: 100000,
          coatedQty: 100000
        },
        {
          planDate: TEST_DATE,
          companyId: company._id,
          brandId: brand1._id,
          variantId: variant2,
          bottleName: '20 ML SAAB',
          colour: 'SILVER',
          process: 'C',
          orderQty: 95000,
          coatedQty: 95001
        }
      ]);
      console.error('FAIL: Total 195,001 did not block save!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✔ SUCCESS: Total 195,001 blocked with 400: "${err.response.data.message}"`);
      } else {
        console.error('FAIL: Unexpected response:', err.message);
      }
    }

    const resCase2 = await axios.post(`${BASE_URL}/lacquer-plan`, [
      {
        planDate: TEST_DATE,
        companyId: company._id,
        brandId: brand1._id,
        variantId: variant1,
        bottleName: '20 ML SAAB',
        colour: 'GOLD',
        process: 'C',
        orderQty: 100000,
        coatedQty: 100000
      },
      {
        planDate: TEST_DATE,
        companyId: company._id,
        brandId: brand1._id,
        variantId: variant2,
        bottleName: '20 ML SAAB',
        colour: 'SILVER',
        process: 'C',
        orderQty: 95000,
        coatedQty: 95000
      }
    ]);
    console.log(`✔ SUCCESS: Exactly 195,000 saves successfully!`);
    resCase2.data.data.forEach(p => createdPlanIds.push(p._id));

    // Clean up case 2 plans
    for (const p of resCase2.data.data) {
      await LacquerPlan.findByIdAndDelete(p._id);
      await PrintingPlan.deleteMany({ lacquerPlanId: p._id });
    }
    createdPlanIds.length = 0;

    // -------------------------------------------------------------
    // Test Case 3: Same pool across two brand sections checked together
    // -------------------------------------------------------------
    console.log('\n--- Running Test Case 3: Same pool across Brand 1 and Brand 2 (100,000 + 96,000 = 196,000 fails) ---');
    try {
      await axios.post(`${BASE_URL}/lacquer-plan`, [
        {
          planDate: TEST_DATE,
          companyId: company._id,
          brandId: brand1._id,
          variantId: variant1,
          bottleName: '20 ML SAAB',
          colour: 'GOLD',
          process: 'C',
          orderQty: 100000,
          coatedQty: 100000
        },
        {
          planDate: TEST_DATE,
          companyId: company._id,
          brandId: brand2._id,
          variantId: brand2Variant,
          bottleName: '20 ML SAAB',
          colour: 'BLACK',
          process: 'C',
          orderQty: 96000,
          coatedQty: 96000
        }
      ]);
      console.error('FAIL: Multi-brand total 196,000 did not block save!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✔ SUCCESS: Multi-brand total 196,000 blocked with 400: "${err.response.data.message}"`);
      } else {
        console.error('FAIL: Unexpected response:', err.message);
      }
    }

    // -------------------------------------------------------------
    // Test Case 4: Edit a saved plan with coated 1000: opening available unchanged,
    // raising to 195,000 saves, 195,001 fails (no double counting).
    // -------------------------------------------------------------
    console.log('\n--- Running Test Case 4: Edit saved plan with coated 1,000 ---');
    const initialPlanRes = await axios.post(`${BASE_URL}/lacquer-plan`, {
      planDate: TEST_DATE,
      companyId: company._id,
      brandId: brand1._id,
      variantId: variant1,
      bottleName: '20 ML SAAB',
      colour: 'GOLD',
      process: 'C',
      orderQty: 1000,
      coatedQty: 1000
    });
    const savedPlanId = initialPlanRes.data.data._id;
    createdPlanIds.push(savedPlanId);

    // Verify computed stats with excludePlanIds
    const statsRes = await axios.get(`${BASE_URL}/lacquer-plan/stats/computed`, {
      params: {
        bottleName: '20 ML SAAB',
        companyId: company._id.toString(),
        planDate: TEST_DATE,
        excludePlanIds: savedPlanId.toString()
      }
    });
    console.log(`Computed stats for Edit (excludePlanIds): openingStock=${statsRes.data.data.openingStock}, plainStock=${statsRes.data.data.plainStock}`);
    if (statsRes.data.data.openingStock === 195000) {
      console.log('✔ Opening available is unchanged at 195,000 (no double counting of its own 1,000).');
    }

    // Try updating to 195,001 -> should fail
    try {
      await axios.put(`${BASE_URL}/lacquer-plan/${savedPlanId}`, {
        planDate: TEST_DATE,
        companyId: company._id,
        brandId: brand1._id,
        variantId: variant1,
        bottleName: '20 ML SAAB',
        colour: 'GOLD',
        process: 'C',
        orderQty: 1000,
        coatedQty: 195001,
        excludePlanIds: savedPlanId.toString()
      });
      console.error('FAIL: Edit to 195,001 did not block!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✔ SUCCESS: Edit update to 195,001 blocked with 400: "${err.response.data.message}"`);
      }
    }

    // Update to exactly 195,000 -> should succeed
    const updateRes = await axios.put(`${BASE_URL}/lacquer-plan/${savedPlanId}`, {
      planDate: TEST_DATE,
      companyId: company._id,
      brandId: brand1._id,
      variantId: variant1,
      bottleName: '20 ML SAAB',
      colour: 'GOLD',
      process: 'C',
      orderQty: 1000,
      coatedQty: 195000,
      excludePlanIds: savedPlanId.toString()
    });
    console.log(`✔ SUCCESS: Edit update to exactly 195,000 saved! New coated: ${updateRes.data.data.coatedQty}`);

  } finally {
    // -------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------
    if (testIncoming && testIncoming._id) {
      await Incoming.findByIdAndDelete(testIncoming._id);
    }
    for (const pid of createdPlanIds) {
      await LacquerPlan.findByIdAndDelete(pid);
      await PrintingPlan.deleteMany({ lacquerPlanId: pid });
    }
    // Delete any remaining test plans on TEST_DATE
    const delRes = await LacquerPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
    await PrintingPlan.deleteMany({ planDate: new Date(`${TEST_DATE}T00:00:00.000Z`) });
    console.log(`Cleaned up test incoming and ${delRes.deletedCount} lacquer plans.`);

    const finalCounts = {
      lacquer: await LacquerPlan.countDocuments(),
      printing: await PrintingPlan.countDocuments(),
      stock: await PlainBottleStock.countDocuments()
    };
    console.log('--- Final Counts After Cleanup ---', finalCounts);
    console.log('Counts match:', JSON.stringify(initialCounts) === JSON.stringify(finalCounts));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
