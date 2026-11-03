const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BottlePerBox = require('../src/models/BottlePerBox');
const Incoming = require('../src/models/Incoming');
const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const PlainBottleStock = require('../src/models/PlainBottleStock');

const databaseName = 'bottle_test_yellow';
const normalize = value => String(value || '').trim().toLowerCase();
const idOf = value => String(value?._id || value || '');

function matchesBottle(plan, names) {
  return names.has(normalize(plan.bottleName)) || names.has(normalize(plan.plainBottle));
}

function allocationTotal(plan, companyId, carriedField = null) {
  const allocations = Array.isArray(plan.stockAllocation) ? plan.stockAllocation : [];
  if (!allocations.length) return null;

  const carried = new Map();
  for (const item of (carriedField && Array.isArray(plan[carriedField]) ? plan[carriedField] : [])) {
    const company = idOf(item.companyId);
    carried.set(company, (carried.get(company) || 0) + (Number(item.qty) || 0));
  }

  return allocations.reduce((total, item) => {
    const company = idOf(item.companyId);
    if (companyId && company !== companyId) return total;
    return total + Math.max(0, (Number(item.qty) || 0) - (carried.get(company) || 0));
  }, 0);
}

function ownedBy(plan, companyId) {
  return idOf(plan.canonicalCompanyId) === companyId || idOf(plan.companyId) === companyId;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required in Backend/.env');

  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/${databaseName}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 15000 });

  const [bottles, incomings, lacquerPlans, printingPlans, stocks] = await Promise.all([
    BottlePerBox.find({ isDeleted: false }).lean(),
    Incoming.find({ isDeleted: false }).lean(),
    LacquerPlan.find({ isDeleted: false }).lean(),
    PrintingPlan.find({ isDeleted: false }).lean(),
    PlainBottleStock.find({}).lean()
  ]);
  const bottleById = new Map(bottles.map(bottle => [idOf(bottle._id), bottle]));
  const mismatches = [];
  let unverifiableRows = 0;
  const asOf = new Date();
  asOf.setUTCHours(23, 59, 59, 999);

  for (const stock of stocks) {
    const bottle = bottleById.get(idOf(stock.bottleId));
    if (!bottle) {
      unverifiableRows++;
      continue;
    }

    const companyId = stock.companyId ? idOf(stock.companyId) : '';
    const names = new Set([
      bottle.bottleName,
      bottle.plainBottleName,
      ...(Array.isArray(bottle.bottleNames) ? bottle.bottleNames : [])
    ].map(normalize).filter(Boolean));

    let incomingTotal = 0;
    for (const incoming of incomings) {
      if (incoming.documentDate && new Date(incoming.documentDate) > asOf) continue;
      if (companyId && idOf(incoming.billToId) !== companyId) continue;
      for (const item of (incoming.items || [])) {
        if (idOf(item.bottleId) !== idOf(bottle._id)) continue;
        incomingTotal += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
      }
    }

    let coatingTotal = 0;
    for (const plan of lacquerPlans) {
      if (plan.planDate && new Date(plan.planDate) > asOf) continue;
      if (!matchesBottle(plan, names)) continue;
      const allocated = allocationTotal(plan, companyId, 'carriedStockAllocation');
      if (allocated !== null) {
        if (!companyId || (plan.stockAllocation || []).some(item => idOf(item.companyId) === companyId)) {
          coatingTotal += allocated;
        }
      } else if (!companyId || ownedBy(plan, companyId)) {
        coatingTotal += Math.max(
          0,
          Math.max(Number(plan.coatingCompletedQty) || 0, Number(plan.coatedQty) || 0) -
            (Number(plan.carriedFromCoatedQty) || 0)
        );
      }
    }

    let plainPrintingReady = 0;
    for (const plan of printingPlans) {
      if (plan.planDate && new Date(plan.planDate) > asOf) continue;
      if (!matchesBottle(plan, names) || !/^plain$/i.test(String(plan.coatingShade || '').trim())) continue;
      const allocated = allocationTotal(plan, companyId);
      if (allocated !== null) {
        if (!companyId || (plan.stockAllocation || []).some(item => idOf(item.companyId) === companyId)) {
          plainPrintingReady += allocated;
        }
      } else if (!companyId || ownedBy(plan, companyId)) {
        plainPrintingReady += Number(plan.producedQty) || 0;
      }
    }

    const expected = incomingTotal - coatingTotal - plainPrintingReady;
    const actual = Number(stock.availableQuantity) || 0;
    if (Math.abs(expected - actual) > 1e-6) {
      mismatches.push({
        stockId: idOf(stock._id),
        bottle: bottle.plainBottleName || bottle.bottleName,
        companyId: companyId || null,
        incomingTotal,
        coatingTotal,
        plainPrintingReady,
        expected,
        actual,
        difference: actual - expected
      });
    }
  }

  console.log(JSON.stringify({
    readOnly: true,
    database: mongoose.connection.db.databaseName,
    asOfDate: asOf.toISOString().slice(0, 10),
    stockRowsChecked: stocks.length,
    unverifiableRows,
    mismatches: mismatches.length,
    details: mismatches
  }, null, 2));
  await mongoose.disconnect();
  if (mismatches.length) process.exitCode = 1;
}

main().catch(async error => {
  console.error('Stock check failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
