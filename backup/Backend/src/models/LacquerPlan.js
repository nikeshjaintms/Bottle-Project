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
  // Reference to BottlePerBox for plain bottle
  plainBottleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottlePerBox",
    default: null
  },
  // Printing fields - fetched from BottleSpec based on plain bottle selection
  printingTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrintingType",
    default: null
  },
  printingColorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrintingColor",
    default: null
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
  groupKey: {
    type: String,
    index: true,
    default: null
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
  sentToReadyQty: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quantity entries history for Order Qty and Coating Completed Qty additions
    qtyEntries: [{
    type: {
      type: String
    },
    subType: String,
    qty: Number,
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
  coatedQtyInitial: {
    type: Number,
    default: null
  },
  carriedFromCoatedQty: {
    type: Number,
    default: 0
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
  // Production closure and status
  productionStatus: {
    type: String,
    enum: ['ACTIVE', 'CLOSED', 'COMPLETED'],
    default: 'ACTIVE'
  },
  isClosed: {
    type: Boolean,
    default: false
  },
  closedAt: {
    type: Date,
    default: null
  },
  closedBy: {
    type: String,
    default: null
  },
  cancelledQty: {
    type: Number,
    default: 0
  },
  // Split order archival flag: true for completed/dispatched portion of a split order
  isArchived: {
    type: Boolean,
    default: false
  },
  // Production audit history for closure and split operations
  productionAudit: [{
    action: {
      type: String,
      enum: ['CLOSE_ENTIRE_ORDER', 'SPLIT_REMAINING_ORDER']
    },
    originalOrderQty: Number,
    quantityCoated: Number,
    quantitySentToReady: Number,
    quantityCancelledOrClosed: Number,
    quantityRemainingAfterSplit: Number,
    sourcePlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LacquerPlan'
    },
    dispatchedPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LacquerPlan'
    },
    sheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReadyToDispatch'
    },
    lineId: mongoose.Schema.Types.ObjectId,
    performedAt: {
      type: Date,
      default: Date.now
    },
    performedBy: String,
    performedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  shortfallQty: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Indexes for lacquerplan queries with common filters
lacquerPlanSchema.index({ companyId: 1, isDeleted: 1, bottleName: 1 });
lacquerPlanSchema.index({ companyId: 1, planDate: -1, isDeleted: 1 });
lacquerPlanSchema.index({ coatingShade: 1, isDeleted: 1 });
lacquerPlanSchema.index({ planDate: 1, isDeleted: 1, isArchived: 1 });

module.exports = mongoose.model("LacquerPlan", lacquerPlanSchema);
