const express = require("express");
const router = express.Router();
const summaryController = require("../controllers/summary.controller");
const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");

// Paginated endpoints for infinite scroll
router.get("/incoming-paginated", auth, checkAbility("read", "summary"), summaryController.getIncomingPaginated);
router.get("/dispatch-paginated", auth, checkAbility("read", "summary"), summaryController.getDispatchPaginated);
router.get("/shreno-incoming-paginated", auth, checkAbility("read", "summary"), summaryController.getShrenoIncomingPaginated);

// Totals endpoints (for cards and summary displays)
router.get("/incoming-totals", auth, checkAbility("read", "summary"), summaryController.getIncomingTotals);
router.get("/dispatch-totals", auth, checkAbility("read", "summary"), summaryController.getDispatchTotals);
router.get("/shreno-incoming-totals", auth, checkAbility("read", "summary"), summaryController.getShrenoIncomingTotals);

// Live Stock endpoint (for PLAIN coating shade usage in Lacquer and Printing Plans)
router.get("/live-stock", auth, checkAbility("read", "summary"), summaryController.getLiveStock);

// Read-only Summary endpoints (existing)
router.get("/companies", auth, checkAbility("read", "summary"), summaryController.getSummaryCompanies);
router.get("/bottles", auth, checkAbility("read", "summary"), summaryController.getSummaryBottles);
router.get("/overview", auth, checkAbility("read", "summary"), summaryController.getSummaryOverview);
router.get("/logs", auth, checkAbility("read", "summary"), summaryController.getSummaryLogs);

module.exports = router;
