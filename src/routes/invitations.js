const express = require("express");
const { randomBytes } = require("node:crypto");
const RsvpResponse = require("../models/RsvpResponse");
const { isValidObjectId } = require("mongoose");
const { normalizeSeating, removeGuestFromSeating } = require("../services/seatingService");
const EventData = require("../models/EventData");
const Invitation = require("../models/Invitation");
const InvitationDesign = require("../models/InvitationDesign");
const { protect } = require("../middleware/authMiddleware");
const { createInvitationToken } = require("../utils/invitationToken");
const { TYPOGRAPHY_FIELDS } = require("../utils/invitationTypography");
const cloudinaryConfig = require("../utils/cloudinaryConfig");

const router = express.Router();
router.use(protect);

const CONTENT_FIELDS = [
  "coverMonogram", "coverDateText", "dressGeneralNotes", "rsvpTitle", "rsvpButtonText",
  "coupleNames",
  "headline",
  "welcomeMessage",
  "welcomeHeadline", "seatingHeading", "dressHeading", "videoHeading", "ceremonyMap", "receptionMap",
  "videoMessage",
  "youtubeUrl",
  "ceremonyVenue",
  "ceremonyAddress",
  "venue",
  "address",
  "ceremonyTime",
  "receptionVenue",
  "receptionAddress",
  "receptionTime",
  "dressCode",
  "dressCodeMen",
  "dressCodeWomen",
  "menColors",
  "womenColors",
  "entourageNote",
  "contactMessage",
  "closingMessage",
];
const THEME_FIELDS = ["primary", "accent", "background", "text", "fontPair"];
const ASSET_FIELDS = ["publicId", "secureUrl", "width", "height", "format", "alt", "footerNote", "footerStyle"];
const ASSET_KEYS = ["coverLogo", "coverImage", "welcomeImage", "menDressImage", "womenDressImage", "ceremonyImage", "receptionImage", "closingImage"];
const SECTION_KEYS = ["cover", "welcome", "closing"];
const SECTION_STYLE_FIELDS = ["backgroundColor", "backgroundOpacity", "imageOpacity", "fontFamily", "fontSize"];
const TEXT_STYLE_FIELDS = ["fontFamily", "fontSize", "textColor"];

function pick(source = {}, fields) {
  if (!source || typeof source !== "object") return {};
  return Object.fromEntries(
    fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]),
  );
}

async function eventFor(owner) {
  return EventData.findOne({ user: owner });
}

function invitationDto(invitation) {
  return {
    _id: invitation._id,
    guestId: invitation.guestId,
    status: invitation.status,
    customMessage: invitation.customMessage || "",
    sentAt: invitation.sentAt,
    openedAt: invitation.openedAt,
    respondedAt: invitation.respondedAt,
    publicToken: createInvitationToken(invitation),
    updatedAt: invitation.updatedAt,
  };
}

router.get("/bootstrap", async (req, res) => {
  try {
    const eventData = await eventFor(req.user._id);
    if (!eventData) return res.status(404).json({ message: "Event data not found" });
    const [design, invitations] = await Promise.all([
      InvitationDesign.findOne({ eventData: eventData._id }),
      Invitation.find({ eventData: eventData._id, status: { $ne: "Revoked" } }),
    ]);
    let migrated = false;
    eventData.guests.forEach((guest) => {
      if (guest.confirmed && guest.rsvpStatus === "Pending") {
        guest.rsvpStatus = "Accepted";
        guest.attendingPax = Number(guest.pax || 1);
        migrated = true;
      }
    });
    if (migrated) await eventData.save();
    res.json({
      event: eventData.event || null,
      invitationSettings: eventData.invitationSettings,
      guests: eventData.guests,
      design,
      invitations: design?.sharedKey ? [] : invitations.map(invitationDto),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/rsvp/responses", async (req, res) => {
  try {
    const event = await EventData.findOne({ user: req.user._id }).select("_id").lean();
    if (!event) return res.status(404).json({ message: "Event not found" });
    const pageSize = 10;
    const filter = { eventData: event._id };
    const [total, checked] = await Promise.all([
      RsvpResponse.countDocuments(filter), RsvpResponse.countDocuments({ ...filter, checked: true }),
    ]);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const rows = await RsvpResponse.find(filter).select("fullName response declineReason checked createdAt")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
    res.set("Cache-Control", "no-store").json({ rows, total, checked, pages, page });
  } catch { res.status(500).json({ message: "Unable to load RSVP responses" }); }
});

router.patch("/rsvp/responses/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id) || typeof req.body.checked !== "boolean") {
      return res.status(400).json({ message: "Select a valid response and checkbox value" });
    }
    const event = await EventData.findOne({ user: req.user._id }).select("_id").lean();
    const updated = event && await RsvpResponse.findOneAndUpdate(
      { _id: req.params.id, eventData: event._id }, { $set: { checked: req.body.checked } }, { new: true },
    ).select("checked");
    if (!updated) return res.status(404).json({ message: "RSVP response not found" });
    res.json({ checked: updated.checked });
  } catch { res.status(500).json({ message: "Unable to update the checkbox" }); }
});

