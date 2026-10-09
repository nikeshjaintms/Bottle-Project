const PrintingColor = require("../models/PrintingColor");

// ✅ CREATE (Handles single or bulk)
exports.createPrintingColor = async (req, res) => {
  try {
    const data = req.body;

    if (Array.isArray(data)) {
      // Bulk create

      const orConditions = data.map(item => ({
        printingTypeId: item.printingTypeId,
        name: { $regex: new RegExp("^" + item.name.trim() + "$", "i") }
      }));
      
      const existingColors = await PrintingColor.find({
        isDeleted: { $ne: true },
        $or: orConditions
      }).lean();

      if (existingColors.length > 0) {
        return res.status(400).json(`Color "${existingColors[0].name}" already exists for this printing type.`);
      }

      const results = data.map(item => ({
        printingTypeId: item.printingTypeId,
        name: item.name.trim(),
        status: typeof item.status === 'string' ? item.status === 'active' : item.status ?? true
      }));
      const colors = await PrintingColor.insertMany(results);
      return res.json(colors);
    } else {
      // Single create
      const existing = await PrintingColor.findOne({
        printingTypeId: data.printingTypeId,
        name: { $regex: new RegExp("^" + data.name.trim() + "$", "i") },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(400).json(`Color "${data.name}" already exists for this printing type.`);
      }

      const rawStatus = data.status;
      const status = typeof rawStatus === 'string'
        ? rawStatus === 'active'
        : rawStatus ?? true;

      const printingColor = await PrintingColor.create({
        printingTypeId: data.printingTypeId,
        name: data.name.trim(),
        status
      });

      const populatedColor = await PrintingColor.findById(printingColor._id).populate("printingTypeId");
      return res.json(populatedColor);
    }
  } catch (err) {
    console.log("CREATE PRINTING COLOR ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getPrintingColors = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('printingColorsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.printingColorsPage) {
      parsedPage = parseInt(req.cookies.printingColorsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      const searchWord = search.trim();
      const searchTokens = searchWord.split(/[\W_]+/).filter(Boolean);
      let regexStr = "";
      
      if (searchTokens.length > 0) {
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regexStr = searchTokens.map(escapeRegExp).join('[\\W_]+');
      } else {
        regexStr = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      const wholeWordRegex = new RegExp(`(?:^|\\W)${regexStr}(?:\\W|$)`, "i");

      const PrintingType = require("../models/PrintingType");
      const matchingTypes = await PrintingType.find({ 
        name: { $regex: wholeWordRegex }, 
        isDeleted: { $ne: true } 
      }).select('_id');
      
      const typeIds = matchingTypes.map(t => t._id);

      query.$or = [
        { name: { $regex: wholeWordRegex } },
        { printingTypeId: { $in: typeIds } }
      ];
    }

    const total = await PrintingColor.countDocuments(query);

    let printingColors;
    if (pagination === "false") {
      printingColors = await PrintingColor.find(query).sort({ createdAt: -1 }).populate("printingTypeId");
      return res.json({ success: true, data: printingColors, total });
    } else {
      printingColors = await PrintingColor.find(query)
        .sort({ createdAt: -1 })
        .populate("printingTypeId")
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: printingColors,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updatePrintingColor = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await PrintingColor.findOne({
        printingTypeId: body.printingTypeId, // assuming it's passed or unchanged
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json(`Color "${body.name}" already exists for this printing type.`);
      }
      body.name = body.name.trim();
    }

    const printingColor = await PrintingColor.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    ).populate("printingTypeId");
    res.json(printingColor);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deletePrintingColor = async (req, res) => {
  try {
    await PrintingColor.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    res.json({ msg: "Printing Color Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
