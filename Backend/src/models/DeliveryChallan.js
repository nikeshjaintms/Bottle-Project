const mongoose = require("mongoose");

const deliveryChallanItemSchema = new mongoose.Schema({
  title: {
    type: String,
    default: "", // Group header like "30 ML CAMILLA" or "50 ML RARE MAINLINE"
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true, // e.g. "PLAIN-DRAMA QUEEN-ROSE GOLD FOIL"
  },
  box: {
    type: String,
    required: true,
    trim: true, // e.g. "39" or "60+(1*28)"
  },
  boxCount: {
    type: Number,
    default: 0, // Numeric box count contributing to total boxes
  },
  unit: {
    type: Number,
    required: true,
    default: 1, // Pcs per box
  },
  total: {
    type: Number,
    required: true, // Total pieces
  },
  remarks: {
    type: String,
    default: "",
    trim: true,
  },
});

const addressSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    addressTitle: { type: String, default: "", trim: true },
    addressLine1: { type: String, default: "", trim: true },
    addressLine2: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "GUJARAT", trim: true },
    stateCode: { type: String, default: "24", trim: true },
    pincode: { type: String, default: "", trim: true },
    gstNo: { type: String, default: "", trim: true, uppercase: true },
    contactPerson: { type: String, default: "", trim: true },
    contactPhone: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const deliveryChallanSchema = new mongoose.Schema(
  {
    challanType: {
      type: String,
      default: "shayoona",
      index: true,
    },
    challanNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    challanDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    challanTime: {
      type: String,
      default: "", // e.g. "5.30 PM"
      trim: true,
    },
    buyersOrderNo: {
      type: String,
      default: "",
      trim: true,
    },
    dispatchThrough: {
      type: String,
      default: "",
      trim: true,
    },
    lrNo: {
      type: String,
      default: "",
      trim: true,
    },
    vehicleNo: {
      type: String,
      default: "",
      trim: true,
    },
    // Company selection
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    companyName: {
      type: String,
      default: "",
      trim: true,
    },
    // Billed To Address
    billedToAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAddress",
    },
    billedTo: {
      type: addressSnapshotSchema,
      default: () => ({}),
    },
    // Shipped To Address
    shippedToAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAddress",
    },
    shippedTo: {
      type: addressSnapshotSchema,
      default: () => ({}),
    },
    items: [deliveryChallanItemSchema],
    totalBoxes: {
      type: Number,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
    },
    checkedBy: {
      type: String,
      default: "",
      trim: true,
    },
    checkedDate: {
      type: String,
      default: "",
      trim: true,
    },
    checkedTime: {
      type: String,
      default: "",
      trim: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeliveryChallan", deliveryChallanSchema);
