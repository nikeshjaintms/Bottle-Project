const jwt = require("jsonwebtoken");
const MaintenanceSetting = require("../models/MaintenanceSetting");
const User = require("../models/user");

// Module route prefixes
const ROUTE_MODULE_MAP = [
  { prefix: "/api/lacquer-plan", moduleKey: "lacquer_plan" },
  { prefix: "/api/printing-plan", moduleKey: "printing_plan" },
  { prefix: "/api/incoming", moduleKey: "incoming" },
  { prefix: "/api/shreno-incoming", moduleKey: "incoming" },
  { prefix: "/api/production", moduleKey: "production" },
  { prefix: "/api/coating-production", moduleKey: "production" },
  { prefix: "/api/dispatch", moduleKey: "dispatch" },
  { prefix: "/api/ready-to-dispatch", moduleKey: "dispatch" },
  { prefix: "/api/delivery-challan", moduleKey: "delivery_challan" },
  { prefix: "/api/stock-entry", moduleKey: "stock_entry" },
  { prefix: "/api/summary", moduleKey: "summary" },
  { prefix: "/api/vision", moduleKey: "vision" },
  { prefix: "/api/invoice-vision", moduleKey: "vision" },
  { prefix: "/api/challan-vision", moduleKey: "vision" },
  { prefix: "/api/shreno-vision", moduleKey: "vision" },

  // Master Data routes
  { prefix: "/api/company", moduleKey: "master_data" },
  { prefix: "/api/company-address", moduleKey: "master_data" },
  { prefix: "/api/brand", moduleKey: "master_data" },
  { prefix: "/api/variant", moduleKey: "master_data" },
  { prefix: "/api/bottle-spec", moduleKey: "master_data" },
  { prefix: "/api/bottle-specs", moduleKey: "master_data" },
  { prefix: "/api/bottle-per-box", moduleKey: "master_data" },
  { prefix: "/api/item-type", moduleKey: "master_data" },
  { prefix: "/api/unit", moduleKey: "master_data" },
  { prefix: "/api/shift", moduleKey: "master_data" },
  { prefix: "/api/operator", moduleKey: "master_data" },
  { prefix: "/api/printing-type", moduleKey: "master_data" },
  { prefix: "/api/printing-color", moduleKey: "master_data" },
  { prefix: "/api/coating-type", moduleKey: "master_data" },
  { prefix: "/api/text-color", moduleKey: "master_data" },
  { prefix: "/api/formula", moduleKey: "master_data" },
  { prefix: "/api/raw-material", moduleKey: "master_data" },
  { prefix: "/api/sg-label", moduleKey: "master_data" },
  { prefix: "/api/sg-label-2", moduleKey: "master_data" },
];

// In-memory cache for maintenance state
let cachedSettings = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

async function getCachedMaintenanceSettings() {
  const now = Date.now();
  if (!cachedSettings || now - lastCacheFetchTime > CACHE_TTL_MS) {
    cachedSettings = await MaintenanceSetting.getSingleton();
    lastCacheFetchTime = now;
  }
  return cachedSettings;
}

function invalidateMaintenanceCache() {
  cachedSettings = null;
  lastCacheFetchTime = 0;
}

function resolveModuleForPath(path) {
  for (const entry of ROUTE_MODULE_MAP) {
    if (path.startsWith(entry.prefix)) {
      return entry.moduleKey;
    }
  }
  return null;
}

/**
 * Extracts and verifies user role from request if not already authenticated
 */
async function resolveRequestUser(req) {
  if (req.user) return req.user;
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization ? req.headers.authorization.split(" ")[1] : null);
    if (!token) return null;

    const secret = process.env.JWT_SECRET || "SECRET_KEY";
    const decoded = jwt.verify(token, secret);
    if (!decoded?.id) return null;

    const user = await User.findById(decoded.id).populate("role").lean();
    if (user && user.status !== "inactive") {
      req.user = user;
      return user;
    }
  } catch (err) {
    return null;
  }
  return null;
}

/**
 * Global or modular maintenance check middleware
 */
async function checkMaintenance(req, res, next) {
  const path = req.originalUrl || req.path;

  // Always allow auth routes, static uploads, and maintenance management itself
  if (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/system-maintenance") ||
    path.startsWith("/uploads") ||
    path === "/" ||
    path === "/api"
  ) {
    return next();
  }

  try {
    const settings = await getCachedMaintenanceSettings();
    if (!settings) return next();

    const targetModuleKey = resolveModuleForPath(path);

    // Find if the target module is individually in maintenance
    let moduleSetting = null;
    if (targetModuleKey && Array.isArray(settings.modules)) {
      moduleSetting = settings.modules.find((m) => m.key === targetModuleKey);
    }

    const isGlobal = Boolean(settings.isGlobalMaintenance);
    const isModuleDown = Boolean(moduleSetting?.isUnderMaintenance);

    // If neither global nor this module is under maintenance, proceed freely
    if (!isGlobal && !isModuleDown) {
      return next();
    }

    // Attempt to identify user role
    const user = await resolveRequestUser(req);
    const userRole = (
      typeof user?.role === "object" ? user.role?.name : user?.role || ""
    ).toLowerCase();

    const allowedRoles = (settings.allowedRoles || ["admin", "super admin"]).map((r) =>
      r.toLowerCase()
    );

    // If user has an administrative role that can bypass maintenance, let them pass
    if (allowedRoles.includes(userRole)) {
      // Add a header so client knows they are browsing under maintenance bypass
      res.setHeader("X-Maintenance-Bypass", "true");
      return next();
    }

    // Otherwise, block with HTTP 503 Service Unavailable
    const errorMsg =
      (isModuleDown && moduleSetting?.message) ||
      (moduleSetting ? `${moduleSetting.name} is currently under scheduled maintenance.` : null) ||
      settings.message ||
      "This section is currently under maintenance. Please check back shortly.";

    return res.status(503).json({
      success: false,
      maintenance: true,
      isGlobal,
      moduleKey: targetModuleKey || null,
      moduleName: moduleSetting?.name || (isGlobal ? "Global System" : "Module"),
      message: errorMsg,
      estimatedEndTime: settings.estimatedEndTime || null,
    });
  } catch (err) {
    console.error("Maintenance check error:", err);
    // On error, do not break regular operation
    return next();
  }
}

module.exports = {
  checkMaintenance,
  getCachedMaintenanceSettings,
  invalidateMaintenanceCache,
};

