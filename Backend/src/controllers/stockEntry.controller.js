const StockEntry = require("../models/StockEntry");
const RawMaterial = require("../models/RawMaterial");
const mongoose = require("mongoose");

// o. CREATE Stock Entry (IN or OUT)
exports.addEntry = async (req, res) => {
  try {
    const { type, date, remarks, invoiceNumber, supplierName, invoiceFileUrl, items } = req.body;

    if (!type || !date || !items || !items.length) {
      return res.status(400).json({ success: false, message: "Missing required fields or items" });
    }

    if (type === "IN" && (!invoiceNumber || !supplierName)) {
      return res.status(400).json({ success: false, message: "Invoice Number and Supplier Name are required for Stock IN" });
    }

    const entry = await StockEntry.create({
      type,
      date: new Date(date),
      remarks,
      invoiceNumber: type === "IN" ? invoiceNumber : null,
      supplierName: type === "IN" ? supplierName : null,
      invoiceFileUrl: type === "IN" ? (invoiceFileUrl || null) : null,
      items
    });

    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. GET Invoices (Only type === IN)
exports.getInvoices = async (req, res) => {
  try {
    const { page, limit, search, pagination = "true" } = req.query;
    
    let filter = { type: "IN", isDeleted: false };
    if (search && search.trim() !== "") {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } }
      ];
    }

    const total = await StockEntry.countDocuments(filter);

    if (pagination === "false") {
      const invoices = await StockEntry.find(filter)
        .populate("items.rawMaterialId")
        .sort({ date: -1, createdAt: -1 });
      return res.json({ success: true, data: invoices, total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const invoices = await StockEntry.find(filter)
        .populate("items.rawMaterialId")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit).lean();

    res.json({
      success: true,
      data: invoices,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. GET Stock Summary dynamically via Aggregation
exports.getSummary = async (req, res) => {
  try {
    const queryDateStr = req.query.date;
    const { date, page = 1, limit = 10, search = '' } = req.query;
    
    // 1. Build filter for raw materials based on search
    let rmFilter = { isDeleted: false, status: true };
    if (search) {
      rmFilter.name = { $regex: search, $options: 'i' };
    }

    // 2. Paginate raw materials
    const totalMaterials = await RawMaterial.countDocuments(rmFilter);
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const rawMaterials = await RawMaterial.find(rmFilter)
        .sort({ name: 1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      ;

    const rawMaterialIds = rawMaterials.map(rm => rm._id);

    // Date filtering
    let startOfDay, endDate;
    
    if (date) {
      if (date.length === 4) {
        startOfDay = new Date(`${date}-01-01T00:00:00.000Z`);
        endDate = new Date(`${date}-12-31T23:59:59.999Z`);
      } else if (date.length === 7) {
        const [y, m] = date.split('-');
        startOfDay = new Date(`${date}-01T00:00:00.000Z`);
        endDate = new Date(y, m, 0, 23, 59, 59, 999);
      } else {
        endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        startOfDay = new Date(endDate);
        startOfDay.setHours(0, 0, 0, 0);
      }
    } else {
      // Lifetime mode
      endDate = new Date();
      startOfDay = new Date(0); // Epoch
    }

    const aggregation = await StockEntry.aggregate([
      { $match: { date: { $lte: endDate }, isDeleted: false, "items.rawMaterialId": { $in: rawMaterialIds } } },
      { $unwind: "$items" },
      { $match: { "items.rawMaterialId": { $in: rawMaterialIds } } },
      {
        $group: {
          _id: "$items.rawMaterialId",
          openingStock: {
            $sum: {
              $cond: [
                { $lt: ["$date", startOfDay] }, // If before today
                { $cond: [{ $eq: ["$type", "IN"] }, "$items.quantity", { $multiply: ["$items.quantity", -1] }] },
                0
              ]
            }
          },
          totalIn: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$date", startOfDay] }, { $eq: ["$type", "IN"] }] }, // If today and IN
                "$items.quantity",
                0
              ]
            }
          },
          totalOut: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$date", startOfDay] }, { $eq: ["$type", "OUT"] }] }, // If today and OUT
                "$items.quantity",
                0
              ]
            }
          },
          unit: { 
            $max: { $cond: [ { $and: [{ $ne: ["$items.per", ""] }, { $ne: ["$items.per", null] }] }, "$items.per", null ] } 
          }
        }
      }
    ]);

    const statsMap = {};
    aggregation.forEach(stat => {
      statsMap[stat._id.toString()] = stat;
    });

    const result = rawMaterials.map(rm => {
      const stats = statsMap[rm._id.toString()] || { openingStock: 0, totalIn: 0, totalOut: 0 };
      return {
        rawMaterial: rm,
        openingStock: stats.openingStock,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        currentStock: stats.openingStock + stats.totalIn - stats.totalOut,
        unit: stats.unit || 'KG'
      };
    });

    res.json({
      success: true, 
      data: {
        summary: result,
        page: parsedPage,
        totalPages: Math.ceil(totalMaterials / parsedLimit),
        total: totalMaterials
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. GET Material History
exports.getHistory = async (req, res) => {
  try {
    const { rawMaterialId } = req.params;
    const { page = 1, limit = 10, search = '' } = req.query;
    
    let filter = { isDeleted: false };
    if (rawMaterialId !== 'all') {
      filter["items.rawMaterialId"] = rawMaterialId;
    }

    const entries = await StockEntry.find(filter)
        .populate("items.rawMaterialId")
      .sort({ date: 1, createdAt: 1 }); // Sort ascending to build running balance

    let runningBalance = 0;
    let history = [];

    entries.forEach(entry => {
      const processItems = rawMaterialId === 'all'
        ? entry.items
        : entry.items.filter(i => i.rawMaterialId._id.toString() === rawMaterialId || i.rawMaterialId.toString() === rawMaterialId);

      processItems.forEach(item => {
        const qty = item.quantity;
        if (entry.type === "IN") {
          runningBalance += qty;
        } else {
          runningBalance -= qty;
        }

        const materialName = item.rawMaterialId ? (item.rawMaterialId.name || 'Unknown') : 'Unknown';

        history.push({
          _id: entry._id.toString() + '_' + (item.rawMaterialId._id?.toString() || item.rawMaterialId.toString()),
          date: entry.date,
          createdAt: entry.createdAt,
          type: entry.type,
          invoiceNumber: entry.invoiceNumber,
          supplierName: entry.supplierName,
          remarks: entry.remarks,
          quantity: qty,
          balance: runningBalance,
          materialName,
          unit: item.per || 'KG'
        });
      });
    });

    // Reverse to show latest first
    history.reverse();

    // 1. Search filtering
    if (search) {
      const lowerSearch = search.toLowerCase();
      history = history.filter(h => 
        (h.invoiceNumber && h.invoiceNumber.toLowerCase().includes(lowerSearch)) ||
        (h.supplierName && h.supplierName.toLowerCase().includes(lowerSearch)) ||
        (h.type && h.type.toLowerCase().includes(lowerSearch)) ||
        (h.remarks && h.remarks.toLowerCase().includes(lowerSearch)) ||
        (h.materialName && h.materialName.toLowerCase().includes(lowerSearch))
      );
    }

    // 2. Pagination
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const total = history.length;
    const paginatedHistory = history.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

    res.json({
      success: true,
      data: {
        history: paginatedHistory,
        currentStock: runningBalance,
        page: parsedPage,
        totalPages: Math.ceil(total / parsedLimit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. GET Single Entry
exports.getSingleEntry = async (req, res) => {
  try {
    const entry = await StockEntry.findOne({ _id: req.params.id, isDeleted: false })
      .populate("items.rawMaterialId").lean();
    
    if (!entry) return res.status(404).json({ success: false, message: "Stock entry not found" });

    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. UPDATE Stock Entry
exports.updateEntry = async (req, res) => {
  try {
    const { type, date, remarks, invoiceNumber, supplierName, invoiceFileUrl, items } = req.body;
    
    if (!type || !date || !items || !items.length) {
      return res.status(400).json({ success: false, message: "Missing required fields or items" });
    }

    const updatedData = {
      type,
      date: new Date(date),
      remarks,
      invoiceNumber: type === "IN" ? invoiceNumber : null,
      supplierName: type === "IN" ? supplierName : null,
      items
    };
    
    if (invoiceFileUrl !== undefined) {
      updatedData.invoiceFileUrl = invoiceFileUrl;
    }

    const entry = await StockEntry.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updatedData,
      { new: true }
    );

    if (!entry) return res.status(404).json({ success: false, message: "Stock entry not found" });

    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// o. DELETE Entry
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await StockEntry.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!entry) return res.status(404).json({ success: false, message: "Stock entry not found" });
    res.json({ success: true, message: "Stock entry deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
