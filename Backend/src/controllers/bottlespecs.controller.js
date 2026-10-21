const BottleSpec = require("../models/Bottlespecs");
const Variant = require("../models/Variant");
const Brand = require("../models/Brand");
const Company = require("../models/Company");

// CREATE
exports.createSpec = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (req.file) {
      body.image = `/uploads/${req.file.filename}`;
    }
    if (body.variantId === '') {
      body.variantId = null;
    }

    // Duplicate check for coating specs
    if (body.isCoating === 'true' || body.isCoating === true) {
      if (body.brandId && body.bottleName) {
        const dupQuery = {
          isDeleted: { $ne: true },
          isCoating: true,
          brandId: body.brandId,
          bottleName: { $regex: new RegExp(`^${body.bottleName.trim()}$`, 'i') },
        };
        // variantId: treat empty/null as the same
        if (!body.variantId) {
          dupQuery.$or = [
            { variantId: null },
            { variantId: { $exists: false } }
          ];
        } else {
          dupQuery.variantId = body.variantId;
        }
        const existing = await BottleSpec.findOne(dupQuery);
        if (existing) {
          return res.status(409).json({
            success: false,
            message: `A coating spec for "${body.bottleName}" already exists for this brand.`
          });
        }
      }
    }

    // Duplicate check for printing/bottle specs
    if (body.isPrinting === 'true' || body.isPrinting === true) {
      if (body.brandId && body.bottleName && body.printingTypeId) {
        const existing = await BottleSpec.findOne({
          isDeleted: { $ne: true },
          isPrinting: true,
          brandId: body.brandId,
          bottleName: { $regex: new RegExp(`^${body.bottleName.trim()}$`, 'i') },
          printingTypeId: body.printingTypeId,
          printingColorId: body.printingColorId || null
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: `A bottle spec for "${body.bottleName}" with the same Printing Type and Color already exists.`
          });
        }
      }
    }

    const spec = await BottleSpec.create(body);

    // Automatically create or update a corresponding BottlePerBox entry
    if (body.bottleName) {
      const BottlePerBox = require("../models/BottlePerBox");
      const normalizedName = body.bottleName.trim().replace(/\s+/g, ' ');
      const existingPerBox = await BottlePerBox.findOne({
        bottleName: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

      const newBpbValue = body.bottlePerBox !== undefined && body.bottlePerBox !== null && body.bottlePerBox !== "" ? parseFloat(body.bottlePerBox) : null;

      if (!existingPerBox) {
        await BottlePerBox.create({
          bottleName: normalizedName,
          bottlePerBox: newBpbValue,
          status: true
        });
      } else if (newBpbValue !== null && (existingPerBox.bottlePerBox === null || existingPerBox.bottlePerBox === undefined)) {
        // Do not overwrite an existing non-null bottlePerBox value, just set it if it was missing
        existingPerBox.bottlePerBox = newBpbValue;
        await existingPerBox.save();
      }
    }

    const populated = await BottleSpec.findById(spec._id)
      .populate({
        path: "brandId",
        populate: { path: "companyId" }
      })
      .populate("printingTypeId")
      .populate("printingColorId");
    res.json(populated);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// GET
exports.getSpecs = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true", type, companyId } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('bottleSpecsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies && req.cookies.bottleSpecsPage) {
      parsedPage = parseInt(req.cookies.bottleSpecsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (companyId) {
      const matchingBrands = await Brand.find({
        companyId,
        isDeleted: { $ne: true }
      }).select('_id');
      const brandIds = matchingBrands.map(b => b._id);
      query.brandId = { $in: brandIds };
    }

    if (type === 'coating') {
      // Coating specs: explicitly marked isCoating=true
      query.isCoating = true;
    } else if (type === 'printing') {
      // Printing specs: explicitly marked isPrinting=true
      // OR old records that have neither flag set (migrated from old DB)
      query.$and = [
        {
          $or: [
            { isPrinting: true },
            { isPrinting: { $exists: false } },
            { isPrinting: { $ne: true }, isCoating: { $ne: true } }
          ]
        }
      ];
    }

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

      const matchingCompanies = await Company.find({
        isDeleted: { $ne: true },
        name: { $regex: wholeWordRegex }
      }).select('_id');
      const companyIds = matchingCompanies.map(c => c._id);

      const matchingBrands = await Brand.find({
        isDeleted: { $ne: true },
        $or: [
          { name: { $regex: wholeWordRegex } },
          { companyId: { $in: companyIds } }
        ]
      }).select('_id');
      const brandIds = matchingBrands.map(b => b._id);

      const matchingVariants = await Variant.find({
        isDeleted: { $ne: true },
        $or: [
          { variantName: { $regex: wholeWordRegex } },
          { variantSize: { $regex: wholeWordRegex } }
        ]
      }).select('_id bottleSpecId');

      const variantIds = matchingVariants.map(v => v._id);
      const parentSpecIds = matchingVariants.map(v => v.bottleSpecId).filter(id => id);

      const searchCondition = {
        $or: [
          { bottleName: { $regex: wholeWordRegex } },
          { code: { $regex: wholeWordRegex } },
          { variantId: { $in: variantIds } },
          { _id: { $in: parentSpecIds } },
          { brandId: { $in: brandIds } }
        ]
      };
      // Merge search with existing $and (type filter) if present, otherwise use $or directly
      if (query.$and) {
        query.$and.push(searchCondition);
      } else {
        query.$or = searchCondition.$or;
      }
    }

    const total = await BottleSpec.countDocuments(query);

    const populateOpts = [
      {
        path: "brandId",
        populate: { path: "companyId" }
      },
      "printingTypeId",
      "printingColorId",
      "coatingTypeId",
      "variantId"
    ];

    let specs;
    if (pagination === "false") {
      specs = await BottleSpec.find(query).sort({ createdAt: -1 }).populate(populateOpts);
      return res.json({ success: true, data: specs, total });
    } else {
      specs = await BottleSpec.find(query)
        .sort({ createdAt: -1 })
        .populate(populateOpts)
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: specs,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// UPDATE
exports.updateSpec = async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }
    if (req.file) {
      body.image = `/uploads/${req.file.filename}`;
    }
    const spec = await BottleSpec.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: "after" }
    ).populate({
      path: "brandId",
      populate: { path: "companyId" }
    })
      .populate("printingTypeId")
      .populate("printingColorId");
    res.json(spec);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// DELETE
