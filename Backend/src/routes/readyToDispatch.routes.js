const express = require("express");
const router = express.Router();
const readyToDispatchController = require("../controllers/readyToDispatch.controller");
const { auth } = require("../middleware/auth.middleware");

router.get("/", auth, readyToDispatchController.getAllReadyToDispatch);
router.get("/:id", auth, readyToDispatchController.getReadyToDispatchById);
router.post("/", auth, readyToDispatchController.createReadyToDispatch);
router.put("/:id", auth, readyToDispatchController.updateReadyToDispatch);
router.delete("/:id", auth, readyToDispatchController.deleteReadyToDispatch);

module.exports = router;
