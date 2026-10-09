const mongoose = require("mongoose");

const gstSchema = new mongoose.Schema({
  gstNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Gst", gstSchema);
