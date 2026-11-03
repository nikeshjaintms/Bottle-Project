const mongoose = require('mongoose');
const http = require('http');
const jwt = require('jsonwebtoken');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  console.log('Connected to MongoDB');

  const PrintingPlan = mongoose.model('PrintingPlan', new mongoose.Schema({}, { strict: false }));
  const totalCount = await PrintingPlan.countDocuments({ isDeleted: false });
  console.log('Total non-deleted PrintingPlans:', totalCount);

  // Group by planDate to see dates where printing plans exist
  const dateCounts = await PrintingPlan.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$planDate" } }, count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 10 }
  ]);
  console.log('Recent dates with printing plans:', dateCounts);

  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const user = await User.findOne({ status: 'active' });
  const token = jwt.sign({ id: user._id }, 'SECRET_KEY', { expiresIn: '1d' });

  // Test API calls
  async function testApi(url) {
    return new Promise((resolve) => {
      http.get({
        hostname: 'localhost',
        port: 5000,
        path: url,
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch(e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }).on('error', err => resolve({ error: err.message }));
    });
  }

  // 1. Check with today's date
  const todayStr = new Date().toISOString().split('T')[0];
  console.log('\nTesting /api/printing-plan/paginated?date=' + todayStr);
  const resToday = await testApi(`/api/printing-plan/paginated?date=${todayStr}`);
  console.log('Status:', resToday.status);
  console.log('Items count:', resToday.data?.data?.items?.length);
  if (resToday.data?.data?.items?.length === 0) {
    console.log('Items is empty for today:', todayStr);
  }
  if (!resToday.data?.success) {
    console.log('Response error:', resToday);
  }

  // 2. Check with most recent date from DB
  if (dateCounts.length > 0) {
    const recentDate = dateCounts[0]._id;
    console.log(`\nTesting /api/printing-plan/paginated?date=${recentDate}`);
    const resRecent = await testApi(`/api/printing-plan/paginated?date=${recentDate}`);
    console.log('Status:', resRecent.status);
    console.log('Items count:', resRecent.data?.data?.items?.length);
    if (!resRecent.data?.success) {
      console.log('Response error:', resRecent);
    }
  }

  // 3. Check without date
  console.log('\nTesting /api/printing-plan/paginated without date');
  const resAll = await testApi('/api/printing-plan/paginated');
  console.log('Status:', resAll.status);
  console.log('Items count:', resAll.data?.data?.items?.length);
  if (!resAll.data?.success) {
    console.log('Response error:', resAll);
  }

  // 4. Check /api/printing-plan/totals
  console.log('\nTesting /api/printing-plan/totals');
  const resTotals = await testApi('/api/printing-plan/totals');
  console.log('Totals status:', resTotals.status, 'data:', resTotals.data);

  await mongoose.disconnect();
}

run().catch(console.error);
