const mongoose = require("mongoose");
const Company = require("../models/Company");
const Incoming = require("../models/Incoming");
const ShrenoIncoming = require("../models/ShrenoIncoming");
const Dispatch = require("../models/Dispatch");
const BottlePerBox = require("../models/BottlePerBox");
const BottleSpec = require("../models/Bottlespecs");
const { matchBottleNameFromMaster, normalizeBottleForMatching } = require("../utils/bottleMatching");

const SHRENO_COMPANY_ID = "6a17d6d3e933dc474615eb92";

/**
 * Check if a company ID or company document corresponds to SHRENO
 */
function isShrenoCompany(companyId, companyDoc) {
  if (!companyId) return false;
  if (String(companyId) === SHRENO_COMPANY_ID) return true;
  if (companyDoc && companyDoc.name && /shreno/i.test(companyDoc.name)) return true;
  return false;
}

/**
 * Helper to build bottle resolver cache
 */
async function getBottleMasterData() {
  const allBottlePerBoxes = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
  const idMap = new Map();
  for (const b of allBottlePerBoxes) {
    idMap.set(b._id.toString(), b);
  }
  return { allBottlePerBoxes, idMap };
}

/**
 * Resolve a bottle reference (ObjectId, string, or null) to a canonical BottlePerBox or unmatched entry
 */
function resolveBottleReference(bottleRef, allBottlePerBoxes, idMap) {
  if (!bottleRef) {
    return {
      bottleId: "unspecified",
      bottleName: "Unspecified Bottle",
      plainBottleName: "Unspecified Bottle",
      isUnmatched: true,
      rawRef: null
    };
  }

  // 1. If it's an ObjectId or 24-hex string
  const strRef = typeof bottleRef === 'object' && bottleRef._id ? bottleRef._id.toString() : String(bottleRef).trim();
  if (mongoose.Types.ObjectId.isValid(strRef) && idMap.has(strRef)) {
    const b = idMap.get(strRef);
    return {
      bottleId: b._id.toString(),
      bottleName: b.bottleName || b.plainBottleName || "Unnamed Bottle",
      plainBottleName: b.plainBottleName || b.bottleName || "Unnamed Bottle",
      isUnmatched: false,
      rawRef: strRef
    };
  }

  // 2. If it's a string name or text (or ObjectId not in BottlePerBox)
  const matchResult = matchBottleNameFromMaster(strRef, allBottlePerBoxes);
  if (!matchResult.unmatched && matchResult.bottleName && matchResult.bottleName !== 'MISSING') {
    const matchedDoc = allBottlePerBoxes.find(b => b.bottleName === matchResult.bottleName);
    if (matchedDoc) {
      return {
        bottleId: matchedDoc._id.toString(),
        bottleName: matchedDoc.bottleName,
        plainBottleName: matchedDoc.plainBottleName || matchedDoc.bottleName,
        isUnmatched: false,
        rawRef: strRef
      };
    }
  }

  // 3. Fallback: flag as unmatched bottle so it is NEVER silently dropped
  const cleanName = strRef.length > 50 ? strRef.substring(0, 50) + "..." : strRef;
  return {
    bottleId: `unmatched_${encodeURIComponent(cleanName)}`,
    bottleName: cleanName,
    plainBottleName: cleanName,
    isUnmatched: true,
    rawRef: strRef
  };
}

/**
 * GET /api/summary/companies
 * Get all active companies with SHRENO flag and record indicators
 */
