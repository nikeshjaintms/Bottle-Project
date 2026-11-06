const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

const PrintingPlan = require('../models/PrintingPlan');
const Company = require('../models/Company');
const Brand = require('../models/Brand');

const addSampleData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Get a company
        const company = await Company.findOne({ isDeleted: { $ne: true } });
        if (!company) {
            console.log('No company found. Please create a company first.');
            process.exit(1);
        }

        console.log(`Using company: ${company.name}`);

        // Get a brand (optional)
        const brand = await Brand.findOne({ companyId: company._id, isDeleted: { $ne: true } });

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Create sample data
        const samplePlans = [
            {
                planDate: today,
                companyId: company._id,
                brandId: brand ? brand._id : null,
                bottleName: '100 ML DOMUS',
                brandName: brand ? brand.name : 'Sample Brand',
                coatingShade: 'TR.PINK',
                printingToBeDone: 'FLIRT',
                textColor: 'GOLD ORGANIC',
                orderQty: 1000,
                producedQty: 500,
                balanceToMake: 500,
                boxQty: 200,
                plainBottleStock: 1000,
                dispatchBalance: 0,
                readyBoxes: 2,
                remarks: 'Sample printing plan row',
                isExcelViewOnly: false
            },
            {
                planDate: today,
                companyId: company._id,
                brandId: brand ? brand._id : null,
                bottleName: '50 ML CLASSIC',
                brandName: brand ? brand.name : 'Sample Brand',
                coatingShade: 'TR.BLUE',
                printingToBeDone: 'MYSTIC',
                textColor: 'SILVER FOIL',
                orderQty: 2000,
                producedQty: 1500,
                balanceToMake: 500,
                boxQty: 150,
                plainBottleStock: 2000,
                dispatchBalance: 0,
                readyBoxes: 10,
                remarks: 'Sample printing plan row 2',
                isExcelViewOnly: false
            },
            {
                planDate: today,
                companyId: company._id,
                brandId: brand ? brand._id : null,
                bottleName: '200 ML LUXURY',
                brandName: brand ? brand.name : 'Sample Brand',
                coatingShade: 'PLAIN',
                printingToBeDone: 'PREMIUM',
                textColor: 'WHITE',
                orderQty: 500,
                producedQty: 200,
                balanceToMake: 300,
                boxQty: 300,
                plainBottleStock: 500,
                dispatchBalance: 0,
                readyBoxes: 0,
                remarks: 'Sample plain coating',
                isExcelViewOnly: false
            }
        ];

        console.log(`Adding ${samplePlans.length} sample printing plan records...`);
        const result = await PrintingPlan.insertMany(samplePlans);
        console.log(`✓ Added ${result.length} sample printing plan records`);

        console.log('\n✅ Sample data added successfully!');
        console.log('You can now see data in the Printing Plan list page');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding sample data:', error.message);
        process.exit(1);
    }
};

addSampleData();