router.get("/rsvp/guest-updates", async (req, res) => {
  try {
    const event = await EventData.findOne({ user: req.user._id }).select("guests").lean();
    if (!event) return res.status(404).json({ message: "Event not found" });
    const guests = event.guests.filter((guest) => guest.respondedAt).map(({
      _id, rsvpStatus, confirmed, attendingPax, respondedAt, declineReason, status, tableNumber,
    }) => ({ _id, rsvpStatus, confirmed, attendingPax, respondedAt, declineReason, status, tableNumber }));
    res.set("Cache-Control", "no-store").json({ guests });
  } catch { res.status(500).json({ message: "Unable to refresh guest confirmations" }); }
});

router.patch("/rsvp/guests/:id", async (req, res) => {
  try {
    const { response } = req.body;
    if (!isValidObjectId(req.params.id) || !["Accepted", "Declined"].includes(response)) {
      return res.status(400).json({ message: "Select a valid guest and response" });
    }
    const event = await eventFor(req.user._id);
    const guest = event?.guests.id(req.params.id);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    guest.rsvpStatus = response;
    guest.confirmed = response === "Accepted";
    guest.attendingPax = guest.confirmed ? Number(guest.pax || 1) : 0;
    if (guest.confirmed) guest.declineReason = "";
    guest.respondedAt = new Date();
    if (!guest.confirmed) {
      removeGuestFromSeating(event, guest);
      normalizeSeating(event);
    }
    event.$where = { __v: event.__v };
    event.increment();
    await event.save();
    res.json({ guest });
  } catch (error) {
    if (["VersionError", "DocumentNotFoundError"].includes(error.name)) {
      return res.status(409).json({ message: "The guest list changed. Please try again." });
    }
    res.status(500).json({ message: "Unable to update the guest response" });
  }
});

