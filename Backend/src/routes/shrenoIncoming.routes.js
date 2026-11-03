const express = require('express');
const router = express.Router();
const shrenoIncomingController = require('../controllers/shrenoIncoming.controller');
const { importPreview, commitImport } = require('../controllers/shrenoIncomingImport');
const upload = require('../middleware/upload.middleware');
const { auth } = require('../middleware/auth.middleware');
const checkAbility = require('../middleware/checkAbility');
const multer = require('multer');

// Memory storage for Excel imports (no disk write)
const memoryUpload = multer({ storage: multer.memoryStorage() });

router.use(auth);

// Import endpoints
router.post('/import/preview', checkAbility('create', 'shreno-incoming'), memoryUpload.single('file'), importPreview);
router.post('/import/commit', checkAbility('create', 'shreno-incoming'), commitImport);

// Standard CRUD endpoints
router.post('/', checkAbility('create', 'shreno-incoming'), upload.array('images', 5), shrenoIncomingController.createShrenoIncoming);
router.get('/', checkAbility('read', 'shreno-incoming'), shrenoIncomingController.getShrenoIncomings);
router.get('/:id', checkAbility('read', 'shreno-incoming'), shrenoIncomingController.getShrenoIncomingById);
router.put('/:id', checkAbility('edit', 'shreno-incoming'), upload.array('images', 5), shrenoIncomingController.updateShrenoIncoming);
router.delete('/:id', checkAbility('delete', 'shreno-incoming'), shrenoIncomingController.deleteShrenoIncoming);

module.exports = router;
