const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config({ path: 'c:/Users/prabh/Downloads/Bottle-Project/Backend/.env' });

async function createEditPlan() {
  const TEST_DATE = '2029-12-15';
  const res = await axios.post('http://localhost:5000/api/lacquer-plan', {
    planDate: TEST_DATE,
    companyId: '6a17e8ede933dc474615eb96',
    brandId: '6a18077ce933dc474615ebbc',
    variantId: '6a3a5359a7a2fa427e5b19a8',
    bottleName: '20 ML SAAB',
    colour: 'GOLD',
    process: 'C',
    orderQty: 1000,
    coatedQty: 1000
  });

  console.log(`Saved plan created for Edit testing: ID = ${res.data.data._id}`);
  console.log(`Edit URL: http://localhost:5173/lacquer-plan/edit/${res.data.data._id}`);
}

createEditPlan().catch(console.error);
