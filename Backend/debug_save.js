const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const WebSocket = require('./node_modules/ws');

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

async function debugSave() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\prabh\\AppData\\Local\\Temp\\chrome_debug_' + Date.now();

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    'http://localhost:5173'
  ]);

  await delay(2500);

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

    await sendPage('Runtime.evaluate', { expression: 'window.location.href = "/lacquer-plan/add"' });
    await delay(3000);

    const debugRes = await sendPage('Runtime.evaluate', {
      expression: `
        (async () => {
          function setNativeValue(element, value) {
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
          }

          async function selectReactSelect(controlElement, targetText) {
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
          }

          // Date: 2026-11-20
          const dateInput = document.querySelector('input[type="date"]');
          setNativeValue(dateInput, '2026-11-20');
          await new Promise(r => setTimeout(r, 300));

          // Company: TPP
          const s1Card = document.querySelectorAll('table')[0].closest('.shadow-sm');
          const s1Comp = s1Card.querySelector('.col-md-4 [class*="-control"]');
          await selectReactSelect(s1Comp, 'TPP');
          const s1Brand = s1Card.querySelector('.col-md-5 [class*="-control"]');
          await selectReactSelect(s1Brand, 'BEARDO');

          // Row A: 100 ML DOMUSH / BEARDO_V1 / Order 600 / Coated 650
          const rowAControls = document.querySelectorAll('table')[0].querySelectorAll('tbody tr')[0].querySelectorAll('[class*="-control"]');
          await selectReactSelect(rowAControls[0], '100 ML DOMUSH');
          await selectReactSelect(rowAControls[1], 'BEARDO_V1');
          await new Promise(r => setTimeout(r, 1200));

          const numInputs = document.querySelectorAll('table')[0].querySelectorAll('tbody tr')[0].querySelectorAll('input[type="number"]');
          setNativeValue(numInputs[1], '600'); // order
          setNativeValue(numInputs[2], '650'); // coated
          await new Promise(r => setTimeout(r, 500));

          // Try submit
          const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save All Plans'));
          saveBtn.click();
          await new Promise(r => setTimeout(r, 1500));

          const swalTitle = document.querySelector('.swal2-title')?.textContent;
          const swalText = document.querySelector('.swal2-html-container')?.textContent;
          return { swalTitle, swalText };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Debug Submit Result:', debugRes.result?.value);

    pageWs.close();
    ws.close();
  } finally {
    chromeProc.kill();
  }
}

debugSave().catch(console.error);
