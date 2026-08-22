const express = require("express");
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

router.get("/:token", async (req, res) => {
  try {
    const context = await invitationContext(req.params.token);
    if (!context) return res.status(404).json({ message: "Invitation not found or unavailable" });
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
