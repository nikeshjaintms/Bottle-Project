const express = require("express");
const router = express.Router();
const bottlePerBoxController = require("../controllers/bottlePerBox.controller");
const readyToDispatchController = require("../controllers/readyToDispatch.controller");

router.get("/plain-bottles", readyToDispatchController.getPlainBottleOptions);
router.get("/search", bottlePerBoxController.searchBottlePerBox);
router.post("/", bottlePerBoxController.createBottlePerBox);
router.get("/dropdown", bottlePerBoxController.getBottlePerBoxDropdown);
router.get("/", bottlePerBoxController.getBottlePerBoxes);
router.get("/:id", bottlePerBoxController.getSingleBottlePerBox);
router.put("/:id", bottlePerBoxController.updateBottlePerBox);
router.delete("/:id", bottlePerBoxController.deleteBottlePerBox);

module.exports = router;
