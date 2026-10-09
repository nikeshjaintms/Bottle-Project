const mongoose = require('mongoose');

const shrenoIncomingSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  challanNo: {
    type: String,
    required: true,
  },
  poNo: {
    type: String,
  },
  poDate: {
    type: Date,
  },

  items: [{
    bottleName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BottleSpec',
      required: true
    },
    itemType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemType',
      required: true
    },
    configuration: {
      type: String,
      required: true
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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ShrenoIncoming', shrenoIncomingSchema);
