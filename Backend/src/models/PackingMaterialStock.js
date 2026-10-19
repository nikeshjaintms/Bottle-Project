const mongoose = require('mongoose');

const packingMaterialStockSchema = new mongoose.Schema({
  bottleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BottlePerBox',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  itemType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemType',
    required: true
  },
  
  // Time-series snapshots: one entry per date column from the import
  snapshots: [{
    date: {
      type: Date,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Running total from "TOTAL AVL IN SHAYONA" column
  totalAvailable: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Track when this was last updated from an import
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Audit trail: where this data came from
  source: {
    type: String,
    default: 'SHRENO_IMPORT',
    enum: ['SHRENO_IMPORT', 'MANUAL', 'OTHER']
  },
  
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true,
  // Ensure one document per bottle+company+itemType combination
  indexes: [
    { fields: { bottleId: 1, companyId: 1, itemType: 1 }, unique: true }
  ]
});

// Compound index for efficient queries and uniqueness
packingMaterialStockSchema.index({ bottleId: 1, companyId: 1, itemType: 1 }, { unique: true });

module.exports = mongoose.model('PackingMaterialStock', packingMaterialStockSchema);
