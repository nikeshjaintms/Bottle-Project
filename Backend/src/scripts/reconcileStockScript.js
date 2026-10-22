const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const BottlePerBox = require('../models/BottlePerBox');
const Company = require('../models/Company');
const PlainBottleStock = require('../models/PlainBottleStock');
const { computeLivePlainStock, recomputePlainStock } = require('../utils/stockRecompute');

async function reconcileStock() {
  const isCommit = process.argv.includes('--commit');
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';

  console.log(`[RECONCILE] Connecting to: ${mongoUri}`);
  await mongoose.connect(mongoUri);
  console.log(`[RECONCILE] Connected to MongoDB. Mode: ${isCommit ? 'COMMIT (apply fixes)' : 'DRY RUN (report only)'}\n`);

  const db = mongoose.connection.db;

  // 1. Gather all existing cache records
  const existingStocks = await db.collection('plainbottlestocks').find({}).toArray();

  // 2. Also gather any company-bottle pairs from active incomings, lacquerplans, printingplans
  const pairs = new Map();

  for (const s of existingStocks) {
    if (s.bottleId) {
      const cStr = s.companyId ? s.companyId.toString() : 'null';
      const key = `${cStr}:::${s.bottleId.toString()}`;
      pairs.set(key, { companyId: s.companyId || null, bottleId: s.bottleId, stockDoc: s });
    }
  }

  const incomings = await db.collection('incomings').find({ isDeleted: false }).toArray();
  for (const inc of incomings) {
    for (const item of (inc.items || [])) {
      if (item.bottleId) {
        const cStr = inc.billToId ? inc.billToId.toString() : 'null';
        const key = `${cStr}:::${item.bottleId.toString()}`;
        if (!pairs.has(key)) {
          pairs.set(key, { companyId: inc.billToId || null, bottleId: item.bottleId, stockDoc: null });
        }
      }
    }
  }

  const lacquers = await db.collection('lacquerplans').find({ isDeleted: false }).toArray();
  for (const lp of lacquers) {
    const cId = lp.canonicalCompanyId || lp.companyId;
    if (lp.bottleName) {
      // Find matching bottle
      const bp = await db.collection('bottleperboxes').findOne({
        $or: [
          { bottleName: new RegExp(`^${lp.bottleName.trim()}$`, 'i') },
          { plainBottleName: new RegExp(`^${lp.bottleName.trim()}$`, 'i') },
          { bottleNames: new RegExp(`^${lp.bottleName.trim()}$`, 'i') }
        ],
        isDeleted: false
      });
      if (bp) {
        const cStr = cId ? cId.toString() : 'null';
        const key = `${cStr}:::${bp._id.toString()}`;
        if (!pairs.has(key)) {
          pairs.set(key, { companyId: cId || null, bottleId: bp._id, stockDoc: null });
        }
      }
    }
  }

  console.log(`[RECONCILE] Analyzing ${pairs.size} unique (company, bottle) pairs across the system...`);

  const discrepancies = [];
  const companiesCache = new Map();
  const bottlesCache = new Map();

  for (const [key, pair] of pairs.entries()) {
    const { companyId, bottleId, stockDoc } = pair;

    let bp = bottlesCache.get(bottleId.toString());
    if (!bp) {
      bp = await db.collection('bottleperboxes').findOne({ _id: new mongoose.Types.ObjectId(bottleId) });
      if (bp) bottlesCache.set(bottleId.toString(), bp);
    }

    let comp = null;
    if (companyId) {
      comp = companiesCache.get(companyId.toString());
      if (!comp) {
        comp = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(companyId) });
        if (comp) companiesCache.set(companyId.toString(), comp);
      }
    }

    const bottleName = bp ? (bp.plainBottleName || bp.bottleName) : `Unknown Bottle (${bottleId})`;
    const companyName = comp ? comp.name : (companyId ? `Unknown Company (${companyId})` : 'Global (No Company)');

    // Live formula calculation (all-time stock, isDeleted: false only)
    const liveFormulaValue = await computeLivePlainStock(bottleId, companyId, null);
    const cachedValue = stockDoc ? (stockDoc.availableQuantity || 0) : 0;

    if (cachedValue !== liveFormulaValue) {
      discrepancies.push({
        companyId,
        companyName,
        bottleId,
        bottleName,
        cachedValue,
        liveFormulaValue,
        diff: liveFormulaValue - cachedValue
      });

      if (isCommit) {
        await recomputePlainStock(bottleId, companyId);
      }
    }
  }

  console.log('\n========================================================================================');
  console.log(`RECONCILE REPORT: ${discrepancies.length} discrepancy(s) found`);
  console.log('========================================================================================');

  if (discrepancies.length === 0) {
    console.log('All PlainBottleStock cache documents match the live formula perfectly. No drift detected.');
  } else {
    console.table(discrepancies.map(d => ({
      Company: d.companyName,
      'Plain Bottle': d.bottleName,
      'Cached Stock': d.cachedValue,
      'Live Formula': d.liveFormulaValue,
      Difference: d.diff > 0 ? `+${d.diff}` : `${d.diff}`
    })));

    if (isCommit) {
      console.log(`\nSuccessfully reconciled and updated all ${discrepancies.length} PlainBottleStock cache document(s) in DB.`);
    } else {
      console.log('\nRun with --commit to apply these fixes to PlainBottleStock.');
    }
  }

  await mongoose.disconnect();
}

reconcileStock().catch(err => {
  console.error('[RECONCILE ERROR]:', err);
  process.exit(1);
});
