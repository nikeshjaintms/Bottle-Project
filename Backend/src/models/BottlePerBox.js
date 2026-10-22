const mongoose = require("mongoose");

const bottlePerBoxSchema = new mongoose.Schema({
  plainBottleName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  bottleNames: [{
    type: String,
    trim: true
  }],
  // Keep bottleName for backward compatibility with existing API consumers
  bottleName: {
    type: String,
    trim: true
  },
  bottlePerBox: {
    type: Number,
    default: null
  },
  boxWeight: {
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

bottlePerBoxSchema.pre('save', function () {
  if (this.plainBottleName) {
    this.plainBottleName = this.plainBottleName.trim().replace(/\s+/g, ' ');
  }
  if (!this.bottleName && this.plainBottleName) {
    this.bottleName = this.plainBottleName;
  }
  if (!this.plainBottleName && this.bottleName) {
    this.plainBottleName = this.bottleName.trim().replace(/\s+/g, ' ');
  }
  if (this.bottleNames && Array.isArray(this.bottleNames)) {
    this.bottleNames = Array.from(new Set(
      this.bottleNames.map(n => String(n || '').trim().replace(/\s+/g, ' ')).filter(Boolean)
    ));
    // For new documents, ensure plainBottleName is initially in bottleNames
    if (this.isNew && this.plainBottleName && !this.bottleNames.includes(this.plainBottleName)) {
      this.bottleNames.unshift(this.plainBottleName);
    }
  } else if (this.isNew && this.plainBottleName) {
    this.bottleNames = [this.plainBottleName];
  }
});

module.exports = mongoose.model("BottlePerBox", bottlePerBoxSchema);
