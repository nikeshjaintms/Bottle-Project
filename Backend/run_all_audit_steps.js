const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const WebSocket = require('./node_modules/ws');

const ARTIFACT_DIR = 'C:\\Users\\prabh\\.gemini\\antigravity-ide\\brain\\af9e36ea-2931-4d12-bb2d-44e65a25a3be';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function runAudit() {
  console.log('=== Step 0: DB Setup on 2026-11-20 ===');
  await mongoose.connect('mongodb://localhost:27017/shayona-production');
  const Company = require('./src/models/Company');
  const Brand = require('./src/models/Brand');
  const BottlePerBox = require('./src/models/BottlePerBox');
  const BottleSpec = require('./src/models/Bottlespecs');
  const Variant = require('./src/models/Variant');
  const Incoming = require('./src/models/Incoming');
  const LacquerPlan = require('./src/models/LacquerPlan');
  const PrintingPlan = require('./src/models/PrintingPlan');
  const { recomputePlainStock, computeLivePlainStock } = require('./src/utils/stockRecompute');

  const comp = await Company.findOne({ name: 'TPP', isDeleted: { $ne: true } });
  const beardo = await Brand.findOne({ name: 'BEARDO', isDeleted: { $ne: true } });
  const majestic = await Brand.findOne({ name: 'MAJESTIC', isDeleted: { $ne: true } });

  const testDate = new Date('2026-11-20T00:00:00.000Z');
  const startOfDay = new Date(testDate); startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(testDate); endOfDay.setUTCHours(23, 59, 59, 999);

  await LacquerPlan.deleteMany({ planDate: { $gte: startOfDay, $lte: endOfDay } });
  await PrintingPlan.deleteMany({ planDate: { $gte: startOfDay, $lte: endOfDay } });
  await Incoming.deleteMany({ documentDate: { $gte: startOfDay, $lte: endOfDay } });

  let bpb = await BottlePerBox.findOne({ plainBottleName: '100 ML DOMUSH', isDeleted: false });
  await Incoming.create({
    documentDate: testDate,
    billToId: comp._id,
    deliveryNumber: 'INC_AUDIT_' + Date.now(),
    items: [{
      bottleId: bpb._id,
      qty: 1000,
      box: 10,
      totalQty: 1000
    }],
    status: true,
    createdBy: new mongoose.Types.ObjectId('6a1fc6554dc009b52cdedc6b'),
    isDeleted: false
  });
  await recomputePlainStock(bpb._id, comp._id);
  const initStock = await computeLivePlainStock('100 ML DOMUSH', comp._id, testDate);
  console.log('DB Initial Plain Stock on 2026-11-20:', initStock);
  await mongoose.disconnect();

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\prabh\\AppData\\Local\\Temp\\chrome_audit_full_' + Date.now();

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    'http://localhost:5173'
  ]);

  await delay(2500);

  const testResults = [];

  try {
    const version = await httpGet('http://localhost:9222/json/version');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise(resolve => ws.on('open', resolve));

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const id = msgId++;
        const handler = msg => {
          const res = JSON.parse(msg);
          if (res.id === id) {
            ws.off('message', handler);
            resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    const target = await send('Target.createTarget', { url: 'http://localhost:5173/login' });
    const pageWs = new WebSocket(`ws://localhost:9222/devtools/page/${target.targetId}`);
    await new Promise(resolve => pageWs.on('open', resolve));

    function sendPage(method, params = {}) {
      return new Promise(resolve => {
        const id = msgId++;
        const handler = msg => {
          const res = JSON.parse(msg);
          if (res.id === id) {
            pageWs.off('message', handler);
            resolve(res.result);
          }
        };
        pageWs.on('message', handler);
        pageWs.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendPage('Page.enable');
    await sendPage('Runtime.enable');
    await sendPage('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1100, deviceScaleFactor: 1, mobile: false });

    await delay(1500);

    // Login
    console.log('Logging in...');
    await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const emailInput = document.querySelector('input[type="email"]');
          const passInput = document.querySelector('input[type="password"]');
          const submitBtn = document.querySelector('button[type="submit"]');
          const setVal = (el, val) => {
            const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            proto.set.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };
          setVal(emailInput, 'techomax@gmail.com');
          setVal(passInput, 'admin123');
          submitBtn.click();
        })()
      `
    });

    await delay(2500);

    // Navigate to /lacquer-plan/add
    await sendPage('Runtime.evaluate', { expression: 'window.location.href = "/lacquer-plan/add"' });
    await delay(3000);

    // Browser helpers
    await sendPage('Runtime.evaluate', {
      expression: `
        window.__audit = {
          setNativeValue(element, value) {
            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value') ?
              Object.getOwnPropertyDescriptor(element, 'value').set :
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            const prototype = Object.getPrototypeOf(element);
            const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
            if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
              prototypeValueSetter.call(element, value);
            } else {
              valueSetter.call(element, value);
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          },
          async selectReactSelect(controlElement, targetText) {
            controlElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            const options = Array.from(document.querySelectorAll('[class*="-option"]'));
            const matched = options.find(o => o.textContent.trim().toUpperCase() === targetText.trim().toUpperCase());
            if (matched) {
              matched.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              matched.click();
              await new Promise(r => setTimeout(r, 400));
              return true;
            }
            return false;
          },
          getRow(tableIndex, rowIndex = 0) {
            const tables = document.querySelectorAll('table');
            const table = tables[tableIndex];
            if (!table) return null;
            const tr = table.querySelectorAll('tbody tr')[rowIndex];
            if (!tr) return null;
            const numInputs = tr.querySelectorAll('input[type="number"]');
            const processSelect = tr.querySelector('select');
            const badge = tr.querySelector('.badge.bg-success');
            return {
              tr,
              plainStock: numInputs[0],
              orderQty: numInputs[1],
              coatedQty: numInputs[2],
              balanceToMake: numInputs[3],
              boxQty: numInputs[4],
              processSelect,
              badge: badge ? badge.textContent.trim() : null
            };
          },
          scrollToKeyColumns() {
            document.querySelectorAll('.table-responsive').forEach(el => {
              el.scrollLeft = 330;
            });
          }
        };
      `
    });

    // Step 1: Add row A, order 600, coated 0 -> balance -600, stock 1,000
    // And row B, order 400, coated 0 -> balance -400, stock 1,000
    console.log('=== Step 1: Add Row A (Order 600) and Row B (Order 400) ===');
    const step1Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, selectReactSelect, getRow } = window.__audit;

          // Date: 2026-11-20
          const dateInput = document.querySelector('input[type="date"]');
          setNativeValue(dateInput, '2026-11-20');
          await new Promise(r => setTimeout(r, 300));

          // Section 1: TPP / BEARDO
          const s1Card = document.querySelectorAll('table')[0].closest('.shadow-sm');
          const s1Comp = s1Card.querySelector('.col-md-4 [class*="-control"]');
          await selectReactSelect(s1Comp, 'TPP');
          const s1Brand = s1Card.querySelector('.col-md-5 [class*="-control"]');
          await selectReactSelect(s1Brand, 'BEARDO');

          // Row A: 100 ML DOMUSH / BEARDO_V1 / Process C+P / Order 600
          const rowAControls = document.querySelectorAll('table')[0].querySelectorAll('tbody tr')[0].querySelectorAll('[class*="-control"]');
          await selectReactSelect(rowAControls[0], '100 ML DOMUSH');
          await selectReactSelect(rowAControls[1], 'BEARDO_V1');
          await new Promise(r => setTimeout(r, 1200));

          const rowA = getRow(0, 0);
          rowA.processSelect.value = 'C+P';
          rowA.processSelect.dispatchEvent(new Event('change', { bubbles: true }));
          setNativeValue(rowA.orderQty, '600');
          await new Promise(r => setTimeout(r, 500));

          // Add Section 2
          const addSectionBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add New Bottle Plan Section'));
          addSectionBtn.click();
          await new Promise(r => setTimeout(r, 800));

          // Section 2: TPP / MAJESTIC
          const s2Card = document.querySelectorAll('table')[1].closest('.shadow-sm');
          const s2Comp = s2Card.querySelector('.col-md-4 [class*="-control"]');
          await selectReactSelect(s2Comp, 'TPP');
          const s2Brand = s2Card.querySelector('.col-md-5 [class*="-control"]');
          await selectReactSelect(s2Brand, 'MAJESTIC');

          // Row B: 100 ML DOMUSH / MAJESTIC_V1 / Order 400
          const rowBControls = document.querySelectorAll('table')[1].querySelectorAll('tbody tr')[0].querySelectorAll('[class*="-control"]');
          await selectReactSelect(rowBControls[0], '100 ML DOMUSH');
          await selectReactSelect(rowBControls[1], 'MAJESTIC_V1');
          await new Promise(r => setTimeout(r, 1200));

          const rowB = getRow(1, 0);
          setNativeValue(rowB.orderQty, '400');
          await new Promise(r => setTimeout(r, 500));

          const freshRowA = getRow(0, 0);
          const freshRowB = getRow(1, 0);

          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_order: freshRowA.orderQty.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            rowB_stock: freshRowB.plainStock.value,
            rowB_order: freshRowB.orderQty.value,
            rowB_coated: freshRowB.coatedQty.value,
            rowB_balance: freshRowB.balanceToMake.value
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 1 Values:', step1Res.result?.value);
    testResults.push({ step: 'Step 1', res: step1Res.result?.value });

    // Step 2: Set row A coated 100 -> row A balance -500, row A stock 900, row B stock 900
    console.log('=== Step 2: Set Row A coated 100 ===');
    const step2Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, getRow, scrollToKeyColumns } = window.__audit;
          const rowA = getRow(0, 0);
          setNativeValue(rowA.coatedQty, '100');
          await new Promise(r => setTimeout(r, 500));
          scrollToKeyColumns();

          const freshRowA = getRow(0, 0);
          const freshRowB = getRow(1, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            rowB_stock: freshRowB.plainStock.value
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 2 Values:', step2Res.result?.value);
    testResults.push({ step: 'Step 2', res: step2Res.result?.value });

    // Capture screenshot Step 2
    const shot2 = await sendPage('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_step_2.png'), Buffer.from(shot2.data, 'base64'));
    console.log('Saved screenshot_step_2.png');

    // Step 3: Set row B coated 50 -> row B balance -350, both rows show stock 850
    console.log('=== Step 3: Set Row B coated 50 ===');
    const step3Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, getRow } = window.__audit;
          const rowB = getRow(1, 0);
          setNativeValue(rowB.coatedQty, '50');
          await new Promise(r => setTimeout(r, 500));

          const freshRowA = getRow(0, 0);
          const freshRowB = getRow(1, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowB_stock: freshRowB.plainStock.value,
            rowB_coated: freshRowB.coatedQty.value,
            rowB_balance: freshRowB.balanceToMake.value
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 3 Values:', step3Res.result?.value);
    testResults.push({ step: 'Step 3', res: step3Res.result?.value });

    // Step 4: Edit row A coated 100 -> 60 -> both rows show stock 890, row A balance -540
    console.log('=== Step 4: Edit Row A coated 100 -> 60 ===');
    const step4Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, getRow, scrollToKeyColumns } = window.__audit;
          const rowA = getRow(0, 0);
          setNativeValue(rowA.coatedQty, '60');
          await new Promise(r => setTimeout(r, 500));
          scrollToKeyColumns();

          const freshRowA = getRow(0, 0);
          const freshRowB = getRow(1, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            rowB_stock: freshRowB.plainStock.value
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 4 Values:', step4Res.result?.value);
    testResults.push({ step: 'Step 4', res: step4Res.result?.value });

    // Capture screenshot Step 4
    const shot4 = await sendPage('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_step_4.png'), Buffer.from(shot4.data, 'base64'));
    console.log('Saved screenshot_step_4.png');

    // Step 5: Edit row A coated 60 -> 600 -> row A balance 0, green COMPLETED badge shows, both rows show stock 350
    console.log('=== Step 5: Edit Row A coated 60 -> 600 ===');
    const step5Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, getRow, scrollToKeyColumns } = window.__audit;
          const rowA = getRow(0, 0);
          setNativeValue(rowA.coatedQty, '600');
          await new Promise(r => setTimeout(r, 500));
          scrollToKeyColumns();

          const freshRowA = getRow(0, 0);
          const freshRowB = getRow(1, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            hasBadge: freshRowA.badge === 'COMPLETED',
            rowB_stock: freshRowB.plainStock.value
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 5 Values:', step5Res.result?.value);
    testResults.push({ step: 'Step 5', res: step5Res.result?.value });

    // Capture screenshot Step 5
    const shot5 = await sendPage('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_step_5.png'), Buffer.from(shot5.data, 'base64'));
    console.log('Saved screenshot_step_5.png');

    // Step 6: Delete row B -> row A stock returns to 400 (350 + 50 returned)
    console.log('=== Step 6: Delete Section 2 (Row B) ===');
    const step6Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { getRow } = window.__audit;
          const s2Card = document.querySelectorAll('table')[1].closest('.shadow-sm');
          const removeBtn = s2Card.querySelector('button.btn-outline-danger');
          removeBtn.click();
          await new Promise(r => setTimeout(r, 600));

          const freshRowA = getRow(0, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            hasBadge: freshRowA.badge === 'COMPLETED',
            totalTables: document.querySelectorAll('table').length
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 6 Values:', step6Res.result?.value);
    testResults.push({ step: 'Step 6', res: step6Res.result?.value });

    // Step 7: Over-completion: edit row A coated 600 -> 650 -> balance +50, still COMPLETED, stock 350
    console.log('=== Step 7: Over-completion Row A coated 600 -> 650 ===');
    const step7Res = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const { setNativeValue, getRow } = window.__audit;
          const rowA = getRow(0, 0);
          setNativeValue(rowA.coatedQty, '650');
          await new Promise(r => setTimeout(r, 500));

          const freshRowA = getRow(0, 0);
          return {
            rowA_stock: freshRowA.plainStock.value,
            rowA_coated: freshRowA.coatedQty.value,
            rowA_balance: freshRowA.balanceToMake.value,
            hasBadge: freshRowA.badge === 'COMPLETED'
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Step 7 Values:', step7Res.result?.value);
    testResults.push({ step: 'Step 7', res: step7Res.result?.value });

    // Step 8: Save plan, reload edit page, verify all values match Step 7
    console.log('=== Step 8: Save plan & reload edit page ===');
    const saveRes = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save All Plans'));
          saveBtn.click();
          await new Promise(r => setTimeout(r, 2000));
          const swalTitle = document.querySelector('.swal2-title')?.textContent;
          const swalText = document.querySelector('.swal2-html-container')?.textContent;
          const swalOk = document.querySelector('.swal2-confirm');
          if (swalOk) swalOk.click();
          return { swalTitle, swalText };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Save Plan Result:', saveRes.result?.value);
    await delay(3000);

    await mongoose.connect('mongodb://localhost:27017/shayona-production');
    const savedPlan = await LacquerPlan.findOne({
      planDate: { $gte: startOfDay, $lte: endOfDay },
      bottleName: '100 ML DOMUSH',
      isDeleted: { $ne: true }
    });
    console.log('Saved Plan in DB after Save:', savedPlan ? {
      id: savedPlan._id,
      coatedQty: savedPlan.coatedQty,
      coatingCompletedQty: savedPlan.coatingCompletedQty,
      balanceToMake: savedPlan.balanceToMake,
      orderQty: savedPlan.orderQty
    } : 'NOT FOUND');
    await mongoose.disconnect();

    if (savedPlan) {
      await sendPage('Runtime.evaluate', { expression: `window.location.href = "/lacquer-plan/edit/${savedPlan._id}"` });
      await delay(3500);

      const step8Res = await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const row = document.querySelector('tbody tr');
            if (!row) return 'ROW_NOT_FOUND';
            const inputs = row.querySelectorAll('input[type="number"]');
            const badge = row.querySelector('.badge.bg-success');
            return {
              stock: inputs[0]?.value,
              order: inputs[1]?.value,
              coated: inputs[2]?.value,
              balance: inputs[3]?.value,
              hasBadge: badge ? badge.textContent.trim() === 'COMPLETED' : false
            };
          })()
        `,
        returnByValue: true
      });
      console.log('Step 8 Values on Edit Page:', step8Res.result?.value);
      testResults.push({ step: 'Step 8', res: step8Res.result?.value });
    }

    // Step 9: Open Printing Plan for that day: verify row A's shade has coated stock = 650 ready for printing
    console.log('=== Step 9: Open Printing Plan for 2026-11-20 ===');
    await sendPage('Runtime.evaluate', { expression: 'window.location.href = "/printing-plan"' });
    await delay(3500);

    // Set date 2026-11-20
    await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          const dateInput = document.querySelector('input[type="date"]');
          if (dateInput) {
            const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            proto.set.call(dateInput, '2026-11-20');
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `
    });
    await delay(2500);

    const step9Res = await sendPage('Runtime.evaluate', {
      expression: `
        (() => {
          const rows = Array.from(document.querySelectorAll('tbody tr'));
          const found = rows.find(r => r.textContent.includes('100 ML DOMUSH') || r.textContent.includes('BEARDO') || r.textContent.includes('MATTE BLACK'));
          return {
            rowCount: rows.length,
            foundRowText: found ? found.textContent : null,
            allCells: found ? Array.from(found.querySelectorAll('td')).map(td => td.textContent.trim()) : []
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Step 9 Values in Printing Plan:', step9Res.result?.value);
    testResults.push({ step: 'Step 9', res: step9Res.result?.value });

    // Screenshot Step 9
    const shot9 = await sendPage('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_step_9.png'), Buffer.from(shot9.data, 'base64'));
    console.log('Saved screenshot_step_9.png');

    // Step 10: Check DB document directly
    console.log('=== Step 10: Checking DB document directly ===');
    await mongoose.connect('mongodb://localhost:27017/shayona-production');
    const finalDoc = await LacquerPlan.findOne({
      planDate: { $gte: startOfDay, $lte: endOfDay },
      bottleName: '100 ML DOMUSH',
      isDeleted: { $ne: true }
    });
    const finalPrintingDoc = await PrintingPlan.findOne({
      planDate: { $gte: startOfDay, $lte: endOfDay },
      bottleName: '100 ML DOMUSH',
      isDeleted: { $ne: true }
    });
    const step10Res = {
      coatingCompletedQty: finalDoc?.coatingCompletedQty,
      coatedQty: finalDoc?.coatedQty,
      balanceToMake: finalDoc?.balanceToMake,
      orderQty: finalDoc?.orderQty,
      plainStock: finalDoc?.plainStock,
      printingPlan: finalPrintingDoc ? {
        id: finalPrintingDoc._id,
        plainBottleStock: finalPrintingDoc.plainBottleStock,
        coatingShade: finalPrintingDoc.coatingShade,
        process: finalPrintingDoc.process
      } : null
    };
    console.log('Step 10 DB Doc:', step10Res);
    testResults.push({ step: 'Step 10', res: step10Res });
    await mongoose.disconnect();

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'audit_results.json'), JSON.stringify(testResults, null, 2));

    pageWs.close();
    ws.close();
  } finally {
    chromeProc.kill();
  }
}

runAudit().catch(console.error);
