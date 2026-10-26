const mongoose = require("mongoose");
const BottlePerBox = require("../models/BottlePerBox");
const Incoming = require("../models/Incoming");
const LacquerPlan = require("../models/LacquerPlan");
const PrintingPlan = require("../models/PrintingPlan");
const PlainBottleStock = require("../models/PlainBottleStock");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recomputes plain bottle stock from source-of-truth records:
 * Available = Σ non-deleted Incoming − Σ coating completed − Σ Ready of PLAIN printing rows (per company & bottle)
 * Updates PlainBottleStock ledger in DB and returns the computed details.
 *
 * @param {string|mongoose.Types.ObjectId} bottleIdOrName
 * @param {string|mongoose.Types.ObjectId|null} companyId
 * @param {mongoose.Types.ObjectId|null} userId
 */
async function recomputePlainStock(bottleIdOrName, companyId = null, userId = null) {
  if (!bottleIdOrName) return null;

  // 1. Resolve BottlePerBox document
  let bp = null;
  if (mongoose.Types.ObjectId.isValid(bottleIdOrName)) {
    bp = await BottlePerBox.findById(bottleIdOrName);
  }
  if (!bp) {
    const nameTrimmed = String(bottleIdOrName).trim();
    bp = await BottlePerBox.findOne({
      $or: [
        { bottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { plainBottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { bottleNames: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } }
      ],
      isDeleted: false
    });
  }

  if (!bp) return null;

  // Resolve companyId to ObjectId if present
  let resolvedCompanyId = null;
  if (companyId) {
    const cidStr = (companyId._id || companyId).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      resolvedCompanyId = new mongoose.Types.ObjectId(cidStr);
    }
  }

  // 2. Build bottle name regexes for plan queries
  const names = Array.from(new Set([
    bp.bottleName,
    bp.plainBottleName,
    ...(bp.bottleNames || [])
  ].filter(Boolean).map(n => String(n).trim())));

  const bottleRegexes = names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i"));
  const bottleMatchCondition = {
    $or: [
      { bottleName: { $in: bottleRegexes } },
      { plainBottle: { $in: bottleRegexes } }
    ]
  };

  // 3. Σ non-deleted Incoming
  const incomingQuery = {
    isDeleted: false,
    'items.bottleId': bp._id
  };
  if (resolvedCompanyId) {
    incomingQuery.billToId = resolvedCompanyId;
  }
  const incomings = await Incoming.find(incomingQuery).lean();
  let totalIncoming = 0;
  for (const inc of incomings) {
    for (const item of (inc.items || [])) {
      if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
        totalIncoming += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
      }
    }
  }

  // 4. Σ coating completed (from non-deleted LacquerPlan)
  const lacquerQuery = {
    isDeleted: false,
    ...bottleMatchCondition
  };
  if (resolvedCompanyId) {
    lacquerQuery.companyId = resolvedCompanyId;
  }
  const lacquerPlans = await LacquerPlan.find(lacquerQuery).lean();
  let totalCoatingCompleted = 0;
  for (const lp of lacquerPlans) {
    const c1 = Number(lp.coatingCompletedQty) || 0;
    const c2 = Number(lp.coatedQty) || 0;
    totalCoatingCompleted += Math.max(c1, c2);
  }

  // 5. Σ Ready of PLAIN printing rows (from non-deleted PrintingPlan)
  const printingQuery = {
    isDeleted: false,
    coatingShade: { $regex: /^PLAIN$/i },
    ...bottleMatchCondition
  };
  if (resolvedCompanyId) {
    printingQuery.companyId = resolvedCompanyId;
  }
  const printingPlans = await PrintingPlan.find(printingQuery).lean();
  let totalPlainPrintingReady = 0;
  for (const pp of printingPlans) {
    totalPlainPrintingReady += (Number(pp.producedQty) || 0);
  }

  // 6. Formula Value
  const formulaValue = totalIncoming - totalCoatingCompleted - totalPlainPrintingReady;

  // 7. Update PlainBottleStock DB ledger
  const stockFilter = { bottleId: bp._id };
  if (resolvedCompanyId) {
    stockFilter.companyId = resolvedCompanyId;
  } else {
    stockFilter.companyId = null;
  }

  const updateFields = {
    availableQuantity: formulaValue
  };
  if (userId) {
    updateFields.lastUpdatedBy = userId;
  }

  const stockDoc = await PlainBottleStock.findOneAndUpdate(
    stockFilter,
    {
      $set: updateFields,
      $setOnInsert: { reservedQuantity: 0 }
    },
    { upsert: true, returnDocument: 'after' }
  );

  return {
    bp,
    companyId: resolvedCompanyId,
    totalIncoming,
    totalCoatingCompleted,
    totalPlainPrintingReady,
    formulaValue,
    availableQuantity: formulaValue,
    stockDoc
  };
}

