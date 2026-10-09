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
      required: true,
    },
    remarks: {
      type: String,
    },
    items: [
      {
        productName: {
          type: String,
          required: true,
        },
        printing: {
          type: String,
        },
        foil: {
          type: String,
        },
        organic: {
          type: String,
        },
        box: {
          type: Number,
          required: true,
          min: 0,
        },
        additionalBox: {
          type: Number,
          default: 0,
          min: 0,
        },
        qty: {
          type: Number,
          required: true,
          min: 1,
        },
        total: {
          type: Number,
          required: true,
        },
        remarks: {
          type: String,
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
