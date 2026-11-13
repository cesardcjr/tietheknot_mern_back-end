const mongoose = require("mongoose");

const studioHandoff = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  challenge: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = mongoose.model("StudioHandoff", studioHandoff);
