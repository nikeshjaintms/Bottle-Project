const mongoose = require("mongoose");

const defaultModules = [
  { key: "lacquer_plan", name: "Lacquer Plan", isUnderMaintenance: false },
  { key: "printing_plan", name: "Printing Plan", isUnderMaintenance: false },
  { key: "incoming", name: "Incoming & Shreno Incoming", isUnderMaintenance: false },
  { key: "production", name: "Production & Coating", isUnderMaintenance: false },
  { key: "dispatch", name: "Dispatch & Ready to Dispatch", isUnderMaintenance: false },
  { key: "delivery_challan", name: "Delivery Challan", isUnderMaintenance: false },
  { key: "stock_entry", name: "Stock Entry & Invoices", isUnderMaintenance: false },
  { key: "master_data", name: "Master Data (Specs, Bottles, Types)", isUnderMaintenance: false },
  { key: "summary", name: "Summary & Reports", isUnderMaintenance: false },
  { key: "vision", name: "AI Vision & OCR", isUnderMaintenance: false },
];

const maintenanceSettingSchema = new mongoose.Schema(
  {
    isGlobalMaintenance: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: "System is currently undergoing scheduled maintenance. Please check back shortly.",
    },
    estimatedEndTime: {
      type: String,
      default: "",
    },
    allowedRoles: {
      type: [String],
      default: ["admin", "super admin", "superadmin"],
    },
    modules: [
      {
        key: { type: String, required: true },
        name: { type: String, required: true },
        isUnderMaintenance: { type: Boolean, default: false },
        message: { type: String, default: "" },
      },
    ],
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Returns the singleton maintenance setting document, auto-initializing if empty
 */
maintenanceSettingSchema.statics.getSingleton = async function () {
  let setting = await this.findOne();
  if (!setting) {
    setting = await this.create({
      isGlobalMaintenance: false,
      message: "System is currently undergoing scheduled maintenance. Please check back shortly.",
      estimatedEndTime: "",
      allowedRoles: ["admin", "super admin", "superadmin"],
      modules: defaultModules,
    });
  } else {
    // Check if any default modules are missing in existing document
    let modified = false;
    for (const defMod of defaultModules) {
      if (!setting.modules.some((m) => m.key === defMod.key)) {
        setting.modules.push(defMod);
        modified = true;
      }
    }
    if (modified) {
      await setting.save();
    }
  }
  return setting;
};

module.exports = mongoose.model("MaintenanceSetting", maintenanceSettingSchema);