exports.deleteSpec = async (req, res) => {
  try {
    await BottleSpec.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// GET SHADES
exports.getCoatingShades = async (req, res) => {
  try {
    const Variant = require("../models/Variant");

    const specShades = await BottleSpec.distinct("coatingShade", { isDeleted: { $ne: true }, coatingShade: { $ne: null, $ne: "" } });
    const variantShades = await Variant.distinct("coatingShade", { isDeleted: { $ne: true }, coatingShade: { $ne: null, $ne: "" } });

    const allShades = [...new Set([...specShades, ...variantShades])].sort();

    res.json({ success: true, data: allShades });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// GET BOTTLE NAMES
exports.getBottleNames = async (req, res) => {
  try {
    const bottleNames = await BottleSpec.distinct("bottleName", { isDeleted: { $ne: true }, bottleName: { $ne: null, $ne: "" } });
    res.json({ success: true, data: bottleNames });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// GET BOTTLE CODES
exports.getBottleCodes = async (req, res) => {
  try {
    const bottleCodes = await BottleSpec.distinct("code", { isDeleted: { $ne: true }, code: { $ne: null, $ne: "" } });
    res.json({ success: true, data: bottleCodes });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// MIGRATE: Backfill isPrinting=true on old records that have neither flag set
// Call this once after deploying to live to fix old data.
// POST /api/bottle-spec/migrate-flags
exports.migrateFlags = async (req, res) => {
  try {
    // Records with coatingTypeId set → they are coating specs
    const coatingResult = await BottleSpec.updateMany(
      {
        isDeleted: { $ne: true },
        isCoating: { $ne: true },
        coatingTypeId: { $exists: true, $ne: null }
      },
      { $set: { isCoating: true, isPrinting: false } }
    );

    // Records with printingTypeId set (and no coatingTypeId) → printing specs
    const printingResult = await BottleSpec.updateMany(
      {
        isDeleted: { $ne: true },
        isPrinting: { $ne: true },
        isCoating: { $ne: true },
        printingTypeId: { $exists: true, $ne: null }
      },
      { $set: { isPrinting: true } }
    );

    // Remaining records with neither flag → treat as printing specs
    const remainingResult = await BottleSpec.updateMany(
      {
        isDeleted: { $ne: true },
        isPrinting: { $ne: true },
        isCoating: { $ne: true }
      },
      { $set: { isPrinting: true } }
    );

    res.json({
      success: true,
      message: `Migration complete.`,
      details: {
        coatingSpecsUpdated: coatingResult.modifiedCount,
        printingSpecsUpdated: printingResult.modifiedCount,
        remainingUpdated: remainingResult.modifiedCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
