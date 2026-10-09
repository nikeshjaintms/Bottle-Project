const express = require("express");
const router = express.Router();
const {
  createItemType,
  getAllItemTypes,
  getItemTypeById,
  updateItemType,
  deleteItemType,
} = require("../controllers/itemType.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

router.post("/", auth, checkAbility("create", "itemType"), createItemType);
router.get("/", auth, checkAbility("read", "itemType"), getAllItemTypes);
router.get("/:id", auth, checkAbility("read", "itemType"), getItemTypeById);
router.put("/:id", auth, checkAbility("update", "itemType"), updateItemType);
router.delete("/:id", auth, checkAbility("delete", "itemType"), deleteItemType);

module.exports = router;
