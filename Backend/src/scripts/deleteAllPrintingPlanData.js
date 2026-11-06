const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const PrintingPlan = require('../models/PrintingPlan');
const PrintingPlanComponent = require('../models/PrintingPlanComponent');

const deleteAllPrintingPlanData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        console.log('Deleting all PrintingPlan documents...');
        const deletedPlans = await PrintingPlan.deleteMany({});
        console.log(`✓ Deleted ${deletedPlans.deletedCount} PrintingPlan records`);

        console.log('Deleting all PrintingPlanComponent documents...');
        const deletedComponents = await PrintingPlanComponent.deleteMany({});
        console.log(`✓ Deleted ${deletedComponents.deletedCount} PrintingPlanComponent records`);

        console.log('\n✅ All printing plan data has been deleted successfully!');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error deleting printing plan data:', error.message);
        process.exit(1);
    }
};

deleteAllPrintingPlanData();
