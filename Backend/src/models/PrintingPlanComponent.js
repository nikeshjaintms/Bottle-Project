const mongoose = require('mongoose');

const printingPlanComponentSchema = new mongoose.Schema({
  printingPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrintingPlan',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  planDate: {
    type: Date,
    required: true
  },
  componentType: {
    type: String,
    required: true // e.g., '1PC GP', '106MM LID', 'RED CAP'
  },
  quantity: {
    type: Number,
    required: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('PrintingPlanComponent', printingPlanComponentSchema);
