const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { chromium } = require('@playwright/test');
const jwt = require('jsonwebtoken');

require('../src/models/role.model');
require('../src/models/permission.model');
const User = require('../src/models/user');

async function debug() {
  await mongoose.connect(process.env.MONGO_URI);
  const adminUser = await User.findOne({ email: 'techomax@gmail.com' }).populate({
    path: 'role',
    populate: { path: 'permissions' }
  }).lean();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const token = jwt.sign({ id: adminUser._id }, 'SECRET_KEY', { expiresIn: '1d' });

  await context.addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' }
  ]);
  await context.addInitScript((u) => {
    localStorage.setItem('user', JSON.stringify(u));
  }, {
    id: adminUser._id,
    email: adminUser.email,
    role: adminUser.role,
    name: adminUser.name || 'Admin'
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5173/lacquer-plan?date=2099-10-30');
  await page.goto('http://localhost:5173/lacquer-plan?date=2099-10-30', { waitUntil: 'networkidle' });
  console.log('Current URL:', page.url());
  await page.waitForTimeout(2000);
  console.log('\nNavigating to target date 2099-11-02...');
  await page.goto('http://localhost:5173/lacquer-plan?date=2099-11-02', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('Target date URL:', page.url());
  const targetHtml = await page.locator('.page-content').innerHTML();
  const hasEmpty = await page.locator('.lacquer-plan-empty-state').count();
  const btnCount = await page.locator('button:has-text("Import Previous Plan")').count();
  console.log(`Has empty state: ${hasEmpty}, Import button count: ${btnCount}`);
  if (btnCount === 0) {
    console.log('Snippet of target page:\n', targetHtml.substring(0, 1000));
  }

  await browser.close();
  await mongoose.disconnect();
}
debug().catch(console.error);
