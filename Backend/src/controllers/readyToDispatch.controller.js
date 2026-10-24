const ReadyToDispatch = require("../models/ReadyToDispatch");
const Company = require("../models/Company");
const LacquerPlan = require("../models/LacquerPlan");
const PrintingPlan = require("../models/PrintingPlan");
const BottlePerBox = require("../models/BottlePerBox");
const Variant = require("../models/Variant");
const Brand = require("../models/Brand");
const BottleSpec = require("../models/Bottlespecs");
const { derivePlainBottleName } = require("../utils/derivePlainBottleName");
const mongoose = require("mongoose");

// Helpers for Plain Bottle resolution
const normalizeStr = (str) => {
  if (!str) return '';
  return String(str).trim().toUpperCase().replace(/\s+/g, ' ');
};

const normalizeRollOn = (str) => {
  if (!str) return '';
  return normalizeStr(str)
    .replace(/ROLL\s*ON/g, 'ROLLON')
    .replace(/ROLL-ON/g, 'ROLLON');
};

const buildBpbLookupMap = (bpbs = []) => {
  const bpbMap = new Map();
  for (const b of bpbs) {
    bpbMap.set(b._id.toString(), b);
    if (b.plainBottleName) {
      bpbMap.set(normalizeStr(b.plainBottleName), b);
      bpbMap.set(normalizeRollOn(b.plainBottleName), b);
    }
    if (b.bottleName) {
      bpbMap.set(normalizeStr(b.bottleName), b);
      bpbMap.set(normalizeRollOn(b.bottleName), b);
    }
    if (Array.isArray(b.bottleNames)) {
      for (const alias of b.bottleNames) {
        if (alias) {
          bpbMap.set(normalizeStr(alias), b);
          bpbMap.set(normalizeRollOn(alias), b);
        }
      }
    }
  }
  return bpbMap;
};

const resolvePlainBottleFromMap = (rawText, bpbMap) => {
  if (!rawText) return null;
  const trimmed = String(rawText).trim();
  if (mongoose.isValidObjectId(trimmed) && bpbMap.has(trimmed)) {
    return bpbMap.get(trimmed);
  }
  const norm = normalizeStr(trimmed);
  if (bpbMap.has(norm)) return bpbMap.get(norm);

  const roll = normalizeRollOn(trimmed);
  if (bpbMap.has(roll)) return bpbMap.get(roll);

  if (typeof derivePlainBottleName === 'function') {
    const derived = derivePlainBottleName(trimmed);
    if (derived && derived.plainBottleName) {
      const dNorm = normalizeStr(derived.plainBottleName);
      if (bpbMap.has(dNorm)) return bpbMap.get(dNorm);
      const dRoll = normalizeRollOn(derived.plainBottleName);
      if (bpbMap.has(dRoll)) return bpbMap.get(dRoll);
    }
  }
  return null;
};

// Helper to sanitize & recalculate groups & totals
const computeGroupsAndSummary = (groups = []) => {
  let totalBoxes = 0;
  let totalProducedQty = 0;
  let totalWeight = 0;
  let hasValidWeight = false;

  const sanitizedGroups = (groups || []).map((grp) => {
    const plainBottleName = (grp.plainBottleName || grp.bottleName || grp.title || "").trim();
    const unit = Number(grp.unit) || 0;

    const variantLines = (grp.variantLines || []).map((vl) => {
      const noOfBoxes = Number(vl.noOfBoxes) || 0;
      let producedQty = Number(vl.producedQty);
      if (isNaN(producedQty) || producedQty === 0) {
        producedQty = unit > 0 ? noOfBoxes * unit : 0;
      }
      
      let weight = null;
      let totalWeightCalc = null;
      
      if (vl.weight !== undefined && vl.weight !== null && vl.weight !== "" && vl.weight !== "-") {
        const parsedWeight = Number(vl.weight);
        if (!isNaN(parsedWeight) && parsedWeight > 0) {
          weight = parsedWeight;
          if (noOfBoxes > 0) {
            totalWeightCalc = parseFloat((noOfBoxes * weight).toFixed(3));
          }
        }
      } else if (vl.totalWeight !== undefined && vl.totalWeight !== null && vl.totalWeight !== "" && vl.totalWeight !== "-") {
        const parsedTot = Number(vl.totalWeight);
        if (!isNaN(parsedTot) && parsedTot > 0) {
          totalWeightCalc = parsedTot;
        }
      }

      totalBoxes += noOfBoxes;
      totalProducedQty += producedQty;
      if (totalWeightCalc !== null) {
        totalWeight += totalWeightCalc;
        hasValidWeight = true;
      }

      const lineId = vl._id && mongoose.isValidObjectId(vl._id)
        ? vl._id
        : (vl.id && mongoose.isValidObjectId(vl.id) ? vl.id : new mongoose.Types.ObjectId());

      return {
        _id: lineId,
        sourcePlanType: vl.sourcePlanType || null,
        sourcePlanId: vl.sourcePlanId && mongoose.isValidObjectId(vl.sourcePlanId) ? vl.sourcePlanId : null,
        variantId: vl.variantId && mongoose.isValidObjectId(vl.variantId) ? vl.variantId : null,
        bottleSpecId: vl.bottleSpecId && mongoose.isValidObjectId(vl.bottleSpecId) ? vl.bottleSpecId : null,
        uniqueKey: vl.uniqueKey || null,
        brandId: vl.brandId && mongoose.isValidObjectId(vl.brandId) ? vl.brandId : null,
        brandName: vl.brandName || null,
        description: (vl.description || "").trim(),
        noOfBoxes,
        producedQty,
        weight: weight,
        totalWeight: totalWeightCalc,
      };
    }).filter((vl) => !vl.isDeleted && (vl.description || vl.noOfBoxes > 0 || vl.variantId));

    return {
      _id: grp._id && mongoose.isValidObjectId(grp._id) ? grp._id : undefined,
      plainBottleName,
      plainBottleId: grp.plainBottleId && mongoose.isValidObjectId(grp.plainBottleId) ? grp.plainBottleId : null,
      bottleSpecId: grp.bottleSpecId && mongoose.isValidObjectId(grp.bottleSpecId) ? grp.bottleSpecId : null,
      unit,
      variantLines,
    };
  }).filter((g) => g.plainBottleName && g.variantLines.length > 0);

  return {
    groups: sanitizedGroups,
    summary: {
      totalBoxes,
      totalProducedQty,
      totalWeight: hasValidWeight ? parseFloat(totalWeight.toFixed(3)) : null,
    },
  };
};

