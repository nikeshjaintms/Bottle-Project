const Operator = require("../models/Operator");

// ✅ CREATE
exports.createOperator = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name } = req.body;
    const existing = await Operator.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Operator "${name}" already exists.`);
    }

    const operator = await Operator.create({
      name: name.trim(),
      status,
      shift: req.body.shift || null
    });
    res.json(operator);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getOperators = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('operatorsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.operatorsPage) {
      parsedPage = parseInt(req.cookies.operatorsPage) || 1;
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

    let query = Operator.find(filter).populate("shift").sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const operators = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: operators, total: operators.length });
    }

    const total = await Operator.countDocuments(filter);

    res.json({
      success: true,
      data: operators,
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
exports.updateOperator = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await Operator.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(400).json(`Operator "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const operator = await Operator.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(operator);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteOperator = async (req, res) => {
  try {
    await Operator.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Operator Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
