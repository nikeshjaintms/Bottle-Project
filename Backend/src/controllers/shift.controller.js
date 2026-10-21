const Shift = require("../models/Shift");

// ✅ CREATE
exports.createShift = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name } = req.body;
    const existing = await Shift.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Shift "${name}" already exists.`);
    }

    const shift = await Shift.create({
      name: name.trim(),
      status
    });
    res.json(shift);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getShifts = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('shiftsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.shiftsPage) {
      parsedPage = parseInt(req.cookies.shiftsPage) || 1;
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

    let query = Shift.find(filter).sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const shifts = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: shifts, total: shifts.length });
    }

    const total = await Shift.countDocuments(filter);

    res.json({
      success: true,
      data: shifts,
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

// ✅ UPDATE
exports.updateShift = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await Shift.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(400).json(`Shift "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(shift);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteShift = async (req, res) => {
  try {
    await Shift.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Shift Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
