const express = require("express");
const router = express.Router();
const lacquerPlanController = require("../controllers/lacquerPlan.controller");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() }); // using memory storage for temporary parsing

router.post("/", lacquerPlanController.createPlan);
router.get("/", lacquerPlanController.getPlans);
router.get("/month-status", lacquerPlanController.getMonthStatus);
router.post("/import-previous", lacquerPlanController.importPreviousDay);
router.post("/preview-import", upload.single('file'), lacquerPlanController.previewImportExcel);
router.post("/commit-import", lacquerPlanController.commitImportExcel);
router.post("/verify-import", lacquerPlanController.verifyImportedData);
router.get("/stats/computed", lacquerPlanController.getComputedStats);
router.get("/:id", lacquerPlanController.getPlanById);
router.put("/:id", lacquerPlanController.updatePlan);
router.delete("/:id", lacquerPlanController.deletePlan);

module.exports = router;
