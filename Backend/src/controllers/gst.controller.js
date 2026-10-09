const Gst = require("../models/Gst");

// ✅ CREATE
exports.addGst = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string' ? rawStatus === 'active' : rawStatus ?? true;

    let { gstNumber } = req.body;
    
    if (!gstNumber || !gstNumber.trim()) {
      return res.status(400).json("GST Number is required.");
    }
    
    gstNumber = gstNumber.trim().toUpperCase();

    const existing = await Gst.findOne({ gstNumber });
    
    if (existing) {
      if (!existing.isDeleted) {
        return res.status(400).json(`GST Number "${gstNumber}" already exists.`);
      }
      
      existing.isDeleted = false;
      existing.status = status;
      await existing.save();
      return res.json(existing);
    }

    const gst = await Gst.create({
      gstNumber,
      status
    });
    res.json(gst);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getAllGst = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('gstPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies && req.cookies.gstPage) {
      parsedPage = parseInt(req.cookies.gstPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let filter = { isDeleted: { $ne: true } };

    if (search) {
      filter.gstNumber = { $regex: search, $options: "i" };
    }

    let query = Gst.find(filter).sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const gsts = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: gsts, total: gsts.length });
    }

    const total = await Gst.countDocuments(filter);

    res.json({
      success: true,
      data: gsts,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET SINGLE
exports.getSingleGst = async (req, res) => {
  try {
    const gst = await Gst.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!gst) return res.status(404).json("GST entry not found");
    res.json(gst);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updateGst = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    
    if (body.gstNumber !== undefined) {
      body.gstNumber = body.gstNumber.trim().toUpperCase();
      const existing = await Gst.findOne({
        gstNumber: body.gstNumber,
        _id: { $ne: req.params.id },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(400).json(`GST Number "${body.gstNumber}" already exists.`);
      }
    }

    const gst = await Gst.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(gst);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteGst = async (req, res) => {
  try {
    await Gst.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    res.json({ msg: "GST entry Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
