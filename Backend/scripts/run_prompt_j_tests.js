const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const jwt = require('jsonwebtoken');

const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const PlainBottleStock = require('../src/models/PlainBottleStock');
const Incoming = require('../src/models/Incoming');
const BottlePerBox = require('../src/models/BottlePerBox');
const Company = require('../src/models/Company');
const Brand = require('../src/models/Brand');
const Variant = require('../src/models/Variant');
const User = require('../src/models/User');
const { computePlanGroupKey } = require('../src/utils/lacquerGroupKey');
const { computeLivePlainStock, recomputePlainStock } = require('../src/utils/stockRecompute');

const BASE_URL = 'http://localhost:5000/api';

async function runPromptJTests() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('=== STARTING PROMPT J COMPREHENSIVE SUITE ===');

  // Baseline counts
  const baselineCounts = {
    LacquerPlan: await db.collection('lacquerplans').countDocuments(),
    PrintingPlan: await db.collection('printingplans').countDocuments(),
    PlainBottleStock: await db.collection('plainbottlestocks').countDocuments(),
    Incoming: await db.collection('incomings').countDocuments(),
    BottlePerBox: await db.collection('bottleperboxes').countDocuments()
  };
  console.log('Baseline DB Counts:', baselineCounts);

  // Auth token
  const user = await User.findOne({ email: 'techomax@gmail.com' });
  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1d' }
  );

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Masters
  const aroma = await Company.findOne({ name: { $regex: /^AROMA$/i } });
  const shreno = await Company.findOne({ name: { $regex: /^SHRENO$/i } });
  const mcaffeine = await Brand.findOne({ name: { $regex: /M-CAFFEINE/i } });
  const adfBrand = await Brand.findOne({ companyId: aroma._id, _id: { $ne: mcaffeine._id } });
  const bpb100 = await BottlePerBox.findOne({
    $or: [
      { bottleName: { $regex: /100\s*ML\s*MICRON/i } },
      { plainBottleName: { $regex: /100\s*ML\s*MICRON/i } }
    ]
  });
  const vCherry = await Variant.findById('6aa7c73b56f70dae84c3f3c3');
  const vFien = await Variant.findById('6aa91dcb69d2186d2f39b482');

  // Create temporary 3rd variant under same bottle spec for test
  const vThird = await Variant.create({
    bottleSpecId: vCherry.bottleSpecId,
    variantName: 'SMOKING HOT (TEST)',
    coatingShade: 'TR BLUE',
    isDeleted: false,
    status: true
  });

  const testDate = '2030-06-15';
  const testResults = [];

  const recordResult = (name, expected, actual, pass) => {
    testResults.push({
      case: name,
      expected: String(expected),
      actual: String(actual),
      result: pass ? 'PASS' : 'FAIL'
    });
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} -> Expected: ${expected}, Actual: ${actual}`);
  };

  let incomingDoc = null;

  try {
    // 1. Seed Incoming on testDate so available opening stock is exactly 196,000
    console.log('\n--- Step 1: Seed Incoming on 2030-06-15 for AROMA 100 ML MICRON ---');
    const priorStock = await computeLivePlainStock('100 ML MICRON', aroma._id, testDate);
    const existingOpening = Number(priorStock.openingStock || 0);
    const seedQty = Math.max(0, 196000 - existingOpening);
    console.log(`Existing opening stock: ${existingOpening}, seeding: ${seedQty}`);

    incomingDoc = await Incoming.create({
      documentDate: new Date(testDate),
      companyId: aroma._id,
      billToId: aroma._id,
      supplierName: 'TEST SUPPLIER PROMPT J',
      invoiceNo: 'TEST-PJ-001',
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

    // Independent raw computation for stock on testDate
    const rawIncomings = await db.collection('incomings').aggregate([
      { $match: { isDeleted: { $ne: true }, billToId: aroma._id, documentDate: { $lte: new Date(testDate) } } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'bottleperboxes',
          localField: 'items.bottleId',
          foreignField: '_id',
          as: 'bpb'
        }
      },
      { $unwind: '$bpb' },
      {
        $match: {
          $or: [
            { 'bpb.bottleName': { $regex: /100\s*ML\s*MICRON/i } },
            { 'bpb.plainBottleName': { $regex: /100\s*ML\s*MICRON/i } }
          ]
        }
      },
      { $group: { _id: null, total: { $sum: '$items.totalQty' } } }
    ]).toArray();
    const rawIncTotal = rawIncomings[0]?.total || 0;

    const rawPlansPrior = await db.collection('lacquerplans').aggregate([
      { $match: { isDeleted: false, companyId: aroma._id, planDate: { $lt: new Date(testDate) }, bottleName: { $regex: /100\s*ML\s*MICRON/i } } },
      { $group: { _id: null, totalCoated: { $sum: { $ifNull: ['$coatingCompletedQty', '$coatedQty'] } } } }
    ]).toArray();
    const rawCoatedPrior = rawPlansPrior[0]?.totalCoated || 0;

    const rawOpeningStock = rawIncTotal - rawCoatedPrior;
    recordResult('Seed Incoming -> Raw Opening Stock is 196000', 196000, rawOpeningStock, rawOpeningStock === 196000);

    // Initial Add stock check via API
    const initAddStockRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${testDate}`, { headers: authHeaders });
    const initAddStock = await initAddStockRes.json();
    recordResult('Add API shows 196000 before saving', 196000, initAddStock.data.plainStock, initAddStock.data.plainStock === 196000);

    // 2. Same brand: Add 2 rows (M-CAFFEINE, CHERRY WINE 10000 & FIEN-007 50000)
    console.log('\n--- Step 2: Add 2 rows for M-CAFFEINE on 2030-06-15 ---');
    const createRes = await fetch(`${BASE_URL}/lacquer-plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify([
        {
          planDate: testDate,
          companyId: aroma._id.toString(),
          brandId: mcaffeine._id.toString(),
          bottleName: '100 ML MICRON',
          variantId: vCherry._id.toString(),
          colour: 'TR PURPLE+CLEAR',
          coatingShade: 'TR PURPLE+CLEAR',
          process: 'C+P',
          orderQty: 100000,
          coatingCompletedQty: 10000,
          coatedQty: 10000,
          plainStock: 196000
        },
        {
          planDate: testDate,
          companyId: aroma._id.toString(),
          brandId: mcaffeine._id.toString(),
          bottleName: '100 ML MICRON',
          variantId: vFien._id.toString(),
          colour: 'TR BLACK',
          coatingShade: 'TR BLACK',
          process: 'F',
          orderQty: 100000,
          coatingCompletedQty: 50000,
          coatedQty: 50000,
          plainStock: 196000
        }
      ])
    });

    const createData = await createRes.json();
    const row1 = createData.data[0];
    const row2 = createData.data[1];

    const dbRow1 = await LacquerPlan.findById(row1._id);
    const dbRow2 = await LacquerPlan.findById(row2._id);
    const sameGroupKey = Boolean(dbRow1.groupKey) && dbRow1.groupKey === dbRow2.groupKey;
    const correctSeqs = dbRow1.rowSeq === 1 && dbRow2.rowSeq === 2;
    recordResult('Add 2 rows: same groupKey', true, sameGroupKey, sameGroupKey);
    recordResult('Add 2 rows: rowSeq 1 and 2', '1,2', `${dbRow1.rowSeq},${dbRow2.rowSeq}`, correctSeqs);

    // Edit shows 196000 (group excluded, no double deduction)
    const editRes = await fetch(`${BASE_URL}/lacquer-plan/${row1._id}`, { headers: authHeaders });
    const editData = await editRes.json();
    recordResult('Edit API shows 196000 (group excluded)', 196000, editData.plainStock, editData.plainStock === 196000);
    recordResult('Edit loads whole group (2 rows)', 2, editData.groupPlans?.length, editData.groupPlans?.length === 2);

    // Add shows 136000 (196000 - 60000)
    const addStockRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${testDate}`, { headers: authHeaders });
    const addStockData = await addStockRes.json();
    recordResult('Add API shows 136000 (saved 60000 deducted)', 136000, addStockData.data.plainStock, addStockData.data.plainStock === 136000);

    // 3. Different variant, same group: 3rd row (coated 1000) joins group with rowSeq 3
    console.log('\n--- Step 3: Different variant joins group with rowSeq 3 ---');
    const thirdRes = await fetch(`${BASE_URL}/lacquer-plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify([{
        planDate: testDate,
        companyId: aroma._id.toString(),
        brandId: mcaffeine._id.toString(),
        bottleName: '100 ML MICRON',
        variantId: vThird._id.toString(),
        colour: 'TR BLUE',
        coatingShade: 'TR BLUE',
        process: 'P',
        orderQty: 5000,
        coatingCompletedQty: 1000,
        coatedQty: 1000,
        plainStock: 136000
      }])
    });
    const thirdData = await thirdRes.json();
    const row3 = Array.isArray(thirdData.data) ? thirdData.data[0] : thirdData.data;

    const dbRow3 = await LacquerPlan.findById(row3._id);
    const joinsGroup = dbRow3.groupKey === dbRow1.groupKey;
    const thirdSeq = dbRow3.rowSeq === 3;
    recordResult('Third row joins same groupKey', true, joinsGroup, joinsGroup);
    recordResult('Third row gets rowSeq 3', 3, dbRow3.rowSeq, thirdSeq);

    // List shows 1 group of 3 rows
    const listRes = await fetch(`${BASE_URL}/lacquer-plan?date=${testDate}`, { headers: authHeaders });
    const listData = await listRes.json();
    const testPlansInList = listData.data.filter(p => p.groupKey === dbRow1.groupKey);
    recordResult('List shows 1 group of 3 rows', 3, testPlansInList.length, testPlansInList.length === 3);

    // 4. Different brand, same plain bottle (pool shared)
    console.log('\n--- Step 4: Different brand, same plain bottle (pool shared) ---');
    const brand2StockRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&brandId=${adfBrand._id}&planDate=${testDate}`, { headers: authHeaders });
    const brand2Stock = await brand2StockRes.json();
    // 196000 - 61000 = 135000
    recordResult('Second brand shows 135000 available stock', 135000, brand2Stock.data.plainStock, brand2Stock.data.plainStock === 135000);

    const createBrand2Res = await fetch(`${BASE_URL}/lacquer-plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify([{
        planDate: testDate,
        companyId: aroma._id.toString(),
        brandId: adfBrand._id.toString(),
        bottleName: '100 ML MICRON',
        variantId: vCherry._id.toString(),
        colour: 'OPQ WHITE',
        coatingShade: 'OPQ WHITE',
        process: 'C',
        orderQty: 10000,
        coatingCompletedQty: 5000,
        coatedQty: 5000,
        plainStock: 135000
      }])
    });
    const brand2Plan = await createBrand2Res.json();
    const rowBrand2 = Array.isArray(brand2Plan.data) ? brand2Plan.data[0] : brand2Plan.data;
    const dbBrand2 = await LacquerPlan.findById(rowBrand2._id);
    const brand2OwnGroup = dbBrand2.groupKey !== dbRow1.groupKey;
    recordResult('Second brand has its own groupKey', true, brand2OwnGroup, brand2OwnGroup);

    // Check bidirectional deduction: first brand stock reduced by 5000
    const brand1StockAfter = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${testDate}`, { headers: authHeaders });
    const brand1DataAfter = await brand1StockAfter.json();
    recordResult('First brand Add stock reduced to 130000 (196k - 66k)', 130000, brand1DataAfter.data.plainStock, brand1DataAfter.data.plainStock === 130000);

    const editBrand1After = await fetch(`${BASE_URL}/lacquer-plan/${row1._id}`, { headers: authHeaders });
    const editBrand1Data = await editBrand1After.json();
    // 196000 - 5000 = 191000
    recordResult('First brand Edit stock shows 191000 (196k - 5k from brand 2)', 191000, editBrand1Data.plainStock, editBrand1Data.plainStock === 191000);

    // 5. Different company, same bottle: separate pool, no leak
    console.log('\n--- Step 5: Different company, separate pool ---');
    const shrenoStockRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${shreno._id}&planDate=${testDate}`, { headers: authHeaders });
    const shrenoStock = await shrenoStockRes.json();
    recordResult('Different company has 0 stock (no leak)', 0, shrenoStock.data.plainStock, shrenoStock.data.plainStock === 0);

    // 6. Next date: stock carries forward to D+1 and D+2
    console.log('\n--- Step 6: Next date stock carry forward ---');
    const dPlus1 = '2030-06-16';
    const dPlus2 = '2030-06-17';
    const stockD1Res = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${dPlus1}`, { headers: authHeaders });
    const stockD1 = await stockD1Res.json();
    recordResult('Stock carries forward to D+1 (130000)', 130000, stockD1.data.plainStock, stockD1.data.plainStock === 130000);

    const stockD2Res = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${dPlus2}`, { headers: authHeaders });
    const stockD2 = await stockD2Res.json();
    recordResult('Stock carries forward to D+2 (130000)', 130000, stockD2.data.plainStock, stockD2.data.plainStock === 130000);

    // 7. Edit a saved group: change coated 50000 -> 20000 (+30000 stock)
    console.log('\n--- Step 7: Edit saved group & Brand change ---');
    const updateRes = await fetch(`${BASE_URL}/lacquer-plan/${row2._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        coatingCompletedQty: 20000,
        coatedQty: 20000,
        orderQty: 100000,
        excludePlanIds: [row1._id, row2._id, dbRow3._id]
      })
    });
    const updateData = await updateRes.json();
    recordResult('Update row 2 coated to 20000 success', true, updateData.success, updateData.success === true);

    const stockAfterEditRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${testDate}`, { headers: authHeaders });
    const stockAfterEdit = await stockAfterEditRes.json();
    // 196000 - (10000 + 20000 + 1000 + 5000) = 196000 - 36000 = 160000
    recordResult('Pool stock increases by +30000 to 160000', 160000, stockAfterEdit.data.plainStock, stockAfterEdit.data.plainStock === 160000);

    // Change row 3's brand -> moves to brand 2's group
    const moveBrandRes = await fetch(`${BASE_URL}/lacquer-plan/${dbRow3._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        brandId: adfBrand._id.toString()
      })
    });

    const movedData = await moveBrandRes.json();
    console.log('moveBrand status:', moveBrandRes.status, 'movedData:', movedData);

    const dbMovedRow = await LacquerPlan.findById(dbRow3._id);
    console.log('dbMovedRow groupKey:', dbMovedRow.groupKey, 'rowSeq:', dbMovedRow.rowSeq);
    console.log('dbBrand2 groupKey:', dbBrand2.groupKey, 'rowSeq:', dbBrand2.rowSeq);
    console.log('dbRow1 groupKey:', dbRow1.groupKey);
    const movedToBrand2 = dbMovedRow.groupKey === dbBrand2.groupKey;
    const brand2Seq = dbMovedRow.rowSeq === 2;
    recordResult('Row moves to new groupKey on brand edit', true, movedToBrand2, movedToBrand2);
    recordResult('Row receives next rowSeq in new group (rowSeq 2)', 2, dbMovedRow.rowSeq, brand2Seq);


    // Old group renumbered to 1, 2
    const remainingGroup1 = await LacquerPlan.find({ groupKey: dbRow1.groupKey, isDeleted: false }).sort({ rowSeq: 1 });
    const renumberedOld = remainingGroup1.map(p => p.rowSeq).join(',');
    recordResult('Old group renumbered cleanly (1,2)', '1,2', renumberedOld, renumberedOld === '1,2');

    // 8. Delete a row, then whole group -> stock restores
    console.log('\n--- Step 8: Delete row and group & PlainBottleStock raw consistency ---');
    const delRowRes = await fetch(`${BASE_URL}/lacquer-plan/${dbRow2._id}`, { method: 'DELETE', headers: authHeaders });
    recordResult('Delete row 2 success', 200, delRowRes.status, delRowRes.status === 200);

    const groupAfterDel = await LacquerPlan.find({ groupKey: dbRow1.groupKey, isDeleted: false }).sort({ rowSeq: 1 });
    const renumberedAfterDel = groupAfterDel.map(p => p.rowSeq).join(',');
    recordResult('Remaining group renumbered after row delete (1)', '1', renumberedAfterDel, renumberedAfterDel === '1');

    // Delete remaining test plans on testDate
    await LacquerPlan.updateMany({ planDate: new Date(testDate) }, { isDeleted: true });
    await PrintingPlan.updateMany({ planDate: new Date(testDate) }, { isDeleted: true });
    await recomputePlainStock('100 ML MICRON', aroma._id);

    const stockRestoredRes = await fetch(`${BASE_URL}/lacquer-plan/stats/computed?bottleName=100%20ML%20MICRON&companyId=${aroma._id}&planDate=${testDate}`, { headers: authHeaders });
    const stockRestored = await stockRestoredRes.json();
    recordResult('Stock restores to 196000 after deleting all plans', 196000, stockRestored.data.plainStock, stockRestored.data.plainStock === 196000);

    // 9. Limit check: coated above available stock -> 400
    console.log('\n--- Step 9: Limit check (Coated > shown stock) ---');
    const limitRes = await fetch(`${BASE_URL}/lacquer-plan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify([{
        planDate: testDate,
        companyId: aroma._id.toString(),
        brandId: mcaffeine._id.toString(),
        bottleName: '100 ML MICRON',
        variantId: vCherry._id.toString(),
        colour: 'TR PURPLE',
        coatingShade: 'TR PURPLE',
        process: 'C',
        orderQty: 250000,
        coatingCompletedQty: 250000, // Exceeds 196000!
        coatedQty: 250000,
        plainStock: 196000
      }])
    });
    const limitData = await limitRes.json();
    const limitEnforced = limitRes.status === 400 && limitData.available === 196000;
    recordResult('Limit breach returns 400 with available number', '400,196000', `${limitRes.status},${limitData.available}`, limitEnforced);

    // 10. Final DB consistency check: groupKey matches plan fields for all plans
    console.log('\n--- Step 10: Final DB Consistency Check ---');
    const allActivePlans = await LacquerPlan.find({ isDeleted: false });
    let groupKeyMismatches = 0;
    for (const p of allActivePlans) {
      const expectedKey = await computePlanGroupKey(p);
      if (p.groupKey !== expectedKey) {
        groupKeyMismatches++;
      }
    }
    recordResult('GroupKey matches fields (0 mismatches)', 0, groupKeyMismatches, groupKeyMismatches === 0);

    // Check PlainBottleStock vs raw recompute
    const rawStock = await computeLivePlainStock('100 ML MICRON', aroma._id, new Date());
    const pbsDoc = await PlainBottleStock.findOne({ companyId: aroma._id, plainBottleName: '100 ML MICRON' });
    const pbsMatches = pbsDoc ? pbsDoc.currentStock === rawStock.plainStock : true;
    recordResult('PlainBottleStock equals raw recompute (0 mismatch)', true, pbsMatches, pbsMatches);

    // 11. Clean up test Incoming and test records completely
    console.log('\n--- Step 11: Remove test data & prove counts ---');
    await Incoming.deleteMany({ documentDate: { $gte: new Date('2030-01-01') } });
    await LacquerPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
    await PrintingPlan.deleteMany({ planDate: { $gte: new Date('2030-01-01') } });
    await Variant.deleteOne({ _id: vThird._id });

    await recomputePlainStock('100 ML MICRON', aroma._id);

    const finalCounts = {
      LacquerPlan: await db.collection('lacquerplans').countDocuments(),
      PrintingPlan: await db.collection('printingplans').countDocuments(),
      PlainBottleStock: await db.collection('plainbottlestocks').countDocuments(),
      Incoming: await db.collection('incomings').countDocuments(),
      BottlePerBox: await db.collection('bottleperboxes').countDocuments()
    };

    console.log('Final DB Counts:', finalCounts);
    const countsMatch = JSON.stringify(baselineCounts) === JSON.stringify(finalCounts);
    recordResult('Counts before and after match exactly', JSON.stringify(baselineCounts), JSON.stringify(finalCounts), countsMatch);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n=== TEST SUMMARY TABLE ===');
  console.table(testResults);
  return testResults;
}

runPromptJTests().catch(console.error);
