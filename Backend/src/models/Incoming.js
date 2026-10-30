const mongoose = require("mongoose");

const incomingSchema = new mongoose.Schema(
  {
    documentDate: {
      type: Date,
      required: false,
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
          min: 0,
          default: 0,
        },
        totalQty: {
          type: Number,
          required: true,
          default: 0,
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

// Indexes for incoming queries with common filters
incomingSchema.index({ billToId: 1, isDeleted: 1, documentDate: -1 });
incomingSchema.index({ billToId: 1, createdAt: -1 });
incomingSchema.index({ deliveryNumber: 1, isDeleted: 1 });

module.exports = mongoose.model("Incoming", incomingSchema);
