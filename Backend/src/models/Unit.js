const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: Boolean,
    default: true
  },
  operators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Operator"
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Unit", unitSchema);
