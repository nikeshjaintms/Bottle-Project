const mongoose = require('mongoose');
const BottleSpec = require('../models/Bottlespecs');
const BottlePerBox = require('../models/BottlePerBox');
const mapping = require('./bottlePerBox.mapping');

async function applyCorrections() {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');

  let totalSpecsModified = 0;
  let totalPerBoxModified = 0;

  for (const [rawName, canonicalName] of Object.entries(mapping)) {
    if (rawName === canonicalName) continue; // No change needed

    // Update BottleSpecs
    const specResult = await BottleSpec.updateMany(
      { bottleName: rawName },
      { $set: { bottleName: canonicalName } }
    );

    if (specResult.modifiedCount > 0) {
      console.log(`[BottleSpec] CHANGED "${rawName}" ➔ "${canonicalName}" (${specResult.modifiedCount} documents updated)`);
      totalSpecsModified += specResult.modifiedCount;
    }

    // Update BottlePerBox
    // Since bottleName is unique in BottlePerBox, we need to handle merges carefully
    const existingPerBox = await BottlePerBox.findOne({ bottleName: rawName });
    if (existingPerBox) {
      const existingCanonical = await BottlePerBox.findOne({ bottleName: canonicalName });
      
      if (existingCanonical) {
        // If the canonical one already exists, just delete the duplicate raw one to prevent unique key errors
        await BottlePerBox.deleteOne({ _id: existingPerBox._id });
        console.log(`[BottlePerBox] DELETED Duplicate "${rawName}" (Merged into "${canonicalName}")`);
        totalPerBoxModified++;
      } else {
        // If canonical doesn't exist, safely rename it
        await BottlePerBox.updateOne(
          { _id: existingPerBox._id },
          { $set: { bottleName: canonicalName } }
        );
        console.log(`[BottlePerBox] RENAMED "${rawName}" ➔ "${canonicalName}"`);
        totalPerBoxModified++;
      }
    }
  }

  console.log(`\nTotal BottleSpecs modified: ${totalSpecsModified}`);
  console.log(`Total BottlePerBox modified: ${totalPerBoxModified}`);
  process.exit(0);
}

applyCorrections().catch(err => {
  console.error(err);
  process.exit(1);
});

