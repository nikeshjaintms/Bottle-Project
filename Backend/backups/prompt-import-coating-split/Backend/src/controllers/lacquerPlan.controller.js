
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

// 30-second cache for totals
const lacquerTotalsCache = new Map();
const LACQUER_TOTALS_CACHE_TTL = 30000;
const { isPrintingProcess } = require("../utils/processRouting");
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
    planData.stockSources = sources.map(s => new mongoose.Types.ObjectId(s));
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

// Helper to auto-create and synchronize PrintingPlan 1-to-1 with a LacquerPlan row
const syncPrintingPlanForLacquerPlan = async (plan, userId = null) => {
  if (!plan) return null;

  // Rule: C is excluded from Printing Plan. C+P, C+F, P, F are included.
  // If plan is deleted or process does not qualify for printing, soft-delete linked PrintingPlan
  if (plan.isDeleted || !isPrintingProcess(plan.process)) {
    if (plan._id) {
      await PrintingPlan.updateMany(
        { lacquerPlanId: plan._id, isDeleted: false },
        { $set: { isDeleted: true } }
      );
    }
    return null;
  }

  // Qualifying process (C+P, C+F, P, F, PRINTING, BOTH)
  let pToBeDone = plan.variantName || "";
  let tColor = "";
  if (plan.variantId) {
    const variant = await Variant.findOne({ _id: plan.variantId, isDeleted: { $ne: true } });
    if (variant) {
      pToBeDone = variant.variantName || pToBeDone;
      tColor = variant.detectedTextColor || "";
    }
  }

  // Resolve BottleSpec (itemId)
  let spec = await BottleSpec.findOne({ bottleName: plan.bottleName, isDeleted: false });
  if (!spec && plan.brandId) {
    spec = await BottleSpec.findOne({ bottleName: plan.bottleName, brandId: plan.brandId, isDeleted: false });
  }
  if (!spec) {
    const selectedPlainBottle = await BottlePerBox.findOne({
      $or: [
        { plainBottleName: plan.bottleName.trim() },
        { bottleName: plan.bottleName.trim() },
        { bottleNames: plan.bottleName.trim() }
      ],
      isDeleted: false
    });
    if (selectedPlainBottle && Array.isArray(selectedPlainBottle.bottleNames) && selectedPlainBottle.bottleNames.length > 0) {
      spec = await BottleSpec.findOne({
        bottleName: { $in: selectedPlainBottle.bottleNames },
        brandId: plan.brandId,
        isDeleted: false
      });
    }
  }

  const shade = plan.coatingShade || plan.colour || "";
  const plainStock = (plan.process === 'P') 
    ? await computeLivePlainStock(plan.bottleName, plan.companyId, plan.planDate) 
    : (plan.coatingCompletedQty ?? plan.coatedQty ?? 0);

  // Find linked PrintingPlan for this specific lacquerPlanId (including soft-deleted to restore)
  let existingPlan = await PrintingPlan.findOne({ lacquerPlanId: plan._id });

  if (existingPlan) {
    existingPlan.planDate = plan.planDate;
    existingPlan.bottleName = plan.bottleName;
    existingPlan.companyId = plan.companyId;
    existingPlan.brandId = plan.brandId;
    if (plan.brandName) existingPlan.brandName = plan.brandName;
    existingPlan.coatingShade = shade;
    existingPlan.printingToBeDone = pToBeDone || existingPlan.printingToBeDone || "";
    if (tColor) existingPlan.textColor = tColor;
    existingPlan.plainBottleStock = plainStock;
    existingPlan.balanceToMake = (existingPlan.producedQty && existingPlan.producedQty > 0) ? (plainStock - existingPlan.producedQty) : plainStock;
    existingPlan.process = plan.process;
    existingPlan.orderQty = plan.orderQty;
    if (plan.boxQty !== undefined) existingPlan.boxQty = plan.boxQty;
    if (plan.noOfBoxes !== undefined) existingPlan.noOfBoxes = plan.noOfBoxes;
    existingPlan.status = plan.status !== false;
    if (plan.remarks !== undefined) existingPlan.remarks = plan.remarks;
    if (spec) existingPlan.itemId = spec._id;
    existingPlan.isDeleted = false;
    await existingPlan.save();
    return existingPlan;
  } else {
    const created = await PrintingPlan.create({
      lacquerPlanId: plan._id,
      planDate: plan.planDate,
      bottleName: plan.bottleName,
      itemId: spec ? spec._id : undefined,
      companyId: plan.companyId,
      brandId: plan.brandId,
      brandName: plan.brandName,
      coatingShade: shade,
      printingToBeDone: pToBeDone,
      printingVariant: "",
      textColor: tColor,
      plainBottleStock: plainStock,
      balanceToMake: plainStock,
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
    return created;
  }
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
      const plans = await LacquerPlan.insertMany(req.body);
      for (const plan of plans) {
        await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
        await createPrintingPlanIfApplicable(plan);


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

      return res.status(201).json({ success: true, data: plans });
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
      await plan.save();
      await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
      await createPrintingPlanIfApplicable(plan);

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
      return res.status(201).json({ success: true, data: freshPlan });
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

// Get Plans
exports.getPlans = async (req, res) => {
  try {
    const { date, month, fromDate, toDate, search, companyId, brandId, page, limit, pagination = "false", bottleName } = req.query;
    let query = { isDeleted: false };

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

    // Apply search filter on augmented plans AFTER aggregation
    let filteredPlans = augmentedPlans;
    if (search) {
      filteredPlans = augmentedPlans.filter(plan => {
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

      // Assign blockKey, blockSize, blockIndex, bottleSpan, stockSpan, boxSpan
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
      return res.status(200).json({ success: true, data: filteredPlans, total });
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
      data: paginatedPlans,
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

    let query = { isDeleted: false };

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

    let query = { isDeleted: false };
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

    const rawPlans = await LacquerPlan.aggregate(pipeline)
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

      // Assign block fields
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

        const augmentedRow = {
          ...row,
          blockKey,
          blockSize,
          blockIndex: i,
          isFirstInBlock: (i === 0),
          bottleSpan: (i === 0) ? blockSize : 0,
          stockSpan: (i === 0) ? blockSize : 0,
          boxSpan: (i === 0) ? blockSize : 0,
          plainStock: poolStock.plainStock,
          openingStock: poolStock.openingStock,
          availableStock: poolStock.plainStock,
          livePlainStock: poolStock.plainStock,
          coatedQty,
          balanceToMake,
          status: isCompleted,
          sentToReadyQty: row.sentToReadyQty || 0,
          usedFrom: rowUsedFrom,
          usedFromTooltip: rowUsedFromTooltip
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

// Import Previous Day
exports.importPreviousDay = async (req, res) => {
  try {
    const { targetDate, sourceDate, importMode } = req.body;
    if (!targetDate) return res.status(400).json({ success: false, message: "Target date is required" });

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
      planDate: { $gte: startOfPrevDay, $lte: endOfPrevDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    if (!oldPlans || oldPlans.length === 0) {
      return res.status(404).json({ success: false, message: "No plans found for previous day" });
    }

    const startOfTargetDay = new Date(targetDate);
    startOfTargetDay.setUTCHours(0, 0, 0, 0);
    const endOfTargetDay = new Date(targetDate);
    endOfTargetDay.setUTCHours(23, 59, 59, 999);

    const existingTargetPlans = await LacquerPlan.find({
      isDeleted: false,
      planDate: { $gte: startOfTargetDay, $lte: endOfTargetDay }
    }).populate('brandId', 'name').populate('variantId', 'variantName').lean();

    const allBrands = await Brand.find({ isDeleted: { $ne: true } }).lean();
    const allVariants = await Variant.find({ isDeleted: { $ne: true } }).lean();
    const resolveBrandKey = buildBrandResolver(allBrands);
    const resolveVariantKey = buildVariantResolver(allVariants);

    // Check if target date already has rows imported from source date
    const hasExistingImport = existingTargetPlans.some(p => 
      p.importedFromDate && 
      (p.importedFromDate.toDateString() === (sourceDate || prev).toDateString())
    );

    // Helper to detect if a plan row was edited after its initial import
    const isPlanEdited = (p) => {
      if (!p) return false;
      if (p.isEditedAfterImport) return true;
      if (p.originalImportedValues) {
        const orig = p.originalImportedValues;
        for (const k of Object.keys(orig)) {
          if (orig[k] !== undefined && p[k] !== undefined && String(orig[k]) !== String(p[k])) {
            return true;
          }
        }
      }
      if (p.updatedAt && p.createdAt) {
        const diffMs = new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime();
        if (diffMs > 5000) return true;
      }
      return false;
    };

    const editedCount = oldPlans.filter(p => isPlanEdited(p)).length;
    const hasEditedPlans = editedCount > 0;

    // If this is a second import (target already has imports from source) and user hasn't chosen mode, prompt
    if (hasExistingImport && !importMode) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        hasExistingImport: true,
        message: "This date already has imports from that source date. Choose how to proceed."
      });
    }

    // If source day's plans were edited and user hasn't explicitly chosen importMode yet, prompt for confirmation
    if (hasEditedPlans && !importMode && !hasExistingImport) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        hasEditedPlans: true,
        editedCount,
        totalPlans: oldPlans.length,
        message: `The source plan has ${editedCount} manually edited entry(s). Please choose whether to import with changes or without changes.`
      });
    }

    // Determine candidate values for each source plan based on importMode
    const candidatePlans = oldPlans.map(p => {
      const { _id, createdAt, updatedAt, __v, ...rest } = p;
      let values = { ...rest };

      // If user selected 'without_changes', revert to original as-imported values
      if (importMode === 'without_changes' && p.originalImportedValues) {
        const orig = p.originalImportedValues;
        if (orig.orderQty !== undefined) values.orderQty = orig.orderQty;
        if (orig.coatingCompletedQty !== undefined) {
          values.coatingCompletedQty = orig.coatingCompletedQty;
          values.coatedQty = orig.coatingCompletedQty;
        }
        if (orig.balanceToMake !== undefined) values.balanceToMake = orig.balanceToMake;
        if (orig.boxQty !== undefined) values.boxQty = orig.boxQty;
        if (orig.noOfBoxes !== undefined) values.noOfBoxes = orig.noOfBoxes;
        if (orig.dispatchPendingQty !== undefined) {
          values.dispatchPendingQty = orig.dispatchPendingQty;
          values.dispatchBalance = orig.dispatchPendingQty;
        }
        if (orig.soldQty !== undefined) values.soldQty = orig.soldQty;
        if (orig.plainStock !== undefined) values.plainStock = orig.plainStock;
        if (orig.remarks !== undefined) values.remarks = orig.remarks;
        if (orig.process !== undefined) values.process = orig.process;
      }

      return {
        sourcePlan: p,
        values
      };
    });

    const completedSet = await getCompletedCombinationsSet(sourceDate || prev, resolveBrandKey, resolveVariantKey, false);
    const sentSet = await getSentToDispatchCombinationsSet(sourceDate || prev, resolveBrandKey, resolveVariantKey, false);

    // Also mark any plan in candidatePlans that is already completed or sent on sourceDate
    candidatePlans.forEach(c => {
      const order = Number(c.values.orderQty || 0);
      const coated = Number(c.values.coatingCompletedQty ?? c.values.coatedQty ?? 0);
      const sent = Number(c.sourcePlan?.sentToReadyQty || c.values.sentToReadyQty || 0);
      const isCompleted = order > 0 && coated >= order;
      const isFullySent = (order > 0 && sent >= order) || (coated > 0 && sent >= coated && isCompleted);

      if (isCompleted) {
        const keys = getPlanCombinationKeys(c.values, resolveBrandKey, resolveVariantKey);
        keys.forEach(k => completedSet.add(k));
      }
      if (isFullySent) {
        const keys = getPlanCombinationKeys(c.values, resolveBrandKey, resolveVariantKey);
        keys.forEach(k => sentSet.add(k));
      }
    });

    // Skip any combination that is already completed OR fully sent to ready-to-dispatch
    // Rows that still have balance (coated < order) continue to come as today!
    const openCandidates = candidatePlans.filter(c => {
      if (isPlanRowCompleted(c.values)) return false;
      const order = Number(c.values.orderQty || 0);
      const coated = Number(c.values.coatingCompletedQty ?? c.values.coatedQty ?? 0);
      const sent = Number(c.sourcePlan?.sentToReadyQty || c.values.sentToReadyQty || 0);
      if (order > 0 && sent >= order) return false;
      if (coated > 0 && sent >= coated && isPlanRowCompleted(c.values)) return false;

      const keys = getPlanCombinationKeys(c.values, resolveBrandKey, resolveVariantKey);
      if (keys.some(k => completedSet.has(k))) return false;
      if (keys.some(k => sentSet.has(k))) return false;
      return true;
    });

    const newPlansData = openCandidates.map(c => {
      const finalValues = c.values;
      const sourcePlanId = c.sourcePlan._id;
      const orderQty = Number(finalValues.orderQty) || 0;
      const recalculatedBalanceToMake = 0 - orderQty;

      const snapshot = {
        orderQty: finalValues.orderQty,
        coatingCompletedQty: 0,
        coatedQty: 0,
        balanceToMake: recalculatedBalanceToMake,
        boxQty: finalValues.boxQty,
        noOfBoxes: finalValues.noOfBoxes,
        dispatchPendingQty: finalValues.dispatchPendingQty,
        dispatchBalance: finalValues.dispatchBalance,
        soldQty: finalValues.soldQty,
        plainStock: finalValues.plainStock,
        remarks: finalValues.remarks,
        process: finalValues.process
      };

      return {
        ...finalValues,
        coatingCompletedQty: 0,
        coatedQty: 0,
        balanceToMake: recalculatedBalanceToMake,
        appliedStockDeduction: 0,
        planDate: new Date(targetDate),
        isEditedAfterImport: false,
        lastEditedAt: null,
        originalImportedValues: snapshot,
        importedFromId: sourcePlanId,
        importedFromDate: sourceDate || prev
      };
    });

    let newPlans = [];
    
    if (importMode === 'with_changes' && hasExistingImport) {
      // Update existing imports with source's current values, add new rows
      const alreadyImportedSourceIds = new Set();
      
      for (const candidate of newPlansData) {
        const existingImport = existingTargetPlans.find(p => 
          p.importedFromId?.toString() === candidate.importedFromId.toString()
        );
        
        if (existingImport) {
          // Update existing import with new values (coated qty resets to 0, balanceToMake recalculated)
          await LacquerPlan.updateOne(
            { _id: existingImport._id },
            {
              $set: {
                orderQty: candidate.orderQty,
                coatingCompletedQty: 0,
                coatedQty: 0,
                balanceToMake: candidate.balanceToMake,
                boxQty: candidate.boxQty,
                noOfBoxes: candidate.noOfBoxes,
                dispatchPendingQty: candidate.dispatchPendingQty,
                dispatchBalance: candidate.dispatchBalance,
                soldQty: candidate.soldQty,
                plainStock: candidate.plainStock,
                remarks: candidate.remarks,
                process: candidate.process,
                importedFromDate: candidate.importedFromDate,
                isEditedAfterImport: false,
                originalImportedValues: candidate.originalImportedValues
              }
            }
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
          await createPrintingPlanIfApplicable(plan);
        }
      }
    } else if (importMode === 'without_changes' && hasExistingImport) {
      // Only add rows that haven't been imported yet
      const alreadyImportedSourceIds = new Set(
        existingTargetPlans
          .filter(p => p.importedFromId)
          .map(p => p.importedFromId.toString())
      );
      
      const plansToInsert = newPlansData.filter(newP => 
        !alreadyImportedSourceIds.has(newP.importedFromId.toString())
      );
      
      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await createPrintingPlanIfApplicable(plan);
        }
      }
    } else {
      // First import or no existing imports - normal behavior
      const plansToInsert = newPlansData.filter(newP => {
        const newKeys = getPlanCombinationKeys(newP, resolveBrandKey, resolveVariantKey);
        return !existingTargetPlans.some(existP => {
          const existKeys = getPlanCombinationKeys(existP, resolveBrandKey, resolveVariantKey);
          return newKeys.some(nk => existKeys.includes(nk));
        });
      });
      
      if (plansToInsert.length > 0) {
        await assignGroupsAndSequences(plansToInsert);
        newPlans = await LacquerPlan.insertMany(plansToInsert);
        for (const plan of newPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await createPrintingPlanIfApplicable(plan);
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
        console.error(`Stock warning calculation error for import:`, err);
      }
    }

    res.status(200).json({
      success: true,
      data: newPlans,
      skippedCompletedCount: oldPlans.length - openCandidates.length,
      importMode: importMode || 'normal',
      stockWarnings,
      hasStockWarnings: stockWarnings.length > 0
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Plan by ID

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

  let runningCoated = initialCoated;
  const coatingRows = [];
  coatingRows.push({
    sr: 1,
    at: plan.createdAt || plan.planDate || new Date(),
    type: 'Opening balance',
    rawType: 'opening',
    qtyChange: `${initialCoated}`,
    displayQty: `${initialCoated}`,
    runningTotal: initialCoated,
    stockRemaining: plainStock !== undefined ? plainStock : (plan.plainStock ?? 0),
    balance: initialCoated - finalOrder,
    by: plan.createdBy?.name || plan.createdBy || 'System',
    note: 'Opening balance',
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
    planObj.livePlainStock = plainStock;
    planObj.plainStock = plainStock;
    planObj.openingStock = openingStock;

    groupPlans = groupPlans.map(p => ({
      ...p,
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
    if (oldGroupKey && targetGroupKey && targetGroupKey !== oldGroupKey) {
      // Row moved to a new group: assign next rowSeq in new group
      const newGroupExisting = await LacquerPlan.find({ groupKey: targetGroupKey, isDeleted: false, _id: { $ne: existingPlan._id } }).sort({ rowSeq: 1 });
      const nextSeq = newGroupExisting.length > 0 ? Math.max(...newGroupExisting.map(p => p.rowSeq || 0)) + 1 : 1;
      updateData.groupKey = targetGroupKey;
      updateData.rowSeq = nextSeq;

      // Renumber old group remaining rows
      const oldGroupRemaining = await LacquerPlan.find({ groupKey: oldGroupKey, isDeleted: false, _id: { $ne: existingPlan._id } }).sort({ rowSeq: 1 });
      for (let i = 0; i < oldGroupRemaining.length; i++) {
        await LacquerPlan.findByIdAndUpdate(oldGroupRemaining[i]._id, { rowSeq: i + 1 });
      }
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
      existingPlan._id
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

    const plan = await LacquerPlan.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (plan && newHistory) {
      plan.orderHistory.push(newHistory);
      await plan.save();
    }

    if (!plan || plan.isDeleted) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Sync 1-to-1 with linked PrintingPlan (handles adding, updating, or soft-deleting based on process)
    await syncPrintingPlanForLacquerPlan(plan, req.user?._id);

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

    res.status(200).json({ success: true, data: plan });
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
      /COATING\s*COMPLETED|COATED\s*QTY|COMPLETED|DONE.?QTY/i
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
    'remarks'
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
    const headingKeywords = ['PLAN SHEET', 'LACQUER PLANT', 'PLAN', 'SHEET', 'DATE', 'MONTH', 'YEAR', 'TOTAL', 'SUMMARY', 'NOTE', 'REMARK'];
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
        const rawCoatingCompleted = parseNumericValue(getMergedValue('coatingCompletedQty'));
        const rawBalanceToMake = parseNumericValue(getMergedValue('balanceToMake'));
        const rawDispatchPending = parseNumericValue(getMergedValue('dispatchPendingQty'));
        const rawSoldQty = parseNumericValue(getMergedValue('soldQty'));
        const rawPlainStock = parseNumericValue(getMergedValue('plainStock'));

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

        parsedRow.coatingCompletedQty = 0;
        parsedRow.coatedQty = 0;
        parsedRow.balanceToMake = 0 - (Number(parsedRow.orderQty) || 0);

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

      const toInsert = toInsertRows.map(r => {
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
          orderQty: r.orderQty,
          boxQty: r.boxQty,
          noOfBoxes: r.noOfBoxes,
          coatingCompletedQty: 0,
          coatedQty: 0,
          balanceToMake: 0 - (Number(r.orderQty) || 0),
          dispatchPendingQty: r.dispatchPendingQty,
          dispatchBalance: r.dispatchPendingQty,
          soldQty: r.soldQty,
          plainStock: r.plainStock,
          remarks: r.remarks,
          status: true,
          appliedStockDeduction: 0,
          importGroupId: r.groupId ? `${importBatchId}-${r.groupId}` : null,
          importGroupIndex: r.groupIndex !== undefined ? r.groupIndex : null,
          importGroupSize: r.groupSize !== undefined ? r.groupSize : null,
          originalImportedValues: {
            orderQty: r.orderQty,
            coatingCompletedQty: 0,
            coatedQty: 0,
            balanceToMake: 0 - (Number(r.orderQty) || 0),
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

        // If this row was marked with stock warning override, set acknowledgment metadata
        if (stockWarningOverrides && stockWarningOverrides[r.excelRowNumber]) {
          planData.stockWarningAcknowledged = true;
          planData.acknowledgedAt = new Date();
          // stockWarningDetails would have been captured in preview, but we'll set minimal info
          planData.stockWarningDetails = {
            orderQty: r.orderQty,
            availableStock: 0, // Recalculated at commit time if needed
            overBy: 0
          };
        }

        return planData;
      });

      if (toInsert.length > 0) {
        await assignGroupsAndSequences(toInsert);
        const createdPlans = await LacquerPlan.insertMany(toInsert);
        for (const plan of createdPlans) {
          await syncLacquerPlanStockDeduction(plan, plan.coatingCompletedQty ?? plan.coatedQty, req.user?._id);
          await syncPrintingPlanForLacquerPlan(plan, req.user?._id);
          const { syncLacquerPlanReadyToDispatch } = require('./readyToDispatch.controller');
          await syncLacquerPlanReadyToDispatch(plan);
        }
        totalImported += createdPlans.length;
        importedResults.push({ date, imported: createdPlans.length, skippedCompleted: validRows.length - toInsertRows.length });
      } else {
        importedResults.push({ date, imported: 0, skippedCompleted: validRows.length - toInsertRows.length });
      }
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

    await plan.save();

    // Refresh and return
    const updated = await LacquerPlan.findById(id);
    res.status(200).json({
      success: true,
      data: updated,
      message: `Order quantity increased to ${newOrderQty}`
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
    const { qty, note, date } = req.body;
    const userId = req.user?.email || req.user?.name || 'unknown';

    // Validation
    const quantity = Number(qty);
    if (qty === undefined || qty === null || !Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({ success: false, message: 'Qty must be a non-zero integer' });
    }

    const plan = await LacquerPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    if (plan.isDeleted) {
      return res.status(400).json({ success: false, message: 'Cannot modify deleted plan' });
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

      await freshPlan.save();

      // Replay allocations and stock deduction
      await replayStockAllocations(
        plainBottleName,
        freshPlan.planDate,
        [freshPlan.companyId, ...(freshPlan.stockSources || [])],
        req.user?._id
      );
      await recomputePlainStock(plainBottleName, companyId, req.user?._id);
      await syncSameDayPlansPlainStock(plainBottleName, companyId, freshPlan.planDate, req.user?._id);

      // Sync Printing Plan if applicable (C+P rows)
      if (freshPlan.process === 'C+P' || freshPlan.process === 'CP') {
        // TODO: Sync to Printing Plan with new coated qty
      }

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
        message: `Coating quantity updated to ${newCoatedQty}`
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

    await plan.save();

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
