const mongoose = require('mongoose');
const { computeLivePlainStock } = require('../src/utils/stockRecompute');

async function main() {
  const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(connStr);
  const db = mongoose.connection.db;

  const lpCol = db.collection('lacquerplans');
  const ppCol = db.collection('printingplans');
  const incCol = db.collection('incomings');
  const bpCol = db.collection('bottleperboxes');

  // Find distinct plain bottles and dates across plans from 2026-10-25 onwards
  const plans = await lpCol.find({
    isDeleted: false,
    planDate: { $gte: new Date('2026-10-25T00:00:00.000Z') }
  }).toArray();

  const datePoolPairs = new Map();

  for (const p of plans) {
    if (!p.planDate || !p.bottleName) continue;
    const dStr = new Date(p.planDate).toISOString().slice(0, 10);
    const key = `${dStr}|${p.bottleName}`;
    if (!datePoolPairs.has(key)) {
      datePoolPairs.set(key, { date: p.planDate, bottleName: p.bottleName, plans: [] });
    }
    datePoolPairs.get(key).plans.push(p);
  }

  console.log(`Checking lacquer stock by day across ${datePoolPairs.size} active date-bottle pools...`);
  let mismatches = 0;
  let checked = 0;

  for (const [key, pool] of datePoolPairs.entries()) {
    checked++;
    const firstPlan = pool.plans[0];
    const cid = firstPlan.canonicalCompanyId || firstPlan.companyId;
    if (!cid) continue;

    const sources = firstPlan.stockSources && firstPlan.stockSources.length > 0
      ? firstPlan.stockSources
      : [cid];

    const liveRes = await computeLivePlainStock(pool.bottleName, sources, pool.date);
    const liveAvailable = liveRes.available !== undefined ? liveRes.available : Number(liveRes);

    // Independent calculation:
    // Resolve BottlePerBox doc for bottleId
    const bp = await bpCol.findOne({
      isDeleted: { $ne: true },
      bottleName: { $regex: new RegExp(`^${pool.bottleName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }
    });
    if (!bp) continue;

    const sourceIds = sources.map(s => new mongoose.Types.ObjectId(s._id || s));
    const endOfDay = new Date(pool.date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // 1. Incoming up to endOfDay
    const incomings = await incCol.find({
      isDeleted: false,
      'items.bottleId': bp._id,
      billToId: { $in: sourceIds },
      documentDate: { $lte: endOfDay }
    }).toArray();

    let expectedIncoming = 0;
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
          expectedIncoming += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
        }
      }
    }

    // 2. Coating allocated up to endOfDay
    const coatingPlans = await lpCol.find({
      isDeleted: false,
      bottleName: pool.bottleName,
      planDate: { $lte: endOfDay }
    }).toArray();

    let expectedCoated = 0;
    for (const cp of coatingPlans) {
      if (Array.isArray(cp.stockAllocation) && cp.stockAllocation.length > 0) {
        for (const a of cp.stockAllocation) {
          const aCid = (a.companyId?._id || a.companyId)?.toString();
          if (sourceIds.some(s => s.toString() === aCid)) {
            expectedCoated += Number(a.qty) || 0;
          }
        }
      } else {
        const cpCid = (cp.canonicalCompanyId || cp.companyId)?.toString();
        if (sourceIds.some(s => s.toString() === cpCid)) {
          expectedCoated += Number(cp.coatingCompletedQty ?? cp.coatedQty ?? 0);
        }
      }
    }

    // 3. Plain printing ready up to endOfDay
    const printingPlans = await ppCol.find({
      isDeleted: false,
      itemName: pool.bottleName,
      coatingShade: { $regex: /^PLAIN$/i },
      planDate: { $lte: endOfDay }
    }).toArray();

    let expectedPlainReady = 0;
    for (const pp of printingPlans) {
      if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
        for (const a of pp.stockAllocation) {
          const aCid = (a.companyId?._id || a.companyId)?.toString();
          if (sourceIds.some(s => s.toString() === aCid)) {
            expectedPlainReady += Number(a.qty) || 0;
          }
        }
      } else {
        expectedPlainReady += Number(pp.readyQty || pp.producedQty || 0);
      }
    }

    const expectedAvailable = expectedIncoming - expectedCoated - expectedPlainReady;

    if (liveAvailable !== expectedAvailable) {
      mismatches++;
      console.log(`Mismatch on ${key}: liveAvailable=${liveAvailable}, expectedAvailable=${expectedAvailable}`);
    }
  }

  console.log(`Check completed: ${checked} checked, ${mismatches} mismatches.`);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
