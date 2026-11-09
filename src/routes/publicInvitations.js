const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { normalizeName, matchesCode, createProof, guestFromProof } = require("../utils/sharedInvitation");
const EventData = require("../models/EventData");
const Invitation = require("../models/Invitation");
const InvitationDesign = require("../models/InvitationDesign");
const { normalizeSeating, removeGuestFromSeating } = require("../services/seatingService");
const { verifyInvitationToken } = require("../utils/invitationToken");

const router = express.Router();

async function invitationContext(token) {
  const payload = verifyInvitationToken(token);
  const invitation = await Invitation.findById(payload.invitationId);
  if (
    !invitation ||
    invitation.status === "Revoked" ||
    invitation.tokenVersion !== payload.version
  ) {
    return null;
  }
  const [eventData, design] = await Promise.all([
    EventData.findById(invitation.eventData),
    InvitationDesign.findOne({ eventData: invitation.eventData }),
  ]);
  const guest = eventData?.guests.id(invitation.guestId);
  if (!eventData || !guest || !design?.published) return null;
  return { invitation, eventData, design, guest };
}

function publicResponse({ invitation, eventData, design, guest }) {
  return {
    invitation: {
      status: invitation.status,
      customMessage: invitation.customMessage || "",
    },
    event: eventData.event
      ? { title: eventData.event.title, targetDate: eventData.event.targetDate }
      : null,
    design: {
      templateKey: design.templateKey,
      content: design.content,
      theme: design.theme,
      assets: design.assets,
      sections: design.sections,
    },
    guest: {
      name: guest.name,
      invitedPax: guest.pax,
      rsvpStatus: guest.rsvpStatus,
      attendingPax: guest.attendingPax,
      declineReason: guest.declineReason || "",
    },
    seating: {
      released: Boolean(eventData.invitationSettings?.seatingReleased),
      tableLabel:
        eventData.invitationSettings?.seatingReleased && guest.status === "Seated"
          ? String(guest.tableNumber).startsWith("P")
            ? `Presidential Table ${String(guest.tableNumber).slice(1)}`
            : `Table ${guest.tableNumber}`
          : null,
    },
  };
}

const searchLimit = rateLimit({ windowMs: 60_000, limit: 45 });
const verifyLimit = rateLimit({ windowMs: 15 * 60_000, limit: 12 });
const responseLimit = rateLimit({ windowMs: 60_000, limit: 20 });

async function sharedDesign(key) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(key)) return null;
  return InvitationDesign.findOne({ sharedKey: key, published: true }).select("+publishedSnapshot").lean();
}

const unavailable = (res) => res.status(404).json({ message: "Invitation not found or unavailable" });
const responseStatus = (guest) => guest.rsvpStatus === "Declined" ? "Declined" :
  guest.rsvpStatus === "Accepted" || guest.confirmed ? "Accepted" : "Pending";

router.use("/event/:key", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/event/:key", async (req, res) => {
  try {
    const design = await sharedDesign(req.params.key);
    if (!design?.publishedSnapshot) return unavailable(res);
    const event = await EventData.findById(design.eventData).select("event").lean();
    if (!event) return unavailable(res);
    res.json({
      design: design.publishedSnapshot,
      event: event.event ? { title: event.event.title, targetDate: event.event.targetDate } : null,
    });
  } catch {
    res.status(500).json({ message: "Unable to open this invitation" });
  }
});

router.post("/event/:key/search", searchLimit, async (req, res) => {
  try {
    const design = await sharedDesign(req.params.key);
    if (!design?.publishedSnapshot) return unavailable(res);
    const query = normalizeName(req.body.query).slice(0, 160);
    if (query.length < 3) return res.json({ names: [] });
    const event = await EventData.findById(design.eventData).select("guests.name").lean();
    if (!event) return unavailable(res);
    const names = new Map();
    for (const { name } of event.guests) {
      const normalized = normalizeName(name);
      if (normalized.includes(query)) names.set(normalized, name);
      if (names.size === 6) break;
    }
    res.json({ names: [...names.values()] });
  } catch {
    res.status(500).json({ message: "Unable to search guests" });
  }
});

router.post("/event/:key/verify", verifyLimit, async (req, res) => {
  try {
    const design = await sharedDesign(req.params.key);
    if (!design?.publishedSnapshot) return unavailable(res);
    const name = normalizeName(req.body.name);
    const code = String(req.body.code || "").trim().toUpperCase();
    const event = await EventData.findById(design.eventData).select("guests").lean();
    const matching = (event?.guests || []).filter((guest) =>
      normalizeName(guest.name) === name && matchesCode(event._id, guest._id, code));
    if (matching.length !== 1) return res.status(403).json({ message: "The name and RSVP code did not match. Please check with the host." });
    const [guest] = matching;
    res.json({ proof: createProof(design.sharedKey, guest._id), status: responseStatus(guest) });
  } catch {
    res.status(500).json({ message: "Unable to verify your RSVP code" });
  }
});

