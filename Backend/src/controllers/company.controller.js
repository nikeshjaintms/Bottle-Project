const Company = require("../models/Company");

// ✅ CREATE
exports.createCompany = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name } = req.body;
    const existing = await Company.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Company "${name}" already exists.`);
    }

    const company = await Company.create({
      name: name.trim(),
      status
    });
    res.json(company);
  } catch (err) {
    console.log("CREATE COMPANY ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
// ✅ GET COMPANIES (Backend Pagination + Search)

exports.getCompanies = async (req, res) => {
  try {

    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('companiesPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.companiesPage) {
      parsedPage = parseInt(req.cookies.companiesPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;

    const skip =
      (parsedPage - 1) * parsedLimit;

    let filter = {
      isDeleted: { $ne: true }
    };

    if (search) {
      filter.name = {
        $regex: search,
        $options: "i"
      };
    }

    let query = Company.find(filter).sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const companies = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: companies, total: companies.length });
    }

    const total = await Company.countDocuments(filter);

    res.json({
      success: true,
      data: companies,
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
exports.updateCompany = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name) {
      const existing = await Company.findOne({
        name: { $regex: new RegExp("^" + body.name.trim() + "$", "i") },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json(`Company "${body.name}" already exists.`);
      }
      body.name = body.name.trim();
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(company);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteCompany = async (req, res) => {
  try {
    await Company.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Company Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
