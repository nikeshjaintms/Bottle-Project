/**
 * CLEANUP SCRIPT: Delete ALL records from LacquerPlan and PrintingPlan collections
 * 
 * WARNING: This will permanently delete all data!
 * 
 * Usage:
 * node Backend/scripts/clearLacquerPrintingPlans.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const LacquerPlan = require('../src/models/LacquerPlan');
const PrintingPlan = require('../src/models/PrintingPlan');
const PrintingPlanComponent = require('../src/models/PrintingPlanComponent');

async function clearAllData() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✅ Connected to MongoDB\n');

    // Delete PrintingPlanComponent first (references PrintingPlan)
    console.log('🗑️  Deleting all PrintingPlanComponent records...');
    const componentResult = await PrintingPlanComponent.deleteMany({});
    console.log(`   ✅ Deleted ${componentResult.deletedCount} PrintingPlanComponent records\n`);

    // Delete PrintingPlan
    console.log('🗑️  Deleting all PrintingPlan records...');
    const printingResult = await PrintingPlan.deleteMany({});
    console.log(`   ✅ Deleted ${printingResult.deletedCount} PrintingPlan records\n`);

    // Delete LacquerPlan
    console.log('🗑️  Deleting all LacquerPlan records...');
    const lacquerResult = await LacquerPlan.deleteMany({});
    console.log(`   ✅ Deleted ${lacquerResult.deletedCount} LacquerPlan records\n`);

    console.log('═══════════════════════════════════════════');
    console.log('✅ CLEANUP COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log(`
Summary:
  • LacquerPlan records deleted:    ${lacquerResult.deletedCount}
  • PrintingPlan records deleted:   ${printingResult.deletedCount}
  • PrintingPlanComponent deleted:  ${componentResult.deletedCount}
  
Total records deleted: ${lacquerResult.deletedCount + printingResult.deletedCount + componentResult.deletedCount}
    `);

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nStack:', error.stack);
    
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    
    process.exit(1);
  }
}

// Run the cleanup
clearAllData();
