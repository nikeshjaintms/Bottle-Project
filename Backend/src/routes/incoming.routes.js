const express = require("express");
const router = express.Router();
const { getAllIncoming, getIncomingById, createIncoming, deleteIncoming, updateIncoming } = require("../controllers/incoming.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");
const upload = require("../middleware/upload.middleware");

router.get("/", auth, checkAbility("read", "incoming"), getAllIncoming);
router.get("/:id", auth, checkAbility("read", "incoming"), getIncomingById);
router.post("/", auth, upload.array("images", 5), checkAbility("create", "incoming"), createIncoming);
router.put("/:id", auth, upload.array("images", 5), checkAbility("update", "incoming"), updateIncoming);
router.delete("/:id", auth, checkAbility("delete", "incoming"), deleteIncoming);

module.exports = router;
