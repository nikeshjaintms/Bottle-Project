const mongoose = require("mongoose");

const pendingSheetSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  bottleName: { type: String, required: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
  variantName: { type: String, required: true },
  coated: { type: Number, default: 0 },
  order: { type: Number, default: 0 },
  ready: { type: Number, default: 0 },
  readyToDispatch: { type: Number, default: 0 },
  dispatch: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("PendingSheet", pendingSheetSchema);
