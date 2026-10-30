const DeliveryChallan = require("../models/DeliveryChallan");
const Company = require("../models/Company");
const CompanyAddress = require("../models/CompanyAddress");
const { generateChallanHtml } = require("../templates/deliveryChallanHtml");
const { generateMcnoreChallanHtml } = require("../templates/mcnoreChallanHtml");
const { generateShrenoChallanHtml } = require("../templates/shrenoChallanHtml");
const { getSharedBrowser } = require("../services/sharedPuppeteer");
const mongoose = require("mongoose");
const Brand = require("../models/Brand");
const BottlePerBox = require("../models/BottlePerBox");
const BottleSpec = require("../models/Bottlespecs");
const Variant = require("../models/Variant");
const { derivePlainBottleName } = require("../utils/derivePlainBottleName");

const normalizeBottleName = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const normalizeRollOnBottleName = (value) => normalizeBottleName(value).replace(/ROLL\s*ON|ROLL-ON/g, "ROLLON");

const matchesPlainBottleSpec = (specName, bottle) => {
  const names = [
    bottle.plainBottleName,
    bottle.bottleName,
    ...(Array.isArray(bottle.bottleNames) ? bottle.bottleNames : []),
  ].filter(Boolean);
  const derivedName = derivePlainBottleName(String(specName || "")).plainBottleName;

  return names.some((name) =>
    normalizeBottleName(name) === normalizeBottleName(specName) ||
    normalizeRollOnBottleName(name) === normalizeRollOnBottleName(specName) ||
    normalizeBottleName(name) === normalizeBottleName(derivedName) ||
    normalizeRollOnBottleName(name) === normalizeRollOnBottleName(derivedName)
  );
};

const validateChallanProductItems = async (companyId, items) => {
  if (!Array.isArray(items)) return "Challan items must be provided as an array.";
  if (!items.length) return null;
  if (items.some((item) => !item?.plainBottleId)) return "Select a plain bottle for every challan item.";
  if (items.some((item) => !item?.variantId)) return "Select a variant for every challan item.";
  if (!companyId || !mongoose.isValidObjectId(companyId)) {
    return "A valid company is required to validate the selected plain bottle and variant.";
  }

  const brandIds = (await Brand.find({ companyId, isDeleted: { $ne: true } }).select("_id").lean())
    .map((brand) => brand._id);
  if (!brandIds.length) {
    return "The selected company has no bottle specifications, so its plain bottle and variant cannot be validated.";
  }

  const [specs, bottles] = await Promise.all([
    BottleSpec.find({ brandId: { $in: brandIds }, isDeleted: { $ne: true } })
      .select("_id bottleName variantId isCoating")
      .lean(),
    Promise.all(items.map((item) =>
      mongoose.isValidObjectId(item.plainBottleId)
        ? BottlePerBox.findById(item.plainBottleId).lean()
        : null
    )),
  ]);
  const bottleById = new Map();
  items.forEach((item, index) => {
    if (item.plainBottleId) bottleById.set(String(item.plainBottleId), bottles[index]);
  });

  for (const item of items) {
    const bottleId = String(item.plainBottleId || "");
    if (!mongoose.isValidObjectId(bottleId)) {
      return "The selected plain bottle is invalid. Please select it again.";
    }

    const bottle = bottleById.get(bottleId);
    if (!bottle || bottle.isDeleted) return "The selected plain bottle could not be found. Please select it again.";

    const matchingSpecs = specs.filter((spec) => matchesPlainBottleSpec(spec.bottleName, bottle));
    if (!matchingSpecs.length) {
      return `Plain bottle "${bottle.plainBottleName || bottle.bottleName}" does not belong to the selected company.`;
    }
    if (!mongoose.isValidObjectId(item.variantId)) {
      return "The selected variant is invalid. Please select it again.";
    }

    const variant = await Variant.findOne({
      _id: item.variantId,
      isDeleted: { $ne: true },
    }).select("_id bottleSpecId").lean();
    const matchingSpecIds = new Set(matchingSpecs.map((spec) => String(spec._id)));
    const belongsToBottle = variant && matchingSpecIds.has(String(variant.bottleSpecId));
    const coatingSpecReferencesVariant = specs.some((spec) =>
      spec.isCoating &&
      matchingSpecIds.has(String(spec._id)) &&
      String(spec.variantId || "") === String(item.variantId)
    );
    if (!belongsToBottle && !coatingSpecReferencesVariant) {
      return `Variant does not belong to plain bottle "${bottle.plainBottleName || bottle.bottleName}" and the selected company.`;
    }
  }

  return null;
};

