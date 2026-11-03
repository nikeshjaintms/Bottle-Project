const express = require("express");
const router = express.Router();
const dispatchController = require("../controllers/dispatch.controller");
const dispatchImportController = require("../controllers/dispatchImport");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");
const multer = require("multer");

// Memory storage for Excel imports (no disk write)
const memoryUpload = multer({ storage: multer.memoryStorage() });

router.get("/", auth, checkAbility("read", "dispatch"), dispatchController.getAllDispatch);
router.get("/bottle-options", auth, checkAbility("read", "dispatch"), dispatchController.getBottleOptions);
router.get("/bottles/:companyId", auth, checkAbility("read", "dispatch"), dispatchController.getDispatchBottles);
router.get("/:id", auth, checkAbility("read", "dispatch"), dispatchController.getDispatchById);
router.post("/", auth, checkAbility("create", "dispatch"), dispatchController.createDispatch);
router.put("/:id", auth, checkAbility("edit", "dispatch"), dispatchController.updateDispatch);
router.delete("/:id", auth, checkAbility("delete", "dispatch"), dispatchController.deleteDispatch);

// Import routes (using unified importer for all companies)
router.post("/import/preview", auth, checkAbility("create", "dispatch"), memoryUpload.single('file'), dispatchImportController.previewDispatchImport);
router.post("/import/commit", auth, checkAbility("create", "dispatch"), dispatchImportController.commitDispatchImport);

module.exports = router;
