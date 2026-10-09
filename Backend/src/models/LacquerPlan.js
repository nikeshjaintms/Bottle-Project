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
  }
}, { timestamps: true });

// Add virtual getters for backward compatibility
// lacquerPlanSchema.virtual('colour').get(function() {
//   return this.coatingShade;
// });

// lacquerPlanSchema.virtual('dispatchBalance').get(function() {
//   return this.dispatchPendingQty;
// });

// lacquerPlanSchema.virtual('coatedQty').get(function() {
//   return this.coatingCompletedQty;
// });

module.exports = mongoose.model("LacquerPlan", lacquerPlanSchema);
