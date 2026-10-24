const express = require("express");
const router = express.Router();
const dispatchController = require("../controllers/dispatch.controller");
const dispatchImportController = require("../controllers/dispatchImport");
const { auth } = require("../middleware/auth.middleware");
const multer = require("multer");

// Memory storage for Excel imports (no disk write)
const memoryUpload = multer({ storage: multer.memoryStorage() });

router.get("/", auth, dispatchController.getAllDispatch);
router.get("/bottle-options", auth, dispatchController.getBottleOptions);
router.get("/bottles/:companyId", auth, dispatchController.getDispatchBottles);
router.get("/:id", auth, dispatchController.getDispatchById);
router.post("/", auth, dispatchController.createDispatch);
router.put("/:id", auth, dispatchController.updateDispatch);
router.delete("/:id", auth, dispatchController.deleteDispatch);

// Import routes (using unified importer for all companies)
router.post("/import/preview", auth, memoryUpload.single('file'), dispatchImportController.previewDispatchImport);
router.post("/import/commit", auth, dispatchImportController.commitDispatchImport);

module.exports = router;
