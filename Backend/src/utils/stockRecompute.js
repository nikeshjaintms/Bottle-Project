const mongoose = require("mongoose");
const BottlePerBox = require("../models/BottlePerBox");
const Incoming = require("../models/Incoming");
const { NOT_IMPORTED_FILTER, getNotImportedFilter } = require("./importedFilter");
const LacquerPlan = require("../models/LacquerPlan");
const PrintingPlan = require("../models/PrintingPlan");
const PlainBottleStock = require("../models/PlainBottleStock");
const Company = require("../models/Company");
const {
  getEntryRejectionQty,
  isCoatingHistoryEntry
} = require("./lacquerPlanCalculations");

function getRejectionAllocationsForEntries(plan, isApplicableEntry, allowZeroQty = false) {
  const allocations = new Map();
  for (const entry of (plan.qtyEntries || [])) {
    if (entry.isDeleted || !isApplicableEntry(entry) || (!allowZeroQty && (Number(entry.qty) || 0) <= 0)) {
      continue;
    }

    const rejectionQty = getEntryRejectionQty(entry, plan.boxQty);
    if (rejectionQty <= 0) continue;

    const entryAllocations = new Map();
    const recordedAllocations = Array.isArray(entry.stockAllocation) && entry.stockAllocation.length > 0
      ? entry.stockAllocation
      : (plan.stockAllocation || []);
    for (const allocation of recordedAllocations) {
      const companyId = (allocation.companyId?._id || allocation.companyId)?.toString();
      const qty = Math.max(0, Number(allocation.qty) || 0);
      if (companyId && qty > 0) {
        entryAllocations.set(companyId, (entryAllocations.get(companyId) || 0) + qty);
      }
    }
    const totalAllocated = Array.from(entryAllocations.values()).reduce((sum, qty) => sum + qty, 0);

    if (totalAllocated === 0) {
      const fallbackCompanyId = (plan.canonicalCompanyId?._id || plan.canonicalCompanyId || plan.companyId?._id || plan.companyId)?.toString();
      if (fallbackCompanyId) {
        allocations.set(fallbackCompanyId, (allocations.get(fallbackCompanyId) || 0) + rejectionQty);
      }
      continue;
    }

    let remaining = rejectionQty;
    const sources = Array.from(entryAllocations.entries());
    sources.forEach(([companyId, qty], index) => {
      const assigned = index === sources.length - 1
        ? remaining
        : Math.floor(rejectionQty * qty / totalAllocated);
      remaining -= assigned;
      allocations.set(companyId, (allocations.get(companyId) || 0) + assigned);
    });
  }
  return Array.from(allocations, ([companyId, qty]) => ({ companyId, qty }));
}

function getStockRejectionAllocations(plan) {
  return getRejectionAllocationsForEntries(
    plan,
    entry => entry.subType !== "carried" && isCoatingHistoryEntry(entry)
  );
}

function getPrintingReadyRejectionAllocations(plan) {
  if ((plan.coatingShade || "").trim().toUpperCase() !== "PLAIN") return [];
  return getRejectionAllocationsForEntries(plan, entry => entry.subType === "ready", true);
}

function getStockRejectionQtyForCompany(plan, companyId = null) {
  const allocations = getStockRejectionAllocations(plan);
  if (!companyId) {
    return allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
  }
  const companyIdString = (companyId._id || companyId).toString();
  return allocations
    .filter(allocation => allocation.companyId === companyIdString)
    .reduce((sum, allocation) => sum + allocation.qty, 0);
}

function getPrintingReadyRejectionQtyForCompany(plan, companyId = null) {
  const allocations = getPrintingReadyRejectionAllocations(plan);
  if (!companyId) {
    return allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
  }
  const companyIdString = (companyId._id || companyId).toString();
  return allocations
    .filter(allocation => allocation.companyId === companyIdString)
    .reduce((sum, allocation) => sum + allocation.qty, 0);
}

function inSession(query, session) {
  return session ? query.session(session) : query;
}