const getVariantMaterialCodeUpdates = async (items, preservedItemIndexes = new Set()) => {
  const candidates = items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item, itemIndex }) => item?.variantId && !preservedItemIndexes.has(itemIndex));
  const variantIds = [...new Set(candidates.map(({ item }) => String(item.variantId)))];
  if (!variantIds.length) return { updates: [] };

  const variants = await Variant.find({ _id: { $in: variantIds } })
    .select("_id variantName materialCode")
    .lean();
  const variantById = new Map(variants.map((variant) => [String(variant._id), variant]));
  const updatesByVariant = new Map();

  for (const { item, itemIndex } of candidates) {
    const variant = variantById.get(String(item.variantId));
    if (!variant) continue;

    const materialCode = String(item.materialCode ?? "").trim();
    const oldMaterialCode = String(variant.materialCode ?? "").trim();
    if (!materialCode || materialCode === oldMaterialCode) continue;

    const existingUpdate = updatesByVariant.get(String(variant._id));
    if (existingUpdate) {
      if (existingUpdate.materialCode !== materialCode) {
        return {
          error: {
            status: 400,
            body: {
              success: false,
              message: `Conflicting Material Codes were submitted for variant "${variant.variantName || variant._id}".`,
            },
          },
        };
      }
      continue;
    }

    if (oldMaterialCode && item.confirmVariantCodeUpdate !== true) {
      return {
        error: {
          status: 409,
          body: {
            success: false,
            code: "VARIANT_MATERIAL_CODE_CONFLICT",
            message: `Variant ${variant.variantName || variant._id} already has Material Code ${oldMaterialCode}.`,
            conflict: {
              itemIndex,
              variantId: String(variant._id),
              variantName: variant.variantName || "",
              oldMaterialCode,
              newMaterialCode: materialCode,
            },
          },
        },
      };
    }

    updatesByVariant.set(String(variant._id), {
      variantId: variant._id,
      oldMaterialCode,
      materialCode,
    });
  }

  return { updates: [...updatesByVariant.values()] };
};

const applyVariantMaterialCodeUpdates = async (updates, session) => {
  const applied = [];
  try {
    for (const update of updates) {
      const filter = { _id: update.variantId };
      if (update.oldMaterialCode) {
        filter.materialCode = update.oldMaterialCode;
      } else {
        filter.$or = [
          { materialCode: "" },
          { materialCode: { $exists: false } },
        ];
      }

      const result = await Variant.updateOne(
        filter,
        { $set: { materialCode: update.materialCode } },
        session ? { session } : {}
      );
      if (!result.matchedCount) {
        const error = new Error("Variant Material Code changed while the challan was being saved. Please try again.");
        error.code = "VARIANT_MATERIAL_CODE_RACE";
        throw error;
      }
      applied.push(update);
    }
  } catch (error) {
    if (!session) await rollbackVariantMaterialCodeUpdates(applied);
    throw error;
  }
  return applied;
};

const rollbackVariantMaterialCodeUpdates = async (updates) => {
  for (const update of [...updates].reverse()) {
    await Variant.updateOne(
      { _id: update.variantId, materialCode: update.materialCode },
      { $set: { materialCode: update.oldMaterialCode } }
    );
  }
};