router.post("/event/:key/rsvp", responseLimit, async (req, res) => {
  try {
    const design = await sharedDesign(req.params.key);
    if (!design?.publishedSnapshot) return unavailable(res);
    const guestId = guestFromProof(req.body.proof, design.sharedKey);
    if (!guestId) return res.status(403).json({ message: "Verify your RSVP code again to continue." });
    const { rsvpStatus } = req.body;
    const declineReason = String(req.body.declineReason || "").trim();
    if (!["Accepted", "Declined"].includes(rsvpStatus) ||
      (rsvpStatus === "Declined" && (!declineReason || declineReason.length > 1000))) {
      return res.status(400).json({ message: "Select a response and include a brief reason if declining." });
    }
    const eventData = await EventData.findById(design.eventData);
    const guest = eventData?.guests.id(guestId);
    if (!guest) return unavailable(res);
    const reason = rsvpStatus === "Declined" ? declineReason : "";
    if (guest.respondedAt && guest.rsvpStatus === rsvpStatus && (guest.declineReason || "") === reason) {
      return res.json({ status: rsvpStatus });
    }
    guest.rsvpStatus = rsvpStatus;
    guest.confirmed = rsvpStatus === "Accepted";
    guest.attendingPax = guest.confirmed ? Number(guest.pax || 1) : 0;
    guest.declineReason = reason;
    guest.respondedAt = new Date();
    guest.invitationStatus = "Responded";
    if (!guest.confirmed) {
      removeGuestFromSeating(eventData, guest);
      normalizeSeating(eventData);
    }
    eventData.$where = { __v: eventData.__v };
    eventData.increment();
    await eventData.save();
    res.json({ status: rsvpStatus });
  } catch (err) {
    if (["VersionError", "DocumentNotFoundError"].includes(err.name)) {
      return res.status(409).json({ message: "The guest list changed. Please try again." });
    }
    res.status(500).json({ message: "Unable to save this RSVP" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const context = await invitationContext(req.params.token);
    if (!context) return res.status(404).json({ message: "Invitation not found or unavailable" });
    if (context.design.sharedKey) return res.json({ sharedKey: context.design.sharedKey });
    if (!context.invitation.openedAt) context.invitation.openedAt = new Date();
    if (["Draft", "Sent"].includes(context.invitation.status)) context.invitation.status = "Opened";
    if (["Not Created", "Draft", "Sent"].includes(context.guest.invitationStatus)) {
      context.guest.invitationStatus = "Opened";
    }
    await Promise.all([context.invitation.save(), context.eventData.save()]);
    res.json(publicResponse(context));
  } catch (err) {
    res.status(["JsonWebTokenError", "TokenExpiredError"].includes(err.name) ? 404 : 500).json({
      message: ["JsonWebTokenError", "TokenExpiredError"].includes(err.name)
        ? "Invitation not found or unavailable"
        : "Unable to open this invitation",
    });
  }
});

router.post("/:token/rsvp", async (req, res) => {
  try {
    const context = await invitationContext(req.params.token);
    if (!context) return res.status(404).json({ message: "Invitation not found or unavailable" });
    if (context.design.sharedKey) return res.status(409).json({ message: "Open the shared invitation to respond." });
    const rsvpStatus = req.body.rsvpStatus;
    if (!["Accepted", "Declined"].includes(rsvpStatus)) {
      return res.status(400).json({ message: "Choose Accepted or Declined" });
    }
    const attendingPax = rsvpStatus === "Accepted" ? Number(context.guest.pax || 1) : 0;
    const declineReason = String(req.body.declineReason || "").trim();
    if (rsvpStatus === "Declined" && !declineReason) {
      return res.status(400).json({ message: "Please tell the couple why you cannot attend" });
    }

    context.guest.rsvpStatus = rsvpStatus;
    context.guest.attendingPax = attendingPax;
    context.guest.confirmed = rsvpStatus === "Accepted";
    context.guest.declineReason = rsvpStatus === "Declined" ? declineReason : "";
    context.guest.respondedAt = new Date();
    context.guest.invitationStatus = "Responded";
    if (rsvpStatus === "Declined") {
      removeGuestFromSeating(context.eventData, context.guest);
      normalizeSeating(context.eventData);
    }
    context.invitation.status = "Responded";
    context.invitation.respondedAt = new Date();
    await Promise.all([context.eventData.save(), context.invitation.save()]);
    res.json(publicResponse(context));
  } catch (err) {
    res.status(["JsonWebTokenError", "TokenExpiredError"].includes(err.name) ? 404 : err.name === "ValidationError" ? 400 : 500).json({
      message: ["JsonWebTokenError", "TokenExpiredError"].includes(err.name)
        ? "Invitation not found or unavailable"
        : err.name === "ValidationError" ? err.message : "Unable to save this RSVP",
    });
  }
});

module.exports = router;
