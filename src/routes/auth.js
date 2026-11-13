const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const EventData = require("../models/EventData");

const { createHash, randomBytes } = require("node:crypto");
const { rateLimit } = require("express-rate-limit");
const { protect } = require("../middleware/authMiddleware");
const StudioHandoff = require("../models/StudioHandoff");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const handoffLimit = rateLimit({ windowMs: 60_000, limit: 20 });
const codeHash = (value) => createHash("sha256").update(value).digest("base64url");
const isChallenge = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const studioOrigin = () => new URL(process.env.INVITATION_STUDIO_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5174" : "https://tietheknot-invitation-maker.vercel.app")).origin;

router.post("/studio-handoff", handoffLimit, protect, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { challenge } = req.body;
    if (!isChallenge(challenge)) return res.status(400).json({ message: "Invalid Studio sign-in request" });
    const code = randomBytes(32).toString("base64url");
    await StudioHandoff.create({ codeHash: codeHash(code), challenge, user: req.user._id, expiresAt: new Date(Date.now() + 60_000) });
    res.json({ code, callback: studioOrigin() + "/handoff" });
  } catch {
    res.status(500).json({ message: "Unable to start Studio sign-in" });
  }
});

router.post("/studio-handoff/exchange", handoffLimit, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { code, verifier } = req.body;
    if (req.get("Origin") !== studioOrigin() || !isChallenge(code) || !isChallenge(verifier)) {
      return res.status(400).json({ message: "Invalid Studio sign-in request" });
    }
    const handoff = await StudioHandoff.findOneAndDelete({ codeHash: codeHash(code), challenge: codeHash(verifier), expiresAt: { $gt: new Date() } });
    const user = handoff && await User.findById(handoff.user);
    if (!user?.isActive) return res.status(401).json({ message: "Studio sign-in has expired. Open Studio again from Planner." });
    res.json({ token: generateToken(user._id), user: user.toSafeObject() });
  } catch {
    res.status(500).json({ message: "Unable to complete Studio sign-in" });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  let user;
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const fullName = String(req.body.fullName || "").trim();
    const contactNumber = String(req.body.contactNumber || "").trim();

    if (!username || !password || !fullName || !contactNumber) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(409).json({ message: "Username already taken" });
    }

    user = await User.create({
      username,
      password,
      fullName,
      contactNumber,
      isAdmin: false,
      createdDate: new Date(),
    });

    // Initialize empty event data for this user
    await EventData.create({ user: user._id });

    res.status(201).json({
      user: user.toSafeObject(),
      requiresApproval: true,
    });
  } catch (error) {
    console.error(error);
    if (user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Username already taken" });
    }
    res.status(500).json({ message: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
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
