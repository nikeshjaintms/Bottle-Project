const Dispatch = require("../models/Dispatch");
const mongoose = require("mongoose");
const { computePlainBottleKeys, updatePlainBottleKeysAtomic, normalizeBottleName } = require("../utils/computePlainBottleKeys");

exports.getBottleOptions = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    const db = mongoose.connection.db;
    const comp = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(companyId) });
    const isShreno = comp && /shreno/i.test(comp.name);
    
    // Aggregate bottles that actually have entries in this company
    const rawOptions = await db.collection('dispatches').aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          isDeleted: false,
          plainBottleKeys: { $exists: true, $ne: [] }
        }
      },
      { $unwind: "$plainBottleKeys" },
      {
        $match: {
          plainBottleKeys: { $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: { docId: "$_id", bottle: "$plainBottleKeys" }
        }
      },
      {
        $group: {
          _id: "$_id.bottle",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const optionsMap = new Map();
    rawOptions.forEach(r => {
      if (r.count > 0) optionsMap.set(r._id, r.count);
    });

    // The bottle dropdown for SHRENO shows the plain bottles that have SHRENO lines plus the full master (zero-count allowed)
    if (isShreno) {
      const masterBottles = await db.collection('bottleperboxes')
        .find({ isDeleted: { $ne: true } })
        .project({ plainBottleName: 1, bottleName: 1 })
        .toArray();
      
      masterBottles.forEach(b => {
        const name = normalizeBottleName(b.plainBottleName || b.bottleName);
        if (name && !optionsMap.has(name)) {
          optionsMap.set(name, 0);
        }
      });
    }

    // Natural numeric sort
    const options = Array.from(optionsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

    // Unmapped count: entries with empty or missing plainBottleKeys
    const unmappedCount = await db.collection('dispatches').countDocuments({
      companyId: new mongoose.Types.ObjectId(companyId),
      isDeleted: false,
      $or: [
        { plainBottleKeys: { $exists: false } },
        { plainBottleKeys: [] }
      ]
    });
    
    res.json({ data: options, unmappedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDispatchBottles = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    // Get all dispatches for this company and extract unique bottles
    const dispatches = await Dispatch.find({ companyId, isDeleted: false })
      .populate({
        path: 'items.bottleId',
        select: 'bottleName plainBottleName _id'
      });

    const bottleMap = new Map();
    dispatches.forEach(dispatch => {
      if (dispatch.items && Array.isArray(dispatch.items)) {
        dispatch.items.forEach(item => {
          if (item.bottleId) {
            const bottleId = item.bottleId._id || item.bottleId;
            const bottleName = item.bottleId.bottleName || item.bottleId.plainBottleName;
            if (!bottleMap.has(String(bottleId))) {
              bottleMap.set(String(bottleId), {
                _id: bottleId,
                bottleName: bottleName,
                plainBottleName: item.bottleId.plainBottleName || bottleName
              });
            }
          }
        });
      }
    });

    const bottles = Array.from(bottleMap.values());
    const mostRecentBottleId = dispatches.length > 0 && dispatches[0].items?.length > 0 
      ? dispatches[0].items[0].bottleId?._id 
      : (bottles.length > 0 ? bottles[0]._id : null);

    res.json({
      data: {
        bottles: bottles,
        mostRecentBottleId: mostRecentBottleId,
        company: { name: companyId }
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllDispatch = async (req, res) => {
  try {
    const { page, limit, search, pagination = "true", dateFrom, dateTo, searchPrinting, companyId, plainBottleName } = req.query;
    const query = { isDeleted: false };
    
    // Filter by gate pass number
    if (search) {
      query.gatePassNo = { $regex: search, $options: "i" };
    }
    
    if (companyId) {
      query.companyId = new mongoose.Types.ObjectId(companyId);
    }
    
    // Filter by plain bottle name (in plainBottleKeys array)
    if (plainBottleName) {
      if (plainBottleName === 'Unmapped') {
        // Unmapped entries have empty plainBottleKeys array or are missing
        query.$or = [
          { plainBottleKeys: { $exists: false } },
          { plainBottleKeys: [] }
        ];
      } else {
        const normalized = normalizeBottleName(plainBottleName);
        query.plainBottleKeys = normalized || plainBottleName;
      }
    }
    
    if (searchPrinting) {
      query["items.printing"] = { $regex: searchPrinting, $options: "i" };
    }

    if (dateFrom || dateTo) {
      query.dispatchDate = {};
      if (dateFrom) query.dispatchDate.$gte = new Date(dateFrom);
      if (dateTo) query.dispatchDate.$lte = new Date(dateTo);
    }

    if (pagination === "false") {
      const dispatches = await Dispatch.find(query)
        .populate('companyId', 'name')
        .lean()
        .sort({ dispatchDate: -1, createdAt: -1 });
      
      // Batch load bottle, variant, printing data
      if (dispatches.length > 0) {
        await batchPopulateItems(dispatches);
      }

      // When bottle filter is active, show only the lines of that bottle in each entry
      if (plainBottleName) {
        dispatches.forEach(d => {
          if (d.items && Array.isArray(d.items)) {
            if (plainBottleName === 'Unmapped') {
              d.items = d.items.filter(item => !item.bottleId || item.isUnmapped || !item.plainBottleName);
            } else {
              d.items = d.items.filter(item => item.plainBottleName === plainBottleName);
            }
          }
        });
      }
      
      const total = dispatches.length;
      return res.json({ data: dispatches, total, page: 1, limit: total, totalPages: 1 });
    }

    const total = await Dispatch.countDocuments(query);
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const dispatches = await Dispatch.find(query)
      .populate('companyId', 'name')
      .lean()
      .sort({ dispatchDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);
    
    // Batch load bottle, variant, printing data
    if (dispatches.length > 0) {
      await batchPopulateItems(dispatches);
    }

    // When bottle filter is active, show only the lines of that bottle in each entry
    if (plainBottleName) {
      dispatches.forEach(d => {
        if (d.items && Array.isArray(d.items)) {
          if (plainBottleName === 'Unmapped') {
            d.items = d.items.filter(item => !item.bottleId || item.isUnmapped || !item.plainBottleName);
          } else {
            d.items = d.items.filter(item => item.plainBottleName === plainBottleName);
          }
        }
      });
    }
      
    res.json({
      data: dispatches,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function batchPopulateItems(dispatches) {
  // Collect all IDs to populate
  const bottleIds = new Set();
  const variantIds = new Set();
  const printingTypeIds = new Set();
  
  dispatches.forEach(dispatch => {
    if (dispatch.items) {
      dispatch.items.forEach(item => {
        if (item.bottleId) bottleIds.add(String(item.bottleId));
        if (item.variantId) variantIds.add(String(item.variantId));
        if (item.printingTypeId) printingTypeIds.add(String(item.printingTypeId));
      });
    }
  });
  
  // Batch fetch all references
  const [bottles, variants, printingTypes] = await Promise.all([
    bottleIds.size > 0 ? mongoose.model('BottlePerBox').find(
      { _id: { $in: Array.from(bottleIds).map(id => new mongoose.Types.ObjectId(id)) } },
      'bottleName plainBottleName'
    ).lean() : Promise.resolve([]),
    variantIds.size > 0 ? mongoose.model('Variant').find(
      { _id: { $in: Array.from(variantIds).map(id => new mongoose.Types.ObjectId(id)) } },
      'variantName'
    ).lean() : Promise.resolve([]),
    printingTypeIds.size > 0 ? mongoose.model('PrintingType').find(
      { _id: { $in: Array.from(printingTypeIds).map(id => new mongoose.Types.ObjectId(id)) } },
      'name'
    ).lean() : Promise.resolve([])
  ]);
  
  const bottleMap = new Map(bottles.map(b => [String(b._id), b]));
  const variantMap = new Map(variants.map(v => [String(v._id), v]));
  const printingMap = new Map(printingTypes.map(p => [String(p._id), p]));
  
  // Populate items with names
  dispatches.forEach(dispatch => {
    if (dispatch.items) {
      dispatch.items.forEach(item => {
        // Resolve plainBottleName with fallback
        if (item.bottleId) {
          const bottleData = bottleMap.get(String(item.bottleId));
          if (bottleData) {
            item.plainBottleName = normalizeBottleName(bottleData.plainBottleName || bottleData.bottleName);
          }
        } else if (!item.plainBottleName) {
          // Entry with no bottle - mark as Unmapped
          item.plainBottleName = null;
          item.isUnmapped = true;
        }
        
        // Resolve variantName with fallback
        if (item.variantId) {
          const variantData = variantMap.get(String(item.variantId));
          if (variantData) {
            item.variantName = variantData.variantName;
          } else if (item.printing) {
            item.variantName = item.printing;
          }
        } else if (item.printing) {
          item.variantName = item.printing;
        }
        
        // Fallback for coating shade from productName if available
        if (!item.coatingShade && item.productName) {
          item.coatingShadeHint = item.productName;
        }
        
        // Keep printingTypeId for reference
        if (item.printingTypeId) {
          const printingData = printingMap.get(String(item.printingTypeId));
          if (printingData) {
            item.printTypeName = printingData.name;
          }
        }
      });
    }
  });
}

exports.getDispatchById = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id)
      .populate('companyId', 'name')
      .lean();
      
    if (!dispatch || dispatch.isDeleted) {
      return res.status(404).json({ message: "Dispatch record not found" });
    }
    
    // Batch populate items with plainBottleName and variantName
    await batchPopulateItems([dispatch]);
    
    res.json({ dispatch, items: dispatch.items });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createDispatch = async (req, res) => {
  try {
    const { dispatchDate, gatePassNo, companyId, remarks, items: rawItems } = req.body;
    
    let items = [];
    if (rawItems) {
      items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    }

    if (!dispatchDate || !gatePassNo || !companyId || !items || !items.length) {
      return res.status(400).json({ message: "Missing required fields or items" });
    }

    // Check for existing Gate Pass Number
    const existingDispatch = await Dispatch.findOne({ gatePassNo, isDeleted: false });
    if (existingDispatch) {
      return res.status(400).json({ message: "Gate Pass No. already exists" });
    }

    const validatedItems = items.map(item => {
      // New schema: bottleId, variantId, coatingShade, printingTypeId, detectedTextColor
      // Old schema: productName, printing, foil, organic, additionalBox
      
      const bottleId = item.bottleId || null;
      const variantId = item.variantId || null;
      const coatingShade = item.coatingShade || null;
      const printingTypeId = item.printingTypeId || null;
      const detectedTextColor = item.detectedTextColor || "Not Detected";
      const box = Number(item.box) || 0;
      const qty = Number(item.qty) || 0;
      const totalQty = Number(item.totalQty) || (box * qty);
      
      // At least bottleId is required (productName is for old unmapped entries)
      if (!bottleId && !item.productName) {
        throw new Error("Missing required fields in item: bottleId or productName required");
      }
      
      if (box < 0 || qty < 0) {
        throw new Error("Box and Qty cannot be negative");
      }
      
      return {
        bottleId: bottleId || null,
        variantId,
        coatingShade,
        printingTypeId,
        detectedTextColor,
        box,
        qty,
        totalQty,
        // Keep old fields for backward compatibility
        productName: item.productName,
        printing: item.printing,
        foil: item.foil,
        organic: item.organic,
        additionalBox: Number(item.additionalBox) || 0,
        remarks: item.remarks
      };
    });

    const dispatch = new Dispatch({
      dispatchDate,
      gatePassNo,
      companyId,
      remarks,
      items: validatedItems,
      createdBy: req.user ? req.user.id : undefined
    });

    await dispatch.save();
    
    // Compute and set plainBottleKeys
    const plainBottleKeys = await computePlainBottleKeys(validatedItems);
    await updatePlainBottleKeysAtomic(mongoose.connection.db, dispatch._id, plainBottleKeys);
    
    // Populate references
    await dispatch.populate([
      { path: 'companyId', select: 'name' }
    ]);
    
    // Batch populate items
    const db = mongoose.connection.db;
    const bottleIds = validatedItems.filter(i => i.bottleId).map(i => new mongoose.Types.ObjectId(i.bottleId));
    const variantIds = validatedItems.filter(i => i.variantId).map(i => new mongoose.Types.ObjectId(i.variantId));
    const printingTypeIds = validatedItems.filter(i => i.printingTypeId).map(i => new mongoose.Types.ObjectId(i.printingTypeId));
    
    const [bottles, variants, printingTypes] = await Promise.all([
      bottleIds.length > 0 ? mongoose.model('BottlePerBox').find({ _id: { $in: bottleIds } }, 'bottleName plainBottleName').lean() : [],
      variantIds.length > 0 ? mongoose.model('Variant').find({ _id: { $in: variantIds } }, 'variantName').lean() : [],
      printingTypeIds.length > 0 ? mongoose.model('PrintingType').find({ _id: { $in: printingTypeIds } }, 'name').lean() : []
    ]);
    
    const bottleMap = new Map(bottles.map(b => [String(b._id), b]));
    const variantMap = new Map(variants.map(v => [String(v._id), v]));
    const printingMap = new Map(printingTypes.map(p => [String(p._id), p]));
    
    dispatch.items.forEach(item => {
      if (item.bottleId) item.bottleId = bottleMap.get(String(item.bottleId)) || item.bottleId;
      if (item.variantId) item.variantId = variantMap.get(String(item.variantId)) || item.variantId;
      if (item.printingTypeId) item.printingTypeId = printingMap.get(String(item.printingTypeId)) || item.printingTypeId;
    });

    res.status(201).json({
      message: "Dispatch created successfully",
      dispatch
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateDispatch = async (req, res) => {
  try {
    const { dispatchDate, gatePassNo, companyId, remarks, items: rawItems } = req.body;
    
    const dispatch = await Dispatch.findOne({ _id: req.params.id, isDeleted: false });
    if (!dispatch) {
      return res.status(404).json({ message: "Dispatch not found" });
    }

    // Check Gate Pass No uniqueness
    if (gatePassNo && gatePassNo !== dispatch.gatePassNo) {
      const existingDispatch = await Dispatch.findOne({ gatePassNo, isDeleted: false });
      if (existingDispatch) {
        return res.status(400).json({ message: "Gate Pass No. already exists" });
      }
    }

    let items = [];
    if (rawItems) {
      items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      
      const validatedItems = items.map(item => {
        // New schema: bottleId, variantId, coatingShade, printingTypeId, detectedTextColor
        // Old schema: productName, printing, foil, organic, additionalBox
        
        const bottleId = item.bottleId || null;
        const variantId = item.variantId || null;
        const coatingShade = item.coatingShade || null;
        const printingTypeId = item.printingTypeId || null;
        const detectedTextColor = item.detectedTextColor || "Not Detected";
        const box = Number(item.box) || 0;
        const qty = Number(item.qty) || 0;
        const totalQty = Number(item.totalQty) || (box * qty);
        
        // At least bottleId is required (productName is for old unmapped entries)
        if (!bottleId && !item.productName) {
          throw new Error("Missing required fields in item: bottleId or productName required");
        }
        
        if (box < 0 || qty < 0) {
          throw new Error("Box and Qty cannot be negative");
        }
        
        return {
          bottleId: bottleId || null,
          variantId,
          coatingShade,
          printingTypeId,
          detectedTextColor,
          box,
          qty,
          totalQty,
          // Keep old fields for backward compatibility
          productName: item.productName,
          printing: item.printing,
          foil: item.foil,
          organic: item.organic,
          additionalBox: Number(item.additionalBox) || 0,
          remarks: item.remarks
        };
      });
      dispatch.items = validatedItems;
    }

    if (dispatchDate) dispatch.dispatchDate = dispatchDate;
    if (gatePassNo) dispatch.gatePassNo = gatePassNo;
    if (companyId) dispatch.companyId = companyId;
    if (remarks !== undefined) dispatch.remarks = remarks;

    await dispatch.save();
    
    // Recompute plainBottleKeys
    const plainBottleKeys = await computePlainBottleKeys(dispatch.items);
    await updatePlainBottleKeysAtomic(mongoose.connection.db, dispatch._id, plainBottleKeys);
    
    // Populate references
    await dispatch.populate([
      { path: 'companyId', select: 'name' }
    ]);
    
    // Batch populate items
    const db = mongoose.connection.db;
    const bottleIds = dispatch.items.filter(i => i.bottleId).map(i => new mongoose.Types.ObjectId(i.bottleId));
    const variantIds = dispatch.items.filter(i => i.variantId).map(i => new mongoose.Types.ObjectId(i.variantId));
    const printingTypeIds = dispatch.items.filter(i => i.printingTypeId).map(i => new mongoose.Types.ObjectId(i.printingTypeId));
    
    const [bottles, variants, printingTypes] = await Promise.all([
      bottleIds.length > 0 ? mongoose.model('BottlePerBox').find({ _id: { $in: bottleIds } }, 'bottleName plainBottleName').lean() : [],
      variantIds.length > 0 ? mongoose.model('Variant').find({ _id: { $in: variantIds } }, 'variantName').lean() : [],
      printingTypeIds.length > 0 ? mongoose.model('PrintingType').find({ _id: { $in: printingTypeIds } }, 'name').lean() : []
    ]);
    
    const bottleMap = new Map(bottles.map(b => [String(b._id), b]));
    const variantMap = new Map(variants.map(v => [String(v._id), v]));
    const printingMap = new Map(printingTypes.map(p => [String(p._id), p]));
    
    dispatch.items.forEach(item => {
      if (item.bottleId) item.bottleId = bottleMap.get(String(item.bottleId)) || item.bottleId;
      if (item.variantId) item.variantId = variantMap.get(String(item.variantId)) || item.variantId;
      if (item.printingTypeId) item.printingTypeId = printingMap.get(String(item.printingTypeId)) || item.printingTypeId;
    });

    res.json({
      message: "Dispatch updated successfully",
      dispatch
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteDispatch = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id);
    if (!dispatch || dispatch.isDeleted) {
      return res.status(404).json({ message: "Dispatch not found" });
    }

    dispatch.isDeleted = true;
    await dispatch.save();

    res.json({ message: "Dispatch deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
