const ItemType = require("../models/ItemType");

exports.createItemType = async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const existing = await ItemType.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") }, isDeleted: false });
    if (existing) return res.status(400).json({ message: "Item Type already exists" });

    const itemType = await ItemType.create({ name, status });
    res.status(201).json(itemType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllItemTypes = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const query = { isDeleted: false };
    if (search) query.name = { $regex: search, $options: "i" };
    if (status) query.status = status === "active" ? true : status === "true";

    const itemTypes = await ItemType.find(query)
        .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await ItemType.countDocuments(query);

    res.status(200).json({
      data: itemTypes,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getItemTypeById = async (req, res) => {
  try {
    const itemType = await ItemType.findOne({ _id: req.params.id, isDeleted: false });
    if (!itemType) return res.status(404).json({ message: "Item Type not found" });
    res.status(200).json(itemType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateItemType = async (req, res) => {
  try {
    const { name, status } = req.body;
    const existing = await ItemType.findOne({ _id: { $ne: req.params.id }, name: { $regex: new RegExp(`^${name}$`, "i") }, isDeleted: false });
    if (existing) return res.status(400).json({ message: "Another Item Type with this name already exists" });

    const itemType = await ItemType.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { name, status },
      { new: true }
    );
    if (!itemType) return res.status(404).json({ message: "Item Type not found" });
    res.status(200).json(itemType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteItemType = async (req, res) => {
  try {
    const itemType = await ItemType.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!itemType) return res.status(404).json({ message: "Item Type not found" });
    res.status(200).json({ message: "Item Type deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
