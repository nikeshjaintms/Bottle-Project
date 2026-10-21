const CoatingType = require("../models/CoatingType");

// ✅ CREATE
exports.createCoatingType = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name } = req.body;
    const existing = await CoatingType.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Coating Type "${name}" already exists.`);
    }

    const coatingType = await CoatingType.create({
      name: name.trim(),
      status
    });
    res.json(coatingType);
  } catch (err) {
    console.log("CREATE COATING TYPE ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getCoatingTypes = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('coatingTypesPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.coatingTypesPage) {
      parsedPage = parseInt(req.cookies.coatingTypesPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      query.name = { $regex: new RegExp(search.trim(), "i") };
    }

    const total = await CoatingType.countDocuments(query);

    let coatingTypes;
    if (pagination === "false") {
      coatingTypes = await CoatingType.find(query).sort({ createdAt: -1 });
      return res.json({ success: true, data: coatingTypes, total });
    } else {
      coatingTypes = await CoatingType.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: coatingTypes,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updateCoatingType = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await CoatingType.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json(`Coating Type "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const coatingType = await CoatingType.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(coatingType);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteCoatingType = async (req, res) => {
  try {
    await CoatingType.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Coating Type Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
