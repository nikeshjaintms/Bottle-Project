
const LacquerPlan = require("../models/LacquerPlan");
const PlainBottleStock = require("../models/PlainBottleStock");
const { recomputePlainStock, computeLivePlainStock, replayStockAllocations, validateStockBeforeSave, validateStockAllocation, getBottleSourcesInfo } = require("../utils/stockRecompute");
const { computePlanGroupKey, resolveCanonicalPlainBottle, normalizeBottleName: normalizeBottleCanonical } = require("../utils/lacquerGroupKey");
const BottlePerBox = require("../models/BottlePerBox");
const CoatingProduction = require("../models/CoatingProduction");
const PrintingPlan = require("../models/PrintingPlan");
const BottleSpec = require("../models/Bottlespecs");
const Company = require("../models/Company");
const Brand = require("../models/Brand");
const Variant = require("../models/Variant");
const mongoose = require("mongoose");
const { decodeCursor, encodeCursor, parseLimit } = require("../utils/keyset-pagination");
const { isPrintingProcess } = require("../utils/processRouting");
const {
  buildLacquerPrintingIdentity,
  getLacquerPrintingDayRange,
  normalizeLacquerPrintingId,
  shouldCreateLacquerPrintingRow
} = require("../utils/lacquerPrintingIdentity");

let mongoTransactionSupportPromise;
const supportsMongoTransactions = () => {
  if (!mongoTransactionSupportPromise) {
    mongoTransactionSupportPromise = (async () => {
      try {
        if (!mongoose.connection.db) {
          throw new Error("MongoDB connection is not ready");
        }
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        const supported = Boolean(hello.setName) || hello.msg === "isdbgrid";
        console.info(`[MongoDB] Transaction support: ${supported ? "enabled" : "disabled"}`);
        return supported;
      } catch (error) {
        console.warn(`[MongoDB] Transaction support detection failed; using compensation: ${error.message}`);
        return false;
      }
    })();
  }
  return mongoTransactionSupportPromise;
};

mongoose.connection.on("connected", () => {
  void supportsMongoTransactions();
});
if (mongoose.connection.readyState === 1) {
  void supportsMongoTransactions();
}

