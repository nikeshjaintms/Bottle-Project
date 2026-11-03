const express = require("express");
const router = express.Router();
const readyToDispatchController = require("../controllers/readyToDispatch.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

router.post("/from-plan", auth, checkAbility("create", "ready-to-dispatch"), readyToDispatchController.createFromPlan);
router.get("/companies-summary", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getCompaniesSummary);
router.get("/options/plain-bottles", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getPlainBottleOptions);
router.get("/options/variants", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getVariantOptions);
router.get("/", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getAllReadyToDispatch);
router.get("/:id", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getReadyToDispatchById);
router.post("/", auth, checkAbility("create", "ready-to-dispatch"), readyToDispatchController.createReadyToDispatch);
router.put("/:id", auth, checkAbility("edit", "ready-to-dispatch"), readyToDispatchController.updateReadyToDispatch);
router.delete("/:id", auth, checkAbility("delete", "ready-to-dispatch"), readyToDispatchController.deleteReadyToDispatch);

module.exports = router;
