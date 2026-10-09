const mongoose = require("mongoose");

const plainBottleStockSchema = new mongoose.Schema(
  {
    bottleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BottlePerBox",
      required: true,
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // E.g., blocked for upcoming coating/printing
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// We need an index to ensure unique stock entry per bottle spec
plainBottleStockSchema.index({ bottleId: 1 }, { unique: true });

module.exports = mongoose.model("PlainBottleStock", plainBottleStockSchema);
