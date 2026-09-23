const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect, adminOnly);

// GET /api/users — administrator account review list
router.get("/", async (req, res) => {
  try {
    const users = await User.find({})
      .select("username fullName isAdmin isActive createdDate")
      .sort({ createdDate: -1 });
    res.json({ users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load users" });
  }
});

// PATCH /api/users/:id/status — activate or deactivate a regular user
router.patch("/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Account status must be active or inactive" });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.isAdmin) {
      return res.status(403).json({ message: "Administrator accounts cannot be deactivated here" });
    }

    target.isActive = isActive;
    await target.save();
    res.json({ user: target.toSafeObject() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to update account status" });
  }
});

module.exports = router;
