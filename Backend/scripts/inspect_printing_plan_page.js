const { chromium } = require('@playwright/test');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({ status: 'active' });
  const role = await db.collection('roles').findOne({ _id: user.role });
  const permissions = role ? await db.collection('permissions').find({ _id: { $in: role.permissions || [] } }).toArray() : [];
  
  const token = jwt.sign({ id: user._id }, 'SECRET_KEY', { expiresIn: '1d' });
  const populatedUser = {
    ...user,
    role: { ...role, permissions }
  };
  await mongoose.disconnect();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: 'token',
      value: token,
      domain: 'localhost',
      path: '/'
    }
  ]);

  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}]`, msg.text());
  });

  page.on('pageerror', err => {
    console.log('[Browser PageError]', err.message, err.stack);
  });

  page.on('request', req => {
    if (req.url().includes('api/')) {
      console.log(`[Request] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('api/printing-plan')) {
      try {
        const text = await res.text();
        console.log(`[Response ${res.status()}] ${res.url()} ->`, text.slice(0, 300));
      } catch(e) {
        console.log(`[Response ${res.status()}] ${res.url()}`);
      }
    } else if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  await page.addInitScript((user) => {
    localStorage.setItem('user', JSON.stringify({
      id: user._id,
      email: user.email,
      name: user.name || '',
      role: user.role
    }));
  }, populatedUser);

  console.log('Navigating to http://localhost:5173/printing-plan (no date filter)...');
  await page.goto('http://localhost:5173/printing-plan', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('Clearing date input to show all data...');
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill('');
  await page.waitForTimeout(2000);

  let initialRows = await page.locator('table.data-table tbody tr').count();
  console.log('Rows before scroll:', initialRows);

  console.log('Scrolling down to trigger infinite scroll for next page...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  let afterScrollRows = await page.locator('table.data-table tbody tr').count();
  console.log('Rows after scroll:', afterScrollRows);

  await page.screenshot({ path: 'Backend/scripts/printing_plan_all_data_scrolled.png', fullPage: true });

  await browser.close();
}

run().catch(console.error);
