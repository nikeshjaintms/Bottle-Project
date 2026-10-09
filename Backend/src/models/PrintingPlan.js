const mongoose = require("mongoose");

const printingPlanSchema = new mongoose.Schema({
  lacquerPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LacquerPlan",
    default: null
  },
  planDate: {
    type: Date,
    required: true
  },
  sourceGroupId: {
    type: String
  },
    bottleName: {
    // Adding this since it's the standard way we identify bottles in the UI alongside itemId
    type: String
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottleSpec"
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand"
  },
  brandName: {
    type: String
  },
  coatingShade: {
    type: String
  },
  printingToBeDone: {
    type: String
  },
  printingVariant: {
    type: String
  },
  textColor: {
    type: String
  },
  plainBottleStock: {
    type: Number
  },
  orderQty: {
    type: Number
  },
  balanceToMake: {
    type: Number
  },
  boxQty: {
    type: Number
  },
  noOfBoxes: {
    type: Number
  },
  producedQty: {
    type: Number
  },
  dispatchBalance: {
    type: Number,
    default: 0
  },
  soldQty: {
    type: Number,
    default: 0
  },
  readyBoxes: {
    type: Number
  },
  status: {
    type: Boolean,
    default: true
  },
  remarks: {
    type: String
  },
  components: [{
    itemType: String,
    componentType: String,
    quantity: Number
  }],
  componentHeadersList: [String],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("PrintingPlan", printingPlanSchema);
