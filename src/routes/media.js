const crypto = require("crypto");
const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect);

function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
}

function sign(params, secret) {
  const input = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${input}${secret}`).digest("hex");
}

router.post("/signature", (req, res) => {
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ message: "Cloudinary is not configured" });
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: `tietheknot/${req.user._id}/invitations`,
    timestamp,
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || undefined,
  };
  res.json({
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder: params.folder,
    uploadPreset: params.upload_preset,
    signature: sign(params, config.apiSecret),
  });
});

router.delete("/image", async (req, res) => {
  try {
    const config = cloudinaryConfig();
    if (!config) return res.status(503).json({ message: "Cloudinary is not configured" });
    const publicId = String(req.body.publicId || "");
    const allowedPrefix = `tietheknot/${req.user._id}/invitations/`;
    if (!publicId.startsWith(allowedPrefix)) {
      return res.status(403).json({ message: "Image does not belong to this account" });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { invalidate: true, public_id: publicId, timestamp };
    const body = new URLSearchParams({
      ...params,
      api_key: config.apiKey,
      signature: sign(params, config.apiSecret),
    });
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = await response.json();
    if (!response.ok) return res.status(502).json({ message: result.error?.message || "Cloudinary deletion failed" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