const withMongoTransaction = async operation => {
  if (!(await supportsMongoTransactions())) {
    return operation(null);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const withLacquerPrintingCompensation = async (plans, operation) => {
  if (await supportsMongoTransactions()) {
    return withMongoTransaction(operation);
  }

  const planValues = plans.map(plan =>
    typeof plan.toObject === "function" ? plan.toObject() : plan
  );
  const planIds = [...new Map(
    planValues
      .filter(plan => plan?._id)
      .map(plan => [normalizeLacquerPrintingId(plan._id), plan._id])
  ).values()];
  const lacquerSnapshots = planIds.length
    ? await LacquerPlan.find({ _id: { $in: planIds } }).lean()
    : [];
  const printingSnapshots = new Map();
  const addPrintingSnapshots = rows => {
    for (const row of rows) {
      printingSnapshots.set(normalizeLacquerPrintingId(row._id), row);
    }
  };

  if (planIds.length) {
    addPrintingSnapshots(await PrintingPlan.find({ lacquerPlanId: { $in: planIds } }).lean());
  }
  for (const plan of planValues) {
    if (!plan?._id || !plan.planDate || !plan.companyId || !plan.brandId) continue;
    const identity = await buildLacquerPrintingIdentity(plan);
    if (!identity) continue;
    const { start, end } = getLacquerPrintingDayRange(plan.planDate);
    const candidates = await PrintingPlan.find({
      planDate: { $gte: start, $lte: end },
      companyId: plan.companyId,
      brandId: plan.brandId,
      isDeleted: { $ne: true },
      lacquerPlanId: null
    }).lean();
    for (const candidate of candidates) {
      if (await buildLacquerPrintingIdentity(candidate) === identity) {
        addPrintingSnapshots([candidate]);
      }
    }
  }

  try {
    return await operation(null);
  } catch (error) {
    const compensationFailures = [];
    const snapshotPrintingIds = [...printingSnapshots.values()].map(row => row._id);
    try {
      if (planIds.length) {
        await PrintingPlan.collection.deleteMany({
          lacquerPlanId: { $in: planIds },
          _id: { $nin: snapshotPrintingIds }
        });
      }
    } catch (compensationError) {
      compensationFailures.push({ ids: planIds.map(normalizeLacquerPrintingId), error: compensationError });
    }

    for (const snapshot of printingSnapshots.values()) {
      try {
        await PrintingPlan.collection.replaceOne(
          { _id: snapshot._id },
          snapshot,
          { upsert: true }
        );
      } catch (compensationError) {
        compensationFailures.push({ ids: [normalizeLacquerPrintingId(snapshot._id)], error: compensationError });
      }
    }

    const lacquerSnapshotIds = new Set(lacquerSnapshots.map(plan => normalizeLacquerPrintingId(plan._id)));
    for (const id of planIds) {
      const idString = normalizeLacquerPrintingId(id);
      try {
        const snapshot = lacquerSnapshots.find(plan => normalizeLacquerPrintingId(plan._id) === idString);
        if (snapshot) {
          await LacquerPlan.collection.replaceOne({ _id: snapshot._id }, snapshot, { upsert: true });
        } else if (!lacquerSnapshotIds.has(idString)) {
          await LacquerPlan.collection.deleteOne({ _id: id });
        }
      } catch (compensationError) {
        compensationFailures.push({ ids: [idString], error: compensationError });
      }
    }

    for (const failure of compensationFailures) {
      console.error(
        `[Lacquer/Printing compensation failed] document ids: ${failure.ids.join(", ")};`,
        failure.error
      );
    }
    if (compensationFailures.length > 0) {
      throw new Error(
        `${error.message}. Compensation also failed for ${compensationFailures.map(failure => failure.ids.join(", ")).join("; ")}.`
      );
    }
    throw error;
  }
};

const isPrintingSyncProcess = plan => isPrintingProcess(plan?.process);

const needsPrintingSyncTransaction = async plan => {
  if (isPrintingSyncProcess(plan)) return true;
  if (!plan?._id) return false;
  return Boolean(await PrintingPlan.exists({
    lacquerPlanId: plan._id,
    isDeleted: false
  }));
};

const savePlanWithPrintingSync = async (plan, userId) => {
  if (!(await needsPrintingSyncTransaction(plan))) {
    await plan.save();
    return null;
  }
  return withLacquerPrintingCompensation([plan], async session => {
    await plan.save(session ? { session } : undefined);
    return syncPrintingPlanForLacquerPlan(plan, userId, { session });
  });
};

// 30-second cache for totals
const lacquerTotalsCache = new Map();
const LACQUER_TOTALS_CACHE_TTL = 30000;
const {
  detectGujaratiHeaders,
  buildColumnMapFromGujarati,
  validateRequiredHeaders
} = require("../utils/gujaratiHeaderMapping");
const {
  DISPLAY_COLUMN_NAMES,
  getDisplayColumnName,
  verifyRowCompleteness,
  generatePreviewValidationReport
} = require("../utils/importPreviewVerification");

// Normalization and plan combination helpers
const normalizeBottleName = (text) => {
  if (!text) return '';
  return String(text).toUpperCase().replace(/[\s\-+]+/g, '');
};

const normalizePlanText = (text) => {
  if (!text) return '';
  return String(text).toUpperCase().replace(/[\s\.]+/g, '');
};

const normalizePlanProcess = (text) => {
  if (!text) return 'C';
  return String(text).toUpperCase().replace(/\s+/g, '');
};

const buildBrandResolver = (allBrands) => {
  const brandIdToName = new Map();
  const brandNameToId = new Map();

  if (Array.isArray(allBrands)) {
    allBrands.forEach(b => {
      const idStr = (b._id || b.id || '').toString();
      const normName = String(b.name || '').trim().toUpperCase().replace(/\s+/g, '');
      if (idStr) brandIdToName.set(idStr, normName);
      if (normName && idStr) brandNameToId.set(normName, idStr);
    });
  }

  return (brandId, brandName) => {
    if (brandId) {
      const idStr = brandId._id ? brandId._id.toString() : brandId.toString();
      if (brandIdToName.has(idStr)) {
        return brandIdToName.get(idStr);
      }
    }
    if (brandName) {
      const norm = String(brandName).trim().toUpperCase().replace(/\s+/g, '');
      if (brandNameToId.has(norm)) {
        const idStr = brandNameToId.get(norm);
        return brandIdToName.get(idStr) || norm;
      }
      return norm;
    }
    return '';
  };
};

const buildVariantResolver = (allVariants) => {
  const variantIdToName = new Map();
  const variantNameToId = new Map();

  if (Array.isArray(allVariants)) {
    allVariants.forEach(v => {
      const idStr = (v._id || v.id || '').toString();
      const normName = normalizePlanText(v.variantName);
      if (idStr && normName) {
        variantIdToName.set(idStr, normName);
        variantNameToId.set(normName, idStr);
      }
    });
  }

  return (variantId, variantName) => {
    if (variantName) {
      return normalizePlanText(variantName);
    }
    if (variantId) {
      if (typeof variantId === 'object' && variantId.variantName) {
        return normalizePlanText(variantId.variantName);
      }
      const idStr = (variantId._id || variantId).toString();
      if (variantIdToName.has(idStr)) {
        return variantIdToName.get(idStr);
      }
    }
    return '';
  };
};

const getPlanCombinationKeys = (item, resolveBrand = null, resolveVariant = null) => {
  if (!item) return [];
  const bottle = normalizeBottleName(item.bottleName || item.bottle || '');
  const brand = resolveBrand
    ? resolveBrand(item.brandId, item.brandName || item.brand)
    : String(item.brandName || item.brand || item.brandId || '').trim().toUpperCase().replace(/\s+/g, '');
  const shade = normalizePlanText(item.coatingShade || item.colour || '');
  const variant = resolveVariant
    ? resolveVariant(item.variantId, item.variantName || item.variant || '')
    : normalizePlanText(item.variantName || item.variant || (item.variantId && item.variantId.variantName) || '');
  const process = normalizePlanProcess(item.process);

  const keys = [];
  if (bottle && brand) {
    if (shade && variant) {
      // 1. Full combination key (bottle + brand + shade + variant + process)
      keys.push(`${bottle}__${brand}__${shade}__${variant}__${process}`);
      // Inverted order in case Excel header swapped shade and variant columns
      if (shade !== variant) {
        keys.push(`${bottle}__${brand}__${variant}__${shade}__${process}`);
      }
    } else if (shade) {
      // Shade-only key if variant was omitted
      keys.push(`${bottle}__${brand}__${shade}____${process}`);
    } else if (variant) {
      // Variant-only key if shade was omitted
      keys.push(`${bottle}__${brand}____${variant}__${process}`);
    } else {
      keys.push(`${bottle}__${brand}______${process}`);
    }
  }
  return keys;
};

// Backwards-compatible helper returning primary full key
const getPlanCombinationKey = (item, resolveBrand = null, resolveVariant = null) => {
  const keys = getPlanCombinationKeys(item, resolveBrand, resolveVariant);
  return keys[0] || '';
};

const getCoatedQty = (item) => {
  if (!item) return 0;
  const c1 = Number(item.coatingCompletedQty);
  const c2 = Number(item.coatedQty);
  if (Number.isFinite(c1) && Number.isFinite(c2)) {
    return Math.max(c1, c2);
  }
  if (Number.isFinite(c1)) return c1;
  if (Number.isFinite(c2)) return c2;
  return 0;
};

const isPlanRowCompleted = (item) => {
  if (!item) return false;
  const order = Number(item.orderQty) || 0;
  const coated = getCoatedQty(item);

  // If order is <= 0 or coated is 0, it is not a completed production row
  if (order <= 0 || coated <= 0) {
    return false;
  }

  // 1. Coating completed qty >= order qty (order > 0)
  if (coated >= order) {
    return true;
  }

  // 2. Database balanceToMake: coated - order >= 0 with coated > 0
  const bal = (item.balanceToMake !== undefined && item.balanceToMake !== null) ? Number(item.balanceToMake) : null;
  if (bal !== null && bal >= 0 && coated >= order) {
    return true;
  }

  return false;
};

const getCompletedCombinationsSet = async (targetDate = null, resolveBrand = null, resolveVariant = null, includeTargetDate = false) => {
  const query = {
    isDeleted: false,
    orderQty: { $gt: 0 },
    $or: [
      { $expr: { $gte: ["$coatingCompletedQty", "$orderQty"] }, coatingCompletedQty: { $gt: 0 } },
      { $expr: { $gte: ["$coatedQty", "$orderQty"] }, coatedQty: { $gt: 0 } },
      {
        balanceToMake: { $gte: 0 },
        $or: [
          { coatingCompletedQty: { $gt: 0 } },
          { coatedQty: { $gt: 0 } }
        ]
      }
    ]
  };

  if (targetDate) {
    const target = new Date(targetDate);
    if (includeTargetDate) {
      const endOfTarget = new Date(target);
      endOfTarget.setUTCHours(23, 59, 59, 999);
      query.planDate = { $lte: endOfTarget };
    } else {
      const startOfTarget = new Date(target);
      startOfTarget.setUTCHours(0, 0, 0, 0);
      query.planDate = { $lt: startOfTarget };
    }
  }

  const completedPlans = await LacquerPlan.find(query)
    .populate('brandId', 'name')
    .populate('variantId', 'variantName')
    .lean();

  const completedSet = new Set();
  completedPlans.forEach(p => {
    if (isPlanRowCompleted(p)) {
      const keys = getPlanCombinationKeys(p, resolveBrand, resolveVariant);
      keys.forEach(k => completedSet.add(k));
    }
  });

  return completedSet;
};

// Helper to get all rows marked as sent to Ready To Dispatch before target date
// Returns a Set of combination keys for rows that are fully sent or completed
// This is used to skip sent rows during import (similar to completed rows)
const getSentToDispatchCombinationsSet = async (targetDate = null, resolveBrand = null, resolveVariant = null, includeTargetDate = false) => {
  const query = {
    isDeleted: false,
    readyToDispatch: { $exists: true, $ne: null } // Only rows with the readyToDispatch mark
  };

  if (targetDate) {
    const target = new Date(targetDate);
    if (includeTargetDate) {
      const endOfTarget = new Date(target);
      endOfTarget.setUTCHours(23, 59, 59, 999);
      query.planDate = { $lte: endOfTarget };
    } else {
      const startOfTarget = new Date(target);
      startOfTarget.setUTCHours(0, 0, 0, 0);
      query.planDate = { $lt: startOfTarget };
    }
  }

  const sentPlans = await LacquerPlan.find(query)
    .populate('brandId', 'name')
    .populate('variantId', 'variantName')
    .lean();

  const sentSet = new Set();
  sentPlans.forEach(p => {
    const order = Number(p.orderQty || 0);
    const coated = Number(p.coatingCompletedQty ?? p.coatedQty ?? 0);
    const sent = Number(p.sentToReadyQty || 0);
    const isCompleted = order > 0 && coated >= order;
    const isFullySent = (order > 0 && sent >= order) || (coated > 0 && sent >= coated && isCompleted);

    // Only skip rows that are completed or sent in full.
    // Rows that still have balance (coated < order) must continue to come into the new date's plan!
    if (isCompleted || isFullySent) {
      const keys = getPlanCombinationKeys(p, resolveBrand, resolveVariant);
      keys.forEach(k => sentSet.add(k));
    }
  });

  return sentSet;
};

// Helper to find PlainBottleStock for a bottle, optionally scoped to a company
const findPlainBottleStockDoc = async (bottleName, companyId = null) => {
  if (!bottleName) return null;
  const result = await recomputePlainStock(bottleName, companyId);
  return result?.stockDoc || null;
};

// Stock sync helper
const syncLacquerPlanStockDeduction = async (planDocOrId, newCoatedQty, userId = null) => {
  let plan = typeof planDocOrId === 'object' && planDocOrId._id ? planDocOrId : await LacquerPlan.findById(planDocOrId);
  if (!plan) return;

  const targetDeduction = (newCoatedQty !== undefined && newCoatedQty !== null)
    ? (Number(newCoatedQty) || 0)
    : (Number(plan.coatingCompletedQty ?? plan.coatedQty) || 0);

  plan.appliedStockDeduction = targetDeduction;
  await LacquerPlan.findByIdAndUpdate(plan._id, { $set: { appliedStockDeduction: targetDeduction } });

  if (plan.bottleName) {
    await recomputePlainStock(plan.bottleName, plan.canonicalCompanyId || plan.companyId, userId);
  }
};

// Revert applied stock deduction completely (e.g. on soft delete or replacing existing)
const revertLacquerPlanStockDeduction = async (planDocOrId, userId = null) => {
  let plan = typeof planDocOrId === 'object' && planDocOrId._id ? planDocOrId : await LacquerPlan.findById(planDocOrId);
  if (!plan) return;

  plan.appliedStockDeduction = 0;
  await LacquerPlan.findByIdAndUpdate(plan._id, { $set: { appliedStockDeduction: 0 } });

  if (plan.bottleName) {
    await recomputePlainStock(plan.bottleName, plan.canonicalCompanyId || plan.companyId, userId);
  }
};

// Helper to validate company, bottle, and variant integrity
const validatePlanCompanyBottleVariant = async (planData, isUpdate = false, existingPlan = null) => {
  let companyId = planData.companyId || (existingPlan && existingPlan.companyId);
  let companyName = planData.companyName || (existingPlan && existingPlan.companyName);

  let company = null;
  if (companyId) {
    company = await Company.findOne({ _id: companyId, isDeleted: { $ne: true } });
  }
  if (!company && companyName) {
    company = await Company.findOne({
      name: { $regex: new RegExp("^" + companyName.trim() + "$", "i") },
      isDeleted: { $ne: true }
    });
  }

  // Fallback to existing plan's brand's company if updating an older plan
  if (!company && existingPlan && existingPlan.brandId) {
    const brand = await Brand.findById(existingPlan.brandId).populate('companyId');
    if (brand && brand.companyId) {
      company = brand.companyId;
    }
  }

  if (!company) {
    if (!isUpdate || planData.companyId !== undefined || planData.companyName !== undefined || planData.bottleName !== undefined) {
      throw new Error("Company selection is required.");
    }
    return;
  }

  if (company.isStockSupplier) {
    throw new Error("Stock supplier companies cannot be used for Lacquer Plan.");
  }

  if (planData.stockSources !== undefined) {
    let sources = Array.isArray(planData.stockSources) ? planData.stockSources : [planData.stockSources];
    sources = sources.map(s => s ? (s._id || s).toString() : null).filter(Boolean);
    const suppliers = await Company.find({ isStockSupplier: true, isDeleted: { $ne: true } }).lean();
    const validSupplierIds = new Set(suppliers.map(s => s._id.toString()));
    const compIdStr = company._id.toString();

    for (const src of sources) {
      if (src !== compIdStr && !validSupplierIds.has(src)) {
        throw new Error("Invalid stock sources. Only own company and stock supplier companies are allowed.");
      }
    }
    planData.stockSources = sources.filter(s => s && mongoose.isValidObjectId(s)).map(s => new mongoose.Types.ObjectId(s));
  } else if (!isUpdate) {
    planData.stockSources = [company._id];
  }

  planData.companyId = company._id;
  planData.companyName = company.name;

  const bottleName = planData.bottleName || (existingPlan && existingPlan.bottleName);
  if (!bottleName) {
    throw new Error("Bottle Name is required.");
  }

  // Get all active brands belonging to this company
  const companyBrands = await Brand.find({ companyId: company._id, isDeleted: { $ne: true } }).select('_id');
  const companyBrandIds = companyBrands.map(b => b._id);

  // Verify that the bottle belongs to this company via BottleSpec
  let matchingSpec = await BottleSpec.findOne({
    bottleName: bottleName.trim(),
    brandId: { $in: companyBrandIds },
    isDeleted: { $ne: true }
  });

  if (!matchingSpec) {
    const selectedPlainBottle = await BottlePerBox.findOne({
      $or: [
        { plainBottleName: bottleName.trim() },
        { bottleName: bottleName.trim() },
        { bottleNames: bottleName.trim() }
      ],
      isDeleted: false
    });
    if (selectedPlainBottle) {
      const aliasNames = [
        selectedPlainBottle.plainBottleName,
        selectedPlainBottle.bottleName,
        ...(Array.isArray(selectedPlainBottle.bottleNames) ? selectedPlainBottle.bottleNames : [])
      ].filter(Boolean);
      const regexList = aliasNames.map(n => new RegExp(`^${n.trim()}$`, 'i'));
      matchingSpec = await BottleSpec.findOne({
        bottleName: { $in: regexList },
        brandId: { $in: companyBrandIds },
        isDeleted: { $ne: true }
      });
    }
  }

  if (!matchingSpec) {
    throw new Error(`Bottle "${bottleName}" is not associated with company "${company.name}".`);
  }

  // Check if company is Shreno
  const isShreno = (company.name || '').toLowerCase().includes('shreno');

  // If variantId is provided, verify it belongs to the selected bottle and company
  const variantId = planData.variantId !== undefined ? planData.variantId : (existingPlan && existingPlan.variantId);
  if (!isShreno && !variantId) {
    throw new Error(`Variant is required for company "${company.name}".`);
  }

  if (variantId) {
    const variant = await Variant.findOne({ _id: variantId, isDeleted: { $ne: true } }).populate('bottleSpecId');
    if (!variant) {
      throw new Error("Selected variant was not found.");
    }
    if (!variant.bottleSpecId) {
      throw new Error("Selected variant is not associated with any bottle specification.");
    }
    let isBottleMatch = (variant.bottleSpecId.bottleName?.trim() || '').toUpperCase() === bottleName.trim().toUpperCase();
    if (!isBottleMatch) {
      const selectedPlainBottle = await BottlePerBox.findOne({
        $or: [
          { plainBottleName: { $regex: new RegExp(`^${bottleName.trim()}$`, 'i') } },
          { bottleName: { $regex: new RegExp(`^${bottleName.trim()}$`, 'i') } },
          { bottleNames: { $regex: new RegExp(`^${bottleName.trim()}$`, 'i') } }
        ],
        isDeleted: false
      });
      if (selectedPlainBottle) {
        const pNames = [
          selectedPlainBottle.plainBottleName,
          selectedPlainBottle.bottleName,
          ...(Array.isArray(selectedPlainBottle.bottleNames) ? selectedPlainBottle.bottleNames : [])
        ].filter(Boolean).map(n => n.trim().toUpperCase());
        const vBName = (variant.bottleSpecId.bottleName?.trim() || '').toUpperCase();
        isBottleMatch = pNames.includes(vBName);
      }
    }

    if (!isBottleMatch) {
      throw new Error(`Variant "${variant.variantName}" belongs to bottle "${variant.bottleSpecId.bottleName}", not "${bottleName}".`);
    }
    const specBrandId = variant.bottleSpecId.brandId?._id || variant.bottleSpecId.brandId;
    if (specBrandId && !companyBrandIds.some(id => id.toString() === specBrandId.toString())) {
      throw new Error(`Variant "${variant.variantName}" does not belong to company "${company.name}".`);
    }
  }
};

const findMatchingPrintingPlan = async (plan, session = null) => {
  if (!plan?.planDate || !plan?.companyId || !plan?.brandId) return null;

  const { start, end } = getLacquerPrintingDayRange(plan.planDate);
  const baseQuery = {
    planDate: { $gte: start, $lte: end },
    companyId: plan.companyId,
    brandId: plan.brandId,
    isDeleted: { $ne: true }
  };

  const candidateQuery = PrintingPlan.find(baseQuery).sort({ createdAt: 1, _id: 1 });
  if (session) candidateQuery.session(session);

  const candidates = await candidateQuery.lean();
  const targetIdentity = await buildLacquerPrintingIdentity(
    {
      ...(typeof plan.toObject === 'function' ? plan.toObject() : plan),
      variantName: plan.variantName || plan.printingVariant || plan.printingToBeDone || "",
      coatingShade: plan.coatingShade || plan.colour || ""
    },
    session
  );
  if (!targetIdentity) return null;

  for (const candidate of candidates) {
    if (candidate?._id && candidate._id.toString() === String(plan._id || "")) continue;
    if (await buildLacquerPrintingIdentity(candidate, session) === targetIdentity) {
      return candidate;
    }
  }

  return null;
};

// Helper to auto-create and synchronize PrintingPlan 1-to-1 with a LacquerPlan row
const syncPrintingPlanForLacquerPlan = async (plan, userId = null, { session = null } = {}) => {
  if (!plan) return null;
  if (plan.isSibling || plan.isSoftRemoved) return null;

  if (plan.isDeleted || plan.isClosed || plan.productionStatus === 'CLOSED' ||
      !isPrintingProcess(plan.process)) {
    if (plan._id) {
      await PrintingPlan.updateMany(
        { lacquerPlanId: plan._id, isDeleted: false },
        { $set: { isDeleted: true } },
        session ? { session } : {}
      );
    }
    return null;
  }

  let pToBeDone = plan.variantName || "";
  let tColor = "";
  if (plan.variantId) {
    let variantQuery = Variant.findOne({ _id: plan.variantId, isDeleted: { $ne: true } });
    if (session) variantQuery = variantQuery.session(session);
    const variant = await variantQuery;
    if (variant) {
      pToBeDone = variant.variantName || pToBeDone;
      tColor = variant.detectedTextColor || "";
    }
  }

  let specQuery = BottleSpec.findOne({ bottleName: plan.bottleName, isDeleted: false });
  if (session) specQuery = specQuery.session(session);
  let spec = await specQuery;
  if (!spec && plan.brandId) {
    let brandSpecQuery = BottleSpec.findOne({ bottleName: plan.bottleName, brandId: plan.brandId, isDeleted: false });
    if (session) brandSpecQuery = brandSpecQuery.session(session);
    spec = await brandSpecQuery;
  }
  if (!spec) {
    let plainBottleQuery = BottlePerBox.findOne({
      $or: [
        { plainBottleName: plan.bottleName.trim() },
        { bottleName: plan.bottleName.trim() },
        { bottleNames: plan.bottleName.trim() }
      ],
      isDeleted: false
    });
    if (session) plainBottleQuery = plainBottleQuery.session(session);
    const selectedPlainBottle = await plainBottleQuery;
    if (selectedPlainBottle?.bottleNames?.length > 0) {
      let selectedSpecQuery = BottleSpec.findOne({
        bottleName: { $in: selectedPlainBottle.bottleNames },
        brandId: plan.brandId,
        isDeleted: false
      });
      if (session) selectedSpecQuery = selectedSpecQuery.session(session);
      spec = await selectedSpecQuery;
    }
  }

  const shade = plan.coatingShade || plan.colour || "";
  const plainStock = plan.process === 'P'
    ? await computeLivePlainStock(plan.bottleName, plan.companyId, plan.planDate)
    : (plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
  const planData = typeof plan.toObject === 'function' ? plan.toObject() : plan;
  const targetIdentity = await buildLacquerPrintingIdentity({
    ...planData,
    variantName: pToBeDone,
    coatingShade: shade
  }, session);

  let linkedQuery = PrintingPlan.findOne({ lacquerPlanId: plan._id, isDeleted: { $ne: true } });
  if (session) linkedQuery = linkedQuery.session(session);
  let existingPlan = await linkedQuery;
  let adoptedCandidateCount = 0;
  let leftUnlinkedCandidateCount = 0;

  if (!existingPlan && plan.planDate && targetIdentity) {
    const matchingCandidates = [];
    const { start, end } = getLacquerPrintingDayRange(plan.planDate);
    let candidatesQuery = PrintingPlan.find({
      planDate: { $gte: start, $lte: end },
      companyId: plan.companyId,
      brandId: plan.brandId,
      isDeleted: { $ne: true }
    }).sort({ createdAt: 1, _id: 1 });
    if (session) candidatesQuery = candidatesQuery.session(session);
    const candidates = await candidatesQuery;

    for (const candidate of candidates) {
      if (candidate?._id && String(candidate._id) === String(plan._id || "")) continue;
      const candidateIdentity = await buildLacquerPrintingIdentity(candidate, session);
      if (candidateIdentity === targetIdentity) {
        matchingCandidates.push(candidate);
      }
    }

    matchingCandidates.sort((left, right) =>
      new Date(left.createdAt || 0) - new Date(right.createdAt || 0) ||
      normalizeLacquerPrintingId(left._id).localeCompare(normalizeLacquerPrintingId(right._id))
    );

    if (matchingCandidates.length > 0) {
      existingPlan = matchingCandidates[0];
      adoptedCandidateCount = 1;
      leftUnlinkedCandidateCount = matchingCandidates.length - 1;
      existingPlan.lacquerPlanId = plan._id;
    }
  }

  if (existingPlan) {
    existingPlan.planDate = plan.planDate;
    existingPlan.bottleName = plan.bottleName;
    existingPlan.companyId = plan.companyId;
    existingPlan.brandId = plan.brandId;
    if (plan.brandName) existingPlan.brandName = plan.brandName;
    existingPlan.coatingShade = shade;
    existingPlan.printingToBeDone = pToBeDone || existingPlan.printingToBeDone || "";
    existingPlan.printingVariant = pToBeDone || existingPlan.printingVariant || "";
    existingPlan.plainBottleStock = plainStock;
    existingPlan.process = plan.process;
    existingPlan.orderQty = plan.orderQty;
    if (plan.boxQty !== undefined) existingPlan.boxQty = plan.boxQty;
    if (Number(existingPlan.boxQty) > 0) {
      existingPlan.noOfBoxes = Math.ceil((Number(plan.orderQty) || 0) / Number(existingPlan.boxQty));
    }
    if (plan.remarks !== undefined) existingPlan.remarks = plan.remarks;
    if (spec) existingPlan.itemId = spec._id;
    const readyEntriesQty = (existingPlan.qtyEntries || [])
      .filter(entry => !entry.isDeleted && entry.subType === "ready")
      .reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
    const producedQtyInitial = existingPlan.producedQtyInitial !== null && existingPlan.producedQtyInitial !== undefined
      ? Number(existingPlan.producedQtyInitial)
      : Math.max(0, (Number(existingPlan.producedQty) || 0) - readyEntriesQty);
    existingPlan.balanceToMake = producedQtyInitial + readyEntriesQty - (Number(plan.orderQty) || 0);
    existingPlan.isDeleted = false;
    await existingPlan.save(session ? { session } : undefined);
    return { plan: existingPlan, adoptedCandidateCount, leftUnlinkedCandidateCount };
  }

  // Previous-day imports receive their Printing row from the separate Printing import.
  if (!shouldCreateLacquerPrintingRow(plan, existingPlan)) {
    return { plan: null, adoptedCandidateCount: 0, leftUnlinkedCandidateCount: 0 };
  }

  const created = new PrintingPlan({
    lacquerPlanId: plan._id,
    planDate: plan.planDate,
    bottleName: plan.bottleName,
    itemId: spec ? spec._id : undefined,
    companyId: plan.companyId,
    brandId: plan.brandId,
    brandName: plan.brandName,
    coatingShade: shade,
    printingToBeDone: pToBeDone,
    printingVariant: pToBeDone,
    textColor: tColor,
    plainBottleStock: plainStock,
    balanceToMake: 0 - (Number(plan.orderQty) || 0),
    producedQty: 0,
    process: plan.process,
    orderQty: plan.orderQty,
    boxQty: plan.boxQty,
    noOfBoxes: plan.noOfBoxes,
    status: plan.status !== false,
    remarks: plan.remarks,
    isDeleted: false,
    isEditedAfterImport: false,
    originalImportedValues: {
      orderQty: plan.orderQty,
      producedQty: 0,
      balanceToMake: 0,
      boxQty: plan.boxQty,
      noOfBoxes: plan.noOfBoxes,
      dispatchBalance: 0,
      soldQty: 0,
      readyBoxes: 0,
      plainBottleStock: plainStock,
      remarks: plan.remarks,
      printingToBeDone: pToBeDone,
      printingVariant: "",
      textColor: tColor,
      coatingShade: shade
    }
  });
  await created.save(session ? { session } : undefined);
  return { plan: created, adoptedCandidateCount, leftUnlinkedCandidateCount };
};

const createPrintingPlanIfApplicable = syncPrintingPlanForLacquerPlan;

// ============= STOCK VALIDATION HELPERS =============
/**
 * Calculate available stock for a Plain Bottle considering allocations
 * @param {string} plainBottleName - Name of the plain bottle
 * @param {ObjectId} companyId - Company ID to scope the query
 * @param {Date} excludeDate - (optional) Date to exclude from allocation count
 * @returns {Promise<{totalStock, allocated, available, breakdown}>}
 */
const calculateAvailableStock = async (plainBottleName, companyId, excludeDate = null, planDate = null, excludePlanIds = null) => {
  try {
    if (!plainBottleName || !companyId) {
      return {
        totalStock: 0,
        openingStock: 0,
        totalCoatedToday: 0,
        allocated: 0,
        available: 0,
        breakdown: { lacquerPlans: 0, incomingPlan: 0, reserved: 0 }
      };
    }

    // 1. Get live shown stock computed as of target date (excluding excludePlanIds)
    const effectiveDate = planDate || (excludeDate ? new Date(excludeDate) : new Date());
    const availableStock = await computeLivePlainStock(plainBottleName, companyId, effectiveDate, excludePlanIds);

    return {
      totalStock: availableStock,
      openingStock: availableStock,
      totalCoatedToday: 0,
      allocated: 0,
      available: availableStock,
      breakdown: { lacquerPlans: 0, incomingPlan: 0, reserved: 0 }
    };
  } catch (error) {
    console.error('calculateAvailableStock error:', error);
    throw error;
  }
};

/**
 * Validate stock warning for a row
 * Rule: For a row, warning applies only when that row's own Order Qty > opening stock of its pool for that date.
 * Other rows' orders are never part of it. A blank or zero order never warns.
 * @param {string} plainBottleName - Name of the plain bottle
 * @param {ObjectId} companyId - Company ID
 * @param {number} orderQty - Quantity being ordered
 * @param {ObjectId} excludeRowId - (optional)
 * @param {Date|string} planDate - (optional) Target plan date
 * @param {Array|string} excludePlanIds - (optional)
 * @returns {Promise<{hasWarning, orderQty, availableStock, openingStock, overBy, details}>}
 */
const validateRowStockWarning = async (plainBottleName, companyId, orderQty, excludeRowId = null, planDate = null, excludePlanIds = null) => {
  try {
    const parsedOrder = parseFloat(orderQty) || 0;
    if (!plainBottleName || !companyId || parsedOrder <= 0) {
      return {
        hasWarning: false,
        orderQty: parsedOrder,
        availableStock: 0,
        openingStock: 0,
        overBy: 0,
        details: null
      };
    }

    let excludeDate = null;
    const effectiveExclude = excludePlanIds || excludeRowId;
    if (excludeRowId) {
      const rowToExclude = await LacquerPlan.findById(excludeRowId).select('planDate orderQty').lean();
      if (rowToExclude) {
        excludeDate = rowToExclude.planDate;
      }
    }

    const stock = await calculateAvailableStock(plainBottleName, companyId, excludeDate, planDate, effectiveExclude);
    const openingStock = stock.openingStock !== undefined ? stock.openingStock : stock.available;
    const hasWarning = parsedOrder > 0 && parsedOrder > openingStock;
    const overBy = hasWarning ? (parsedOrder - openingStock) : 0;

    return {
      hasWarning,
      orderQty: parsedOrder,
      availableStock: openingStock,
      openingStock,
      overBy,
      details: {
        totalStock: stock.totalStock,
        openingStock,
        totalCoatedToday: 0
      }
    };
  } catch (error) {
    console.error('validateRowStockWarning error:', error);
    throw error;
  }
};

const getReadyBoxFields = (row) => {
  const bottlePerBox = Number(row.boxQty);
  if (!Number.isFinite(bottlePerBox) || bottlePerBox <= 0) {
    return { readyBoxes: null, looseQty: null, showLooseQty: false };
  }

  const rawCoatedQty = Number(row.coatingCompletedQty ?? row.coatedQty ?? 0);
  const coatingCompletedQty = Number.isFinite(rawCoatedQty) ? rawCoatedQty : 0;
  const readyBoxes = Math.floor(coatingCompletedQty / bottlePerBox);
  const looseQty = coatingCompletedQty - (readyBoxes * bottlePerBox);

  return {
    readyBoxes,
    looseQty,
    showLooseQty: coatingCompletedQty !== 0
  };
};

const calculatePoolStockWarnings = async (
  targetRows,
  { planDate, draftRows = [], excludePlanIds = [] } = {}
) => {
  if (!Array.isArray(targetRows) || targetRows.length === 0) return [];

  const excludedIds = new Set(
    (Array.isArray(excludePlanIds) ? excludePlanIds : String(excludePlanIds || "").split(","))
      .map(id => String(id?._id || id || "").trim())
      .filter(Boolean)
  );
  const dateStarts = new Map();
  for (const row of [...targetRows, ...draftRows]) {
    const date = new Date(row.planDate || planDate);
    if (!Number.isFinite(date.getTime())) continue;
    date.setUTCHours(0, 0, 0, 0);
    dateStarts.set(date.toISOString().slice(0, 10), date);
  }

  const [companies, brands, ...savedRowsByDate] = await Promise.all([
    Company.find({ isDeleted: { $ne: true } }).select("_id name").lean(),
    Brand.find({ isDeleted: { $ne: true } }).select("_id companyId").lean(),
    ...Array.from(dateStarts.values()).map(async start => {
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
      return LacquerPlan.find({
        planDate: { $gte: start, $lte: end },
        isDeleted: { $ne: true },
        isArchived: { $ne: true },
        isSoftRemoved: { $ne: true },
        isSibling: { $ne: true }
      }).populate("brandId", "companyId").lean();
    })
  ]);
  const companyIdsByName = new Map(companies.map(company => [company.name.trim().toLowerCase(), String(company._id)]));
  const companyIdsByBrand = new Map(brands.map(brand => [String(brand._id), String(brand.companyId)]));
  const canonicalBottleCache = new Map();
  const dateKeys = Array.from(dateStarts.keys());
  const savedRows = savedRowsByDate.flatMap((rows, index) =>
    (rows || []).map(row => ({ row, dateKey: dateKeys[index] }))
  );

  const identityFor = async (row, fallbackDate) => {
    const date = new Date(row.planDate || fallbackDate);
    if (!Number.isFinite(date.getTime())) return null;
    const dateKey = date.toISOString().slice(0, 10);
    const directId = row.canonicalCompanyId?._id || row.canonicalCompanyId || row.companyId?._id || row.companyId;
    const brandRef = row.brandId?._id || row.brandId;
    const companyId = String(directId || row.brandId?.companyId?._id || row.brandId?.companyId ||
      companyIdsByBrand.get(String(brandRef || "")) ||
      companyIdsByName.get(String(row.companyName || "").trim().toLowerCase()) || "");
    const bottle = row.plainBottle || row.plainBottleName || row.bottleName;
    if (!companyId || !bottle) return null;
    const canonicalKey = `${companyId}::${normalizeBottleCanonical(bottle)}`;
    if (!canonicalBottleCache.has(canonicalKey)) {
      canonicalBottleCache.set(canonicalKey, resolveCanonicalPlainBottle(bottle, companyId));
    }
    const canonicalBottle = await canonicalBottleCache.get(canonicalKey);
    if (!canonicalBottle) return null;
    return {
      dateKey,
      companyId,
      canonicalBottle,
      key: `${dateKey}::${companyId}::${normalizeBottleCanonical(canonicalBottle)}`
    };
  };

  const identityMap = new WeakMap();
  const getIdentity = async (row, fallbackDate) => {
    if (identityMap.has(row)) return identityMap.get(row);
    const identity = await identityFor(row, fallbackDate);
    identityMap.set(row, identity);
    return identity;
  };
  const candidatePools = new Map();
  const addCandidate = async (row, fallbackDate, isDraft) => {
    if (!isDraft && row._id && excludedIds.has(String(row._id))) return;
    const identity = await getIdentity(row, fallbackDate);
    if (!identity) return;
    if (!candidatePools.has(identity.key)) candidatePools.set(identity.key, { identity, rows: [] });
    candidatePools.get(identity.key).rows.push(row);
  };

  await Promise.all(savedRows.map(({ row, dateKey }) => addCandidate(row, dateStarts.get(dateKey), false)));
  await Promise.all(draftRows.map(row => addCandidate(row, planDate, true)));

  const targetPoolKeys = new Set(
    (await Promise.all(targetRows.map(row => getIdentity(row, planDate))))
      .filter(Boolean)
      .map(identity => identity.key)
  );
  const warningByPool = new Map();
  await Promise.all(Array.from(candidatePools.entries()).map(async ([key, pool]) => {
    if (!targetPoolKeys.has(key)) return;
    const sourceIds = new Set();
    for (const row of pool.rows) {
      const ownerId = String(row.canonicalCompanyId?._id || row.canonicalCompanyId || row.companyId?._id || row.companyId ||
        row.brandId?.companyId?._id || row.brandId?.companyId ||
        companyIdsByBrand.get(String(row.brandId?._id || row.brandId || "")) ||
        companyIdsByName.get(String(row.companyName || "").trim().toLowerCase()) ||
        pool.identity.companyId);
      const configured = Array.isArray(row.stockSources) ? row.stockSources : [];
      const allocated = Array.isArray(row.stockAllocation) ? row.stockAllocation.map(item => item.companyId) : [];
      const ids = [...configured, ...allocated]
        .map(source => String(source?._id || source || ""))
        .filter(id => mongoose.Types.ObjectId.isValid(id));
      if (ids.length) ids.forEach(id => sourceIds.add(id));
      else if (mongoose.Types.ObjectId.isValid(ownerId)) sourceIds.add(ownerId);
    }

    const stock = await computeLivePlainStock(
      pool.identity.canonicalBottle,
      Array.from(sourceIds),
      dateStarts.get(pool.identity.dateKey)
    );
    const openingStock = stock && typeof stock === "object" && Number.isFinite(Number(stock.openingStock))
      ? Number(stock.openingStock)
      : null;
    const poolPlainStock = stock && typeof stock === "object" && Number.isFinite(Number(stock.plainStock))
      ? Number(stock.plainStock)
      : null;
    const poolOrderTotal = pool.rows.reduce((total, row) => total + (Number(row.orderQty) || 0), 0);
    const shortBy = openingStock === null ? 0 : Math.max(0, poolOrderTotal - openingStock);
    const stockWarning = openingStock !== null && poolOrderTotal > openingStock;
    const sourceStockBreakdown = (stock?.sources || []).map(source => ({
      companyId: String(source.companyId || ""),
      companyName: source.companyName || "Company",
      openingStock: Number(source.openingStock) || 0,
      plainStock: Number(source.available) || 0
    }));
    const sourceMessage = sourceStockBreakdown
      .map(source => `${source.companyName}: ${source.openingStock}`)
      .join(" · ");
    const warningMessage = stockWarning
      ? `Total order of this bottle: ${poolOrderTotal} · Opening stock: ${openingStock} · Short by: ${shortBy}${sourceMessage ? ` · Sources: ${sourceMessage}` : ""}`
      : "";
    warningByPool.set(key, {
      stockWarning,
      poolOrderTotal,
      openingStock,
      poolPlainStock,
      shortBy,
      warningMessage,
      sourceStockBreakdown
    });
  }));

  return Promise.all(targetRows.map(async (row, index) => {
    const identity = await getIdentity(row, planDate);
    const warning = identity ? warningByPool.get(identity.key) : null;
    const result = warning || {
      stockWarning: false,
      poolOrderTotal: 0,
      openingStock: null,
      poolPlainStock: null,
      shortBy: 0,
      warningMessage: "",
      sourceStockBreakdown: []
    };
    const warnedRow = {
      ...row,
      ...result,
      ...getReadyBoxFields(row),
      isYellow: result.stockWarning,
      stockWarningTooltip: result.warningMessage,
      groupStockWarning: result.stockWarning,
      groupStockWarningTooltip: result.warningMessage,
      poolOpeningStock: result.openingStock,
      poolTotalOrder: result.poolOrderTotal,
      ...(row.draftKey !== undefined ? {} : { warningRowIndex: index })
    };
    if (result.poolPlainStock !== null && result.poolPlainStock !== undefined) {
      warnedRow.plainStock = result.poolPlainStock;
      warnedRow.livePlainStock = result.poolPlainStock;
      warnedRow.availableStock = result.poolPlainStock;
    }
    return warnedRow;
  }));
};

/**
 * Validates that the sum of Coating Completed Qty of all rows in the submission
 * for each pool (company + plain bottle) does not exceed available plain bottle stock.
 */
const validateCoatedQtyLimit = async (items, excludePlanIds = null) => {
  const pools = new Map();

  for (const item of items) {
    if (!item) continue;
    const compId = (item.canonicalCompanyId || (item.companyId?._id || item.companyId) || '').toString();
    const rawBottle = (item.plainBottle || item.plainBottleName || item.bottleName || '').trim();
    if (!compId || !rawBottle) continue;

    const canonicalBottle = await resolveCanonicalPlainBottle(rawBottle, compId);
    const coated = getCoatedQty(item);
    const dateStr = item.planDate ? new Date(item.planDate).toISOString().split('T')[0] : '';
    const poolKey = `${compId}::${canonicalBottle}::${dateStr}`;

    if (!pools.has(poolKey)) {
      let rawSources = (item.stockSources || []).map(s => s ? (s._id || s).toString() : null).filter(Boolean);
      if (rawSources.length === 0) rawSources = [compId];
      pools.set(poolKey, {
        companyId: compId,
        bottleName: canonicalBottle,
        planDate: item.planDate,
        stockSources: rawSources,
        totalCoated: 0
      });
    }
    pools.get(poolKey).totalCoated += coated;
  }

  for (const [key, pool] of pools.entries()) {
    if (pool.totalCoated > 0) {
      const stock = await computeLivePlainStock(pool.bottleName, pool.stockSources || pool.companyId, pool.planDate, excludePlanIds);
      const available = stock.available !== undefined ? stock.available : (stock.plainStock !== undefined ? stock.plainStock : stock);
      if (pool.totalCoated > available) {
        const breakdownParts = (stock.sources || []).map(s => `${s.companyName}: ${s.available}`);
        const breakdownText = breakdownParts.length > 0 ? `<${breakdownParts.join(', ')}>` : '';
        return {
          exceeded: true,
          available,
          totalCoated: pool.totalCoated,
          plainBottle: pool.bottleName,
          message: breakdownText
            ? `Only ${available} bottles available from the selected stock (${breakdownText})`
            : `Only ${available} bottles available for ${pool.bottleName} (this entry adds up to ${pool.totalCoated}).`
        };
      }
    }
  }

  return null;
};

const assignGroupsAndSequences = async (items) => {
  const groupSeqMap = new Map();
  const promptJGroupMap = new Map();

  for (const item of items) {
    if (!item) continue;
    // 1. Legacy groupKey & rowSeq (for backward compatibility)
    const gKey = await computePlanGroupKey(item);
    item.groupKey = gKey;
    if (!groupSeqMap.has(gKey)) {
      const existingPlans = await LacquerPlan.find({ groupKey: gKey, isDeleted: false }).sort({ rowSeq: 1 });
      const maxSeq = existingPlans.length > 0 ? Math.max(...existingPlans.map(p => p.rowSeq || 0)) : 0;
      groupSeqMap.set(gKey, maxSeq);
    }
    const nextSeq = groupSeqMap.get(gKey) + 1;
    groupSeqMap.set(gKey, nextSeq);
    item.rowSeq = nextSeq;

    // 2. Prompt J groupId & rowOrder (same company, brand, and date joins existing group, next rowOrder)
    const dateStr = item.planDate ? new Date(item.planDate).toISOString().split('T')[0] : '';
    const compId = (item.canonicalCompanyId || (item.companyId?._id || item.companyId) || item.companyName || 'UNASSIGNED').toString().trim();
    const brandId = (item.brandId?._id || item.brandId || item.brandName || 'UNASSIGNED').toString().trim();
    const jKey = `${dateStr}__${compId}__${brandId}`;

    if (!promptJGroupMap.has(jKey)) {
      let existingGroupId = null;
      let maxOrder = 0;

      if (item.planDate && (item.companyId || item.companyName)) {
        const startOfDay = new Date(item.planDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(item.planDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const q = {
          isDeleted: false,
          planDate: { $gte: startOfDay, $lte: endOfDay }
        };
        if (item.companyId) {
          q.companyId = item.companyId;
        } else if (item.companyName) {
          q.companyName = item.companyName;
        }
        if (item.brandId) {
          q.brandId = item.brandId;
        } else if (item.brandName) {
          q.brandName = item.brandName;
        }

        const existingPromptJPlans = await LacquerPlan.find(q).sort({ rowOrder: 1, rowSeq: 1 }).lean();
        for (const p of existingPromptJPlans) {
          if (p.groupId && !existingGroupId) {
            existingGroupId = p.groupId;
          }
          const ord = Number(p.rowOrder ?? p.rowSeq ?? 0);
          if (ord > maxOrder) maxOrder = ord;
        }
      }

      const assignedGroupId = existingGroupId || `grp_${jKey}`;
      promptJGroupMap.set(jKey, { groupId: assignedGroupId, maxOrder });
    }

    const jTracker = promptJGroupMap.get(jKey);
    jTracker.maxOrder += 1;
    item.groupId = item.groupId || jTracker.groupId;
    item.rowOrder = jTracker.maxOrder;
  }
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Synchronizes remaining plain stock across ALL plans sharing the same canonical bottle
 * and company on a given planDate.
 */
// Date-isolated stock synchronization:
// Recomputes and updates stored plainStock snapshot ONLY for plans with planDate >= targetDate
// for the given canonical plain bottle and company pool.
// Older plans (planDate < startOfDay(targetDate)) are NEVER queried for update and NEVER modified.
async function syncSameDayPlansPlainStock(bottleName, companyId, planDate, userId = null) {
  try {
    if (!bottleName || !companyId || !planDate) return;

    const startOfDay = new Date(planDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const canonicalBottle = await resolveCanonicalPlainBottle(bottleName, companyId);
    if (!canonicalBottle) return;

    const nameTrimmed = String(canonicalBottle).trim();
    const bp = await BottlePerBox.findOne({
      $or: [
        { bottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { plainBottleName: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } },
        { bottleNames: { $regex: new RegExp("^" + escapeRegex(nameTrimmed) + "$", "i") } }
      ],
      isDeleted: false
    });

    const names = Array.from(new Set([
      nameTrimmed,
      String(bottleName).trim(),
      bp?.bottleName,
      bp?.plainBottleName,
      ...(bp?.bottleNames || [])
    ].filter(Boolean).map(n => String(n).trim())));

    const bottleRegexes = names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i"));
    const bottleMatchCondition = {
      $or: [
        { bottleName: { $in: bottleRegexes } },
        { plainBottle: { $in: bottleRegexes } }
      ]
    };

    let compCondition = { companyId: companyId };
    const cidStr = (companyId._id || companyId).toString();
    if (mongoose.Types.ObjectId.isValid(cidStr)) {
      compCondition = {
        $or: [
          { companyId: new mongoose.Types.ObjectId(cidStr) },
          { canonicalCompanyId: new mongoose.Types.ObjectId(cidStr) }
        ]
      };
    }

    // Find all distinct planDates >= startOfDay for this pool (date-isolated: older plans never queried)
    const affectedPlans = await LacquerPlan.find({
      planDate: { $gte: startOfDay },
      ...compCondition,
      ...bottleMatchCondition,
      isDeleted: false
    }).select('planDate').lean();

    const distinctDates = Array.from(new Set(affectedPlans.map(p => {
      const d = new Date(p.planDate);
      return d.toISOString().split('T')[0];
    })));

    for (const dStr of distinctDates) {
      const dDate = new Date(dStr);
      const dStart = new Date(dDate);
      dStart.setUTCHours(0, 0, 0, 0);
      const dEnd = new Date(dDate);
      dEnd.setUTCHours(23, 59, 59, 999);

      const stockRes = await computeLivePlainStock(canonicalBottle, companyId, dDate);
      const remainingPlainStock = stockRes.plainStock !== undefined ? stockRes.plainStock : Number(stockRes);

      await LacquerPlan.updateMany(
        {
          planDate: { $gte: dStart, $lte: dEnd },
          ...compCondition,
          ...bottleMatchCondition,
          isDeleted: false
        },
        { $set: { plainStock: remainingPlainStock } }
      );
    }

    // Also recompute overall live plain bottle stock document
    await recomputePlainStock(canonicalBottle, companyId, userId);
  } catch (err) {
    console.error("Error in syncSameDayPlansPlainStock:", err);
  }
}

// Create Plan
exports.createPlan = async (req, res) => {
  try {
    const submissionItems = Array.isArray(req.body) ? req.body : [req.body];

    // Validate stock allocation and source eligibility first
    for (const item of submissionItems) {
      const c = item.coatingCompletedQty !== undefined ? Number(item.coatingCompletedQty) : (Number(item.coatedQty) || 0);
      item.coatingCompletedQty = c;
      item.coatedQty = c;
      const allocRes = await validateStockAllocation(
        item.planDate,
        item.bottleName,
        item.companyId,
        item.stockSources,
        c,
        item.stockAllocation,
        null
      );
      item.stockSources = allocRes.stockSources;
      item.stockAllocation = allocRes.stockAllocation;
      if (c > 0) {
        item.stockAllocationInitial = allocRes.stockAllocation;
        item.coatedQtyInitial = c;
      }
    }

    const coatedLimitError = await validateCoatedQtyLimit(submissionItems, null);
    if (coatedLimitError) {
      return res.status(400).json({
        success: false,
        message: coatedLimitError.message,
        available: coatedLimitError.available,
        totalCoated: coatedLimitError.totalCoated
      });
    }

    // Assign groupKey and sequential rowSeq per group
    await assignGroupsAndSequences(submissionItems);

    if (Array.isArray(req.body)) {
      const comboSet = new Set();

      for (const item of req.body) {
        await validatePlanCompanyBottleVariant(item, false);

        // Stock warning validation for array input
        if (item.orderQty && item.bottleName && item.companyId) {
          const warning = await validateRowStockWarning(
            item.bottleName,
            item.companyId,
            item.orderQty,
            null
          );

          // If warning is triggered, record details but never block saving
          if (warning.hasWarning) {
            item.stockWarningAcknowledged = true;
            item.acknowledgedAt = new Date();
            item.stockWarningDetails = warning;
          }
        }

        if (item.planDate && item.companyId && item.bottleName) {
          const varPart = item.variantId ? item.variantId.toString() : (item.colour || item.coatingShade || 'none').trim().toLowerCase();
          const brandPart = item.brandId ? item.brandId.toString() : '';
          const comboKey = `${item.planDate}-${item.companyId.toString()}-${brandPart}-${item.bottleName.trim().toLowerCase()}-${varPart}`;
          if (comboSet.has(comboKey)) {
            throw new Error(`Duplicate entry found in submission for Bottle: ${item.bottleName}`);
          }
          comboSet.add(comboKey);

          // Check DB for duplicates
          const startOfDay = new Date(item.planDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(item.planDate);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const dupQuery = {
            planDate: { $gte: startOfDay, $lte: endOfDay },
            companyId: item.companyId,
            bottleName: { $regex: new RegExp("^" + item.bottleName.trim() + "$", "i") },
            isDeleted: false
          };
          if (item.brandId) dupQuery.brandId = item.brandId;
          if (item.variantId) {
            dupQuery.variantId = item.variantId;
          } else {
            dupQuery.variantId = { $in: [null, undefined] };
            const shade = item.colour || item.coatingShade;
            if (shade) {
              dupQuery.$or = [{ colour: shade }, { coatingShade: shade }];
            }
          }

          const existing = await LacquerPlan.findOne(dupQuery).populate('variantId', 'variantName');
          if (existing) {
            const vName = existing.variantId?.variantName || (existing.variantId ? (await Variant.findById(existing.variantId))?.variantName : '') || item.variantName;
            const shade = item.colour || item.coatingShade || existing.colour || existing.coatingShade;
            const detail = vName ? `with variant "${vName}"` : (shade ? `with shade "${shade}"` : 'with this variant');
            throw new Error(`A plan for Bottle "${item.bottleName}" ${detail} already exists for this date, company and brand.`);
          }
        }
      }
      for (const item of req.body) {
        const c = item.coatingCompletedQty !== undefined ? Number(item.coatingCompletedQty) : (Number(item.coatedQty) || 0);
        const o = Number(item.orderQty) || 0;
        item.balanceToMake = Number(c) - Number(o);
        item.status = (Number(o) > 0 && Number(c) >= Number(o));
      }
      let plans;
      const printingSyncResults = [];
      if (req.body.some(isPrintingSyncProcess)) {
        const lacquerDocs = req.body.map(item => new LacquerPlan(item));
        await withLacquerPrintingCompensation(lacquerDocs, async session => {
          plans = await LacquerPlan.insertMany(
            lacquerDocs,
            session ? { session } : undefined
          );
          for (const plan of plans) {
            printingSyncResults.push(await createPrintingPlanIfApplicable(plan, req.user?._id, { session }));
          }
        });
      } else {
        plans = await LacquerPlan.insertMany(req.body);
      }
      for (const plan of plans) {
        await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);

        await replayStockAllocations(
          plan.bottleName,
          plan.planDate,
          [plan.companyId, ...(plan.stockSources || [])],
          req.user?._id
        );
      }

      // Sync live remaining plain stock across all plans on this day
      const uniqueSyncKeys = new Map();
      for (const plan of plans) {
        const pBottle = (plan.plainBottle || plan.bottleName || '').trim();
        const pComp = plan.canonicalCompanyId || plan.companyId;
        if (pBottle && pComp && plan.planDate) {
          const k = `${pComp.toString()}::${pBottle}::${new Date(plan.planDate).toISOString().split('T')[0]}`;
          if (!uniqueSyncKeys.has(k)) {
            uniqueSyncKeys.set(k, { bottleName: pBottle, companyId: pComp, planDate: plan.planDate });
          }
        }
      }

      for (const { bottleName, companyId, planDate } of uniqueSyncKeys.values()) {
        await syncSameDayPlansPlainStock(bottleName, companyId, planDate, req.user?._id);
      }

      return res.status(201).json({
        success: true,
        data: plans,
        printingSync: printingSyncResults
          .filter(Boolean)
          .filter(result => result.leftUnlinkedCandidateCount > 0)
          .map(result => ({
            adoptedPrintingPlanId: result.plan._id,
            leftUnlinkedCandidateCount: result.leftUnlinkedCandidateCount
          }))
      });
    } else {
      await validatePlanCompanyBottleVariant(req.body, false);

      // Stock warning validation for single item
      if (req.body.orderQty && req.body.bottleName && req.body.companyId) {
        const warning = await validateRowStockWarning(
          req.body.bottleName,
          req.body.companyId,
          req.body.orderQty,
          null
        );

        // If warning is triggered, record details but never block saving
        if (warning.hasWarning) {
          req.body.stockWarningAcknowledged = true;
          req.body.acknowledgedAt = new Date();
          req.body.stockWarningDetails = warning;
        }
      }

      if (req.body.planDate && req.body.companyId && req.body.bottleName) {
        const startOfDay = new Date(req.body.planDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(req.body.planDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const dupQuery = {
          planDate: { $gte: startOfDay, $lte: endOfDay },
          companyId: req.body.companyId,
          bottleName: { $regex: new RegExp("^" + req.body.bottleName.trim() + "$", "i") },
          isDeleted: false
        };
        if (req.body.brandId) dupQuery.brandId = req.body.brandId;
        if (req.body.variantId) {
          dupQuery.variantId = req.body.variantId;
        } else {
          dupQuery.variantId = { $in: [null, undefined] };
          const shade = req.body.colour || req.body.coatingShade;
          if (shade) {
            dupQuery.$or = [{ colour: shade }, { coatingShade: shade }];
          }
        }

        const existing = await LacquerPlan.findOne(dupQuery).populate('variantId', 'variantName');
        if (existing) {
          const vName = existing.variantId?.variantName || (existing.variantId ? (await Variant.findById(existing.variantId))?.variantName : '') || req.body.variantName;
          const shade = req.body.colour || req.body.coatingShade || existing.colour || existing.coatingShade;
          const detail = vName ? `with variant "${vName}"` : (shade ? `with shade "${shade}"` : 'with this variant');
          throw new Error(`A plan for Bottle "${req.body.bottleName}" ${detail} already exists for this date, company and brand.`);
        }
      }

      const c = req.body.coatingCompletedQty !== undefined ? Number(req.body.coatingCompletedQty) : (Number(req.body.coatedQty) || 0);
      const o = Number(req.body.orderQty) || 0;
      req.body.balanceToMake = Number(c) - Number(o);
      req.body.status = (Number(o) > 0 && Number(c) >= Number(o));

      const plan = new LacquerPlan(req.body);
      const printingSyncResult = await savePlanWithPrintingSync(plan, req.user?._id);
      await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);

      // Auto-send to Ready To Dispatch if completed process C row
      const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');
      await syncLacquerPlanReadyToDispatch(plan._id);


      await replayStockAllocations(
        plan.bottleName,
        plan.planDate,
        [plan.companyId, ...(plan.stockSources || [])],
        req.user?._id
      );

      const pBottle = (plan.plainBottle || plan.bottleName || '').trim();
      const pComp = plan.canonicalCompanyId || plan.companyId;
      if (pBottle && pComp && plan.planDate) {
        await syncSameDayPlansPlainStock(pBottle, pComp, plan.planDate, req.user?._id);
      }

      const freshPlan = await LacquerPlan.findById(plan._id);
      return res.status(201).json({
        success: true,
        data: freshPlan,
        printingSync: printingSyncResult?.leftUnlinkedCandidateCount > 0
          ? {
            adoptedPrintingPlanId: printingSyncResult.plan._id,
            leftUnlinkedCandidateCount: printingSyncResult.leftUnlinkedCandidateCount
          }
          : undefined
      });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


function extractBottleSizeForGrouping(bottleName) {
  if (!bottleName) return Infinity;
  const match = String(bottleName).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : Infinity;
}

function compareBottleNamesForGrouping(aName, bName) {
  const sizeA = extractBottleSizeForGrouping(aName);
  const sizeB = extractBottleSizeForGrouping(bName);
  if (sizeA !== sizeB) return sizeA - sizeB;
  return String(aName || '').localeCompare(String(bName || ''));
}

function compareBrandsForGrouping(aBrand, bBrand) {
  if (!aBrand && !bBrand) return 0;
  if (!aBrand) return 1;
  if (!bBrand) return -1;
  return String(aBrand).localeCompare(String(bBrand));
}

function compareVariantsForGrouping(aVariant, bVariant) {
  if (!aVariant && !bVariant) return 0;
  if (!aVariant) return 1;
  if (!bVariant) return -1;
  return String(aVariant).localeCompare(String(bVariant));
}


/**
 * Computes readyActions for Process C rows.
 * Frontend only renders what the server returns; no eligibility logic in frontend.
 */
function computeReadyActions(plan) {
  const isProcessC = String(plan.process || '').trim().toUpperCase() === 'C';
  if (!isProcessC || plan.isSoftRemoved || plan.isArchived || plan.isSibling) {
    return {
      visible: false,
      enabled: false,
      isProcessC,
      coatedQty: 0,
      sentQty: 0,
      sendableQty: 0,
      orderQty: 0,
      remainingQty: 0,
      options: []
    };
  }

  const coated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
  const sentQty = Number(plan.sentToReadyQty || 0);
  const sendable = Math.max(0, coated - sentQty);
  const order = Number(plan.orderQty || 0);
  const remaining = Math.max(0, order - coated);
  const isClosed = Boolean(plan.isClosed || plan.productionStatus === 'CLOSED' || plan.isSoftRemoved);

  if (isClosed) {
    return {
      visible: false,
      enabled: false,
      isProcessC: true,
      isClosed: true,
      coatedQty: coated,
      sentQty,
      sendableQty: 0,
      orderQty: order,
      remainingQty: 0,
      options: []
    };
  }

  const options = [];
  if (sendable > 0) {
    if (remaining > 0) {
      options.push({
        key: 'CLOSE_ENTIRE_ORDER',
        title: 'Option A: Close Entire Order & Dispatch',
        description: `Send ${sendable} to Ready To Dispatch and close the order. This row will be removed from the list, and remaining ${remaining} will be cancelled.`
      });
      options.push({
        key: 'SPLIT_REMAINING_ORDER',
        title: 'Option B: Dispatch Completed & Keep Remaining',
        description: `Send ${sendable} to Ready To Dispatch. This row stays with Order Qty ${remaining} and Coating Completed 0.`
      });
    } else {
      options.push({
        key: 'CLOSE_ENTIRE_ORDER',
        title: 'Dispatch Completed Quantity',
        description: `Send ${sendable} to Ready To Dispatch and mark order completed.`
      });
    }
  }

  return {
    visible: true,
    enabled: true,
    isProcessC: true,
    isClosed: false,
    coatedQty: coated,
    sentQty,
    sendableQty: sendable,
    isFullySent: coated > 0 && sentQty >= coated,
    orderQty: order,
    remainingQty: remaining,
    options
  };
}
exports.computeReadyActions = computeReadyActions;

exports.previewPlanLayout = async (req, res) => {
  try {
    const { planDate, rows, excludePlanIds = [] } = req.body || {};
    if (!planDate || !Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        message: "planDate and rows are required."
      });
    }

    const draftRows = rows.map((row, index) => ({
      ...row,
      planDate: row.planDate || planDate,
      draftKey: row.draftKey !== undefined ? row.draftKey : String(index)
    }));
    const warnedRows = await calculatePoolStockWarnings(draftRows, {
      planDate,
      draftRows,
      excludePlanIds
    });

    return res.status(200).json({ success: true, data: { rows: warnedRows } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Get Plans
exports.getPlans = async (req, res) => {
  try {
    const { date, month, fromDate, toDate, search, companyId, brandId, page, limit, pagination = "false", bottleName } = req.query;
    let query = { isDeleted: false, isArchived: { $ne: true }, isSoftRemoved: { $ne: true }, isSibling: { $ne: true } };

    if (brandId) {
      query.brandId = new mongoose.Types.ObjectId(brandId);
    }

    // Add bottleName filter to initial query
    if (bottleName) {
      query.bottleName = bottleName;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.planDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (fromDate || toDate) {
      query.planDate = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setUTCHours(0, 0, 0, 0);
        query.planDate.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setUTCHours(23, 59, 59, 999);
        query.planDate.$lte = end;
      }
    } else if (month) {
      const [year, m] = month.split('-');
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1));
      const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      query.planDate = { $gte: startOfMonth, $lte: endOfMonth };
    }

    if (search) {
      // We handle search after lookups below, so don't add to initial query
    }

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'variants',
          localField: 'variantId',
          foreignField: '_id',
          as: 'variantId'
        }
      },
      { $unwind: { path: '$variantId', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brandId'
        }
      },
      { $unwind: { path: '$brandId', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'directCompany'
        }
      },
      { $unwind: { path: '$directCompany', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          localField: 'brandId.companyId',
          foreignField: '_id',
          as: 'brandCompany'
        }
      },
      { $unwind: { path: '$brandCompany', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          let: { cName: '$companyName' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$isDeleted", true] },
                    { $ne: [{ $type: "$$cName" }, "missing"] },
                    { $ne: ["$$cName", null] },
                    { $eq: [{ $toLower: { $trim: { input: "$name" } } }, { $toLower: { $trim: { input: "$$cName" } } }] }
                  ]
                }
              }
            }
          ],
          as: 'nameCompany'
        }
      },
      { $unwind: { path: '$nameCompany', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          company: { $ifNull: ['$directCompany', { $ifNull: ['$nameCompany', '$brandCompany'] }] },
        }
      },
      {
        $addFields: {
          companyId: '$company._id',
          companyName: { $ifNull: ['$company.name', { $ifNull: ['$companyName', 'Unassigned'] }] },
          canonicalCompanyId: '$company._id'
        }
      },
      {
        $sort: {
          'company.name': 1,
          'bottleName': 1,
          'brandId.name': 1
        }
      }
    ];

    if (search || companyId) {
      const matchStage = {};

      if (search) {
        matchStage.$or = [
          { bottleName: { $regex: search, $options: 'i' } },
          { brandName: { $regex: search, $options: 'i' } },
          { 'brandId.name': { $regex: search, $options: 'i' } }
        ];
      }

      if (companyId) {
        if (companyId === 'UNASSIGNED') {
          matchStage['company._id'] = { $exists: false }; // Match where company lookup failed
        } else {
          matchStage['company._id'] = new mongoose.Types.ObjectId(companyId);
        }
      }

      pipeline.push({ $match: matchStage });
    }

    const plans = await LacquerPlan.aggregate(pipeline).collation({ locale: 'en', strength: 2 });

    const allCompaniesList = await Company.find({ isDeleted: { $ne: true } }).select('_id name isStockSupplier').lean();
    const companyNameMap = new Map(allCompaniesList.map(c => [c._id.toString(), c.name]));
    const supplierIdSet = new Set(allCompaniesList.filter(c => c.isStockSupplier).map(c => c._id.toString()));

    // Augment plans with computed fields using live day-based stock (Rule L3)
    const stockCache = new Map();
    const augmentedPlans = await Promise.all(plans.map(async (plan) => {
      let plainStock = 0;
      let coatedQty = 0;

      let openingStock = 0;

      // 1. Fetch live day-based plain stock (Rule L3)
      if (plan.bottleName) {
        const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId);
        const compId = (rawCompId && rawCompId.toString) ? rawCompId.toString() : (rawCompId || '');
        const dayStr = plan.planDate ? new Date(plan.planDate).toISOString().split('T')[0] : '';
        const canonicalBottle = await resolveCanonicalPlainBottle(plan.plainBottle || plan.bottleName, compId);
        const cacheKey = `${compId}::${canonicalBottle}::${dayStr}`;
        if (stockCache.has(cacheKey)) {
          const cached = stockCache.get(cacheKey);
          plainStock = cached.plainStock;
          openingStock = cached.openingStock;
        } else {
          const stock = await computeLivePlainStock(canonicalBottle, compId, plan.planDate);
          const rawPlain = stock && stock.plainStock !== undefined ? stock.plainStock : stock;
          const rawOpening = stock && stock.openingStock !== undefined ? stock.openingStock : rawPlain;
          plainStock = Number.isFinite(Number(rawPlain)) ? Number(rawPlain) : 0;
          openingStock = Number.isFinite(Number(rawOpening)) ? Number(rawOpening) : 0;
          stockCache.set(cacheKey, { plainStock, openingStock });
        }
      }

      // 2. Fetch cumulative coatedQty
      if (plan.bottleName && plan.brandId) {
        const BottleSpec = require("../models/Bottlespecs");
        const bSpec = await BottleSpec.findOne({ bottleName: plan.bottleName, isDeleted: false });

        if (bSpec) {
          const coatingRecords = await CoatingProduction.find({
            coatingSpecId: bSpec._id,
            brandId: plan.brandId._id,
            coatingShade: plan.colour,
            isDeleted: false
          });

          coatedQty = coatingRecords.reduce((sum, rec) => sum + (rec.actualQuantity || 0), 0);
        }
      }

      const balanceToMake = coatedQty - (plan.orderQty || 0);

      // Extract plain bottle name from BottleSpec if not already set
      let plainBottleName = plan.plainBottle || plan.bottleName || '';
      if (plan.bottleName && !plan.plainBottle) {
        const BottleSpec = require("../models/Bottlespecs");
        const bspec = await BottleSpec.findOne({
          bottleName: { $regex: new RegExp("^" + plan.bottleName.trim() + "$", "i") },
          isDeleted: false
        }).select('bottleName').lean();
        if (bspec) {
          plainBottleName = bspec.bottleName;
        }
      }

      return {
        ...plan,
        groupKey: plan.groupKey,
        rowSeq: plan.rowSeq || 1,
        plainBottleName,
        availableStock: plainStock,
        livePlainStock: plainStock,
        liveCoatedQty: coatedQty,
        liveBalanceToMake: balanceToMake,
        plainStock: plainStock,  // ALWAYS use live stock for list display, NOT stored snapshot
        openingStock: openingStock,
        coatedQty: plan.coatedQty !== null && plan.coatedQty !== undefined ? plan.coatedQty : coatedQty,
        balanceToMake: balanceToMake,
        status: ((plan.orderQty || 0) > 0 && coatedQty >= (plan.orderQty || 0)),
        usedFrom: (() => {
          if (!Array.isArray(plan.stockAllocation) || plan.stockAllocation.length === 0) return [];
          const hasSupplier = plan.stockAllocation.some(a => supplierIdSet.has((a.companyId?._id || a.companyId)?.toString()) && Number(a.qty) > 0);
          if (!hasSupplier) return [];
          return plan.stockAllocation
            .filter(a => Number(a.qty) > 0)
            .map(a => {
              const cIdStr = (a.companyId?._id || a.companyId)?.toString();
              return {
                companyId: cIdStr,
                companyName: companyNameMap.get(cIdStr) || 'Company',
                qty: Number(a.qty)
              };
            });
        })(),
        usedFromTooltip: (() => {
          if (!Array.isArray(plan.stockAllocation) || plan.stockAllocation.length === 0) return '';
          const hasSupplier = plan.stockAllocation.some(a => supplierIdSet.has((a.companyId?._id || a.companyId)?.toString()) && Number(a.qty) > 0);
          if (!hasSupplier) return '';
          return plan.stockAllocation
            .filter(a => Number(a.qty) > 0)
            .map(a => `${companyNameMap.get((a.companyId?._id || a.companyId)?.toString()) || 'Company'}: ${a.qty}`)
            .join(', ');
        })()
      };
    }));

    // Sort augmented plans with canonical plain bottle resolution
    for (const plan of augmentedPlans) {
      const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId);
      const compIdStr = (rawCompId && rawCompId.toString) ? rawCompId.toString() : (rawCompId || '');
      const canonicalBottle = await resolveCanonicalPlainBottle(plan.plainBottle || plan.plainBottleName || plan.bottleName, compIdStr);
      plan.canonicalBottle = canonicalBottle;
      plan.canonicalBottleNormalized = normalizeBottleCanonical(canonicalBottle);
      plan.plainBottle = canonicalBottle;
      plan.plainBottleName = canonicalBottle;
    }

    const plansWithWarnings = await calculatePoolStockWarnings(augmentedPlans);

    // Apply search filter on augmented plans AFTER aggregation
    let filteredPlans = plansWithWarnings;
    if (search) {
      filteredPlans = plansWithWarnings.filter(plan => {
        const searchLower = search.toLowerCase();
        return (
          (plan.bottleName && plan.bottleName.toLowerCase().includes(searchLower)) ||
          (plan.brandName && plan.brandName.toLowerCase().includes(searchLower)) ||
          (plan.companyName && plan.companyName.toLowerCase().includes(searchLower)) ||
          (plan.variantName && plan.variantName.toLowerCase().includes(searchLower)) ||
          (plan.colour && plan.colour.toLowerCase().includes(searchLower))
        );
      });
    }

    // Sort augmented plans strictly according to:
    // company, canonical plain bottle (normalized), brand, process, import group and index, rowOrder, then variant.
    // NOTE: NEVER sort by orderQty!
    filteredPlans.sort((a, b) => {
      // 1. Company
      const compA = String(a.company?.name || a.companyName || '').trim();
      const compB = String(b.company?.name || b.companyName || '').trim();
      const compCmp = compA.localeCompare(compB, undefined, { numeric: true, sensitivity: 'base' });
      if (compCmp !== 0) return compCmp;

      // 2. Canonical Plain Bottle (normalized, natural numeric size then alpha)
      const bottleA = a.canonicalBottleNormalized || '';
      const bottleB = b.canonicalBottleNormalized || '';
      const bottleCmp = compareBottleNamesForGrouping(bottleA, bottleB);
      if (bottleCmp !== 0) return bottleCmp;

      // 3. Process
      const procA = String(a.process || '').trim().toUpperCase();
      const procB = String(b.process || '').trim().toUpperCase();
      if (procA !== procB) return procA.localeCompare(procB);

      // 4. Brand
      const brandA = a.brandId?.name || a.brandName || '';
      const brandB = b.brandId?.name || b.brandName || '';
      const brandCmp = compareBrandsForGrouping(brandA, brandB);
      if (brandCmp !== 0) return brandCmp;

      // 5. Import Group and Index
      const grpA = String(a.importGroupId || a.groupId || '');
      const grpB = String(b.importGroupId || b.groupId || '');
      if (grpA && grpB) {
        if (grpA === grpB) {
          const idxA = a.importGroupIndex !== null && a.importGroupIndex !== undefined ? Number(a.importGroupIndex) : null;
          const idxB = b.importGroupIndex !== null && b.importGroupIndex !== undefined ? Number(b.importGroupIndex) : null;
          if (idxA !== null && idxB !== null && idxA !== idxB) {
            return idxA - idxB;
          }
        } else {
          const gCmp = grpA.localeCompare(grpB);
          if (gCmp !== 0) return gCmp;
        }
      } else if (grpA !== grpB) {
        return grpA ? -1 : 1;
      }

      // 6. Row Order (saved row sequence)
      const ordA = a.rowOrder !== undefined && a.rowOrder !== null ? Number(a.rowOrder) : (a.rowSeq !== undefined && a.rowSeq !== null ? Number(a.rowSeq) : 0);
      const ordB = b.rowOrder !== undefined && b.rowOrder !== null ? Number(b.rowOrder) : (b.rowSeq !== undefined && b.rowSeq !== null ? Number(b.rowSeq) : 0);
      if (ordA !== ordB) return ordA - ordB;

      // 7. Variant
      const varA = a.variantId?.variantName || a.variantName || '';
      const varB = b.variantId?.variantName || b.variantName || '';
      const varCmp = compareVariantsForGrouping(varA, varB);
      if (varCmp !== 0) return varCmp;

      // 8. Deterministic tiebreak
      return String(a._id || '').localeCompare(String(b._id || ''));
    });

    // Partition sorted rows into contiguous Pool Blocks sharing (company, canonical bottle, planDate)
    const poolBlocks = [];
    let currentBlock = [];
    let currentBlockKey = null;

    for (const plan of filteredPlans) {
      const dateStr = plan.planDate ? new Date(plan.planDate).toISOString().split('T')[0] : '';
      const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId) || plan.companyName || 'UNASSIGNED';
      const compIdStr = String(rawCompId).trim();
      const bKey = `${dateStr}__${compIdStr}__${plan.canonicalBottleNormalized}`;

      if (bKey !== currentBlockKey) {
        if (currentBlock.length > 0) {
          poolBlocks.push(currentBlock);
        }
        currentBlock = [plan];
        currentBlockKey = bKey;
      } else {
        currentBlock.push(plan);
      }
    }
    if (currentBlock.length > 0) {
      poolBlocks.push(currentBlock);
    }

    // Compute pool block fields and sub-block spans
    for (const block of poolBlocks) {
      const blockSize = block.length;
      const blockKey = `${block[0].planDate ? new Date(block[0].planDate).toISOString().split('T')[0] : ''}__${String(block[0].canonicalCompanyId || (block[0].companyId?._id || block[0].companyId) || block[0].companyName || 'UNASSIGNED').trim()}__${block[0].canonicalBottleNormalized}`;

      // Process spans: merge across all consecutive rows with same process (across brands)
      let procRunStart = 0;
      while (procRunStart < blockSize) {
        const proc = String(block[procRunStart].process || '').trim().toUpperCase();
        let procRunEnd = procRunStart + 1;
        while (procRunEnd < blockSize) {
          const nextProc = String(block[procRunEnd].process || '').trim().toUpperCase();
          if (nextProc === proc) {
            procRunEnd++;
          } else {
            break;
          }
        }
        const procSpan = procRunEnd - procRunStart;

        // Brand per row (not grouped): each row shows its brand individually
        for (let bIdx = procRunStart; bIdx < procRunEnd; bIdx++) {
          block[bIdx].brandSpan = 1;
          block[bIdx].isFirstInBrand = true;
        }

        for (let pIdx = procRunStart; pIdx < procRunEnd; pIdx++) {
          block[pIdx].processSpan = (pIdx === procRunStart) ? procSpan : 0;
          block[pIdx].isFirstInProcess = (pIdx === procRunStart);
        }

        procRunStart = procRunEnd;
      }

      // Assign block metadata; warning values come from the complete database pool.
      for (let i = 0; i < blockSize; i++) {
        const row = block[i];
        row.blockKey = blockKey;
        row.blockSize = blockSize;
        row.blockIndex = i;
        row.isFirstInBlock = (i === 0);
        row.bottleSpan = (i === 0) ? blockSize : 0;
        row.stockSpan = (i === 0) ? blockSize : 0;
        row.boxSpan = (i === 0) ? blockSize : 0;
        row.groupId = row.groupId || null;
        row.rowOrder = row.rowOrder !== undefined ? row.rowOrder : (row.rowSeq || 1);

      }
    }

    // Handle pagination (never split a block across page boundaries!)
    const total = filteredPlans.length;
    const enablePagination = pagination === "true";

    if (!enablePagination) {
      return res.status(200).json({ success: true, data: filteredPlans.map(p => ({ ...p, readyActions: computeReadyActions(p) })), total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;

    // Pack full blocks into pages so that no block is ever split across page boundaries
    const pages = [];
    let currentPage = [];
    let currentPageRowCount = 0;

    for (const block of poolBlocks) {
      if (currentPageRowCount > 0 && (currentPageRowCount + block.length > parsedLimit)) {
        pages.push(currentPage);
        currentPage = [];
        currentPageRowCount = 0;
      }
      currentPage.push(...block);
      currentPageRowCount += block.length;
    }
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    const totalPages = Math.max(1, pages.length);
    const paginatedPlans = pages[parsedPage - 1] || [];

    res.status(200).json({
      success: true,
      data: paginatedPlans.map(p => ({ ...p, readyActions: computeReadyActions(p) })),
      total,
      page: parsedPage,
      totalPages,
      limit: parsedLimit
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


/**
 * GET /api/lacquer-plan/totals
 * Aggregate totals and counts for all records matching current filters
 * Query params: date, fromDate, toDate, companyId, brandId, search
 * Returns: { totalCount, totalOrderQty, totalCoatingCompletedQty, totalBalanceToMake, totalSoldQty, totalDispatchPendingQty }
 * Cached for 30 seconds per filter combination.
 */
exports.getPlansTotals = async (req, res) => {
  try {
    const { date, fromDate, toDate, companyId, brandId, search } = req.query;

    const cacheKey = JSON.stringify({ date, fromDate, toDate, companyId, brandId, search });
    const cached = lacquerTotalsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < LACQUER_TOTALS_CACHE_TTL)) {
      return res.status(200).json({ success: true, data: cached.data });
    }

    let query = { isDeleted: false, isArchived: { $ne: true }, isSoftRemoved: { $ne: true }, isSibling: { $ne: true } };

    if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
      query.brandId = new mongoose.Types.ObjectId(brandId);
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.planDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (fromDate || toDate) {
      query.planDate = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setUTCHours(0, 0, 0, 0);
        query.planDate.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setUTCHours(23, 59, 59, 999);
        query.planDate.$lte = end;
      }
    }

    if (companyId) {
      if (companyId === 'UNASSIGNED') {
        query.companyId = { $in: [null, undefined] };
      } else if (mongoose.Types.ObjectId.isValid(companyId)) {
        const cOid = new mongoose.Types.ObjectId(companyId);
        const companyBrands = await Brand.find({ companyId: cOid, isDeleted: false }).select('_id').lean();
        const brandIds = companyBrands.map(b => b._id);
        query.$or = [
          { companyId: cOid },
          { brandId: { $in: brandIds } }
        ];
      }
    }

    if (search) {
      const sRegex = { $regex: search, $options: 'i' };
      query.$or = query.$or || [];
      query.$or.push(
        { bottleName: sRegex },
        { plainBottle: sRegex },
        { colour: sRegex },
        { coatingShade: sRegex },
        { brandName: sRegex }
      );
    }

    const pipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalOrderQty: { $sum: { $ifNull: [{ $toInt: "$orderQty" }, 0] } },
          totalCoatingCompletedQty: { $sum: { $ifNull: [{ $toInt: "$coatingCompletedQty" }, { $ifNull: [{ $toInt: "$coatedQty" }, 0] }] } },
          totalSoldQty: { $sum: { $ifNull: [{ $toInt: "$soldQty" }, 0] } },
          totalDispatchPendingQty: { $sum: { $ifNull: [{ $toInt: "$dispatchPendingQty" }, 0] } }
        }
      }
    ];

    const results = await LacquerPlan.aggregate(pipeline).option({ maxTimeMS: 15000 });
    const agg = results.length > 0 ? results[0] : {
      totalCount: 0,
      totalOrderQty: 0,
      totalCoatingCompletedQty: 0,
      totalSoldQty: 0,
      totalDispatchPendingQty: 0
    };

    const totalsData = {
      totalCount: agg.totalCount,
      totalOrderQty: agg.totalOrderQty,
      totalCoatingCompletedQty: agg.totalCoatingCompletedQty,
      totalBalanceToMake: agg.totalCoatingCompletedQty - agg.totalOrderQty,
      totalSoldQty: agg.totalSoldQty,
      totalDispatchPendingQty: agg.totalDispatchPendingQty
    };

    lacquerTotalsCache.set(cacheKey, { timestamp: Date.now(), data: totalsData });

    res.status(200).json({ success: true, data: totalsData });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/lacquer-plan/paginated
 * Keyset cursor pagination with strict whole-block preservation.
 * Returns: { items: [], nextCursor: string|null, hasMore: boolean }
 */
exports.getPlansPaginated = async (req, res) => {
  try {
    const { limit: limitParam, cursor, date, fromDate, toDate, companyId, brandId, search } = req.query;
    const limit = parseLimit(limitParam, 20, 50);

    let query = { isDeleted: false, isArchived: { $ne: true }, isSoftRemoved: { $ne: true }, isSibling: { $ne: true } };
    if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
      query.brandId = new mongoose.Types.ObjectId(brandId);
    }
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      query.planDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (fromDate || toDate) {
      query.planDate = {};
      if (fromDate) {
        const start = new Date(fromDate);
        start.setUTCHours(0, 0, 0, 0);
        query.planDate.$gte = start;
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setUTCHours(23, 59, 59, 999);
        query.planDate.$lte = end;
      }
    }

    if (companyId) {
      if (companyId === 'UNASSIGNED') {
        // Will be filtered after lookup
      } else if (mongoose.Types.ObjectId.isValid(companyId)) {
        const cOid = new mongoose.Types.ObjectId(companyId);
        const companyBrands = await Brand.find({ companyId: cOid, isDeleted: false }).select('_id').lean();
        const brandIds = companyBrands.map(b => b._id);
        query.$or = [
          { companyId: cOid },
          { brandId: { $in: brandIds } }
        ];
      }
    }

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'variants',
          localField: 'variantId',
          foreignField: '_id',
          as: 'variantId'
        }
      },
      { $unwind: { path: '$variantId', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brandId'
        }
      },
      { $unwind: { path: '$brandId', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'directCompany'
        }
      },
      { $unwind: { path: '$directCompany', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          localField: 'brandId.companyId',
          foreignField: '_id',
          as: 'brandCompany'
        }
      },
      { $unwind: { path: '$brandCompany', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'companies',
          let: { cName: '$companyName' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$isDeleted", true] },
                    { $ne: [{ $type: "$cName" }, "missing"] },
                    { $ne: ["$cName", null] },
                    { $eq: [{ $toLower: { $trim: { input: "$name" } } }, { $toLower: { $trim: { input: "$cName" } } }] }
                  ]
                }
              }
            }
          ],
          as: 'nameCompany'
        }
      },
      { $unwind: { path: '$nameCompany', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          company: { $ifNull: ['$directCompany', { $ifNull: ['$nameCompany', '$brandCompany'] }] }
        }
      },
      {
        $addFields: {
          companyId: '$company._id',
          companyName: { $ifNull: ['$company.name', { $ifNull: ['$companyName', 'Unassigned'] }] },
          canonicalCompanyId: '$company._id'
        }
      }
    ];

    if (search || companyId) {
      const matchStage = {};
      if (search) {
        matchStage.$or = [
          { bottleName: { $regex: search, $options: 'i' } },
          { plainBottle: { $regex: search, $options: 'i' } },
          { brandName: { $regex: search, $options: 'i' } },
          { 'brandId.name': { $regex: search, $options: 'i' } },
          { 'company.name': { $regex: search, $options: 'i' } },
          { colour: { $regex: search, $options: 'i' } },
          { coatingShade: { $regex: search, $options: 'i' } }
        ];
      }
      if (companyId) {
        if (companyId === 'UNASSIGNED') {
          matchStage['company._id'] = { $exists: false };
        } else {
          matchStage['company._id'] = new mongoose.Types.ObjectId(companyId);
        }
      }
      pipeline.push({ $match: matchStage });
    }

    let rawPlans = await LacquerPlan.aggregate(pipeline)
      .option({ maxTimeMS: 15000 })
      .collation({ locale: 'en', strength: 2 });

    if (!rawPlans || rawPlans.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [], nextCursor: null, hasMore: false }
      });
    }

    // Canonical bottle resolution
    await Promise.all(rawPlans.map(async (plan) => {
      const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId);
      const compIdStr = (rawCompId && rawCompId.toString) ? rawCompId.toString() : (rawCompId || '');
      const canonicalBottle = await resolveCanonicalPlainBottle(plan.plainBottle || plan.plainBottleName || plan.bottleName, compIdStr);
      plan.canonicalBottle = canonicalBottle;
      plan.canonicalBottleNormalized = normalizeBottleCanonical(canonicalBottle);
      plan.plainBottle = canonicalBottle;
      plan.plainBottleName = canonicalBottle;
    }));
    rawPlans = await calculatePoolStockWarnings(rawPlans);

    // Sort strictly according to Prompt O
    rawPlans.sort((a, b) => {
      const compA = String(a.company?.name || a.companyName || '').trim();
      const compB = String(b.company?.name || b.companyName || '').trim();
      const compCmp = compA.localeCompare(compB, undefined, { numeric: true, sensitivity: 'base' });
      if (compCmp !== 0) return compCmp;

      const bottleA = a.canonicalBottleNormalized || '';
      const bottleB = b.canonicalBottleNormalized || '';
      const bottleCmp = compareBottleNamesForGrouping(bottleA, bottleB);
      if (bottleCmp !== 0) return bottleCmp;

      const procA = String(a.process || '').trim().toUpperCase();
      const procB = String(b.process || '').trim().toUpperCase();
      if (procA !== procB) return procA.localeCompare(procB);

      const brandA = a.brandId?.name || a.brandName || '';
      const brandB = b.brandId?.name || b.brandName || '';
      const brandCmp = compareBrandsForGrouping(brandA, brandB);
      if (brandCmp !== 0) return brandCmp;

      const grpA = String(a.importGroupId || a.groupId || '');
      const grpB = String(b.importGroupId || b.groupId || '');
      if (grpA && grpB) {
        if (grpA === grpB) {
          const idxA = a.importGroupIndex !== null && a.importGroupIndex !== undefined ? Number(a.importGroupIndex) : null;
          const idxB = b.importGroupIndex !== null && b.importGroupIndex !== undefined ? Number(b.importGroupIndex) : null;
          if (idxA !== null && idxB !== null && idxA !== idxB) {
            return idxA - idxB;
          }
        } else {
          const gCmp = grpA.localeCompare(grpB);
          if (gCmp !== 0) return gCmp;
        }
      } else if (grpA !== grpB) {
        return grpA ? -1 : 1;
      }

      const ordA = a.rowOrder !== undefined && a.rowOrder !== null ? Number(a.rowOrder) : (a.rowSeq !== undefined && a.rowSeq !== null ? Number(a.rowSeq) : 0);
      const ordB = b.rowOrder !== undefined && b.rowOrder !== null ? Number(b.rowOrder) : (b.rowSeq !== undefined && b.rowSeq !== null ? Number(b.rowSeq) : 0);
      if (ordA !== ordB) return ordA - ordB;

      const varA = a.variantId?.variantName || a.variantName || '';
      const varB = b.variantId?.variantName || b.variantName || '';
      const varCmp = compareVariantsForGrouping(varA, varB);
      if (varCmp !== 0) return varCmp;

      return String(a._id || '').localeCompare(String(b._id || ''));
    });

    // Partition into pool blocks
    const poolBlocks = [];
    let currentBlock = [];
    let currentBlockKey = null;

    for (const plan of rawPlans) {
      const dateStr = plan.planDate ? new Date(plan.planDate).toISOString().split('T')[0] : '';
      const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId) || plan.companyName || 'UNASSIGNED';
      const compIdStr = String(rawCompId).trim();
      const bKey = `${dateStr}__${compIdStr}__${plan.canonicalBottleNormalized}`;

      if (bKey !== currentBlockKey) {
        if (currentBlock.length > 0) {
          poolBlocks.push(currentBlock);
        }
        currentBlock = [plan];
        currentBlockKey = bKey;
      } else {
        currentBlock.push(plan);
      }
    }
    if (currentBlock.length > 0) {
      poolBlocks.push(currentBlock);
    }

    // Keyset cursor resolution
    let startBlockIdx = 0;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded && decoded._id) {
        let foundBlockIdx = poolBlocks.findIndex(block =>
          block.some(row => String(row._id) === String(decoded._id))
        );
        if (foundBlockIdx === -1 && decoded.sortValue) {
          const sortValStr = String(decoded.sortValue);
          foundBlockIdx = poolBlocks.findIndex(block => {
            const first = block[0];
            const bKey = `${first.planDate ? new Date(first.planDate).toISOString().split('T')[0] : ''}__${String(first.canonicalCompanyId || first.companyId?._id || first.companyId || first.companyName || 'UNASSIGNED').trim()}__${first.canonicalBottleNormalized}`;
            return bKey === sortValStr;
          });
        }
        if (foundBlockIdx !== -1) {
          startBlockIdx = foundBlockIdx + 1;
        }
      }
    }

    const selectedBlocks = [];
    let selectedRowCount = 0;
    let nextBlockIdx = startBlockIdx;

    while (nextBlockIdx < poolBlocks.length) {
      const blk = poolBlocks[nextBlockIdx];
      selectedBlocks.push(blk);
      selectedRowCount += blk.length;
      nextBlockIdx++;
      if (selectedRowCount >= limit) {
        break;
      }
    }

    const hasMore = nextBlockIdx < poolBlocks.length;

    if (selectedBlocks.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [], nextCursor: null, hasMore: false }
      });
    }

    // Batch augmentations for selected items only
    const items = selectedBlocks.flat();

    // 1. Stock pools
    const poolStockMap = new Map();
    const uniquePools = new Map();
    for (const plan of items) {
      const rawCompId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId);
      const compId = (rawCompId && rawCompId.toString) ? rawCompId.toString() : (rawCompId || '');
      const dayStr = plan.planDate ? new Date(plan.planDate).toISOString().split('T')[0] : '';
      const poolKey = `${compId}::${plan.canonicalBottle}::${dayStr}`;
      if (!uniquePools.has(poolKey)) {
        uniquePools.set(poolKey, { compId, canonicalBottle: plan.canonicalBottle, planDate: plan.planDate });
      }
    }

    await Promise.all(Array.from(uniquePools.entries()).map(async ([poolKey, pInfo]) => {
      const stock = await computeLivePlainStock(pInfo.canonicalBottle, pInfo.compId, pInfo.planDate);
      const rawPlain = stock && stock.plainStock !== undefined ? stock.plainStock : stock;
      const rawOpening = stock && stock.openingStock !== undefined ? stock.openingStock : rawPlain;
      const plainStock = Number.isFinite(Number(rawPlain)) ? Number(rawPlain) : 0;
      const openingStock = Number.isFinite(Number(rawOpening)) ? Number(rawOpening) : 0;
      poolStockMap.set(poolKey, { plainStock, openingStock });
    }));

    // 2. BottleSpec & CoatingProduction batch lookups
    const uniqueBottleNames = Array.from(new Set(items.map(p => p.bottleName).filter(Boolean)));
    const bSpecs = await BottleSpec.find({ bottleName: { $in: uniqueBottleNames }, isDeleted: false }).lean().maxTimeMS(15000);
    const bSpecMap = new Map(bSpecs.map(s => [s.bottleName, s]));

    const coatingOrConditions = [];
    for (const p of items) {
      const spec = bSpecMap.get(p.bottleName);
      const brandOid = p.brandId?._id || p.brandId;
      if (spec && brandOid && p.colour) {
        coatingOrConditions.push({
          coatingSpecId: spec._id,
          brandId: brandOid,
          coatingShade: p.colour,
          isDeleted: false
        });
      }
    }

    const coatingSumMap = new Map();
    if (coatingOrConditions.length > 0) {
      const coatingRecords = await CoatingProduction.find({ $or: coatingOrConditions }).lean().maxTimeMS(15000);
      for (const rec of coatingRecords) {
        const key = `${rec.coatingSpecId}_${rec.brandId}_${rec.coatingShade}`;
        coatingSumMap.set(key, (coatingSumMap.get(key) || 0) + (rec.actualQuantity || 0));
      }
    }

    const allCompaniesList = await Company.find({ isDeleted: { $ne: true } }).select('_id name isStockSupplier').lean();
    const companyNameMap = new Map(allCompaniesList.map(c => [c._id.toString(), c.name]));
    const supplierIdSet = new Set(allCompaniesList.filter(c => c.isStockSupplier).map(c => c._id.toString()));

    // 3. Spans & Block calculations
    const augmentedItems = [];
    for (const block of selectedBlocks) {
      const blockSize = block.length;
      const firstRow = block[0];
      const dateStr = firstRow.planDate ? new Date(firstRow.planDate).toISOString().split('T')[0] : '';
      const rawCompId = firstRow.canonicalCompanyId || (firstRow.companyId?._id || firstRow.companyId) || firstRow.companyName || 'UNASSIGNED';
      const compIdStr = String(rawCompId).trim();
      const blockKey = `${dateStr}__${compIdStr}__${firstRow.canonicalBottleNormalized}`;

      const poolKey = `${compIdStr}::${firstRow.canonicalBottle}::${dateStr}`;
      const poolStock = poolStockMap.get(poolKey) || { plainStock: 0, openingStock: 0 };

      // Process runs: merge across all consecutive rows with same process (across brands)
      let procRunStart = 0;
      while (procRunStart < blockSize) {
        const proc = String(block[procRunStart].process || '').trim().toUpperCase();
        let procRunEnd = procRunStart + 1;
        while (procRunEnd < blockSize) {
          const nextProc = String(block[procRunEnd].process || '').trim().toUpperCase();
          if (nextProc === proc) {
            procRunEnd++;
          } else {
            break;
          }
        }
        const procSpan = procRunEnd - procRunStart;

        // Brand per row (not grouped): each row shows its brand individually
        for (let bIdx = procRunStart; bIdx < procRunEnd; bIdx++) {
          block[bIdx].brandSpan = 1;
          block[bIdx].isFirstInBrand = true;
        }

        for (let pIdx = procRunStart; pIdx < procRunEnd; pIdx++) {
          block[pIdx].processSpan = (pIdx === procRunStart) ? procSpan : 0;
          block[pIdx].isFirstInProcess = (pIdx === procRunStart);
        }

        procRunStart = procRunEnd;
      }

      // Assign block fields & Yellow Warning flags
      for (let i = 0; i < blockSize; i++) {
        const row = block[i];
        const spec = bSpecMap.get(row.bottleName);
        const brandOid = row.brandId?._id || row.brandId;
        const cKey = spec && brandOid && row.colour ? `${spec._id}_${brandOid}_${row.colour}` : null;
        const liveCoated = cKey ? (coatingSumMap.get(cKey) || 0) : 0;
        const coatedQty = row.coatedQty !== null && row.coatedQty !== undefined ? row.coatedQty : (row.coatingCompletedQty !== null && row.coatingCompletedQty !== undefined ? row.coatingCompletedQty : liveCoated);
        const balanceToMake = coatedQty - (row.orderQty || 0);
        const isCompleted = (row.orderQty || 0) > 0 && coatedQty >= (row.orderQty || 0);

        let rowUsedFrom = [];
        let rowUsedFromTooltip = '';
        if (Array.isArray(row.stockAllocation) && row.stockAllocation.length > 0) {
          const hasSupplier = row.stockAllocation.some(a => supplierIdSet.has((a.companyId?._id || a.companyId)?.toString()) && Number(a.qty) > 0);
          if (hasSupplier) {
            rowUsedFrom = row.stockAllocation
              .filter(a => Number(a.qty) > 0)
              .map(a => {
                const cIdStr = (a.companyId?._id || a.companyId)?.toString();
                const cName = companyNameMap.get(cIdStr) || 'Company';
                return {
                  companyId: cIdStr,
                  companyName: cName,
                  qty: Number(a.qty)
                };
              });
            rowUsedFromTooltip = rowUsedFrom.map(u => `${u.companyName}: ${u.qty}`).join(', ');
          }
        }

        const displayedPlainStock = row.poolPlainStock !== null && row.poolPlainStock !== undefined
          ? Number(row.poolPlainStock)
          : poolStock.plainStock;
        const augmentedRow = {
          ...row,
          blockKey,
          blockSize,
          blockIndex: i,
          isFirstInBlock: (i === 0),
          bottleSpan: (i === 0) ? blockSize : 0,
          stockSpan: (i === 0) ? blockSize : 0,
          boxSpan: (i === 0) ? blockSize : 0,
          plainStock: displayedPlainStock,
          openingStock: row.openingStock,
          availableStock: displayedPlainStock,
          livePlainStock: displayedPlainStock,
          coatedQty,
          coatingRejectedQty: (row.qtyEntries || [])
            .filter(entry => !entry.isDeleted && (entry.subType === 'coated' || entry.type === 'coatedQty' || (entry.type === 'edit-adjustment' && entry.subType === 'coated')))
            .reduce((sum, entry) => sum + (Number(entry.rejectionQty) || 0), 0),
          balanceToMake,
          status: isCompleted,
          sentToReadyQty: row.sentToReadyQty || 0,
          usedFrom: rowUsedFrom,
          usedFromTooltip: rowUsedFromTooltip,
          readyActions: computeReadyActions(row),
          stockWarning: Boolean(row.stockWarning),
          isYellow: Boolean(row.stockWarning),
          stockWarningTooltip: row.warningMessage || "",
          groupStockWarning: Boolean(row.stockWarning),
          groupStockWarningTooltip: row.warningMessage || ""
        };
        augmentedItems.push(augmentedRow);
      }
    }

    const lastRow = augmentedItems[augmentedItems.length - 1];
    const nextCursor = hasMore && lastRow ? `${lastRow.blockKey || lastRow.planDate || 'c'}|${lastRow._id}` : null;

    res.status(200).json({
      success: true,
      data: {
        items: augmentedItems,
        nextCursor,
        hasMore
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Month Status
exports.getMonthStatus = async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ success: false, message: "Month is required" });

    const [year, m] = month.split('-');
    const startOfMonth = new Date(Date.UTC(year, m - 1, 1));
    const endOfMonth = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const plans = await LacquerPlan.find({
      isDeleted: false,
      planDate: { $gte: startOfMonth, $lte: endOfMonth }
    }).select('planDate').lean();

    const activeDates = new Set();
    plans.forEach(p => {
      if (p.planDate) {
        const d = new Date(p.planDate).toISOString().split('T')[0];
        activeDates.add(d);
      }
    });

    res.status(200).json({ success: true, activeDates: Array.from(activeDates) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Validate Stock Warning for a row
exports.validateStockWarning = async (req, res) => {
  try {
    const { bottleName, companyId, orderQty, excludeRowId, excludePlanIds, planDate, date } = req.query;

    if (!bottleName || !companyId || !orderQty) {
      return res.status(400).json({
        success: false,
        message: "bottleName, companyId, and orderQty are required"
      });
    }

    const warning = await validateRowStockWarning(
      bottleName,
      companyId,
      parseInt(orderQty, 10),
      excludeRowId || null,
      planDate || date || null,
      excludePlanIds || null
    );

    res.status(200).json({ success: true, data: warning });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Dedicated completion checker for Previous-Day Import
// Rule: balanceToMake = coatingCompletedQty - orderQty
// - Negative balance: production is pending.
// - Zero balance: production is completed.
// - Positive balance: production is completed, including overproduction.
// Valid completed row requires orderQty > 0 and coatingCompletedQty > 0.
const isPreviousDaySourcePlanCompleted = (p) => {
  if (!p) return false;
  if (p.isClosed || p.productionStatus === 'CLOSED') return true;
  const order = Number(p.orderQty) || 0;
  const coated = Number(p.coatingCompletedQty ?? p.coatedQty ?? 0);
  if (order <= 0 || coated <= 0) return false;
  const balanceToMake = coated - order;
  return balanceToMake >= 0;
};

// Import Previous Day
exports.importPreviousDay = async (req, res) => {
  try {
    const { targetDate, sourceDate, importMode } = req.body;
    if (!targetDate) return res.status(400).json({ success: false, message: 'Target date is required' });

    const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');

    let prev;
    if (sourceDate) {
      prev = new Date(sourceDate);
    } else {
      const current = new Date(targetDate);
      prev = new Date(current);
      prev.setUTCDate(prev.getUTCDate() - 1);
    }

    const startOfPrevDay = new Date(prev);
    startOfPrevDay.setUTCHours(0, 0, 0, 0);
    const endOfPrevDay = new Date(prev);
    endOfPrevDay.setUTCHours(23, 59, 59, 999);

    const oldPlans = await LacquerPlan.find({
      isDeleted: false,
      isArchived: { $ne: true },
      isSoftRemoved: { $ne: true },
      isSibling: { $ne: true },
      planDate: { $gte: startOfPrevDay, $lte: endOfPrevDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    if (!oldPlans || oldPlans.length === 0) {
      return res.status(404).json({ success: false, message: 'No plans found for previous day' });
    }

    const startOfTargetDay = new Date(targetDate);
    startOfTargetDay.setUTCHours(0, 0, 0, 0);
    const endOfTargetDay = new Date(targetDate);
    endOfTargetDay.setUTCHours(23, 59, 59, 999);

    const existingTargetPlans = await LacquerPlan.find({
      isDeleted: false,
      isArchived: { $ne: true },
      isSoftRemoved: { $ne: true },
      isSibling: { $ne: true },
      planDate: { $gte: startOfTargetDay, $lte: endOfTargetDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    // Check if target date already has rows imported from source date
    const hasExistingImport = existingTargetPlans.some(p =>
      (p.importedFromId && oldPlans.some(op => op._id.toString() === p.importedFromId.toString())) ||
      (p.importedFromDate && (new Date(p.importedFromDate).toISOString().split('T')[0] === new Date(sourceDate || prev).toISOString().split('T')[0]))
    );

    // If target date already contains an import from source date and user hasn't chosen mode, prompt
    if (hasExistingImport && !importMode) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        hasExistingImport: true,
        message: 'This date already has imports from that source date. Choose how to proceed.'
      });
    }

    // Separate open candidates (unfinished) and completed candidates
    const openCandidates = oldPlans.filter(p => !isPreviousDaySourcePlanCompleted(p));
    const completedCandidates = oldPlans.filter(p => isPreviousDaySourcePlanCompleted(p));

    // Handle completed rows: do NOT carry forward if fully dispatched.
    // For Process C completed rows: auto-send to Ready To Dispatch (idempotent, once only)
    let completedSentCount = 0;
    let notCarriedCount = 0;
    const freshlyDispatchedMap = new Map();

    for (const cp of completedCandidates) {
      const isProcessC = String(cp.process || '').trim().toUpperCase() === 'C';
      const coated = Number(cp.coatingCompletedQty ?? cp.coatedQty ?? 0);
      const sentQty = Number(cp.sentToReadyQty || 0);
      const sendable = Math.max(0, coated - sentQty);

      if (isProcessC && sendable > 0) {
        try {
          await syncLacquerPlanReadyToDispatch(cp._id);
          freshlyDispatchedMap.set(cp._id.toString(), coated);
          completedSentCount++;
        } catch (rtdErr) {
          console.error(`Failed to auto-send completed plan ${cp._id} to Ready To Dispatch:`, rtdErr);
          notCarriedCount++;
        }
      } else {
        notCarriedCount++;
      }
    }

    // Format source date string for history
    const srcDateObj = new Date(sourceDate || prev);
    const day = String(srcDateObj.getUTCDate()).padStart(2, '0');
    const month = String(srcDateObj.getUTCMonth() + 1).padStart(2, '0');
    const year = srcDateObj.getUTCFullYear();
    const sourceDateFormatted = `${day}-${month}-${year}`;

    // Apply exact carry-forward formula from Section 4:
    // carryForwardOrder = Math.max(0, originalOrderQty - dispatchedQty)
    // carryForwardCoated = Math.max(0, originalCoatingCompletedQty - dispatchedQty)
    // balanceToMake = carryForwardCoated - carryForwardOrder
    const newPlansData = oldPlans.map(p => {
      const { _id, createdAt, updatedAt, __v, ...rest } = p;
      let values = { ...rest };

      // If user selected without_changes, revert to original as-imported values if present
      if (importMode === 'without_changes' && p.originalImportedValues) {
        const orig = p.originalImportedValues;
        if (orig.orderQty !== undefined) values.orderQty = orig.orderQty;
        if (orig.boxQty !== undefined) values.boxQty = orig.boxQty;
        if (orig.noOfBoxes !== undefined) values.noOfBoxes = orig.noOfBoxes;
        if (orig.remarks !== undefined) values.remarks = orig.remarks;
        if (orig.process !== undefined) values.process = orig.process;
      }

      const originalOrder = Number(values.orderQty) || 0;
      const sourceCoated = Number(p.coatingCompletedQty ?? p.coatedQty ?? 0);
      const dispatchedQty = freshlyDispatchedMap.has(p._id.toString())
        ? freshlyDispatchedMap.get(p._id.toString())
        : Number(p.sentToReadyQty || 0);

      const carryForwardOrder = Math.max(0, originalOrder - dispatchedQty);
      const carryForwardCoated = Math.max(0, sourceCoated - dispatchedQty);
      const recalculatedBalanceToMake = carryForwardCoated - carryForwardOrder;

      // Calculate carried stock allocation proportionally from source allocation
      let carriedSplit = [];
      if (carryForwardCoated > 0) {
        if (Array.isArray(p.stockAllocation) && p.stockAllocation.length > 0) {
          const sourceSumAlloc = p.stockAllocation.reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
          if (sourceSumAlloc > 0) {
            let allocatedSoFar = 0;
            carriedSplit = p.stockAllocation.map((a, idx) => {
              const origQty = Number(a.qty) || 0;
              let q = 0;
              if (idx === p.stockAllocation.length - 1) {
                q = Math.max(0, carryForwardCoated - allocatedSoFar);
              } else {
                q = Math.round((origQty / sourceSumAlloc) * carryForwardCoated);
                allocatedSoFar += q;
              }
              return {
                companyId: a.companyId?._id || a.companyId,
                qty: q
              };
            });
          } else if (p.companyId) {
            carriedSplit = [{ companyId: p.companyId?._id || p.companyId, qty: carryForwardCoated }];
          }
        } else if (p.companyId) {
          carriedSplit = [{ companyId: p.companyId?._id || p.companyId, qty: carryForwardCoated }];
        }
      }

      const boxQty = Number(values.boxQty) || 0;
      const recalculatedNoOfBoxes = (boxQty > 0 && carryForwardOrder > 0)
        ? Math.ceil(carryForwardOrder / boxQty)
        : (carryForwardOrder === 0 ? 0 : values.noOfBoxes);

      const historyNote = `Carried from ${sourceDateFormatted}: order ${carryForwardOrder}, coated ${carryForwardCoated} (orig order ${originalOrder}, orig coated ${sourceCoated}, dispatched ${dispatchedQty})`;

      const snapshot = {
        orderQty: carryForwardOrder,
        coatingCompletedQty: carryForwardCoated,
        coatedQty: carryForwardCoated,
        balanceToMake: recalculatedBalanceToMake,
        boxQty: values.boxQty,
        noOfBoxes: recalculatedNoOfBoxes,
        dispatchPendingQty: values.dispatchPendingQty,
        dispatchBalance: values.dispatchBalance,
        soldQty: values.soldQty,
        plainStock: values.plainStock,
        remarks: values.remarks,
        process: values.process
      };

      return {
        ...values,
        orderQty: carryForwardOrder,
        orderQtyInitial: carryForwardOrder,
        noOfBoxes: recalculatedNoOfBoxes,
        coatingCompletedQty: carryForwardCoated,
        coatedQty: carryForwardCoated,
        balanceToMake: recalculatedBalanceToMake,
        appliedStockDeduction: 0,
        stockAllocation: carriedSplit,
        stockAllocationInitial: carriedSplit,
        carriedStockAllocation: carriedSplit,
        coatedQtyInitial: carryForwardCoated,
        carriedFromCoatedQty: carryForwardCoated,
        qtyEntries: [
          ...(carryForwardCoated > 0 ? [{
            type: 'coatingCompletedQty',
            subType: 'carried',
            qty: carryForwardCoated,
            runningTotal: carryForwardCoated,
            stockAllocation: carriedSplit,
            note: `Carried from ${sourceDateFormatted}`,
            at: new Date(),
            by: req.user?.username || req.user?.name || req.user?.email || 'System'
          }] : []),
          {
            type: 'orderQty',
            subType: 'order',
            qty: carryForwardOrder,
            runningTotal: carryForwardOrder,
            note: historyNote,
            at: new Date(),
            by: req.user?.username || req.user?.name || req.user?.email || 'System'
          }
        ],
        orderHistory: [{
          date: new Date(),
          originalOrder: carryForwardOrder,
          updatedOrder: carryForwardOrder,
          totalOrder: carryForwardOrder,
          notes: historyNote
        }],
        stockSources: (p.stockSources && p.stockSources.length > 0)
          ? p.stockSources
          : (p.companyId ? [p.companyId] : []),
        planDate: new Date(targetDate),
        isEditedAfterImport: false,
        lastEditedAt: null,
        originalImportedValues: snapshot,
        importedFromId: p._id,
        importedFromDate: sourceDate || prev,
        productionStatus: 'ACTIVE',
        isClosed: false,
        isSoftRemoved: false,
        isArchived: false,
        isSibling: false,
        cancelledQty: 0,
        sentToReadyQty: 0,
        readyToDispatch: null
      };
    }).filter(c => c.orderQty > 0);

    let newPlans = [];
    const alreadyImportedSourceIds = new Set(
      existingTargetPlans
        .filter(p => p.importedFromId)
        .map(p => p.importedFromId.toString())
    );

    if (importMode === 'with_changes' && hasExistingImport) {
      for (const candidate of newPlansData) {
        const existingImport = existingTargetPlans.find(p =>
          p.importedFromId?.toString() === candidate.importedFromId.toString()
        );

        if (existingImport) {
          // STRICT RULE: PRESERVE target day's latest production data (orderQty, coatingCompletedQty, coatedQty, balanceToMake, stockAllocation, qtyEntries).
          // Only update non-destructive descriptive fields if modified in source.
          const metaUpdates = {
            importedFromDate: candidate.importedFromDate
          };
          if (candidate.remarks && candidate.remarks !== existingImport.remarks) {
            metaUpdates.remarks = candidate.remarks;
          }
          if (candidate.boxQty && candidate.boxQty !== existingImport.boxQty) {
            metaUpdates.boxQty = candidate.boxQty;
          }
          await LacquerPlan.updateOne(
            { _id: existingImport._id },
            { $set: metaUpdates }
          );
          alreadyImportedSourceIds.add(candidate.importedFromId.toString());
        }
      }

      // Add only new rows (not already imported)
      const plansToInsert = newPlansData.filter(newP =>
        !alreadyImportedSourceIds.has(newP.importedFromId.toString())
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
        }
      }
    } else if (importMode === 'without_changes' && hasExistingImport) {
      // Keep existing target records untouched; only add rows that haven't been imported yet
      const plansToInsert = newPlansData.filter(newP =>
        !alreadyImportedSourceIds.has(newP.importedFromId.toString())
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
        }
      }
    } else {
      // First import: insert rows that are not already imported by source plan ID
      const plansToInsert = newPlansData.filter(newP =>
        !existingTargetPlans.some(existP =>
          existP.importedFromId && existP.importedFromId.toString() === newP.importedFromId.toString()
        )
      );

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
        }
      }
    }

    // Calculate stock warnings for candidate plans (for preview response)
    const stockWarnings = [];
    for (const candidate of newPlansData) {
      if (!candidate.bottleName || !candidate.companyId || !candidate.orderQty) {
        continue;
      }

      try {
        const warning = await validateRowStockWarning(
          candidate.bottleName,
          candidate.companyId,
          candidate.orderQty,
          null,
          candidate.planDate || targetDate
        );

        if (warning.hasWarning) {
          stockWarnings.push({
            sourcePlanId: candidate.importedFromId,
            bottleName: candidate.bottleName,
            orderQty: warning.orderQty,
            availableStock: warning.availableStock,
            overBy: warning.overBy,
            details: warning.details
          });
        }
      } catch (err) {
        console.error('Stock warning calculation error for import:', err);
      }
    }

    const carriedCount = newPlans.length;
    const summaryMsg = `${carriedCount} rows carried, ${completedSentCount} completed rows sent to Ready To Dispatch, ${notCarriedCount} not carried`;

    res.status(200).json({
      success: true,
      data: newPlans,
      carriedCount,
      completedSentCount,
      notCarriedCount,
      skippedCount: alreadyImportedSourceIds ? alreadyImportedSourceIds.size : 0,
      skippedCompletedCount: oldPlans.length - openCandidates.length,
      importMode: importMode || 'normal',
      message: summaryMsg,
      stockWarnings,
      hasStockWarnings: stockWarnings.length > 0
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


/**
 * Computes full chronological history for a Lacquer Plan row.
 * Handles Order Qty and Coating Completed Qty entries, initial opening balance,
 * edit adjustments, soft-deleted entries, running totals, and balance after each entry.
 */
function formatUsedFrom(allocation, fallbackCompanyId, fallbackCompanyName, fallbackQty, companyNameMap) {
  let list = [];
  if (Array.isArray(allocation) && allocation.length > 0) {
    list = allocation
      .filter(a => Number(a.qty) !== 0)
      .map(a => {
        const cid = (a.companyId?._id || a.companyId)?.toString();
        const cName = (companyNameMap && companyNameMap.get(cid)) || a.companyName || a.companyId?.name || 'Company';
        return {
          companyId: cid,
          companyName: cName,
          qty: Math.abs(Number(a.qty))
        };
      });
  }

  if (list.length === 0 && Number(fallbackQty) > 0) {
    const cid = (fallbackCompanyId?._id || fallbackCompanyId)?.toString();
    const cName = fallbackCompanyName || (companyNameMap && companyNameMap.get(cid)) || 'Own Company';
    list = [{
      companyId: cid,
      companyName: cName,
      qty: Math.abs(Number(fallbackQty) || 0)
    }];
  }

  let text = '-';
  if (list.length === 1) {
    text = list[0].companyName;
  } else if (list.length > 1) {
    text = list.map(s => `${s.companyName} ${s.qty}`).join(', ');
  }

  return {
    usedFrom: list,
    usedFromText: text
  };
}

function computePlanRowHistory(plan, plainStock, companyNameMap = new Map()) {
  const entries = Array.isArray(plan.qtyEntries) ? [...plan.qtyEntries] : [];
  entries.sort((a, b) => new Date(a.at || a.createdAt || 0) - new Date(b.at || b.createdAt || 0));

  // 1. Order initial & active additions
  const orderEntries = entries.filter(e => e.subType === 'order' || e.type === 'orderQty' || (e.type === 'added' && !e.subType) || (e.type === 'edit-adjustment' && e.subType === 'order'));
  const activeOrderEntriesSum = orderEntries.filter(e => !e.isDeleted).reduce((sum, e) => sum + Number(e.qty || 0), 0);

  let initialOrder = (typeof plan.orderQtyInitial === 'number' && plan.orderQtyInitial >= 0)
    ? plan.orderQtyInitial
    : (Number(plan.orderQty || 0) - activeOrderEntriesSum);
  if (initialOrder < 0) initialOrder = 0;

  // 2. Coated initial & active additions
  const coatingEntries = entries.filter(e => e.subType === 'coated' || e.type === 'coatedQty' || (e.type === 'edit-adjustment' && e.subType === 'coated'));
  const activeCoatedEntriesSum = coatingEntries.filter(e => !e.isDeleted).reduce((sum, e) => sum + Number(e.qty || 0), 0);
  const coatingRejectionQty = coatingEntries.filter(e => !e.isDeleted).reduce((sum, e) => sum + (Number(e.rejectionQty) || 0), 0);

  const currentCoated = Number(plan.coatingCompletedQty ?? plan.coatedQty ?? 0);
  let initialCoated = (typeof plan.coatedQtyInitial === 'number' && plan.coatedQtyInitial >= 0)
    ? plan.coatedQtyInitial
    : (currentCoated - activeCoatedEntriesSum);
  if (initialCoated < 0) initialCoated = 0;

  const finalOrder = (plan.orderQty !== undefined && plan.orderQty !== null) ? Number(plan.orderQty) : (initialOrder + activeOrderEntriesSum);
  const finalCoated = currentCoated;

  // Build Order History Rows
  let runningOrder = initialOrder;
  const orderRows = [];
  orderRows.push({
    sr: 1,
    at: plan.createdAt || plan.planDate || new Date(),
    type: 'Opening balance',
    rawType: 'opening',
    qtyChange: `${initialOrder}`,
    displayQty: `${initialOrder}`,
    runningTotal: initialOrder,
    balance: initialCoated - initialOrder,
    by: plan.createdBy?.name || plan.createdBy || 'System',
    note: 'Opening balance',
    isDeleted: false
  });

  orderEntries.forEach((entry, idx) => {
    const isDel = !!entry.isDeleted;
    const qtyVal = Number(entry.qty || 0);
    if (!isDel) {
      runningOrder += qtyVal;
    }
    const typeLabel = isDel ? 'Removed' : (entry.type === 'edit-adjustment' ? 'Edit adjustment' : 'Added');
    const signPrefix = qtyVal > 0 ? `+${qtyVal}` : `${qtyVal}`;
    orderRows.push({
      sr: idx + 2,
      at: entry.at || new Date(),
      type: typeLabel,
      rawType: isDel ? 'removed' : (entry.type === 'edit-adjustment' ? 'edit-adjustment' : 'added'),
      qtyChange: signPrefix,
      displayQty: signPrefix,
      runningTotal: runningOrder,
      balance: finalCoated - runningOrder,
      by: isDel ? (entry.deletedBy || entry.by || 'unknown') : (entry.by || 'unknown'),
      deletedAt: entry.deletedAt,
      note: entry.note || (isDel ? `Removed by ${entry.deletedBy || 'unknown'}` : ''),
      isDeleted: isDel,
      _id: entry._id
    });
  });

  // Build Coating History Rows
  const ownCompId = (plan.companyId?._id || plan.companyId)?.toString();
  const ownCompName = (companyNameMap && companyNameMap.get(ownCompId)) || plan.companyName || plan.companyId?.name || 'Own Company';
  const openingAlloc = (Array.isArray(plan.stockAllocationInitial) && plan.stockAllocationInitial.length > 0)
    ? plan.stockAllocationInitial
    : ((Array.isArray(plan.stockAllocation) && plan.stockAllocation.length > 0 && coatingEntries.length === 0)
      ? plan.stockAllocation
      : []);
  const openingUsedFrom = formatUsedFrom(openingAlloc, ownCompId, ownCompName, initialCoated, companyNameMap);

  const carriedCoated = Number(plan.carriedFromCoatedQty || 0);
  const isCarried = carriedCoated > 0 && !!plan.importedFromDate;
  let carriedDateStr = '';
  if (isCarried) {
    const dObj = new Date(plan.importedFromDate);
    const dd = String(dObj.getUTCDate()).padStart(2, '0');
    const mm = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getUTCFullYear();
    carriedDateStr = `${dd}-${mm}-${yyyy}`;
  }

  let runningCoated = initialCoated;
  const coatingRows = [];
  coatingRows.push({
    sr: 1,
    at: plan.createdAt || plan.planDate || new Date(),
    type: isCarried ? `Carried from ${carriedDateStr}` : 'Opening balance',
    rawType: 'opening',
    qtyChange: `${initialCoated}`,
    displayQty: `${initialCoated}`,
    runningTotal: initialCoated,
    stockRemaining: plainStock !== undefined ? plainStock : (plan.plainStock ?? 0),
    balance: initialCoated - finalOrder,
    by: plan.createdBy?.name || plan.createdBy || 'System',
    note: isCarried ? `Carried from ${carriedDateStr}: coated ${carriedCoated}` : 'Opening balance',
    isDeleted: false,
    usedFrom: openingUsedFrom.usedFrom,
    usedFromText: openingUsedFrom.usedFromText
  });

  coatingEntries.forEach((entry, idx) => {
    const isDel = !!entry.isDeleted;
    const qtyVal = Number(entry.qty || 0);
    if (!isDel) {
      runningCoated += qtyVal;
    }
    const typeLabel = isDel ? 'Removed' : (entry.type === 'edit-adjustment' ? 'Edit adjustment' : 'Added');
    const signPrefix = qtyVal > 0 ? `+${qtyVal}` : `${qtyVal}`;
    const entryUsedFrom = formatUsedFrom(entry.stockAllocation, ownCompId, ownCompName, Math.abs(qtyVal), companyNameMap);

    coatingRows.push({
      sr: idx + 2,
      at: entry.at || new Date(),
      type: typeLabel,
      rawType: isDel ? 'removed' : (entry.type === 'edit-adjustment' ? 'edit-adjustment' : 'added'),
      qtyChange: signPrefix,
      displayQty: signPrefix,
      runningTotal: runningCoated,
      stockRemaining: plainStock !== undefined ? plainStock : (plan.plainStock ?? 0),
      balance: runningCoated - finalOrder,
      by: isDel ? (entry.deletedBy || entry.by || 'unknown') : (entry.by || 'unknown'),
      deletedAt: entry.deletedAt,
      note: entry.note || (isDel ? `Removed by ${entry.deletedBy || 'unknown'}` : ''),
      isDeleted: isDel,
      stockAllocation: entry.stockAllocation || [],
      usedFrom: entryUsedFrom.usedFrom,
      usedFromText: entryUsedFrom.usedFromText,
      rejectionQty: Number(entry.rejectionQty) || 0,
      rejectionBoxes: Number(entry.rejectionBoxes) || 0,
      rejectionLooseQty: Number(entry.rejectionLooseQty ?? entry.rejectionQty) || 0,
      _id: entry._id
    });
  });

  // Calculate current total used from
  const totalAllocMap = new Map();
  for (const a of (openingUsedFrom.usedFrom || [])) {
    if (a.companyId) {
      totalAllocMap.set(a.companyId, {
        companyName: a.companyName,
        qty: (totalAllocMap.get(a.companyId)?.qty || 0) + a.qty
      });
    }
  }
  for (const row of coatingRows) {
    if (row.isDeleted || row.rawType === 'opening') continue;
    for (const a of (row.usedFrom || [])) {
      if (a.companyId) {
        totalAllocMap.set(a.companyId, {
          companyName: a.companyName,
          qty: (totalAllocMap.get(a.companyId)?.qty || 0) + a.qty
        });
      }
    }
  }
  const currentTotalList = Array.from(totalAllocMap.entries())
    .filter(([cid, info]) => info.qty > 0)
    .map(([cid, info]) => ({ companyId: cid, companyName: info.companyName, qty: info.qty }));

  let totalUsedFromText = '-';
  if (currentTotalList.length === 1) {
    totalUsedFromText = currentTotalList[0].companyName;
  } else if (currentTotalList.length > 1) {
    totalUsedFromText = currentTotalList.map(s => `${s.companyName} ${s.qty}`).join(', ');
  } else if (ownCompName) {
    totalUsedFromText = ownCompName;
  }

  return {
    orderHistory: orderRows,
    coatingHistory: coatingRows,
    orderSummary: {
      opening: initialOrder,
      totalAdded: activeOrderEntriesSum,
      current: finalOrder
    },
    coatingSummary: {
      opening: initialCoated,
      totalAdded: activeCoatedEntriesSum,
      rejectionQty: coatingRejectionQty,
      current: finalCoated,
      totalUsedFromText,
      usedFrom: currentTotalList
    },
    currentTotalOrder: finalOrder,
    currentTotalCoated: finalCoated,
    totalOrderEntries: orderRows.length,
    totalCoatingEntries: coatingRows.length
  };
}
exports.computePlanRowHistory = computePlanRowHistory;

exports.getPlanById = async (req, res) => {
  try {
    const plan = await LacquerPlan.findById(req.params.id)
      .populate("companyId", "name")
      .populate("brandId", "name")
      .populate("variantId", "variantName")
      .populate("stockSources", "name")
      .populate("stockAllocation.companyId", "name");
    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    let groupPlans = [];
    let groupPlanIds = [];
    if (plan.groupKey) {
      groupPlans = await LacquerPlan.find({
        groupKey: plan.groupKey,
        isDeleted: false
      })
        .sort({ rowSeq: 1, createdAt: 1 })
        .populate("companyId", "name")
        .populate("brandId", "name")
        .populate("variantId", "variantName")
        .populate("stockSources", "name")
        .populate("stockAllocation.companyId", "name")
        .lean();
      groupPlanIds = groupPlans.map(p => p._id.toString());
    } else {
      groupPlans = [plan.toObject()];
      groupPlanIds = [plan._id.toString()];
    }

    const compId = plan.canonicalCompanyId || (plan.companyId?._id || plan.companyId);
    const canonicalBottle = await resolveCanonicalPlainBottle(plan.plainBottle || plan.bottleName, compId);

    const compSources = (plan.stockSources && plan.stockSources.length > 0)
      ? plan.stockSources.map(s => (s._id || s).toString())
      : [compId ? compId.toString() : ''];

    // Compute accurate live day-based plain stock for this pool (excluding group plans for edit accuracy)
    const stockRes = await computeLivePlainStock(canonicalBottle, compSources, plan.planDate, groupPlanIds);
    const plainStock = stockRes.plainStock !== undefined ? stockRes.plainStock : Number(stockRes);
    const openingStock = stockRes.openingStock !== undefined ? stockRes.openingStock : plainStock;

    const allCompanies = await Company.find({ isDeleted: { $ne: true } }).select('_id name').lean();
    const companyNameMap = new Map(allCompanies.map(c => [c._id.toString(), c.name]));

    const planObj = plan.toObject();
    planObj.coatingRejectedQty = (planObj.qtyEntries || [])
      .filter(entry => !entry.isDeleted && (entry.subType === 'coated' || entry.type === 'coatedQty' || (entry.type === 'edit-adjustment' && entry.subType === 'coated')))
      .reduce((sum, entry) => sum + (Number(entry.rejectionQty) || 0), 0);
    planObj.livePlainStock = plainStock;
    planObj.plainStock = plainStock;
    planObj.openingStock = openingStock;

    groupPlans = groupPlans.map(p => ({
      ...p,
      coatingRejectedQty: (p.qtyEntries || [])
        .filter(entry => !entry.isDeleted && (entry.subType === 'coated' || entry.type === 'coatedQty' || (entry.type === 'edit-adjustment' && entry.subType === 'coated')))
        .reduce((sum, entry) => sum + (Number(entry.rejectionQty) || 0), 0),
      livePlainStock: plainStock,
      plainStock: plainStock,
      openingStock: openingStock
    }));

    planObj.history = computePlanRowHistory(planObj, plainStock, companyNameMap);

    groupPlans = groupPlans.map(p => {
      const pObj = {
        ...p,
        livePlainStock: plainStock,
        plainStock: plainStock,
        openingStock: openingStock
      };
      pObj.history = computePlanRowHistory(pObj, plainStock, companyNameMap);
      return pObj;
    });

    planObj.groupPlans = groupPlans;

    const warnedViewRows = await calculatePoolStockWarnings([planObj, ...groupPlans]);
    Object.assign(planObj, warnedViewRows[0]);
    groupPlans = warnedViewRows.slice(1);
    planObj.groupPlans = groupPlans;

    res.status(200).json({
      success: true,
      data: planObj,
      groupPlans,
      groupPlanIds,
      plainStock,
      openingStock,
      sources: stockRes.sources || [],
      hasSuppliers: stockRes.hasSuppliers || false,
      eligibleSuppliers: stockRes.eligibleSuppliers || []
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update Plan
exports.updatePlan = async (req, res) => {
  try {
    const existingPlan = await LacquerPlan.findById(req.params.id);
    if (!existingPlan || existingPlan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const excludeIds = req.body.excludePlanIds ? req.body.excludePlanIds : [req.params.id];
    const itemsToCheck = req.body.allFormRows && Array.isArray(req.body.allFormRows)
      ? req.body.allFormRows
      : [{ ...existingPlan.toObject(), ...req.body }];
    const coatedLimitError = await validateCoatedQtyLimit(itemsToCheck, excludeIds);
    if (coatedLimitError) {
      return res.status(400).json({
        success: false,
        message: coatedLimitError.message,
        available: coatedLimitError.available,
        totalCoated: coatedLimitError.totalCoated
      });
    }

    const oldBottleName = existingPlan.bottleName;
    const oldCompanyId = existingPlan.canonicalCompanyId || existingPlan.companyId;

    await validatePlanCompanyBottleVariant(req.body, true, existingPlan);

    // Stock warning validation: only warn on qty increase
    if (req.body.orderQty && req.body.orderQty > (existingPlan.orderQty || 0)) {
      const newQty = req.body.orderQty;
      const companyId = req.body.companyId || existingPlan.companyId;
      const bottleName = req.body.bottleName || existingPlan.bottleName;

      const warning = await validateRowStockWarning(
        bottleName,
        companyId,
        newQty,
        req.params.id
      );

      // If warning is triggered, record details but never block saving
      if (warning.hasWarning) {
        req.body.stockWarningAcknowledged = true;
        req.body.acknowledgedAt = new Date();
        req.body.stockWarningDetails = warning;
      }
    }

    // Check DB for duplicates excluding the current record
    const planDate = req.body.planDate || existingPlan.planDate;
    const companyId = req.body.companyId || existingPlan.companyId;
    const bottleName = req.body.bottleName || existingPlan.bottleName;
    const variantId = req.body.variantId !== undefined ? req.body.variantId : existingPlan.variantId;
    const brandId = req.body.brandId || existingPlan.brandId;

    if (planDate && companyId && bottleName && brandId) {
      const startOfDay = new Date(planDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(planDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const dupQuery = {
        _id: { $ne: req.params.id },
        planDate: { $gte: startOfDay, $lte: endOfDay },
        companyId: companyId,
        brandId: brandId,
        bottleName: { $regex: new RegExp("^" + bottleName.trim() + "$", "i") },
        isDeleted: false
      };

      if (variantId) {
        dupQuery.variantId = variantId;
      } else {
        dupQuery.variantId = { $in: [null, undefined] };
        const shade = req.body.colour || req.body.coatingShade || existingPlan.colour || existingPlan.coatingShade;
        if (shade) {
          dupQuery.$or = [{ colour: shade }, { coatingShade: shade }];
        }
      }

      const duplicate = await LacquerPlan.findOne(dupQuery).populate('variantId', 'variantName');
      if (duplicate) {
        const vName = duplicate.variantId?.variantName || (duplicate.variantId ? (await Variant.findById(duplicate.variantId))?.variantName : '') || req.body.variantName;
        const shade = req.body.colour || req.body.coatingShade || duplicate.colour || duplicate.coatingShade;
        const detail = vName ? `with variant "${vName}"` : (shade ? `with shade "${shade}"` : 'with this variant');
        throw new Error(`A plan for Bottle "${bottleName}" ${detail} already exists for this date, company and brand.`);
      }
    }

    // Compute target groupKey
    const targetGroupKey = await computePlanGroupKey({
      ...existingPlan.toObject(),
      ...req.body
    });

    const updateData = { ...req.body };
    delete updateData.sentToReadyQty;
    delete updateData.readyToDispatch;

    if (req.body.coatingCompletedQty !== undefined || req.body.coatedQty !== undefined || req.body.orderQty !== undefined || updateData.balanceToMake !== undefined) {
      const newCoated = updateData.coatingCompletedQty !== undefined ? updateData.coatingCompletedQty : (updateData.coatedQty !== undefined ? updateData.coatedQty : (existingPlan.coatingCompletedQty ?? existingPlan.coatedQty ?? 0));
      const newOrder = updateData.orderQty !== undefined ? updateData.orderQty : (existingPlan.orderQty ?? 0);
      updateData.coatingCompletedQty = Number(newCoated);
      updateData.coatedQty = Number(newCoated);
      updateData.balanceToMake = Number(newCoated) - Number(newOrder);
      if (updateData.status === undefined || req.body.status === undefined) {
        updateData.status = (Number(newOrder) > 0 && Number(newCoated) >= Number(newOrder));
      }
    }

    let newHistory = null;
    if (updateData.newOrderHistoryEntry) {
      newHistory = updateData.newOrderHistoryEntry;
      delete updateData.newOrderHistoryEntry;
    }

    // Handle groupKey and rowSeq
    const oldGroupKey = existingPlan.groupKey;
    let renumberOldGroup = false;
    if (oldGroupKey && targetGroupKey && targetGroupKey !== oldGroupKey) {
      // Row moved to a new group: assign next rowSeq in new group
      const newGroupExisting = await LacquerPlan.find({ groupKey: targetGroupKey, isDeleted: false, _id: { $ne: existingPlan._id } }).sort({ rowSeq: 1 });
      const nextSeq = newGroupExisting.length > 0 ? Math.max(...newGroupExisting.map(p => p.rowSeq || 0)) + 1 : 1;
      updateData.groupKey = targetGroupKey;
      updateData.rowSeq = nextSeq;
      renumberOldGroup = true;
    } else {
      updateData.groupKey = targetGroupKey || existingPlan.groupKey;
      if (req.body.rowSeq !== undefined) {
        updateData.rowSeq = req.body.rowSeq;
      }
      if (existingPlan.groupId && !updateData.groupId) {
        updateData.groupId = existingPlan.groupId;
      }
      if (req.body.rowOrder !== undefined) {
        updateData.rowOrder = req.body.rowOrder;
      } else if (existingPlan.rowOrder !== undefined) {
        updateData.rowOrder = existingPlan.rowOrder;
      }
    }

    // Mark as edited post-import and capture original imported snapshot if not yet set
    updateData.isEditedAfterImport = true;
    updateData.lastEditedAt = new Date();
    if (!existingPlan.originalImportedValues) {
      updateData.originalImportedValues = {
        orderQty: existingPlan.orderQty,
        coatingCompletedQty: existingPlan.coatingCompletedQty,
        coatedQty: existingPlan.coatedQty,
        balanceToMake: existingPlan.balanceToMake,
        boxQty: existingPlan.boxQty,
        noOfBoxes: existingPlan.noOfBoxes,
        dispatchPendingQty: existingPlan.dispatchPendingQty,
        dispatchBalance: existingPlan.dispatchBalance,
        soldQty: existingPlan.soldQty,
        plainStock: existingPlan.plainStock,
        remarks: existingPlan.remarks,
        process: existingPlan.process
      };
    }

    if (req.body.brandId && (!updateData.brandName || req.body.brandId !== existingPlan.brandId?.toString())) {
      const Brand = require('../models/Brand');
      const bDoc = await Brand.findById(req.body.brandId);
      if (bDoc) {
        updateData.brandName = bDoc.name;
      }
    }

    // Validate stock allocation for updated plan
    const newCoatedVal = updateData.coatingCompletedQty !== undefined
      ? Number(updateData.coatingCompletedQty)
      : (updateData.coatedQty !== undefined ? Number(updateData.coatedQty) : Number(existingPlan.coatingCompletedQty ?? existingPlan.coatedQty ?? 0));
    const allocDate = updateData.planDate || existingPlan.planDate;
    const allocBottle = updateData.bottleName || existingPlan.bottleName;
    const allocComp = updateData.companyId || existingPlan.companyId;
    const allocSources = updateData.stockSources !== undefined ? updateData.stockSources : existingPlan.stockSources;
    const allocSplit = updateData.stockAllocation !== undefined ? updateData.stockAllocation : null;

    const allocRes = await validateStockAllocation(
      allocDate,
      allocBottle,
      allocComp,
      allocSources,
      newCoatedVal,
      allocSplit,
      existingPlan._id,
      null,
      existingPlan.carriedStockAllocation
    );
    updateData.stockSources = allocRes.stockSources;
    updateData.stockAllocation = allocRes.stockAllocation;

    // History edit adjustments
    const oldOrder = Number(existingPlan.orderQty || 0);
    const newOrder = updateData.orderQty !== undefined ? Number(updateData.orderQty) : oldOrder;
    const diffOrder = newOrder - oldOrder;

    const oldCoated = Number(existingPlan.coatingCompletedQty ?? existingPlan.coatedQty ?? 0);
    const newCoated = newCoatedVal;
    const diffCoated = newCoated - oldCoated;

    if (diffOrder !== 0 || diffCoated !== 0) {
      if (existingPlan.orderQtyInitial === null || existingPlan.orderQtyInitial === undefined) {
        updateData.orderQtyInitial = oldOrder;
      }
      if (existingPlan.coatedQtyInitial === null || existingPlan.coatedQtyInitial === undefined) {
        updateData.coatedQtyInitial = oldCoated;
      }
      if (existingPlan.stockAllocationInitial === null || existingPlan.stockAllocationInitial === undefined || existingPlan.stockAllocationInitial.length === 0) {
        updateData.stockAllocationInitial = (existingPlan.stockAllocation && existingPlan.stockAllocation.length > 0)
          ? existingPlan.stockAllocation
          : (oldCoated > 0 ? [{ companyId: existingPlan.companyId, qty: oldCoated }] : []);
      }

      const editUser = req.user?.email || req.user?.name || 'unknown';
      const newEntries = Array.isArray(existingPlan.qtyEntries) ? [...existingPlan.qtyEntries] : [];
      if (diffOrder !== 0) {
        newEntries.push({
          type: 'edit-adjustment',
          subType: 'order',
          qty: diffOrder,
          at: new Date(),
          by: editUser,
          note: req.body.editNote || 'Edit adjustment',
          runningTotal: newOrder,
          isDeleted: false
        });
      }
      if (diffCoated !== 0) {
        // Delta allocation for edit adjustment
        const oldAllocMap = new Map();
        (existingPlan.stockAllocation || []).forEach(a => {
          const cid = (a.companyId?._id || a.companyId)?.toString();
          oldAllocMap.set(cid, Number(a.qty) || 0);
        });
        const newAllocMap = new Map();
        (allocRes.stockAllocation || []).forEach(a => {
          const cid = (a.companyId?._id || a.companyId)?.toString();
          newAllocMap.set(cid, Number(a.qty) || 0);
        });
        const allCids = new Set([...oldAllocMap.keys(), ...newAllocMap.keys()]);
        const entryAllocDiff = [];
        for (const cid of allCids) {
          if (!cid || !mongoose.isValidObjectId(cid)) continue;
          const qDiff = (newAllocMap.get(cid) || 0) - (oldAllocMap.get(cid) || 0);
          if (qDiff !== 0) {
            entryAllocDiff.push({ companyId: new mongoose.Types.ObjectId(cid), qty: qDiff });
          }
        }

        newEntries.push({
          type: 'edit-adjustment',
          subType: 'coated',
          qty: diffCoated,
          at: new Date(),
          by: editUser,
          note: req.body.editNote || 'Edit adjustment',
          runningTotal: newCoated,
          stockAllocation: entryAllocDiff,
          isDeleted: false
        });
      }
      updateData.qtyEntries = newEntries;
    }

    const updatedPlanData = { ...existingPlan.toObject(), ...updateData };
    const transactionResult = await needsPrintingSyncTransaction(updatedPlanData)
      ? await withLacquerPrintingCompensation([updatedPlanData], async session => {
        let updatedPlan = await LacquerPlan.findByIdAndUpdate(
          req.params.id,
          updateData,
          {
            new: true,
            runValidators: true,
            ...(session ? { session } : {})
          }
        );
        if (updatedPlan && newHistory) {
          updatedPlan.orderHistory.push(newHistory);
          await updatedPlan.save(session ? { session } : undefined);
        }
        if (!updatedPlan || updatedPlan.isDeleted) {
          throw new Error("Plan not found");
        }
        const printingSyncResult = await syncPrintingPlanForLacquerPlan(
          updatedPlan,
          req.user?._id,
          { session }
        );
        return { plan: updatedPlan, printingSyncResult };
      })
      : {
        plan: await LacquerPlan.findByIdAndUpdate(
          req.params.id,
          updateData,
          { new: true, runValidators: true }
        ),
        printingSyncResult: null
      };
    const plan = transactionResult.plan;

    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    if (renumberOldGroup) {
      const oldGroupRemaining = await LacquerPlan.find({
        groupKey: oldGroupKey,
        isDeleted: false,
        _id: { $ne: existingPlan._id }
      }).sort({ rowSeq: 1 });
      for (let i = 0; i < oldGroupRemaining.length; i++) {
        await LacquerPlan.findByIdAndUpdate(oldGroupRemaining[i]._id, { rowSeq: i + 1 });
      }
    }

    // Sync live PlainBottleStock deduction if coatingCompletedQty or coatedQty is updated
    if (req.body.coatingCompletedQty !== undefined || req.body.coatedQty !== undefined) {
      const newCoated = req.body.coatingCompletedQty !== undefined ? req.body.coatingCompletedQty : req.body.coatedQty;
      await syncLacquerPlanStockDeduction(plan, newCoated, req.user?._id);
    }


    await replayStockAllocations(
      plan.bottleName,
      plan.planDate,
      [plan.companyId, ...(plan.stockSources || [])],
      req.user?._id
    );

    // Auto-send or sync differences to Ready To Dispatch
    const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');
    await syncLacquerPlanReadyToDispatch(plan._id);

    // Sync live remaining plain stock across all same-day plans of this bottle
    const pBottle = (plan.plainBottle || plan.bottleName || '').trim();
    const pComp = plan.canonicalCompanyId || plan.companyId;
    if (pBottle && pComp && plan.planDate) {
      await syncSameDayPlansPlainStock(pBottle, pComp, plan.planDate, req.user?._id);
    }

    // Rule L4: If bottle changed on a saved row, recompute old bottle as well so usage moves cleanly
    if (oldBottleName && (oldBottleName.trim().toUpperCase() !== (plan.bottleName || '').trim().toUpperCase() || oldCompanyId?.toString() !== (plan.canonicalCompanyId || plan.companyId)?.toString())) {
      await syncSameDayPlansPlainStock(oldBottleName, oldCompanyId, plan.planDate, req.user?._id);
    }

    res.status(200).json({
      success: true,
      data: plan,
      printingSync: transactionResult.printingSyncResult?.leftUnlinkedCandidateCount > 0
        ? {
          adoptedPrintingPlanId: transactionResult.printingSyncResult.plan._id,
          leftUnlinkedCandidateCount: transactionResult.printingSyncResult.leftUnlinkedCandidateCount
        }
        : undefined
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete Plan
exports.deletePlan = async (req, res) => {
  try {
    const plan = await LacquerPlan.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Soft-delete the linked PrintingPlan
    await PrintingPlan.updateMany(
      { lacquerPlanId: plan._id, isDeleted: false },
      { $set: { isDeleted: true } }
    );

    // Renumber remaining rows in the group
    if (plan.groupKey) {
      const remaining = await LacquerPlan.find({ groupKey: plan.groupKey, isDeleted: false }).sort({ rowSeq: 1 });
      for (let i = 0; i < remaining.length; i++) {
        await LacquerPlan.findByIdAndUpdate(remaining[i]._id, { rowSeq: i + 1 });
      }
    }

    // Recompute and sync live remaining plain stock for remaining same-day plans
    const pBottle = (plan.plainBottle || plan.bottleName || '').trim();
    const pComp = plan.canonicalCompanyId || plan.companyId;
    if (pBottle && pComp && plan.planDate) {
      await syncSameDayPlansPlainStock(pBottle, pComp, plan.planDate, req.user?._id);
    } else {
      await recomputePlainStock(plan.bottleName, plan.canonicalCompanyId || plan.companyId, req.user?._id);
    }

    await replayStockAllocations(
      plan.bottleName,
      plan.planDate,
      [plan.companyId, ...(plan.stockSources || [])],
      req.user?._id
    );

    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get computed stats for frontend form
exports.getComputedStats = async (req, res) => {
  try {
    const { bottleName, brandId, colour, companyId, planDate, excludePlanIds } = req.query;
    let plainStock = 0;
    let openingStock = 0;
    let totalCoatedToday = 0;
    let coatedQty = 0;

    let effectiveCompanyId = companyId;
    if (!effectiveCompanyId && brandId) {
      const Brand = require("../models/Brand");
      const bDoc = await Brand.findById(brandId);
      if (bDoc && bDoc.companyId) {
        effectiveCompanyId = bDoc.companyId;
      }
    }

    let sourcesToQuery = [];
    if (req.query.stockSources) {
      sourcesToQuery = (Array.isArray(req.query.stockSources) ? req.query.stockSources : String(req.query.stockSources).split(',')).map(s => s.trim()).filter(Boolean);
    } else if (effectiveCompanyId) {
      sourcesToQuery = [effectiveCompanyId];
    }

    let sources = [];
    // 1. Fetch live day-based plain stock (Rule L3)
    let stockRes = null;
    if (bottleName) {
      const canonicalBottle = await resolveCanonicalPlainBottle(bottleName, effectiveCompanyId);
      stockRes = await computeLivePlainStock(canonicalBottle, sourcesToQuery, planDate, excludePlanIds);
      plainStock = stockRes.plainStock !== undefined ? stockRes.plainStock : Number(stockRes);
      openingStock = stockRes.openingStock !== undefined ? stockRes.openingStock : plainStock;
      totalCoatedToday = stockRes.sameDayCoated || 0;
      sources = stockRes.sources || [];
    }

    // 2. Fetch cumulative coatedQty
    if (bottleName && brandId && colour) {
      const BottleSpec = require("../models/Bottlespecs");
      let bSpecs = await BottleSpec.find({ bottleName: bottleName.trim(), isDeleted: false });

      if (!bSpecs || bSpecs.length === 0) {
        const BottlePerBox = require("../models/BottlePerBox");
        const bpb = await BottlePerBox.findOne({
          $or: [
            { plainBottleName: bottleName.trim() },
            { bottleName: bottleName.trim() },
            { bottleNames: bottleName.trim() }
          ],
          isDeleted: false
        });
        if (bpb && Array.isArray(bpb.bottleNames) && bpb.bottleNames.length > 0) {
          bSpecs = await BottleSpec.find({
            bottleName: { $in: bpb.bottleNames },
            isDeleted: false
          });
        }
      }

      if (bSpecs && bSpecs.length > 0) {
        const specIds = bSpecs.map(s => s._id);
        const coatingRecords = await CoatingProduction.find({
          coatingSpecId: { $in: specIds },
          brandId,
          coatingShade: colour,
          isDeleted: false
        });

        coatedQty = coatingRecords.reduce((sum, rec) => sum + (rec.actualQuantity || 0), 0);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        plainStock: Number(plainStock),
        openingStock: Number(openingStock),
        totalCoatedToday: Number(totalCoatedToday),
        coatedQty: Number(coatedQty),
        sources: sources || [],
        hasSuppliers: stockRes ? (stockRes.hasSuppliers || false) : false,
        eligibleSuppliers: stockRes ? (stockRes.eligibleSuppliers || []) : []
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const xlsx = require('xlsx');

// ============= ROW CLASSIFICATION SYSTEM =============
const ROW_CLASSIFICATION = {
  PLAN_ENTRY: 'PLAN_ENTRY',           // Genuine bottle plan row
  COMPANY_HEADER: 'COMPANY_HEADER',   // Company or section heading
  COLUMN_HEADER: 'COLUMN_HEADER',     // Table header
  TOTAL_ROW: 'TOTAL_ROW',             // Total or summary row
  SEPARATOR: 'SEPARATOR',              // Blank or formatting row
  OTHER: 'OTHER'                       // Unrelated worksheet content
};

// ============= IMPROVED HEADER DETECTION UTILITY =============
/**
 * Detects header row and builds column mapping for all 9 optional fields
 * Handles:
 * - English headers (Plain Stock, Bottle per box, Order Qty, etc.)
 * - Gujarati garbled headers (P[\IDKT, KLR, BNIVVINI[, etc.)
 * - Case-insensitive and encoding-resilient matching
 * - Fuzzy character matching for corrupted text
 */
function detectHeaderAndMapColumns(row) {
  if (!row || !Array.isArray(row)) return null;

  // ==================== PHASE 1: TRY GUJARATI DETECTION ====================
  const gujaratiHeaders = detectGujaratiHeaders(row);
  let colMap = {};
  let detectionMethod = 'fuzzy_fallback';
  let _gujaratiHeaders = {};

  if (Object.keys(gujaratiHeaders).length > 0) {
    const gujaratiColMap = buildColumnMapFromGujarati(gujaratiHeaders);
    colMap = { ...gujaratiColMap };
    _gujaratiHeaders = gujaratiHeaders;
    if (colMap.bottleName !== undefined) {
      detectionMethod = 'gujarati';
    }
  }

  // ==================== PHASE 2: FALLBACK TO FUZZY MATCHING ====================
  // Normalize header text for matching
  const normalize = (text) => {
    if (!text) return '';
    return String(text).trim().toUpperCase().replace(/\s+/g, ' ');
  };

  // Pattern definitions for each field
  // Support English, Unicode Gujarati, and Gujarati ASCII font representations
  const headerPatterns = {
    bottleName: [
      /p[\[\\]+idkt\s*nim/i,
      /p[\[\\]+idk?t/i,
      /પ્રોડક્ટ\s*નામ|પ્રોડક્ટ/i,
      /BOTTLE\s*NAME|PRODUCT\s*NAME|PRODUCT|BOTTLE/i
    ],
    variant: [
      /VARIANT|VARIENT|VAR/i
    ],
    coatingShade: [
      /^klr$/i,
      /^kvr$/i,
      /કવર|કલર|શેડ/i,
      /COATING\s*(DESCRIPTION|SHADE)?|SHADE|DESCRIPTION|COLOUR|COLOR/i
    ],
    brand: [
      /^BRAND$/i,
      /બ્રાન્ડ/i,
      /^COMPANY$/i
    ],
    process: [
      /p[\\(]+kyi/i,
      /P[\(\[]?KYI/i,
      /પ્રક્રિયા/i,
      /^PROCESS$/i
    ],
    plainStock: [
      /[¼l]\[?en\s*ATi\[?k/i,
      /[¼l]\[?en/i,
      /પ્લેઈન\s*સ્ટોક|પ્લેઈન/i,
      /PLAIN\s*STOCK|PLAIN\s*BOTTLE|^STOCK$/i
    ],
    orderQty: [
      /bnivvini\[\s*ai\[?D[<]?r/i,
      /bnivvini\[/i,
      /બનાવવાનો\s*ઓર્ડર/i,
      /ORDER\s*QTY|ORDER\s*QUANTITY|^ORDER$/i
    ],
    coatingCompletedQty: [
      /ki\[?T[)>]+g\s*Yy\[?l\s*mil/i,
      /ki\[?T[)>]+g/i,
      /કોટીંગ\s*થયેલ\s*માલ|કોટીંગ\s*થયેલ/i,
      /COATING\s*COMPLETED\s*QTY|COATING\s*COMPLETED|COATED\s*QTY|COATED|COMPLETED|DONE.?QTY/i
    ],
    stockUsedFrom: [
      /STOCK\s*USED\s*FROM|USED\s*FROM|STOCK\s*FROM/i
    ],
    balanceToMake: [
      /bnivvin\[?ibik\)\s*mil/i,
      /bnivvin\[?ibik\)/i,
      /બનાવવાનો\s*બાકી\s*માલ|બનાવવાનો\s*બાકી/i,
      /BALANCE\s*(STILL\s*TO\s*BE\s*)?MADE|BALANCE\s*TO\s*MAKE|STILL.*MAKE|^BALANCE$/i
    ],
    dispatchPendingQty: [
      /m\[?iklvin[&]?\s*bik\)\s*mil/i,
      /m\[?iklvin[&]?/i,
      /મોકલવાનું\s*બાકી\s*માલ|મોકલવાનું\s*બાકી/i,
      /\bDISPATCH\s*PENDING\s*QTY\b|\bDISPATCH\s*PENDING\b|\bDISPATCH\s*QTY\b|\bDISPATCH\s*BALANCE\b|^DISPATCH/i
    ],
    soldQty: [
      /v\[?c\[?l\s*mil/i,
      /v\[?c\[?l/i,
      /વેચેલ\s*માલ|વેચેલ/i,
      /\bSOLD\s*QTY\b|\bSOLD\s*QUANTITY\b|^SOLD\b/i
    ],
    boxQty: [
      /bi\[?ks\s*ni\s*p\)s/i,
      /બોક્સ\s*ના\s*પીસ|બોક્સ\s*દીઠ\s*બોટલ|બોક્સ\s*પીસ/i,
      /\bBOTTLE\s*PER\s*BOX\b|\bBOX\s*CONTENT\b|\bPER\s*BOX\b(?!\s*BOTTLE)/i
    ],
    noOfBoxes: [
      /ai\[?D[<]?r\s*bi\[?x/i,
      /ઓર્ડર\s*બોક્સ/i,
      /\bNO\.\s*OF\s*.*BOX|\bNUMBER\s*OF\s*.*BOX|\bORDER\s*BOX(ES)?\b/i
    ],
    remarks: [
      /r\)mi[<]?k/i,
      /રીમાર્ક|નોંધ/i,
      /^REMARK|^NOTE|^COMMENTS?|^COMMENT$/i
    ]
  };

  // First pass: look for bottle name column (must find this)
  let bottleColIdx = colMap.bottleName;
  if (bottleColIdx === undefined) {
    for (let colIdx = 0; colIdx < Math.min(row.length, 20); colIdx++) {
      const cell = row[colIdx];
      if (!cell) continue;
      const headerText = normalize(cell);
      if (!headerText) continue;

      for (const pattern of headerPatterns.bottleName) {
        if (pattern.test(cell) || pattern.test(headerText)) {
          bottleColIdx = colIdx;
          break;
        }
      }
      if (bottleColIdx !== undefined) break;
    }
  }

  if (bottleColIdx === undefined) {
    return null; // Not a valid header row - no bottle column
  }

  colMap.bottleName = bottleColIdx;

  // Prioritized field matching with conflict resolution
  const fieldPriority = [
    'coatingShade',
    'brand',
    'process',
    'plainStock',
    'orderQty',
    'coatingCompletedQty',
    'balanceToMake',
    'dispatchPendingQty',
    'soldQty',
    'boxQty',
    'noOfBoxes',
    'variant',
    'remarks',
    'stockUsedFrom'
  ];

  // Second pass: map all other fields using priority order
  for (const fieldName of fieldPriority) {
    if (colMap[fieldName] !== undefined) continue; // Already mapped

    const patterns = headerPatterns[fieldName];
    if (!patterns) continue;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      if (colIdx === bottleColIdx) continue; // Skip bottle column
      if (colMap[fieldName] !== undefined) continue; // Already mapped this field

      const cell = row[colIdx];
      if (!cell) continue;

      const headerText = normalize(cell);
      if (!headerText) continue;

      // Check if already mapped to another field
      if (Object.values(colMap).includes(colIdx)) continue;

      for (const pattern of patterns) {
        if (pattern.test(cell) || pattern.test(headerText)) {
          // Specific exclusion rules to prevent false positives
          if (fieldName === 'orderQty' && (headerText.includes('BOX') || headerText.includes('BI[X'))) continue;
          if (fieldName === 'boxQty' && (headerText.includes('ORDER') || headerText.includes('NO.') || headerText.includes('AI[D'))) continue;
          if (fieldName === 'noOfBoxes' && !headerText.includes('BOX') && !headerText.includes('BI[X') && !headerText.includes('બોક્સ')) continue;

          colMap[fieldName] = colIdx;
          break;
        }
      }
    }
  }

  return {
    ...colMap,
    _detectionMethod: detectionMethod,
    _gujaratiHeaders: _gujaratiHeaders,
    _timestamp: new Date().toISOString()
  };
}

/**
 * Enhanced total-row detection with multiple signals
 * Checks: text keywords, structure, quantity patterns, position
 */
function isTotalRow(row) {
  if (!row || !Array.isArray(row)) return false;

  const normalize = (text) => {
    if (!text) return '';
    return String(text).trim().toUpperCase();
  };

  const rowText = row.map(c => normalize(c)).join(' ');

  // Signal 1: Exact total keywords including Gujarati
  const totalKeywords = [
    'TOTAL', 'GRAND TOTAL', 'SUB TOTAL', 'SUBTOTAL',
    'TOTAL FOR', 'SUMMARY', 'GRAND SUM', 'SECTION TOTAL',
    'RUNNING TOTAL', 'FINAL TOTAL', 'CUMULATIVE TOTAL',
    'કુલ', 'સરવાળો'
  ];
  if (totalKeywords.some(kw => rowText.includes(kw))) {
    return true;
  }

  // Signal 2: Row contains mostly numbers in quantity columns (likely a total)
  // Count cells that look like quantities (numbers, possibly negative, possibly formulas)
  const numericCells = row.filter(c => {
    if (!c) return false;
    const str = String(c).trim();
    // Check if it looks like a formula or numeric value
    if (str.startsWith('=')) return true; // Formula
    const num = parseFloat(str);
    return !isNaN(num) && (num > 0 || num < 0);
  });

  // If we have 5+ numeric cells and very few text cells, likely a total
  const textCells = row.filter(c => {
    if (!c) return false;
    const str = normalize(c);
    // Real product names are usually longer words, not single numbers
    return str.length > 3 && !/^\d+$/.test(str) && !/^=.*/.test(str);
  });

  if (numericCells.length >= 2 && textCells.length === 0) {
    return true;
  }

  // Signal 3: First cell is empty but has many large numbers (total row pattern)
  const firstCell = String(row[0] || '').trim();
  if (!firstCell) {
    const largeNumbers = row.filter(c => {
      if (!c) return false;
      const num = parseFloat(c);
      return !isNaN(num) && num > 50000;
    });
    // If first cell is empty and we have 2+ large numbers, likely a total
    if (largeNumbers.length >= 2) {
      return true;
    }
  }

  // Signal 4: Detect merged header rows (all cells identical, like row ID repeated)
  // But be conservative - only if cells are very short and numeric
  const nonEmptyCells = row.filter(c => c);
  if (nonEmptyCells.length >= 3) {
    const firstNonEmpty = String(nonEmptyCells[0]).trim();
    const allIdentical = nonEmptyCells.every(c => String(c).trim() === firstNonEmpty);
    if (allIdentical) {
      // All cells are the same - check if it's a code/ID or actual content
      const firstNum = parseFloat(firstNonEmpty);
      const isNumericCode = !isNaN(firstNum) && firstNonEmpty.length <= 10 && /^\d+$/.test(firstNonEmpty);
      if (isNumericCode) {
        // Looks like a repeated ID code (like 46271, 46271, 46271...)
        return true;
      }
    }
  }

  return false;
}

/**
 * Classify a row into one of the defined row types
 * Returns { classification, companyName }
 */
function classifyRow(row, foundHeader) {
  if (!row || !Array.isArray(row) || row.every(c => !c)) {
    return { classification: ROW_CLASSIFICATION.SEPARATOR, companyName: null };
  }

  const normalize = (text) => {
    if (!text) return '';
    return String(text).trim().toUpperCase();
  };

  const firstCell = normalize(row[0]);

  // Check if it's a total/summary row FIRST (before other checks)
  if (isTotalRow(row)) {
    return { classification: ROW_CLASSIFICATION.TOTAL_ROW, companyName: null };
  }

  // Check for column header indicators
  const headerKeywords = ['NO.', 'PRODUCT', 'BOTTLE', 'COATING', 'BRAND', 'PROCESS', 'QTY', 'BOX', 'REMARK', 'IDKT', 'KLR', 'BNIVVINI', 'પ્લેઈન', 'બનાવવાનો', 'કોટીંગ', 'બોક્સ', 'પ્રક્રિયા', 'P\\(KYI', 'BI[KS'];
  const headerCount = headerKeywords.filter(kw => row.some(c => c && normalize(c).includes(kw))).length;
  if (headerCount >= 3) {
    return { classification: ROW_CLASSIFICATION.COLUMN_HEADER, companyName: null };
  }

  // Check if it's a company/section heading (merged cells - all non-empty are identical)
  const nonEmptyCells = row.filter(c => c);
  const uniqueValues = new Set(nonEmptyCells.map(c => normalize(c)));
  if (nonEmptyCells.length >= 3 && uniqueValues.size === 1) {
    const firstCell = String(nonEmptyCells[0]).trim();
    const upperFirstCell = firstCell.toUpperCase();

    // Check for generic titles that are NOT company names
    const genericTitles = [
      'LACQUER PLANT PLAN SHEET', 'PLAN SHEET', 'PRODUCTION PLAN', 'LACQUER PLAN',
      'DAILY PLAN', 'REPORT', 'DOCUMENT'
    ];

    if (genericTitles.includes(upperFirstCell) || upperFirstCell.startsWith('DATE:') || upperFirstCell.startsWith('MONTH:')) {
      return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
    }

    // Ignore numeric codes/IDs
    if (!isNaN(parseFloat(upperFirstCell)) && /^\d+$/.test(upperFirstCell)) {
      return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
    }

    let extractedName = firstCell;
    const match = firstCell.match(/\((.*?)\)/);
    if (match) {
      extractedName = match[1].trim();
    } else {
      // If it's a single keyword that we know is not a company, skip it
      const ignoreKeywords = ['PLAN', 'SHEET', 'LACQUER', 'PLANT', 'DATE', 'MONTH', 'TOTAL', 'SUMMARY'];
      if (ignoreKeywords.includes(upperFirstCell)) {
        return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
      }
    }

    return { classification: ROW_CLASSIFICATION.COMPANY_HEADER, companyName: extractedName };
  }

  // Check if it's a single-cell heading (worksheet title, date, etc.)
  if (nonEmptyCells.length === 1) {
    const firstCell = String(nonEmptyCells[0]).trim();
    const upperFirstCell = firstCell.toUpperCase();
    const match = firstCell.match(/\((.*?)\)/);
    if (match) {
      return { classification: ROW_CLASSIFICATION.COMPANY_HEADER, companyName: match[1].trim() };
    }
    const headingKeywords = ['PLAN SHEET', 'LACQUER PLANT', 'PLAN', 'SHEET', 'DATE', 'MONTH', 'YEAR', 'TOTAL', 'SUMMARY', 'NOTE', 'REMARK', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    if (!isNaN(Date.parse(firstCell))) {
      return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
    }
    if (headingKeywords.some(kw => upperFirstCell.includes(kw))) {
      return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
    }
    // If it doesn't match heading keywords, it might be a standalone unmerged company name like "MCNROE"
    if (upperFirstCell.length > 2 && isNaN(parseFloat(upperFirstCell))) {
      // Safe to assume it's a section header if it's a standalone text string
      return { classification: ROW_CLASSIFICATION.COMPANY_HEADER, companyName: firstCell };
    }
  }

  // Otherwise, classify as plan entry if we've found a header
  if (foundHeader) {
    return { classification: ROW_CLASSIFICATION.PLAN_ENTRY, companyName: null };
  }

  return { classification: ROW_CLASSIFICATION.OTHER, companyName: null };
}

/**
 * Helper: Parse numeric value from Excel cell
 * Handles numbers, strings that look like numbers, and null/undefined
 * Preserves negative values and decimals
 * 
 * @param {*} value - Value from Excel cell
 * @returns {number|null} - Parsed number or null
 */
function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // If it's already a number, return it
  if (typeof value === 'number') {
    return value;
  }

  // Try to parse as number
  const num = Number(value);
  if (!isNaN(num)) {
    return num;
  }

  return null;
}

exports.previewImportExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const Brand = require('../models/Brand');
    const BottleSpec = require('../models/Bottlespecs');
    require('../models/Variant');

    const xlsx = require('xlsx');
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const dateRegex = /^(\d{2})\.(\d{2})\.(\d{2})$/;

    const Variant = require('../models/Variant');
    const allVariants = await Variant.find({ isDeleted: { $ne: true } }).select('variantName coatingShade').lean();
    const masterShadesSet = new Set(allVariants.map(v => (v.coatingShade || '').trim().toUpperCase()).filter(Boolean));
    const masterVariantsSet = new Set(allVariants.map(v => (v.variantName || '').trim().toUpperCase()).filter(Boolean));
    const allBrands = await Brand.find({ isDeleted: { $ne: true } });
    const allBottles = await BottleSpec.find({ isDeleted: { $ne: true } }).populate('variantId').populate('brandId');
    const BottlePerBoxModel = require('../models/BottlePerBox');
    const allBottlePerBox = await BottlePerBoxModel.find({ isDeleted: { $ne: true } });

    const Company = require('../models/Company');
    const allCompanies = await Company.find({ isDeleted: { $ne: true } });

    const normalize = (text) => text ? String(text).trim().toUpperCase().replace(/\s+/g, '') : '';
    const normalizeBottle = (text) => {
      if (!text) return '';
      return String(text).toUpperCase().replace(/[\s\-+]+/g, '');
    };

    const brandMap = new Map();
    allBrands.forEach(b => brandMap.set(normalize(b.name), b));

    const companyAliasMap = {
      'PGP': 'PGPGLASS',
      'SFP2': 'SFP',
      'MCNROE': 'MCNORE' // common typo in master
    };

    const companyMap = new Map();
    allCompanies.forEach(c => companyMap.set(normalize(c.name), c));

    // ============ BOTTLEPERBOX MASTER MAPS ============
    // Map 1: Normalized -> Original (for matching)
    const masterBottlePerBoxNameMap = new Map();
    // Map 2: Normalized -> Quantity (for getting bottlePerBox quantity)
    const masterBottlePerBoxMap = new Map();
    const sortedMasterNames = [];

    allBottlePerBox.forEach(bp => {
      if (bp.bottleName) {
        const normalized = normalizeBottle(bp.bottleName);
        if (!masterBottlePerBoxNameMap.has(normalized)) {
          masterBottlePerBoxNameMap.set(normalized, bp.bottleName); // Original name
          sortedMasterNames.push(normalized);
        }
        masterBottlePerBoxMap.set(normalized, bp.bottlePerBox); // Quantity
      }
    });

    // Sort descending by length for longest-prefix-match
    sortedMasterNames.sort((a, b) => b.length - a.length);

    // HELPER: Match bottle name using BottlePerBox Master with longest-match-first prefix
    const matchBottleNameFromMaster = (excelText) => {
      if (!excelText) return { bottleName: null, variant: null, unmatchedText: null };
      const originalText = String(excelText).trim();
      const excelNorm = normalizeBottle(originalText);

      let validPairs = [];
      let longestPrefixMatch = null;
      let maxLength = -1;

      for (const masterNorm of sortedMasterNames) {
        if (excelNorm.startsWith(masterNorm)) {
          let originalIndex = 0;
          let normIndex = 0;
          while (originalIndex < originalText.length && normIndex < masterNorm.length) {
            const char = originalText[originalIndex];
            const upperChar = char.toUpperCase();
            if (upperChar >= 'A' && upperChar <= 'Z' || upperChar >= '0' && upperChar <= '9') {
              normIndex++;
            }
            originalIndex++;
          }

          let remainingText = originalText.substring(originalIndex).trim();
          remainingText = remainingText.replace(/^[-+]\s*/, '').trim();
          const upperRemaining = remainingText.toUpperCase();

          if (remainingText === '' || masterShadesSet.has(upperRemaining) || masterVariantsSet.has(upperRemaining)) {
            validPairs.push({ bottleName: masterBottlePerBoxNameMap.get(masterNorm), variant: remainingText || null, unmatchedText: null, normLen: masterNorm.length });
          }

          if (masterNorm.length > maxLength) {
            maxLength = masterNorm.length;
            longestPrefixMatch = { bottleName: masterBottlePerBoxNameMap.get(masterNorm), variant: remainingText || null, unmatchedText: null };
          }
        }
      }

      if (validPairs.length > 0) {
        validPairs.sort((a, b) => b.normLen - a.normLen);
        return { bottleName: validPairs[0].bottleName, variant: validPairs[0].variant, unmatchedText: null };
      }

      if (longestPrefixMatch) {
        return longestPrefixMatch;
      }

      return { bottleName: null, variant: null, unmatchedText: excelText };
    };

    const bottleExactMap = new Map();
    const bottleWithVariantMap = new Map();

    allBottles.forEach(b => {
      const bName = normalizeBottle(b.bottleName);
      if (!bottleExactMap.has(bName)) bottleExactMap.set(bName, []);
      bottleExactMap.get(bName).push(b);

      if (b.variantId && b.variantId.variantName) {
        const vName = normalizeBottle(b.variantId.variantName);
        bottleWithVariantMap.set(`${bName}|${vName}`, b);
      }
    });

    const result = {
      detectedSheets: 0,
      totalRows: 0,
      validRows: 0,
      dates: []
    };

    const resolveBrandKey = buildBrandResolver(allBrands);
    const resolveVariantKey = buildVariantResolver(allVariants);
    const completedInBatch = new Set();

    const validDateSheets = workbook.SheetNames
      .map(sheetName => {
        const match = sheetName.match(dateRegex);
        if (!match) return null;
        const [_, dd, mm, yy] = match;
        const planDateStr = `20${yy}-${mm}-${dd}`;
        return { sheetName, planDateStr, dateObj: new Date(planDateStr) };
      })
      .filter(Boolean)
      .sort((a, b) => a.dateObj - b.dateObj);

    for (const sheetInfo of validDateSheets) {
      const { sheetName, planDateStr } = sheetInfo;
      result.detectedSheets++;

      const completedSetForDate = await getCompletedCombinationsSet(planDateStr, resolveBrandKey, resolveVariantKey, false);
      const sentSetForDate = await getSentToDispatchCombinationsSet(planDateStr, resolveBrandKey, resolveVariantKey, false);
      for (const k of completedInBatch) {
        completedSetForDate.add(k);
      }
      const dateSkippedCompletedRows = [];
      const dateSkippedSentRows = [];

      const sheet = workbook.Sheets[sheetName];

      // 1. Parse sheet to array of arrays
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });

      // 2. Direct robust fill of merged cells from top-left cell across full merge range
      if (sheet['!merges']) {
        sheet['!merges'].forEach(merge => {
          const startRow = merge.s.r;
          const endRow = merge.e.r;
          const startCol = merge.s.c;
          const endCol = merge.e.c;
          const topVal = (data[startRow] && data[startRow][startCol] !== undefined) ? data[startRow][startCol] : null;
          if (topVal !== null && topVal !== undefined && topVal !== '') {
            for (let r = startRow; r <= endRow; r++) {
              if (!data[r]) data[r] = [];
              for (let c = startCol; c <= endCol; c++) {
                if ((r !== startRow || c !== startCol) && (data[r][c] === null || data[r][c] === undefined || data[r][c] === '')) {
                  data[r][c] = topVal;
                }
              }
            }
          }
        });
      }

      let foundHeader = false;
      let colMap = {};

      let dateTotalRows = 0;
      let dateValidRows = 0;
      let dateInvalidRows = 0;
      let invalidReasons = {};
      let dateRows = [];  // Initialize array for storing parsed rows

      let currentGroupEndRow = -1;
      let currentActiveBottle = "";
      let currentActiveBottlePerBox = null;
      let currentActiveProcess = "";
      let currentActivePlainStock = null;
      let currentCompanyName = null;  // MAIN STATE: Track active company

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const excelRowNumber = i + 1;

        // Classify the row
        const { classification, companyName: headingCompanyName } = classifyRow(row, foundHeader);

        // Handle company headers - update active company state
        if (classification === ROW_CLASSIFICATION.COMPANY_HEADER) {
          currentCompanyName = headingCompanyName;
          // Reset group state on new company
          currentGroupEndRow = -1;
          currentActiveBottle = "";
          currentActiveBottlePerBox = null;
          currentActiveProcess = "";
          currentActivePlainStock = null;
          continue; // Skip the heading row itself
        }

        // Skip non-plan rows
        if (classification === ROW_CLASSIFICATION.SEPARATOR ||
          classification === ROW_CLASSIFICATION.OTHER) {
          continue;
        }

        // Handle column headers
        if (classification === ROW_CLASSIFICATION.COLUMN_HEADER) {
          const newColMap = detectHeaderAndMapColumns(row);
          if (newColMap !== null) {
            foundHeader = true;
            colMap = newColMap;
            // Reset state when header repeats (often means new section)
            currentGroupEndRow = -1;
            currentActiveBottle = "";
            currentActiveBottlePerBox = null;
            currentActiveProcess = "";
            currentActivePlainStock = null;
          }
          continue;
        }

        // Skip total rows completely - don't count them
        if (classification === ROW_CLASSIFICATION.TOTAL_ROW) {
          continue;
        }

        if (!foundHeader) {
          continue; // Skip until we find the first header
        }

        // At this point, we have a PLAN_ENTRY row
        // Extract data directly from the array (already properly formatted)
        // Helper to resolve merged cells dynamically
        const getMergedValue = (propKey) => {
          const colIndex = colMap[propKey];
          if (colIndex === undefined || colIndex === null) return null;

          if (row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
            return row[colIndex];
          }

          if (sheet['!merges']) {
            for (let merge of sheet['!merges']) {
              if (colIndex >= merge.s.c && colIndex <= merge.e.c) {
                if (i >= merge.s.r && i <= merge.e.r) {
                  if (data[merge.s.r] && data[merge.s.r][merge.s.c] !== undefined && data[merge.s.r][merge.s.c] !== null) {
                    const val = String(data[merge.s.r][merge.s.c]).trim();
                    return val !== '' ? val : null;
                  }
                }
              }
            }
          }
          return null;
        };

        // Normalize text fields
        const rawBottle = getMergedValue('bottleName') ? String(getMergedValue('bottleName')).trim() : "";
        const rawVariant = getMergedValue('variant') ? String(getMergedValue('variant')).trim() : "";
        const rawCoating = getMergedValue('coatingShade') ? String(getMergedValue('coatingShade')).trim() : "";
        const rawProcess = getMergedValue('process') ? String(getMergedValue('process')).trim() : "";
        const rawBrand = getMergedValue('brand') ? String(getMergedValue('brand')).trim() : "";
        const rawRemarks = getMergedValue('remarks') ? String(getMergedValue('remarks')).trim() : "";

        // Get numeric values - parse them from the array values
        const rawOrderQty = parseNumericValue(getMergedValue('orderQty'));
        const rawBottlePerBox = parseNumericValue(getMergedValue('boxQty'));
        const rawOrderBoxes = parseNumericValue(getMergedValue('noOfBoxes'));
        const rawBalanceToMake = parseNumericValue(getMergedValue('balanceToMake'));
        const rawDispatchPending = parseNumericValue(getMergedValue('dispatchPendingQty'));
        const rawSoldQty = parseNumericValue(getMergedValue('soldQty'));
        const rawPlainStock = parseNumericValue(getMergedValue('plainStock'));

        // Coating Completed Qty validation: blank means 0, non-numeric is invalid
        const rawCoatingVal = getMergedValue('coatingCompletedQty');
        let rawCoatingCompleted = 0;
        let coatingInvalidError = null;
        if (rawCoatingVal !== null && rawCoatingVal !== undefined && String(rawCoatingVal).trim() !== '') {
          const num = Number(rawCoatingVal);
          if (isNaN(num) || !Number.isFinite(num)) {
            coatingInvalidError = `Row ${excelRowNumber}: Invalid non-numeric Coating Completed Qty value "${rawCoatingVal}"`;
          } else if (num < 0) {
            coatingInvalidError = `Row ${excelRowNumber}: Coating Completed Qty cannot be negative (${num})`;
          } else {
            rawCoatingCompleted = Math.round(num);
          }
        }

        // Skip rows with no meaningful data - must have either bottle name or multiple quantities
        const hasBottle = !!rawBottle;
        const quantityCount = [rawOrderQty, rawBottlePerBox, rawOrderBoxes, rawCoatingCompleted, rawBalanceToMake, rawDispatchPending, rawSoldQty, rawPlainStock]
          .filter(v => v !== null && v !== undefined && v !== '').length;

        if (!hasBottle && quantityCount === 0) {
          continue; // Completely empty row
        }

        // Validate Bottle per Box: must never be negative or 0
        if (typeof rawBottlePerBox === 'number' && rawBottlePerBox <= 0) {
          rawBottlePerBox = null;
        }

        let isNewGroup = false;
        if (i <= currentGroupEndRow) {
          isNewGroup = false;
        } else {
          if (rawBottle || rawProcess || rawPlainStock !== null || rawBottlePerBox !== null) {
            isNewGroup = true;
          } else {
            isNewGroup = false;
          }
        }

        if (isNewGroup) {
          let maxEndRow = i;
          if (sheet['!merges']) {
            sheet['!merges'].forEach(merge => {
              if (merge.s.r === i) {
                if (merge.e.r > maxEndRow) maxEndRow = merge.e.r;
              }
            });
          }
          currentGroupEndRow = maxEndRow;
        }

        // Apply fallback to group-level values if this row is part of a group but missing values
        let finalPlainStock = rawPlainStock;
        let finalBoxQty = rawBottlePerBox;
        let effectiveProcess = rawProcess;

        if (!isNewGroup) {
          if (finalPlainStock === null || finalPlainStock === undefined || finalPlainStock === '') {
            finalPlainStock = currentActivePlainStock;
          }
          if (finalBoxQty === null || finalBoxQty === undefined || finalBoxQty === '') {
            finalBoxQty = currentActiveBottlePerBox;
          }
          if (!effectiveProcess) {
            effectiveProcess = currentActiveProcess;
          }
        }

        let finalOrderQty = rawOrderQty;
        let finalOrderBoxes = rawOrderBoxes;
        let finalCoatingCompleted = rawCoatingCompleted;
        let finalDispatchPending = rawDispatchPending;
        let finalSoldQty = rawSoldQty;

        // Balance to Make: business logic is Balance to Make = Coating Completed Qty - Order Qty
        // (Negative means pending balance to make, 0 means completed, positive means over-fulfilled)
        let finalBalanceToMake = null;
        if (finalOrderQty !== null && finalOrderQty !== undefined) {
          const coated = (finalCoatingCompleted !== null && finalCoatingCompleted !== undefined) ? finalCoatingCompleted : 0;
          finalBalanceToMake = coated - finalOrderQty;
        } else if (rawBalanceToMake !== null && rawBalanceToMake !== undefined) {
          finalBalanceToMake = rawBalanceToMake;
        }

        // Validate Bottle per Box: must never be negative or 0
        if (typeof finalBoxQty === 'number' && finalBoxQty <= 0) {
          finalBoxQty = null;
        }

        let parsedBottleName = currentActiveBottle;
        let parsedVariantName = rawVariant || "";

        if (isNewGroup) {
          // First row of a new bottle group: establish the group state
          currentActiveBottlePerBox = (typeof finalBoxQty === 'number' && finalBoxQty > 0) ? finalBoxQty : null;
          currentActiveProcess = effectiveProcess || "";
          currentActivePlainStock = finalPlainStock;

          // Try to match bottle name using BottlePerBox Master
          const bottleMatch = matchBottleNameFromMaster(rawBottle);

          if (bottleMatch && bottleMatch.bottleName) {
            // Found a master match
            parsedBottleName = bottleMatch.bottleName;
            parsedVariantName = rawVariant || bottleMatch.variant || "";
          } else {
            // No master match - use raw value as-is for now (will be marked as unmatched during validation)
            parsedBottleName = rawBottle;
            parsedVariantName = rawVariant || "";
          }

          currentActiveBottle = parsedBottleName;
        } else {
          // Continuation row under same bottle: use context bottle name
          parsedBottleName = currentActiveBottle;

          // If no explicit variant column but this row has a value in bottle column, treat it as variant
          // This handles rows like "REVOLVER", "OUD", "SNAKE" that should be variants of the active bottle
          if (!rawVariant && rawBottle && rawBottle !== currentActiveBottle) {
            parsedVariantName = rawBottle;
          } else if (rawVariant) {
            parsedVariantName = rawVariant;
          }
        }

        // Master data fallback for Bottle per Box - only if absent and strictly positive
        if (finalBoxQty === null && parsedBottleName) {
          const bNorm = normalizeBottle(parsedBottleName);
          if (masterBottlePerBoxMap.has(bNorm)) {
            const mQty = masterBottlePerBoxMap.get(bNorm);
            if (typeof mQty === 'number' && mQty > 0) {
              finalBoxQty = mQty;
            }
          }
        }

        // Parse Order Qty
        const orderQtyVal = finalOrderQty;

        // Look up bottle and variant in master data
        let foundMatch = null;
        let variantId = null;

        if (parsedBottleName) {
          const bNorm = normalizeBottle(parsedBottleName);
          const vNorm = normalizeBottle(parsedVariantName);

          if (vNorm && bottleWithVariantMap.has(`${bNorm}|${vNorm}`)) {
            foundMatch = bottleWithVariantMap.get(`${bNorm}|${vNorm}`);
            variantId = foundMatch.variantId._id;
          } else if (vNorm) {
            const possibleBottles = bottleExactMap.get(bNorm) || [];
            for (const b of possibleBottles) {
              if (b.variantId && b.variantId.variantName) {
                const dbVName = normalizeBottle(b.variantId.variantName);
                if (dbVName === vNorm) {
                  foundMatch = b;
                  variantId = b.variantId._id;
                  break;
                }
              }
            }
          }

          if (!foundMatch && bottleExactMap.has(bNorm)) {
            foundMatch = bottleExactMap.get(bNorm)[0];
          }
        }

        let brandId = null;
        if (rawBrand) {
          const normBrand = normalize(rawBrand);
          if (brandMap.has(normBrand)) {
            brandId = brandMap.get(normBrand)._id;
          } else if (foundMatch && foundMatch.brandId && normalize(foundMatch.brandId.name) === normBrand) {
            brandId = foundMatch.brandId._id;
          }
        }

        const parsedRow = {
          excelRowNumber,
          planDate: planDateStr,
          bottleNameRaw: rawBottle,
          bottleName: parsedBottleName,
          bottleFromMaster: masterBottlePerBoxNameMap.has(normalizeBottle(parsedBottleName)) || false,
          variantId: variantId,
          variantName: parsedVariantName,
          ...(() => {
            let cId = null;
            let cName = currentCompanyName || null;
            if (currentCompanyName) {
              let norm = normalize(currentCompanyName);
              if (companyAliasMap[norm]) norm = companyAliasMap[norm];
              if (companyMap.has(norm)) {
                const comp = companyMap.get(norm);
                cId = comp._id;
                cName = comp.name; // Canonical name
              }
            }
            return { companyId: cId, companyName: cName };
          })(),
          coatingShade: rawCoating,
          brandName: rawBrand,
          brandId: brandId,
          process: effectiveProcess,
          orderQty: finalOrderQty,
          boxQty: finalBoxQty,
          noOfBoxes: finalOrderBoxes,
          coatingCompletedQty: finalCoatingCompleted,
          balanceToMake: finalBalanceToMake,
          dispatchPendingQty: finalDispatchPending,
          soldQty: finalSoldQty,
          plainStock: finalPlainStock,
          remarks: rawRemarks,

          // Source tracking for imported values
          _importSource: {
            detectionMethod: colMap._detectionMethod || 'unknown',
            gujaratiHeaders: colMap._gujaratiHeaders || null,
            timestamp: colMap._timestamp || null,
            valueFromMerge: {}  // Merge metadata not available with direct array extraction
          },

          isValid: true,
          errors: [],

          // Group metadata
          isGroupStart: isNewGroup
        };

        if (coatingInvalidError) {
          parsedRow.errors.push(coatingInvalidError);
          parsedRow.isValid = false;
        }

        // Parse Stock Used From column
        const rawStockUsedFrom = getMergedValue('stockUsedFrom');
        let parsedSplit = [];
        let stockFromError = null;

        if (rawStockUsedFrom && String(rawStockUsedFrom).trim() !== '') {
          const splitParts = String(rawStockUsedFrom).split(';').map(p => p.trim()).filter(Boolean);
          let splitSum = 0;
          for (const part of splitParts) {
            const m = part.match(/^(.*?)\s*[:=-]?\s*(\d+)$/);
            if (!m) {
              stockFromError = `Row ${excelRowNumber}: Invalid Stock Used From entry "${part}". Expected format: CompanyName Qty (e.g. TPP 500; Shayona 500)`;
              break;
            }
            const compPartName = m[1].trim();
            const compPartQty = parseInt(m[2], 10);
            if (isNaN(compPartQty) || compPartQty <= 0) {
              stockFromError = `Row ${excelRowNumber}: Stock Used From quantity must be a positive integer (${part})`;
              break;
            }

            let normPartComp = normalize(compPartName);
            if (companyAliasMap[normPartComp]) normPartComp = companyAliasMap[normPartComp];
            const foundComp = companyMap.get(normPartComp);
            if (!foundComp) {
              stockFromError = `Row ${excelRowNumber}: Company "${compPartName}" in Stock Used From not found in company master`;
              break;
            }

            const ownCompIdStr = parsedRow.companyId ? parsedRow.companyId.toString() : '';
            const partCompIdStr = foundComp._id.toString();
            const isOwn = partCompIdStr === ownCompIdStr;
            const isStockSupplier = foundComp.isStockSupplier === true;

            if (!isOwn && !isStockSupplier) {
              stockFromError = `Row ${excelRowNumber}: Company "${foundComp.name}" is not a stock supplier and not the plan's company`;
              break;
            }

            parsedSplit.push({
              companyId: foundComp._id,
              companyName: foundComp.name,
              qty: compPartQty
            });
            splitSum += compPartQty;
          }

          if (!stockFromError) {
            if (splitSum !== finalCoatingCompleted) {
              stockFromError = `Row ${excelRowNumber}: Stock Used From split sum (${splitSum}) must equal Coating Completed Qty (${finalCoatingCompleted})`;
            }
          }
        }

        if (stockFromError) {
          parsedRow.errors.push(stockFromError);
          parsedRow.isValid = false;
          parsedRow.stockAllocation = [];
          parsedRow.stockSources = parsedRow.companyId ? [parsedRow.companyId] : [];
        } else if (parsedSplit.length > 0) {
          parsedRow.stockAllocation = parsedSplit.map(a => ({ companyId: a.companyId, qty: a.qty }));
          parsedRow.stockSources = Array.from(new Set(parsedSplit.map(a => a.companyId.toString()))).map(id => new mongoose.Types.ObjectId(id));
        } else {
          // Without column (old sheets) or empty: own company is used
          if (finalCoatingCompleted > 0 && parsedRow.companyId) {
            parsedRow.stockAllocation = [{ companyId: parsedRow.companyId, qty: finalCoatingCompleted }];
            parsedRow.stockSources = [parsedRow.companyId];
          } else {
            parsedRow.stockAllocation = [];
            parsedRow.stockSources = parsedRow.companyId ? [parsedRow.companyId] : [];
          }
        }

        // Column shift sanity checks
        if (typeof rawBottlePerBox === 'number' && rawBottlePerBox < 0) {
          parsedRow.errors.push(`COLUMN SHIFT DETECTED: Bottle Per Box cannot be negative (${rawBottlePerBox})`);
          parsedRow.isValid = false;
        }

        // Validation: Bottle Name is required
        if (!parsedRow.bottleName) {
          parsedRow.errors.push("MISSING BOTTLE NAME");
          parsedRow.isValid = false;
        } else if (!parsedRow.bottleFromMaster) {
          // Bottle name provided but not found in master - warn but don't mark invalid
          parsedRow.errors.push(`UNMATCHED BOTTLE NAME: "${parsedBottleName}" not found in Bottle Per Box Master`);
        }

        // Company Status
        if (!parsedRow.companyId) {
          parsedRow.companyStatus = 'UNASSIGNED';
          parsedRow.originalCompanyName = currentCompanyName;
          parsedRow.companyName = currentCompanyName;
        } else {
          parsedRow.companyStatus = 'RESOLVED';
          parsedRow.originalCompanyName = currentCompanyName;
        }

        // Skip rows that are already completed (Balance to Make <= 0 / Coating Completed >= Order Qty)
        const rowKeys = getPlanCombinationKeys(parsedRow, resolveBrandKey, resolveVariantKey);
        const isSelfCompleted = isPlanRowCompleted(parsedRow);
        const isAlreadyCompleted = (rowKeys.length > 0 && rowKeys.some(k => completedSetForDate.has(k))) || isSelfCompleted;

        if (isAlreadyCompleted) {
          rowKeys.forEach(k => {
            completedSetForDate.add(k);
            completedInBatch.add(k);
          });
          dateSkippedCompletedRows.push({
            excelRowNumber,
            bottleName: parsedRow.bottleName,
            brandName: parsedRow.brandName,
            coatingShade: parsedRow.coatingShade,
            variantName: parsedRow.variantName,
            process: parsedRow.process,
            orderQty: parsedRow.orderQty,
            coatingCompletedQty: parsedRow.coatingCompletedQty,
            balanceToMake: parsedRow.balanceToMake,
            reason: isSelfCompleted
              ? 'Row completed in sheet (Balance to Make <= 0 / Coating Completed >= Order Qty)'
              : 'Previously completed in prior plan (Balance to Make <= 0). Skipped.'
          });
          continue; // Skip already completed combination entirely
        }

        // Skip rows that have been sent to Ready To Dispatch (regardless of quantity or completion status)
        const isAlreadySent = rowKeys.length > 0 && rowKeys.some(k => sentSetForDate.has(k));

        if (isAlreadySent) {
          dateSkippedSentRows.push({
            excelRowNumber,
            bottleName: parsedRow.bottleName,
            brandName: parsedRow.brandName,
            coatingShade: parsedRow.coatingShade,
            variantName: parsedRow.variantName,
            process: parsedRow.process,
            orderQty: parsedRow.orderQty,
            coatingCompletedQty: parsedRow.coatingCompletedQty,
            balanceToMake: parsedRow.balanceToMake,
            reason: 'Sent to Ready To Dispatch. Skipped.'
          });
          continue; // Skip sent rows entirely
        }

        dateTotalRows++;
        result.totalRows++;
        if (parsedRow.isValid) {
          dateValidRows++;
          result.validRows++;
        } else {
          dateInvalidRows++;
          parsedRow.errors.forEach(err => {
            invalidReasons[err] = (invalidReasons[err] || 0) + 1;
          });
        }

        // Preserve Coating Completed Qty & Balance to Make
        parsedRow.coatingCompletedQty = finalCoatingCompleted;
        parsedRow.coatedQty = finalCoatingCompleted;
        parsedRow.balanceToMake = finalBalanceToMake;

        dateRows.push(parsedRow);
      }

      // Calculate grouping metadata for UI rendering on remaining non-skipped rows
      let currentGroupKey = null;
      let currentGroupId = null;
      let currentGroupStartIndex = -1;

      for (let i = 0; i < dateRows.length; i++) {
        const row = dateRows[i];
        const groupKey = `${row.companyName || 'unknown'}|${row.bottleName || ''}`;
        if (groupKey !== currentGroupKey) {
          // Finish previous group
          if (currentGroupStartIndex !== -1) {
            const size = i - currentGroupStartIndex;
            for (let j = currentGroupStartIndex; j < i; j++) {
              dateRows[j].groupSize = size;
            }
          }
          row.isGroupStart = true;
          currentGroupKey = groupKey;
          currentGroupId = `group-${row.companyName || 'unknown'}-${row.bottleName}-${i}`;
          currentGroupStartIndex = i;
        } else {
          row.isGroupStart = false;
        }

        row.groupId = currentGroupId;
        row.groupIndex = i - currentGroupStartIndex;
      }
      // Finish last group
      if (currentGroupStartIndex !== -1) {
        const size = dateRows.length - currentGroupStartIndex;
        for (let j = currentGroupStartIndex; j < dateRows.length; j++) {
          dateRows[j].groupSize = size;
        }
      }

      result.dates.push({
        date: planDateStr,
        totalRows: dateTotalRows,
        validRows: dateValidRows,
        invalidRows: dateInvalidRows,
        invalidReasons,
        skippedCompletedCount: dateSkippedCompletedRows.length,
        skippedCompletedRows: dateSkippedCompletedRows,
        skippedSentCount: dateSkippedSentRows.length,
        skippedSentRows: dateSkippedSentRows,
        rows: dateRows
      });
    }

    result.dates.sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const d of result.dates) {
      const start = new Date(d.date); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(d.date); end.setUTCHours(23, 59, 59, 999);
      const existingCount = await require('../models/LacquerPlan').countDocuments({ planDate: { $gte: start, $lte: end }, isDeleted: false });
      d.existingCount = existingCount;

      // Validate sheet coated quantities against available plain stock per source
      const bottleGroupsMap = new Map();
      for (const row of d.rows) {
        if (!row.isValid || !row.bottleName || !row.companyId) continue;
        const bKey = normalizeBottle(row.bottleName);
        if (!bottleGroupsMap.has(bKey)) {
          bottleGroupsMap.set(bKey, []);
        }
        bottleGroupsMap.get(bKey).push(row);
      }

      for (const [bKey, groupRows] of bottleGroupsMap.entries()) {
        const firstRow = groupRows[0];
        const allSourcesSet = new Set();
        groupRows.forEach(r => {
          (r.stockSources || []).forEach(s => allSourcesSet.add((s._id || s).toString()));
          if (r.companyId) allSourcesSet.add(r.companyId.toString());
        });
        const sourceIds = Array.from(allSourcesSet);

        try {
          const canonicalBottle = await resolveCanonicalPlainBottle(firstRow.bottleName, firstRow.companyId);
          const stockRes = await computeLivePlainStock(canonicalBottle, sourceIds, d.date);
          const availMap = new Map();
          const nameMap = new Map();
          (stockRes.sources || []).forEach(s => {
            const sid = s.companyId ? s.companyId.toString() : '';
            availMap.set(sid, Number(s.available) || 0);
            nameMap.set(sid, s.companyName || 'Source');
          });

          // Check each row's allocation against remaining available
          for (const row of groupRows) {
            if (!row.isValid || !Array.isArray(row.stockAllocation) || row.stockAllocation.length === 0) continue;
            let exceedsSource = null;
            for (const alloc of row.stockAllocation) {
              const cid = (alloc.companyId?._id || alloc.companyId)?.toString();
              const avail = availMap.get(cid) ?? 0;
              if (alloc.qty > avail) {
                exceedsSource = {
                  name: nameMap.get(cid) || 'Source',
                  avail,
                  requested: alloc.qty
                };
                break;
              }
            }

            if (exceedsSource) {
              row.isValid = false;
              const errMsg = `Row ${row.excelRowNumber}: Coated quantity (${exceedsSource.requested}) exceeds available plain stock for ${exceedsSource.name} (${exceedsSource.avail} available)`;
              row.errors.push(errMsg);
              d.invalidReasons[errMsg] = (d.invalidReasons[errMsg] || 0) + 1;
              d.validRows--;
              d.invalidRows++;
              result.validRows--;
              result.invalidRows = (result.invalidRows || 0) + 1;
            } else {
              for (const alloc of row.stockAllocation) {
                const cid = (alloc.companyId?._id || alloc.companyId)?.toString();
                availMap.set(cid, (availMap.get(cid) || 0) - alloc.qty);
              }
            }
          }
        } catch (poolErr) {
          console.error('Error validating pool stock for import preview:', poolErr);
        }
      }

      // Calculate stock warnings for each row
      d.okStockRows = [];
      d.warningStockRows = [];
      d.stockWarnings = [];

      for (const row of d.rows) {
        if (!row.isValid || !row.bottleName || !row.companyId || !row.orderQty) {
          continue; // Skip invalid rows
        }

        try {
          const warning = await validateRowStockWarning(
            row.bottleName,
            row.companyId,
            row.orderQty,
            null,
            d.date
          );

          if (warning.hasWarning) {
            d.warningStockRows.push(row);
            d.stockWarnings.push({
              excelRowNumber: row.excelRowNumber,
              bottleName: row.bottleName,
              orderQty: warning.orderQty,
              availableStock: warning.availableStock,
              overBy: warning.overBy,
              details: warning.details
            });
          } else {
            d.okStockRows.push(row);
          }
        } catch (err) {
          console.error(`Stock warning calculation error for row ${row.excelRowNumber}:`, err);
          // If error, treat as OK to allow import to proceed
          d.okStockRows.push(row);
        }
      }
    }

    // Add display column names and verification metadata
    result.displayColumns = DISPLAY_COLUMN_NAMES;
    result.verificationReport = generatePreviewValidationReport(result);

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    require('fs').writeFileSync('import_error.log', error.stack || error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.commitImportExcel = async (req, res) => {
  try {
    const { datesToImport } = req.body;

    if (!datesToImport || !Array.isArray(datesToImport)) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const importedResults = [];
    let totalImported = 0;
    const importBatchId = `batch-${Date.now()}`;
    const allBrands = await Brand.find({ isDeleted: { $ne: true } }).lean();
    const allVariants = await Variant.find({ isDeleted: { $ne: true } }).lean();
    const resolveBrandKey = buildBrandResolver(allBrands);
    const resolveVariantKey = buildVariantResolver(allVariants);
    const completedInCommitBatch = new Set();

    for (const item of datesToImport) {
      const { date, rows, replaceExisting, stockWarningOverrides } = item;

      const startOfDay = new Date(date); startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(date); endOfDay.setUTCHours(23, 59, 59, 999);

      if (replaceExisting) {
        const existingPlansToReplace = await LacquerPlan.find({
          planDate: { $gte: startOfDay, $lte: endOfDay },
          isDeleted: false
        });
        for (const oldPlan of existingPlansToReplace) {
          await revertLacquerPlanStockDeduction(oldPlan, req.user?._id);
        }
        const oldIds = existingPlansToReplace.map(p => p._id);
        if (oldIds.length > 0) {
          await PrintingPlan.updateMany(
            { lacquerPlanId: { $in: oldIds }, isDeleted: false },
            { $set: { isDeleted: true } }
          );
        }
        await LacquerPlan.updateMany(
          { planDate: { $gte: startOfDay, $lte: endOfDay }, isDeleted: false },
          { $set: { isDeleted: true, appliedStockDeduction: 0 } }
        );
      }

      const completedSetForDate = await getCompletedCombinationsSet(date, resolveBrandKey, resolveVariantKey, false);
      const sentSetForDate = await getSentToDispatchCombinationsSet(date, resolveBrandKey, resolveVariantKey, false);
      for (const k of completedInCommitBatch) {
        completedSetForDate.add(k);
      }

      const validRows = rows.filter(r => r.isValid);
      const toInsertRows = validRows.filter(r => {
        const rowKeys = getPlanCombinationKeys(r, resolveBrandKey, resolveVariantKey);
        const isSelfCompleted = isPlanRowCompleted(r);
        const isAlreadyCompleted = (rowKeys.length > 0 && rowKeys.some(k => completedSetForDate.has(k))) || isSelfCompleted;
        if (isAlreadyCompleted) {
          rowKeys.forEach(k => {
            completedSetForDate.add(k);
            completedInCommitBatch.add(k);
          });
          return false; // Skip already completed combination
        }

        // Skip rows that have been sent to Ready To Dispatch (regardless of quantity or completion status)
        const isAlreadySent = rowKeys.length > 0 && rowKeys.some(k => sentSetForDate.has(k));
        if (isAlreadySent) {
          return false; // Skip sent rows
        }

        // Check if row has stock warning and no override
        if (stockWarningOverrides && !stockWarningOverrides[r.excelRowNumber]) {
          // If stockWarningOverrides is provided and this row is NOT in it, skip this row (it was not overridden)
          // But only if the row is marked with a warning
          // Since we don't have warning info here, we need to check in previewImportExcel output
          // For now, we assume if it's in the request, we check it
          return true; // Include for now, will be checked below
        }

        return true;
      });

      // Fetch existing plans on this date to match rows by (company, brand, plain bottle, variant, shade, process)
      const existingPlansOnDate = !replaceExisting ? await LacquerPlan.find({
        planDate: { $gte: startOfDay, $lte: endOfDay },
        isDeleted: false
      }) : [];

      const normText = (s) => (s ? String(s).trim().toUpperCase() : '');
      const buildMatchKey = (item) => {
        const cId = (item.canonicalCompanyId || item.companyId?._id || item.companyId || '').toString();
        const b = normText(item.bottleName);
        const v = normText(item.variantName || item.variant);
        const s = normText(item.coatingShade || item.colour);
        const br = normText(item.brandName);
        const pr = normText(item.process);
        return `${cId}|${br}|${b}|${v}|${s}|${pr}`;
      };

      const existingPlanMap = new Map();
      existingPlansOnDate.forEach(p => existingPlanMap.set(buildMatchKey(p), p));

      const affectedPlans = [];
      const plansToInsert = [];

      for (const r of toInsertRows) {
        const rowMatchKey = buildMatchKey(r);
        const existingPlan = !replaceExisting ? existingPlanMap.get(rowMatchKey) : null;

        const orderQty = Number(r.orderQty) || 0;
        const coatedQty = Number(r.coatingCompletedQty ?? r.coatedQty ?? 0);
        const balanceToMake = coatedQty - orderQty;
        const stockAllocation = coatedQty > 0
          ? (Array.isArray(r.stockAllocation) && r.stockAllocation.length > 0 ? r.stockAllocation : [{ companyId: r.companyId, qty: coatedQty }])
          : [];
        const stockSources = (r.stockSources && r.stockSources.length > 0)
          ? r.stockSources
          : (r.companyId ? [r.companyId] : []);

        if (existingPlan) {
          // Re-importing a sheet for a date matches rows: update order & coated quantities with Edit adjustment
          const oldOrder = Number(existingPlan.orderQty) || 0;
          const oldCoated = Number(existingPlan.coatingCompletedQty ?? existingPlan.coatedQty ?? 0);
          const diffOrder = orderQty - oldOrder;
          const diffCoated = coatedQty - oldCoated;

          if (diffOrder !== 0 || diffCoated !== 0) {
            existingPlan.qtyEntries = Array.isArray(existingPlan.qtyEntries) ? [...existingPlan.qtyEntries] : [];
            const editUser = req.user?.email || req.user?.name || 'Excel Import';

            if (diffOrder !== 0) {
              existingPlan.qtyEntries.push({
                type: 'edit-adjustment',
                subType: 'order',
                qty: diffOrder,
                at: new Date(),
                by: editUser,
                note: 'Edit adjustment',
                runningTotal: orderQty,
                isDeleted: false
              });
            }

            if (diffCoated !== 0) {
              const oldAllocMap = new Map();
              (existingPlan.stockAllocation || []).forEach(a => oldAllocMap.set((a.companyId?._id || a.companyId)?.toString(), Number(a.qty) || 0));
              const newAllocMap = new Map();
              stockAllocation.forEach(a => newAllocMap.set((a.companyId?._id || a.companyId)?.toString(), Number(a.qty) || 0));
              const allCids = new Set([...oldAllocMap.keys(), ...newAllocMap.keys()]);
              const entryAllocDiff = [];
              for (const cid of allCids) {
                const qDiff = (newAllocMap.get(cid) || 0) - (oldAllocMap.get(cid) || 0);
                if (qDiff !== 0) {
                  entryAllocDiff.push({ companyId: new mongoose.Types.ObjectId(cid), qty: qDiff });
                }
              }

              existingPlan.qtyEntries.push({
                type: 'edit-adjustment',
                subType: 'coated',
                qty: diffCoated,
                at: new Date(),
                by: editUser,
                note: 'Edit adjustment',
                runningTotal: coatedQty,
                stockAllocation: entryAllocDiff,
                isDeleted: false
              });
            }
          }

          existingPlan.orderQty = orderQty;
          existingPlan.coatedQty = coatedQty;
          existingPlan.coatingCompletedQty = coatedQty;
          existingPlan.balanceToMake = balanceToMake;
          existingPlan.stockAllocation = stockAllocation;
          existingPlan.stockSources = stockSources;
          existingPlan.status = (orderQty > 0 && coatedQty >= orderQty);
          if (r.boxQty) existingPlan.boxQty = r.boxQty;
          if (r.noOfBoxes) existingPlan.noOfBoxes = r.noOfBoxes;
          if (r.remarks) existingPlan.remarks = r.remarks;
          if (r.process) existingPlan.process = r.process;

          await existingPlan.save();
          affectedPlans.push(existingPlan);
        } else {
          // New row to insert
          const planData = {
            planDate: new Date(r.planDate),
            bottleName: r.bottleName,
            variantId: r.variantId || undefined,
            variantName: r.variantName,
            coatingShade: r.coatingShade,
            colour: r.coatingShade,
            brandId: r.brandId || undefined,
            brandName: r.brandName,
            companyId: r.companyId || undefined,
            companyName: r.companyName,
            process: r.process,
            orderQty: orderQty,
            boxQty: r.boxQty,
            noOfBoxes: r.noOfBoxes,
            coatingCompletedQty: coatedQty,
            coatedQty: coatedQty,
            balanceToMake: balanceToMake,
            dispatchPendingQty: r.dispatchPendingQty,
            dispatchBalance: r.dispatchPendingQty,
            soldQty: r.soldQty,
            plainStock: r.plainStock,
            remarks: r.remarks,
            status: (orderQty > 0 && coatedQty >= orderQty),
            appliedStockDeduction: 0,
            stockAllocation: stockAllocation,
            stockSources: stockSources,
            orderQtyInitial: orderQty,
            coatedQtyInitial: coatedQty,
            stockAllocationInitial: stockAllocation,
            qtyEntries: [],
            importGroupId: r.groupId ? `${importBatchId}-${r.groupId}` : null,
            importGroupIndex: r.groupIndex !== undefined ? r.groupIndex : null,
            importGroupSize: r.groupSize !== undefined ? r.groupSize : null,
            originalImportedValues: {
              orderQty: orderQty,
              coatingCompletedQty: coatedQty,
              coatedQty: coatedQty,
              balanceToMake: balanceToMake,
              boxQty: r.boxQty,
              noOfBoxes: r.noOfBoxes,
              dispatchPendingQty: r.dispatchPendingQty,
              dispatchBalance: r.dispatchPendingQty,
              soldQty: r.soldQty,
              plainStock: r.plainStock,
              remarks: r.remarks,
              process: r.process
            },
            isEditedAfterImport: false
          };

          if (stockWarningOverrides && stockWarningOverrides[r.excelRowNumber]) {
            planData.stockWarningAcknowledged = true;
            planData.acknowledgedAt = new Date();
            planData.stockWarningDetails = {
              orderQty: r.orderQty,
              availableStock: 0,
              overBy: 0
            };
          }

          plansToInsert.push(planData);
        }
      }

      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        const createdPlans = await LacquerPlan.insertMany(plansToInsert);
        affectedPlans.push(...createdPlans);
      }

      // Recompute everything for all affected plans: balance, stock deduction, replay, printing sync, ready to dispatch
      for (const plan of affectedPlans) {
        await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
        await replayStockAllocations(
          plan.bottleName,
          plan.planDate,
          [plan.companyId, ...(plan.stockSources || [])],
          req.user?._id
        );
        await syncPrintingPlanForLacquerPlan(plan, req.user?._id);
        const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');
        await syncLacquerPlanReadyToDispatch(plan);
      }

      totalImported += affectedPlans.length;
      importedResults.push({ date, imported: affectedPlans.length, skippedCompleted: validRows.length - toInsertRows.length });
    }

    res.status(200).json({ success: true, data: { importedResults, totalImported } });
  } catch (error) {
    console.error("COMMIT IMPORT ERROR:", error);
    require('fs').writeFileSync('commit_import_error.log', String(error.stack || error.message));
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Verify imported data against database
 * Compares preview values with actual database records
 */
exports.verifyImportedData = async (req, res) => {
  try {
    const { date, previewRows } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter required"
      });
    }

    const databaseVerification = require('../utils/databaseVerification');

    // Run verification for the specified date
    const verification = await databaseVerification.verifyImportedRecordsForDate(date, previewRows || []);

    res.status(200).json({
      success: true,
      data: verification
    });
  } catch (error) {
    console.error("VERIFICATION ERROR:", error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


// Per-pool locks to serialize quantity updates (keyed by "companyId|plainBottleName")
const poolLocks = new Map();

async function acquirePoolLock(companyId, plainBottleName) {
  const lockKey = `${companyId}|${plainBottleName}`;
  while (poolLocks.has(lockKey)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  poolLocks.set(lockKey, true);
  return lockKey;
}

function releasePoolLock(lockKey) {
  poolLocks.delete(lockKey);
}

/**
 * POST /lacquer-plan/:id/add-order-qty
 * Add to order quantity. Increases orderQty by the added amount.
 * Stores a qtyEntries history entry.
 */
exports.addOrderQty = async (req, res) => {
  try {
    const { id } = req.params;
    const { qty, note, date } = req.body;
    const userId = req.user?.email || req.user?.name || 'unknown';

    // Validation - supports add (+) or subtract (-)
    const quantity = Number(qty);
    if (!qty || !Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({ success: false, message: 'Qty must be a non-zero integer' });
    }

    const plan = await LacquerPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    if (plan.isDeleted) {
      return res.status(400).json({ success: false, message: 'Cannot modify deleted plan' });
    }

    if (plan.orderQtyInitial === null || plan.orderQtyInitial === undefined) {
      plan.orderQtyInitial = plan.orderQty || 0;
    }
    if (plan.coatedQtyInitial === null || plan.coatedQtyInitial === undefined) {
      plan.coatedQtyInitial = plan.coatingCompletedQty ?? plan.coatedQty ?? 0;
    }

    // Create entry
    const newOrderQty = (plan.orderQty || 0) + Number(qty);
    if (newOrderQty < 0) {
      return res.status(400).json({ success: false, message: 'Order quantity cannot reduce the total below zero' });
    }
    const entry = {
      type: 'added',
      subType: 'order',
      qty: Number(qty),
      at: date ? new Date(date) : new Date(),
      by: userId,
      note: note || '',
      runningTotal: newOrderQty
    };

    // Update plan
    plan.orderQty = newOrderQty;
    plan.balanceToMake = (plan.coatingCompletedQty || 0) - newOrderQty;

    // Update status based on completion
    const isCompleted = newOrderQty > 0 && (plan.coatingCompletedQty || 0) >= newOrderQty;
    plan.status = isCompleted;

    // Recompute boxes if applicable
    if (plan.boxQty && plan.boxQty > 0) {
      plan.noOfBoxes = Math.ceil(newOrderQty / plan.boxQty);
    }

    plan.qtyEntries = plan.qtyEntries || [];
    plan.qtyEntries.push(entry);

    plan.isEditedAfterImport = true;
    plan.lastEditedAt = new Date();

    const printingSyncResult = await savePlanWithPrintingSync(plan, req.user?._id);

    // Refresh and return
    const updated = await LacquerPlan.findById(id);
    res.status(200).json({
      success: true,
      data: updated,
      message: `Order quantity increased to ${newOrderQty}`,
      printingSync: printingSyncResult?.leftUnlinkedCandidateCount > 0
        ? {
          adoptedPrintingPlanId: printingSyncResult.plan._id,
          leftUnlinkedCandidateCount: printingSyncResult.leftUnlinkedCandidateCount
        }
        : undefined
    });
  } catch (error) {
    console.error('Error in addOrderQty:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /lacquer-plan/:id/add-coated-qty
 * Add to coating completed quantity.
 * First entry sets the coated qty; subsequent entries add to it.
 * Validates against available plain stock of the pool.
 */
exports.addCoatedQty = async (req, res) => {
  try {
    const { id } = req.params;
    const { qty, rejectionQty = 0, rejectionBoxes = 0, rejectionLooseQty, note, date } = req.body;
    const userId = req.user?.email || req.user?.name || 'unknown';

    // Validation
    const quantity = Number(qty);
    const rejectedQuantity = Number(rejectionQty);
    const rejectedBoxCount = Number(rejectionBoxes);
    const rejectedLooseBottleCount = rejectionLooseQty === undefined ? rejectedQuantity : Number(rejectionLooseQty);
    if (qty === undefined || qty === null || !Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({ success: false, message: 'Qty must be a non-zero integer' });
    }
    if (!Number.isInteger(rejectedQuantity) || rejectedQuantity < 0 ||
      !Number.isInteger(rejectedBoxCount) || rejectedBoxCount < 0 ||
      !Number.isInteger(rejectedLooseBottleCount) || rejectedLooseBottleCount < 0 ||
      (quantity < 0 && rejectedQuantity > 0)) {
      return res.status(400).json({ success: false, message: 'Rejection Qty must be a non-negative whole quantity and cannot be added when subtracting.' });
    }

    const plan = await LacquerPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    if (plan.isDeleted) {
      return res.status(400).json({ success: false, message: 'Cannot modify deleted plan' });
    }
    if (rejectedBoxCount * (Number(plan.boxQty) || 0) + rejectedLooseBottleCount !== rejectedQuantity) {
      return res.status(400).json({ success: false, message: 'Rejection boxes and loose bottles do not match the rejection quantity.' });
    }

    // Acquire pool lock
    const plainBottleName = plan.bottleName;
    const companyId = plan.companyId?.toString();
    const lockKey = await acquirePoolLock(companyId, plainBottleName);

    try {
      // Re-fetch after lock to get latest state
      const freshPlan = await LacquerPlan.findById(id);
      const newCoatedQty = (freshPlan.coatingCompletedQty || 0) + quantity;
      if (newCoatedQty < 0) {
        releasePoolLock(lockKey);
        return res.status(400).json({
          success: false,
          message: 'Coating quantity cannot reduce the total below zero.'
        });
      }

      // Get pool's available plain stock
      const availableStock = await computeLivePlainStock(plainBottleName, companyId, freshPlan.planDate);

      // Calculate current usage by this plan
      const currentCoatedByThisPlan = freshPlan.coatingCompletedQty || 0;
      // Available for this plan = total available - (all other coating by all plans in the pool)
      // But we need to account for what THIS plan already took
      const usedByOthers = await LacquerPlan.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(companyId),
            bottleName: plainBottleName,
            isDeleted: false,
            _id: { $ne: new mongoose.Types.ObjectId(id) },
            planDate: { $lte: new Date(freshPlan.planDate) }
          }
        },
        {
          $group: {
            _id: null,
            totalCoated: { $sum: '$coatingCompletedQty' }
          }
        }
      ]);

      const otherCoated = usedByOthers[0]?.totalCoated || 0;
      const availableForThisPlan = availableStock - otherCoated;

      if (quantity > 0 && newCoatedQty > availableForThisPlan) {
        releasePoolLock(lockKey);
        return res.status(400).json({
          success: false,
          message: `Cannot exceed available stock. Available for this pool: ${availableForThisPlan}`,
          availableQuantity: availableForThisPlan
        });
      }

      if (freshPlan.orderQtyInitial === null || freshPlan.orderQtyInitial === undefined) {
        freshPlan.orderQtyInitial = freshPlan.orderQty || 0;
      }
      if (freshPlan.coatedQtyInitial === null || freshPlan.coatedQtyInitial === undefined) {
        freshPlan.coatedQtyInitial = freshPlan.coatingCompletedQty ?? freshPlan.coatedQty ?? 0;
      }

      // Determine entry stockAllocation
      const planSources = (freshPlan.stockSources && freshPlan.stockSources.length > 0)
        ? freshPlan.stockSources.map(s => (s._id || s).toString())
        : [companyId];

      let entryAllocation = [];
      const userSplit = req.body.stockAllocation;

      if (planSources.length > 1) {
        if (!userSplit || !Array.isArray(userSplit) || userSplit.length === 0) {
          releasePoolLock(lockKey);
          return res.status(400).json({
            success: false,
            message: 'A stock split is required when multiple stock sources are selected.'
          });
        }

        const canonicalBottle = await resolveCanonicalPlainBottle(plainBottleName, companyId);
        const stockRes = await computeLivePlainStock(canonicalBottle, planSources, freshPlan.planDate);
        const availMap = new Map();
        (stockRes.sources || []).forEach(s => {
          availMap.set(s.companyId?.toString(), Number(s.available) || 0);
        });

        let splitSum = 0;
        for (const a of userSplit) {
          const aCid = (a.companyId?._id || a.companyId)?.toString();
          const aQty = Number(a.qty);
          if (isNaN(aQty) || !Number.isInteger(aQty) || aQty < 0) {
            releasePoolLock(lockKey);
            return res.status(400).json({ success: false, message: 'Split quantities must be non-negative integers.' });
          }
          if (!planSources.includes(aCid)) {
            releasePoolLock(lockKey);
            return res.status(400).json({ success: false, message: 'Company in split is not one of the plan sources.' });
          }
          const maxAvail = availMap.get(aCid) || 0;
          if (quantity > 0 && aQty > maxAvail) {
            releasePoolLock(lockKey);
            return res.status(400).json({
              success: false,
              message: `Only ${maxAvail} bottles available from this source (requested ${aQty})`
            });
          }
          splitSum += aQty;
          entryAllocation.push({ companyId: new mongoose.Types.ObjectId(aCid), qty: aQty });
        }

        if (splitSum !== quantity) {
          releasePoolLock(lockKey);
          return res.status(400).json({
            success: false,
            message: `Split must add up to ${quantity} (now ${splitSum})`
          });
        }
      } else {
        const soleSource = planSources[0] || companyId;
        entryAllocation = [{ companyId: new mongoose.Types.ObjectId(soleSource), qty: quantity }];
      }

      if (freshPlan.stockAllocationInitial === null || freshPlan.stockAllocationInitial === undefined || freshPlan.stockAllocationInitial.length === 0) {
        freshPlan.stockAllocationInitial = (freshPlan.stockAllocation && freshPlan.stockAllocation.length > 0)
          ? freshPlan.stockAllocation
          : ((freshPlan.coatedQtyInitial || 0) > 0 ? [{ companyId: new mongoose.Types.ObjectId(planSources[0] || companyId), qty: freshPlan.coatedQtyInitial }] : []);
      }

      // Create entry with optional date
      const entry = {
        type: 'added',
        subType: 'coated',
        qty: quantity,
        rejectionQty: rejectedQuantity,
        rejectionBoxes: rejectedBoxCount,
        rejectionLooseQty: rejectedLooseBottleCount,
        at: date ? new Date(date) : new Date(),
        by: userId,
        note: note || '',
        runningTotal: newCoatedQty,
        stockAllocation: entryAllocation,
        isDeleted: false
      };

      // Update plan
      freshPlan.coatingCompletedQty = newCoatedQty;
      freshPlan.coatedQty = newCoatedQty; // Keep both in sync
      freshPlan.balanceToMake = newCoatedQty - (freshPlan.orderQty || 0);

      // Update status based on completion
      const isCompleted = (freshPlan.orderQty || 0) > 0 && newCoatedQty >= (freshPlan.orderQty || 0);
      freshPlan.status = isCompleted;

      freshPlan.qtyEntries = freshPlan.qtyEntries || [];
      freshPlan.qtyEntries.push(entry);

      // Recompute plan total stockAllocation
      const totalsMap = new Map();
      (freshPlan.stockAllocationInitial || []).forEach(a => {
        const cid = (a.companyId?._id || a.companyId)?.toString();
        totalsMap.set(cid, (totalsMap.get(cid) || 0) + (Number(a.qty) || 0));
      });
      for (const e of freshPlan.qtyEntries) {
        if (e.isDeleted) continue;
        if (e.stockAllocation && Array.isArray(e.stockAllocation)) {
          for (const sa of e.stockAllocation) {
            const cid = (sa.companyId?._id || sa.companyId)?.toString();
            totalsMap.set(cid, (totalsMap.get(cid) || 0) + (Number(sa.qty) || 0));
          }
        }
      }
      freshPlan.stockAllocation = Array.from(totalsMap.entries()).map(([cid, q]) => ({
        companyId: new mongoose.Types.ObjectId(cid),
        qty: q
      }));

      freshPlan.isEditedAfterImport = true;
      freshPlan.lastEditedAt = new Date();

      const printingSyncResult = await savePlanWithPrintingSync(freshPlan, req.user?._id);

      // Replay allocations and stock deduction
      await replayStockAllocations(
        plainBottleName,
        freshPlan.planDate,
        [freshPlan.companyId, ...(freshPlan.stockSources || [])],
        req.user?._id
      );
      await recomputePlainStock(plainBottleName, companyId, req.user?._id);
      await syncSameDayPlansPlainStock(plainBottleName, companyId, freshPlan.planDate, req.user?._id);

      // Auto-send to Ready To Dispatch if row is completed and is process C
      if (isCompleted && freshPlan.process === 'C' && !freshPlan.readyToDispatch) {
        // TODO: Auto-send logic
      }

      releasePoolLock(lockKey);

      // Refresh and return
      const updated = await LacquerPlan.findById(id);
      res.status(200).json({
        success: true,
        data: updated,
        message: `Coating quantity updated to ${newCoatedQty}`,
        printingSync: printingSyncResult?.leftUnlinkedCandidateCount > 0
          ? {
            adoptedPrintingPlanId: printingSyncResult.plan._id,
            leftUnlinkedCandidateCount: printingSyncResult.leftUnlinkedCandidateCount
          }
          : undefined
      });
    } catch (error) {
      releasePoolLock(lockKey);
      throw error;
    }
  } catch (error) {
    console.error('Error in addCoatedQty:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /lacquer-plan/:id/entries/:entryId
 * Delete a history entry by ID. Recomputes totals.
 */
exports.deleteQtyEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;

    const plan = await LacquerPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    // Find entry to soft-delete
    const entry = (plan.qtyEntries || []).find(e => e._id?.toString() === entryId);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    // Mark as soft-deleted
    entry.isDeleted = true;
    entry.deletedAt = new Date();
    entry.deletedBy = req.user?.email || req.user?.name || 'unknown';

    // Recompute totals from initial + active entries
    let newOrderQty = (plan.orderQtyInitial !== null && plan.orderQtyInitial !== undefined) ? plan.orderQtyInitial : 0;
    let newCoatedQty = (plan.coatedQtyInitial !== null && plan.coatedQtyInitial !== undefined) ? plan.coatedQtyInitial : 0;

    for (const e of plan.qtyEntries) {
      if (e.isDeleted) continue;
      const q = Number(e.qty || 0);
      if (e.subType === 'order' || e.type === 'orderQty') {
        newOrderQty += q;
      } else if (e.subType === 'coated' || e.type === 'coatedQty') {
        newCoatedQty += q;
      } else if (e.type === 'edit-adjustment') {
        if (e.subType === 'order') newOrderQty += q;
        else if (e.subType === 'coated') newCoatedQty += q;
      } else if (e.type === 'added') {
        if (e.subType === 'coated') newCoatedQty += q;
        else newOrderQty += q;
      }
    }

    if (newOrderQty < 0 || newCoatedQty < 0) {
      entry.isDeleted = false;
      return res.status(400).json({
        success: false,
        message: 'Deletion would result in invalid totals (negative quantities)'
      });
    }

    // Update plan
    plan.orderQty = newOrderQty;
    plan.coatingCompletedQty = newCoatedQty;
    plan.coatedQty = newCoatedQty;
    plan.balanceToMake = newCoatedQty - newOrderQty;
    plan.status = newOrderQty > 0 && newCoatedQty >= newOrderQty;

    // Recompute plan total stockAllocation from initial + active entries
    const totalsMap = new Map();
    (plan.stockAllocationInitial || []).forEach(a => {
      const cid = (a.companyId?._id || a.companyId)?.toString();
      totalsMap.set(cid, (totalsMap.get(cid) || 0) + (Number(a.qty) || 0));
    });
    for (const e of plan.qtyEntries) {
      if (e.isDeleted) continue;
      if (e.stockAllocation && Array.isArray(e.stockAllocation)) {
        for (const sa of e.stockAllocation) {
          const cid = (sa.companyId?._id || sa.companyId)?.toString();
          totalsMap.set(cid, (totalsMap.get(cid) || 0) + (Number(sa.qty) || 0));
        }
      }
    }
    plan.stockAllocation = Array.from(totalsMap.entries()).map(([cid, q]) => ({
      companyId: new mongoose.Types.ObjectId(cid),
      qty: q
    }));

    await savePlanWithPrintingSync(plan, req.user?._id);

    await replayStockAllocations(
      plan.bottleName,
      plan.planDate,
      [plan.companyId, ...(plan.stockSources || [])],
      req.user?._id
    );

    // Recompute pool stock on this and later dates
    await recomputePlainStock(plan.bottleName, plan.companyId, req.user?._id);
    await syncSameDayPlansPlainStock(plan.bottleName, plan.companyId, plan.planDate, req.user?._id);

    // Refresh and return
    const updated = await LacquerPlan.findById(id);
    res.status(200).json({
      success: true,
      data: updated,
      message: 'Entry deleted and totals recomputed'
    });
  } catch (error) {
    console.error('Error in deleteQtyEntry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// GET opening-stock
exports.getOpeningStock = async (req, res) => {
  try {
    const { bottleName, companyId, planDate, stockSources, excludePlanIds } = req.query;
    let sources = [];
    if (stockSources) {
      sources = (Array.isArray(stockSources) ? stockSources : String(stockSources).split(',')).map(s => s.trim()).filter(Boolean);
    } else if (companyId) {
      sources = [companyId];
    }
    const canonicalBottle = await resolveCanonicalPlainBottle(bottleName, companyId);
    const stockRes = await computeLivePlainStock(canonicalBottle, sources, planDate, excludePlanIds);
    return res.json({
      success: true,
      plainStock: stockRes.plainStock,
      openingStock: stockRes.openingStock,
      available: stockRes.available,
      totalStock: stockRes.totalStock,
      sameDayCoated: stockRes.sameDayCoated,
      sources: stockRes.sources || [],
      hasSuppliers: stockRes.hasSuppliers || false,
      eligibleSuppliers: stockRes.eligibleSuppliers || []
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.syncPrintingPlanForLacquerPlan = syncPrintingPlanForLacquerPlan;
exports.createPrintingPlanIfApplicable = syncPrintingPlanForLacquerPlan;
