const Role = require("../models/role.model");

// Create Role
exports.createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const existing = await Role.findOne({ name: { $regex: new RegExp("^" + name.trim() + "$", "i") }, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ success: false, message: "Role with this name already exists" });
    }

    const role = await Role.create({ name: name.trim(), permissions });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Role with this name already exists" });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update Role
exports.updateRole = async (req, res) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }
    res.status(200).json({ success: true, data: role });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Delete Role
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }
    res.status(200).json({ success: true, message: "Role deleted successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get All Roles
exports.getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isDeleted: { $ne: true } }).populate("permissions");
    res.status(200).json({ success: true, data: roles });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Single Role
exports.getRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id).populate("permissions");
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }
    res.status(200).json({ success: true, data: role });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
