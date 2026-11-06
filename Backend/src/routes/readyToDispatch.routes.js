const express = require("express");
const router = express.Router();
const readyToDispatchController = require("../controllers/readyToDispatch.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");
const defineAbilityFor = require("../abilities/defineAbility");

const checkPlanSendPermission = (req, res, next) => {
  const source = req.body?.source;
  if (source !== "lacquer" && source !== "printing") {
    return next();
  }

  const subject = source === "lacquer" ? "lacquerplan" : "printingplan";
  if (defineAbilityFor(req.user).can("send", subject)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "You don't have permission to send this plan to Ready To Dispatch",
  });
};

router.post("/from-plan", auth, checkPlanSendPermission, readyToDispatchController.createFromPlan);
router.get("/companies-summary", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getCompaniesSummary);
router.get("/options/plain-bottles", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getPlainBottleOptions);
router.get("/options/variants", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getVariantOptions);
router.get("/", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getAllReadyToDispatch);
router.get("/:id", auth, checkAbility("read", "ready-to-dispatch"), readyToDispatchController.getReadyToDispatchById);
router.post("/", auth, checkAbility("create", "ready-to-dispatch"), readyToDispatchController.createReadyToDispatch);
router.put("/:id", auth, checkAbility("edit", "ready-to-dispatch"), readyToDispatchController.updateReadyToDispatch);
router.delete("/:id", auth, checkAbility("delete", "ready-to-dispatch"), readyToDispatchController.deleteReadyToDispatch);

module.exports = router;
