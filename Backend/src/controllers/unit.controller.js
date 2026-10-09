const Unit = require("../models/Unit");

// ✅ CREATE
exports.addUnit = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name, operators } = req.body;
    
    // Check if ANY unit with this name exists (deleted or not)
    const existing = await Unit.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") } });
    
    if (existing) {
      if (!existing.isDeleted) {
        return res.status(400).json(`Unit "${name}" already exists.`);
      }
      
      // If it exists but is deleted, restore it
      existing.isDeleted = false;
      existing.status = status;
      await existing.save();
      return res.json(existing);
    }

    const unit = await Unit.create({
      name: name.trim(),
      status,
      operators: operators || []
    });
    res.json(unit);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getAllUnits = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('unitsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies && req.cookies.unitsPage) {
      parsedPage = parseInt(req.cookies.unitsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let filter = {
      isDeleted: { $ne: true }
    };

    if (search) {
      filter.name = {
        $regex: search,
        $options: "i"
      };
    }

    let query = Unit.find(filter).populate("operators").sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const units = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: units, total: units.length });
    }

    const total = await Unit.countDocuments(filter);

    res.json({
      success: true,
      data: units,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ✅ GET SINGLE
exports.getSingleUnit = async (req, res) => {
  try {
    const unit = await Unit.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate("operators");
    if (!unit) return res.status(404).json("Unit not found");
    res.json(unit);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updateUnit = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await Unit.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(400).json(`Unit "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const unit = await Unit.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(unit);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteUnit = async (req, res) => {
  try {
    await Unit.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    res.json({ msg: "Unit Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
