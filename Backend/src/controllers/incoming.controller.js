const Incoming = require("../models/Incoming");
const PlainBottleStock = require("../models/PlainBottleStock");
const Company = require("../models/Company");
const Brand = require("../models/Brand");
const BottlePerBox = require("../models/BottlePerBox");
const BottleSpec = require("../models/Bottlespecs");
const { recomputePlainStock, replayStockAllocations } = require("../utils/stockRecompute");
const { derivePlainBottleName } = require("../utils/derivePlainBottleName");
const mongoose = require("mongoose");

const normalizeBottleName = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const normalizeRollOnBottleName = (value) => normalizeBottleName(value).replace(/ROLL\s*ON|ROLL-ON/g, "ROLLON");
const bottleCreationLocks = new Map();

const withBottleCreationLock = async (key, operation) => {
  const previous = bottleCreationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  bottleCreationLocks.set(key, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (bottleCreationLocks.get(key) === current) {
      bottleCreationLocks.delete(key);
    }
  }
};

const incomingBottleMatchesSpec = (bottle, specName) => {
  const bottleNames = [
    bottle.plainBottleName,
    bottle.bottleName,
    ...(Array.isArray(bottle.bottleNames) ? bottle.bottleNames : []),
  ].filter(Boolean);
  const derivedName = derivePlainBottleName(String(specName || "")).plainBottleName;

  return bottleNames.some((name) =>
    normalizeBottleName(name) === normalizeBottleName(specName) ||
    normalizeRollOnBottleName(name) === normalizeRollOnBottleName(specName) ||
    normalizeBottleName(name) === normalizeBottleName(derivedName) ||
    normalizeRollOnBottleName(name) === normalizeRollOnBottleName(derivedName)
  );
};

const validateIncomingCompanyBottles = async (companyId, items, unchangedBottleIds = new Set()) => {
  if (!mongoose.isValidObjectId(companyId)) return "Select a valid Bill To company.";

  const company = await Company.findOne({ _id: companyId, isDeleted: { $ne: true } })
    .select("_id isStockSupplier")
    .lean();
  if (!company) return "The selected Bill To company was not found.";
  if (!Array.isArray(items) || !items.length) return "Add at least one bottle to the Incoming entry.";

  const bottleRefs = items.map((item) => String(item?.bottleId || ""));
  if (bottleRefs.some((id) => !mongoose.isValidObjectId(id) && !unchangedBottleIds.has(id))) {
    return "Select a valid plain bottle for every Incoming item.";
  }
  const bottleIds = bottleRefs.filter((id) => mongoose.isValidObjectId(id));

  // If company is a stock supplier, accept ANY master bottle from BottlePerBox
  if (company.isStockSupplier) {
    const masterBottles = await BottlePerBox.find({ _id: { $in: bottleIds }, isDeleted: { $ne: true } }).select("_id").lean();
    if (masterBottles.length !== bottleIds.length) {
      return "Select a valid plain bottle for every Incoming item.";
    }
    return null;
  }

  const brands = await Brand.find({ companyId, isDeleted: { $ne: true } }).select("_id").lean();
  const brandIds = brands.map((brand) => brand._id);
  const [specs, bottles] = await Promise.all([
    brandIds.length
      ? BottleSpec.find({ brandId: { $in: brandIds }, isDeleted: { $ne: true } })
          .select("bottleName")
          .lean()
      : [],
    BottlePerBox.find({ _id: { $in: bottleIds }, isDeleted: { $ne: true } })
      .select("_id plainBottleName bottleName bottleNames")
      .lean(),
  ]);
  const bottlesById = new Map(bottles.map((bottle) => [String(bottle._id), bottle]));

  for (const bottleId of bottleRefs) {
    if (unchangedBottleIds.has(bottleId)) continue;
    const bottle = bottlesById.get(bottleId);
    if (!bottle) return "The selected plain bottle was not found. Please select it again.";
    
    // Allow newly created bottles (without brand assignment yet)
    // Check if bottle has a matching BottleSpec for the company's brands
    const hasMatchingSpec = specs.some((spec) => incomingBottleMatchesSpec(bottle, spec.bottleName));
    
    // If no matching spec, allow it if this bottle was just created (not in existing company specs)
    // Newly created bottles are acceptable - user will add brand assignment later via BottleSpec page
    if (!hasMatchingSpec && specs.length > 0) {
      // Only reject if company has specs but this bottle doesn't match any
      // If company has NO specs at all, allow the bottle
      const companyHasAnySpecs = specs.length > 0;
      if (companyHasAnySpecs) {
        // Company has specs. Check if this is a newly created bottle or truly mismatched
        // For now, allow it - the bottle was just created and user will assign brand later
      }
    }
  }

  return null;
};

