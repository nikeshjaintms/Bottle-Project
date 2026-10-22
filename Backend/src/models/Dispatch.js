const mongoose = require("mongoose");

const dispatchSchema = new mongoose.Schema(
  {
    dispatchDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    gatePassNo: {
      type: String,
      required: false,
      sparse: true,
      unique: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    remarks: {
      type: String,
    },
    items: [
      {
        bottleId: {
          // Can be MongoDB ObjectId, string, or null (if no bottle provided)
          type: mongoose.Schema.Types.Mixed,
          required: false,
          default: null
        },
        coatingShade: {
          type: String,
          default: null,
        },
        printingTypeId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PrintingType",
          default: null,
        },
        detectedTextColor: {
          type: String,
          default: "Not Detected"
        },
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Variant",
          default: null,
        },
        box: {
          type: Number,
          required: true,
          min: 0,
        },
        qty: {
          type: Number,
          required: true,
          min: 1,
        },
        totalQty: {
          type: Number,
          required: true,
        }
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Post-hook to populate bottleId and printingTypeId after find
dispatchSchema.post(/^find/, async function(docs) {
  if (!docs) return;
  
  const docArray = Array.isArray(docs) ? docs : [docs];
  const BottlePerBox = mongoose.model('BottlePerBox');
  const PrintingType = mongoose.model('PrintingType');
  
  for (const doc of docArray) {
    if (doc.items && Array.isArray(doc.items)) {
      for (const item of doc.items) {
        // Populate bottleId
        if (item.bottleId && mongoose.Types.ObjectId.isValid(item.bottleId)) {
          try {
            const bottle = await BottlePerBox.findById(item.bottleId, 'bottleName plainBottleName');
            if (bottle) {
              item.bottleId = bottle;
            }
          } catch (err) {
            console.error('Error populating bottle:', err);
          }
        }
        
        // Populate printingTypeId and set detectedTextColor
        if (item.printingTypeId && mongoose.Types.ObjectId.isValid(item.printingTypeId)) {
          try {
            const printingType = await PrintingType.findById(item.printingTypeId, 'name');
            if (printingType) {
              item.detectedTextColor = printingType.name;
            }
          } catch (err) {
            console.error('Error populating printing type:', err);
          }
        }
      }
    }
  }
});

module.exports = mongoose.model("Dispatch", dispatchSchema);
