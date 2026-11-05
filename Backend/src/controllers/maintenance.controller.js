const MaintenanceSetting = require("../models/MaintenanceSetting");
const { invalidateMaintenanceCache } = require("../middleware/maintenance.middleware");

// ✅ GET CURRENT MAINTENANCE STATUS
exports.getStatus = async (req, res) => {
  try {
    const setting = await MaintenanceSetting.getSingleton();
    
    // Check if current user has bypass rights
    const user = req.user;
    const userRole = (
      typeof user?.role === "object" ? user?.role?.name : user?.role || ""
    ).toLowerCase();
    
    const allowedRoles = (setting.allowedRoles || ["admin", "super admin"]).map((r) =>
      r.toLowerCase()
    );
    const canBypass = allowedRoles.includes(userRole);

    res.json({
      success: true,
      data: {
        isGlobalMaintenance: setting.isGlobalMaintenance,
        message: setting.message,
        estimatedEndTime: setting.estimatedEndTime,
        allowedRoles: setting.allowedRoles,
        modules: setting.modules,
        canBypass,
        userRole: userRole || null,
        updatedAt: setting.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET MAINTENANCE STATUS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ TOGGLE GLOBAL MAINTENANCE (ADMIN ONLY)
exports.toggleGlobal = async (req, res) => {
  try {
    const { isGlobalMaintenance, message, estimatedEndTime } = req.body;
    const setting = await MaintenanceSetting.getSingleton();

    if (isGlobalMaintenance !== undefined) {
      setting.isGlobalMaintenance = Boolean(isGlobalMaintenance);
    } else {
      setting.isGlobalMaintenance = !setting.isGlobalMaintenance;
    }

    if (message !== undefined) setting.message = message;
    if (estimatedEndTime !== undefined) setting.estimatedEndTime = estimatedEndTime;
    if (req.user?._id) setting.lastUpdatedBy = req.user._id;

    await setting.save();
    invalidateMaintenanceCache();

    res.json({
      success: true,
      message: `Global maintenance mode is now ${setting.isGlobalMaintenance ? "ENABLED" : "DISABLED"}`,
      data: setting,
    });
  } catch (err) {
    console.error("TOGGLE GLOBAL ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ TOGGLE SPECIFIC MODULE MAINTENANCE (ADMIN ONLY)
exports.toggleModule = async (req, res) => {
  try {
    const { moduleKey, isUnderMaintenance, message } = req.body;
    if (!moduleKey) {
      return res.status(400).json({ success: false, message: "moduleKey is required" });
    }

    const setting = await MaintenanceSetting.getSingleton();
    const mod = setting.modules.find((m) => m.key === moduleKey);

    if (!mod) {
      return res.status(404).json({ success: false, message: `Module '${moduleKey}' not found` });
    }

    if (isUnderMaintenance !== undefined) {
      mod.isUnderMaintenance = Boolean(isUnderMaintenance);
    } else {
      mod.isUnderMaintenance = !mod.isUnderMaintenance;
    }

    if (message !== undefined) {
      mod.message = message;
    }

    if (req.user?._id) setting.lastUpdatedBy = req.user._id;

    await setting.save();
    invalidateMaintenanceCache();

    res.json({
      success: true,
      message: `${mod.name} maintenance mode is now ${mod.isUnderMaintenance ? "ENABLED" : "DISABLED"}`,
      data: mod,
      allModules: setting.modules,
    });
  } catch (err) {
    console.error("TOGGLE MODULE ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ BULK UPDATE MAINTENANCE SETTINGS (ADMIN ONLY)
exports.updateSettings = async (req, res) => {
  try {
    const {
      isGlobalMaintenance,
      message,
      estimatedEndTime,
      allowedRoles,
      modules,
    } = req.body;

    const setting = await MaintenanceSetting.getSingleton();

    if (isGlobalMaintenance !== undefined) setting.isGlobalMaintenance = Boolean(isGlobalMaintenance);
    if (message !== undefined) setting.message = message;
    if (estimatedEndTime !== undefined) setting.estimatedEndTime = estimatedEndTime;
    if (Array.isArray(allowedRoles)) setting.allowedRoles = allowedRoles;

    if (Array.isArray(modules)) {
      for (const updatedMod of modules) {
        const existing = setting.modules.find((m) => m.key === updatedMod.key);
        if (existing) {
          if (updatedMod.isUnderMaintenance !== undefined) {
            existing.isUnderMaintenance = Boolean(updatedMod.isUnderMaintenance);
          }
          if (updatedMod.message !== undefined) {
            existing.message = updatedMod.message;
          }
        }
      }
    }

    if (req.user?._id) setting.lastUpdatedBy = req.user._id;

    await setting.save();
    invalidateMaintenanceCache();

    res.json({
      success: true,
      message: "Maintenance settings updated successfully",
      data: setting,
    });
  } catch (err) {
    console.error("UPDATE SETTINGS ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

