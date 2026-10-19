const Dispatch = require("../models/Dispatch");
const mongoose = require("mongoose");

exports.getAllDispatch = async (req, res) => {
  try {
    const { page, limit, search, pagination = "true", dateFrom, dateTo, searchPrinting, companyId } = req.query;
    const query = { isDeleted: false };
    
    if (search) {
      // search by gatePassNo or bottleName
      query.$or = [
        { gatePassNo: { $regex: search, $options: "i" } },
        { "items.productName": { $regex: search, $options: "i" } }
      ];
    }
    
    if (companyId) {
      query.companyId = companyId;
    }
    
    if (searchPrinting) {
      query["items.printing"] = { $regex: searchPrinting, $options: "i" };
    }

    if (dateFrom || dateTo) {
      query.dispatchDate = {};
      if (dateFrom) query.dispatchDate.$gte = new Date(dateFrom);
      if (dateTo) query.dispatchDate.$lte = new Date(dateTo);
    }

    const total = await Dispatch.countDocuments(query);

    const populateOpts = [
      { path: 'companyId', select: 'name' },
      { path: 'items.bottleId', select: 'bottleName plainBottleName' },
      { path: 'items.variantId', select: 'variantName' },
      { path: 'items.printingTypeId', select: 'printingType' }
    ];

    if (pagination === "false") {
      const dispatches = await Dispatch.find(query)
        .populate(populateOpts)
        .sort({ dispatchDate: -1, createdAt: -1 });
      return res.json({ data: dispatches, total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const dispatches = await Dispatch.find(query)
      .populate(populateOpts)
      .sort({ dispatchDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);
      
    res.json({
      data: dispatches,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDispatchById = async (req, res) => {
  try {
    const dispatch = await Dispatch.findById(req.params.id)
      .populate('companyId', 'name')
      .populate({
        path: 'items.bottleId',
        select: 'bottleName plainBottleName bottlePerBox'
      })
      .populate({
        path: 'items.variantId',
        select: 'variantName'
      })
      .populate({
        path: 'items.printingTypeId',
        select: 'printingType'
      });
      
    if (!dispatch || dispatch.isDeleted) {
      return res.status(404).json({ message: "Dispatch record not found" });
    }
    
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

    // Validate and transform items - handle both old and new schema
    const validatedItems = items.map(item => {
      // New schema: bottleId, variantId, coatingShade, printingTypeId
      // Old schema: productName, printing, foil, organic, additionalBox
      
      const bottleId = item.bottleId;
      const variantId = item.variantId || null;
      const coatingShade = item.coatingShade || null;
      const printingTypeId = item.printingTypeId || null;
      const box = Number(item.box) || 0;
      const qty = Number(item.qty) || 0;
      const totalQty = Number(item.totalQty) || (box * qty);
      
      // At least one identifier is required
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
    
    // Populate references
    await dispatch.populate([
      { path: 'companyId', select: 'name' },
      { path: 'items.bottleId', select: 'bottleName' },
      { path: 'items.variantId', select: 'variantName' },
      { path: 'items.printingTypeId', select: 'printingType' }
    ]);

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
        // New schema: bottleId, variantId, coatingShade, printingTypeId
        // Old schema: productName, printing, foil, organic, additionalBox
        
        const bottleId = item.bottleId;
        const variantId = item.variantId || null;
        const coatingShade = item.coatingShade || null;
        const printingTypeId = item.printingTypeId || null;
        const box = Number(item.box) || 0;
        const qty = Number(item.qty) || 0;
        const totalQty = Number(item.totalQty) || (box * qty);
        
        // At least one identifier is required
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
    
    // Populate references
    await dispatch.populate([
      { path: 'companyId', select: 'name' },
      { path: 'items.bottleId', select: 'bottleName' },
      { path: 'items.variantId', select: 'variantName' },
      { path: 'items.printingTypeId', select: 'printingType' }
    ]);

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
