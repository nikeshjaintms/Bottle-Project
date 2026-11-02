const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,

  email: {
    type: String,
    required: true,
    // unique: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role",
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  image: {
    type: String,
    default: ""
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model("User", userSchema);