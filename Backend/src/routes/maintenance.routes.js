const express = require("express");
const router = express.Router();
const maintenanceController = require("../controllers/maintenance.controller");
const { auth, allowRoles } = require("../middleware/auth.middleware");

// Status endpoint: returns current maintenance state (checks user bypass if token present)
router.get("/status", async (req, res, next) => {
  // Try running auth if token present, but don't fail if guest/unauthenticated
  const token = req.cookies?.token || (req.headers.authorization ? req.headers.authorization.split(" ")[1] : null);
  if (token) {
    return auth(req, res, () => maintenanceController.getStatus(req, res));
  }
  return maintenanceController.getStatus(req, res);
});

// Admin-only management endpoints
router.post(
  "/toggle-global",
  auth,
  allowRoles("Admin", "Super Admin", "SuperAdmin"),
  maintenanceController.toggleGlobal
);

router.post(
  "/toggle-module",
  auth,
  allowRoles("Admin", "Super Admin", "SuperAdmin"),
  maintenanceController.toggleModule
);

router.put(
  "/update-settings",
  auth,
  allowRoles("Admin", "Super Admin", "SuperAdmin"),
  maintenanceController.updateSettings
);

module.exports = router;

