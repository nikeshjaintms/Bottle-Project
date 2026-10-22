const router = require("express").Router();
const {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
} = require("../controllers/companyAddress.controller");

const { auth } = require("../middleware/auth.middleware");
const defineAbilityFor = require("../abilities/defineAbility");

// Flexible ability checker: allows action on "company-address" OR "company"
const checkAddressAbility = (action) => {
  return (req, res, next) => {
    const ability = defineAbilityFor(req.user);
    if (
      ability.can(action, "company-address") ||
      ability.can(action, "company") ||
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

router.post("/", auth, checkAddressAbility("create"), createAddress);
router.get("/", auth, checkAddressAbility("read"), getAddresses);
router.get("/:id", auth, checkAddressAbility("read"), getAddressById);
router.put("/:id", auth, checkAddressAbility("edit"), updateAddress);
router.delete("/:id", auth, checkAddressAbility("delete"), deleteAddress);

module.exports = router;
