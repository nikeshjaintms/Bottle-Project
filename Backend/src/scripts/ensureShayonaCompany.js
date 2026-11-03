const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const Company = require("../models/Company");
const COMPANY_NAME = "Shayona";

async function ensureShayonaCompany() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Set MONGO_URI or MONGODB_URI before running this script.");
  }

  await mongoose.connect(mongoUri);

  const matchingCompanies = await Company.find({
    name: new RegExp(`^${COMPANY_NAME}$`, "i"),
  }).select("_id name status isDeleted isStockSupplier");

  if (matchingCompanies.length > 1) {
    throw new Error(
      `Found multiple companies matching "${COMPANY_NAME}". Resolve the duplicates before running this script.`
    );
  }

  const existingCompany = matchingCompanies[0];
  if (existingCompany?.isStockSupplier) {
    throw new Error(
      `"${existingCompany.name}" is marked as a stock supplier. Resolve its company role before using it for Lacquer or Printing Plans.`
    );
  }

  if (existingCompany) {
    existingCompany.status = true;
    existingCompany.isDeleted = false;
    await existingCompany.save();
    console.log(`Company "${existingCompany.name}" is active (${existingCompany._id}).`);
    return;
  }

  const company = await Company.create({
    name: COMPANY_NAME,
    status: true,
    isStockSupplier: false,
    isDeleted: false,
  });
  console.log(`Created active company "${company.name}" (${company._id}).`);
}

ensureShayonaCompany()
  .catch((error) => {
    console.error("Could not ensure the Shayona company:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
