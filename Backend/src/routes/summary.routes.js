const express = require("express");
const router = express.Router();
const summaryController = require("../controllers/summary.controller");
const { auth } = require("../middleware/auth.middleware");

// Read-only Summary endpoints
router.get("/companies", auth, summaryController.getSummaryCompanies);
router.get("/bottles", auth, summaryController.getSummaryBottles);
router.get("/overview", auth, summaryController.getSummaryOverview);
router.get("/logs", auth, summaryController.getSummaryLogs);

module.exports = router;
