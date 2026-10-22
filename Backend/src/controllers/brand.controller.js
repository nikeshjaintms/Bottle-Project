const Brand = require("../models/Brand");

// ✅ CREATE
exports.createBrand = async (req, res) => {
  try {
    const rawStatus = req.body.status;
    // Convert status string to boolean; default true if not provided
    const status = typeof rawStatus === 'string'
      ? rawStatus === 'active'
      : rawStatus ?? true;

    const { name, companyId } = req.body;
    const existing = await Brand.findOne({ companyId, name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json(`Brand "${name}" already exists for this company.`);
    }

    const brand = await Brand.create({
      companyId,
      name: name.trim(),
      status
    });
    res.json(brand);
  } catch (err) {
    console.log("CREATE BRAND ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
// ✅ GET BRANDS (Backend Pagination + Search)

exports.getBrands = async (req, res) => {

  try {

    let { page, limit, search = "", pagination = "true", companyId } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('brandsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies && req.cookies.brandsPage && !limit && pagination !== "false") {
      parsedPage = parseInt(req.cookies.brandsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;

    const skip =
      (parsedPage - 1) * parsedLimit;

    let filter = {
      isDeleted: {
        $ne: true,
      },
    };

    let brands =
      await Brand.find(filter)
        .populate(
          "companyId",
          "name status"
        )
        .sort({
          createdAt: -1,
        })
        ;

    if (search) {
      const searchText =
        search.toLowerCase();
      brands =
        brands.filter((b) =>
          b.name
            ?.toLowerCase()
            .includes(searchText)
          ||
          b.companyId?.name
            ?.toLowerCase()
            .includes(searchText)
        );
    }

    const total = brands.length;

    let paginatedBrands = brands;
    if (pagination !== "false") {
      paginatedBrands = brands.slice(skip, skip + parsedLimit);
    }

    if (pagination === "false") {
      return res.json({ success: true, data: paginatedBrands, total });
    }

    res.json({
      success: true,
      data: paginatedBrands,
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
exports.updateBrand = async (req, res) => {
  try {
    const body = { ...req.body };
    // Convert status string to boolean
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (body.name || body.companyId) {
      const brandToUpdate = await Brand.findById(req.params.id);
      const targetName = body.name ? body.name.trim() : brandToUpdate.name;
      const targetCompanyId = body.companyId || brandToUpdate.companyId;

      const existing = await Brand.findOne({
        companyId: targetCompanyId,
        name: { $regex: new RegExp("^" + targetName + "$", "i") },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json(`Brand "${targetName}" already exists for this company.`);
      }
      if (body.name) body.name = body.name.trim();
    }

    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    );
    res.json(brand);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteBrand = async (req, res) => {
  try {
    await Brand.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Brand Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
