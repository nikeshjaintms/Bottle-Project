const Production = require("../models/Production");
const mongoose = require("mongoose");

const hasDateValidationPermission = (user, permissionName) => {
  if (user && user.role && Array.isArray(user.role.permissions)) {
    return user.role.permissions.some(p => p.name === permissionName);
  }
  return false;
};

const validateDateConstraint = (user, date, permissionName) => {
  if (hasDateValidationPermission(user, permissionName)) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const maxDate = tomorrow.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const minDate = yesterday.toISOString().split('T')[0];

    if (date < minDate || date > maxDate) {
      return false;
    }
  }
  return true;
};

const checkRecordLockConstraint = (user, existingDate, unlockPermissionName) => {
  const hasLockPermission = user && user.role && Array.isArray(user.role.permissions) && user.role.permissions.some(p => p.name === unlockPermissionName);
  
  if (!hasLockPermission) return true; // Permission OFF -> No lock, can edit any record.

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const minDate = yesterday.toISOString().split('T')[0];

  const recordDate = new Date(existingDate).toISOString().split('T')[0];

  if (recordDate < minDate) {
    return false; // Permission ON -> Old records are locked.
  }
  return true;
};

// ✅ CREATE (with duplicate prevention)
const addProduction = async (req, res) => {
  try {
    const { variantId, brandId, bottleSpecId, totalPrinted, bottlePerBox, date: reqDate } = req.body;

    if (!variantId || !brandId || !bottleSpecId || !totalPrinted || !bottlePerBox) {
      return res.status(400).json({
        message: "variantId, brandId, bottleSpecId, totalPrinted and bottlePerBox are required",
      });
    }

    const date = reqDate || new Date().toISOString().split("T")[0];

    if (!validateDateConstraint(req.user, date, 'production-date-validation')) {
      return res.status(400).json({ message: "Invalid date. You are only allowed to select Yesterday, Today, or Tomorrow." });
    }

    // 🚫 Prevent duplicate entry for same variant + date
    const exists = await Production.findOne({ variantId, date, isDeleted: { $ne: true } });
    if (exists) {
      return res.status(400).json({
        message: "Production already exists for this variant today",
      });
    }

    const totalBoxes = Math.floor(totalPrinted / bottlePerBox);
    const remainingBottles = totalPrinted % bottlePerBox;

    const production = await Production.create({
      variantId,
      brandId,
      bottleSpecId,
      date,
      totalPrinted,
      bottlePerBox,
      totalBoxes,
      remainingBottles,
    });

    const populated = await Production.findById(production._id)
      .populate("variantId")
      .populate({
        path: "brandId",
        populate: { path: "companyId" }
      })
      .populate({
        path: "bottleSpecId",
        populate: ["printingTypeId", "printingColorId"]
      });

    res.status(201).json({ success: true, data: populated });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET ALL PRODUCTIONS (Backend Pagination + Search + Filters)

const getAllProduction = async (req, res) => {

  try {

    let {
      page,
      limit,
      search,
      companyId,
      brandId,
      bottleSpecId,
      variantId,
      date,
      startDate,
      endDate,
      pagination = "true",
    } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('productionsPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.productionsPage) {
      parsedPage = parseInt(req.cookies.productionsPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    // ================= FILTER =================

    let filter = {

      isDeleted: {
        $ne: true,
      },

    };

    // Variant Filter
    if (variantId) {
      filter.variantId = variantId;
    }

    // Brand Filter
    if (brandId) {
      filter.brandId = brandId;
    }

    // Bottle Spec Filter
    if (bottleSpecId) {
      filter.bottleSpecId = bottleSpecId;
    }

    // Single Date Filter
    if (date) {
      filter.date = date;
    }

    // Date Range Filter
    if (startDate || endDate) {

      filter.date = {};

      if (startDate) {
        filter.date.$gte = startDate;
      }

      if (endDate) {
        filter.date.$lte = endDate;
      }

    }

    // ================= DATABASE QUERY =================

    let productions =
      await Production.find(filter)

        .populate("variantId")

        .populate({
          path: "brandId",
          populate: {
            path: "companyId",
          },
        })

        .populate({
          path: "bottleSpecId",
          populate: [
            "brandId",
            "printingTypeId",
            "printingColorId",
          ],
        })
        .sort({ createdAt: -1 })
        ;

    // ================= COMPANY FILTER =================

    if (companyId) {

      productions =
        productions.filter(

          (p) =>

            p.brandId?.companyId?._id?.toString() ===
            companyId

        );

    }

    // ================= SEARCH =================
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

      productions = productions.filter((p) => {
        const brandName = p.brandId?.name || "";
        const companyName = p.brandId?.companyId?.name || "";
        const variantName = p.variantId?.variantName || "";
        const productName = p.variantId?.productName || "";
        const bottleName = p.bottleSpecId?.bottleName || "";

        return (
          wholeWordRegex.test(brandName) ||
          wholeWordRegex.test(companyName) ||
          wholeWordRegex.test(variantName) ||
          wholeWordRegex.test(productName) ||
          wholeWordRegex.test(bottleName)
        );
      });
    }

    // ================= TOTAL COUNT & PAGINATION =================

    const total = productions.length;

    // No pagination — return all records
    if (pagination === "false") {
      return res.json({
        success: true,
        data: productions,
        total,
      });
    }

    const paginatedProductions = productions.slice(skip, skip + parsedLimit);

    // ================= RESPONSE =================

    res.json({
      success: true,
      data: paginatedProductions,
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
const getProductionById = async (req, res) => {
  try {
    const data = await Production.findById(req.params.id)
      .populate("variantId")
      .populate({
        path: "brandId",
        populate: { path: "companyId" }
      })
      .populate({
        path: "bottleSpecId",
        populate: ["brandId", "printingTypeId", "printingColorId"]
      });

    if (!data) {
      return res.status(404).json({ message: "Production not found" });
    }

    res.json({ success: true, data });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// ✅ UPDATE (recalculate values)
const updateProduction = async (req, res) => {
  try {
    const { totalPrinted, bottlePerBox, date, brandId, bottleSpecId, variantId } = req.body;

    const existingProduction = await Production.findById(req.params.id);
    if (!existingProduction) {
      return res.status(404).json({ message: "Production not found" });
    }

    if (!checkRecordLockConstraint(req.user, existingProduction.date, 'production-record-unlock')) {
      return res.status(403).json({ message: "Record Locked - This production record is older than yesterday and can no longer be edited." });
    }

    if (date && date !== existingProduction.date && !validateDateConstraint(req.user, date, 'production-date-validation')) {
      return res.status(400).json({ message: "Invalid date. You are only allowed to select Yesterday, Today, or Tomorrow." });
    }

    if (!totalPrinted || !bottlePerBox) {
      return res.status(400).json({
        message: "totalPrinted and bottlePerBox are required",
      });
    }

    const totalBoxes = Math.floor(totalPrinted / bottlePerBox);
    const remainingBottles = totalPrinted % bottlePerBox;

    const updateFields = {
      totalPrinted,
      bottlePerBox,
      totalBoxes,
      remainingBottles,
    };

    if (date) updateFields.date = date;
    if (brandId) updateFields.brandId = brandId;
    if (bottleSpecId) updateFields.bottleSpecId = bottleSpecId;
    if (variantId) updateFields.variantId = variantId;

    const updated = await Production.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { returnDocument: 'after' }
    ).populate("variantId")
      .populate({
        path: "brandId",
        populate: { path: "companyId" }
      })
      .populate({
        path: "bottleSpecId",
        populate: ["brandId", "printingTypeId", "printingColorId"]
      });

    if (!updated) {
      return res.status(404).json({ message: "Production not found" });
    }

    res.json({ success: true, data: updated });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



// ✅ DELETE
const deleteProduction = async (req, res) => {
  try {
    const deleted = await Production.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });

    if (!deleted) {
      return res.status(404).json({ message: "Production not found" });
    }

    res.json({ success: true, message: "Production deleted" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


module.exports = {
  addProduction,
  getAllProduction,
  getProductionById,
  updateProduction,
  deleteProduction,
};
