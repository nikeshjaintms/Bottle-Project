const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.middleware");
const { parseChallan } = require("../controllers/challanVision.controller");

router.post("/parse", upload.array("images", 5), parseChallan);

module.exports = router;