async function getCompaniesWithBottleIncoming(bp, endOfDay, session = null, includeNonSuppliers = false) {
  const cutoff = endOfDay || new Date();
  const incomingQuery = {
    isDeleted: { $ne: true },
    isImported: { $ne: true },
    'items.bottleId': bp._id,
    $or: [
      { documentDate: { $lte: cutoff } },
      { date: { $lte: cutoff } }
    ]
  };

  const companyIds = await inSession(Incoming.distinct('billToId', incomingQuery), session);
  if (!companyIds.length) return [];

  const companyQuery = {
    _id: { $in: companyIds },
    isDeleted: { $ne: true }
  };
  if (!includeNonSuppliers) companyQuery.isStockSupplier = true;

  return inSession(
    Company.find(companyQuery).select('_id name isStockSupplier'),
    session
  ).lean();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves a BottlePerBox document from an ID, name, or object.
 */
async function resolveBottlePerBoxDoc(bottleIdOrName, session = null) {
  if (!bottleIdOrName) return null;
  if (typeof bottleIdOrName === 'object' && bottleIdOrName._id) {
    return bottleIdOrName;
  }
  let bp = null;
  if (mongoose.Types.ObjectId.isValid(bottleIdOrName)) {
    bp = await inSession(BottlePerBox.findById(bottleIdOrName), session);
  }
  if (!bp) {
    const nameTrimmed = String(bottleIdOrName).trim();
    bp = await inSession(BottlePerBox.findOne({
      $or: [
        { bottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { plainBottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { bottleNames: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } }
      ],
      isDeleted: false
    }), session);
  }
  return bp;
}

function buildBottleRegexes(bp) {
  const names = Array.from(new Set([
    bp.bottleName,
    bp.plainBottleName,
    ...(bp.bottleNames || [])
  ].filter(Boolean).map(n => String(n).trim())));

  const bottleRegexes = names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i"));
  return {
    bottleRegexes,
    bottleMatchCondition: {
      $or: [
        { bottleName: { $in: bottleRegexes } },
        { plainBottle: { $in: bottleRegexes } }
      ]
    }
  };
}

/**
 * Recomputes plain bottle stock ledger for a specific company and bottle.
 * Pool stock = Σ Incoming − Σ allocated coating/rejections − Σ allocated Ready of PLAIN printing
 * Updates PlainBottleStock ledger in DB and returns the computed details.
 */
async function recomputePlainStock(bottleIdOrName, companyId = null, userId = null, reqCache = null, session = null) {
  if (!bottleIdOrName) return null;

  if (reqCache && reqCache.stockCache) {
    const cacheKey = `${companyId}:${bottleIdOrName}`;
    if (reqCache.stockCache[cacheKey]) {
      return reqCache.stockCache[cacheKey];
    }
  }

  const bp = await resolveBottlePerBoxDoc(bottleIdOrName, session);
  if (!bp) return null;

  let resolvedCompanyId = null;
  if (companyId) {
    const cidStr = (companyId._id || companyId).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      resolvedCompanyId = new mongoose.Types.ObjectId(cidStr);
    }
  }

  const { bottleMatchCondition } = buildBottleRegexes(bp);

  // 1. Σ non-deleted Incoming (excluding imported records)
  const incomingQuery = {
    isDeleted: { $ne: true },
    isImported: { $ne: true },
    'items.bottleId': bp._id
  };
  if (resolvedCompanyId) {
    incomingQuery.billToId = resolvedCompanyId;
  }
  const incomings = await inSession(Incoming.find(incomingQuery), session).lean();
  let totalIncoming = 0;
  for (const inc of incomings) {
    for (const item of (inc.items || [])) {
      if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
        totalIncoming += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
      }
    }
  }

  // 2. Σ coating completed (from non-deleted LacquerPlan)
  const andLacquer = [bottleMatchCondition];
  if (resolvedCompanyId) {
    andLacquer.push({
      $or: [
        { 'stockAllocation.companyId': resolvedCompanyId },
        {
          $and: [
            { $or: [{ canonicalCompanyId: resolvedCompanyId }, { companyId: resolvedCompanyId }] },
            { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
          ]
        }
      ]
    });
  }
  const lacquerQuery = {
    isDeleted: { $ne: true },
    isExcelViewOnly: { $ne: true },
    $and: andLacquer
  };

  const lacquerPlans = await inSession(LacquerPlan.find(lacquerQuery), session).lean();
  let totalCoatingCompleted = 0;
  let totalCoatingRejected = 0;
  for (const lp of lacquerPlans) {
    totalCoatingRejected += getStockRejectionQtyForCompany(lp, resolvedCompanyId);
    if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
      const carriedAllocMap = new Map();
      if (Array.isArray(lp.carriedStockAllocation)) {
        for (const ca of lp.carriedStockAllocation) {
          const cId = (ca.companyId?._id || ca.companyId)?.toString();
          if (cId) carriedAllocMap.set(cId, (carriedAllocMap.get(cId) || 0) + (Number(ca.qty) || 0));
        }
      }
      if (resolvedCompanyId) {
        for (const alloc of lp.stockAllocation) {
          const cId = (alloc.companyId?._id || alloc.companyId)?.toString();
          if (cId && cId === resolvedCompanyId.toString()) {
            const carriedPart = carriedAllocMap.get(cId) || 0;
            totalCoatingCompleted += Math.max(0, (Number(alloc.qty) || 0) - carriedPart);
          }
        }
      } else {
        for (const alloc of lp.stockAllocation) {
          const cId = (alloc.companyId?._id || alloc.companyId)?.toString();
          const carriedPart = carriedAllocMap.get(cId) || 0;
          totalCoatingCompleted += Math.max(0, (Number(alloc.qty) || 0) - carriedPart);
        }
      }
    } else {
      const c1 = Number(lp.coatingCompletedQty) || 0;
      const c2 = Number(lp.coatedQty) || 0;
      const carried = Number(lp.carriedFromCoatedQty) || 0;
      totalCoatingCompleted += Math.max(0, Math.max(c1, c2) - carried);
    }
  }

  // 3. Σ Ready of PLAIN printing rows (from non-deleted PrintingPlan)
  const andPrinting = [
    bottleMatchCondition,
    { coatingShade: { $regex: /^PLAIN$/i } }
  ];
  if (resolvedCompanyId) {
    andPrinting.push({
      $or: [
        { 'stockAllocation.companyId': resolvedCompanyId },
        {
          $and: [
            { companyId: resolvedCompanyId },
            { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
          ]
        }
      ]
    });
  }
  const printingQuery = {
    isDeleted: { $ne: true },
    isExcelViewOnly: { $ne: true },
    $and: andPrinting
  };

  const printingPlans = await inSession(PrintingPlan.find(printingQuery), session).lean();
  let totalPlainPrintingReady = 0;
  for (const pp of printingPlans) {
    totalPlainPrintingReady += getPrintingReadyRejectionQtyForCompany(pp, resolvedCompanyId);
    if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
      if (resolvedCompanyId) {
        for (const alloc of pp.stockAllocation) {
          if (alloc.companyId && alloc.companyId.toString() === resolvedCompanyId.toString()) {
            totalPlainPrintingReady += Number(alloc.qty) || 0;
          }
        }
      } else {
        for (const alloc of pp.stockAllocation) {
          totalPlainPrintingReady += Number(alloc.qty) || 0;
        }
      }
    } else {
      totalPlainPrintingReady += (Number(pp.producedQty) || 0);
    }
  }

  // 4. Formula Value
  const formulaValue = totalIncoming - totalCoatingCompleted - totalCoatingRejected - totalPlainPrintingReady;

  // 5. Update PlainBottleStock DB ledger
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

  const stockDoc = await inSession(PlainBottleStock.findOneAndUpdate(
    stockFilter,
    {
      $set: updateFields,
      $setOnInsert: { reservedQuantity: 0 }
    },
    { upsert: true, returnDocument: 'after' }
  ), session);

  const result = {
    bp,
    companyId: resolvedCompanyId,
    totalIncoming,
    totalCoatingCompleted,
    totalCoatingRejected,
    totalPlainPrintingReady,
    formulaValue,
    availableQuantity: formulaValue,
    stockDoc
  };

  if (reqCache && reqCache.stockCache) {
    const cacheKey = `${resolvedCompanyId}:${bottleIdOrName}`;
    reqCache.stockCache[cacheKey] = result;
  }

  return result;
}

/**
 * Computes live day-based stock for one or more sources:
 * Returns combined available stock and per-source breakdown.
 */
