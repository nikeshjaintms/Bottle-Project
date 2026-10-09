const mongoose = require('mongoose');
const BottlePerBox = require('../models/BottlePerBox');
const mapping = require('./bottlePerBox.mapping');

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  
  const canonicalNames = Array.from(new Set(Object.values(mapping)));
  
  let newlyCreated = 0;
  let alreadyExisting = 0;

  for (const name of canonicalNames) {
    const existing = await BottlePerBox.findOne({ bottleName: name });
    if (!existing) {
      await BottlePerBox.create({ bottleName: name, bottlePerBox: null });
      newlyCreated++;
    } else {
      alreadyExisting++;
    }
  }

  console.log(`Processed ${canonicalNames.length} canonical names.`);
  console.log(`Newly created: ${newlyCreated}`);
  console.log(`Already existing: ${alreadyExisting}`);

  process.exit(0);
}
seed().catch(err => {
  console.error(err);
  process.exit(1);
});
