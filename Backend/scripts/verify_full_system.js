const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const { chromium } = require('@playwright/test');

const MONGO_URI = 'mongodb://localhost:27017/shayona-production';
const JWT_SECRET = 'SECRET_KEY';
const BASE_FRONTEND = 'http://localhost:5173';
const BASE_BACKEND_PORT = 5000;

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function run() {
  console.log('=== LACQUER PLAN VERIFICATION SUITE ===');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const lpCol = db.collection('lacquerplans');
  const ppCol = db.collection('printingplans');
  const rtdCol = db.collection('readytodispatches');
  const pbsCol = db.collection('plainbottlestocks');
  const userCol = db.collection('users');
  const roleCol = db.collection('roles');
  const permCol = db.collection('permissions');

  // 1. Record baseline counts
  const initialCounts = {
    lacquerPlans: await lpCol.countDocuments(),
    printingPlans: await ppCol.countDocuments(),
    readyToDispatch: await rtdCol.countDocuments(),
    plainBottleStocks: await pbsCol.countDocuments()
  };
  console.log('Initial DB counts:', initialCounts);

  // 2. Fetch active admin / operator user with populated permissions
  const rawUser = await userCol.findOne({ email: 'operator1@gmail.com', status: 'active' }) || await userCol.findOne({ status: 'active' });
  if (!rawUser) throw new Error('No active user found');

  const rawRole = await roleCol.findOne({ _id: rawUser.role });
  const rawPerms = rawRole ? await permCol.find({ _id: { $in: rawRole.permissions || [] } }).toArray() : [];
  const populatedUser = {
    ...rawUser,
    role: {
      ...rawRole,
      permissions: rawPerms
    }
  };

  const token = jwt.sign({ id: rawUser._id }, JWT_SECRET, { expiresIn: '1d' });
  console.log('Generated token for user:', rawUser.email);

  // 3. Test HTTP API: /api/bottle-spec and /api/bottle-specs
  console.log('\n--- Step 1: Testing BottleSpec API Endpoints ---');
  const specRes1 = await makeRequest({
    hostname: 'localhost',
    port: BASE_BACKEND_PORT,
    path: '/api/bottle-spec?bottleName=8%20ML%20SQ%20ROLL%20ON',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('GET /api/bottle-spec status:', specRes1.status);
  if (specRes1.status !== 200) throw new Error(`GET /api/bottle-spec failed with status ${specRes1.status}`);

  const specRes2 = await makeRequest({
    hostname: 'localhost',
    port: BASE_BACKEND_PORT,
    path: '/api/bottle-specs',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('GET /api/bottle-specs status:', specRes2.status);
  if (specRes2.status !== 200) throw new Error(`GET /api/bottle-specs failed with status ${specRes2.status}`);

  // 4. Test HTTP API: PUT /api/lacquer-plan/:id with populated stockAllocation
  console.log('\n--- Step 2: Testing PUT /api/lacquer-plan/:id with populated stockAllocation ---');
  const testPlan = await lpCol.findOne({ _id: new mongoose.Types.ObjectId('6ae9b570be58ab5fa38a458a') });
  if (!testPlan) throw new Error('Plan 6ae9b570be58ab5fa38a458a not found');

  const putPayload = {
    date: testPlan.date,
    bottleName: testPlan.bottleName,
    companyId: testPlan.companyId?.toString(),
    coatingShade: testPlan.coatingShade,
    brandId: testPlan.brandId?.toString(),
    variantId: testPlan.variantId?.toString(),
    processType: testPlan.processType,
    orderQty: testPlan.orderQty,
    coatedQty: testPlan.coatedQty || 0,
    stockAllocation: (testPlan.stockAllocation || []).map(a => ({
      companyId: { _id: a.companyId, name: 'Sample Supplier Company' }, // populated object
      qty: a.qty
    })),
    stockSources: (testPlan.stockSources || []).map(s => ({
      _id: s,
      name: 'Sample Supplier Company'
    })),
    stockWarningAcknowledged: true
  };

  const putRes = await makeRequest({
    hostname: 'localhost',
    port: BASE_BACKEND_PORT,
    path: `/api/lacquer-plan/${testPlan._id}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, putPayload);

  console.log('PUT /api/lacquer-plan status:', putRes.status);
  if (putRes.status !== 200 || !putRes.data?.success) {
    throw new Error(`PUT /api/lacquer-plan failed: ${putRes.raw}`);
  }
  console.log('PUT /api/lacquer-plan succeeded with success: true (No BSONError)');

  // 5. Real Browser UI Test via Playwright
  console.log('\n--- Step 3: Running Real UI Test via Playwright ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set auth cookie and user in localStorage
  await context.addCookies([
    {
      name: 'token',
      value: token,
      domain: 'localhost',
      path: '/'
    }
  ]);

  const page = await context.newPage();

  // Track any console errors or 4xx/5xx requests
  const trackedErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore favicon or non-critical 3rd party warnings
      if (!txt.includes('favicon.ico') && !txt.includes('chrome-extension')) {
        trackedErrors.push(`[Console Error] ${txt}`);
      }
    }
  });

  page.on('pageerror', err => {
    trackedErrors.push(`[Page Error] ${err.message}`);
  });

  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400 && !url.includes('favicon.ico')) {
      trackedErrors.push(`[HTTP ${status}] ${url}`);
    }
  });

  // Inject localStorage user before navigation
  await page.addInitScript((user) => {
    localStorage.setItem('user', JSON.stringify({
      id: user._id,
      email: user.email,
      name: user.name || '',
      role: user.role
    }));
  }, populatedUser);

  // Navigate to Lacquer Plan list
  console.log('Navigating to http://localhost:5173/lacquer-plan ...');
  await page.goto(`${BASE_FRONTEND}/lacquer-plan`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if rows are rendered
  const rows = await page.locator('table tbody tr');
  const rowCount = await rows.count();
  console.log(`Lacquer Plan table rendered with ${rowCount} rows`);
  if (rowCount === 0) {
    throw new Error('FAIL: Table has 0 rows');
  }

  // Check yellow cell rendering (stock shortfall)
  const yellowCells = await page.locator('td.bg-warning, td[style*="background-color: yellow"], td[style*="#f59e0b"], td[style*="#eab308"], td[style*="rgb(234, 179, 8)"], td[style*="rgb(245, 158, 11)"], td[style*="background: rgb(245, 158, 11)"]').count();
  console.log(`Found ${yellowCells} yellow stock warning indicators in the table`);

  // Navigate to Add Lacquer Plan form
  console.log('Navigating to Add Lacquer Plan form ...');
  await page.goto(`${BASE_FRONTEND}/lacquer-plan/add`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const addFormHeading = await page.locator('h1, h2, h3, h4, .page-title').first().textContent().catch(() => '');
  console.log('Add page title/heading:', addFormHeading?.trim());

  // Filter out any known non-fatal errors if any, but ensure NO bottle-spec 404 or BSON 400 occurred
  const fatalErrors = trackedErrors.filter(e => 
    e.includes('bottle-spec') || 
    e.includes('Argument passed in does not match') || 
    e.includes('planSources is not defined')
  );

  console.log('Tracked fatal errors (should be 0):', fatalErrors.length);
  if (fatalErrors.length > 0) {
    console.error('Fatal errors detected:', fatalErrors);
    throw new Error(`FAIL: Detected ${fatalErrors.length} fatal errors during UI navigation`);
  }

  await browser.close();
  console.log('Browser closed cleanly');

  // 6. Verify DB counts before and after
  console.log('\n--- Step 4: Verifying Final DB Counts ---');
  const finalCounts = {
    lacquerPlans: await lpCol.countDocuments(),
    printingPlans: await ppCol.countDocuments(),
    readyToDispatch: await rtdCol.countDocuments(),
    plainBottleStocks: await pbsCol.countDocuments()
  };
  console.log('Final DB counts:', finalCounts);

  const hasDiff = 
    finalCounts.lacquerPlans !== initialCounts.lacquerPlans ||
    finalCounts.printingPlans !== initialCounts.printingPlans ||
    finalCounts.readyToDispatch !== initialCounts.readyToDispatch ||
    finalCounts.plainBottleStocks !== initialCounts.plainBottleStocks;

  if (hasDiff) {
    throw new Error(`DB counts changed during test! Initial: ${JSON.stringify(initialCounts)}, Final: ${JSON.stringify(finalCounts)}`);
  }
  console.log('DB counts perfectly preserved (0 drift)');

  await mongoose.disconnect();
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

