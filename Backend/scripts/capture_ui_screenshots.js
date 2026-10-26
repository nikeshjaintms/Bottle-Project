const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const path = require('path');
const fs = require('fs');

const Incoming = require('../src/models/Incoming');
const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const BottlePerBox = require('../src/models/BottlePerBox');
const Company = require('../src/models/Company');
const Brand = require('../src/models/Brand');
const Variant = require('../src/models/Variant');
const User = require('../src/models/User');
const { computeLivePlainStock, recomputePlainStock } = require('../src/utils/stockRecompute');
const { computePlanGroupKey } = require('../src/utils/lacquerGroupKey');

const ARTIFACT_DIR = 'C:/Users/prabh/.gemini/antigravity-ide/brain/43823b31-a789-4838-b48d-d6b3e42367f6';
const testDate = '2030-06-15';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);

  console.log('--- Cleaning and setting up test data on 2030-06-15 ---');
  await Incoming.deleteMany({ documentDate: { $gte: new Date('2030-01-01') } });
  await LacquerPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await PrintingPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await Variant.deleteMany({ variantName: 'SMOKING HOT (TEST)' });

  const aroma = await Company.findOne({ name: { $regex: /^AROMA$/i } });
  const mcaffeine = await Brand.findOne({ name: { $regex: /M-CAFFEINE/i } });
  const adfBrand = await Brand.findOne({ companyId: aroma._id, _id: { $ne: mcaffeine._id } });
  const bpb100 = await BottlePerBox.findOne({
    $or: [
      { bottleName: { $regex: /100\s*ML\s*MICRON/i } },
      { plainBottleName: { $regex: /100\s*ML\s*MICRON/i } }
    ]
  });
  const user = await User.findOne({ email: 'techomax@gmail.com' });
  const vCherry = await Variant.findById('6aa7c73b56f70dae84c3f3c3');
  const vFien = await Variant.findById('6aa91dcb69d2186d2f39b482');

  const priorStock = await computeLivePlainStock('100 ML MICRON', aroma._id, testDate);
  const existingOpening = Number(priorStock.openingStock || 0);
  const seedQty = Math.max(0, 196000 - existingOpening);

  await Incoming.create({
    documentDate: new Date(testDate),
    companyId: aroma._id,
    billToId: aroma._id,
    supplierName: 'TEST SUPPLIER PROMPT J',
    invoiceNo: 'TEST-PJ-PUPPETEER',
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

  const vThird = await Variant.create({
    bottleSpecId: vCherry.bottleSpecId,
    variantName: 'SMOKING HOT (TEST)',
    coatingShade: 'TR BLUE',
    isDeleted: false,
    status: true
  });

  console.log('Incoming seeded. Starting browser automation...');

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1536, height: 900 }
  });
  const page = await browser.newPage();

  // 1. Login
  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await page.type('input[type="email"]', 'techomax@gmail.com');
    await page.type('input[type="password"]', 'Techomax@123');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    ]);
  }
  await sleep(1500);

  // 2. Screenshot 1: Add before first save
  console.log('Navigating to Add page for 2030-06-15...');
  await page.goto(`http://localhost:5173/lacquer-plan/add?date=${testDate}`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Type Company: AROMA
  const compInput = await page.$('.form-group:nth-of-type(1) input');
  if (compInput) {
    await compInput.click();
    await compInput.type('AROMA');
    await page.keyboard.press('Enter');
    await sleep(600);
  }

  // Type Brand: M-CAFFEINE
  const brandInput = await page.$('.form-group:nth-of-type(2) input');
  if (brandInput) {
    await brandInput.click();
    await brandInput.type('M-CAFFEINE');
    await page.keyboard.press('Enter');
    await sleep(600);
  }

  // Select plain bottle 100 ML MICRON
  const bottleInput = await page.$('table tbody tr:nth-child(1) td:nth-child(2) input');
  if (bottleInput) {
    await bottleInput.click();
    await bottleInput.type('100 ML MICRON');
    await page.keyboard.press('Enter');
    await sleep(1000);
  }

  // Row 1 inputs: Order 100000, Coated 10000
  const orderInput1 = await page.$('table tbody tr:nth-child(1) td:nth-child(6) input');
  if (orderInput1) {
    await orderInput1.click({ clickCount: 3 });
    await orderInput1.type('100000');
  }
  const coatedInput1 = await page.$('table tbody tr:nth-child(1) td:nth-child(7) input');
  if (coatedInput1) {
    await coatedInput1.click({ clickCount: 3 });
    await coatedInput1.type('10000');
  }

  // Add Row 2
  const addRowBtn = await page.$('button.btn-outline-primary');
  if (addRowBtn) {
    await addRowBtn.click();
    await sleep(600);
  }

  const bottleInput2 = await page.$('table tbody tr:nth-child(2) td:nth-child(2) input');
  if (bottleInput2) {
    await bottleInput2.click();
    await bottleInput2.type('100 ML MICRON');
    await page.keyboard.press('Enter');
    await sleep(1000);
  }

  const orderInput2 = await page.$('table tbody tr:nth-child(2) td:nth-child(6) input');
  if (orderInput2) {
    await orderInput2.click({ clickCount: 3 });
    await orderInput2.type('100000');
  }
  const coatedInput2 = await page.$('table tbody tr:nth-child(2) td:nth-child(7) input');
  if (coatedInput2) {
    await coatedInput2.click({ clickCount: 3 });
    await coatedInput2.type('50000');
  }

  await sleep(1200);
  const screenshot1Path = path.join(ARTIFACT_DIR, 'screenshot_1_add_before_save.png');
  await page.screenshot({ path: screenshot1Path, fullPage: true });
  console.log('Saved screenshot 1:', screenshot1Path);

  // Now create the 2 plans in DB
  const plansData = [
    {
      planDate: new Date(testDate),
      companyId: aroma._id,
      brandId: mcaffeine._id,
      brandName: mcaffeine.name,
      bottleName: '100 ML MICRON',
      plainBottle: '100 ML MICRON',
      variantId: vCherry._id,
      colour: 'TR PURPLE+CLEAR',
      coatingShade: 'TR PURPLE+CLEAR',
      process: 'C+P',
      orderQty: 100000,
      coatingCompletedQty: 10000,
      coatedQty: 10000,
      plainStock: 196000,
      createdBy: user._id,
      status: true
    },
    {
      planDate: new Date(testDate),
      companyId: aroma._id,
      brandId: mcaffeine._id,
      brandName: mcaffeine.name,
      bottleName: '100 ML MICRON',
      plainBottle: '100 ML MICRON',
      variantId: vFien._id,
      colour: 'TR BLACK',
      coatingShade: 'TR BLACK',
      process: 'F',
      orderQty: 100000,
      coatingCompletedQty: 50000,
      coatedQty: 50000,
      plainStock: 196000,
      createdBy: user._id,
      status: true
    }
  ];

  for (let i = 0; i < plansData.length; i++) {
    const item = plansData[i];
    item.groupKey = await computePlanGroupKey(item);
    item.rowSeq = i + 1;
  }
  const createdPlans = await LacquerPlan.insertMany(plansData);
  await recomputePlainStock('100 ML MICRON', aroma._id);
  console.log('Saved 2 plans in DB. GroupKey:', createdPlans[0].groupKey);

  // 3. Screenshot 2: Edit after save (showing 196000)
  console.log('Navigating to Edit page for plan 1...');
  await page.goto(`http://localhost:5173/lacquer-plan/edit/${createdPlans[0]._id}`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  const screenshot2Path = path.join(ARTIFACT_DIR, 'screenshot_2_edit_after_save_196k.png');
  await page.screenshot({ path: screenshot2Path, fullPage: true });
  console.log('Saved screenshot 2:', screenshot2Path);

  // 4. Screenshot 3: Add again (showing 136000, joined group)
  console.log('Navigating to Add page again for 2030-06-15...');
  await page.goto(`http://localhost:5173/lacquer-plan/add?date=${testDate}`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  const compSelectAgain = await page.$('.form-group:nth-of-type(1) input');
  if (compSelectAgain) {
    await compSelectAgain.click();
    await compSelectAgain.type('AROMA');
    await page.keyboard.press('Enter');
    await sleep(600);
  }
  const brandSelectAgain = await page.$('.form-group:nth-of-type(2) input');
  if (brandSelectAgain) {
    await brandSelectAgain.click();
    await brandSelectAgain.type('M-CAFFEINE');
    await page.keyboard.press('Enter');
    await sleep(600);
  }
  const bottleSelectAgain = await page.$('table tbody tr:nth-child(1) td:nth-child(2) input');
  if (bottleSelectAgain) {
    await bottleSelectAgain.click();
    await bottleSelectAgain.type('100 ML MICRON');
    await page.keyboard.press('Enter');
    await sleep(1000);
  }

  const orderInput3 = await page.$('table tbody tr:nth-child(1) td:nth-child(6) input');
  if (orderInput3) {
    await orderInput3.click({ clickCount: 3 });
    await orderInput3.type('5000');
  }
  const coatedInput3 = await page.$('table tbody tr:nth-child(1) td:nth-child(7) input');
  if (coatedInput3) {
    await coatedInput3.click({ clickCount: 3 });
    await coatedInput3.type('1000');
  }

  await sleep(1200);
  const screenshot3Path = path.join(ARTIFACT_DIR, 'screenshot_3_add_again_136k.png');
  await page.screenshot({ path: screenshot3Path, fullPage: true });
  console.log('Saved screenshot 3:', screenshot3Path);

  // Save the 3rd row in DB
  const thirdPlanData = {
    planDate: new Date(testDate),
    companyId: aroma._id,
    brandId: mcaffeine._id,
    brandName: mcaffeine.name,
    bottleName: '100 ML MICRON',
    plainBottle: '100 ML MICRON',
    variantId: vThird._id,
    colour: 'TR BLUE',
    coatingShade: 'TR BLUE',
    process: 'P',
    orderQty: 5000,
    coatingCompletedQty: 1000,
    coatedQty: 1000,
    plainStock: 136000,
    groupKey: createdPlans[0].groupKey,
    rowSeq: 3,
    createdBy: user._id,
    status: true
  };
  await LacquerPlan.create(thirdPlanData);

  // Create row for ADF ONLY COATING (shared pool brand)
  const brand2Data = {
    planDate: new Date(testDate),
    companyId: aroma._id,
    brandId: adfBrand._id,
    brandName: adfBrand.name,
    bottleName: '100 ML MICRON',
    plainBottle: '100 ML MICRON',
    variantId: vCherry._id,
    colour: 'OPQ WHITE',
    coatingShade: 'OPQ WHITE',
    process: 'C',
    orderQty: 10000,
    coatingCompletedQty: 5000,
    coatedQty: 5000,
    plainStock: 135000,
    createdBy: user._id,
    status: true
  };
  brand2Data.groupKey = await computePlanGroupKey(brand2Data);
  brand2Data.rowSeq = 1;
  await LacquerPlan.create(brand2Data);
  await recomputePlainStock('100 ML MICRON', aroma._id);

  // 5. Screenshot 5: shared-pool brand case (ADF ONLY COATING)
  console.log('Navigating to Add page for shared pool brand ADF ONLY COATING...');
  await page.goto(`http://localhost:5173/lacquer-plan/add?date=${testDate}`, { waitUntil: 'networkidle2' });
  await sleep(1500);

  const compSelect5 = await page.$('.form-group:nth-of-type(1) input');
  if (compSelect5) {
    await compSelect5.click();
    await compSelect5.type('AROMA');
    await page.keyboard.press('Enter');
    await sleep(600);
  }
  const brandSelect5 = await page.$('.form-group:nth-of-type(2) input');
  if (brandSelect5) {
    await brandSelect5.click();
    await brandSelect5.type('ADF ONLY COATING');
    await page.keyboard.press('Enter');
    await sleep(600);
  }
  const bottleSelect5 = await page.$('table tbody tr:nth-child(1) td:nth-child(2) input');
  if (bottleSelect5) {
    await bottleSelect5.click();
    await bottleSelect5.type('100 ML MICRON');
    await page.keyboard.press('Enter');
    await sleep(1000);
  }

  await sleep(1200);
  const screenshot5Path = path.join(ARTIFACT_DIR, 'screenshot_5_shared_pool_brand.png');
  await page.screenshot({ path: screenshot5Path, fullPage: true });
  console.log('Saved screenshot 5:', screenshot5Path);

  // 6. Screenshot 4: List view
  console.log('Navigating to List view for 2030-06-15...');
  await page.goto(`http://localhost:5173/lacquer-plan?date=${testDate}`, { waitUntil: 'networkidle2' });
  await sleep(2500);

  const screenshot4Path = path.join(ARTIFACT_DIR, 'screenshot_4_list_view.png');
  await page.screenshot({ path: screenshot4Path, fullPage: true });
  console.log('Saved screenshot 4:', screenshot4Path);

  await browser.close();

  // Clean up all test data and verify baseline counts
  console.log('\n--- Cleaning up all test data ---');
  await Incoming.deleteMany({ documentDate: { $gte: new Date('2030-01-01') } });
  await LacquerPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await PrintingPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
  await Variant.deleteMany({ variantName: 'SMOKING HOT (TEST)' });

  await recomputePlainStock('100 ML MICRON', aroma._id);

  const db = mongoose.connection.db;
  const finalCounts = {
    LacquerPlan: await db.collection('lacquerplans').countDocuments(),
    PrintingPlan: await db.collection('printingplans').countDocuments(),
    PlainBottleStock: await db.collection('plainbottlestocks').countDocuments(),
    Incoming: await db.collection('incomings').countDocuments(),
    BottlePerBox: await db.collection('bottleperboxes').countDocuments()
  };
  console.log('Final Clean DB Counts after Screenshots:', finalCounts);

  await mongoose.disconnect();
}

main().catch(console.error);
