const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const { chromium } = require('@playwright/test');
const fs = require('fs');
const axios = require('axios');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

require('../src/models/role.model');
require('../src/models/permission.model');
const User = require('../src/models/user');
const Company = require('../src/models/Company');
const Brand = require('../src/models/Brand');
const Variant = require('../src/models/Variant');
const BottlePerBox = require('../src/models/BottlePerBox');
const LacquerPlan = require('../src/models/LacquerPlan');
const ReadyToDispatch = require('../src/models/ReadyToDispatch');

const screenshotDir = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runStep1() {
  console.log('=== STEP 1: REPRODUCTION SCRIPT (CURRENT BEHAVIOR) ===');
  await mongoose.connect(process.env.MONGO_URI);

  const adminUser = await User.findOne({ email: 'techomax@gmail.com' }).populate({
    path: 'role',
    populate: { path: 'permissions' }
  }).lean();
  if (!adminUser) {
    throw new Error('Admin user not found');
  }

  const tppCompany = await Company.findById('6a17e8ede933dc474615eb96').lean();
  const brand = await Brand.findById('6a729cf48f067263d707e0c1').lean(); // ADORE
  const variant = await Variant.findOne({ isDeleted: false }).lean();
  const bottle = await BottlePerBox.findOne({ isDeleted: false }).lean();

  const sourceDateStr = '2099-10-30';
  const targetDateStr = '2099-11-02';
  const sourceDate = new Date(`${sourceDateStr}T00:00:00.000Z`);
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  // Clean prior test data for these dates
  await LacquerPlan.deleteMany({
    planDate: {
      $gte: new Date('2099-10-01T00:00:00.000Z'),
      $lte: new Date('2099-11-30T23:59:59.999Z')
    }
  });
  await ReadyToDispatch.deleteMany({
    dispatchDate: {
      $gte: new Date('2099-10-01T00:00:00.000Z'),
      $lte: new Date('2099-11-30T23:59:59.999Z')
    }
  });

  console.log('Seeding 5 test rows on source date:', sourceDateStr);
  const rows = [
    {
      planDate: sourceDate,
      bottleName: bottle?.bottleName || '10 ML VIAL',
      plainBottleId: bottle?._id,
      companyId: tppCompany._id,
      companyName: tppCompany.name,
      brandId: brand._id,
      brandName: brand.name,
      variantId: variant._id,
      variantName: variant.variantName,
      coatingShade: 'BLACK',
      process: 'C',
      orderQty: 10000,
      coatingCompletedQty: 10000,
      balanceToMake: 0,
      boxQty: 50,
      noOfBoxes: 200,
      status: true
    },
    {
      planDate: sourceDate,
      bottleName: bottle?.bottleName || '10 ML VIAL',
      plainBottleId: bottle?._id,
      companyId: tppCompany._id,
      companyName: tppCompany.name,
      brandId: brand._id,
      brandName: brand.name,
      variantId: variant._id,
      variantName: variant.variantName,
      coatingShade: 'RED',
      process: 'C',
      orderQty: 10000,
      coatingCompletedQty: 5000,
      balanceToMake: -5000,
      boxQty: 50,
      noOfBoxes: 200,
      status: true
    },
    {
      planDate: sourceDate,
      bottleName: bottle?.bottleName || '10 ML VIAL',
      plainBottleId: bottle?._id,
      companyId: tppCompany._id,
      companyName: tppCompany.name,
      brandId: brand._id,
      brandName: brand.name,
      variantId: variant._id,
      variantName: variant.variantName,
      coatingShade: 'BLUE',
      process: 'C',
      orderQty: 8000,
      coatingCompletedQty: 0,
      balanceToMake: -8000,
      boxQty: 50,
      noOfBoxes: 160,
      status: true
    },
    {
      planDate: sourceDate,
      bottleName: bottle?.bottleName || '10 ML VIAL',
      plainBottleId: bottle?._id,
      companyId: tppCompany._id,
      companyName: tppCompany.name,
      brandId: brand._id,
      brandName: brand.name,
      variantId: variant._id,
      variantName: variant.variantName,
      coatingShade: 'GREEN',
      process: 'C+P',
      orderQty: 8000,
      coatingCompletedQty: 3000,
      balanceToMake: -5000,
      boxQty: 50,
      noOfBoxes: 160,
      status: true
    },
    {
      planDate: sourceDate,
      bottleName: bottle?.bottleName || '10 ML VIAL',
      plainBottleId: bottle?._id,
      companyId: tppCompany._id,
      companyName: tppCompany.name,
      brandId: brand._id,
      brandName: brand.name,
      variantId: variant._id,
      variantName: variant.variantName,
      coatingShade: 'WHITE',
      process: 'C',
      orderQty: 10000,
      coatingCompletedQty: 11000,
      balanceToMake: 1000,
      boxQty: 50,
      noOfBoxes: 200,
      status: true
    }
  ];

  const createdSourceRows = await LacquerPlan.insertMany(rows);
  console.log(`Seeded ${createdSourceRows.length} source rows.`);

  console.log('\n--- Launching Playwright to test current UI ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const token = jwt.sign({ id: adminUser._id }, 'SECRET_KEY', { expiresIn: '1d' });
  await context.addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' }
  ]);
  await context.addInitScript((u) => {
    localStorage.setItem('user', JSON.stringify(u));
  }, {
    id: adminUser._id.toString(),
    _id: adminUser._id.toString(),
    email: adminUser.email,
    role: adminUser.role,
    name: adminUser.name || 'Admin'
  });

  const page = await context.newPage();

  // 1. Navigate to source date
  console.log('Navigating to source date:', sourceDateStr);
  await page.goto(`http://localhost:5173/lacquer-plan?date=${sourceDateStr}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table.data-table tbody tr');
  await page.screenshot({ path: path.join(screenshotDir, '01_source_date_list.png'), fullPage: true });
  console.log('Captured screenshot 01_source_date_list.png');

  // 2. Open Actions on source row 2 (5000 coated of 10000, RED)
  console.log('Opening Actions popup on source row 2 (5000 coated)...');
  const row2Tr = page.locator('tr:has-text("RED")');
  const row2ActionBtn = row2Tr.locator('button[title*="Actions"], button[title*="Ready To Dispatch"], button:has(.bi-send)');
  const isRow2Visible = await row2ActionBtn.isVisible();
  console.log(`Row 2 Actions button visible on source date: ${isRow2Visible}`);
  if (isRow2Visible) {
    await row2ActionBtn.click();
    await page.waitForSelector('.swal2-popup');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotDir, '02_source_row2_actions_popup.png') });
    console.log('Captured screenshot 02_source_row2_actions_popup.png');

    const popupHtml = await page.locator('.swal2-html-container').innerHTML();
    console.log('Actions popup HTML snippet:\n', popupHtml.substring(0, 300));

    // Cancel modal
    const cancelBtn = page.locator('.swal2-cancel');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 3. Navigate to target date
  console.log('\nNavigating to target date:', targetDateStr);
  await page.goto(`http://localhost:5173/lacquer-plan?date=${targetDateStr}`, { waitUntil: 'networkidle' });
  const importBtn = page.locator('button:has-text("Import Previous Plan")');
  await importBtn.waitFor({ state: 'visible', timeout: 10000 });
  await importBtn.click();

  // 4. Fill source date in modal
  console.log('Filling source date in import modal:', sourceDateStr);
  const sourceDateInput = page.locator('#swal-source-date');
  await sourceDateInput.waitFor({ state: 'visible', timeout: 5000 });
  await sourceDateInput.fill(sourceDateStr);
  await page.screenshot({ path: path.join(screenshotDir, '03_import_date_prompt.png') });
  console.log('Captured screenshot 03_import_date_prompt.png');

  const confirmImportBtn = page.locator('.swal2-confirm');
  await confirmImportBtn.click();

  // Wait for import result swal
  await page.waitForSelector('.swal2-title', { timeout: 15000 });
  const swalTitle = await page.locator('.swal2-title').innerText();
  const swalContent = await page.locator('.swal2-html-container').innerText().catch(() => '');
  console.log(`Swal title after import: "${swalTitle}"`);
  console.log(`Swal text after import: "${swalContent}"`);

  // Dismiss swal
  const okBtn = page.locator('.swal2-confirm');
  if (await okBtn.isVisible()) {
    await okBtn.click();
    await page.waitForTimeout(1000);
  }

  // 5. Screenshot target date list after import
  await page.waitForSelector('table.data-table tbody tr', { timeout: 10000 });
  await page.screenshot({ path: path.join(screenshotDir, '04_target_date_after_first_import.png'), fullPage: true });
  console.log('Captured screenshot 04_target_date_after_first_import.png');

  // 6. Inspect Raw Driver records on target date
  console.log('\n--- Checking Target Date records from MongoDB ---');
  const targetPlans = await LacquerPlan.find({
    planDate: {
      $gte: new Date(`${targetDateStr}T00:00:00.000Z`),
      $lte: new Date(`${targetDateStr}T23:59:59.999Z`)
    }
  }).lean();
  console.log(`Target date plans count: ${targetPlans.length}`);
  for (const tp of targetPlans) {
    console.log(`  Shade: ${tp.coatingShade}, Process: ${tp.process}, Order: ${tp.orderQty}, Coated: ${tp.coatingCompletedQty}, Balance: ${tp.balanceToMake}, fromId: ${tp.importedFromId}`);
  }

  // 7. Inspect Ready To Dispatch records from Raw Driver
  console.log('\n--- Checking Ready To Dispatch records created during import ---');
  const rtdSheets = await ReadyToDispatch.find({
    isDeleted: false,
    $or: [
      { dispatchDate: { $gte: new Date('2099-10-01T00:00:00.000Z'), $lte: new Date('2099-11-30T23:59:59.999Z') } },
      { 'groups.plainBottleName': bottle?.bottleName || '10 ML VIAL' }
    ]
  }).lean();
  let rtdLines = [];
  for (const s of rtdSheets) {
    for (const g of (s.groups || [])) {
      for (const l of (g.variantLines || [])) {
        if (!l.isDeleted) rtdLines.push({ sheetId: s._id, desc: l.description, qty: l.producedQty, sourcePlanId: l.sourcePlanId });
      }
    }
  }
  console.log(`Ready To Dispatch lines created during import: ${rtdLines.length}`);
  for (const l of rtdLines) {
    console.log(`  Line: ${l.desc}, Qty: ${l.qty}, sourcePlanId: ${l.sourcePlanId}`);
  }

  // 8. Check Actions button on Target Date for row 3 (BLUE, 0 coated, order 8000)
  console.log('\n--- Checking Actions button on Target Date for BLUE (0 coated) ---');
  const blueRowTr = page.locator('tr:has-text("BLUE")');
  const isBlueRowInDOM = await blueRowTr.count();
  console.log('BLUE row count in target table:', isBlueRowInDOM);
  if (isBlueRowInDOM > 0) {
    const blueActionBtn = blueRowTr.locator('button:has(.bi-send)');
    const isBlueBtnVisible = await blueActionBtn.isVisible().catch(() => false);
    const isBlueBtnDisabled = await blueActionBtn.isDisabled().catch(() => false);
    const blueBtnTitle = await blueActionBtn.getAttribute('title').catch(() => '');
    console.log(`BLUE row Actions button: visible=${isBlueBtnVisible}, disabled=${isBlueBtnDisabled}, title="${blueBtnTitle}"`);

    await page.screenshot({ path: path.join(screenshotDir, '05_target_row3_actions_button.png') });
    console.log('Captured screenshot 05_target_row3_actions_button.png');
  }

  // 9. Check re-import behavior
  console.log('\n--- Checking Re-import Behavior ---');
  const isImportBtnVisibleWhenRowsExist = await page.locator('button:has-text("Import Previous Plan")').isVisible().catch(() => false);
  console.log('Is "Import Previous Plan" button visible when rows exist on target date?', isImportBtnVisibleWhenRowsExist);

  // Trigger re-import via API with mode 'without_changes'
  console.log('Triggering re-import with mode without_changes via API...');
  const reimportRes = await axios.post('http://localhost:5000/api/lacquer-plan/import-previous', {
    targetDate: targetDateStr,
    sourceDate: sourceDateStr,
    importMode: 'without_changes'
  }, {
    headers: { Cookie: `token=${token}` }
  });
  console.log('Re-import API result:', reimportRes.data);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(screenshotDir, '07_target_after_reimport_without_changes.png'), fullPage: true });
  console.log('Captured screenshot 07_target_after_reimport_without_changes.png');

  await browser.close();
  await mongoose.disconnect();
  console.log('\n=== STEP 1 EXECUTION COMPLETE ===');
}

runStep1().catch((err) => {
  console.error('STEP 1 Error:', err);
  process.exit(1);
});