async function computeLivePlainStock(bottleIdOrName, companyIdOrSources = null, targetDate = null, excludePlanIds = null, session = null, options = {}) {
  if (!bottleIdOrName) return 0;

  const bp = await resolveBottlePerBoxDoc(bottleIdOrName, session);
  if (!bp) return 0;

  // Normalize sources list
  let sourceIdStrings = [];
  if (Array.isArray(companyIdOrSources)) {
    sourceIdStrings = companyIdOrSources.map(id => id ? (id._id || id).toString() : null).filter(Boolean);
  } else if (companyIdOrSources && typeof companyIdOrSources === 'object' && Array.isArray(companyIdOrSources.stockSources)) {
    sourceIdStrings = companyIdOrSources.stockSources.map(id => id ? (id._id || id).toString() : null).filter(Boolean);
    if (companyIdOrSources.companyId) {
      const mainCid = (companyIdOrSources.companyId._id || companyIdOrSources.companyId).toString();
      if (!sourceIdStrings.includes(mainCid)) {
        sourceIdStrings.unshift(mainCid);
      }
    }
  } else if (companyIdOrSources) {
    const cidStr = (companyIdOrSources._id || companyIdOrSources).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      sourceIdStrings = [cidStr];
    }
  }

  // Deduplicate
  sourceIdStrings = Array.from(new Set(sourceIdStrings));

  const { bottleMatchCondition } = buildBottleRegexes(bp);

  let startOfDay = null;
  let endOfDay = null;
  if (targetDate) {
    startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
  }

  // Exclude Plan IDs normalization
  let excludeIds = [];
  if (excludePlanIds) {
    if (Array.isArray(excludePlanIds)) {
      excludeIds = excludePlanIds.flatMap(id => String(id).split(',')).map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    } else if (typeof excludePlanIds === 'string') {
      excludeIds = excludePlanIds.split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    }
  }

  // If no sources specified, query all-company pool
  if (sourceIdStrings.length === 0) {
    sourceIdStrings = [null];
  }

  // Fetch company docs for names
  const validSourceObjIds = sourceIdStrings.filter(s => s && mongoose.Types.ObjectId.isValid(s)).map(s => new mongoose.Types.ObjectId(s));
  const companies = validSourceObjIds.length > 0
    ? await inSession(Company.find({ _id: { $in: validSourceObjIds } }), session).lean()
    : [];
  const companyNameMap = new Map(companies.map(c => [c._id.toString(), c.name]));

  let combinedOpening = 0;
  let combinedSameDayCoated = 0;
  let combinedAvailable = 0;
  const sourcesBreakdown = [];

  async function computeSingleSource(srcObjectId, companyName) {
    // 1. Σ non-deleted Incoming (≤D, excluding imported records)
    const incomingQuery = {
      isDeleted: { $ne: true },
      isImported: { $ne: true },
      'items.bottleId': bp._id
    };
    if (srcObjectId) {
      incomingQuery.billToId = srcObjectId;
    }
    if (endOfDay) {
      incomingQuery.documentDate = { $lte: endOfDay };
    }
    const incomings = await inSession(Incoming.find(incomingQuery), session).lean();
    let totalIncoming = 0;
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
          totalIncoming += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
        }
      }
    }

    // 2. Lacquer Plan coating completed:
    // Prior plans (< startOfDay) and Same-day plans (between startOfDay and endOfDay)
    let priorCoatingCompleted = 0;
    let sameDayCoated = 0;
    let priorCoatingRejected = 0;
    let sameDayCoatingRejected = 0;

    const andBase = [bottleMatchCondition];
    if (srcObjectId) {
      andBase.push({
        $or: [
          { 'stockAllocation.companyId': srcObjectId },
          {
            $and: [
              { $or: [{ canonicalCompanyId: srcObjectId }, { companyId: srcObjectId }, { stockSources: srcObjectId }] },
              { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
            ]
          }
        ]
      });
    }

    if (startOfDay && endOfDay) {
      // Prior plans: < startOfDay
      const priorQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        $and: [...andBase, { planDate: { $lt: startOfDay } }]
      };
      if (excludeIds.length > 0) priorQuery._id = { $nin: excludeIds };

      const priorPlans = await inSession(LacquerPlan.find(priorQuery), session).lean();
      for (const lp of priorPlans) {
        priorCoatingRejected += getStockRejectionQtyForCompany(lp, srcObjectId);
        if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of lp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                priorCoatingCompleted += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of lp.stockAllocation) priorCoatingCompleted += Number(a.qty) || 0;
          }
        } else {
          const c1 = Number(lp.coatingCompletedQty) || 0;
          const c2 = Number(lp.coatedQty) || 0;
          const carried = Number(lp.carriedFromCoatedQty) || 0;
          priorCoatingCompleted += Math.max(0, Math.max(c1, c2) - carried);
        }
      }

      // Same-day plans: between startOfDay and endOfDay
      const sameDayQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        $and: [...andBase, { planDate: { $gte: startOfDay, $lte: endOfDay } }]
      };
      if (excludeIds.length > 0) sameDayQuery._id = { $nin: excludeIds };

      const sameDayPlans = await inSession(LacquerPlan.find(sameDayQuery), session).lean();
      for (const lp of sameDayPlans) {
        sameDayCoatingRejected += getStockRejectionQtyForCompany(lp, srcObjectId);
        if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
          const carriedAllocMap = new Map();
          if (Array.isArray(lp.carriedStockAllocation)) {
            for (const ca of lp.carriedStockAllocation) {
              const cId = (ca.companyId?._id || ca.companyId)?.toString();
              if (cId) carriedAllocMap.set(cId, (carriedAllocMap.get(cId) || 0) + (Number(ca.qty) || 0));
            }
          }
          if (srcObjectId) {
            for (const a of lp.stockAllocation) {
              const cId = (a.companyId?._id || a.companyId)?.toString();
              if (cId && cId === srcObjectId.toString()) {
                const carriedPart = carriedAllocMap.get(cId) || 0;
                sameDayCoated += Math.max(0, (Number(a.qty) || 0) - carriedPart);
              }
            }
          } else {
            for (const a of lp.stockAllocation) {
              const cId = (a.companyId?._id || a.companyId)?.toString();
              const carriedPart = carriedAllocMap.get(cId) || 0;
              sameDayCoated += Math.max(0, (Number(a.qty) || 0) - carriedPart);
            }
          }
        } else {
          const c1 = Number(lp.coatingCompletedQty) || 0;
          const c2 = Number(lp.coatedQty) || 0;
          const carried = Number(lp.carriedFromCoatedQty) || 0;
          sameDayCoated += Math.max(0, Math.max(c1, c2) - carried);
        }
      }
    } else {
      // All-time cumulative
      const allLacquerQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        $and: [...andBase]
      };
      if (endOfDay) allLacquerQuery.$and.push({ planDate: { $lte: endOfDay } });
      if (excludeIds.length > 0) allLacquerQuery._id = { $nin: excludeIds };

      const allPlans = await inSession(LacquerPlan.find(allLacquerQuery), session).lean();
      for (const lp of allPlans) {
        priorCoatingRejected += getStockRejectionQtyForCompany(lp, srcObjectId);
        if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of lp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                priorCoatingCompleted += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of lp.stockAllocation) priorCoatingCompleted += Number(a.qty) || 0;
          }
        } else {
          const c1 = Number(lp.coatingCompletedQty) || 0;
          const c2 = Number(lp.coatedQty) || 0;
          const carried = Number(lp.carriedFromCoatedQty) || 0;
          priorCoatingCompleted += Math.max(0, Math.max(c1, c2) - carried);
        }
      }
    }

    // 3. Σ Ready of PLAIN printing rows:
    // Prior plans (< startOfDay) and Same-day plans (between startOfDay and endOfDay)
    let priorPlainPrintingReady = 0;
    let sameDayPlainPrintingReady = 0;
    let priorPlainPrintingRejected = 0;
    let sameDayPlainPrintingRejected = 0;

    if (startOfDay && endOfDay) {
      const priorPrintingQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        coatingShade: { $regex: /^PLAIN$/i },
        $and: [...andBase, { planDate: { $lt: startOfDay } }]
      };
      if (excludeIds.length > 0) priorPrintingQuery._id = { $nin: excludeIds };

      const priorPrintingPlans = await inSession(PrintingPlan.find(priorPrintingQuery), session).lean();
      for (const pp of priorPrintingPlans) {
        priorPlainPrintingRejected += getPrintingReadyRejectionQtyForCompany(pp, srcObjectId);
        if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of pp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                priorPlainPrintingReady += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of pp.stockAllocation) priorPlainPrintingReady += Number(a.qty) || 0;
          }
        } else {
          priorPlainPrintingReady += (Number(pp.producedQty) || 0);
        }
      }

      const sameDayPrintingQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        coatingShade: { $regex: /^PLAIN$/i },
        $and: [...andBase, { planDate: { $gte: startOfDay, $lte: endOfDay } }]
      };
      if (excludeIds.length > 0) sameDayPrintingQuery._id = { $nin: excludeIds };

      const sameDayPrintingPlans = await inSession(PrintingPlan.find(sameDayPrintingQuery), session).lean();
      for (const pp of sameDayPrintingPlans) {
        sameDayPlainPrintingRejected += getPrintingReadyRejectionQtyForCompany(pp, srcObjectId);
        if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of pp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                sameDayPlainPrintingReady += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of pp.stockAllocation) sameDayPlainPrintingReady += Number(a.qty) || 0;
          }
        } else {
          sameDayPlainPrintingReady += (Number(pp.producedQty) || 0);
        }
      }
    } else {
      const allPrintingQuery = {
        isDeleted: { $ne: true },
        isExcelViewOnly: { $ne: true },
        coatingShade: { $regex: /^PLAIN$/i },
        $and: [...andBase]
      };
      if (endOfDay) allPrintingQuery.$and.push({ planDate: { $lte: endOfDay } });
      if (excludeIds.length > 0) allPrintingQuery._id = { $nin: excludeIds };

      const allPrintingPlans = await inSession(PrintingPlan.find(allPrintingQuery), session).lean();
      for (const pp of allPrintingPlans) {
        priorPlainPrintingRejected += getPrintingReadyRejectionQtyForCompany(pp, srcObjectId);
        if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of pp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                priorPlainPrintingReady += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of pp.stockAllocation) priorPlainPrintingReady += Number(a.qty) || 0;
          }
        } else {
          priorPlainPrintingReady += (Number(pp.producedQty) || 0);
        }
      }
    }

    const openingStock = totalIncoming - priorCoatingCompleted - priorCoatingRejected - priorPlainPrintingReady - priorPlainPrintingRejected;
    const available = openingStock - sameDayCoated - sameDayCoatingRejected - sameDayPlainPrintingReady - sameDayPlainPrintingRejected;

    return {
      companyId: srcObjectId,
      companyName,
      openingStock,
      available,
      sameDayCoated,
      sameDayPrinted: sameDayPlainPrintingReady
    };
  }

  let combinedSameDayPrinted = 0;
  for (const srcStr of sourceIdStrings) {
    const srcObjectId = srcStr && mongoose.Types.ObjectId.isValid(srcStr) ? new mongoose.Types.ObjectId(srcStr) : null;
    const companyName = srcStr ? (companyNameMap.get(srcStr) || 'Unknown') : 'All Companies';
    const sRes = await computeSingleSource(srcObjectId, companyName);
    combinedOpening += sRes.openingStock;
    combinedSameDayCoated += sRes.sameDayCoated;
    combinedSameDayPrinted += (sRes.sameDayPrinted || 0);
    combinedAvailable += sRes.available;
    if (srcObjectId) {
      sourcesBreakdown.push(sRes);
    }
  }

  // Stock suppliers remain the default. Lacquer plans can also use any active
  // company that has Incoming stock for this bottle as a source.
  const incomingCompanies = await getCompaniesWithBottleIncoming(
    bp,
    endOfDay,
    session,
    options.includeNonSupplierSources === true
  );
  const eligibleSources = [];
  for (const supplier of incomingCompanies) {
    let found = sourcesBreakdown.find(s => s.companyId && s.companyId.toString() === supplier._id.toString());
    if (!found) {
      found = await computeSingleSource(supplier._id, supplier.name);
    }
    eligibleSources.push({
      companyId: supplier._id.toString(),
      companyName: supplier.name,
      available: found ? found.available : 0,
      openingStock: found ? found.openingStock : 0,
      hasIncoming: true,
      isStockSupplier: supplier.isStockSupplier === true
    });
  }
  const eligibleSuppliersList = eligibleSources.filter(source => source.isStockSupplier);
  const eligibleIncomingCompanies = options.includeNonSupplierSources === true
    ? eligibleSources.filter(source => !source.isStockSupplier)
    : [];

  const resObj = {
    openingStock: combinedOpening,
    plainStock: combinedAvailable,
    available: combinedAvailable,
    totalStock: combinedOpening,
    sameDayCoated: combinedSameDayCoated,
    sameDayPrinted: combinedSameDayPrinted,
    sources: sourcesBreakdown,
    hasSuppliers: eligibleSuppliersList.length > 0,
    eligibleSuppliers: eligibleSuppliersList,
    eligibleIncomingCompanies
  };

  resObj[Symbol.toPrimitive] = function(hint) {
    if (hint === 'string') return String(combinedAvailable);
    return combinedAvailable;
  };
  resObj.valueOf = function() {
    return combinedAvailable;
  };

  return resObj;
}