const persistChallanAndVariantCodes = async ({ updates, saveChallan, rollbackChallan }) => {
  if (!updates.length) return saveChallan();

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const transactionsSupported = Boolean(hello.setName || hello.msg === "isdbgrid");
  if (transactionsSupported) {
    const session = await mongoose.startSession();
    let savedChallan;
    try {
      await session.withTransaction(async () => {
        await applyVariantMaterialCodeUpdates(updates, session);
        savedChallan = await saveChallan(session);
      });
      return savedChallan;
    } finally {
      await session.endSession();
    }
  }

  if (rollbackChallan) {
    const savedChallan = await saveChallan();
    try {
      await applyVariantMaterialCodeUpdates(updates);
    } catch (error) {
      await rollbackChallan(savedChallan);
      throw error;
    }
    return savedChallan;
  }

  await applyVariantMaterialCodeUpdates(updates);
  try {
    return await saveChallan();
  } catch (error) {
    await rollbackVariantMaterialCodeUpdates(updates);
    throw error;
  }
};

// Helper to calculate total boxes from an expression or string
function parseBoxCount(boxStr) {
  if (!boxStr) return 0;
  const str = String(boxStr).trim();
  // If format is like "60+(1*28)", the total boxes is 60 + 1 = 61 boxes
  const match = str.match(/^(\d+)\s*\+\s*\((\d+)\s*\*\s*(\d+)\)$/);
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]);
  }
  // If simple integer
  const num = parseInt(str);
  return isNaN(num) ? 0 : num;
}

