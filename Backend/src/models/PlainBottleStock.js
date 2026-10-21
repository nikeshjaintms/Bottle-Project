const mongoose = require("mongoose");

const plainBottleStockSchema = new mongoose.Schema(
  {
    bottleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BottlePerBox",
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    availableQuantity: {
      type: Number,
      default: 0,
    },
    // E.g., blocked for upcoming coating/printing
    reservedQuantity: {
      type: Number,
      default: 0,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Unique stock entry per company and bottle spec
plainBottleStockSchema.index({ companyId: 1, bottleId: 1 }, { unique: true });

module.exports = mongoose.model("PlainBottleStock", plainBottleStockSchema);
