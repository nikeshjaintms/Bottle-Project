const Incoming = require("../models/Incoming");
const PlainBottleStock = require("../models/PlainBottleStock");
const { recomputePlainStock } = require("../utils/stockRecompute");
const mongoose = require("mongoose");

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
        .populate("items.bottleId", "bottleName")
        .sort({ date: -1, createdAt: -1 });
      return res.json({ data: incomings, total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const incomings = await Incoming.find(query)
        .populate("billToId", "name")
      .populate("items.bottleId", "bottleName")
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
      .populate("items.bottleId", "bottleName")
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

    // 2. Recompute stock for all items
    for (const item of items) {
      await recomputePlainStock(item.bottleId, billToId, req.user?._id);
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
      await recomputePlainStock(item.bottleId, incoming.billToId, req.user?._id);
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

    const revertOps = [];
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        revertOps.push({
          updateOne: {
            filter: { bottleId: item.bottleId },
            update: {
              $inc: { availableQuantity: -item.totalQty },
              $set: { lastUpdatedBy: req.user?._id }
            }
          }
        });
      }
    }

    if (revertOps.length > 0) {
      await PlainBottleStock.bulkWrite(revertOps);
    }

    await Incoming.updateMany(
      { _id: { $in: incomings.map(i => i._id) } },
      { $set: { isDeleted: true } }
    );

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

    const revertOps = [];
    for (const inc of incomings) {
      for (const item of (inc.items || [])) {
        revertOps.push({
          updateOne: {
            filter: { bottleId: item.bottleId },
            update: {
              $inc: { availableQuantity: -item.totalQty },
              $set: { lastUpdatedBy: req.user?._id }
            }
          }
        });
      }
    }

    if (revertOps.length > 0) {
      await PlainBottleStock.bulkWrite(revertOps);
    }

    await Incoming.updateMany(
      { _id: { $in: incomings.map(i => i._id) } },
      { $set: { isDeleted: true } }
    );

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

    if (incoming.deliveryNumber !== deliveryNumber) {
      // Only check for duplicates if the new deliveryNumber is not empty
      if (deliveryNumber) {
        const existingIncoming = await Incoming.findOne({ deliveryNumber, isDeleted: false });
        if (existingIncoming) {
          return res.status(400).json({ message: "Challan number already exists" });
        }
      }
    }

    const oldItems = incoming.items || [];
    const oldBillTo = incoming.billToId;

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
        await recomputePlainStock(bId, oldBillTo, req.user?._id);
      }
      await recomputePlainStock(bId, billToId, req.user?._id);
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
      await recomputePlainStock(item.bottleId, incoming.billToId, req.user?._id);
    }

    res.json({ success: true, message: "Incoming restored successfully", data: incoming });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
