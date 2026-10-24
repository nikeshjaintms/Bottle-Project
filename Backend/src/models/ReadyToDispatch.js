const mongoose = require("mongoose");

const variantLineSchema = new mongoose.Schema({
  // Source plan row reference - for duplicate guard and repairs
  sourcePlanType: {
    type: String,
    enum: ['lacquer', 'printing', null],
    default: null,
  },
  sourcePlanId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Variant",
    default: null,
  },
  
  // Brand identification (stored at line creation time from plan row)
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    default: null,
  },
  brandName: {
    type: String,
    trim: true,
    default: null,
  },
  
  description: {
    type: String,
    required: false,
    trim: true,
    default: "",
  },
  
  noOfBoxes: {
    type: Number,
    required: false,
    default: 0,
    min: 0,
  },
  
  producedQty: {
    type: Number,
    required: false,
    default: 0,
    min: 0,
  },
  
  weight: {
    type: Number,
    default: null,  // Preserve null - only from BottlePerBox master
    min: 0,
  },
  
  totalWeight: {
    type: Number,
    default: null,  // Preserve null when weight is null
    min: 0,
  },
  bottleSpecId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottleSpec",
    default: null,
  },
  uniqueKey: {
    type: String,
    trim: true,
    default: null,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

const plainBottleGroupSchema = new mongoose.Schema({
  plainBottleName: {
    type: String,
    required: true,
    trim: true,
  },
  plainBottleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottlePerBox",
    default: null,
  },
  bottleSpecId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottleSpec",
    default: null,
  },
  unit: {
    type: Number,
    default: 0,
    min: 0,
  },
  variantLines: [variantLineSchema],
});

const readyToDispatchSchema = new mongoose.Schema(
  {
    dispatchDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    sheetTitle: {
      type: String,
      trim: true,
      default: "",
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    groups: [plainBottleGroupSchema],
    summary: {
      totalBoxes: {
        type: Number,
        default: 0,
      },
      totalProducedQty: {
        type: Number,
        default: 0,
      },
      totalWeight: {
        type: Number,
        default: null,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup
readyToDispatchSchema.index({ companyId: 1, dispatchDate: -1, isDeleted: 1 });
readyToDispatchSchema.index({ "groups.plainBottleName": 1 });
readyToDispatchSchema.index({ "groups.variantLines.description": 1 });

module.exports = mongoose.model("ReadyToDispatch", readyToDispatchSchema);
