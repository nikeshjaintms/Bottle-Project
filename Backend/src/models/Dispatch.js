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
          type: mongoose.Schema.Types.ObjectId,
          ref: "BottlePerBox",
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
        detectedTextColor: {
          type: String,
          default: "Not Detected"
        },
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Variant",
          default: null,
        },
        productName: {
          type: String,
          default: null,
        },
        printing: {
          type: String,
          default: null,
        },
        foil: {
          type: String,
          default: null,
        },
        organic: {
          type: String,
          default: null,
        },
        box: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        qty: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        totalQty: {
          type: Number,
          required: true,
        }
      }
    ],
    // Denormalized entry-level bottle keys for efficient filtering
    plainBottleKeys: {
      type: [String],
      default: []
    },
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

// Indexes for dispatch list filtering and sorting
dispatchSchema.index({ companyId: 1, dispatchDate: -1, createdAt: -1 });
dispatchSchema.index({ companyId: 1, isDeleted: 1 });
dispatchSchema.index({ gatePassNo: 1, isDeleted: 1 });
dispatchSchema.index({ plainBottleKeys: 1 });
// Automatically compute plainBottleKeys before saving
dispatchSchema.pre("save", async function () {
  const { computePlainBottleKeys } = require("../utils/computePlainBottleKeys");
  this.plainBottleKeys = await computePlainBottleKeys(this.items);
});

module.exports = mongoose.model("Dispatch", dispatchSchema);
