const Permission = require("../models/permission.model");

// Create Permission
exports.createPermission = async (req, res) => {
  try {
    const { name } = req.body;
    const permission = await Permission.create({ name });
    res.status(201).json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get All Permissions
exports.getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find({ isDeleted: { $ne: true } });
    res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Single Permission
exports.getPermission = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id);
    if (!permission) return res.status(404).json({ success: false, message: "Permission not found" });
    res.status(200).json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update Permission
exports.updatePermission = async (req, res) => {
  try {
    const { name } = req.body;
    const permission = await Permission.findByIdAndUpdate(req.params.id, { name }, { returnDocument: 'after' });
    if (!permission) return res.status(404).json({ success: false, message: "Permission not found" });
    res.status(200).json({ success: true, data: permission });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete Permission
exports.deletePermission = async (req, res) => {
  try {
    const permission = await Permission.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    if (!permission) return res.status(404).json({ success: false, message: "Permission not found" });
    res.status(200).json({ success: true, message: "Permission deleted" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
