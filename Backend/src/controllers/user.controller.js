const User = require("../models/user");
const bcrypt = require("bcryptjs");

// ✅ CREATE USER
exports.createUser = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

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
      name
    });

    await user.populate({ path: "role", populate: { path: "permissions" } });
    res.json(user);

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
    );

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
    ).populate({
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
