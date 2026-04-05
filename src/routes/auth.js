const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const EventData = require("../models/EventData");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password, fullName, contactNumber } = req.body;

    if (!username || !password || !fullName || !contactNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      password,
      fullName,
      contactNumber,
      isAdmin: false,
      createdDate: new Date(),
    });

    // Initialize empty event data for this user
    await EventData.create({ user: user._id });

    const token = generateToken(user._id);
    res.status(201).json({
      token,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Check if user account is active
    if (!user.isActive) {
      return res
        .status(403)
        .json({
          message: "User account is not yet active, please contact Admin",
        });
    }

    const token = generateToken(user._id);
    res.json({
      token,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error during login" });
  }
});

module.exports = router;
