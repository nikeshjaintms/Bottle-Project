const Variant = require("../models/Variant");
const BottleSpec = require("../models/Bottlespecs");
const Brand = require("../models/Brand");
const Company = require("../models/Company");
const SgLabel = require("../models/SgLabel");
const { detectTextColor } = require('../services/textColor');


// ✅ CREATE
exports.createVariant = async (req, res) => {
  try {
    const body = { ...req.body };
    // Convert status string to boolean
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }

    if (body.detectedTextColor && typeof body.detectedTextColor === 'string') {
      body.detectedTextColor = body.detectedTextColor.trim();
    }
    if (body.coatingShade && typeof body.coatingShade === 'string') {
      body.coatingShade = body.coatingShade.trim();
    }

    // Duplicate check: same bottleSpecId + same variantName (case-insensitive)
    if (body.bottleSpecId && body.variantName) {
      const existing = await Variant.findOne({
        bottleSpecId: body.bottleSpecId,
        variantName: { $regex: new RegExp(`^${body.variantName.trim()}$`, 'i') },
        isDeleted: { $ne: true }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Variant "${body.variantName}" already exists for this bottle specification. Please use a different variant name.`
        });
      }
    }

    if (req.file) {
      body.image = `/uploads/${req.file.filename}`;
      if (!body.detectedTextColor || body.detectedTextColor === "Not Detected" || body.detectedTextColor === "Analysis Failed") {
        try {
          const colorResult = await detectTextColor(req.file.path);
          if (colorResult) {
            body.detectedTextColor = colorResult.name || `RGB(${colorResult.r}, ${colorResult.g}, ${colorResult.b})`;
          } else {
            body.detectedTextColor = "Not Detected";
          }
        } catch (err) {
          console.error("Text color detection failed:", err);
          body.detectedTextColor = "Detection Failed";
        }
      }
    }

    const variant = await Variant.create(body);

    // Auto-generate SG Label for the new variant
    if (variant.bottleSpecId && variant.coatingShade) {
      await SgLabel.create({
        bottleId: variant.bottleSpecId,
        coatingShade: variant.coatingShade,
        variantId: variant._id,
        detectedTextColor: variant.detectedTextColor && variant.detectedTextColor !== 'Not Detected' ? variant.detectedTextColor : null,
        isDeleted: false
      });
    }

    const populated = await Variant.findById(variant._id).populate({
      path: "bottleSpecId",
      populate: [
        { path: "brandId", populate: { path: "companyId" } },
        "printingTypeId",
        "printingColorId"
      ]
    });
    res.json(populated);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ GET ALL
exports.getVariants = async (req, res) => {
  try {
    let { page, limit, search, pagination } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('variantPage', parsedPage, { maxAge: 86400000, httpOnly: true }); // Save to cookie
    } else if (req.cookies.variantPage) {
      parsedPage = parseInt(req.cookies.variantPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      const searchWord = search.trim();
      
      // Split into alphanumeric words to allow flexible matching of spaces/special chars
      const searchTokens = searchWord.split(/[\W_]+/).filter(Boolean);
      let regexStr = "";
      
      if (searchTokens.length > 0) {
        // Escape each token and join with a pattern that matches any space or special character
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regexStr = searchTokens.map(escapeRegExp).join('[\\W_]+');
      } else {
        // Fallback for purely special character searches
        regexStr = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      // (?:^|\W) acts like \b but supports matching next to special characters
      const wholeWordRegex = new RegExp(`(?:^|\\W)${regexStr}(?:\\W|$)`, "i");
      
      // Search companies with whole word match
      const matchingCompanies = await Company.find({
        isDeleted: { $ne: true },
        name: { $regex: wholeWordRegex }
      }).select('_id').lean();
      const companyIds = matchingCompanies.map(c => c._id);
      
      // Search brands matching brand name OR matching companyId
      const matchingBrands = await Brand.find({
        isDeleted: { $ne: true },
        $or: [
          { name: { $regex: wholeWordRegex } },
          { companyId: { $in: companyIds } }
        ]
      }).select('_id').lean();
      const brandIds = matchingBrands.map(b => b._id);

      const matchingSpecs = await BottleSpec.find({
        isDeleted: { $ne: true },
        $or: [
          { bottleName: { $regex: wholeWordRegex } },
          { brandId: { $in: brandIds } }
        ]
      }).select('_id').lean();
      const specIds = matchingSpecs.map(s => s._id);

      query.$or = [
        { variantName: { $regex: wholeWordRegex } },
        { bottleSpecId: { $in: specIds } }
      ];
    }

    const total = await Variant.countDocuments(query);

    const populateOpts = {
      path: "bottleSpecId",
      populate: [
        { path: "brandId", populate: { path: "companyId" } },
        "printingTypeId",
        "printingColorId"
      ]
    };

    let variants;
    if (pagination === "false") {
      variants = await Variant.find(query).sort({ createdAt: -1 }).populate(populateOpts).lean();
      return res.json({ success: true, data: variants, total });
    } else {
      variants = await Variant.find(query)
        .sort({ createdAt: -1 })
        .populate(populateOpts)
        .skip(skip)
        .limit(parsedLimit).lean();
    }

    res.json({
      success: true,
      data: variants,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    console.log("GET VARIANTS ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ UPDATE
exports.updateVariant = async (req, res) => {
  try {
    const body = { ...req.body };

    // Convert status string to boolean
    if (typeof body.status === 'string') {
      body.status = body.status === 'active';
    }

    if (body.detectedTextColor && typeof body.detectedTextColor === 'string') {
      body.detectedTextColor = body.detectedTextColor.trim();
    }
    if (body.coatingShade && typeof body.coatingShade === 'string') {
      body.coatingShade = body.coatingShade.trim();
    }

    if (req.file) {
      body.image = `/uploads/${req.file.filename}`;
      if (!body.detectedTextColor || body.detectedTextColor === "Not Detected" || body.detectedTextColor === "Analysis Failed") {
        try {
          const colorResult = await detectTextColor(req.file.path);
          if (colorResult) {
            body.detectedTextColor = colorResult.name || `RGB(${colorResult.r}, ${colorResult.g}, ${colorResult.b})`;
          } else {
            body.detectedTextColor = "Not Detected";
          }
        } catch (err) {
          console.error("Text color detection failed:", err);
          body.detectedTextColor = "Detection Failed";
        }
      }
    }

    console.log("UPDATE BODY (converted):", body);

    const variant = await Variant.findByIdAndUpdate(
      req.params.id,
      body,
      { returnDocument: 'after' }
    ).populate({
      path: "bottleSpecId",
      populate: [
        { path: "brandId", populate: { path: "companyId" } },
        "printingTypeId",
        "printingColorId"
      ]
    });

    res.json(variant);

  } catch (err) {
    console.log("UPDATE VARIANT ERROR:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// ✅ DELETE
exports.deleteVariant = async (req, res) => {
  try {
    await Variant.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    res.json({ msg: "Variant Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};
