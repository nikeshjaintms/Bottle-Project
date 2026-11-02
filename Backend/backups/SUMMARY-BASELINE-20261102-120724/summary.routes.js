const express = require("express");
const router = express.Router();
const summaryController = require("../controllers/summary.controller");
const { auth } = require("../middleware/auth.middleware");

// Paginated endpoints for infinite scroll
router.get("/incoming-paginated", auth, summaryController.getIncomingPaginated);
router.get("/dispatch-paginated", auth, summaryController.getDispatchPaginated);
router.get("/shreno-incoming-paginated", auth, summaryController.getShrenoIncomingPaginated);

// Totals endpoints (for cards and summary displays)
router.get("/incoming-totals", auth, summaryController.getIncomingTotals);
router.get("/dispatch-totals", auth, summaryController.getDispatchTotals);
router.get("/shreno-incoming-totals", auth, summaryController.getShrenoIncomingTotals);

// Read-only Summary endpoints (existing)
router.get("/companies", auth, summaryController.getSummaryCompanies);
router.get("/bottles", auth, summaryController.getSummaryBottles);
router.get("/overview", auth, summaryController.getSummaryOverview);
router.get("/logs", auth, summaryController.getSummaryLogs);

module.exports = router;
