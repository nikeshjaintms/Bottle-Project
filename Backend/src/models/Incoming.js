const mongoose = require("mongoose");

const incomingSchema = new mongoose.Schema(
  {
    documentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    deliveryNumber: {
      type: String,
      required: false,
      sparse: true,
      // REMOVED unique: true to allow multiple records with null/blank deliveryNumber
      // Duplicate detection is now done via application logic in import handlers
    },
    billToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    images: [{
      type: String,
    }],
    poDate: {
      type: Date,
      required: false,
    },
    poNo: {
      type: String,
      required: false,
    },
    poOrderQty: {
      type: Number,
      required: false,
    },
    items: [
      {
        bottleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "BottlePerBox",
          required: true,
        },
        box: {
          type: Number,
          default: 0,
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
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incoming", incomingSchema);
