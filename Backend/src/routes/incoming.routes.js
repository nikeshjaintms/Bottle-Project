const express = require("express");
const router = express.Router();
const { 
  getAllIncoming, 
  getIncomingById, 
  createIncoming, 
  deleteIncoming, 
  updateIncoming,
  bulkDeleteIncoming,
  rollbackImport,
  reconcileStock,
  restoreIncoming,
  createBottle
} = require("../controllers/incoming.controller");
const { importPreview, commitImport } = require("../controllers/incomingImport");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");
const upload = require("../middleware/upload.middleware");
const multer = require("multer");

// Memory storage for Excel imports (no disk write)
const memoryUpload = multer({ storage: multer.memoryStorage() });

// Import endpoints
router.post("/import/preview", auth, memoryUpload.single('file'), importPreview);
router.post("/import/commit", auth, commitImport);
router.post("/import/rollback", auth, checkAbility("delete", "incoming"), rollbackImport);

// Reconcile endpoint
router.post("/reconcile-stock", auth, reconcileStock);

// Create bottle endpoint (for Incoming Add/Edit dropdowns)
router.post("/create-bottle", auth, createBottle);

// Standard CRUD endpoints
router.get("/", auth, checkAbility("read", "incoming"), getAllIncoming);
router.post("/bulk-delete", auth, checkAbility("delete", "incoming"), bulkDeleteIncoming);
router.get("/:id", auth, checkAbility("read", "incoming"), getIncomingById);
router.post("/", auth, upload.array("images", 5), checkAbility("create", "incoming"), createIncoming);
router.put("/:id", auth, upload.array("images", 5), checkAbility("update", "incoming"), updateIncoming);
router.put("/:id/restore", auth, checkAbility("update", "incoming"), restoreIncoming);
router.post("/:id/restore", auth, checkAbility("update", "incoming"), restoreIncoming);
router.delete("/:id", auth, checkAbility("delete", "incoming"), deleteIncoming);

module.exports = router;
