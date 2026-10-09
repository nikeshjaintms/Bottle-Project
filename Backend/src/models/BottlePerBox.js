const mongoose = require("mongoose");

const bottlePerBoxSchema = new mongoose.Schema({
  bottleName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  bottlePerBox: {
    type: Number,
    default: null
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

bottlePerBoxSchema.pre('save', function() {
  if (this.bottleName) {
    this.bottleName = this.bottleName.trim().replace(/\s+/g, ' ');
  }
});

module.exports = mongoose.model("BottlePerBox", bottlePerBoxSchema);
