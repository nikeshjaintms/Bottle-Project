const express = require("express");
const router = express.Router();
const bottlePerBoxController = require("../controllers/bottlePerBox.controller");
const readyToDispatchController = require("../controllers/readyToDispatch.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

router.get("/plain-bottles", auth, checkAbility("read", "bottleperbox"), readyToDispatchController.getPlainBottleOptions);
router.get("/search", auth, checkAbility("read", "bottleperbox"), bottlePerBoxController.searchBottlePerBox);
router.post("/", auth, checkAbility("create", "bottleperbox"), bottlePerBoxController.createBottlePerBox);
router.get("/dropdown", auth, checkAbility("read", "bottleperbox"), bottlePerBoxController.getBottlePerBoxDropdown);
router.get("/", auth, checkAbility("read", "bottleperbox"), bottlePerBoxController.getBottlePerBoxes);
router.get("/:id", auth, checkAbility("read", "bottleperbox"), bottlePerBoxController.getSingleBottlePerBox);
router.put("/:id", auth, checkAbility("edit", "bottleperbox"), bottlePerBoxController.updateBottlePerBox);
router.delete("/:id", auth, checkAbility("delete", "bottleperbox"), bottlePerBoxController.deleteBottlePerBox);

module.exports = router;
