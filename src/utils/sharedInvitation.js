const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const secret = () => process.env.INVITATION_TOKEN_SECRET || process.env.JWT_SECRET;
const normalizeName = (name) => String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const guestCode = (eventId, guestId) => crypto.createHmac("sha256", secret())
  .update("guest-rsvp:" + eventId + ":" + guestId).digest("hex").slice(0, 10).toUpperCase();

function matchesCode(eventId, guestId, code) {
  if (!/^[0-9A-F]{10}$/.test(code)) return false;
  return crypto.timingSafeEqual(Buffer.from(guestCode(eventId, guestId)), Buffer.from(code));
}

function createProof(sharedKey, guestId) {
  return jwt.sign({ scope: "shared-rsvp", sharedKey, guestId: String(guestId) }, secret(), { expiresIn: "20m" });
}

function guestFromProof(proof, sharedKey) {
  try {
    const payload = jwt.verify(proof, secret());
    if (payload.scope === "shared-rsvp" && payload.sharedKey === sharedKey) return payload.guestId;
  } catch { return null; }
  return null;
}

module.exports = { normalizeName, guestCode, matchesCode, createProof, guestFromProof };