/**
 * Replays stock allocations for a bottle starting from startDate across all involved companies.
 * Day isolation: Plans with planDate < startDate are NEVER updated.
 */
async function replayStockAllocations(bottleRef, startDate, extraCompanyIds = [], userId = null, session = null, options = {}) {
  try {
    const bp = await resolveBottlePerBoxDoc(bottleRef, session);
    if (!bp) return { success: false, message: "Bottle not found" };

    const { bottleMatchCondition } = buildBottleRegexes(bp);

    const startCutoff = new Date(startDate);
    startCutoff.setUTCHours(0, 0, 0, 0);

    // 1. Fetch future plans (>= startCutoff)
    const [futureLacquer, futurePrinting] = await Promise.all([
      inSession(LacquerPlan.find({ isDeleted: false, isExcelViewOnly: { $ne: true }, $and: [bottleMatchCondition, { planDate: { $gte: startCutoff } }] }), session).lean(),
      inSession(PrintingPlan.find({ isDeleted: false, isExcelViewOnly: { $ne: true }, coatingShade: { $regex: /^PLAIN$/i }, $and: [bottleMatchCondition, { planDate: { $gte: startCutoff } }] }), session).lean()
    ]);

    // 2. Identify all involved company IDs
    const involvedSet = new Set();
    extraCompanyIds.forEach(id => id && involvedSet.add((id._id || id).toString()));

    [...futureLacquer, ...futurePrinting].forEach(p => {
      if (p.companyId) involvedSet.add(p.companyId.toString());
      if (p.canonicalCompanyId) involvedSet.add(p.canonicalCompanyId.toString());
      (p.stockSources || []).forEach(s => s && involvedSet.add((s._id || s).toString()));
      (p.stockAllocation || []).forEach(a => a.companyId && involvedSet.add((a.companyId._id || a.companyId).toString()));
      (p.qtyEntries || []).forEach(entry => {
        (entry.stockAllocation || []).forEach(a => a.companyId && involvedSet.add((a.companyId._id || a.companyId).toString()));
      });
    });

    const involvedCompanyIds = Array.from(involvedSet).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

    // 3. Preload all Incomings for involved companies and bp._id
    const incomingsByCompany = new Map();
    const allIncomings = await inSession(Incoming.find({
      isDeleted: false,
      isImported: { $ne: true },
      billToId: { $in: involvedCompanyIds },
      'items.bottleId': bp._id
    }).sort({ documentDate: 1 }), session).lean();

    for (const inc of allIncomings) {
      const cid = inc.billToId.toString();
      if (!incomingsByCompany.has(cid)) incomingsByCompany.set(cid, []);
      let itemQty = 0;
      for (const item of (inc.items || [])) {
        if (item.bottleId && item.bottleId.toString() === bp._id.toString()) {
          itemQty += Number(item.totalQty) || (Number(item.qty) * Number(item.box || 1)) || 0;
        }
      }
      incomingsByCompany.get(cid).push({
        date: new Date(inc.documentDate || inc.date || inc.createdAt),
        qty: itemQty
      });
    }

    // 4. Precompute total allocations before startCutoff from plans < startCutoff
    const runningAllocated = new Map(); // cidStr -> number
    for (const cid of involvedCompanyIds) {
      runningAllocated.set(cid.toString(), 0);
    }

    const [priorLacquer, priorPrinting] = await Promise.all([
      inSession(LacquerPlan.find({
        isDeleted: false,
        isExcelViewOnly: { $ne: true },
        $and: [
          bottleMatchCondition,
          { planDate: { $lt: startCutoff } },
          {
            $or: [
              { 'stockAllocation.companyId': { $in: involvedCompanyIds } },
              {
                $and: [
                  { $or: [{ canonicalCompanyId: { $in: involvedCompanyIds } }, { companyId: { $in: involvedCompanyIds } }] },
                  { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
                ]
              }
            ]
          }
        ]
      }), session).lean(),
      inSession(PrintingPlan.find({
        isDeleted: false,
        isExcelViewOnly: { $ne: true },
        coatingShade: { $regex: /^PLAIN$/i },
        $and: [
          bottleMatchCondition,
          { planDate: { $lt: startCutoff } },
          {
            $or: [
              { 'stockAllocation.companyId': { $in: involvedCompanyIds } },
              {
                $and: [
                  { companyId: { $in: involvedCompanyIds } },
                  { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
                ]
              }
            ]
          }
        ]
      }), session).lean()
    ]);

    for (const lp of priorLacquer) {
      if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
        for (const a of lp.stockAllocation) {
          const cidStr = a.companyId ? a.companyId.toString() : '';
          if (runningAllocated.has(cidStr)) {
            runningAllocated.set(cidStr, runningAllocated.get(cidStr) + (Number(a.qty) || 0));
          }
        }
      } else {
        const cidStr = (lp.canonicalCompanyId || lp.companyId)?.toString();
        if (cidStr && runningAllocated.has(cidStr)) {
          const c1 = Number(lp.coatingCompletedQty) || 0;
          const c2 = Number(lp.coatedQty) || 0;
          const carried = Number(lp.carriedFromCoatedQty) || 0;
          runningAllocated.set(cidStr, runningAllocated.get(cidStr) + Math.max(0, Math.max(c1, c2) - carried));
        }
      }
      for (const allocation of getStockRejectionAllocations(lp)) {
        if (runningAllocated.has(allocation.companyId)) {
          runningAllocated.set(allocation.companyId, runningAllocated.get(allocation.companyId) + allocation.qty);
        }
      }
    }

    for (const pp of priorPrinting) {
      if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
        for (const a of pp.stockAllocation) {
          const cidStr = a.companyId ? a.companyId.toString() : '';
          if (runningAllocated.has(cidStr)) {
            runningAllocated.set(cidStr, runningAllocated.get(cidStr) + (Number(a.qty) || 0));
          }
        }
      } else {
        const cidStr = pp.companyId?.toString();
        if (cidStr && runningAllocated.has(cidStr)) {
          runningAllocated.set(cidStr, runningAllocated.get(cidStr) + (Number(pp.producedQty) || 0));
        }
      }
      for (const allocation of getPrintingReadyRejectionAllocations(pp)) {
        if (runningAllocated.has(allocation.companyId)) {
          runningAllocated.set(allocation.companyId, runningAllocated.get(allocation.companyId) + allocation.qty);
        }
      }
    }

    // 5. Fetch companies for ordering & names
    const companies = await inSession(Company.find({ _id: { $in: involvedCompanyIds } }), session).lean();
    const companyNameMap = new Map(companies.map(c => [c._id.toString(), c.name || '']));

    // 6. Combine and deterministically sort future plans:
    // planDate asc, then createdAt asc, then _id asc
    const taggedPlans = [
      ...futureLacquer.map(p => ({ ...p, planType: 'lacquer' })),
      ...futurePrinting.map(p => ({ ...p, planType: 'printing' }))
    ];

    taggedPlans.sort((a, b) => {
      const dDiff = new Date(a.planDate).getTime() - new Date(b.planDate).getTime();
      if (dDiff !== 0) return dDiff;
      const cDiff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      if (cDiff !== 0) return cDiff;
      return String(a._id).localeCompare(String(b._id));
    });

    const shortfalls = [];

    // Helper: calculate available for cid up to planDate
    const getAvailable = (cidStr, planDate) => {
      const pEnd = new Date(planDate);
      pEnd.setUTCHours(23, 59, 59, 999);
      const incList = incomingsByCompany.get(cidStr) || [];
      let totalInc = 0;
      for (const inc of incList) {
        if (inc.date <= pEnd) {
          totalInc += inc.qty;
        }
      }
      const allocated = runningAllocated.get(cidStr) || 0;
      return Math.max(0, totalInc - allocated);
    };

    // 7. Iterate through future plans and recompute allocations
    for (const plan of taggedPlans) {
      const planCid = (plan.canonicalCompanyId || plan.companyId)?.toString();

      // Determine sources list
      let rawSources = (plan.stockSources || []).map(s => s ? (s._id || s).toString() : null).filter(Boolean);
      if (rawSources.length === 0 && planCid) {
        rawSources = [planCid];
      }

      // Order: own company first (if in stockSources), then supplier companies (selection order, ties by name)
      const orderedSources = [];
      if (planCid && rawSources.includes(planCid)) {
        orderedSources.push(planCid);
      }
      const otherSources = rawSources.filter(s => s !== planCid);
      otherSources.sort((a, b) => {
        const nameA = companyNameMap.get(a) || '';
        const nameB = companyNameMap.get(b) || '';
        return nameA.localeCompare(nameB);
      });
      orderedSources.push(...otherSources);

      // Snapshot of opening available stock before this plan's allocation
      let combinedOpeningBeforePlan = 0;
      for (const srcId of orderedSources) {
        combinedOpeningBeforePlan += getAvailable(srcId, plan.planDate);
      }

      // Quantity to allocate
      const carried = Number(plan.carriedFromCoatedQty) || 0;
      const Q = plan.planType === 'lacquer'
        ? Math.max(0, Math.max(Number(plan.coatingCompletedQty) || 0, Number(plan.coatedQty) || 0) - carried)
        : (Number(plan.producedQty) || 0);

      // Preserve user-entered stockAllocation! Never overwrite user split.
      const existingAlloc = Array.isArray(plan.stockAllocation) && plan.stockAllocation.length > 0
        ? plan.stockAllocation
        : (planCid ? [{ companyId: new mongoose.Types.ObjectId(planCid), qty: Q }] : []);

      const carriedAllocMap = new Map();
      if (Array.isArray(plan.carriedStockAllocation)) {
        for (const ca of plan.carriedStockAllocation) {
          const cId = (ca.companyId?._id || ca.companyId)?.toString();
          if (cId) carriedAllocMap.set(cId, (carriedAllocMap.get(cId) || 0) + (Number(ca.qty) || 0));
        }
      }
      let shortfallQty = 0;
      for (const a of existingAlloc) {
        const aCid = (a.companyId?._id || a.companyId)?.toString();
        const aQty = Number(a.qty) || 0;
        if (aCid && aQty > 0) {
          const carriedPart = carriedAllocMap.get(aCid) || 0;
          const netTargetDateQty = Math.max(0, aQty - carriedPart);
          const avail = getAvailable(aCid, plan.planDate);
          if (netTargetDateQty > avail) {
            shortfallQty += (netTargetDateQty - Math.max(0, avail));
          }
          runningAllocated.set(aCid, (runningAllocated.get(aCid) || 0) + netTargetDateQty);
        }
      }
      const rejectionAllocations = plan.planType === 'lacquer'
        ? getStockRejectionAllocations(plan)
        : getPrintingReadyRejectionAllocations(plan);
      for (const allocation of rejectionAllocations) {
          const available = getAvailable(allocation.companyId, plan.planDate);
          if (allocation.qty > available) {
            shortfallQty += allocation.qty - Math.max(0, available);
          }
          runningAllocated.set(
            allocation.companyId,
            (runningAllocated.get(allocation.companyId) || 0) + allocation.qty
          );
      }

      const hasShortfall = shortfallQty > 0;
      if (hasShortfall) {
        shortfalls.push({
          planId: plan._id,
          planType: plan.planType,
          planDate: plan.planDate,
          companyId: planCid,
          shortfallQty
        });
      }

      // Update plan document in MongoDB (DAY ISOLATION: planDate >= startCutoff guaranteed)
      // Notice: stockAllocation is NEVER modified by replay!
      if (plan.planType === 'lacquer') {
        await inSession(LacquerPlan.updateOne(
          { _id: plan._id },
          {
            $set: {
              allocationShortfall: hasShortfall,
              shortfallQty,
              plainStock: combinedOpeningBeforePlan
            }
          }
        ), session);
      } else {
        await inSession(PrintingPlan.updateOne(
          { _id: plan._id },
          {
            $set: {
              allocationShortfall: hasShortfall,
              shortfallQty,
              plainBottleStock: combinedOpeningBeforePlan
            }
          }
        ), session);
      }
    }

    // 8. Recompute cumulative PlainBottleStock for all involved companies
    for (const cid of involvedCompanyIds) {
      await recomputePlainStock(options.useResolvedBottleDoc ? bp : bp._id, cid, userId, null, session);
    }

    return {
      success: true,
      shortfalls
    };
  } catch (err) {
    console.error("Error in replayStockAllocations:", err);
    throw err;
  }
}

