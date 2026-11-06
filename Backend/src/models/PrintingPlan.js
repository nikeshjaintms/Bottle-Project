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
  groupId: {
    type: String,
    index: true,
    default: null
  },
  rowOrder: {
    type: Number,
    default: 1
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
  lacquerCoatingCompletedQty: {
    type: Number,
    default: 0
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
  qtyEntries: [{
    type: {
      type: String
    },
    subType: String,
    qty: Number,
    rejectionQty: { type: Number, default: 0 },
    rejectionSeparate: { type: Boolean, default: false },
    rejectionBoxes: { type: Number, default: 0 },
    rejectionLooseQty: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
    by: String,
    note: String,
    runningTotal: Number,
    stockAllocation: [{
      companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company"
      },
      qty: {
        type: Number,
        default: 0
      }
    }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    deletedBy: String
  }],
  orderQtyInitial: {
    type: Number,
    default: null
  },
  producedQtyInitial: {
    type: Number,
    default: null
  },
  stockAllocationInitial: [{
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company"
    },
    qty: {
      type: Number,
      default: 0
    }
  }],
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
  process: {
    type: String,
    default: null
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
  },
  appliedStockDeduction: {
    type: Number,
    default: 0
  },
  isEditedAfterImport: {
    type: Boolean,
    default: false
  },
  isExcelViewOnly: {
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
  // Mark indicating row has been sent to Ready To Dispatch
  // Contains reference to the dispatch sheet and line, plus timestamp of send action
  readyToDispatch: {
    type: Object,
    default: null,
    properties: {
      sheetId: mongoose.Schema.Types.ObjectId,
      lineId: mongoose.Schema.Types.ObjectId,
      sentAt: Date
    }
  },
  stockSources: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company"
  }],
  stockAllocation: [{
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company"
    },
    qty: {
      type: Number,
      default: 0
    }
  }],
  allocationShortfall: {
    type: Boolean,
    default: false
  },
  shortfallQty: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Indexes for printingplan queries with common filters
printingPlanSchema.index({ companyId: 1, isDeleted: 1, bottleId: 1 });
printingPlanSchema.index({ companyId: 1, coatingShade: 1, isDeleted: 1 });
printingPlanSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model("PrintingPlan", printingPlanSchema);
