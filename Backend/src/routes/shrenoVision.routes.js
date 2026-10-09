const express = require('express');
const router = express.Router();
const shrenoVisionController = require('../controllers/shrenoVision.controller');
const upload = require('../middleware/upload.middleware');

router.post('/parse', upload.array('images', 5), shrenoVisionController.parseShrenoChallan);

module.exports = router;