/**
 * Validates stock before creating or updating a plan row.
 * Returns breakdown and checks if requested quantity exceeds combined available stock.
 */
async function validateStockBeforeSave(planDate, bottleName, companyId, stockSources, requestedQty, excludePlanId = null, options = {}) {
  const bp = await resolveBottlePerBoxDoc(bottleName);
  if (!bp) {
    throw new Error("Plain bottle not found");
  }

  // Check companyId
  if (companyId) {
    const comp = await Company.findById(companyId).lean();
    if (comp && comp.isStockSupplier) {
      throw new Error("Stock supplier companies cannot be used as the plan company.");
    }
  }

  // Normalize and validate stockSources
  let sources = Array.isArray(stockSources) ? stockSources.map(s => s ? (s._id || s).toString() : null).filter(Boolean) : [];
  if (sources.length === 0 && companyId) {
    sources = [(companyId._id || companyId).toString()];
  }

  const cidStr = companyId ? (companyId._id || companyId).toString() : null;
  const targetDate = planDate ? new Date(planDate) : new Date();
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const companiesWithIncoming = await getCompaniesWithBottleIncoming(
    bp,
    endOfDay,
    null,
    options.includeNonSupplierSources === true
  );
  const eligibleSourceIds = new Set(companiesWithIncoming.map(company => company._id.toString()));

  for (const src of sources) {
    if (cidStr && src === cidStr) continue;
    if (!eligibleSourceIds.has(src)) {
      throw new Error("Invalid stock sources. Select a company with Incoming stock for this bottle.");
    }
  }

  // Fetch live stock for the selected sources
  const stockRes = await computeLivePlainStock(bp._id, sources, planDate, excludePlanId, null, options);
  const combinedAvailable = stockRes.available !== undefined ? stockRes.available : Number(stockRes);

  const breakdownParts = (stockRes.sources || []).map(s => `${s.companyName}: ${s.available}`);
  const breakdownText = breakdownParts.length > 0 ? `<${breakdownParts.join(', ')}>` : '';

  if (Number(requestedQty) > combinedAvailable) {
    const err = new Error(`Only ${combinedAvailable} bottles available from the selected stock (${breakdownText})`);
    err.statusCode = 400;
    err.combinedAvailable = combinedAvailable;
    err.breakdown = stockRes.sources;
    throw err;
  }

  return {
    valid: true,
    combinedAvailable,
    combinedOpening: stockRes.openingStock,
    sources: stockRes.sources,
    breakdownText
  };
}

