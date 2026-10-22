const mongoose = require("mongoose");

const variantLineSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Variant",
    default: null,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  noOfBoxes: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  producedQty: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  weight: {
    type: Number,
    default: 9.5,
    min: 0,
  },
  totalWeight: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const plainBottleGroupSchema = new mongoose.Schema({
  plainBottleName: {
    type: String,
    required: true,
    trim: true,
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
        default: 0,
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
