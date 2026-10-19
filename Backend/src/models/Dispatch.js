const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema(
  {
    dispatchDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    gatePassNo: {
      type: String,
      required: false,
      sparse: true,
      unique: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    remarks: {
      type: String,
    },
    items: [
      {
        bottleId: {
          // Can be MongoDB ObjectId, string, or null (if no bottle provided)
          type: mongoose.Schema.Types.Mixed,
          required: false,
          default: null
        },
        coatingShade: {
          type: String,
          default: null,
        },
        printingTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PrintingType",
          default: null,
        },
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Variant",
          default: null,
        },
        box: {
          type: Number,
          required: true,
          min: 0,
        },
        qty: {
          type: Number,
          required: true,
          min: 1,
        },
        totalQty: {
          type: Number,
          required: true,
        }
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dispatch", dispatchSchema);
