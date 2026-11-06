const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const Company = require("../models/Company");
const Brand = require("../models/Brand");
const BottleSpec = require("../models/Bottlespecs");
const BottlePerBox = require("../models/BottlePerBox");

const COMPANY_NAME = "Shayona";
const BRAND_NAME = "SHAYONA";

async function setupShayonaForPlans() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Set MONGO_URI or MONGODB_URI before running this script.");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  // 1. Find or create Company "Shayona"
  let company = await Company.findOne({
    name: new RegExp(`^${COMPANY_NAME}$`, "i")
  });

  if (!company) {
    company = await Company.create({
      name: COMPANY_NAME,
      status: true,
      isStockSupplier: false,
      isDeleted: false
    });
    console.log(`Created Company "${company.name}" (${company._id}).`);
  } else {
    company.status = true;
    company.isDeleted = false;
    company.isStockSupplier = false; // Must be false so it's treated as a plan/production client
    await company.save();
    console.log(`Updated Company "${company.name}" (${company._id}) -> isStockSupplier: false, status: active.`);
  }

  // 2. Find or create Brand "SHAYONA"
  let brand = await Brand.findOne({
    companyId: company._id,
    name: new RegExp(`^${BRAND_NAME}$`, "i")
  });

  if (!brand) {
    brand = await Brand.create({
      companyId: company._id,
      name: BRAND_NAME,
      status: true,
      isDeleted: false
    });
    console.log(`Created Brand "${brand.name}" (${brand._id}) under Company "${company.name}".`);
  } else {
    brand.status = true;
    brand.isDeleted = false;
    await brand.save();
    console.log(`Brand "${brand.name}" (${brand._id}) is active.`);
  }

  // 3. Link master bottles into BottleSpecs for this Brand so options appear in dropdowns
  const bpbs = await BottlePerBox.find({ isDeleted: { $ne: true } }).lean();
  console.log(`Found ${bpbs.length} master bottle(s) in BottlePerBox.`);

  let createdSpecsCount = 0;
  for (const bpb of bpbs) {
    const bottleName = (bpb.plainBottleName || bpb.bottleName || "").trim();
    if (!bottleName) continue;

    const existingSpec = await BottleSpec.findOne({
      brandId: brand._id,
      bottleName: new RegExp(`^${bottleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      isDeleted: { $ne: true }
    });

    if (!existingSpec) {
      await BottleSpec.create({
        companyId: company._id,
        brandId: brand._id,
        bottleName: bottleName,
        bottlePerBox: bpb.bottlePerBox || null,
        status: true,
        isDeleted: false,
        isCoating: true,
        isPrinting: true
      });
      createdSpecsCount++;
    }
  }

  console.log(`Linked ${createdSpecsCount} new BottleSpec(s) to Brand "${brand.name}".`);
  console.log("\nSetup complete! Company, Brand, and Bottle options are now available for Shayona in Lacquer and Printing Plans.");
}

setupShayonaForPlans()
  .catch((error) => {
    console.error("Setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

