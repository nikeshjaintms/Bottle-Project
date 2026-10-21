const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();

// Add all your allowed domains in this array
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "https://erp.shayonaglass.com",
  "https://application.shayonaglass.com",
  // Add more domains here anytime you need
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(cookieParser());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/uploads", express.static("uploads"));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/company", require("./routes/company.routes"));
app.use("/api/company-address", require("./routes/companyAddress.routes"));
app.use("/api/brand", require("./routes/brand.routes"));
app.use("/api/variant", require("./routes/variant.routes"));
app.use("/api/bottle-spec", require("./routes/bottlespecs.routes"));
app.use("/api/production", require("./routes/production.routes"));
app.use("/api/coating-production", require("./routes/coatingProduction.routes"));
app.use("/api/roles", require("./routes/role.routes"));
app.use("/api/permissions", require("./routes/permission.routes"));
app.use("/api/vision", require("./routes/vision.routes"));
app.use("/api/printing-type", require("./routes/printingType.routes"));
app.use("/api/printing-color", require("./routes/printingColor.routes"));
app.use("/api/coating-type", require("./routes/coatingType.routes"));
app.use("/api/text-color", require("./routes/textcolor.routes"));
app.use("/api/operator", require("./routes/operator.routes"));
app.use("/api/shift", require("./routes/shift.routes"));
app.use("/api/formula", require("./routes/formula.routes"));
app.use("/api/raw-material", require("./routes/rawMaterial.routes"));
app.use("/api/sg-label", require("./routes/sgLabel.routes"));
app.use("/api/sg-label-2", require("./routes/sgLabelTwoRoutes"));
app.use("/api/stock-entry", require("./routes/stockEntry.routes"));
app.use("/api/invoice-vision", require("./routes/invoiceVision.routes"));
app.use("/api/challan-vision", require("./routes/challanVision.routes"));
app.use("/api/shreno-vision", require("./routes/shrenoVision.routes"));
app.use("/api/unit", require("./routes/unit.routes"));
app.use("/api/incoming", require("./routes/incoming.routes"));
app.use("/api/bottle-per-box", require("./routes/bottlePerBox.routes"));
app.use("/api/item-type", require("./routes/itemType.routes"));
app.use("/api/lacquer-plan", require("./routes/lacquerPlan.routes"));
app.use("/api/printing-plan", require("./routes/printingPlan.routes"));
app.use("/api/pending-sheet", require("./routes/pendingSheet.routes"));
app.use("/api/shreno-incoming", require("./routes/shrenoIncoming.routes"));
app.use("/api/dispatch", require("./routes/dispatch.routes"));
app.use("/api/delivery-challan", require("./routes/deliveryChallan.routes"));
app.use("/api/ready-to-dispatch", require("./routes/readyToDispatch.routes"));
app.use("/api/summary", require("./routes/summary.routes"));

// Added testing routes for the browser
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Bottle Project API! The backend is running successfully." });
});

app.get("/api", (req, res) => {
  res.json({ message: "Bottle Project API is active. Please specify a specific endpoint (e.g., /api/users)." });
});

module.exports = app;