/**
 * Reconciles stock on startup for all active records across the system
 */
async function reconcileAllActiveStock(options = {}) {
  try {
    const { lastNHours = 24, skipIfEmpty = true } = options;
    const cutoffDate = new Date(Date.now() - lastNHours * 3600 * 1000);
    
    const incomings = await Incoming.find({ 
      isDeleted: false,
      isImported: { $ne: true },
      $or: [
        { updatedAt: { $gte: cutoffDate } },
        { createdAt: { $gte: cutoffDate } }
      ]
    }).lean();
    
    const pairs = new Set();
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && inc.billToId) {
          pairs.add(`${inc.billToId}:::${item.bottleId}`);
        }
      }
    }

    const lacquers = await LacquerPlan.find({ 
      isDeleted: false,
      isExcelViewOnly: { $ne: true },
      $or: [
        { updatedAt: { $gte: cutoffDate } },
        { createdAt: { $gte: cutoffDate } }
      ]
    }).lean();
    
    for (const lp of lacquers) {
      const cId = lp.canonicalCompanyId || lp.companyId;
      if (cId && lp.bottleName) {
        pairs.add(`${cId}:::${lp.bottleName}`);
      }
    }

    const printings = await PrintingPlan.find({ 
      isDeleted: false,
      isExcelViewOnly: { $ne: true },
      $or: [
        { updatedAt: { $gte: cutoffDate } },
        { createdAt: { $gte: cutoffDate } }
      ]
    }).lean();
    
    for (const pp of printings) {
      if (pp.companyId && pp.bottleName) {
        pairs.add(`${pp.companyId}:::${pp.bottleName}`);
      }
    }

    if (skipIfEmpty && pairs.size === 0) {
      console.log('[Stock] Reconcile skipped: no recent changes in last', lastNHours, 'hours');
      return;
    }

    console.log('[Stock] Reconciling', pairs.size, 'active (company, bottle) pairs from last', lastNHours, 'hours');
    for (const pair of pairs) {
      const [compId, bRef] = pair.split(':::');
      await recomputePlainStock(bRef, compId);
    }
  } catch (err) {
    console.error("reconcileAllActiveStock error:", err.message);
  }
}


