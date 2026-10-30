const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/shayona-production');
  require('../src/models/user');
  require('../src/models/role.model');
  require('../src/models/permission.model');
  const adminUser = await mongoose.model('User').findOne({ email: 'admin@gmail.com' }).populate({
    path: 'role',
    populate: { path: 'permissions' }
  });
  const token = jwt.sign({ id: adminUser._id }, 'SECRET_KEY', { expiresIn: '1d' });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setCookie({ name: 'token', value: token, domain: 'localhost', path: '/' });
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok, usr) => {
    localStorage.setItem('token', tok);
    localStorage.setItem('user', JSON.stringify({
      _id: usr._id, name: 'Admin', email: usr.email, role: 'Admin',
      permissions: usr.role?.permissions?.map(p => p.name || p.slug || p) || []
    }));
  }, token, adminUser);

  await page.goto('http://localhost:5173/lacquer-plan/add', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Let's select Company TPP and Brand BEARDO in AddLacquerPlan
  // Find react-selects:
  console.log('Filling form...');
  await page.evaluate(async () => {
    // Look at react-select components
    const rs = document.querySelectorAll('.css-b62m3t-container');
    console.log('RS count:', rs.length);
  });

  await browser.close();
  process.exit(0);
})();
