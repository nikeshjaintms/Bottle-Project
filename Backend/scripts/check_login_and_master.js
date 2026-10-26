const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });
const Company = require('../src/models/Company');
const Brand = require('../src/models/Brand');
const Variant = require('../src/models/Variant');
const BottlePerBox = require('../src/models/BottlePerBox');
const BottleSpec = require('../src/models/Bottlespecs');
const User = require('../src/models/User');
const jwt = require('jsonwebtoken');

async function main() {
  const uri = (process.env.MONGO_URI || '').replace('localhost', '127.0.0.1') || 'mongodb://127.0.0.1:27017/shayona-production';
  await mongoose.connect(uri);

  // 1. Find or create token for techomax / admin user
  const user = await User.findOne({ email: 'techomax@gmail.com' });
  let token = '';
  if (user) {
    token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    console.log('User found:', user.email, 'Token generated');
  }

  // 2. Find AROMA company
  const aroma = await Company.findOne({ name: { $regex: /^AROMA$/i }, isDeleted: { $ne: true } });
  console.log('AROMA Company:', aroma ? { id: aroma._id, name: aroma.name } : 'Not found');

  // Find another company
  const otherComp = await Company.findOne({ _id: { $ne: aroma?._id }, isDeleted: { $ne: true } });
  console.log('Other Company:', otherComp ? { id: otherComp._id, name: otherComp.name } : 'Not found');

  // 3. Find M-CAFFEINE brand
  const mcaffeine = await Brand.findOne({ name: { $regex: /M-CAFFEINE/i }, isDeleted: { $ne: true } });
  console.log('M-CAFFEINE Brand:', mcaffeine ? { id: mcaffeine._id, name: mcaffeine.name, companyId: mcaffeine.companyId } : 'Not found');

  // Find another brand for AROMA
  const otherBrand = await Brand.findOne({ companyId: aroma?._id, _id: { $ne: mcaffeine?._id }, isDeleted: { $ne: true } });
  console.log('Other Brand for AROMA:', otherBrand ? { id: otherBrand._id, name: otherBrand.name } : 'None');

  // 4. Find 100 ML MICRON BottlePerBox
  const bpb = await BottlePerBox.findOne({
    $or: [
      { bottleName: { $regex: /100\s*ML\s*MICRON/i } },
      { plainBottleName: { $regex: /100\s*ML\s*MICRON/i } }
    ],
    isDeleted: { $ne: true }
  });
  console.log('100 ML MICRON BottlePerBox:', bpb ? { id: bpb._id, bottleName: bpb.bottleName, plainBottleName: bpb.plainBottleName } : 'Not found');

  const activeVars = await Variant.find({ isDeleted: false }).populate('bottleSpecId');
  const forMicron = activeVars.filter(v => v.bottleSpecId && /100\s*ML\s*MICRON/i.test(v.bottleSpecId.bottleName));
  console.log('Active variants for 100 ML MICRON:', forMicron.map(v => ({ id: v._id, name: v.variantName, specId: v.bottleSpecId._id })));






  await mongoose.disconnect();
}

main().catch(console.error);

