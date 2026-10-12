const router = require("express").Router();
const {
  createChallan,
  getChallans,
  getChallanById,
  getNextChallanNo,
  updateChallan,
  deleteChallan,
} = require("../controllers/deliveryChallan.controller");

const { auth } = require("../middleware/auth.middleware");
const defineAbilityFor = require("../abilities/defineAbility");

// Flexible ability checker: allows action on "delivery-challan" OR "dispatch"
const checkChallanAbility = (action) => {
  return (req, res, next) => {
    const ability = defineAbilityFor(req.user);
    if (
      ability.can(action, "delivery-challan") ||
      ability.can(action, "delivery-challan-shayoona") ||
      ability.can(action, "dispatch") ||
      ability.can("manage", "all")
    ) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "You don't have permission to perform this action",
    });
  };
};

router.get("/next-no", auth, checkChallanAbility("read"), getNextChallanNo);
router.post("/", auth, checkChallanAbility("create"), createChallan);
router.get("/", auth, checkChallanAbility("read"), getChallans);
router.get("/:id", auth, checkChallanAbility("read"), getChallanById);
router.put("/:id", auth, checkChallanAbility("edit"), updateChallan);
router.delete("/:id", auth, checkChallanAbility("delete"), deleteChallan);

module.exports = router;
