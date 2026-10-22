const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const BottlePerBox = require('../models/BottlePerBox');
const mapping = require('./bottlePerBox.mapping');

async function seed() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/shayona-production';
  console.log(`Connecting to database at ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);

  const canonicalNames = Array.from(new Set(Object.values(mapping)));

  let newlyCreated = 0;
  let alreadyExisting = 0;

  for (const name of canonicalNames) {
    const existing = await BottlePerBox.findOne({
      $or: [{ plainBottleName: name }, { bottleName: name }, { bottleNames: name }],
    });
    if (!existing) {
      await BottlePerBox.create({
        plainBottleName: name,
        bottleName: name,
        bottleNames: [name],
        bottlePerBox: null,
      });
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
