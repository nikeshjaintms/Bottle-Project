const ReadyToDispatch = require("../models/ReadyToDispatch");
const Company = require("../models/Company");
const mongoose = require("mongoose");

// Helper to sanitize & recalculate groups & totals
const computeGroupsAndSummary = (groups = []) => {
  let totalBoxes = 0;
  let totalProducedQty = 0;
  let totalWeight = 0;

  const sanitizedGroups = (groups || []).map((grp) => {
    const plainBottleName = (grp.plainBottleName || grp.bottleName || grp.title || "").trim();
    const unit = Number(grp.unit) || 0;

    const variantLines = (grp.variantLines || []).map((vl) => {
      const noOfBoxes = Number(vl.noOfBoxes) || 0;
      let producedQty = Number(vl.producedQty);
      if (isNaN(producedQty) || producedQty === 0) {
        producedQty = unit > 0 ? noOfBoxes * unit : 0;
      }
      const weight = vl.weight !== undefined && vl.weight !== null && vl.weight !== "" ? Number(vl.weight) : 9.5;
      const totalWeightCalc = parseFloat((noOfBoxes * weight).toFixed(3));

      totalBoxes += noOfBoxes;
      totalProducedQty += producedQty;
      totalWeight += totalWeightCalc;

      return {
        variantId: vl.variantId && mongoose.isValidObjectId(vl.variantId) ? vl.variantId : null,
        description: (vl.description || "").trim(),
        noOfBoxes,
        producedQty,
        weight,
        totalWeight: totalWeightCalc,
      };
    }).filter((vl) => vl.description || vl.noOfBoxes > 0);

    return {
      plainBottleName,
      bottleSpecId: grp.bottleSpecId && mongoose.isValidObjectId(grp.bottleSpecId) ? grp.bottleSpecId : null,
      unit,
      variantLines,
    };
  }).filter((g) => g.plainBottleName && g.variantLines.length > 0);

  return {
    groups: sanitizedGroups,
    summary: {
      totalBoxes,
      totalProducedQty,
      totalWeight: parseFloat(totalWeight.toFixed(3)),
    },
  };
};

// 1. GET ALL READY TO DISPATCH
exports.getAllReadyToDispatch = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      pagination = "true",
      companyId,
      dateFrom,
      dateTo,
    } = req.query;

    const query = { isDeleted: false };

    if (companyId && mongoose.isValidObjectId(companyId)) {
      query.companyId = companyId;
    }

    if (dateFrom || dateTo) {
      query.dispatchDate = {};
      if (dateFrom) {
        query.dispatchDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.dispatchDate.$lte = toDate;
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { sheetTitle: searchRegex },
        { remarks: searchRegex },
        { "groups.plainBottleName": searchRegex },
        { "groups.variantLines.description": searchRegex },
      ];
    }

    const total = await ReadyToDispatch.countDocuments(query);

    const populateOpts = [
      { path: "companyId", select: "name code shortName" },
      { path: "createdBy", select: "name email" },
    ];

    if (pagination === "false") {
      const records = await ReadyToDispatch.find(query)
        .populate(populateOpts)
        .sort({ dispatchDate: -1, createdAt: -1 });

      return res.json({
        success: true,
        data: records,
        total,
      });
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (parsedPage - 1) * parsedLimit;

    const records = await ReadyToDispatch.find(query)
      .populate(populateOpts)
      .sort({ dispatchDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit);

    // Calculate aggregated overall stats for query
    const statsAgg = await ReadyToDispatch.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          grandTotalBoxes: { $sum: "$summary.totalBoxes" },
          grandTotalProducedQty: { $sum: "$summary.totalProducedQty" },
          grandTotalWeight: { $sum: "$summary.totalWeight" },
        },
      },
    ]);

    const stats = statsAgg[0] || {
      grandTotalBoxes: 0,
      grandTotalProducedQty: 0,
      grandTotalWeight: 0,
    };

    res.json({
      success: true,
      data: records,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      stats: {
        grandTotalBoxes: stats.grandTotalBoxes,
        grandTotalProducedQty: stats.grandTotalProducedQty,
        grandTotalWeight: parseFloat((stats.grandTotalWeight || 0).toFixed(3)),
      },
    });
  } catch (err) {
    console.error("Error in getAllReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. GET BY ID
exports.getReadyToDispatchById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const doc = await ReadyToDispatch.findOne({ _id: id, isDeleted: false })
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email")
      .populate("groups.bottleSpecId", "bottleName code")
      .populate("groups.variantLines.variantId", "variantName coatingShade detectedTextColor");

    if (!doc) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    res.json({
      success: true,
      data: doc,
    });
  } catch (err) {
    console.error("Error in getReadyToDispatchById:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. CREATE READY TO DISPATCH
exports.createReadyToDispatch = async (req, res) => {
  try {
    const { companyId, dispatchDate, sheetTitle, remarks, groups } = req.body;

    if (!companyId || !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: "Valid Company is required" });
    }

    if (!dispatchDate) {
      return res.status(400).json({ success: false, message: "Dispatch Date is required" });
    }

    const { groups: sanitizedGroups, summary } = computeGroupsAndSummary(groups);

    if (!sanitizedGroups || sanitizedGroups.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one Plain Bottle with variant items is required",
      });
    }

    // Determine sheetTitle if empty
    let title = (sheetTitle || "").trim();
    if (!title) {
      const company = await Company.findById(companyId);
      const cName = company ? (company.shortName || company.name) : "TPP";
      title = `${cName} - ready to dispatch material`;
    }

    const doc = new ReadyToDispatch({
      companyId,
      dispatchDate: new Date(dispatchDate),
      sheetTitle: title,
      remarks: remarks || "",
      groups: sanitizedGroups,
      summary,
      createdBy: req.user?.id || req.body.createdBy || null,
    });

    await doc.save();

    const populated = await ReadyToDispatch.findById(doc._id)
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Ready to Dispatch record created successfully",
      data: populated,
    });
  } catch (err) {
    console.error("Error in createReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. UPDATE READY TO DISPATCH
exports.updateReadyToDispatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const existing = await ReadyToDispatch.findOne({ _id: id, isDeleted: false });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    const { companyId, dispatchDate, sheetTitle, remarks, groups } = req.body;

    if (companyId && !mongoose.isValidObjectId(companyId)) {
      return res.status(400).json({ success: false, message: "Invalid Company ID" });
    }

    if (companyId) existing.companyId = companyId;
    if (dispatchDate) existing.dispatchDate = new Date(dispatchDate);
    if (sheetTitle !== undefined) existing.sheetTitle = sheetTitle.trim();
    if (remarks !== undefined) existing.remarks = remarks;

    if (groups) {
      const { groups: sanitizedGroups, summary } = computeGroupsAndSummary(groups);
      if (sanitizedGroups.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one Plain Bottle with variant items is required",
        });
      }
      existing.groups = sanitizedGroups;
      existing.summary = summary;
    }

    await existing.save();

    const updated = await ReadyToDispatch.findById(existing._id)
      .populate("companyId", "name code shortName")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Ready to Dispatch record updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Error in updateReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. DELETE READY TO DISPATCH (Soft Delete)
exports.deleteReadyToDispatch = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID format" });
    }

    const doc = await ReadyToDispatch.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    res.json({
      success: true,
      message: "Record deleted successfully",
    });
  } catch (err) {
    console.error("Error in deleteReadyToDispatch:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
