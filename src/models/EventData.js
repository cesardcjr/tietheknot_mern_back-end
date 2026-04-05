const mongoose = require("mongoose");

const guestSchema = new mongoose.Schema(
  {
    _localId: Number,
    name: String,
    pax: { type: Number, default: 1 },
    category: String,
    status: { type: String, default: "Not Seated" },
    tableNumber: mongoose.Schema.Types.Mixed,
    confirmed: { type: Boolean, default: false },
    remarks: String,
    listedBy: String,
  },
  { _id: true },
);

const expenseSchema = new mongoose.Schema(
  {
    _localId: Number,
    supplierName: String,
    expenseType: String,
    cost: { type: Number, default: 0 },
    downpayment: { type: Number, default: 0 },
    contactPerson: String,
    contactNum: String,
    paymentStatus: { type: String, default: "Not Paid" },
    paymentTracker: String,
  },
  { _id: true },
);

const taskSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: String,
    details: String,
    dueDate: String,
    status: { type: String, default: "Not Started" },
  },
  { _id: true },
);

const checklistSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: String,
    details: String,
    checked: { type: Boolean, default: false },
  },
  { _id: true },
);

const programSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: String,
    startTime: String,
    endTime: String,
    details: String,
    _start: String,
    _end: String,
  },
  { _id: true },
);

const supplierSchema = new mongoose.Schema(
  {
    _localId: Number,
    supplierName: String,
    categoryType: String,
    quotedPrice: { type: Number, default: 0 },
    contactPerson: String,
    contactNum: String,
    location: String,
    links: String,
    quoteDetails: String,
  },
  { _id: true },
);

const eventSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: String,
    targetDate: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const eventDataSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    guestSettings: {
      expectedGuests: { type: Number, default: 0 },
      initialized: { type: Boolean, default: false },
    },
    guests: [guestSchema],
    nominatedGuests: {
      type: [String],
      default: [],
    },
    primarySponsors: [String],
    secondarySponsors: [String],
    seatingSettings: {
      tableCount: { type: Number, default: 0 },
      maxPerTable: { type: Number, default: 10 },
      initialized: { type: Boolean, default: false },
    },
    seating: { type: mongoose.Schema.Types.Mixed, default: {} },
    presidentialSettings: {
      tableCount: { type: Number, default: 0 },
      maxPerTable: { type: Number, default: 10 },
    },
    presidentialSeating: { type: mongoose.Schema.Types.Mixed, default: {} },
    expenseSettings: {
      budget: { type: Number, default: 0 },
      initialized: { type: Boolean, default: false },
    },
    expenses: [expenseSchema],
    tasks: [taskSchema],
    checklist: [checklistSchema],
    program: [programSchema],
    suppliers: [supplierSchema],
    event: eventSchema,
  },
  { timestamps: true },
);

module.exports = mongoose.model("EventData", eventDataSchema);
