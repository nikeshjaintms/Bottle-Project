const mongoose = require("mongoose");

const lacquerPlanSchema = new mongoose.Schema({
  planDate: {
    type: Date,
    required: true
  },
  bottleName: {
    type: String,
    required: true
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Variant"
  },
  coatingShade: {
    type: String
  },
  // Deprecated: use coatingShade instead
  colour: {
    type: String
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand"
  },
  brandName: {
    type: String
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  },
  companyName: {
    type: String
  },
  variantName: {
    type: String
  },
  process: {
    type: String
  },
  orderQty: {
    type: Number
  },
  orderHistory: [{
    date: { type: Date, default: Date.now },
    originalOrder: Number,
    updatedOrder: Number,
    totalOrder: Number
  }],
  dispatchPendingQty: {
    type: Number,
    default: 0
  },
  // Deprecated: use dispatchPendingQty instead
  dispatchBalance: {
    type: Number,
    default: 0
  },
  soldQty: {
    type: Number,
    default: 0
  },
  boxQty: {
    type: Number
  },
  noOfBoxes: {
    type: Number
  },
  coatingCompletedQty: {
    type: Number,
    default: 0
  },
  // Deprecated: use coatingCompletedQty instead
  coatedQty: {
    type: Number,
    default: 0
  },
  balanceToMake: {
    type: Number,
    default: 0
  },
  status: {
    type: Boolean,
    default: true
  },
  remarks: {
    type: String
  },
  plainStock: {
    type: Number
  },
  appliedStockDeduction: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  importGroupId: {
    type: String,
    default: null
  },
  importGroupIndex: {
    type: Number,
    default: null
  },
  importGroupSize: {
    type: Number,
    default: null
  },
  isEditedAfterImport: {
    type: Boolean,
    default: false
  },
  lastEditedAt: {
    type: Date,
    default: null
  },
  originalImportedValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  importedFromId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LacquerPlan',
    default: null
  },
  importedFromDate: {
    type: Date,
    default: null
  },
  stockWarningAcknowledged: {
    type: Boolean,
    default: false
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  stockWarningDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { timestamps: true });



module.exports = mongoose.model("LacquerPlan", lacquerPlanSchema);
