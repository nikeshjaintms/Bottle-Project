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
router.post("/import/preview", auth, checkAbility("create", "incoming"), memoryUpload.single('file'), importPreview);
router.post("/import/commit", auth, checkAbility("create", "incoming"), commitImport);
router.post("/import/rollback", auth, checkAbility("delete", "incoming"), rollbackImport);

// Reconcile endpoint
router.post("/reconcile-stock", auth, checkAbility("edit", "incoming"), reconcileStock);

// Create bottle endpoint (for Incoming Add/Edit dropdowns)
router.post("/create-bottle", auth, checkAbility("create", "incoming"), createBottle);

// Standard CRUD endpoints
router.get("/", auth, checkAbility("read", "incoming"), getAllIncoming);
router.post("/bulk-delete", auth, checkAbility("delete", "incoming"), bulkDeleteIncoming);
router.get("/:id", auth, checkAbility("read", "incoming"), getIncomingById);
router.post("/", auth, checkAbility("create", "incoming"), upload.array("images", 5), createIncoming);
router.put("/:id", auth, checkAbility("edit", "incoming"), upload.array("images", 5), updateIncoming);
router.put("/:id/restore", auth, checkAbility("edit", "incoming"), restoreIncoming);
router.post("/:id/restore", auth, checkAbility("edit", "incoming"), restoreIncoming);
router.delete("/:id", auth, checkAbility("delete", "incoming"), deleteIncoming);

module.exports = router;