router.post("/", async (req, res) => {
  try {
    const eventData = await eventFor(req.user._id);
    if (!eventData) return res.status(404).json({ message: "Event data not found" });
    const guest = eventData.guests.id(req.body.guestId);
    if (!guest) return res.status(404).json({ message: "Guest not found" });

    let invitation = await Invitation.findOne({ eventData: eventData._id, guestId: guest._id });
    if (!invitation) {
      invitation = await Invitation.create({
        owner: req.user._id,
        eventData: eventData._id,
        guestId: guest._id,
        customMessage: String(req.body.customMessage || "").trim(),
      });
    } else {
      invitation.status = "Draft";
      invitation.customMessage = String(req.body.customMessage || invitation.customMessage || "").trim();
      invitation.tokenVersion += 1;
      await invitation.save();
    }
    guest.invitationStatus = "Draft";
    await eventData.save();
    res.status(201).json(invitationDto(invitation));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ _id: req.params.id, owner: req.user._id });
    if (!invitation) return res.status(404).json({ message: "Invitation not found" });
    if (req.body.customMessage !== undefined) invitation.customMessage = String(req.body.customMessage).trim();
    if (req.body.status === "Sent") {
      invitation.status = "Sent";
      invitation.sentAt = new Date();
      const eventData = await EventData.findById(invitation.eventData);
      const guest = eventData?.guests.id(invitation.guestId);
      if (guest) {
        guest.invitationStatus = "Sent";
        await eventData.save();
      }
    }
    await invitation.save();
    res.json(invitationDto(invitation));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.post("/:id/regenerate-link", async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ _id: req.params.id, owner: req.user._id });
    if (!invitation) return res.status(404).json({ message: "Invitation not found" });
    invitation.tokenVersion += 1;
    invitation.status = "Draft";
    await invitation.save();
    res.json(invitationDto(invitation));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ _id: req.params.id, owner: req.user._id });
    if (!invitation) return res.status(404).json({ message: "Invitation not found" });
    invitation.status = "Revoked";
    invitation.tokenVersion += 1;
    await invitation.save();
    const eventData = await EventData.findById(invitation.eventData);
    const guest = eventData?.guests.id(invitation.guestId);
    if (guest) {
      guest.invitationStatus = "Not Created";
      await eventData.save();
    }
    res.json({ message: "Invitation revoked" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/design/current", async (req, res) => {
  try {
    const eventData = await eventFor(req.user._id);
    if (!eventData) return res.status(404).json({ message: "Event data not found" });
    const assets = Object.fromEntries(
      ASSET_KEYS
        .filter((key) => req.body.assets?.[key]?.secureUrl)
        .map((key) => [key, pick(req.body.assets[key], ASSET_FIELDS)]),
    );
    assets.coverCarousel = Array.isArray(req.body.assets?.coverCarousel)
      ? req.body.assets.coverCarousel
        .filter((asset) => asset?.secureUrl)
        .slice(0, 8)
        .map((asset) => pick(asset, ASSET_FIELDS))
      : [];
    const cloudName = cloudinaryConfig()?.cloudName;
    const ownedAsset = (asset) => {
      const prefix = "tietheknot/" + req.user._id + "/invitations/";
      try {
        const url = new URL(asset.secureUrl);
        return asset.publicId?.startsWith(prefix) && url.protocol === "https:" &&
          url.hostname === "res.cloudinary.com" &&
          Boolean(cloudName) && decodeURIComponent(url.pathname).startsWith("/" + cloudName + "/image/upload/") &&
          decodeURIComponent(url.pathname).includes("/" + asset.publicId + ".");
      } catch { return false; }
    };
    for (const key of ["menDressImages", "womenDressImages"]) {
      if (req.body.assets?.[key] === undefined) continue;
      const images = req.body.assets[key];
      if (!Array.isArray(images) || images.length > 3 || images.some((asset) => !ownedAsset(asset))) {
        return res.status(400).json({ message: "Select up to three images uploaded to your Studio account." });
      }
      assets[key] = images.map((asset) => pick(asset, ASSET_FIELDS));
    }
    for (const key of ["ceremonyImage", "receptionImage"]) {
      if (assets[key] && !ownedAsset(assets[key])) return res.status(400).json({ message: "Use a venue image uploaded to your Studio account." });
    }
    if (assets.coverLogo && !ownedAsset(assets.coverLogo)) {
      return res.status(400).json({ message: "Use a cover logo uploaded to your Studio account." });
    }
    const sections = Object.fromEntries(
      SECTION_KEYS.map((key) => [key, pick(req.body.sections?.[key], SECTION_STYLE_FIELDS)]),
    );
    sections.greeting = pick(req.body.sections?.greeting, TEXT_STYLE_FIELDS);
    sections.typography = Object.fromEntries(TYPOGRAPHY_FIELDS
      .filter((key) => req.body.sections?.typography?.[key])
      .map((key) => [key, pick(req.body.sections.typography[key], ["fontFamily", "fontSize", "textColor", "bold", "italic"])]));
    const update = {
      owner: req.user._id,
      eventData: eventData._id,
      templateKey: String(req.body.templateKey || "garden").trim(),
      ...(typeof req.body.published === "boolean" ? { published: req.body.published } : {}),
      content: pick(req.body.content, CONTENT_FIELDS),
      theme: pick(req.body.theme, THEME_FIELDS),
      assets,
      sections,
    };
    const design = await InvitationDesign.findOneAndUpdate(
      { eventData: eventData._id },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.json(design);
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.post("/design/publish", async (req, res) => {
  try {
    const eventData = await eventFor(req.user._id);
    if (!eventData) return res.status(404).json({ message: "Event data not found" });
    const design = await InvitationDesign.findOne({ eventData: eventData._id, owner: req.user._id });
    if (!design) return res.status(404).json({ message: "Save your design before publishing." });
    const published = req.body.published === true;
    if (published) {
      const { templateKey, content, theme, assets, sections } = design.toObject();
      design.sharedKey ||= randomBytes(18).toString("base64url");
      design.publishedSnapshot = { templateKey, content, theme, assets, sections };
    }
    design.published = published;
    await design.save();
    res.json(design.toObject({ transform: (doc, value) => {
      delete value.publishedSnapshot;
      return value;
    } }));
  } catch {
    res.status(500).json({ message: "Unable to update publication." });
  }
});

router.patch("/settings/current", async (req, res) => {
  try {
    const eventData = await eventFor(req.user._id);
    if (!eventData) return res.status(404).json({ message: "Event data not found" });
    eventData.invitationSettings = {
      ...(eventData.invitationSettings?.toObject?.() || eventData.invitationSettings || {}),
      seatingReleased: Boolean(req.body.seatingReleased),
    };
    await eventData.save();
    res.json(eventData.invitationSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
