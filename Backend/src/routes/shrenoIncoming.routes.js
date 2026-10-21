const express = require('express');
const router = express.Router();
const shrenoIncomingController = require('../controllers/shrenoIncoming.controller');
const { importPreview, commitImport } = require('../controllers/shrenoIncomingImport');
const upload = require('../middleware/upload.middleware');
const { auth } = require('../middleware/auth.middleware');
const multer = require('multer');

// Memory storage for Excel imports (no disk write)
const memoryUpload = multer({ storage: multer.memoryStorage() });

router.use(auth);

// Import endpoints
router.post('/import/preview', memoryUpload.single('file'), importPreview);
router.post('/import/commit', commitImport);

// Standard CRUD endpoints
router.post('/', upload.array('images', 5), shrenoIncomingController.createShrenoIncoming);
router.get('/', shrenoIncomingController.getShrenoIncomings);
router.get('/:id', shrenoIncomingController.getShrenoIncomingById);
router.put('/:id', upload.array('images', 5), shrenoIncomingController.updateShrenoIncoming);
router.delete('/:id', shrenoIncomingController.deleteShrenoIncoming);

module.exports = router;