/**
 * Computes live day-based stock according to Rule L3:
 * stock(company, bottle, day D) = Σ Incoming (≤D) − Σ coating completed (≤D) − Σ Ready of PLAIN Printing rows (≤D), non-deleted only.
 * If targetDate is null/undefined, computes all-time cumulative stock.
 *
 * @param {string|mongoose.Types.ObjectId} bottleIdOrName
 * @param {string|mongoose.Types.ObjectId|null} companyId
 * @param {Date|string|null} targetDate
 */
async function computeLivePlainStock(bottleIdOrName, companyId = null, targetDate = null, excludePlanIds = null) {
  if (!bottleIdOrName) return 0;

  // 1. Resolve BottlePerBox document
  let bp = null;
  if (mongoose.Types.ObjectId.isValid(bottleIdOrName)) {
    bp = await BottlePerBox.findById(bottleIdOrName);
  }
  if (!bp) {
    const nameTrimmed = String(bottleIdOrName).trim();
    bp = await BottlePerBox.findOne({
      $or: [
        { bottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { plainBottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { bottleNames: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } }
      ],
      isDeleted: false
    });
  }

  if (!bp) return 0;

  // Resolve companyId to ObjectId if present
  let resolvedCompanyId = null;
  if (companyId) {
    const cidStr = (companyId._id || companyId).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      resolvedCompanyId = new mongoose.Types.ObjectId(cidStr);
    }
  }

  // 2. Build bottle name regexes for plan queries
  const names = Array.from(new Set([
    bp.bottleName,
    bp.plainBottleName,
    ...(bp.bottleNames || [])
  ].filter(Boolean).map(n => String(n).trim())));

  const bottleRegexes = names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i"));
  const bottleMatchCondition = {
    $or: [
      { bottleName: { $in: bottleRegexes } },
      { plainBottle: { $in: bottleRegexes } }
    ]
  };

  let startOfDay = null;
  let endOfDay = null;
  if (targetDate) {
    startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
  }

  // 3. Σ non-deleted Incoming (≤D)
  const incomingQuery = {
    isDeleted: false,
    'items.bottleId': bp._id
  };
  if (resolvedCompanyId) {
    incomingQuery.billToId = resolvedCompanyId;
  }
  if (endOfDay) {
    incomingQuery.documentDate = { $lte: endOfDay };
  }
  const incomings = await Incoming.find(incomingQuery).lean();
  let totalIncoming = 0;
  for (const inc of incomings) {
    for (const item of (inc.items || [])) {
      if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
        totalIncoming += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
      }
    }
  }

  // 4. Exclude Plan IDs normalization
  let excludeIds = [];
  if (excludePlanIds) {
    if (Array.isArray(excludePlanIds)) {
      excludeIds = excludePlanIds.flatMap(id => String(id).split(',')).map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    } else if (typeof excludePlanIds === 'string') {
      excludeIds = excludePlanIds.split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    }
  }

  // 5. Σ coating completed BEFORE targetDate (prior plans) and ON targetDate (same-day plans)
  let priorCoatingCompleted = 0;
  let sameDayCoated = 0;

  if (startOfDay && endOfDay) {
    // Prior plans: < startOfDay
    const priorQuery = {
      isDeleted: false,
      ...bottleMatchCondition,
      planDate: { $lt: startOfDay }
    };
    if (resolvedCompanyId) priorQuery.companyId = resolvedCompanyId;
    if (excludeIds.length > 0) priorQuery._id = { $nin: excludeIds };

    const priorPlans = await LacquerPlan.find(priorQuery).lean();
    for (const lp of priorPlans) {
      const c1 = Number(lp.coatingCompletedQty) || 0;
      const c2 = Number(lp.coatedQty) || 0;
      priorCoatingCompleted += Math.max(c1, c2);
    }

    // Same-day plans: between startOfDay and endOfDay
    const sameDayQuery = {
      isDeleted: false,
      ...bottleMatchCondition,
      planDate: { $gte: startOfDay, $lte: endOfDay }
    };
    if (resolvedCompanyId) sameDayQuery.companyId = resolvedCompanyId;
    if (excludeIds.length > 0) sameDayQuery._id = { $nin: excludeIds };

    const sameDayPlans = await LacquerPlan.find(sameDayQuery).lean();
    for (const lp of sameDayPlans) {
      const c1 = Number(lp.coatingCompletedQty) || 0;
      const c2 = Number(lp.coatedQty) || 0;
      sameDayCoated += Math.max(c1, c2);
    }
  } else {
    // All-time cumulative
    const allLacquerQuery = {
      isDeleted: false,
      ...bottleMatchCondition
    };
    if (resolvedCompanyId) allLacquerQuery.companyId = resolvedCompanyId;
    if (endOfDay) allLacquerQuery.planDate = { $lte: endOfDay };
    if (excludeIds.length > 0) allLacquerQuery._id = { $nin: excludeIds };

    const allPlans = await LacquerPlan.find(allLacquerQuery).lean();
    for (const lp of allPlans) {
      const c1 = Number(lp.coatingCompletedQty) || 0;
      const c2 = Number(lp.coatedQty) || 0;
      priorCoatingCompleted += Math.max(c1, c2);
    }
  }

  // 6. Σ Ready of PLAIN printing rows (≤D) from non-deleted PrintingPlan
  const printingQuery = {
    isDeleted: false,
    coatingShade: { $regex: /^PLAIN$/i },
    ...bottleMatchCondition
  };
  if (resolvedCompanyId) {
    printingQuery.companyId = resolvedCompanyId;
  }
  if (endOfDay) {
    printingQuery.planDate = { $lte: endOfDay };
  }
  const printingPlans = await PrintingPlan.find(printingQuery).lean();
  let totalPlainPrintingReady = 0;
  for (const pp of printingPlans) {
    totalPlainPrintingReady += (Number(pp.producedQty) || 0);
  }

  // 7. Formula Values
  // openingStock = Incoming up to date − coated of all non-deleted plans BEFORE date − Ready of PLAIN printing rows
  const openingStock = totalIncoming - priorCoatingCompleted - totalPlainPrintingReady;
  // plainStock = openingStock − same-day coated
  const plainStock = openingStock - sameDayCoated;

  const resObj = {
    openingStock,
    plainStock,
    available: plainStock,
    totalStock: openingStock,
    sameDayCoated
  };

  resObj[Symbol.toPrimitive] = function(hint) {
    if (hint === 'string') return String(plainStock);
    return plainStock;
  };
  resObj.valueOf = function() {
    return plainStock;
  };

  return resObj;
}

