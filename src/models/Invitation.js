const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventData: { type: mongoose.Schema.Types.ObjectId, ref: "EventData", required: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tokenVersion: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["Draft", "Sent", "Opened", "Responded", "Revoked"],
      default: "Draft",
    },
    customMessage: { type: String, trim: true, maxlength: 1500 },
    sentAt: Date,
    openedAt: Date,
    respondedAt: Date,
  },
  { timestamps: true },
);

invitationSchema.index({ eventData: 1, guestId: 1 }, { unique: true });

module.exports = mongoose.model("Invitation", invitationSchema);
