const mongoose = require('mongoose');

(async () => {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const db = mongoose.connection.db;

  const lpToday = await db.collection('lacquerplans').find({
    planDate: { $gte: new Date('2026-11-03T00:00:00.000Z'), $lte: new Date('2026-11-03T23:59:59.999Z') },
    isDeleted: false
  }).toArray();
  console.log('Today (2026-11-03) lacquer plans count:', lpToday.length);
  const processes = {};
  lpToday.forEach(p => { processes[p.process] = (processes[p.process] || 0) + 1; });
  console.log('Processes on 2026-11-03:', processes);

  const ppToday = await db.collection('printingplans').find({
    planDate: { $gte: new Date('2026-11-03T00:00:00.000Z'), $lte: new Date('2026-11-03T23:59:59.999Z') },
    isDeleted: false
  }).toArray();
  console.log('Today (2026-11-03) printing plans count:', ppToday.length);

  // Check 2026-11-02
  const lpYesterday = await db.collection('lacquerplans').find({
    planDate: { $gte: new Date('2026-11-02T00:00:00.000Z'), $lte: new Date('2026-11-02T23:59:59.999Z') },
    isDeleted: false
  }).toArray();
  console.log('Yesterday (2026-11-02) lacquer plans count:', lpYesterday.length);

  const ppYesterday = await db.collection('printingplans').find({
    planDate: { $gte: new Date('2026-11-02T00:00:00.000Z'), $lte: new Date('2026-11-02T23:59:59.999Z') },
    isDeleted: false
  }).toArray();
  console.log('Yesterday (2026-11-02) printing plans count:', ppYesterday.length);

  // Check ALL dates for printing plans (including deleted or any status)
  const allPp = await db.collection('printingplans').find({}).toArray();
  console.log('Total printing plans in DB:', allPp.length);
  const ppByDate = {};
  allPp.forEach(p => {
    const d = p.planDate ? new Date(p.planDate).toISOString().slice(0, 10) : 'NO_DATE';
    ppByDate[d] = (ppByDate[d] || 0) + 1;
  });
  console.log('Printing plans by date (all records):', ppByDate);

  await mongoose.disconnect();
})();
