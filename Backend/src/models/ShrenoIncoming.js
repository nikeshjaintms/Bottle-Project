const mongoose = require('mongoose');

const shrenoIncomingSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  challanNo: {
    type: String,
    required: false,
    sparse: true,
    unique: true,
  },
  poNo: {
    type: String,
  },
  poDate: {
    type: Date,
  },

  items: [{
    // Changed from bottleName (BottleSpec) to plainBottle (BottlePerBox)
    // This is the ONLY bottle reference now
    plainBottle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BottlePerBox',
      required: true
    },
    itemType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemType',
      required: false,
      default: null
    },
    configuration: {
      type: String,
      required: false,
      default: null
    },

    quantity: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  images: [{
    type: String
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  isImported: {
    type: Boolean,
    default: false,
    index: true
  },
  importedAt: {
    type: Date,
    default: null
  },
  importBatchId: {
    type: String,
    default: null
  },
  source: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

shrenoIncomingSchema.index({ date: -1, isDeleted: 1, isImported: 1 });
shrenoIncomingSchema.index({ challanNo: 1, isDeleted: 1 });
shrenoIncomingSchema.index({ 'items.plainBottle': 1, isDeleted: 1, isImported: 1 });

module.exports = mongoose.model('ShrenoIncoming', shrenoIncomingSchema);
