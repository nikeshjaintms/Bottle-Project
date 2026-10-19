const RawMaterial = require("../models/RawMaterial");

// Create
exports.createRawMaterial = async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    let existing = await RawMaterial.findOne({ name });
    
    if (existing) {
      if (!existing.isDeleted) {
        return res.status(400).json({ message: "Raw Material already exists" });
      } else {
        // Restore if softly deleted
        existing.isDeleted = false;
        existing.status = status !== undefined ? status : true;
        await existing.save();
        return res.status(201).json(existing);
      }
    }

    const item = await RawMaterial.create({ name, status: status !== undefined ? status : true });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating raw material:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Raw Material already exists" });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get All
exports.getRawMaterials = async (req, res) => {
  try {
    const { page = 1, limit = 10, pagination = "true", search } = req.query;

    let query = { isDeleted: false };
    
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
      query.name = { $regex: wholeWordRegex };
    }

    if (pagination === "false") {
      const items = await RawMaterial.find(query).sort({ createdAt: -1 }).lean();
      return res.json({ success: true, data: items });
    }

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('rawMaterialPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.rawMaterialPage) {
      parsedPage = parseInt(req.cookies.rawMaterialPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    const items = await RawMaterial.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit).lean();

    const total = await RawMaterial.countDocuments(query);

    res.json({
      success: true,
      data: items,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
  } catch (error) {
    console.error("Error fetching raw materials:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get By Id
exports.getRawMaterialById = async (req, res) => {
  try {
    const item = await RawMaterial.findById(req.params.id);
    if (!item || item.isDeleted) {
      return res.status(404).json({ message: "Raw Material not found" });
    }
    res.json(item);
  } catch (error) {
    console.error("Error fetching raw material:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update
exports.updateRawMaterial = async (req, res) => {
  try {
    const { name, status } = req.body;
    
    // Check if another item exists with the same name
    if (name) {
      const existing = await RawMaterial.findOne({ name, _id: { $ne: req.params.id }, isDeleted: false });
      if (existing) {
        return res.status(400).json({ message: "Raw Material with this name already exists" });
      }
    }

    const item = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "Raw Material not found" });
    res.json(item);
  } catch (error) {
    console.error("Error updating raw material:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Soft Delete
exports.deleteRawMaterial = async (req, res) => {
  try {
    const item = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { returnDocument: 'after' }
    );
    if (!item) return res.status(404).json({ message: "Raw Material not found" });
    res.json({ message: "Raw Material deleted successfully" });
  } catch (error) {
    console.error("Error deleting raw material:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