// ✅ CREATE CHALLAN
exports.createChallan = async (req, res) => {
  try {
    const {
      challanType = "shayoona",
      poMode = "without_po",
      taxInvoiceNo = "",
      taxInvoiceDate = "",
      poNo = "",
      poDate = "",
      challanNo,
      challanDate,
      challanTime,
      buyersOrderNo,
      dispatchThrough,
      transporter,
      lrNo,
      vehicleNo,
      companyId,
      billedToAddressId,
      billedTo,
      shippedToAddressId,
      shippedTo,
      items = [],
      glassBottleValue,
      jobWorkChargesValue,
      sgst,
      cgst,
      igst,
      grandTotalValue,
      checkedBy,
      checkedDate,
      checkedTime,
      remarks,
    } = req.body;

    if (!challanNo || !challanNo.trim()) {
      return res.status(400).json({ success: false, message: "Delivery Challan No is required" });
    }

    let targetCompanyId = companyId;
    if (!targetCompanyId && challanType === "mcnore") {
      const mcnoreComp = await Company.findOne({ name: { $regex: /mcn/i } });
      if (mcnoreComp) targetCompanyId = mcnoreComp._id;
    }
    if (!targetCompanyId && (challanType === "sherno" || challanType === "shreno")) {
      const shrenoComp = await Company.findOne({ name: { $regex: /shreno|sherno/i } });
      if (shrenoComp) targetCompanyId = shrenoComp._id;
    }

    if (!targetCompanyId) {
      return res.status(400).json({ success: false, message: "Company is required" });
    }

    // Lookup company name
    let companyName = "";
    const comp = await Company.findById(targetCompanyId);
    if (!comp || comp.isDeleted) {
      return res.status(400).json({ success: false, message: "Selected company could not be found." });
    }
    if (comp) companyName = comp.name;

    const productValidationError = await validateChallanProductItems(targetCompanyId, items);
    if (productValidationError) {
      return res.status(400).json({ success: false, message: productValidationError });
    }

    const isMcnoreChallan = challanType === "mcnore" ||
      (companyName && companyName.toLowerCase().includes("mcn")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("mcn"));

    const isShernoChallan = challanType === "sherno" || challanType === "shreno" ||
      (companyName && companyName.toLowerCase().includes("shreno")) ||
      (companyName && companyName.toLowerCase().includes("sherno")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("shreno")) ||
      (comp && comp.name && comp.name.toLowerCase().includes("sherno"));

    const finalChallanType = isMcnoreChallan ? "mcnore" : (isShernoChallan ? "sherno" : (challanType || "shayona"));

    // Check duplicate challanNo for this challanType
    const existing = await DeliveryChallan.findOne({
      challanType: finalChallanType,
      challanNo: challanNo.trim(),
      isDeleted: { $ne: true },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Delivery Challan No "${challanNo}" already exists.`,
      });
    }

    // Snapshot Billed To Address if provided
    let billedToSnapshot = billedTo || {};
    if (billedToAddressId && (!billedToSnapshot.addressLine1 || !billedToSnapshot.name)) {
      const addr = await CompanyAddress.findById(billedToAddressId);
      if (addr) {
        billedToSnapshot = {
          name: comp ? comp.name : "",
          addressTitle: addr.addressTitle,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state || "GUJARAT",
          stateCode: addr.gstNo ? addr.gstNo.substring(0, 2) : "24",
          pincode: addr.pincode,
          gstNo: addr.gstNo,
          contactPerson: addr.contactPerson,
          contactPhone: addr.contactPhone,
        };
      }
    }

    // Snapshot Shipped To Address if provided
    let shippedToSnapshot = shippedTo || {};
    if (shippedToAddressId && (!shippedToSnapshot.addressLine1 || !shippedToSnapshot.name)) {
      const addr = await CompanyAddress.findById(shippedToAddressId);
      if (addr) {
        shippedToSnapshot = {
          name: comp ? comp.name : "",
          addressTitle: addr.addressTitle,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state || "GUJARAT",
          stateCode: addr.gstNo ? addr.gstNo.substring(0, 2) : "24",
          pincode: addr.pincode,
          gstNo: addr.gstNo,
          contactPerson: addr.contactPerson,
          contactPhone: addr.contactPhone,
        };
      }
    }

    // Compute totals
    let totalBoxes = 0;
    let totalQuantity = 0;

    const formattedItems = (items || []).map((it) => {
      const bCount = it.boxCount !== undefined && it.boxCount !== null ? Number(it.boxCount) : parseBoxCount(it.box);
      totalBoxes += bCount;
      const itTotal = Number(it.total) || (Number(it.unit) * bCount) || 0;
      totalQuantity += itTotal;

      return {
        title: it.title || "",
        plainBottleId: it.plainBottleId || null,
        variantId: it.variantId || null,
        description: it.description || "",
        box: String(it.box || ""),
        boxCount: bCount,
        unit: Number(it.unit) || 1,
        total: itTotal,
        hsn: it.hsn || "",
        materialCode: it.materialCode || "",
        rate: Number(it.rate) || 0,
        taxableValue: Number(it.taxableValue) || 0,
        jobWorkRate: Number(it.jobWorkRate) || 0,
        jobWorkTaxableValue: Number(it.jobWorkTaxableValue) || 0,
        remarks: it.remarks || "",
      };
    });

    const challan = new DeliveryChallan({
      challanType: finalChallanType,
      poMode: poMode || (isMcnoreChallan ? "with_po" : "without_po"),
      taxInvoiceNo: taxInvoiceNo || "",
      taxInvoiceDate: taxInvoiceDate || "",
      poNo: poNo || "",
      poDate: poDate || "",
      challanNo: challanNo.trim(),
      challanDate: challanDate ? new Date(challanDate) : new Date(),
      challanTime: challanTime || "",
      buyersOrderNo: buyersOrderNo || "",
      dispatchThrough: dispatchThrough || "",
      transporter: transporter || dispatchThrough || "",
      lrNo: lrNo || "",
      vehicleNo: vehicleNo || "",
      companyId: targetCompanyId,
      companyName,
      billedToAddressId: billedToAddressId || null,
      billedTo: billedToSnapshot,
      shippedToAddressId: shippedToAddressId || null,
      shippedTo: shippedToSnapshot,
      items: formattedItems,
      totalBoxes,
      totalQuantity,
      glassBottleValue: Number(glassBottleValue) || 0,
      jobWorkChargesValue: Number(jobWorkChargesValue) || 0,
      sgst: Number(sgst) || 0,
      cgst: Number(cgst) || 0,
      igst: Number(igst) || 0,
      grandTotalValue: Number(grandTotalValue) || 0,
      checkedBy: checkedBy || "",
      checkedDate: checkedDate || "",
      checkedTime: checkedTime || "",
      remarks: remarks || "",
      createdBy: req.user?._id || null,
    });

    const { updates, error: codeUpdateError } = await getVariantMaterialCodeUpdates(items || []);
    if (codeUpdateError) {
      return res.status(codeUpdateError.status).json(codeUpdateError.body);
    }

    await persistChallanAndVariantCodes({
      updates,
      saveChallan: (session) => challan.save(session ? { session } : {}),
      rollbackChallan: (saved) => DeliveryChallan.deleteOne({ _id: saved._id }),
    });

    const populated = await challan.populate("companyId", "name");

    res.status(201).json({
      success: true,
      message: "Delivery Challan created successfully",
      data: populated,
    });
  } catch (err) {
    console.error("CREATE DELIVERY CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET NEXT CHALLAN NO
exports.getNextChallanNo = async (req, res) => {
  try {
    const { challanType = "shayoona" } = req.query;

    const query = { isDeleted: { $ne: true } };
    if (challanType === "sherno" || challanType === "shreno") {
      query.$or = [
        { challanType: { $in: ["sherno", "shreno"] } },
        { companyName: { $regex: /shreno|sherno/i } },
      ];
    } else if (challanType === "mcnore") {
      query.$or = [
        { challanType: "mcnore" },
        { companyName: { $regex: /mcn/i } },
      ];
    } else {
      query.challanType = challanType;
    }

    const lastChallan = await DeliveryChallan.findOne(query).sort({ createdAt: -1 });

    let nextNo = challanType === "mcnore" ? 955 : (challanType === "sherno" || challanType === "shreno" ? 944 : 806);
    if (lastChallan && lastChallan.challanNo) {
      const numMatch = lastChallan.challanNo.match(/(\d+)/);
      if (numMatch) {
        nextNo = parseInt(numMatch[1]) + 1;
      }
    }

    res.json({ success: true, nextNo: String(nextNo) });
  } catch (err) {
    console.error("GET NEXT CHALLAN NO ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET CHALLANS (Search + Filter + Pagination)
exports.getChallans = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      pagination = "true",
      challanType = "shayoona",
      companyId,
    } = req.query;

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let filter = {
      isDeleted: { $ne: true },
    };

    if (challanType === "sherno" || challanType === "shreno") {
      filter.$or = [
        { challanType: { $in: ["sherno", "shreno"] } },
        { companyName: { $regex: /shreno|sherno/i } },
        { "billedTo.name": { $regex: /shreno|sherno/i } },
      ];
    } else if (challanType === "mcnore") {
      filter.$or = [
        { challanType: "mcnore" },
        { companyName: { $regex: /mcn/i } },
        { "billedTo.name": { $regex: /mcn/i } },
      ];
    } else {
      filter.challanType = challanType;
    }

    if (companyId) {
      filter.companyId = companyId;
    }

    if (search && search.trim() !== "") {
      const searchConditions = [
        { challanNo: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { vehicleNo: { $regex: search, $options: "i" } },
        { buyersOrderNo: { $regex: search, $options: "i" } },
        { lrNo: { $regex: search, $options: "i" } },
        { "items.title": { $regex: search, $options: "i" } },
        { "items.description": { $regex: search, $options: "i" } },
      ];

      if (filter.$or) {
        const typeOr = filter.$or;
        delete filter.$or;
        filter.$and = [
          { $or: typeOr },
          { $or: searchConditions },
        ];
      } else {
        filter.$or = searchConditions;
      }
    }

    let query = DeliveryChallan.find(filter)
      .populate("companyId", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const challans = await query;
    const total = await DeliveryChallan.countDocuments(filter);

    if (pagination === "false") {
      return res.json({ success: true, data: challans, total });
    }

    res.json({
      success: true,
      data: challans,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      total,
    });
  } catch (err) {
    console.error("GET CHALLANS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET CHALLAN BY ID
exports.getChallanById = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    })
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId")
      .populate("createdBy", "name");

    if (!challan) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    res.json({ success: true, data: challan });
  } catch (err) {
    console.error("GET CHALLAN BY ID ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ UPDATE CHALLAN
exports.updateChallan = async (req, res) => {
  try {
    const body = { ...req.body };
    const currentChallan = await DeliveryChallan.findById(req.params.id).select("companyId items");
    if (!currentChallan) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    const targetCompanyId = body.companyId || currentChallan.companyId;
    if (body.items !== undefined && !Array.isArray(body.items)) {
      return res.status(400).json({
        success: false,
        message: "Challan items must be provided as an array.",
      });
    }
    const submittedItems = body.items || currentChallan.items;
    const companyUnchanged = String(targetCompanyId) === String(currentChallan.companyId);
    const matchedLegacyItemIndexes = new Set();
    const itemsToValidate = [];
    for (const item of submittedItems) {
      if (item?.plainBottleId && item?.variantId) {
        itemsToValidate.push(item);
        continue;
      }

      const legacyIndex = companyUnchanged
        ? currentChallan.items.findIndex((savedItem, index) =>
          !matchedLegacyItemIndexes.has(index) &&
          String(savedItem.plainBottleId || "") === String(item?.plainBottleId || "") &&
          String(savedItem.variantId || "") === String(item?.variantId || "") &&
          String(savedItem.title || "") === String(item?.title || "") &&
          String(savedItem.description || "") === String(item?.description || "")
        )
        : -1;
      if (legacyIndex < 0) {
        return res.status(400).json({
          success: false,
          message: "Select a plain bottle and variant for every changed challan item.",
        });
      }
      matchedLegacyItemIndexes.add(legacyIndex);
    }

    const productValidationError = await validateChallanProductItems(targetCompanyId, itemsToValidate);
    if (productValidationError) {
      return res.status(400).json({ success: false, message: productValidationError });
    }

    const preservedItemIndexes = new Set();
    (body.items || []).forEach((item, itemIndex) => {
      const savedItem = currentChallan.items[itemIndex];
      if (
        savedItem &&
        String(savedItem.variantId || "") === String(item?.variantId || "") &&
        String(savedItem.title || "") === String(item?.title || "") &&
        String(savedItem.description || "") === String(item?.description || "") &&
        String(savedItem.materialCode || "").trim() === String(item?.materialCode || "").trim()
      ) {
        preservedItemIndexes.add(itemIndex);
      }
    });
    const { updates: variantCodeUpdates, error: codeUpdateError } =
      await getVariantMaterialCodeUpdates(body.items || [], preservedItemIndexes);
    if (codeUpdateError) {
      return res.status(codeUpdateError.status).json(codeUpdateError.body);
    }

    if (body.challanNo) {
      const existing = await DeliveryChallan.findOne({
        _id: { $ne: req.params.id },
        challanType: body.challanType || "shayoona",
        challanNo: body.challanNo.trim(),
        isDeleted: { $ne: true },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Delivery Challan No "${body.challanNo}" already exists.`,
        });
      }
      body.challanNo = body.challanNo.trim();
    }

    if (body.companyId) {
      const comp = await Company.findById(body.companyId);
      if (comp) body.companyName = comp.name;
    }

    if (body.items) {
      let totalBoxes = 0;
      let totalQuantity = 0;
      body.items = body.items.map((it) => {
        const bCount = it.boxCount !== undefined && it.boxCount !== null ? Number(it.boxCount) : parseBoxCount(it.box);
        totalBoxes += bCount;
        const itTotal = Number(it.total) || (Number(it.unit) * bCount) || 0;
        totalQuantity += itTotal;
        return {
          title: it.title || "",
          plainBottleId: it.plainBottleId || null,
          variantId: it.variantId || null,
          description: it.description || "",
          box: String(it.box || ""),
          boxCount: bCount,
          unit: Number(it.unit) || 1,
          total: itTotal,
          hsn: it.hsn || "",
          materialCode: it.materialCode || "",
          rate: Number(it.rate) || 0,
          taxableValue: Number(it.taxableValue) || 0,
          jobWorkRate: Number(it.jobWorkRate) || 0,
          jobWorkTaxableValue: Number(it.jobWorkTaxableValue) || 0,
          remarks: it.remarks || "",
        };
      });
      body.totalBoxes = totalBoxes;
      body.totalQuantity = totalQuantity;
    }

    let updated;
    try {
      updated = await persistChallanAndVariantCodes({
        updates: variantCodeUpdates,
        saveChallan: async (session) => {
          const options = { returnDocument: "after" };
          if (session) options.session = session;
          const saved = await DeliveryChallan.findByIdAndUpdate(req.params.id, body, options);
          if (!saved) {
            const error = new Error("Delivery Challan not found");
            error.statusCode = 404;
            throw error;
          }
          return saved;
        },
      });
    } catch (error) {
      if (error.statusCode === 404) {
        return res.status(404).json({ success: false, message: "Delivery Challan not found" });
      }
      throw error;
    }
    if (!updated) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    await updated.populate("companyId", "name");
    await updated.populate("billedToAddressId");
    await updated.populate("shippedToAddressId");

    res.json({
      success: true,
      message: "Delivery Challan updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("UPDATE CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ RENDER CHALLAN HTML (FOR BROWSER VIEW / PREVIEW)
exports.renderChallanHtml = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id)
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId");

    if (!challan || challan.isDeleted) {
      return res.status(404).send("<h2>Delivery Challan not found</h2>");
    }

    const isMcnore = challan.challanType === "mcnore" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("mcn")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("mcn"));

    const isShreno = challan.challanType === "shreno" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("shreno")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("shreno")) ||
      (challan.billedTo && challan.billedTo.name && challan.billedTo.name.toLowerCase().includes("shreno"));

    const html = isMcnore
      ? generateMcnoreChallanHtml(challan)
      : isShreno
      ? generateShrenoChallanHtml(challan)
      : generateChallanHtml(challan);
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    console.error("RENDER CHALLAN HTML ERROR:", err);
    return res.status(500).send(`<h2>Error generating Challan HTML: ${err.message}</h2>`);
  }
};