// 0. GET COMPANIES SUMMARY
exports.getCompaniesSummary = async (req, res) => {
  try {
    const { search } = req.query;

    const companyFilter = { isDeleted: { $ne: true } };
    if (search && search.trim()) {
      companyFilter.name = { $regex: search.trim(), $options: "i" };
    }

    const companies = await Company.find(companyFilter)
      .select("name code shortName status")
      .sort({ name: 1 })
      .lean();

    const rtdStats = await ReadyToDispatch.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$companyId",
          sheetCount: { $sum: 1 },
          latestSheetDate: { $max: "$dispatchDate" },
          totalBoxes: { $sum: "$summary.totalBoxes" },
          totalProducedQty: { $sum: "$summary.totalProducedQty" },
          totalWeight: { $sum: "$summary.totalWeight" },
        },
      },
    ]);

    const statsMap = new Map();
    for (const stat of rtdStats) {
      if (stat._id) {
        statsMap.set(stat._id.toString(), stat);
      }
    }

    const data = companies.map((c) => {
      const s = statsMap.get(c._id.toString()) || {};
      return {
        _id: c._id,
        name: c.name,
        code: c.code || "",
        shortName: c.shortName || "",
        status: c.status,
        isShreno: c.name?.trim().toUpperCase() === "SHRENO",
        sheetCount: s.sheetCount || 0,
        latestSheetDate: s.latestSheetDate || null,
        totalBoxes: s.totalBoxes || 0,
        totalProducedQty: s.totalProducedQty || 0,
        totalWeight: s.totalWeight != null ? parseFloat(s.totalWeight.toFixed(3)) : null,
      };
    });

    res.json({
      success: true,
      data,
      total: data.length,
    });
  } catch (err) {
    console.error("Error in getCompaniesSummary:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 0a. GET PLAIN BOTTLE OPTIONS FOR COMPANY
// GET /api/ready-to-dispatch/options/plain-bottles?companyId=
exports.getPlainBottleOptions = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId || !mongoose.isValidObjectId(companyId)) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const company = await Company.findById(companyId).lean();
    if (!company || company.isDeleted) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const brands = await Brand.find({ companyId, isDeleted: { $ne: true } }).select('_id name').lean();
    if (!brands.length) {
      return res.json({ success: true, data: [], total: 0 });
    }
    const brandIds = brands.map((b) => b._id);
    const brandMap = new Map(brands.map((b) => [b._id.toString(), b.name]));

    const specs = await BottleSpec.find({ brandId: { $in: brandIds }, isDeleted: { $ne: true } }).lean();
    if (!specs.length) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const bpbs = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
    const bpbMap = buildBpbLookupMap(bpbs);

    // Group specs by resolved plain bottle
    const pbMap = new Map(); // pbId -> { pb, printingSpecs: [], coatingSpecs: [] }

    for (const s of specs) {
      const pb = resolvePlainBottleFromMap(s.bottleName, bpbMap);
      if (!pb) continue;
      const pbId = pb._id.toString();
      if (!pbMap.has(pbId)) {
        pbMap.set(pbId, { pb, printingSpecs: [], coatingSpecs: [] });
      }
      const entry = pbMap.get(pbId);
      if (s.isCoating) {
        entry.coatingSpecs.push(s);
      } else {
        entry.printingSpecs.push(s);
      }
    }

    // Load variants for counting
    const allPrintingSpecIds = [];
    const allCoatingVariantIds = [];
    for (const entry of pbMap.values()) {
      for (const ps of entry.printingSpecs) allPrintingSpecIds.push(ps._id);
      for (const cs of entry.coatingSpecs) {
        if (cs.variantId) allCoatingVariantIds.push(cs.variantId);
      }
    }

    const [allPsVariants, allCsVariants] = await Promise.all([
      allPrintingSpecIds.length
        ? Variant.find({ bottleSpecId: { $in: allPrintingSpecIds }, isDeleted: { $ne: true } }).lean()
        : [],
      allCoatingVariantIds.length
        ? Variant.find({ _id: { $in: allCoatingVariantIds }, isDeleted: { $ne: true } }).lean()
        : [],
    ]);

    const variantsBySpecId = new Map();
    for (const v of allPsVariants) {
      const sid = v.bottleSpecId?.toString();
      if (!variantsBySpecId.has(sid)) variantsBySpecId.set(sid, []);
      variantsBySpecId.get(sid).push(v);
    }

    const variantById = new Map();
    for (const v of allCsVariants) {
      variantById.set(v._id.toString(), v);
    }

    const result = [];
    for (const [pbId, data] of pbMap.entries()) {
      const uniqueVariants = new Map();

      for (const ps of data.printingSpecs) {
        const psVars = variantsBySpecId.get(ps._id.toString()) || [];
        for (const v of psVars) {
          const vId = v._id.toString();
          const bId = ps.brandId.toString();
          const key = `${vId}_${bId}_${ps._id.toString()}`;
          uniqueVariants.set(key, true);
        }
      }

      for (const cs of data.coatingSpecs) {
        if (!cs.variantId) continue;
        const v = variantById.get(cs.variantId.toString());
        if (!v) continue;
        const vId = v._id.toString();
        const bId = cs.brandId.toString();
        const already = [...uniqueVariants.keys()].some((k) => k.startsWith(`${vId}_${bId}_`));
        if (!already) {
          const key = `${vId}_${bId}_${cs._id.toString()}`;
          uniqueVariants.set(key, true);
        }
      }

      result.push({
        id: pbId,
        name: data.pb.plainBottleName || data.pb.bottleName,
        variantCount: uniqueVariants.size,
        bottlePerBox: data.pb.bottlePerBox !== undefined ? data.pb.bottlePerBox : null,
        boxWeight: data.pb.boxWeight !== undefined ? data.pb.boxWeight : null,
        specCount: data.printingSpecs.length + data.coatingSpecs.length,
      });
    }

    // Sort in natural ascending order (e.g. 3 ML, 8 ML, 10 ML, 100 ML)
    result.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: "base" })
    );

    res.json({
      success: true,
      data: result,
      total: result.length,
    });
  } catch (err) {
    console.error("Error in getPlainBottleOptions:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 0b. GET VARIANT OPTIONS FOR COMPANY & PLAIN BOTTLE
// GET /api/ready-to-dispatch/options/variants?companyId=&plainBottleId=
exports.getVariantOptions = async (req, res) => {
  try {
    const { companyId, plainBottleId } = req.query;

    if (!companyId || !plainBottleId) {
      return res.status(400).json({
        success: false,
        message: "companyId and plainBottleId are required",
      });
    }

    if (!mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid companyId format",
      });
    }

    const company = await Company.findById(companyId).lean();
    if (!company || company.isDeleted) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const bpbs = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
    const bpbMap = buildBpbLookupMap(bpbs);

    // Resolve target plain bottle document
    let targetBpb = null;
    if (mongoose.isValidObjectId(plainBottleId)) {
      targetBpb = bpbs.find((b) => b._id.toString() === plainBottleId.toString());
    }
    if (!targetBpb) {
      targetBpb = resolvePlainBottleFromMap(plainBottleId, bpbMap);
    }

    if (!targetBpb) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const targetBpbId = targetBpb._id.toString();

    // Find brands for this company
    const brands = await Brand.find({ companyId, isDeleted: { $ne: true } }).select('_id name').lean();
    if (!brands.length) {
      return res.json({ success: true, data: [], total: 0 });
    }
    const brandIds = brands.map((b) => b._id);
    const brandMap = new Map(brands.map((b) => [b._id.toString(), b.name]));

    // Find specs for these brands that resolve to target plain bottle
    const specs = await BottleSpec.find({ brandId: { $in: brandIds }, isDeleted: { $ne: true } }).lean();
    const matchingSpecs = specs.filter((s) => {
      const resolved = resolvePlainBottleFromMap(s.bottleName, bpbMap);
      return resolved && resolved._id.toString() === targetBpbId;
    });

    if (!matchingSpecs.length) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const printingSpecs = matchingSpecs.filter((s) => !s.isCoating);
    const coatingSpecs = matchingSpecs.filter((s) => s.isCoating);

    const variantRows = new Map(); // uniqueKey -> row

    // 1. From printing specs
    for (const ps of printingSpecs) {
      const brandId = ps.brandId.toString();
      const brandName = brandMap.get(brandId) || '';
      const psVariants = await Variant.find({ bottleSpecId: ps._id, isDeleted: { $ne: true } }).lean();

      for (const v of psVariants) {
        const variantId = v._id.toString();
        const specId = ps._id.toString();
        const uniqueKey = `${variantId}_${brandId}_${specId}`;

        variantRows.set(uniqueKey, {
          variantId,
          brandId,
          brandName,
          bottleSpecId: specId,
          variantName: v.variantName || v.productName || '',
          coatingShade: v.coatingShade || '',
          textColor: (v.detectedTextColor && v.detectedTextColor !== 'Not Detected') ? v.detectedTextColor : '',
          specCode: ps.code || '',
          specBottleName: ps.bottleName || '',
          uniqueKey,
        });
      }
    }

    // 2. From coating specs (if not already present under this brand & variant)
    for (const cs of coatingSpecs) {
      if (!cs.variantId) continue;
      const v = await Variant.findOne({ _id: cs.variantId, isDeleted: { $ne: true } }).lean();
      if (!v) continue;

      const variantId = v._id.toString();
      const brandId = cs.brandId.toString();
      const brandName = brandMap.get(brandId) || '';

      const alreadyAdded = [...variantRows.values()].some(
        (row) => row.variantId === variantId && row.brandId === brandId
      );

      if (!alreadyAdded) {
        const specId = cs._id.toString();
        const uniqueKey = `${variantId}_${brandId}_${specId}`;
        variantRows.set(uniqueKey, {
          variantId,
          brandId,
          brandName,
          bottleSpecId: specId,
          variantName: v.variantName || v.productName || '',
          coatingShade: cs.coatingShade || v.coatingShade || '',
          textColor: (v.detectedTextColor && v.detectedTextColor !== 'Not Detected') ? v.detectedTextColor : '',
          specCode: cs.code || '',
          specBottleName: cs.bottleName || '',
          uniqueKey,
        });
      }
    }

    const result = Array.from(variantRows.values());
    // Sort by brandName, then variantName
    result.sort((a, b) => {
      const bComp = (a.brandName || "").localeCompare(b.brandName || "");
      if (bComp !== 0) return bComp;
      return (a.variantName || "").localeCompare(b.variantName || "");
    });

    res.json({
      success: true,
      data: result,
      total: result.length,
    });
  } catch (err) {
    console.error("Error in getVariantOptions:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 1. GET ALL READY TO DISPATCH
exports.getAllReadyToDispatch = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      pagination = "true",
      companyId,
      dateFrom,
      dateTo,
      fromDate,
      toDate,
      bottleName,
      plainBottleName,
    } = req.query;

    const query = { isDeleted: false };

    if (companyId && mongoose.isValidObjectId(companyId)) {
      query.companyId = companyId;
    }

    const from = dateFrom || fromDate;
    const to = dateTo || toDate;
    if (from || to) {
      query.dispatchDate = {};
      if (from) {
        query.dispatchDate.$gte = new Date(from);
      }
      if (to) {
        const toDateObj = new Date(to);
        toDateObj.setHours(23, 59, 59, 999);
        query.dispatchDate.$lte = toDateObj;
      }
    }

    const targetBottle = bottleName || plainBottleName;
    if (targetBottle && targetBottle.trim()) {
      const bTrim = targetBottle.trim();
      if (mongoose.isValidObjectId(bTrim)) {
        const bp = await BottlePerBox.findById(bTrim);
        if (bp) {
          const names = [bp.bottleName, bp.plainBottleName, ...(bp.bottleNames || [])].filter(Boolean);
          query["groups.plainBottleName"] = { $in: names.map((n) => new RegExp("^" + n.trim() + "$", "i")) };
        } else {
          query.$or = [
            ...(query.$or || []),
            { "groups.bottleSpecId": bTrim },
            { "groups.plainBottleName": bTrim },
          ];
        }
      } else {
        query["groups.plainBottleName"] = { $regex: new RegExp("^" + bTrim + "$", "i") };
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { sheetTitle: searchRegex },
        { remarks: searchRegex },
        { "groups.plainBottleName": searchRegex },
        { "groups.variantLines.description": searchRegex },
        { "groups.variantLines.brandName": searchRegex },
      ];
    }

    const total = await ReadyToDispatch.countDocuments(query);

    const populateOpts = [
      { path: "companyId", select: "name code shortName" },
      { path: "createdBy", select: "name email" },
      { path: "groups.variantLines.brandId", select: "name" },
    ];

    if (pagination === "false") {
      const records = await ReadyToDispatch.find(query)
        .populate(populateOpts)
        .sort({ dispatchDate: -1, createdAt: -1 });

      return res.json({
        success: true,
        data: records,
        total,
      });
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (parsedPage - 1) * parsedLimit;

    const records = await ReadyToDispatch.find(query)
      .populate(populateOpts)
      .sort({ dispatchDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);

    // Calculate aggregated overall stats for query
    const statsAgg = await ReadyToDispatch.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          grandTotalBoxes: { $sum: "$summary.totalBoxes" },
          grandTotalProducedQty: { $sum: "$summary.totalProducedQty" },
          grandTotalWeight: { $sum: "$summary.totalWeight" },
        },
      },
    ]);

    const stats = statsAgg[0] || {
      grandTotalBoxes: 0,
      grandTotalProducedQty: 0,
      grandTotalWeight: 0,
    };

    res.json({
      success: true,
      data: records,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      stats: {
        grandTotalBoxes: stats.grandTotalBoxes,
        grandTotalProducedQty: stats.grandTotalProducedQty,
        grandTotalWeight: parseFloat((stats.grandTotalWeight || 0).toFixed(3)),
      },
    });
  } catch (err) {
    console.error("Error in getAllReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. GET BY ID
exports.getReadyToDispatchById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const doc = await ReadyToDispatch.findOne({ _id: id, isDeleted: false })
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email")
      .populate("groups.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.variantId", "variantName coatingShade detectedTextColor")
      .populate("groups.variantLines.brandId", "name")
      .lean(false);  // Ensure full document with all embedded fields

    if (!doc) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (err) {
    console.error("Error in getReadyToDispatchById:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. CREATE READY TO DISPATCH
exports.createReadyToDispatch = async (req, res) => {
  try {
    const { companyId, dispatchDate, sheetTitle, remarks, groups } = req.body;

    if (!companyId || !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: "Valid Company is required" });
    }

    if (!dispatchDate) {
      return res.status(400).json({ success: false, message: "Dispatch Date is required" });
    }

    const { groups: sanitizedGroups, summary } = computeGroupsAndSummary(groups);

    if (!sanitizedGroups || sanitizedGroups.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one Plain Bottle with variant items is required",
      });
    }

    // Determine sheetTitle if empty
    let title = (sheetTitle || "").trim();
    if (!title) {
      const company = await Company.findById(companyId);
      const cName = company ? (company.shortName || company.name) : "TPP";
      title = `${cName} - ready to dispatch material`;
    }

    const doc = new ReadyToDispatch({
      companyId,
      dispatchDate: new Date(dispatchDate),
      sheetTitle: title,
      remarks: remarks || "",
      groups: sanitizedGroups,
      summary,
      createdBy: req.user?.id || req.body.createdBy || null,
    });

    await doc.save();

    const populated = await ReadyToDispatch.findById(doc._id)
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email")
      .populate("groups.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.variantId", "variantName coatingShade detectedTextColor")
      .populate("groups.variantLines.brandId", "name")
      .lean(false);  // Ensure full document with all embedded fields

    res.status(201).json({
      success: true,
      message: "Ready to Dispatch record created successfully",
      data: populated,
    });
  } catch (err) {
    console.error("Error in createReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. UPDATE READY TO DISPATCH
exports.updateReadyToDispatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const existing = await ReadyToDispatch.findOne({ _id: id, isDeleted: false });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    const { companyId, dispatchDate, sheetTitle, remarks, groups } = req.body;

    if (companyId && !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: "Invalid Company ID" });
    }

    // Track lines that will be removed for cleanup hook
    const clearedMarks = [];

    // Before updating groups, detect line removals (cleanup hook)
    if (groups) {
      const oldLineMap = new Map();
      existing.groups.forEach((grp) => {
        grp.variantLines.forEach((line) => {
          if (line._id) {
            oldLineMap.set(line._id.toString(), line);
          }
        });
      });

      const newLineIds = new Set();
      const newGroups = Array.isArray(groups) ? groups : [];
      newGroups.forEach((grp) => {
        (grp.variantLines || []).forEach((line) => {
          const lId = line._id || line.id;
          if (lId) {
            newLineIds.add(lId.toString());
          }
        });
      });

      // Find removed lines
      for (const [oldLineId, oldLine] of oldLineMap.entries()) {
        if (!newLineIds.has(oldLineId)) {
          // Line was removed - call cleanup hook
          const affected = await exports.clearMarkForLine(id, oldLineId, oldLine.sourcePlanType, oldLine.sourcePlanId);
          if (affected) {
            clearedMarks.push({
              lineId: oldLineId,
              planType: affected.planType,
              planId: affected.planId,
              bottleName: affected.bottleName,
            });
          }
        }
      }
    }

    if (companyId) existing.companyId = companyId;
    if (dispatchDate) existing.dispatchDate = new Date(dispatchDate);
    if (sheetTitle !== undefined) existing.sheetTitle = sheetTitle.trim();
    if (remarks !== undefined) existing.remarks = remarks;

    if (groups) {
      const { groups: sanitizedGroups, summary } = computeGroupsAndSummary(groups);
      if (sanitizedGroups.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one Plain Bottle with variant items is required",
        });
      }
      existing.groups = sanitizedGroups;
      existing.summary = summary;
    }

    await existing.save();

    const updated = await ReadyToDispatch.findById(existing._id)
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email")
      .populate("groups.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.variantId", "variantName coatingShade detectedTextColor")
      .populate("groups.variantLines.brandId", "name")
      .lean(false);  // Ensure full document with all embedded fields

    res.json({
      success: true,
      message: "Ready to Dispatch record updated successfully",
      data: updated,
      clearedMarksCount: clearedMarks.length,
      clearedMarks: clearedMarks.length > 0 ? clearedMarks : undefined,
    });
  } catch (err) {
    console.error("Error in updateReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// HELPER: Find all plan rows affected by a Ready To Dispatch sheet deletion
const findAffectedPlanRows = async (sheetId) => {
  try {
    if (!sheetId) {
      return { total: 0, lacquerCount: 0, printingCount: 0, rows: [] };
    }
    const sheetObjId = mongoose.isValidObjectId(sheetId) ? new mongoose.Types.ObjectId(sheetId) : null;
    const sheetStr = sheetId.toString();
    const sheetFilter = sheetObjId ? { $in: [sheetObjId, sheetStr] } : sheetStr;

    const lacquerRows = await LacquerPlan.find(
      { "readyToDispatch.sheetId": sheetFilter, isDeleted: false },
      { _id: 1, bottleName: 1, planDate: 1, coatingCompletedQty: 1, orderQty: 1 }
    );

    const printingRows = await PrintingPlan.find(
      { "readyToDispatch.sheetId": sheetFilter, isDeleted: false },
      { _id: 1, bottleName: 1, plainBottleName: 1, planDate: 1, producedQty: 1, orderQty: 1 }
    );

    const rows = [
      ...lacquerRows.map((row) => ({
        planType: "lacquer",
        planId: row._id,
        bottleName: row.bottleName,
        date: row.planDate,
        producedQty: row.coatingCompletedQty,
      })),
      ...printingRows.map((row) => ({
        planType: "printing",
        planId: row._id,
        bottleName: row.plainBottleName || row.bottleName,
        date: row.planDate,
        producedQty: row.producedQty,
      })),
    ];

    return {
      total: rows.length,
      lacquerCount: lacquerRows.length,
      printingCount: printingRows.length,
      rows,
    };
  } catch (err) {
    console.error("Error in findAffectedPlanRows:", err);
    return { total: 0, lacquerCount: 0, printingCount: 0, rows: [] };
  }
};

// HELPER: Find all plan rows affected by specific line deletion
const findAffectedPlanRowsForLine = async (sheetId, lineId) => {
  try {
    if (!sheetId || !lineId) {
      return { planId: null, planType: null };
    }
    const sheetObjId = mongoose.isValidObjectId(sheetId) ? new mongoose.Types.ObjectId(sheetId) : null;
    const sheetStr = sheetId.toString();
    const sheetFilter = sheetObjId ? { $in: [sheetObjId, sheetStr] } : sheetStr;

    const lineObjId = mongoose.isValidObjectId(lineId) ? new mongoose.Types.ObjectId(lineId) : null;
    const lineStr = lineId.toString();
    const lineFilter = lineObjId ? { $in: [lineObjId, lineStr] } : lineStr;

    // Query both LacquerPlan and PrintingPlan for rows that reference this specific line
    const lacquerRow = await LacquerPlan.findOne(
      {
        "readyToDispatch.sheetId": sheetFilter,
        "readyToDispatch.lineId": lineFilter,
        isDeleted: false,
      },
      { _id: 1, bottleName: 1, planDate: 1 }
    );

    if (lacquerRow) {
      return { planId: lacquerRow._id, planType: "lacquer", bottleName: lacquerRow.bottleName };
    }

    const printingRow = await PrintingPlan.findOne(
      {
        "readyToDispatch.sheetId": sheetFilter,
        "readyToDispatch.lineId": lineFilter,
        isDeleted: false,
      },
      { _id: 1, plainBottleName: 1, bottleName: 1, planDate: 1 }
    );

    if (printingRow) {
      return {
        planId: printingRow._id,
        planType: "printing",
        bottleName: printingRow.plainBottleName || printingRow.bottleName,
      };
    }

    return { planId: null, planType: null };
  } catch (err) {
    console.error("Error in findAffectedPlanRowsForLine:", err);
    return { planId: null, planType: null };
  }
};

// HELPER: Clear mark from specific line and report which plan row was affected
exports.clearMarkForLine = async (sheetId, lineId, sourcePlanType, sourcePlanId) => {
  try {
    if (sourcePlanType && sourcePlanId) {
      await exports.clearPlanRowMark(sourcePlanType, sourcePlanId);
      return { planId: sourcePlanId, planType: sourcePlanType };
    }

    // Find the plan row that references this line
    const affectedRow = await findAffectedPlanRowsForLine(sheetId, lineId);

    // Clear the mark if found
    if (affectedRow.planId && affectedRow.planType) {
      await exports.clearPlanRowMark(affectedRow.planType, affectedRow.planId);
      return affectedRow;
    }

    return null;
  } catch (err) {
    console.error("Error in clearMarkForLine:", err);
    return null;
  }
};

exports.deleteReadyToDispatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    // Fetch the sheet first to get all lines before deletion
    const sheetToDelete = await ReadyToDispatch.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!sheetToDelete) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    // Clear marks for any lines explicitly tracking sourcePlanId
    for (const grp of sheetToDelete.groups || []) {
      for (const line of grp.variantLines || []) {
        if (line.sourcePlanType && line.sourcePlanId) {
          await exports.clearPlanRowMark(line.sourcePlanType, line.sourcePlanId);
        }
      }
    }

    // Find all affected plan rows that reference this sheet
    const affectedRows = await findAffectedPlanRows(id);

    // Clear marks from all plan rows that reference this sheet (cleanup hook)
    await exports.clearMarksForSheet(id);

    // Soft delete the sheet
    const doc = await ReadyToDispatch.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );

    res.json({
      success: true,
      message: "Record deleted successfully",
      clearedMarksCount: affectedRows.total,
      affectedPlans: {
        lacquerCount: affectedRows.lacquerCount,
        printingCount: affectedRows.printingCount,
        rows: affectedRows.rows,
      },
    });
  } catch (err) {
    console.error("Error in deleteReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// HELPER: Clear readyToDispatch mark from a plan row
exports.clearPlanRowMark = async (planType, planId) => {
  try {
    if (!mongoose.isValidObjectId(planId)) return;

    const Model = planType === "lacquer" ? LacquerPlan : PrintingPlan;
    await Model.findByIdAndUpdate(planId, { readyToDispatch: null });
  } catch (err) {
    console.error(`Error clearing mark for ${planType} plan ${planId}:`, err);
  }
};

// HELPER: Clear readyToDispatch marks from all plan rows referencing a sheet
exports.clearMarksForSheet = async (sheetId) => {
  try {
    if (!sheetId) return;
    const sheetObjId = mongoose.isValidObjectId(sheetId) ? new mongoose.Types.ObjectId(sheetId) : null;
    const sheetStr = sheetId.toString();
    const sheetFilter = sheetObjId ? { $in: [sheetObjId, sheetStr] } : sheetStr;

    // Clear from both LacquerPlan and PrintingPlan
    await LacquerPlan.updateMany(
      { "readyToDispatch.sheetId": sheetFilter },
      { readyToDispatch: null }
    );

    await PrintingPlan.updateMany(
      { "readyToDispatch.sheetId": sheetFilter },
      { readyToDispatch: null }
    );
  } catch (err) {
    console.error(`Error clearing marks for sheet ${sheetId}:`, err);
  }
};

// In-flight request lock to prevent race conditions on simultaneous clicks
const inFlightPlanSends = new Set();

// HELPER: Lookup unit and weight from BottlePerBox master
const getBottlePerBoxData = async (plainBottleName) => {
  try {
    if (!plainBottleName) return { unit: 0, weight: null, notFound: true };

    const clean = plainBottleName.trim().replace(/\s+/g, " ");
    const regexExact = new RegExp(`^${clean}$`, "i");

    // Search all matching records in BottlePerBox master
    const allMatches = await BottlePerBox.find({
      $or: [
        { plainBottleName: regexExact },
        { bottleName: regexExact },
        { bottleNames: regexExact },
        { plainBottleName: new RegExp(clean, "i") },
        { bottleName: new RegExp(clean, "i") },
        { bottleNames: new RegExp(clean, "i") },
      ],
      isDeleted: false,
    }).lean();

    if (allMatches.length === 0) {
      return { unit: 0, weight: null, notFound: true };
    }

    // Prefer exact match for plainBottleName / bottleName
    let exactMatch = allMatches.find(
      (b) =>
        (b.plainBottleName && b.plainBottleName.trim().toLowerCase() === clean.toLowerCase()) ||
        (b.bottleName && b.bottleName.trim().toLowerCase() === clean.toLowerCase())
    );
    if (!exactMatch) exactMatch = allMatches[0];

    const unit = exactMatch.bottlePerBox || 0;

    // Take weight from exact record if present, else first record that has one
    let boxWeight = null;
    if (exactMatch.boxWeight !== null && exactMatch.boxWeight !== undefined && exactMatch.boxWeight !== "") {
      boxWeight = Number(exactMatch.boxWeight);
    } else {
      const withWeight = allMatches.find(
        (b) => b.boxWeight !== null && b.boxWeight !== undefined && b.boxWeight !== ""
      );
      if (withWeight) {
        boxWeight = Number(withWeight.boxWeight);
      }
    }

    return { unit, weight: boxWeight, notFound: false };
  } catch (err) {
    console.error("Error in getBottlePerBoxData:", err);
    return { unit: 0, weight: null, notFound: true };
  }
};

// 6. CREATE FROM PLAN - Main endpoint
// IDEMPOTENT: If same plan row sent multiple times, only one line is created
exports.createFromPlan = async (req, res) => {
  const { source, planId } = req.body;

  // Validate input
  if (!source || !["lacquer", "printing"].includes(source)) {
    return res.status(400).json({
      success: false,
      message: "Valid source ('lacquer' or 'printing') is required",
    });
  }

  if (!planId || !mongoose.isValidObjectId(planId)) {
    return res.status(400).json({
      success: false,
      message: "Valid planId is required",
    });
  }

  const Model = source === "lacquer" ? LacquerPlan : PrintingPlan;

  // Concurrency Lock: Prevent duplicate creation if two clicks arrive at once
  const lockKey = `${source}_${planId}`;
  if (inFlightPlanSends.has(lockKey)) {
    let waited = 0;
    while (inFlightPlanSends.has(lockKey) && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    const reloaded = await Model.findById(planId).lean();
    if (reloaded && reloaded.readyToDispatch?.sheetId) {
      return res.json({
        success: true,
        message: "Already sent",
        data: {
          sheetId: reloaded.readyToDispatch.sheetId,
          lineId: reloaded.readyToDispatch.lineId,
          isExisting: true,
        },
      });
    }
  }

  inFlightPlanSends.add(lockKey);

  try {
    // Fetch plan row
    let planQuery = Model.findById(planId).populate("brandId");
    if (source === "lacquer") {
      planQuery = planQuery.populate("variantId");
    }
    const planRow = await planQuery;

    if (!planRow) {
      return res.status(404).json({ success: false, message: "Plan row not found" });
    }

    if (planRow.isDeleted) {
      return res.status(400).json({ success: false, message: "Plan row is deleted" });
    }

    // Normalized plain bottle name
    let plainBottleName = (planRow.plainBottle || planRow.plainBottleName || planRow.bottleName || "").trim().replace(/\s+/g, " ");

    // Brand from plan row
    let brandId = planRow.brandId?._id || planRow.brandId || null;
    let brandName = planRow.brandName || planRow.brandId?.name || null;
    if (!brandName && brandId) {
      const bDoc = await Brand.findById(brandId).lean();
      if (bDoc) brandName = bDoc.name;
    }

    // Build variant description
    let variantId = null;
    let vName = "";
    let textColor = "";

    if (source === "lacquer") {
      let variantDoc = planRow.variantId;
      if (variantDoc && typeof variantDoc === "object" && variantDoc._id) {
        variantId = variantDoc._id;
      } else if (variantDoc && mongoose.isValidObjectId(variantDoc)) {
        variantId = variantDoc;
        variantDoc = await Variant.findById(variantDoc).lean();
      }
      vName = planRow.variantName || (variantDoc ? (variantDoc.variantName || variantDoc.name) : "") || "";
      textColor =
        variantDoc && variantDoc.detectedTextColor && variantDoc.detectedTextColor !== "Not Detected"
          ? variantDoc.detectedTextColor
          : "";
    } else {
      // Printing row: printingVariant, textColor, printingToBeDone
      vName = planRow.printingVariant || planRow.variantName || planRow.printingToBeDone || "";
      textColor = planRow.textColor && planRow.textColor !== "Not Detected" ? planRow.textColor : "";
    }

    const shade = planRow.coatingShade || planRow.shade || "";
    const descParts = [shade, vName, textColor].map((s) => String(s || "").trim()).filter(Boolean);
    let variantDescription = descParts.join(" - ");
    if (!variantDescription && shade) {
      variantDescription = shade;
    }

    // IDEMPOTENT GUARD 1: Check plan row mark
    if (planRow.readyToDispatch && planRow.readyToDispatch.sheetId) {
      const { sheetId, lineId } = planRow.readyToDispatch;

      if (mongoose.isValidObjectId(sheetId)) {
        const sheet = await ReadyToDispatch.findOne({
          _id: sheetId,
          isDeleted: false,
        });

        if (sheet) {
          let existingLine = null;
          for (const grp of sheet.groups) {
            for (const line of grp.variantLines) {
              if (
                (lineId && line._id?.toString() === lineId.toString()) ||
                (line.sourcePlanId?.toString() === planId.toString() && line.sourcePlanType === source)
              ) {
                existingLine = line;
                break;
              }
            }
            if (existingLine) break;
          }

          if (existingLine) {
            return res.json({
              success: true,
              message: "Already sent",
              data: {
                sheetId,
                lineId: existingLine._id,
                isExisting: true,
                bottleName: plainBottleName,
                variantName: existingLine.description || variantDescription,
                brandName: existingLine.brandName || brandName || "N/A",
              },
            });
          }
        }
      }

      // Mark stale - line was deleted, clear and proceed to recreate
      await exports.clearPlanRowMark(source, planId);
    }

    // IDEMPOTENT GUARD 2: Search by sourcePlanId in active sheets
    const existingSheetWithLine = await ReadyToDispatch.findOne({
      companyId: planRow.companyId,
      isDeleted: false,
      "groups.variantLines.sourcePlanId": planRow._id,
      "groups.variantLines.sourcePlanType": source,
    });

    if (existingSheetWithLine) {
      let existingLine = null;
      for (const grp of existingSheetWithLine.groups) {
        for (const line of grp.variantLines) {
          if (line.sourcePlanId?.toString() === planId.toString() && line.sourcePlanType === source) {
            existingLine = line;
            break;
          }
        }
        if (existingLine) break;
      }

      if (existingLine) {
        await Model.findByIdAndUpdate(planId, {
          readyToDispatch: {
            sheetId: existingSheetWithLine._id,
            lineId: existingLine._id,
            sentAt: new Date(),
          },
        });

        return res.json({
          success: true,
          message: "Already sent",
          data: {
            sheetId: existingSheetWithLine._id,
            lineId: existingLine._id,
            isExisting: true,
            bottleName: plainBottleName,
            variantName: existingLine.description || variantDescription,
            brandName: existingLine.brandName || brandName || "N/A",
          },
        });
      }
    }

    // Lookup unit and weight from BottlePerBox master
    const bottleMaster = await getBottlePerBoxData(plainBottleName);
    const unit = bottleMaster.unit || 0;
    const boxWeight = bottleMaster.weight; // null if no weight

    // Calculate number of boxes
    let noOfBoxes = 0;
    let hasZeroBoxWarning = false;

    if (source === "lacquer") {
      if (planRow.noOfBoxes !== null && planRow.noOfBoxes !== undefined && Number(planRow.noOfBoxes) > 0) {
        noOfBoxes = Number(planRow.noOfBoxes);
      } else if (unit > 0 && planRow.coatingCompletedQty > 0) {
        noOfBoxes = Math.ceil(planRow.coatingCompletedQty / unit);
      } else {
        noOfBoxes = 0;
        hasZeroBoxWarning = true;
      }
    } else {
      if (planRow.readyBoxes !== null && planRow.readyBoxes !== undefined && Number(planRow.readyBoxes) > 0) {
        noOfBoxes = Number(planRow.readyBoxes);
      } else if (planRow.noOfBoxes !== null && planRow.noOfBoxes !== undefined && Number(planRow.noOfBoxes) > 0) {
        noOfBoxes = Number(planRow.noOfBoxes);
      } else if (unit > 0 && (planRow.producedQty > 0 || planRow.printedQty > 0)) {
        noOfBoxes = Math.ceil((planRow.producedQty || planRow.printedQty || 0) / unit);
      } else {
        noOfBoxes = 0;
        hasZeroBoxWarning = true;
      }
    }

    // Calculations
    const producedQtyCalc = unit > 0 ? noOfBoxes * unit : 0;
    const totalWeightCalc =
      boxWeight !== null && boxWeight > 0 && noOfBoxes > 0
        ? parseFloat((noOfBoxes * boxWeight).toFixed(3))
        : null;

    // Warnings
    const warnings = [];
    if (hasZeroBoxWarning) {
      warnings.push("Boxes could not be determined, please edit");
    }
    if (bottleMaster.notFound) {
      warnings.push(`Bottle ${plainBottleName} has no BottlePerBox master record`);
    }
    if (boxWeight === null) {
      warnings.push(`Weight missing for ${plainBottleName}`);
    }

    // Find or create sheet for (companyId, dispatchDate)
    const companyId = planRow.companyId;
    const dispatchDate = planRow.planDate;

    let sheet = await ReadyToDispatch.findOne({
      companyId,
      dispatchDate,
      isDeleted: false,
    });

    if (!sheet) {
      const company = await Company.findById(companyId);
      const defaultTitle = `${company?.shortName || company?.name || "TPP"} - ready to dispatch material`;

      sheet = new ReadyToDispatch({
        companyId,
        dispatchDate,
        sheetTitle: defaultTitle,
        remarks: "",
        groups: [],
        summary: { totalBoxes: 0, totalProducedQty: 0, totalWeight: null },
      });

      await sheet.save();
    }

    // Find or create group for plain bottle
    let group = sheet.groups.find(
      (g) => g.plainBottleName.trim().toLowerCase() === plainBottleName.toLowerCase()
    );

    if (!group) {
      sheet.groups.push({
        _id: new mongoose.Types.ObjectId(),
        plainBottleName,
        bottleSpecId: null,
        unit: unit > 0 ? unit : 0,
        variantLines: [],
      });
      group = sheet.groups[sheet.groups.length - 1];
    } else if (unit > 0 && (!group.unit || group.unit === 0)) {
      group.unit = unit;
    }

    // Create line with explicit _id
    const variantLineId = new mongoose.Types.ObjectId();
    const newLine = {
      _id: variantLineId,
      sourcePlanType: source,
      sourcePlanId: planRow._id,
      variantId: variantId,
      brandId: brandId,
      brandName: brandName,
      description: variantDescription,
      noOfBoxes: noOfBoxes,
      producedQty: producedQtyCalc,
      weight: boxWeight,
      totalWeight: totalWeightCalc,
    };

    group.variantLines.push(newLine);

    // Recalculate summary
    const { summary } = computeGroupsAndSummary(sheet.groups);
    sheet.summary = summary;

    await sheet.save();

    // Update plan row mark
    await Model.findByIdAndUpdate(planId, {
      readyToDispatch: {
        sheetId: sheet._id,
        lineId: variantLineId,
        sentAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Row sent to Ready To Dispatch successfully",
      data: {
        sheetId: sheet._id,
        lineId: variantLineId,
        isExisting: false,
        bottleName: plainBottleName,
        variantName: variantDescription,
        brandName: brandName || "N/A",
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (err) {
    console.error("Error in createFromPlan:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    inFlightPlanSends.delete(lockKey);
  }
};
