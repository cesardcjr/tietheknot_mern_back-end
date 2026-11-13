const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  eventData: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestId: { type: String, required: true },
  fullName: { type: String, trim: true, required: true, maxlength: 160 },
  response: { type: String, required: true, enum: ["Accepted", "Declined"] },
  declineReason: { type: String, trim: true, maxlength: 1000 },
  checked: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ eventData: 1, requestId: 1 }, { unique: true });
schema.index({ eventData: 1, createdAt: -1, _id: -1 });
schema.index({ eventData: 1, checked: 1 });

module.exports = mongoose.model("RsvpResponse", schema);