// ✅ DOWNLOAD CHALLAN PDF (SERVER-SIDE HIGH QUALITY PUPPETEER PDF WITH PAGINATION)
exports.downloadChallanPdf = async (req, res) => {
  try {
    const challan = await DeliveryChallan.findById(req.params.id)
      .populate("companyId", "name")
      .populate("billedToAddressId")
      .populate("shippedToAddressId");

    if (!challan || challan.isDeleted) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    const isMcnore = challan.challanType === "mcnore" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("mcn")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("mcn"));

    const isShreno = challan.challanType === "shreno" ||
      (challan.companyName && challan.companyName.toLowerCase().includes("shreno")) ||
      (challan.companyId && challan.companyId.name && challan.companyId.name.toLowerCase().includes("shreno")) ||
      (challan.billedTo && challan.billedTo.name && challan.billedTo.name.toLowerCase().includes("shreno"));

    const html = isMcnore
      ? generateMcnoreChallanHtml(challan)
      : isShreno
      ? generateShrenoChallanHtml(challan)
      : generateChallanHtml(challan);
    const browser = await getSharedBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "10mm",
          bottom: "10mm",
          left: "10mm",
          right: "10mm",
        },
      });

      const filename = `Delivery_Challan_${challan.challanNo || "Shayona"}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.end(pdfBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    console.error("DOWNLOAD CHALLAN PDF ERROR:", err);
    return res.status(500).json({ success: false, message: `PDF Generation Failed: ${err.message}` });
  }
};

// ✅ DELETE CHALLAN
exports.deleteChallan = async (req, res) => {
  try {
    const deleted = await DeliveryChallan.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Delivery Challan not found" });
    }

    res.json({ success: true, message: "Delivery Challan deleted successfully" });
  } catch (err) {
    console.error("DELETE CHALLAN ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
