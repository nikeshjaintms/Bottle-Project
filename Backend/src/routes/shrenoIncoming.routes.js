const express = require('express');
const router = express.Router();
const shrenoIncomingController = require('../controllers/shrenoIncoming.controller');
const upload = require('../middleware/upload.middleware');
const { auth } = require('../middleware/auth.middleware');

router.use(auth);

router.post('/', upload.array('images', 5), shrenoIncomingController.createShrenoIncoming);
router.get('/', shrenoIncomingController.getShrenoIncomings);
router.get('/:id', shrenoIncomingController.getShrenoIncomingById);
router.put('/:id', upload.array('images', 5), shrenoIncomingController.updateShrenoIncoming);
router.delete('/:id', shrenoIncomingController.deleteShrenoIncoming);

module.exports = router;
