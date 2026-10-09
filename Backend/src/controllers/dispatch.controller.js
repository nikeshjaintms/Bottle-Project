const Dispatch = require("../models/Dispatch");
const mongoose = require("mongoose");

exports.getAllDispatch = async (req, res) => {
  try {
    const { page, limit, search, pagination = "true", dateFrom, dateTo, searchPrinting } = req.query;
    const query = { isDeleted: false };
    
    if (search) {
      // search by gatePassNo or productName
      query.$or = [
        { gatePassNo: { $regex: search, $options: "i" } },
        { "items.productName": { $regex: search, $options: "i" } }
      ];
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

    if (pagination === "false") {
      const dispatches = await Dispatch.find(query).sort({ dispatchDate: -1, createdAt: -1 });
      return res.json({ data: dispatches, total });
    }

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const dispatches = await Dispatch.find(query)
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
    const dispatch = await Dispatch.findById(req.params.id);
      
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
    const { dispatchDate, gatePassNo, remarks, items: rawItems } = req.body;
    
    let items = [];
    if (rawItems) {
      items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
    }

    if (!dispatchDate || !gatePassNo || !items || !items.length) {
      return res.status(400).json({ message: "Missing required fields or items" });
    }

    // Check for existing Gate Pass Number
    const existingDispatch = await Dispatch.findOne({ gatePassNo, isDeleted: false });
    if (existingDispatch) {
      return res.status(400).json({ message: "Gate Pass No. already exists" });
    }

    // Calculate/validate total
    const validatedItems = items.map(item => {
      if (!item.productName || item.box === undefined || item.qty === undefined) {
        throw new Error("Missing required fields in item");
      }
      if (item.box < 0 || item.qty < 0) {
        throw new Error("Box and Qty cannot be negative");
      }
      
      const box = Number(item.box) || 0;
      const additionalBox = Number(item.additionalBox) || 0;
      const qty = Number(item.qty) || 0;
      const total = box * qty;
      
      return {
        ...item,
        box,
        additionalBox,
        qty,
        total
      };
    });

    const dispatch = new Dispatch({
      dispatchDate,
      gatePassNo,
      remarks,
      items: validatedItems,
      createdBy: req.user ? req.user.id : undefined
    });

    await dispatch.save();

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
    const { dispatchDate, gatePassNo, remarks, items: rawItems } = req.body;
    
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
        if (!item.productName || item.box === undefined || item.qty === undefined) {
          throw new Error("Missing required fields in item");
        }
        if (item.box < 0 || item.qty < 0) {
          throw new Error("Box and Qty cannot be negative");
        }
        
        const box = Number(item.box) || 0;
        const additionalBox = Number(item.additionalBox) || 0;
        const qty = Number(item.qty) || 0;
        const total = box * qty;
        
        return {
          ...item,
          box,
          additionalBox,
          qty,
          total
        };
      });
      dispatch.items = validatedItems;
    }

    if (dispatchDate) dispatch.dispatchDate = dispatchDate;
    if (gatePassNo) dispatch.gatePassNo = gatePassNo;
    if (remarks !== undefined) dispatch.remarks = remarks;

    await dispatch.save();

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
