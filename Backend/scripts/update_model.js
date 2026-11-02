const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/models/LacquerPlan.js');
let content = fs.readFileSync(filePath, 'utf8');

// Update orderHistory
const oldHistory = `  orderHistory: [{
    date: { type: Date, default: Date.now },
    originalOrder: Number,
    updatedOrder: Number,
    totalOrder: Number
  }],`;

const newHistory = `  orderHistory: [{
    date: { type: Date, default: Date.now },
    originalOrder: Number,
    updatedOrder: Number,
    totalOrder: Number,
    notes: String,
    reason: String
  }],`;

if (content.includes('originalOrder: Number,')) {
  content = content.replace(
    /orderHistory:\s*\[\{\s*date:\s*\{\s*type:\s*Date,\s*default:\s*Date\.now\s*\},\s*originalOrder:\s*Number,\s*updatedOrder:\s*Number,\s*totalOrder:\s*Number\s*\}\],/,
    newHistory.trim()
  );
}

// Add isSoftRemoved and isSibling
const oldArchived = `  // Split order archival flag: true for completed/dispatched portion of a split order
  isArchived: {
    type: Boolean,
    default: false
  },`;

const newFields = `  // Soft removal flag: removed from active list, totals, paging
  isSoftRemoved: {
    type: Boolean,
    default: false
  },
  softRemovedAt: {
    type: Date,
    default: null
  },
  softRemovedBy: {
    type: String,
    default: null
  },
  // Split order archival flag: true for completed/dispatched portion of a split order
  isArchived: {
    type: Boolean,
    default: false
  },
  isSibling: {
    type: Boolean,
    default: false
  },
  siblingOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LacquerPlan',
    default: null
  },`;

if (content.includes('isArchived: {')) {
  content = content.replace(
    /\/\/\s*Split order archival flag: true for completed\/dispatched portion of a split order\s*isArchived:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\},/,
    newFields.trim()
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated LacquerPlan.js');
