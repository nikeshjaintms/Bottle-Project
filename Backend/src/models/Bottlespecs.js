const mongoose = require("mongoose");

const bottleSpecSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: false  // Changed to false to allow creating without brand initially
  },

  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    default: null
  },

  bottleName: {
    type: String,
    required: true
  },

  code: {
    type: String,   // e.g. Q20
  },

  // Printing specific fields
  printingTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrintingType"
  },

  printingColorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PrintingColor"
  },

  // Coating specific fields
  coatingTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CoatingType"
  },

  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Variant",
    default: null
  },

  coatingShade: {
    type: String,
    default: null
  },

  image: {
    type: String,
    default: null
  },

  status: {
    type: Boolean,
    default: true
  },
  isCoating: {
    type: Boolean,
    default: false
  },
  isPrinting: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("BottleSpec", bottleSpecSchema);