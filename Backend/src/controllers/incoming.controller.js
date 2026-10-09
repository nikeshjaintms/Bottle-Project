const Incoming = require("../models/Incoming");
const PlainBottleStock = require("../models/PlainBottleStock");
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

    // 0. Check for existing Challan Number
    const existingIncoming = await Incoming.findOne({ deliveryNumber, isDeleted: false });
    if (existingIncoming) {
      return res.status(400).json({ message: "Challan number already exists" });
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

    // 2. Immediately update the Stock
    const bulkOps = items.map(item => ({
      updateOne: {
        filter: { bottleId: item.bottleId },
        update: {
          $inc: { availableQuantity: item.totalQty },
          $set: { lastUpdatedBy: req.user._id },
          $setOnInsert: { reservedQuantity: 0 }
        },
        upsert: true
      }
    }));
    if (bulkOps.length > 0) {
      await PlainBottleStock.bulkWrite(bulkOps);
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
    
    incoming.isDeleted = true;
    await incoming.save();
    
    res.json({ message: "Incoming deleted successfully" });
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
      const existingIncoming = await Incoming.findOne({ deliveryNumber, isDeleted: false });
      if (existingIncoming) {
        return res.status(400).json({ message: "Challan number already exists" });
      }
    }

    // Revert old stock
    // Revert old stock
    const revertOps = incoming.items.map(oldItem => ({
      updateOne: {
        filter: { bottleId: oldItem.bottleId },
        update: {
          $inc: { availableQuantity: -oldItem.totalQty },
          $set: { lastUpdatedBy: req.user._id }
        }
      }
    }));
    if (revertOps.length > 0) {
      await PlainBottleStock.bulkWrite(revertOps);
    }

    // Apply new data
    incoming.date = new Date(date);
    // Maintain backwards compatibility with documentDate if used in frontend vs date in backend
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

    // Apply new stock
    // Apply new stock
    const applyOps = items.map(item => ({
      updateOne: {
        filter: { bottleId: item.bottleId },
        update: {
          $inc: { availableQuantity: item.totalQty },
          $set: { lastUpdatedBy: req.user._id },
          $setOnInsert: { reservedQuantity: 0 }
        },
        upsert: true
      }
    }));
    if (applyOps.length > 0) {
      await PlainBottleStock.bulkWrite(applyOps);
    }

    await incoming.save();
    
    res.json({ success: true, message: "Incoming updated and stock adjusted successfully", data: incoming });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
