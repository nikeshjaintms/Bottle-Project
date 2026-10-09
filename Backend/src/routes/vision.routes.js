const router = require("express").Router();

const upload =
    require("../middleware/upload.middleware");

const {
    matchBottle
} = require("../controllers/vision.controller");

const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

router.post(
    "/match",
    auth,
    checkAbility("use", "vision"),
    upload.array("images", 5),
    matchBottle
);

module.exports = router;