/**
 * Returns available sources info for a canonical bottle on a given plan date.
 * Indicates whether any stock supplier company has the bottle (hasIncoming = true).
 */
async function getBottleSourcesInfo(bottleRef, companyId, planDate, excludePlanIds = null, options = {}) {
  const bp = await resolveBottlePerBoxDoc(bottleRef);
  if (!bp) {
    return {
      hasSuppliers: false,
      eligibleSuppliers: [],
      eligibleIncomingCompanies: [],
      sources: []
    };
  }

  const cidStr = companyId ? (companyId._id || companyId).toString() : null;
  const targetDate = planDate ? new Date(planDate) : new Date();
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const eligibleCompanies = await getCompaniesWithBottleIncoming(
    bp,
    endOfDay,
    null,
    options.includeNonSupplierSources === true
  );

  const allSourceIds = [cidStr, ...eligibleCompanies.map(company => company._id.toString())].filter(Boolean);
  const excludedPlanIds = options.useResolvedBottleDoc && excludePlanIds ? String(excludePlanIds) : excludePlanIds;
  const stockRes = await computeLivePlainStock(
    options.useResolvedBottleDoc ? bp : bp._id,
    allSourceIds,
    targetDate,
    excludedPlanIds,
    null,
    options
  );

  const stockSources = stockRes.sources || [];
  const ownSource = stockSources.find(s => s.companyId && s.companyId.toString() === cidStr);
  const eligibleSources = eligibleCompanies.map(company => {
    const found = stockSources.find(src => src.companyId && src.companyId.toString() === company._id.toString());
    return {
      companyId: company._id.toString(),
      companyName: company.name,
      available: found ? found.available : 0,
      openingStock: found ? found.openingStock : 0,
      hasIncoming: true,
      isStockSupplier: company.isStockSupplier === true
    };
  });
  const eligibleSuppliers = eligibleSources.filter(source => source.isStockSupplier);
  const eligibleIncomingCompanies = options.includeNonSupplierSources === true
    ? eligibleSources.filter(source => !source.isStockSupplier)
    : [];

  const sourceMap = new Map();
  if (ownSource) {
    sourceMap.set(ownSource.companyId.toString(), ownSource);
  }
  for (const src of eligibleSources) {
    sourceMap.set(src.companyId.toString(), src);
  }
  const uniqueSources = Array.from(sourceMap.values());

  return {
    hasSuppliers: eligibleSuppliers.length > 0,
    eligibleSuppliers,
    eligibleIncomingCompanies,
    ownCompany: ownSource ? {
      companyId: ownSource.companyId.toString(),
      companyName: ownSource.companyName,
      available: ownSource.available,
      openingStock: ownSource.openingStock
    } : null,
    sources: uniqueSources,
    plainStock: ownSource ? ownSource.available : stockRes.plainStock,
    openingStock: ownSource ? ownSource.openingStock : stockRes.openingStock
  };
}


