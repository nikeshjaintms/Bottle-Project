const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.middleware");
const { parseInvoice } = require("../controllers/invoiceVision.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

router.post("/parse", auth, checkAbility("use", "vision"), upload.array("images", 5), parseInvoice);

module.exports = router;
