const router = require("express").Router();

const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserById,
  uploadProfileImage,
  deleteProfileImage,
} = require("../controllers/user.controller");

const { auth } = require("../middleware/auth.middleware");
const checkAbility = require("../middleware/checkAbility");
const upload = require("../middleware/upload.middleware");

// 👑 Only admin can manage users

// CREATE
router.post(
  "/",
  auth,
  checkAbility("create", "user"),
  createUser
);

// GET ALL
router.get(
  "/",
  auth,
  checkAbility("read", "user"),
  getUsers
);

// GET SINGLE USER
router.get(
  "/:id",
  auth,
  checkAbility("read", "user"),
  getUserById
);

// UPDATE USER
router.put(
  "/:id",
  auth,
  checkAbility("edit", "user"),
  updateUser
);

// DELETE USER
router.delete(
  "/:id",
  auth,
  checkAbility("delete", "user"),
  deleteUser
);

// UPLOAD PROFILE IMAGE
router.post(
  "/:id/profile-image",
  auth,
  upload.single("image"),
  uploadProfileImage
);

// DELETE PROFILE IMAGE
router.delete(
  "/:id/profile-image",
  auth,
  deleteProfileImage
);

module.exports = router;