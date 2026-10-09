const express = require("express");
const { createRecord, getRecords, getRecordById, updateRecord, deleteRecord } = require("../controllers/pendingSheet.controller");

const router = express.Router();

router.post("/", createRecord);
router.get("/", getRecords);
router.get("/:id", getRecordById);
router.put("/:id", updateRecord);
router.delete("/:id", deleteRecord);

module.exports = router;
