const BottlePerBox = require("../models/BottlePerBox");

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// CREATE
exports.createBottlePerBox = async (req, res) => {
  try {
    let { bottleName, bottleNames, ...rest } = req.body;
    if (typeof rest.status === 'string') {
      rest.status = rest.status === 'active';
    }
    
    const namesToProcess = bottleNames && Array.isArray(bottleNames) && bottleNames.length > 0 
      ? bottleNames 
      : (bottleName ? [bottleName] : []);

    if (namesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: "Bottle Name is required" });
    }

    const bulkOps = namesToProcess.map(name => {
      const trimmedName = name.trim();
      const safeRegexName = escapeRegex(trimmedName);
      return {
        updateOne: {
          filter: { bottleName: new RegExp(`^${safeRegexName}$`, 'i') },
          update: { 
            $set: { 
              bottleName: trimmedName, 
              ...rest,
              isDeleted: false // restore if it was deleted
            } 
          },
          upsert: true
        }
      };
    });

    await BottlePerBox.bulkWrite(bulkOps);

    const regexList = namesToProcess.map(n => new RegExp(`^${escapeRegex(n.trim())}$`, 'i'));
    const records = await BottlePerBox.find({ bottleName: { $in: regexList } });

    res.json({ success: true, data: records.length === 1 ? records[0] : records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET ALL
exports.getBottlePerBoxes = async (req, res) => {
  try {
    let { page, limit, search, pagination = "true" } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    let query = { isDeleted: { $ne: true } };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { bottleName: { $regex: searchRegex } }
      ];
    }

    const total = await BottlePerBox.countDocuments(query);

    let records;
    if (pagination === "false") {
      records = await BottlePerBox.find(query);
      return res.json({ success: true, data: records, total });
    } else {
      records = await BottlePerBox.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit);
    }

    res.json({
      success: true,
      data: records,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      total,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET SINGLE
exports.getSingleBottlePerBox = async (req, res) => {
  try {
    const record = await BottlePerBox.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE
exports.updateBottlePerBox = async (req, res) => {
  try {
    let { bottleName, bottleNames, ...rest } = req.body;
    if (typeof rest.status === 'string') {
      rest.status = rest.status === 'active';
    }

    const oldRecord = await BottlePerBox.findById(req.params.id);
    if (!oldRecord) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    const namesToProcess = bottleNames && Array.isArray(bottleNames) && bottleNames.length > 0 
      ? bottleNames 
      : (bottleName ? [bottleName] : []);

    if (namesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: "Bottle Name is required" });
    }

    // Since the user can multi-select in edit, we treat it just like bulk create/update
    // We update/upsert ALL selected bottles with the new configuration
    const bulkOps = namesToProcess.map(name => {
      const trimmedName = name.trim();
      const safeRegexName = escapeRegex(trimmedName);
      return {
        updateOne: {
          filter: { bottleName: new RegExp(`^${safeRegexName}$`, 'i') },
          update: { 
            $set: { 
              bottleName: trimmedName, 
              ...rest,
              isDeleted: false 
            } 
          },
          upsert: true
        }
      };
    });

    await BottlePerBox.bulkWrite(bulkOps);

    // Cascade update to BottleSpecs if they renamed the ONLY bottle they were editing
    if (namesToProcess.length === 1) {
      const trimmedName = namesToProcess[0].trim();
      if (trimmedName !== oldRecord.bottleName) {
        const BottleSpec = require("../models/Bottlespecs");
        await BottleSpec.updateMany(
          { bottleName: oldRecord.bottleName },
          { $set: { bottleName: trimmedName } }
        );
      }
    }

    const regexList = namesToProcess.map(n => new RegExp(`^${escapeRegex(n.trim())}$`, 'i'));
    const records = await BottlePerBox.find({ bottleName: { $in: regexList } });

    res.json({ success: true, data: records.length === 1 ? records[0] : records });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE
exports.deleteBottlePerBox = async (req, res) => {
  try {
    const record = await BottlePerBox.findByIdAndUpdate(req.params.id, { isDeleted: true }, { new: true });
    
    // Cascade delete to BottleSpecs
    if (record) {
      const BottleSpec = require("../models/Bottlespecs");
      await BottleSpec.updateMany(
        { bottleName: record.bottleName },
        { $set: { isDeleted: true } }
      );
    }

    res.json({ success: true, msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
