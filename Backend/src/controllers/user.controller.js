const User = require("../models/user");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

// ✅ CREATE USER
exports.createUser = async (req, res) => {
  try {
    const { email, password, role, name, image } = req.body;

    const loweremail = email.toLowerCase();

    const existingUser = await User.findOne({ email: loweremail, isDeleted: { $ne: true } });

    if (existingUser) {
      return res.status(400).json("User with this email already exists.");
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: loweremail,
      password: hashed,
      role,
      name,
      image: image || ""
    });

    await user.populate({ path: "role", populate: { path: "permissions" } });
    res.json(user.toObject({ versionKey: false }));

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json("User with this email already exists.");
    }
    res.status(500).json(err.message);
  }
};

// ✅ GET ALL USERS (Backend Pagination + Search + Filter)

exports.getUsers = async (req, res) => {

  try {

    let {
      page,
      limit,
      search,
      status = "all",
      sortKey = "name",
      sortDirection = "asc",
      pagination = "true",
    } = req.query;

    let parsedPage = 1;
    if (page && page !== '') {
      parsedPage = parseInt(page) || 1;
      res.cookie('usersPage', parsedPage, { maxAge: 86400000, httpOnly: true });
    } else if (req.cookies.usersPage) {
      parsedPage = parseInt(req.cookies.usersPage) || 1;
    }

    const parsedLimit = parseInt(limit) || 10;

    let filter = {
      isDeleted: { $ne: true },
    };

    // STATUS FILTER
    if (status && status !== "all") {
      filter.status = status;
    }

    // SEARCH
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // SORT
    let sort = {};
    sort[sortKey === "role" ? "role.name" : sortKey] = sortDirection === "asc" ? 1 : -1;

    const populateOpts = {
      path: "role",
      populate: { path: "permissions" },
    };

    // NO PAGINATION - return all records
    if (pagination === "false") {
      const users = await User.find(filter)
        .select("-password")
        .populate(populateOpts)
        .sort(sort)
        .lean();
      return res.json({ success: true, data: users, total: users.length });
    }

    // WITH PAGINATION
    const skip = (parsedPage - 1) * parsedLimit;

    const users = await User.find(filter)
      .select("-password")
      .populate(populateOpts)
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit).lean();

    const total = await User.countDocuments(filter);

    // ADD THESE LINES HERE
const activeCount = await User.countDocuments({
  isDeleted: { $ne: true },
  status: "active",
});

const inactiveCount = await User.countDocuments({
  isDeleted: { $ne: true },
  status: "inactive",
});

const pendingCount = await User.countDocuments({
  isDeleted: { $ne: true },
  status: "pending",
});

res.json({
  success: true,
  data: users,
  page: parsedPage,
  totalPages: Math.ceil(total / parsedLimit),
  total,
  activeCount,
  inactiveCount,
  pendingCount,
});

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};

// ✅ UPDATE USER
exports.updateUser = async (req, res) => {
  try {

    const { id } = req.params;

    const data = req.body;

    // if password updated → hash, otherwise remove it from data to prevent overwriting with empty
    if (data.password && data.password.trim() !== '') {
      data.password = await bcrypt.hash(data.password, 10);
    } else {
      delete data.password;
    }

    const user = await User.findByIdAndUpdate(
      id,
      data,
      {
        returnDocument: "after",
      }
    ).select("-password").populate({
      path: "role",
      populate: { path: "permissions" }
    });

    res.json(user);

  } catch (err) {

    res.status(500).json(err.message);

  }
};

// ✅ DELETE USER
exports.deleteUser = async (req, res) => {
  try {

    await User.findByIdAndUpdate(req.params.id, { isDeleted: true }, { returnDocument: 'after' });

    res.json({ msg: "User Deleted" });

  } catch (err) {
    res.status(500).json(err.message);
  }
};


exports.getUserById = async (req, res) => {

  try {

    const user = await User.findById(
      req.params.id
    ).select("-password").populate({
      path: "role",
      populate: {
        path: "permissions"
      }
    });

    if (!user) {

      return res.status(404).json({
        message: "User not found",
      });

    }

    res.json(user);

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }

};

// ✅ UPLOAD PROFILE IMAGE
exports.uploadProfileImage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();
    const userRole = typeof req.user.role === 'object' ? req.user.role.name : req.user.role;

    // Authorization: user can only upload own image unless admin
    if (userId !== id && userRole !== "Admin") {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ message: "Unauthorized: Cannot upload image for another user" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Invalid file type. Only JPG, PNG, and WEBP are allowed." });
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "File size exceeds 5MB limit" });
    }

    // Get user to check old image
    const user = await User.findById(id);
    if (!user) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "User not found" });
    }

    // Delete old image if exists
    if (user.image) {
      const oldImagePath = path.join(__dirname, "../../", user.image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Generate image path relative to project root
    const imagePath = `uploads/${req.file.filename}`;

    // Update user with new image
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { image: imagePath },
      { returnDocument: "after" }
    ).select("-password").populate({
      path: "role",
      populate: { path: "permissions" }
    });

    res.json(updatedUser);

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE PROFILE IMAGE
exports.deleteProfileImage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();
    const userRole = typeof req.user.role === 'object' ? req.user.role.name : req.user.role;

    // Authorization: user can only delete own image unless admin
    if (userId !== id && userRole !== "Admin") {
      return res.status(403).json({ message: "Unauthorized: Cannot delete image for another user" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete image file if exists
    if (user.image) {
      const imagePath = path.join(__dirname, "../../", user.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Remove image from user document
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { image: "" },
      { returnDocument: "after" }
    ).select("-password").populate({
      path: "role",
      populate: { path: "permissions" }
    });

    res.json(updatedUser);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
