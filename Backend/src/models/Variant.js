const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  bottleSpecId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BottleSpec",
    required: true
  },

  variantName: {
    type: String
  },


  variantSize: {
    type: String
  },

  materialCode: {
    type: String,
    trim: true,
    default: ''
  },

  coatingShade: {
    type: String,
    trim: true
  },

  image: {
    type: String
  },

  status: {
    type: Boolean,
    default: true
  },

  detectedTextColor: {
    type: String,
    default: "Not Detected"
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isHiddenInSgLabel: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("Variant", variantSchema);