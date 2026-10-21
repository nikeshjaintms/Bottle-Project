const PrintingType = require("../models/PrintingType");

// ✅ CREATE
exports.createPrintingType = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name } = req.body;
    const existing = await PrintingType.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Printing Type "${name}" already exists.`);
    }

    const printingType = await PrintingType.create({
      name: name.trim(),
      status
    });
    res.json(printingType);
  } catch (err) {
    console.log("CREATE PRINTING TYPE ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getPrintingTypes = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('printingTypesPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.printingTypesPage) {
      parsedPage = parseInt(req.cookies.printingTypesPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      query.name = { $regex: new RegExp(search.trim(), "i") };
    }

    const total = await PrintingType.countDocuments(query);

    let printingTypes;
    if (pagination === "false") {
      printingTypes = await PrintingType.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, data: printingTypes, total });
    } else {
      printingTypes = await PrintingType.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: printingTypes,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updatePrintingType = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await PrintingType.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json(`Printing Type "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const printingType = await PrintingType.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(printingType);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deletePrintingType = async (req, res) => {
  try {
    await PrintingType.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Printing Type Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
