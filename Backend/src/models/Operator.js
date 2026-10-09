const mongoose = require("mongoose");

const operatorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    // unique: true
  },
  status: {
    type: Boolean,
    default: true
  },
  shift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Shift"
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Operator", operatorSchema);