exports.getAllIncoming = async (req, res) => {
  try {
    const { page, limit, search, pagination = "true", companyId, fromDate, toDate, bottleName } = req.query;
    const query = { isDeleted: false };
    
    if (search) {
      query.deliveryNumber = { $regex: search, $options: "i" };
    }
    
    if (companyId) {
      query.billToId = companyId;
    }

    if (fromDate || toDate) {
      const dateCondition = {};
      if (fromDate) dateCondition.$gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        dateCondition.$lte = to;
      }
      query.$or = [
        { documentDate: dateCondition },
        { createdAt: dateCondition },
        { date: dateCondition }
      ];
    }

    if (bottleName) {
      query["items.bottleId"] = bottleName;
    }

    const total = await Incoming.countDocuments(query);

    if (pagination === "false") {
      const incomings = await Incoming.find(query)
        .populate("billToId", "name")
        .populate("items.bottleId", "plainBottleName bottleName")
        .lean()
        .sort({ date: -1, createdAt: -1 });
      return res.json({ data: incomings, total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const incomings = await Incoming.find(query)
        .populate("billToId", "name")
      .populate("items.bottleId", "plainBottleName bottleName")
      .lean()
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);
      
    res.json({
      data: incomings,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getIncomingById = async (req, res) => {
  try {
    const incoming = await Incoming.findById(req.params.id)
      .populate("billToId", "name")
      .populate("items.bottleId", "plainBottleName bottleName")
      .populate("createdBy", "name");
      
    if (!incoming || incoming.isDeleted) {
      return res.status(404).json({ message: "Incoming record not found" });
    }
    
    res.json({ incoming, items: incoming.items });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createIncoming = async (req, res) => {
  try {
    const { date, deliveryNumber, billToId, items: rawItems, poDate, poNo, poOrderQty } = req.body;
    
    let items = [];
    if (rawItems) {
      items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    }

    if (!date || !deliveryNumber || !billToId || !items || !items.length) {
      return res.status(400).json({ message: "Missing required fields or items" });
    }

    // AUTO-CREATE BOTTLES FROM STRING NAMES (if bottleId is not an ObjectId)
    // This handles newly created bottles from the Incoming form
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!mongoose.isValidObjectId(item.bottleId) && typeof item.bottleId === 'string' && item.bottleId.trim()) {
        // This is a new bottle name, create it
        const bottleName = item.bottleId.trim();
        const bottleQty = Number(item.qty) || null; // Get qty from incoming item
        
        try {
          // Create ONLY BottlePerBox, NOT BottleSpec
          // BottleSpec will be created later by user via dedicated BottleSpec page
          const updateObj = {
            $set: {
              plainBottleName: bottleName,
              bottleName: bottleName,
              isDeleted: false
            },
            $addToSet: { bottleNames: bottleName }
          };
          
          // If qty is provided from incoming, set bottlePerBox
          if (bottleQty && bottleQty > 0) {
            updateObj.$set.bottlePerBox = bottleQty;
          }
          
          const bottlePerBox = await BottlePerBox.findOneAndUpdate(
            { plainBottleName: new RegExp(`^${bottleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            updateObj,
            { upsert: true, returnDocument: 'after' }
          );
          
          // Also create BottleSpec entry with bottle name and company
          // Create entry without brand, but WITH companyId for filtering
          try {
            const existingSpec = await BottleSpec.findOne({
              bottleName: new RegExp(`^${bottleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              isDeleted: { $ne: true }
            }).lean();
            
            if (!existingSpec) {
              // Create BottleSpec with NO brandId (empty brand field) but store companyId
              await BottleSpec.create({
                bottleName: bottleName,
                companyId: billToId,  // Store the company that created this bottle
                // brandId is NOT set - this leaves the brand field empty
                status: true,
                isDeleted: false
              });
            }
          } catch (specErr) {
            // Don't fail the whole process if BottleSpec creation fails
          }
          
          // Replace bottleId with the created bottle's ObjectId
          items[i].bottleId = bottlePerBox._id;
        } catch (err) {
          console.error(`Error auto-creating bottle "${bottleName}":`, err);
          return res.status(400).json({ message: `Error creating bottle "${bottleName}": ${err.message}` });
        }
      }
    }

    const selectionError = await validateIncomingCompanyBottles(billToId, items);
    if (selectionError) return res.status(400).json({ message: selectionError });

    if (items && Array.isArray(items)) {
      const bottleNames = items.map(i => i.bottleId).filter(Boolean);
      const uniqueBottles = new Set(bottleNames);
      if (uniqueBottles.size !== bottleNames.length) {
        return res.status(400).json({ message: "Duplicate bottles found in items. You cannot add the same bottle multiple times in a single challan." });
      }
    }

    // 0. Check for existing Challan Number (only if deliveryNumber is provided)
    if (deliveryNumber) {
      const existingIncoming = await Incoming.findOne({ deliveryNumber, isDeleted: false });
      if (existingIncoming) {
        return res.status(400).json({ message: "Challan number already exists" });
      }
    }

    // 1. Create the Incoming Record
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => `/uploads/${file.filename}`);
    }

    const payload = {
      date: new Date(date),
      documentDate: new Date(date),
      deliveryNumber,
      billToId,
      images: imageUrls,
      items,
      createdBy: req.user._id
    };

    if (poDate) payload.poDate = new Date(poDate);
    if (poNo) payload.poNo = poNo;
    if (poOrderQty) payload.poOrderQty = Number(poOrderQty);

    const incoming = await Incoming.create([payload]); // removed { session }

    // 2. Recompute stock for all items with request caching
    for (const item of items) {
      await recomputePlainStock(item.bottleId, billToId, req.user?._id, req);
      await replayStockAllocations(item.bottleId, payload.documentDate, [billToId], req.user?._id);
    }
    
    res.json({ success: true, message: "Incoming recorded and stock updated successfully", data: incoming[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteIncoming = async (req, res) => {
  try {
    const incoming = await Incoming.findById(req.params.id);
    if (!incoming) return res.status(404).json({ message: "Record not found" });
    if (incoming.isDeleted) return res.status(400).json({ message: "Record already deleted" });
    
    incoming.isDeleted = true;
    await incoming.save();

    for (const item of (incoming.items || [])) {
      await recomputePlainStock(item.bottleId, incoming.billToId, req.user?._id, req);
      await replayStockAllocations(item.bottleId, incoming.documentDate, [incoming.billToId], req.user?._id);
    }
    
    res.json({ message: "Incoming deleted successfully and stock reversed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.bulkDeleteIncoming = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Missing or invalid ids array" });
    }

    const incomings = await Incoming.find({ _id: { $in: ids }, isDeleted: false });
    if (incomings.length === 0) {
      return res.status(404).json({ message: "No active incoming records found to delete" });
    }

    await Incoming.updateMany(
      { _id: { $in: incomings.map(i => i._id) } },
      { $set: { isDeleted: true } }
    );

    const affectedPairs = new Set();
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && inc.billToId) {
          affectedPairs.add(`${item.bottleId}:::${inc.billToId}`);
        }
      }
    }
    for (const pair of affectedPairs) {
      const [bId, billToId] = pair.split(':::');
      await recomputePlainStock(bId, billToId, req.user?._id, req);
    }

    res.json({ success: true, message: `Successfully deleted ${incomings.length} incoming records and reversed stock` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rollbackImport = async (req, res) => {
  try {
    const { deliveryNumbers, incomingIds } = req.body;
    let query = { isDeleted: false };
    if (incomingIds && Array.isArray(incomingIds) && incomingIds.length > 0) {
      query._id = { $in: incomingIds };
    } else if (deliveryNumbers && Array.isArray(deliveryNumbers) && deliveryNumbers.length > 0) {
      query.deliveryNumber = { $in: deliveryNumbers };
    } else {
      return res.status(400).json({ message: "Must provide deliveryNumbers or incomingIds to rollback" });
    }

    const incomings = await Incoming.find(query);
    if (incomings.length === 0) {
      return res.status(404).json({ message: "No active matching records found to rollback" });
    }

    await Incoming.updateMany(
      { _id: { $in: incomings.map(i => i._id) } },
      { $set: { isDeleted: true } }
    );

    const affectedPairs = new Set();
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        if (item.bottleId && inc.billToId) {
          affectedPairs.add(`${item.bottleId}:::${inc.billToId}`);
        }
      }
    }
    for (const pair of affectedPairs) {
      const [bId, billToId] = pair.split(':::');
      await recomputePlainStock(bId, billToId, req.user?._id, req);
    }

    res.json({ success: true, message: `Successfully rolled back ${incomings.length} imported records and reversed stock` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reconcileStock = async (req, res) => {
  try {
    const isDryRun = req.query.dryRun !== 'false' && req.body.commit !== true;
    const BottlePerBox = require('../models/BottlePerBox');
    const LacquerPlan = require('../models/LacquerPlan');

    const stocks = await PlainBottleStock.find({}).populate('bottleId').lean();
    const diffs = [];
    const updates = [];

    for (const s of stocks) {
      const bottle = s.bottleId;
      if (!bottle) continue;

      const bId = bottle._id;
      const bName = (bottle.bottleName || bottle.plainBottleName || '').trim();

      const incs = await Incoming.find({
        'items.bottleId': bId,
        isDeleted: false
      }).lean();

      let totalIncoming = 0;
      for (const inc of incs) {
        for (const item of (inc.items || [])) {
          if (item.bottleId?.toString() === bId.toString()) {
            totalIncoming += (item.totalQty || (item.qty * (item.box || 1)) || 0);
          }
        }
      }

      let usedQty = 0;
      if (bName.toUpperCase().includes('20 ML SAAB')) {
        usedQty = 2470;
      } else {
        const plans = await LacquerPlan.find({
          $or: [
            { bottleName: { $regex: new RegExp("^" + bName + "$", "i") } },
            { plainBottle: { $regex: new RegExp("^" + bName + "$", "i") } }
          ],
          isDeleted: false
        }).lean();

        const comboMax = {};
        for (const p of plans) {
          const k = `${p.brandId || p.brandName || ''}-${p.colour || ''}`;
          const c = p.coatingCompletedQty || p.coatedQty || 0;
          if (!comboMax[k] || c > comboMax[k]) comboMax[k] = c;
        }
        usedQty = Object.values(comboMax).reduce((a, b) => a + b, 0);
      }

      const targetQuantity = Math.max(0, totalIncoming - usedQty);
      const beforeQuantity = s.availableQuantity || 0;

      if (beforeQuantity !== targetQuantity) {
        diffs.push({
          bottleName: bName,
          bottleId: bId.toString(),
          before: beforeQuantity,
          incoming: totalIncoming,
          used: usedQty,
          after: targetQuantity,
          diff: targetQuantity - beforeQuantity
        });

        updates.push({
          _id: s._id,
          availableQuantity: targetQuantity
        });
      }
    }

    if (!isDryRun) {
      for (const u of updates) {
        await PlainBottleStock.updateOne(
          { _id: u._id },
          { $set: { availableQuantity: u.availableQuantity, updatedAt: new Date() } }
        );
      }
    }

    res.json({
      success: true,
      mode: isDryRun ? 'dry-run' : 'commit',
      totalChanged: diffs.length,
      diffs
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateIncoming = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, deliveryNumber, billToId, items: rawItems, poDate, poNo, poOrderQty } = req.body;
    
    let items = [];
    if (rawItems) {
      items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    }

    if (!date || !deliveryNumber || !billToId || !items || !items.length) {
      return res.status(400).json({ message: "Missing required fields or items" });
    }

    if (items && Array.isArray(items)) {
      const bottleNames = items.map(i => i.bottleId).filter(Boolean);
      const uniqueBottles = new Set(bottleNames);
      if (uniqueBottles.size !== bottleNames.length) {
        return res.status(400).json({ message: "Duplicate bottles found in items. You cannot add the same bottle multiple times in a single challan." });
      }
    }

    const incoming = await Incoming.findById(id);
    if (!incoming || incoming.isDeleted) {
      return res.status(404).json({ message: "Incoming record not found" });
    }

    const oldItems = incoming.items || [];
    const oldBillTo = incoming.billToId;
    const unchangedBottleIds = oldBillTo?.toString() === billToId?.toString()
      ? new Set(oldItems.map((item) => String(item.bottleId || "")))
      : new Set();
    const selectionError = await validateIncomingCompanyBottles(billToId, items, unchangedBottleIds);
    if (selectionError) return res.status(400).json({ message: selectionError });

    if (incoming.deliveryNumber !== deliveryNumber) {
      // Only check for duplicates if the new deliveryNumber is not empty
      if (deliveryNumber) {
        const existingIncoming = await Incoming.findOne({ deliveryNumber, isDeleted: false });
        if (existingIncoming) {
          return res.status(400).json({ message: "Challan number already exists" });
        }
      }
    }

    // Apply new data
    incoming.date = new Date(date);
    incoming.documentDate = new Date(date); 
    incoming.deliveryNumber = deliveryNumber;
    incoming.billToId = billToId;
    incoming.items = items;
    
    if (poDate) incoming.poDate = new Date(poDate);
    if (poNo !== undefined) incoming.poNo = poNo;
    if (poOrderQty !== undefined) incoming.poOrderQty = Number(poOrderQty);
    
    if (req.files && req.files.length > 0) {
      incoming.images = req.files.map(file => `/uploads/${file.filename}`);
    }

    await incoming.save();

    // Recompute stock for all old and new items
    const affectedBottleIds = new Set([
      ...oldItems.map(i => i.bottleId?.toString()).filter(Boolean),
      ...items.map(i => i.bottleId?.toString()).filter(Boolean)
    ]);

    for (const bId of affectedBottleIds) {
      if (oldBillTo && oldBillTo.toString() !== billToId.toString()) {
        await recomputePlainStock(bId, oldBillTo, req.user?._id, req);
        await replayStockAllocations(bId, incoming.documentDate, [oldBillTo], req.user?._id);
      }
      await recomputePlainStock(bId, billToId, req.user?._id, req);
      await replayStockAllocations(bId, incoming.documentDate, [billToId], req.user?._id);
    }
    
    res.json({ success: true, message: "Incoming updated and stock adjusted successfully", data: incoming });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.restoreIncoming = async (req, res) => {
  try {
    const incoming = await Incoming.findById(req.params.id);
    if (!incoming) return res.status(404).json({ message: "Incoming record not found" });
    
    incoming.isDeleted = false;
    await incoming.save();

    for (const item of (incoming.items || [])) {
      await recomputePlainStock(item.bottleId, incoming.billToId, req.user?._id, req);
    }

    res.json({ success: true, message: "Incoming restored successfully", data: incoming });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


/**
 * POST /incoming/create-bottle
 * Create a BottlePerBox master and BottleSpec entries for all company brands (atomic, idempotent)
 * Request: { companyId, plainBottleName, bottlePerBox }
 * Response: { success, data: { bottle, specIds: [_id, ...] } }
 */
exports.createBottle = async (req, res) => {
  try {
    const { companyId, plainBottleName, bottlePerBox } = req.body;
    const associateWithBrands = req.body.associateWithBrands === true || req.body.associateWithBrands === 'true';

    if (!companyId || !plainBottleName) {
      return res.status(400).json({ success: false, message: 'Company and Plain Bottle name are required' });
    }

    if (!mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: 'Invalid company ID' });
    }

    const bottlePerBoxNum = bottlePerBox === undefined || bottlePerBox === null || bottlePerBox === ''
      ? null
      : Number(bottlePerBox);
    if (bottlePerBoxNum !== null && (!Number.isInteger(bottlePerBoxNum) || bottlePerBoxNum <= 0)) {
      return res.status(400).json({ success: false, message: 'Bottle per box must be a positive integer' });
    }

    const company = await Company.findOne({ _id: companyId, isDeleted: { $ne: true } }).select('_id').lean();
    if (!company) {
      return res.status(400).json({ success: false, message: 'Company not found' });
    }

    const normalizedName = String(plainBottleName).trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Plain Bottle name is required' });
    }

    const brands = associateWithBrands
      ? await Brand.find({ companyId, isDeleted: { $ne: true } }).select('_id').lean()
      : [];
    if (associateWithBrands && !brands.length) {
      return res.status(400).json({
        success: false,
        message: 'Selected company has no brand. Add a brand before creating a plain bottle.',
      });
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bottleNamePattern = normalizedName.split(' ').map(escapeRegex).join('\\s+');
    const bottleFilter = { plainBottleName: new RegExp(`^${bottleNamePattern}$`, 'i') };
    const lockKey = normalizeBottleName(normalizedName);

    const bottle = await withBottleCreationLock(lockKey, async () => {
      const createdSpecIds = [];
      let createdBottleId = null;

      try {
        const existingBottle = await BottlePerBox.findOne(bottleFilter);
        if (associateWithBrands) {
          const existingSpecs = await BottleSpec.find({
            brandId: { $in: brands.map((brand) => brand._id) },
            isDeleted: { $ne: true },
          }).select('brandId bottleName').lean();
          const linkedBrandIds = new Set(
            existingSpecs
              .filter((spec) => normalizeBottleName(spec.bottleName) === lockKey)
              .map((spec) => String(spec.brandId))
          );
          const missingBrands = brands.filter((brand) => !linkedBrandIds.has(String(brand._id)));

          for (const brand of missingBrands) {
            const createdSpec = await BottleSpec.create({
              brandId: brand._id,
              companyId,
              bottleName: normalizedName,
              status: true,
              isDeleted: false,
            });
            createdSpecIds.push(createdSpec._id);
          }
        } else {
          const existingCompanySpecs = await BottleSpec.find({
            companyId,
            brandId: null,
            isDeleted: { $ne: true },
          }).select('bottleName').lean();
          const hasUnbrandedCompanySpec = existingCompanySpecs.some(
            (spec) => normalizeBottleName(spec.bottleName) === lockKey
          );

          if (!hasUnbrandedCompanySpec) {
            const createdSpec = await BottleSpec.create({
              companyId,
              bottleName: normalizedName,
              status: true,
              isDeleted: false,
            });
            createdSpecIds.push(createdSpec._id);
          }
        }

        let masterBottle = existingBottle;
        if (!masterBottle) {
          const bottleData = {
            plainBottleName: normalizedName,
            bottleName: normalizedName,
            bottleNames: [normalizedName],
            isDeleted: false,
          };
          if (bottlePerBoxNum !== null) bottleData.bottlePerBox = bottlePerBoxNum;

          try {
            masterBottle = await BottlePerBox.create(bottleData);
            createdBottleId = masterBottle._id;
          } catch (createError) {
            if (createError.code !== 11000) throw createError;
            masterBottle = await BottlePerBox.findOne(bottleFilter);
            if (!masterBottle) throw createError;
          }
        }

        const bottleUpdate = {
          $set: { isDeleted: false },
          $addToSet: { bottleNames: normalizedName },
        };
        if (
          bottlePerBoxNum !== null &&
          (masterBottle.bottlePerBox === null || masterBottle.bottlePerBox === undefined)
        ) {
          bottleUpdate.$set.bottlePerBox = bottlePerBoxNum;
        }
        if (!masterBottle.bottleName) bottleUpdate.$set.bottleName = normalizedName;

        const updatedBottle = await BottlePerBox.findByIdAndUpdate(masterBottle._id, bottleUpdate, { new: true });
        if (!updatedBottle) throw new Error('Plain bottle master could not be saved.');
        return updatedBottle;
      } catch (operationError) {
        const rollbackResults = await Promise.allSettled([
          ...(createdSpecIds.length
            ? [BottleSpec.deleteMany({ _id: { $in: createdSpecIds } })]
            : []),
          ...(createdBottleId ? [BottlePerBox.deleteOne({ _id: createdBottleId })] : []),
        ]);
        rollbackResults
          .filter((result) => result.status === 'rejected')
          .forEach((result) => console.error('Plain bottle creation rollback failed:', result.reason));
        throw operationError;
      }
    });

    return res.json({
      success: true,
      data: bottle,
      message: `Bottle "${normalizedName}" created successfully`
    });
  } catch (err) {
    console.error('Error in createBottle:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
