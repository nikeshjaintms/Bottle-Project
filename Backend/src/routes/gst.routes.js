const express = require("express");
const router = express.Router();
const { addGst, getAllGst, getSingleGst, updateGst, deleteGst } = require("../controllers/gst.controller");

router.post("/", addGst);
router.get("/", getAllGst);
router.get("/:id", getSingleGst);
router.put("/:id", updateGst);
router.delete("/:id", deleteGst);

module.exports = router;