exports.getSummaryCompanies = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { isDeleted: { $ne: true } };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const companies = await Company.find(query).sort({ name: 1 }).lean();

    const formatted = companies.map(c => ({
      _id: c._id,
      name: c.name,
      code: c.code || "",
      isShreno: isShrenoCompany(c._id, c),
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/summary/bottles?companyId=
 * Lists only that company's bottles (not every bottle in the system)
 * Returns bottles sorted with the most recently saved bottle first
 */
exports.getSummaryBottles = async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId parameter is required" });
    }

    const company = await Company.findById(companyId).lean();
    const isShreno = isShrenoCompany(companyId, company);
    const { allBottlePerBoxes, idMap } = await getBottleMasterData();

    // Map: bottleId -> { _id, bottleName, plainBottleName, isUnmatched, latestDate }
    const companyBottleMap = new Map();

    const recordBottleUsage = (resolved, date) => {
      if (!resolved || !resolved.bottleId) return;
      const key = resolved.bottleId;
      const recordDate = date ? new Date(date).getTime() : 0;
      if (companyBottleMap.has(key)) {
        const existing = companyBottleMap.get(key);
        if (recordDate > existing.latestTimestamp) {
          existing.latestTimestamp = recordDate;
          existing.latestDate = date;
        }
      } else {
        companyBottleMap.set(key, {
          _id: resolved.bottleId,
          bottleName: resolved.bottleName,
          plainBottleName: resolved.plainBottleName,
          isUnmatched: resolved.isUnmatched,
          latestDate: date,
          latestTimestamp: recordDate
        });
      }
    };

    // 1. Check Incoming records for this company
    const incomingRecords = await Incoming.find({
      billToId: companyId,
      isDeleted: { $ne: true }
    }).select("documentDate date createdAt items").lean();

    for (const inc of incomingRecords) {
      const incDate = inc.documentDate || inc.date || inc.createdAt;
      for (const item of inc.items || []) {
        const resolved = resolveBottleReference(item.bottleId, allBottlePerBoxes, idMap);
        recordBottleUsage(resolved, incDate);
      }
    }

    // 2. Check Dispatch records for this company
    const dispatchRecords = await Dispatch.find({
      companyId: companyId,
      isDeleted: { $ne: true }
    }).select("dispatchDate createdAt items").lean();

    for (const disp of dispatchRecords) {
      const dispDate = disp.dispatchDate || disp.createdAt;
      for (const item of disp.items || []) {
        const ref = item.bottleId || item.productName;
        const resolved = resolveBottleReference(ref, allBottlePerBoxes, idMap);
        recordBottleUsage(resolved, dispDate);
      }
    }

    // 3. If SHRENO, check ShrenoIncoming records
    if (isShreno) {
      const shrenoRecords = await ShrenoIncoming.find({
        isDeleted: { $ne: true }
      }).select("date createdAt items").lean();

      for (const inc of shrenoRecords) {
        const incDate = inc.date || inc.createdAt;
        for (const item of inc.items || []) {
          const resolved = resolveBottleReference(item.plainBottle, allBottlePerBoxes, idMap);
          recordBottleUsage(resolved, incDate);
        }
      }
    }

    // 4. Also check BottleSpecs associated with company's brands
    try {
      const bottleSpecs = await BottleSpec.find({
        companyId: companyId,
        isDeleted: { $ne: true }
      }).populate('brand').lean();

      for (const spec of bottleSpecs) {
        const ref = spec.plainBottle || spec.bottleName;
        if (ref) {
          const resolved = resolveBottleReference(ref, allBottlePerBoxes, idMap);
          recordBottleUsage(resolved, spec.updatedAt || spec.createdAt);
        }
      }
    } catch (_) {
      // Ignore spec query errors if schema differs
    }

    // Convert map to array and sort descending by latestTimestamp (most recent first)
    const bottles = Array.from(companyBottleMap.values()).sort((a, b) => {
      if (b.latestTimestamp !== a.latestTimestamp) {
        return b.latestTimestamp - a.latestTimestamp;
      }
      return (a.bottleName || "").localeCompare(b.bottleName || "");
    });

    const mostRecentBottleId = bottles.length > 0 ? bottles[0]._id : null;

    res.json({
      success: true,
      data: {
        bottles,
        mostRecentBottleId,
        company: {
          _id: companyId,
          name: company ? company.name : (isShreno ? "SHRENO" : "Unknown Company"),
          isShreno
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/summary/overview?companyId=&fromDate=&toDate=&search=
 * Overview: one row per bottle for the selected company with module totals side by side
 * and difference column.
 */
exports.getSummaryOverview = async (req, res) => {
  try {
    const { companyId, fromDate, toDate, search } = req.query;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId parameter is required" });
    }

    const company = await Company.findById(companyId).lean();
    const isShreno = isShrenoCompany(companyId, company);
    const { allBottlePerBoxes, idMap } = await getBottleMasterData();

    // Prepare date query filters
    const incomingQuery = { billToId: companyId, isDeleted: { $ne: true } };
    const dispatchQuery = { companyId: companyId, isDeleted: { $ne: true } };
    const shrenoQuery = { isDeleted: { $ne: true } };

    if (fromDate || toDate) {
      const incomingDate = {};
      const dispatchDate = {};
      const shrenoDate = {};

      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        incomingDate.$gte = from;
        dispatchDate.$gte = from;
        shrenoDate.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        incomingDate.$lte = to;
        dispatchDate.$lte = to;
        shrenoDate.$lte = to;
      }

      incomingQuery.documentDate = incomingDate;
      dispatchQuery.dispatchDate = dispatchDate;
      shrenoQuery.date = shrenoDate;
    }

    // Run queries in parallel
    const [incomingDocs, dispatchDocs, shrenoDocs] = await Promise.all([
      Incoming.find(incomingQuery).select("documentDate date deliveryNumber items").lean(),
      Dispatch.find(dispatchQuery).select("dispatchDate gatePassNo items").lean(),
      isShreno ? ShrenoIncoming.find(shrenoQuery).select("date challanNo items").lean() : Promise.resolve([])
    ]);

    // Map: bottleId -> aggregated row
    const bottleRows = new Map();

    const getOrCreateRow = (resolved) => {
      const key = resolved.bottleId;
      if (!bottleRows.has(key)) {
        bottleRows.set(key, {
          bottleId: resolved.bottleId,
          bottleName: resolved.bottleName,
          plainBottleName: resolved.plainBottleName,
          isUnmatched: resolved.isUnmatched,
          incomingTotal: 0,
          incomingBoxes: 0,
          incomingCount: 0,
          dispatchTotal: 0,
          dispatchBoxes: 0,
          dispatchCount: 0,
          shrenoIncomingTotal: 0,
          shrenoCount: 0,
          modulesPresent: new Set()
        });
      }
      return bottleRows.get(key);
    };

    // 1. Aggregate Incoming
    for (const inc of incomingDocs) {
      for (const item of inc.items || []) {
        const resolved = resolveBottleReference(item.bottleId, allBottlePerBoxes, idMap);
        const row = getOrCreateRow(resolved);
        const qty = Number(item.totalQty) || (Number(item.box || 0) * Number(item.qty || 0)) || 0;
        const box = Number(item.box) || 0;
        row.incomingTotal += qty;
        row.incomingBoxes += box;
        row.incomingCount += 1;
        row.modulesPresent.add("incoming");
      }
    }

    // 2. Aggregate Dispatch
    for (const disp of dispatchDocs) {
      for (const item of disp.items || []) {
        const ref = item.bottleId || item.productName;
        const resolved = resolveBottleReference(ref, allBottlePerBoxes, idMap);
        const row = getOrCreateRow(resolved);
        const qty = Number(item.totalQty) || (Number(item.box || 0) * Number(item.qty || 0)) || 0;
        const box = Number(item.box) || 0;
        row.dispatchTotal += qty;
        row.dispatchBoxes += box;
        row.dispatchCount += 1;
        row.modulesPresent.add("dispatch");
      }
    }

    // 3. Aggregate SHRENO Incoming
    if (isShreno) {
      for (const inc of shrenoDocs) {
        for (const item of inc.items || []) {
          const resolved = resolveBottleReference(item.plainBottle, allBottlePerBoxes, idMap);
          const row = getOrCreateRow(resolved);
          const qty = Number(item.quantity) || 0;
          row.shrenoIncomingTotal += qty;
          row.shrenoCount += 1;
          row.modulesPresent.add("shrenoIncoming");
        }
      }
    }

    // Calculate differences and format rows
    let rows = Array.from(bottleRows.values()).map(r => ({
      ...r,
      modulesPresent: Array.from(r.modulesPresent),
      difference: r.incomingTotal - r.dispatchTotal,
      shrenoDifference: isShreno ? (r.shrenoIncomingTotal - r.dispatchTotal) : 0
    }));

    // Filter by search string if provided
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => r.bottleName.toLowerCase().includes(q));
    }

    // Sort rows alphabetically by bottleName
    rows.sort((a, b) => a.bottleName.localeCompare(b.bottleName));

    // Calculate grand totals across all bottles
    const grandTotals = {
      incomingTotal: rows.reduce((sum, r) => sum + r.incomingTotal, 0),
      incomingBoxes: rows.reduce((sum, r) => sum + r.incomingBoxes, 0),
      dispatchTotal: rows.reduce((sum, r) => sum + r.dispatchTotal, 0),
      dispatchBoxes: rows.reduce((sum, r) => sum + r.dispatchBoxes, 0),
      difference: rows.reduce((sum, r) => sum + r.difference, 0),
      shrenoIncomingTotal: isShreno ? rows.reduce((sum, r) => sum + r.shrenoIncomingTotal, 0) : 0,
      shrenoDifference: isShreno ? rows.reduce((sum, r) => sum + r.shrenoDifference, 0) : 0,
      bottleCount: rows.length
    };

    res.json({
      success: true,
      data: {
        overview: rows,
        grandTotals,
        company: {
          _id: companyId,
          name: company ? company.name : (isShreno ? "SHRENO" : "Unknown Company"),
          isShreno
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/summary/logs?companyId=&bottleId=&fromDate=&toDate=
 * Returns bottle detail Excel-style side-by-side logs:
 * Normal company: Incoming | Dispatch
 * SHRENO company: SHRENO Incoming | Incoming | Dispatch
 * Returns all matching rows per block with complete totals footer and KPI strip.
 */
exports.getSummaryLogs = async (req, res) => {
  try {
    const {
      companyId,
      bottleId,
      fromDate,
      toDate
    } = req.query;

    if (!companyId || !bottleId) {
      return res.status(400).json({ success: false, message: "Both companyId and bottleId are required" });
    }

    const company = await Company.findById(companyId).lean();
    const isShreno = isShrenoCompany(companyId, company);
    const { allBottlePerBoxes, idMap } = await getBottleMasterData();

    // Check if the requested bottleId is an ObjectId in BottlePerBox, or an unmatched string
    let targetBottleDoc = null;
    let targetBottleName = "";
    let isUnmatchedTarget = false;

    if (mongoose.Types.ObjectId.isValid(bottleId) && idMap.has(bottleId)) {
      targetBottleDoc = idMap.get(bottleId);
      targetBottleName = targetBottleDoc.bottleName;
    } else if (bottleId.startsWith("unmatched_")) {
      targetBottleName = decodeURIComponent(bottleId.replace("unmatched_", ""));
      isUnmatchedTarget = true;
    } else {
      // Try matching by bottle name string
      const matched = matchBottleNameFromMaster(bottleId, allBottlePerBoxes);
      if (!matched.unmatched && matched.bottleName !== 'MISSING') {
        targetBottleDoc = allBottlePerBoxes.find(b => b.bottleName === matched.bottleName);
        targetBottleName = targetBottleDoc.bottleName;
      } else {
        targetBottleName = bottleId;
        isUnmatchedTarget = true;
      }
    }

    // Helper to test if a given bottleRef in a document matches the target bottle
    const matchesTargetBottle = (bottleRef) => {
      const resolved = resolveBottleReference(bottleRef, allBottlePerBoxes, idMap);
      if (targetBottleDoc) {
        return resolved.bottleId === targetBottleDoc._id.toString();
      }
      return resolved.bottleName.toLowerCase() === targetBottleName.toLowerCase();
    };

    // Date filters
    const incomingQuery = { billToId: companyId, isDeleted: { $ne: true } };
    const dispatchQuery = { companyId: companyId, isDeleted: { $ne: true } };
    const shrenoQuery = { isDeleted: { $ne: true } };

    if (fromDate || toDate) {
      const incomingDate = {};
      const dispatchDate = {};
      const shrenoDate = {};

      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        incomingDate.$gte = from;
        dispatchDate.$gte = from;
        shrenoDate.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        incomingDate.$lte = to;
        dispatchDate.$lte = to;
        shrenoDate.$lte = to;
      }

      incomingQuery.documentDate = incomingDate;
      dispatchQuery.dispatchDate = dispatchDate;
      shrenoQuery.date = shrenoDate;
    }

    // Run parallel queries with population
    const [incomingDocs, dispatchDocs, shrenoDocs] = await Promise.all([
      Incoming.find(incomingQuery)
        .populate("items.bottleId", "bottleName plainBottleName")
        .sort({ documentDate: -1, createdAt: -1 })
        .lean(),
      Dispatch.find(dispatchQuery)
        .populate("items.printingTypeId", "name")
        .populate("items.variantId", "variantName")
        .sort({ dispatchDate: -1, createdAt: -1 }),
      isShreno
        ? ShrenoIncoming.find(shrenoQuery)
            .populate("items.itemType", "name")
            .populate("items.plainBottle", "bottleName plainBottleName")
            .sort({ date: -1, createdAt: -1 })
            .lean()
        : Promise.resolve([])
    ]);

    // Convert Dispatch docs to plain objects to ensure post-hook is applied
    const dispatchDocsPlain = dispatchDocs.map(doc => doc.toObject ? doc.toObject() : doc);

    // 1. Process Incoming rows matching target bottle
    // Excel columns: Sr, Date, Challan No, Box, Qty, Total
    const allIncomingRows = [];
    let incomingTotalQty = 0;
    let incomingTotalBoxes = 0;

    for (const inc of incomingDocs) {
      const docDate = inc.documentDate || inc.date;
      for (const item of inc.items || []) {
        if (matchesTargetBottle(item.bottleId)) {
          const qty = Number(item.qty) || 0;
          const box = Number(item.box) || 0;
          const totalQty = Number(item.totalQty) || (box * qty);
          incomingTotalQty += totalQty;
          incomingTotalBoxes += box;

          allIncomingRows.push({
            _id: `${inc._id}_${item._id || allIncomingRows.length}`,
            docId: inc._id,
            date: docDate,
            challanNo: inc.deliveryNumber || "-",
            poNo: inc.poNo || "-",
            poDate: inc.poDate || null,
            poOrderQty: inc.poOrderQty || null,
            box,
            qty,
            totalQty
          });
        }
      }
    }

    // 2. Process Dispatch rows matching target bottle
    // Columns: Date, D C NO, Product name, Box, Qty, Dispatch Qty
    const allDispatchRows = [];
    let dispatchTotalQty = 0;
    let dispatchTotalBoxes = 0;

    for (const disp of dispatchDocsPlain) {
      const docDate = disp.dispatchDate;
      for (const item of disp.items || []) {
        const ref = item.bottleId || item.productName;
        if (matchesTargetBottle(ref)) {
          const qty = Number(item.qty) || 0;
          const box = Number(item.box) || 0;
          const totalQty = Number(item.totalQty) || (box * qty);
          dispatchTotalQty += totalQty;
          dispatchTotalBoxes += box;

          const resolvedBottle = resolveBottleReference(ref, allBottlePerBoxes, idMap);
          const productName = item.productName || (item.variantId && item.variantId.variantName) || (resolvedBottle && resolvedBottle.bottleName) || "-";

          allDispatchRows.push({
            _id: `${disp._id}_${item._id || allDispatchRows.length}`,
            docId: disp._id,
            date: docDate,
            gatePassNo: disp.gatePassNo || "-",
            dcNo: disp.gatePassNo || "-",
            productName,
            coating: item.coatingShade || "-",
            printing: (item.variantId && item.variantId.variantName) || item.printing || "-",
            detectedTextColor: item.detectedTextColor || (item.printingTypeId && item.printingTypeId.name) || "-",
            type: (item.variantId && item.variantId.variantName) || item.productName || "-",
            box,
            qty,
            totalQty,
            remarks: disp.remarks || item.remarks || "-"
          });
        }
      }
    }

    // 3. Process SHRENO Incoming rows matching target bottle
    // Columns: Date, Challan No, PO No, PO Date, Item Type, Configuration, Qty
    const allShrenoRows = [];
    let shrenoTotalQty = 0;

    if (isShreno) {
      for (const inc of shrenoDocs) {
        const docDate = inc.date;
        for (const item of inc.items || []) {
          if (matchesTargetBottle(item.plainBottle)) {
            const quantity = Number(item.quantity) || 0;
            shrenoTotalQty += quantity;

            allShrenoRows.push({
              _id: `${inc._id}_${item._id || allShrenoRows.length}`,
              docId: inc._id,
              date: docDate,
              challanNo: inc.challanNo || "-",
              poNo: inc.poNo || "-",
              poDate: inc.poDate || null,
              itemType: (item.itemType && item.itemType.name) || "-",
              configuration: item.configuration || "-",
              quantity
            });
          }
        }
      }
    }

    const withRowCount = (rows) => ({
      data: rows,
      total: rows.length
    });

    const allIncoming = withRowCount(allIncomingRows);
    const allDispatch = withRowCount(allDispatchRows);
    const allShreno = isShreno ? withRowCount(allShrenoRows) : null;

    // Calculate KPI values
    const kpis = {
      incomingTotal: incomingTotalQty,
      incomingBoxes: incomingTotalBoxes,
      dispatchTotal: dispatchTotalQty,
      dispatchBoxes: dispatchTotalBoxes,
      netDifference: incomingTotalQty - dispatchTotalQty,
      // Plain-language difference label
      differenceLabel: "Net Stock Balance (Incoming − Dispatch)",
      differenceLabelGu: "ઇનકમિંગ − ડિસ્પેચ બાકી સ્ટોક"
    };

    if (isShreno) {
      kpis.shrenoIncomingTotal = shrenoTotalQty;
      kpis.shrenoDifference = shrenoTotalQty - dispatchTotalQty;
      kpis.shrenoDifferenceLabel = "SHRENO Balance (SHRENO Incoming − Dispatch)";
      kpis.shrenoDifferenceLabelGu = "શ્રેણો − ડિસ્પેચ બાકી સ્ટોક";
    }

    res.json({
      success: true,
      data: {
        kpis,
        incoming: {
          ...allIncoming,
          totals: {
            totalQty: incomingTotalQty,
            totalBoxes: incomingTotalBoxes
          }
        },
        dispatch: {
          ...allDispatch,
          totals: {
            totalQty: dispatchTotalQty,
            totalBoxes: dispatchTotalBoxes
          }
        },
        shrenoIncoming: isShreno ? {
          ...allShreno,
          totals: {
            totalQty: shrenoTotalQty
          }
        } : null,
        bottle: {
          _id: bottleId,
          bottleName: targetBottleName,
          isUnmatched: isUnmatchedTarget
        },
        company: {
          _id: companyId,
          name: company ? company.name : (isShreno ? "SHRENO" : "Unknown Company"),
          isShreno
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
