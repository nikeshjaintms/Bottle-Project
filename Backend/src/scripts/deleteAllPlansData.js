const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const PrintingPlan = require('../models/PrintingPlan');
const PrintingPlanComponent = require('../models/PrintingPlanComponent');
const LacquerPlan = require('../models/LacquerPlan');

const deleteAllPlansData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        console.log('\n=== Deleting Printing Plan Data ===');
        console.log('Deleting all PrintingPlan documents...');
        const deletedPlans = await PrintingPlan.deleteMany({});
        console.log(`✓ Deleted ${deletedPlans.deletedCount} PrintingPlan records`);

        console.log('Deleting all PrintingPlanComponent documents...');
        const deletedComponents = await PrintingPlanComponent.deleteMany({});
        console.log(`✓ Deleted ${deletedComponents.deletedCount} PrintingPlanComponent records`);

        console.log('\n=== Deleting Lacquer Plan Data ===');
        console.log('Deleting all LacquerPlan documents...');
        const deletedLacquerPlans = await LacquerPlan.deleteMany({});
        console.log(`✓ Deleted ${deletedLacquerPlans.deletedCount} LacquerPlan records`);

        console.log('\n✅ All printing plan and lacquer plan data has been deleted successfully!');
        console.log(`\nTotal deleted:`);
        console.log(`  - PrintingPlan records: ${deletedPlans.deletedCount}`);
        console.log(`  - PrintingPlanComponent records: ${deletedComponents.deletedCount}`);
        console.log(`  - LacquerPlan records: ${deletedLacquerPlans.deletedCount}`);

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deleting plan data:', error.message);
        process.exit(1);
    }
};

deleteAllPlansData();
