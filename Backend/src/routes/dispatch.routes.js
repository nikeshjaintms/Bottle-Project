const express = require("express");
const router = express.Router();
const dispatchController = require("../controllers/dispatch.controller");
const { auth } = require("../middleware/auth.middleware");

router.get("/", auth, dispatchController.getAllDispatch);
router.get("/:id", auth, dispatchController.getDispatchById);
router.post("/", auth, dispatchController.createDispatch);
router.put("/:id", auth, dispatchController.updateDispatch);
router.delete("/:id", auth, dispatchController.deleteDispatch);

module.exports = router;
