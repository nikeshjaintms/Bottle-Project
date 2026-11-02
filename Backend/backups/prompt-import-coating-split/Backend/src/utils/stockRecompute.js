const mongoose = require("mongoose");
const BottlePerBox = require("../models/BottlePerBox");
const Incoming = require("../models/Incoming");
const LacquerPlan = require("../models/LacquerPlan");
const PrintingPlan = require("../models/PrintingPlan");
const PlainBottleStock = require("../models/PlainBottleStock");
const Company = require("../models/Company");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves a BottlePerBox document from an ID, name, or object.
 */
async function resolveBottlePerBoxDoc(bottleIdOrName) {
  if (!bottleIdOrName) return null;
  if (typeof bottleIdOrName === 'object' && bottleIdOrName._id) {
    return bottleIdOrName;
  }
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
 * Pool stock = Σ Incoming − Σ allocated coating (Lacquer) − Σ allocated Ready of PLAIN printing
 * Updates PlainBottleStock ledger in DB and returns the computed details.
 */
async function recomputePlainStock(bottleIdOrName, companyId = null, userId = null, reqCache = null) {
  if (!bottleIdOrName) return null;

  if (reqCache && reqCache.stockCache) {
    const cacheKey = `${companyId}:${bottleIdOrName}`;
    if (reqCache.stockCache[cacheKey]) {
      return reqCache.stockCache[cacheKey];
    }
  }

  const bp = await resolveBottlePerBoxDoc(bottleIdOrName);
  if (!bp) return null;

  let resolvedCompanyId = null;
  if (companyId) {
    const cidStr = (companyId._id || companyId).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      resolvedCompanyId = new mongoose.Types.ObjectId(cidStr);
    }
  }

  const { bottleMatchCondition } = buildBottleRegexes(bp);

  // 1. Σ non-deleted Incoming
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
    isDeleted: false,
    $and: andLacquer
  };

  const lacquerPlans = await LacquerPlan.find(lacquerQuery).lean();
  let totalCoatingCompleted = 0;
  for (const lp of lacquerPlans) {
    if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
      if (resolvedCompanyId) {
        for (const alloc of lp.stockAllocation) {
          if (alloc.companyId && alloc.companyId.toString() === resolvedCompanyId.toString()) {
            totalCoatingCompleted += Number(alloc.qty) || 0;
          }
        }
      } else {
        for (const alloc of lp.stockAllocation) {
          totalCoatingCompleted += Number(alloc.qty) || 0;
        }
      }
    } else {
      const c1 = Number(lp.coatingCompletedQty) || 0;
      const c2 = Number(lp.coatedQty) || 0;
      totalCoatingCompleted += Math.max(c1, c2);
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
    isDeleted: false,
    $and: andPrinting
  };

  const printingPlans = await PrintingPlan.find(printingQuery).lean();
  let totalPlainPrintingReady = 0;
  for (const pp of printingPlans) {
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
  const formulaValue = totalIncoming - totalCoatingCompleted - totalPlainPrintingReady;

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

  const stockDoc = await PlainBottleStock.findOneAndUpdate(
    stockFilter,
    {
      $set: updateFields,
      $setOnInsert: { reservedQuantity: 0 }
    },
    { upsert: true, returnDocument: 'after' }
  );

  const result = {
    bp,
    companyId: resolvedCompanyId,
    totalIncoming,
    totalCoatingCompleted,
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
async function computeLivePlainStock(bottleIdOrName, companyIdOrSources = null, targetDate = null, excludePlanIds = null) {
  if (!bottleIdOrName) return 0;

  const bp = await resolveBottlePerBoxDoc(bottleIdOrName);
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
  const companies = validSourceObjIds.length > 0 ? await Company.find({ _id: { $in: validSourceObjIds } }).lean() : [];
  const companyNameMap = new Map(companies.map(c => [c._id.toString(), c.name]));

  let combinedOpening = 0;
  let combinedSameDayCoated = 0;
  let combinedAvailable = 0;
  const sourcesBreakdown = [];

  async function computeSingleSource(srcObjectId, companyName) {
    // 1. Σ non-deleted Incoming (≤D)
    const incomingQuery = {
      isDeleted: false,
      'items.bottleId': bp._id
    };
    if (srcObjectId) {
      incomingQuery.billToId = srcObjectId;
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

    // 2. Lacquer Plan coating completed:
    // Prior plans (< startOfDay) and Same-day plans (between startOfDay and endOfDay)
    let priorCoatingCompleted = 0;
    let sameDayCoated = 0;

    const andBase = [bottleMatchCondition];
    if (srcObjectId) {
      andBase.push({
        $or: [
          { 'stockAllocation.companyId': srcObjectId },
          {
            $and: [
              { $or: [{ canonicalCompanyId: srcObjectId }, { companyId: srcObjectId }] },
              { $or: [{ stockAllocation: { $exists: false } }, { stockAllocation: { $size: 0 } }] }
            ]
          }
        ]
      });
    }

    if (startOfDay && endOfDay) {
      // Prior plans: < startOfDay
      const priorQuery = {
        isDeleted: false,
        $and: [...andBase, { planDate: { $lt: startOfDay } }]
      };
      if (excludeIds.length > 0) priorQuery._id = { $nin: excludeIds };

      const priorPlans = await LacquerPlan.find(priorQuery).lean();
      for (const lp of priorPlans) {
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
          priorCoatingCompleted += Math.max(c1, c2);
        }
      }

      // Same-day plans: between startOfDay and endOfDay
      const sameDayQuery = {
        isDeleted: false,
        $and: [...andBase, { planDate: { $gte: startOfDay, $lte: endOfDay } }]
      };
      if (excludeIds.length > 0) sameDayQuery._id = { $nin: excludeIds };

      const sameDayPlans = await LacquerPlan.find(sameDayQuery).lean();
      for (const lp of sameDayPlans) {
        if (Array.isArray(lp.stockAllocation) && lp.stockAllocation.length > 0) {
          if (srcObjectId) {
            for (const a of lp.stockAllocation) {
              if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
                sameDayCoated += Number(a.qty) || 0;
              }
            }
          } else {
            for (const a of lp.stockAllocation) sameDayCoated += Number(a.qty) || 0;
          }
        } else {
          const c1 = Number(lp.coatingCompletedQty) || 0;
          const c2 = Number(lp.coatedQty) || 0;
          sameDayCoated += Math.max(c1, c2);
        }
      }
    } else {
      // All-time cumulative
      const allLacquerQuery = {
        isDeleted: false,
        $and: [...andBase]
      };
      if (endOfDay) allLacquerQuery.$and.push({ planDate: { $lte: endOfDay } });
      if (excludeIds.length > 0) allLacquerQuery._id = { $nin: excludeIds };

      const allPlans = await LacquerPlan.find(allLacquerQuery).lean();
      for (const lp of allPlans) {
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
          priorCoatingCompleted += Math.max(c1, c2);
        }
      }
    }

    // 3. Σ Ready of PLAIN printing rows (≤D)
    const printingQuery = {
      isDeleted: false,
      coatingShade: { $regex: /^PLAIN$/i },
      $and: [...andBase]
    };
    if (endOfDay) {
      printingQuery.$and.push({ planDate: { $lte: endOfDay } });
    }
    if (excludeIds.length > 0) {
      printingQuery._id = { $nin: excludeIds };
    }
    const printingPlans = await PrintingPlan.find(printingQuery).lean();
    let totalPlainPrintingReady = 0;
    for (const pp of printingPlans) {
      if (Array.isArray(pp.stockAllocation) && pp.stockAllocation.length > 0) {
        if (srcObjectId) {
          for (const a of pp.stockAllocation) {
            if (a.companyId && a.companyId.toString() === srcObjectId.toString()) {
              totalPlainPrintingReady += Number(a.qty) || 0;
            }
          }
        } else {
          for (const a of pp.stockAllocation) totalPlainPrintingReady += Number(a.qty) || 0;
        }
      } else {
        totalPlainPrintingReady += (Number(pp.producedQty) || 0);
      }
    }

    const openingStock = totalIncoming - priorCoatingCompleted - totalPlainPrintingReady;
    const available = openingStock - sameDayCoated;

    return {
      companyId: srcObjectId,
      companyName,
      openingStock,
      available,
      sameDayCoated
    };
  }

  for (const srcStr of sourceIdStrings) {
    const srcObjectId = srcStr && mongoose.Types.ObjectId.isValid(srcStr) ? new mongoose.Types.ObjectId(srcStr) : null;
    const companyName = srcStr ? (companyNameMap.get(srcStr) || 'Unknown') : 'All Companies';
    const sRes = await computeSingleSource(srcObjectId, companyName);
    combinedOpening += sRes.openingStock;
    combinedSameDayCoated += sRes.sameDayCoated;
    combinedAvailable += sRes.available;
    if (srcObjectId) {
      sourcesBreakdown.push(sRes);
    }
  }

  // Check which stock suppliers have at least one non-deleted incoming entry for this bottle on or before endOfDay
  const allSuppliers = await Company.find({ isStockSupplier: true, isDeleted: { $ne: true } }).lean();
  const eligibleSuppliersList = [];
  for (const supp of allSuppliers) {
    const incExists = await Incoming.findOne({
      isDeleted: false,
      billToId: supp._id,
      'items.bottleId': bp._id,
      $or: [
        { documentDate: { $lte: endOfDay || new Date() } },
        { date: { $lte: endOfDay || new Date() } }
      ]
    }).select('_id').lean();
    if (incExists) {
      let found = sourcesBreakdown.find(s => s.companyId && s.companyId.toString() === supp._id.toString());
      if (!found) {
        found = await computeSingleSource(supp._id, supp.name);
      }
      eligibleSuppliersList.push({
        companyId: supp._id.toString(),
        companyName: supp.name,
        available: found ? found.available : 0,
        openingStock: found ? found.openingStock : 0,
        hasIncoming: true,
        isStockSupplier: true
      });
    }
  }

  const resObj = {
    openingStock: combinedOpening,
    plainStock: combinedAvailable,
    available: combinedAvailable,
    totalStock: combinedOpening,
    sameDayCoated: combinedSameDayCoated,
    sources: sourcesBreakdown,
    hasSuppliers: eligibleSuppliersList.length > 0,
    eligibleSuppliers: eligibleSuppliersList
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
async function replayStockAllocations(bottleRef, startDate, extraCompanyIds = [], userId = null) {
  try {
    const bp = await resolveBottlePerBoxDoc(bottleRef);
    if (!bp) return { success: false, message: "Bottle not found" };

    const { bottleMatchCondition } = buildBottleRegexes(bp);

    const startCutoff = new Date(startDate);
    startCutoff.setUTCHours(0, 0, 0, 0);

    // 1. Fetch future plans (>= startCutoff)
    const [futureLacquer, futurePrinting] = await Promise.all([
      LacquerPlan.find({ isDeleted: false, $and: [bottleMatchCondition, { planDate: { $gte: startCutoff } }] }).lean(),
      PrintingPlan.find({ isDeleted: false, coatingShade: { $regex: /^PLAIN$/i }, $and: [bottleMatchCondition, { planDate: { $gte: startCutoff } }] }).lean()
    ]);

    // 2. Identify all involved company IDs
    const involvedSet = new Set();
    extraCompanyIds.forEach(id => id && involvedSet.add((id._id || id).toString()));

    [...futureLacquer, ...futurePrinting].forEach(p => {
      if (p.companyId) involvedSet.add(p.companyId.toString());
      if (p.canonicalCompanyId) involvedSet.add(p.canonicalCompanyId.toString());
      (p.stockSources || []).forEach(s => s && involvedSet.add((s._id || s).toString()));
      (p.stockAllocation || []).forEach(a => a.companyId && involvedSet.add((a.companyId._id || a.companyId).toString()));
    });

    const involvedCompanyIds = Array.from(involvedSet).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

    // 3. Preload all Incomings for involved companies and bp._id
    const incomingsByCompany = new Map();
    const allIncomings = await Incoming.find({
      isDeleted: false,
      billToId: { $in: involvedCompanyIds },
      'items.bottleId': bp._id
    }).sort({ documentDate: 1 }).lean();

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
      LacquerPlan.find({
        isDeleted: false,
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
      }).lean(),
      PrintingPlan.find({
        isDeleted: false,
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
      }).lean()
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
          runningAllocated.set(cidStr, runningAllocated.get(cidStr) + Math.max(c1, c2));
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
    }

    // 5. Fetch companies for ordering & names
    const companies = await Company.find({ _id: { $in: involvedCompanyIds } }).lean();
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
      const Q = plan.planType === 'lacquer'
        ? Math.max(Number(plan.coatingCompletedQty) || 0, Number(plan.coatedQty) || 0)
        : (Number(plan.producedQty) || 0);

      // Preserve user-entered stockAllocation! Never overwrite user split.
      const existingAlloc = Array.isArray(plan.stockAllocation) && plan.stockAllocation.length > 0
        ? plan.stockAllocation
        : (planCid ? [{ companyId: new mongoose.Types.ObjectId(planCid), qty: Q }] : []);

      let shortfallQty = 0;
      for (const a of existingAlloc) {
        const aCid = (a.companyId?._id || a.companyId)?.toString();
        const aQty = Number(a.qty) || 0;
        if (aCid && aQty > 0) {
          const avail = getAvailable(aCid, plan.planDate);
          if (aQty > avail) {
            shortfallQty += (aQty - Math.max(0, avail));
          }
          runningAllocated.set(aCid, (runningAllocated.get(aCid) || 0) + aQty);
        }
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
        await LacquerPlan.updateOne(
          { _id: plan._id },
          {
            $set: {
              allocationShortfall: hasShortfall,
              shortfallQty,
              plainStock: combinedOpeningBeforePlan
            }
          }
        );
      } else {
        await PrintingPlan.updateOne(
          { _id: plan._id },
          {
            $set: {
              allocationShortfall: hasShortfall,
              shortfallQty,
              plainBottleStock: combinedOpeningBeforePlan
            }
          }
        );
      }
    }

    // 8. Recompute cumulative PlainBottleStock for all involved companies
    for (const cid of involvedCompanyIds) {
      await recomputePlainStock(bp._id, cid, userId);
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
async function validateStockBeforeSave(planDate, bottleName, companyId, stockSources, requestedQty, excludePlanId = null) {
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
  const suppliers = await Company.find({ isStockSupplier: true, isDeleted: { $ne: true } }).lean();
  const validSupplierIds = new Set(suppliers.map(s => s._id.toString()));

  for (const src of sources) {
    if (cidStr && src === cidStr) continue;
    if (!validSupplierIds.has(src)) {
      throw new Error("Invalid stock sources. Only own company and stock supplier companies are allowed.");
    }
  }

  // Fetch live stock for the selected sources
  const stockRes = await computeLivePlainStock(bp._id, sources, planDate, excludePlanId);
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
async function getBottleSourcesInfo(bottleRef, companyId, planDate, excludePlanIds = null) {
  const bp = await resolveBottlePerBoxDoc(bottleRef);
  if (!bp) {
    return {
      hasSuppliers: false,
      eligibleSuppliers: [],
      sources: []
    };
  }

  const cidStr = companyId ? (companyId._id || companyId).toString() : null;
  const targetDate = planDate ? new Date(planDate) : new Date();
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const suppliers = await Company.find({ isStockSupplier: true, isDeleted: { $ne: true } }).lean();
  const eligibleSuppliers = [];
  for (const s of suppliers) {
    const incExists = await Incoming.findOne({
      isDeleted: false,
      billToId: s._id,
      'items.bottleId': bp._id,
      $or: [
        { documentDate: { $lte: endOfDay } },
        { date: { $lte: endOfDay } }
      ]
    }).select('_id').lean();

    if (incExists) {
      eligibleSuppliers.push(s);
    }
  }

  const allSourceIds = [cidStr, ...eligibleSuppliers.map(s => s._id.toString())].filter(Boolean);
  const stockRes = await computeLivePlainStock(bp._id, allSourceIds, targetDate, excludePlanIds);

  const stockSources = stockRes.sources || [];
  const ownSource = stockSources.find(s => s.companyId && s.companyId.toString() === cidStr);
  const supplierSources = eligibleSuppliers.map(s => {
    const found = stockSources.find(src => src.companyId && src.companyId.toString() === s._id.toString());
    return {
      companyId: s._id.toString(),
      companyName: s.name,
      available: found ? found.available : 0,
      openingStock: found ? found.openingStock : 0,
      hasIncoming: true,
      isStockSupplier: true
    };
  });

  return {
    hasSuppliers: eligibleSuppliers.length > 0,
    eligibleSuppliers: supplierSources,
    ownCompany: ownSource ? {
      companyId: ownSource.companyId.toString(),
      companyName: ownSource.companyName,
      available: ownSource.available,
      openingStock: ownSource.openingStock
    } : null,
    sources: [ownSource, ...supplierSources].filter(Boolean),
    plainStock: ownSource ? ownSource.available : stockRes.plainStock,
    openingStock: ownSource ? ownSource.openingStock : stockRes.openingStock
  };
}


/**
 * Validates user-entered stock split per row.
 */
async function validateStockAllocation(planDate, bottleRef, companyId, stockSources, requestedQty, userAllocation = null, excludePlanId = null) {
  const bp = await resolveBottlePerBoxDoc(bottleRef);
  if (!bp) {
    throw new Error("Plain bottle not found");
  }

  // Reject stock supplier as plan company
  if (companyId) {
    const comp = await Company.findById(companyId).lean();
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

  // Verify only own company and valid stock suppliers
  const suppliers = await Company.find({ isStockSupplier: true, isDeleted: { $ne: true } }).lean();
  const validSupplierMap = new Map(suppliers.map(s => [s._id.toString(), s]));

  for (const src of sources) {
    if (cidStr && src === cidStr) continue;
    if (!validSupplierMap.has(src)) {
      throw new Error("Invalid stock sources. Only own company and stock supplier companies are allowed.");
    }
  }

  // Check that every selected supplier actually has the canonical plain bottle on or before planDate
  const targetDate = planDate ? new Date(planDate) : new Date();
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  for (const src of sources) {
    if (cidStr && src === cidStr) continue;
    const supp = validSupplierMap.get(src);
    const incExists = await Incoming.findOne({
      isDeleted: false,
      billToId: supp._id,
      'items.bottleId': bp._id,
      $or: [
        { documentDate: { $lte: endOfDay } },
        { date: { $lte: endOfDay } }
      ]
    }).select('_id').lean();

    if (!incExists) {
      throw new Error(`${supp.name} does not have stock for this bottle.`);
    }
  }

  // Compute live available stock for each selected source
  const stockRes = await computeLivePlainStock(bp._id, sources, planDate, excludePlanId);
  const availMap = new Map();
  const nameMap = new Map();
  for (const s of (stockRes.sources || [])) {
    const sId = s.companyId ? s.companyId.toString() : '';
    availMap.set(sId, Number(s.available) || 0);
    nameMap.set(sId, s.companyName || 'Company');
  }

  const reqQty = Number(requestedQty) || 0;
  let finalAllocation = [];

  // Case 1: Single source selected
  if (sources.length <= 1) {
    const soleSource = sources[0] || cidStr;
    const avail = availMap.get(soleSource) || 0;
    const compName = nameMap.get(soleSource) || (soleSource === cidStr ? 'Own Company' : 'Supplier');

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
      if (reqQty > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${reqQty})`);
      }
      finalAllocation = userAllocation.map(a => ({
        companyId: new mongoose.Types.ObjectId(a.companyId),
        qty: Number(a.qty)
      }));
    } else {
      if (reqQty > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${reqQty})`);
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
      if (q > avail) {
        throw new Error(`Only ${avail} bottles available from ${compName} (requested ${q})`);
      }
      sum += q;
    }

    if (sum !== reqQty) {
      throw new Error(`Split must add up to ${reqQty} (now ${sum})`);
    }

    finalAllocation = userAllocation.map(a => ({
      companyId: new mongoose.Types.ObjectId(a.companyId),
      qty: Number(a.qty)
    }));
  }

  return {
    valid: true,
    stockSources: sources.map(s => new mongoose.Types.ObjectId(s)),
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
  reconcileAllActiveStock
};
