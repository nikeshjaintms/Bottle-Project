const express = require("express");
const router = express.Router();
const printingPlanController = require("../controllers/printingPlan.controller");
const printingPlanImport = require("../controllers/printingPlanImport");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// POST /printing-plan/import-preview
router.post("/import-preview", upload.single('file'), printingPlanImport.importPreview);

// POST /printing-plan/commit-import
router.post("/commit-import", printingPlanImport.commitImport);

// POST /printing-plan/import-previous
router.post("/import-previous", printingPlanController.importPreviousDay);

// POST /printing-plan (create single or bulk plans)
router.post("/", printingPlanController.createPlan);

// GET /printing-plan (list plans, supports ?date= or ?month= filters)
router.get("/", printingPlanController.getPlans);

// GET /printing-plan/paginated (keyset pagination with group boundary logic)
router.get("/paginated", printingPlanController.getPlansPaginated);

// GET /printing-plan/totals (aggregate totals for all matching records)
router.get("/totals", printingPlanController.getPlansTotals);

// GET /printing-plan/stats/computed (fetch live stats for form changes)
router.get("/stats/computed", printingPlanController.getComputedStats);

// GET /printing-plan/:id (get single plan)
router.get("/:id", printingPlanController.getPlanById);

// PUT /printing-plan/:id (update plan)
router.put("/:id", printingPlanController.updatePlan);

// DELETE /printing-plan/:id (soft delete)
router.delete("/:id", printingPlanController.deletePlan);

module.exports = router;
