const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const db = mongoose.connection.db;

  // Find all non-deleted LacquerPlans that require printing (process 'C+P' or 'P')
  const lpsNeedingPrinting = await db.collection('lacquerplans').find({
    isDeleted: false,
    process: { $in: ['C+P', 'P'] }
  }).toArray();
  console.log('Total LacquerPlans with C+P or P:', lpsNeedingPrinting.length);

  // For each one, check if a PrintingPlan exists with lacquerPlanId = lp._id
  let missingCount = 0;
  for (const lp of lpsNeedingPrinting) {
    const pp = await db.collection('printingplans').findOne({
      lacquerPlanId: lp._id,
      isDeleted: false
    });
    if (!pp) {
      missingCount++;
      console.log(`MISSING PP for LP ${lp._id}: date=${lp.planDate?.toISOString().slice(0, 10)}, bottle=${lp.bottleName}, shade=${lp.coatingShade}, orderQty=${lp.orderQty}`);
    }
  }
  console.log(`Total missing PrintingPlans for existing C+P / P LacquerPlans: ${missingCount}`);

  // Also check reverse: PrintingPlans without existing LacquerPlan
  const allPps = await db.collection('printingplans').find({ isDeleted: false }).toArray();
  let orphanPpCount = 0;
  for (const pp of allPps) {
    if (pp.lacquerPlanId) {
      const lp = await db.collection('lacquerplans').findOne({ _id: pp.lacquerPlanId });
      if (!lp) orphanPpCount++;
    }
  }
  console.log(`Total orphan PrintingPlans: ${orphanPpCount}`);

  await mongoose.disconnect();
})();