/**
 * Reconciles stock on startup for all active records across the system
 */
async function reconcileAllActiveStock() {
  try {
    const incomings = await Incoming.find({ isDeleted: false }).lean();
    const pairs = new Set();
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && inc.billToId) {
          pairs.add(`${inc.billToId}:::${item.bottleId}`);
        }
      }
    }

    const lacquers = await LacquerPlan.find({ isDeleted: false }).lean();
    for (const lp of lacquers) {
      const cId = lp.canonicalCompanyId || lp.companyId;
      if (cId && lp.bottleName) {
        pairs.add(`${cId}:::${lp.bottleName}`);
      }
    }

    const printings = await PrintingPlan.find({ isDeleted: false }).lean();
    for (const pp of printings) {
      if (pp.companyId && pp.bottleName) {
        pairs.add(`${pp.companyId}:::${pp.bottleName}`);
      }
    }

    for (const pair of pairs) {
      const [compId, bRef] = pair.split(':::');
      await recomputePlainStock(bRef, compId);
    }

    // Also reconcile any PlainBottleStock doc that has availableQuantity != 0
    const existingStocks = await PlainBottleStock.find({ availableQuantity: { $ne: 0 } }).lean();
    for (const s of existingStocks) {
      await recomputePlainStock(s.bottleId, s.companyId);
    }
  } catch (err) {
    console.error("reconcileAllActiveStock error:", err.message);
  }
}

module.exports = {
  recomputePlainStock,
  computeLivePlainStock,
  reconcileAllActiveStock
};
