const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    publicId: { type: String, trim: true, maxlength: 500 },
    secureUrl: { type: String, trim: true, maxlength: 1200 },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    format: { type: String, trim: true, maxlength: 20 },
    alt: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const sectionStyleSchema = new mongoose.Schema(
  {
    backgroundColor: { type: String, default: "#fbf8f1", match: /^#[0-9a-f]{6}$/i },
    backgroundOpacity: { type: Number, default: 1, min: 0, max: 1 },
    imageOpacity: { type: Number, default: 0.72, min: 0, max: 1 },
    fontFamily: {
      type: String,
      enum: ["classic", "modern", "romantic", "elegant"],
      default: "classic",
    },
    fontSize: { type: Number, default: 64, min: 24, max: 120 },
  },
  { _id: false },
);

const textStyleSchema = new mongoose.Schema(
  {
    fontFamily: {
      type: String,
      enum: ["classic", "modern", "romantic", "elegant"],
      default: "classic",
    },
    fontSize: { type: Number, default: 34, min: 14, max: 80 },
    textColor: { type: String, default: "#315c4c", match: /^#[0-9a-f]{6}$/i },
  },
  { _id: false },
);

const colorPalette = {
  type: [{ type: String, match: /^#[0-9a-f]{6}$/i }],
  default: [],
  validate: {
    validator: (colors) => colors.length <= 8,
    message: "A dress-code palette can contain up to 8 colors",
  },
};

const isYouTubeUrl = (value) =>
  !value || /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{6,}(?:[?&][^\s]*)?$/i.test(value);

const invitationDesignSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventData: { type: mongoose.Schema.Types.ObjectId, ref: "EventData", required: true, unique: true },
    templateKey: { type: String, trim: true, maxlength: 80, default: "garden" },
    published: { type: Boolean, default: false },
    content: {
      coupleNames: { type: String, trim: true, maxlength: 160, default: "Our Wedding" },
      headline: { type: String, trim: true, maxlength: 200, default: "We're getting married" },
      welcomeMessage: { type: String, trim: true, maxlength: 2000, default: "Together with our families, we invite you to celebrate with us." },
      videoMessage: { type: String, trim: true, maxlength: 1000, default: "" },
      youtubeUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
        validate: { validator: isYouTubeUrl, message: "Enter a valid YouTube link" },
      },
      ceremonyVenue: { type: String, trim: true, maxlength: 300, default: "" },
      ceremonyAddress: { type: String, trim: true, maxlength: 500, default: "" },
      venue: { type: String, trim: true, maxlength: 300, default: "" },
      address: { type: String, trim: true, maxlength: 500, default: "" },
      ceremonyTime: { type: String, trim: true, maxlength: 20, default: "" },
      receptionVenue: { type: String, trim: true, maxlength: 300, default: "" },
      receptionAddress: { type: String, trim: true, maxlength: 500, default: "" },
      receptionTime: { type: String, trim: true, maxlength: 20, default: "" },
      dressCode: { type: String, trim: true, maxlength: 300, default: "" },
      dressCodeMen: { type: String, trim: true, maxlength: 1000, default: "" },
      dressCodeWomen: { type: String, trim: true, maxlength: 1000, default: "" },
      menColors: colorPalette,
      womenColors: colorPalette,
      entourageNote: { type: String, trim: true, maxlength: 1000, default: "" },
      contactMessage: { type: String, trim: true, maxlength: 500, default: "" },
      closingMessage: { type: String, trim: true, maxlength: 2000, default: "Thank you for being part of our story." },
    },
    theme: {
      primary: { type: String, default: "#315c4c", match: /^#[0-9a-f]{6}$/i },
      accent: { type: String, default: "#c89f65", match: /^#[0-9a-f]{6}$/i },
      background: { type: String, default: "#fbf8f1", match: /^#[0-9a-f]{6}$/i },
      text: { type: String, default: "#26332d", match: /^#[0-9a-f]{6}$/i },
      fontPair: { type: String, enum: ["classic", "modern", "romantic"], default: "classic" },
    },
    assets: {
      coverImage: assetSchema,
      coverCarousel: {
        type: [assetSchema],
        default: [],
        validate: {
          validator: (images) => images.length <= 8,
          message: "The cover carousel can contain up to 8 images",
        },
      },
      welcomeImage: assetSchema,
      menDressImage: assetSchema,
      womenDressImage: assetSchema,
      closingImage: assetSchema,
    },
    sections: {
      cover: { type: sectionStyleSchema, default: () => ({ backgroundColor: "#315c4c", backgroundOpacity: 1, imageOpacity: 0.72, fontFamily: "classic", fontSize: 72 }) },
      welcome: { type: sectionStyleSchema, default: () => ({ backgroundColor: "#fbf8f1", backgroundOpacity: 1, imageOpacity: 0.35, fontFamily: "classic", fontSize: 38 }) },
      greeting: { type: textStyleSchema, default: () => ({ fontFamily: "classic", fontSize: 34, textColor: "#315c4c" }) },
      closing: { type: sectionStyleSchema, default: () => ({ backgroundColor: "#315c4c", backgroundOpacity: 1, imageOpacity: 0.55, fontFamily: "classic", fontSize: 44 }) },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("InvitationDesign", invitationDesignSchema);