/**
 * Validates user-entered stock split per row.
 */
async function validateStockAllocation(planDate, bottleRef, companyId, stockSources, requestedQty, userAllocation = null, excludePlanId = null, session = null, carriedAllocation = null, options = {}) {
  const bp = await resolveBottlePerBoxDoc(bottleRef, session);
  if (!bp) {
    throw new Error("Plain bottle not found");
  }

  // Reject stock supplier as plan company
  if (companyId) {
    const comp = await inSession(Company.findById(companyId), session).lean();
    if (comp && comp.isStockSupplier) {
      throw new Error("Stock supplier companies cannot be used as the plan company.");
    }
  }

  const cidStr = companyId ? (companyId._id || companyId).toString() : null;

  // Normalize sources
  let sources = Array.isArray(stockSources) ? stockSources.map(s => s ? (s._id || s).toString() : null).filter(Boolean) : [];
  if (sources.length === 0 && cidStr) {
    sources = [cidStr];
  }

  const targetDate = planDate ? new Date(planDate) : new Date();
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const companiesWithIncoming = await getCompaniesWithBottleIncoming(
    bp,
    endOfDay,
    session,
    options.includeNonSupplierSources === true
  );
  const eligibleSourceMap = new Map(companiesWithIncoming.map(company => [company._id.toString(), company]));

  for (const src of sources) {
    if (cidStr && src === cidStr) continue;
    if (!eligibleSourceMap.has(src)) {
      throw new Error("Invalid stock sources. Select a company with Incoming stock for this bottle.");
    }
  }

  // Compute live available stock for each selected source
  const excludedPlanId = options.useResolvedBottleDoc && excludePlanId ? String(excludePlanId) : excludePlanId;
  const stockRes = await computeLivePlainStock(
    options.useResolvedBottleDoc ? bp : bp._id,
    sources,
    planDate,
    excludedPlanId,
    session,
    options
  );
  const availMap = new Map();
  const nameMap = new Map();
  for (const s of (stockRes.sources || [])) {
    const sId = s.companyId ? s.companyId.toString() : '';
    availMap.set(sId, Number(s.available) || 0);
    nameMap.set(sId, s.companyName || 'Company');
  }

  const reqQty = Number(requestedQty) || 0;
  let finalAllocation = [];

  const carriedAllocMap = new Map();
  if (Array.isArray(carriedAllocation)) {
    for (const ca of carriedAllocation) {
      const cId = (ca.companyId?._id || ca.companyId)?.toString();
      if (cId) carriedAllocMap.set(cId, (carriedAllocMap.get(cId) || 0) + (Number(ca.qty) || 0));
    }
  }

  // Case 1: Single source selected
  if (sources.length <= 1) {
    const soleSource = sources[0] || cidStr;
    const avail = availMap.get(soleSource) || 0;
    const compName = nameMap.get(soleSource) || (soleSource === cidStr ? 'Own Company' : 'Supplier');
    const carriedPart = carriedAllocMap.get(soleSource) || 0;
    const netToCheck = Math.max(0, reqQty - carriedPart);

    if (userAllocation && Array.isArray(userAllocation) && userAllocation.length > 0) {
      let sum = 0;
      for (const a of userAllocation) {
        const aCid = (a.companyId?._id || a.companyId)?.toString();
        const q = Number(a.qty) || 0;
        if (aCid !== soleSource) {
          throw new Error("Allocation company does not match selected source.");
        }
        sum += q;
      }
      if (sum !== reqQty) {
        throw new Error(`Split must add up to ${reqQty} (now ${sum})`);
      }
      if (netToCheck > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${netToCheck})`);
      }
      finalAllocation = userAllocation.map(a => {
        const aCid = (a.companyId?._id || a.companyId)?.toString();
        return {
          companyId: aCid && mongoose.isValidObjectId(aCid) ? new mongoose.Types.ObjectId(aCid) : a.companyId,
          qty: Number(a.qty)
        };
      });
    } else {
      if (netToCheck > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${netToCheck})`);
      }
      finalAllocation = [{
        companyId: new mongoose.Types.ObjectId(soleSource),
        qty: reqQty
      }];
    }
  } else {
    // Case 2: Multiple sources selected (2 or more)
    if (!userAllocation || !Array.isArray(userAllocation) || userAllocation.length === 0) {
      const err = new Error("A stock split is required when multiple stock sources are selected.");
      err.statusCode = 400;
      throw err;
    }

    let sum = 0;
    for (const a of userAllocation) {
      const aCid = (a.companyId?._id || a.companyId)?.toString();
      const q = Number(a.qty);
      if (isNaN(q) || !Number.isInteger(q) || q < 0) {
        throw new Error("Split quantities must be non-negative integers.");
      }
      if (!sources.includes(aCid)) {
        throw new Error("Company in split is not one of the selected stock sources.");
      }
      const avail = availMap.get(aCid) || 0;
      const compName = nameMap.get(aCid) || 'Company';
      const carriedPart = carriedAllocMap.get(aCid) || 0;
      const netToCheck = Math.max(0, q - carriedPart);
      if (netToCheck > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${netToCheck})`);
      }
      sum += q;
    }

    if (sum !== reqQty) {
      throw new Error(`Split must add up to ${reqQty} (now ${sum})`);
    }

    finalAllocation = userAllocation.map(a => {
      const aCid = (a.companyId?._id || a.companyId)?.toString();
      return {
        companyId: aCid && mongoose.isValidObjectId(aCid) ? new mongoose.Types.ObjectId(aCid) : a.companyId,
        qty: Number(a.qty)
      };
    });
  }

  return {
    valid: true,
    stockSources: sources.filter(s => s && mongoose.isValidObjectId(s)).map(s => new mongoose.Types.ObjectId(s)),
    stockAllocation: finalAllocation,
    combinedAvailable: stockRes.available,
    sources: stockRes.sources
  };
}

module.exports = {
  recomputePlainStock,
  computeLivePlainStock,
  replayStockAllocations,
  validateStockBeforeSave,
  validateStockAllocation,
  getBottleSourcesInfo,
  getStockRejectionAllocations,
  getPrintingReadyRejectionAllocations,
  reconcileAllActiveStock
};
