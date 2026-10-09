const Formula = require("../models/Formula");
const Variant = require("../models/Variant");
const Brand = require("../models/Brand");
const BottleSpec = require("../models/Bottlespecs");
const CoatingType = require("../models/CoatingType");

// ✅ CREATE
exports.createFormula = async (req, res) => {
  try {
    const { companyId, brandId, bottleIds, variantIds, coatingTypeId, rawMaterials } = req.body;

    if (!companyId || !brandId || !bottleIds || !variantIds || !coatingTypeId) {
      return res.status(400).json({ message: "Company, Brand, Bottle Name, Variant, and Coating Type are required." });
    }

    const variants = await Variant.find(query)
        .populate({
        path: 'bottleSpecId',
        populate: {
          path: 'brandId'
        }
      });

    const formulasToCreate = [];
    
    // Check for existing formulas to prevent duplicates
    const existingFormulas = await Formula.find({
      bottleId: { $in: bottleIds },
      variantId: { $in: variantIds },
      isDeleted: { $ne: true }
    });
    const existingMap = new Set(existingFormulas.map(f => `${f.bottleId.toString()}_${f.variantId.toString()}`));

    for (let variant of variants) {
      const bottle = variant.bottleSpecId;
      if (!bottle) continue;
      const brand = bottle.brandId;
      if (!brand) continue;

      const companyIdStr = brand.companyId.toString();
      const brandIdStr = brand._id.toString();
      const bottleIdStr = bottle._id.toString();
      const variantIdStr = variant._id.toString();

      if (
        companyId === companyIdStr &&
        brandId === brandIdStr &&
        bottleIds.includes(bottleIdStr)
      ) {
        if (existingMap.has(`${bottleIdStr}_${variantIdStr}`)) {
          return res.status(400).json({ message: `Formula already exists for ${bottle.bottleName} - ${variant.variantName}` });
        }

        formulasToCreate.push({
          companyId: companyIdStr,
          brandId: brandIdStr,
          bottleId: bottleIdStr,
          variantId: variantIdStr,
          coatingTypeId,
          status: req.body.status !== false,
          columns: req.body.columns || []
        });
      }
    }

    if (formulasToCreate.length === 0) {
      return res.status(400).json({ message: "No valid combinations found for the selected options." });
    }

    const createdFormulas = await Formula.insertMany(formulasToCreate);

    const populatedFormulas = await Formula.find(query)
        .populate("companyId", "name")
      .populate("brandId", "name")
      .populate("bottleId", "bottleName")
      .populate("variantId", "variantName coatingShade variantSize image")
      .populate("coatingTypeId", "name")
      .populate("columns.rawMaterials.rawMaterialId", "name");

    res.status(201).json(populatedFormulas);
  } catch (err) {
    console.log("CREATE FORMULA ERROR:", err);
    res.status(500).json(err.message);
  }
};

// ✅ GET
exports.getFormulas = async (req, res) => {
  try {
    let { page, limit, search, pagination } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('formulaPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.formulaPage) {
      parsedPage = parseInt(req.cookies.formulaPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let filter = { isDeleted: { $ne: true } };

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

      const matchingBrands = await Brand.find(query);
      const brandIds = matchingBrands.map(b => b._id);

      const matchingSpecs = await BottleSpec.find(query);
      const specIds = matchingSpecs.map(s => s._id);

      const matchingVariants = await Variant.find({
        isDeleted: { $ne: true },
        $or: [
          { variantName: { $regex: wholeWordRegex } },
          { coatingShade: { $regex: wholeWordRegex } }
        ]
      }).select('_id');
      const variantIds = matchingVariants.map(v => v._id);

      const matchingCoatingTypes = await CoatingType.find(query);
      const coatingTypeIds = matchingCoatingTypes.map(c => c._id);

      filter.$or = [
        { brandId: { $in: brandIds } },
        { bottleId: { $in: specIds } },
        { variantId: { $in: variantIds } },
        { coatingTypeId: { $in: coatingTypeIds } }
      ];
    }

    let query = Formula.find(filter)
      .populate("companyId", "name")
      .populate("brandId", "name")
      .populate("bottleId", "bottleName")
      .populate("variantId", "variantName coatingShade variantSize image")
      .populate("coatingTypeId", "name")
      .populate("columns.rawMaterials.rawMaterialId", "name")
      .sort({ createdAt: -1 });

    if (pagination !== "false") {
      query = query.skip(skip).limit(parsedLimit);
    }

    const formulas = await query;

    if (pagination === "false") {
      return res.json({ success: true, data: formulas, total: formulas.length });
    }

    const total = await Formula.countDocuments(filter);

    res.json({
      success: true,
      data: formulas,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET BY ID
exports.getFormulaById = async (req, res) => {
  try {
    const formula = await Formula.findById(req.params.id)
      .populate("companyId", "name")
      .populate("brandId", "name")
      .populate("bottleId", "bottleName")
      .populate("variantId", "variantName coatingShade variantSize image")
      .populate("coatingTypeId", "name")
      .populate("columns.rawMaterials.rawMaterialId", "name");

    if (!formula || formula.isDeleted) {
      return res.status(404).json({ message: "Formula not found" });
    }
    res.json(formula);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ UPDATE
exports.updateFormula = async (req, res) => {
  try {
    const { companyId, brandId, bottleIds, variantIds, coatingTypeId, columns, status } = req.body;

    if (!companyId || !brandId || !bottleIds || !variantIds || !coatingTypeId) {
      return res.status(400).json({ message: "Company, Brand, Bottle Names, Variants, and Coating Type are required." });
    }

    const variants = await Variant.find(query)
        .populate({
        path: 'bottleSpecId',
        populate: {
          path: 'brandId'
        }
      });

    let updatedCount = 0;
    let createdCount = 0;

    for (let variant of variants) {
      const bottle = variant.bottleSpecId;
      if (!bottle) continue;
      const brand = bottle.brandId;
      if (!brand) continue;

      const companyIdStr = brand.companyId.toString();
      const brandIdStr = brand._id.toString();
      const bottleIdStr = bottle._id.toString();
      const variantIdStr = variant._id.toString();

      if (
        companyId === companyIdStr &&
        brandId === brandIdStr &&
        bottleIds.includes(bottleIdStr)
      ) {
        const existingFormula = await Formula.findOne({
          bottleId: bottleIdStr,
          variantId: variantIdStr,
          isDeleted: { $ne: true }
        });

        if (existingFormula) {
          existingFormula.companyId = companyIdStr;
          existingFormula.brandId = brandIdStr;
          existingFormula.coatingTypeId = coatingTypeId;
          existingFormula.columns = columns;
          existingFormula.status = status !== false;
          await existingFormula.save();
          updatedCount++;
        } else {
          const newFormula = new Formula({
            companyId: companyIdStr,
            brandId: brandIdStr,
            bottleId: bottleIdStr,
            variantId: variantIdStr,
            coatingTypeId,
            status: status !== false,
            columns
          });
          await newFormula.save();
          createdCount++;
        }
      }
    }

    res.json({ success: true, message: `Successfully updated ${updatedCount} and created ${createdCount} formulas.` });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ DELETE
exports.deleteFormula = async (req, res) => {
  try {
    await Formula.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ msg: "Formula Deleted" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// ✅ TOGGLE STATUS
exports.toggleStatus = async (req, res) => {
  try {
    const formula = await Formula.findById(req.params.id);
    if (!formula) {
      return res.status(404).json({ success: false, message: "Formula not found" });
    }
    formula.status = !formula.status;
    await formula.save();
    res.json({ success: true, message: "Status updated successfully", data: formula });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
