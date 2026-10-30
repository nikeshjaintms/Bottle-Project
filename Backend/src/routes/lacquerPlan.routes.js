const express = require("express");
const router = express.Router();
const lacquerPlanController = require("../controllers/lacquerPlan.controller");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() }); // using memory storage for temporary parsing

router.post("/", lacquerPlanController.createPlan);
router.get("/paginated", lacquerPlanController.getPlansPaginated);
router.get("/totals", lacquerPlanController.getPlansTotals);
router.get("/", lacquerPlanController.getPlans);
router.get("/validate-stock", lacquerPlanController.validateStockWarning);
router.get("/month-status", lacquerPlanController.getMonthStatus);
router.post("/import-previous", lacquerPlanController.importPreviousDay);
router.post("/preview-import", upload.single('file'), lacquerPlanController.previewImportExcel);
router.post("/commit-import", lacquerPlanController.commitImportExcel);
router.post("/verify-import", lacquerPlanController.verifyImportedData);
router.get("/stats/computed", lacquerPlanController.getComputedStats);
router.get("/opening-stock", lacquerPlanController.getOpeningStock);
router.get("/:id", lacquerPlanController.getPlanById);
router.put("/:id", lacquerPlanController.updatePlan);
router.delete("/:id", lacquerPlanController.deletePlan);

// Quantity entry endpoints
router.post("/:id/add-order-qty", lacquerPlanController.addOrderQty);
router.post("/:id/add-coated-qty", lacquerPlanController.addCoatedQty);
router.delete("/:id/entries/:entryId", lacquerPlanController.deleteQtyEntry);

module.exports = router;
