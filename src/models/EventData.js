const mongoose = require("mongoose");

const guestSchema = new mongoose.Schema(
  {
    _localId: Number,
    name: { type: String, required: true, trim: true, maxlength: 120 },
    pax: { type: Number, default: 1, min: 1, max: 50 },
    category: {
      type: String,
      enum: ["Principal", "Secondary", "Family", "Friends", "VIP", "Others"],
      default: "Family",
    },
    status: { type: String, enum: ["Not Seated", "Seated"], default: "Not Seated" },
    tableNumber: mongoose.Schema.Types.Mixed,
    confirmed: { type: Boolean, default: false },
    remarks: { type: String, maxlength: 1000 },
    listedBy: { type: String, trim: true, maxlength: 120 },
  },
  { _id: true },
);

const expenseSchema = new mongoose.Schema(
  {
    _localId: Number,
    supplierName: { type: String, required: true, trim: true, maxlength: 160 },
    expenseType: { type: String, trim: true, maxlength: 80 },
    cost: { type: Number, default: 0, min: 0 },
    downpayment: { type: Number, default: 0, min: 0 },
    contactPerson: { type: String, maxlength: 120 },
    contactNum: { type: String, maxlength: 40 },
    paymentStatus: { type: String, enum: ["Paid", "Incomplete", "Not Paid"], default: "Not Paid" },
    paymentTracker: { type: String, maxlength: 4000 },
  },
  { _id: true },
);

const taskSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: { type: String, required: true, trim: true, maxlength: 160 },
    details: { type: String, maxlength: 2000 },
    dueDate: String,
    status: { type: String, enum: ["Not Started", "In-Progress", "Completed", "Cancelled"], default: "Not Started" },
  },
  { _id: true },
);

const checklistSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: { type: String, required: true, trim: true, maxlength: 160 },
    details: { type: String, maxlength: 2000 },
    checked: { type: Boolean, default: false },
  },
  { _id: true },
);

const programSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: { type: String, required: true, trim: true, maxlength: 160 },
    startTime: String,
    endTime: String,
    details: { type: String, maxlength: 2000 },
    _start: String,
    _end: String,
  },
  { _id: true },
);

const supplierSchema = new mongoose.Schema(
  {
    _localId: Number,
    supplierName: { type: String, required: true, trim: true, maxlength: 160 },
    categoryType: String,
    quotedPrice: { type: Number, default: 0, min: 0 },
    contactPerson: { type: String, maxlength: 120 },
    contactNum: { type: String, maxlength: 40 },
    location: { type: String, maxlength: 300 },
    links: {
      type: String,
      maxlength: 1000,
      validate: {
        validator: (value) => !value || /^https?:\/\//i.test(value),
        message: "Supplier link must use http or https",
      },
    },
    quoteDetails: { type: String, maxlength: 4000 },
  },
  { _id: true },
);

const eventSchema = new mongoose.Schema(
  {
    _localId: Number,
    title: { type: String, required: true, trim: true, maxlength: 160 },
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
      expectedGuests: { type: Number, default: 0, min: 0, max: 100000 },
      initialized: { type: Boolean, default: false },
    },
    guests: [guestSchema],
    nominatedGuests: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      default: [],
    },
    primarySponsors: [String],
    secondarySponsors: [String],
    seatingSettings: {
      tableCount: { type: Number, default: 0, min: 0, max: 10000 },
      maxPerTable: { type: Number, default: 10, min: 1, max: 1000 },
      initialized: { type: Boolean, default: false },
    },
    seating: { type: mongoose.Schema.Types.Mixed, default: {} },
    presidentialSettings: {
      tableCount: { type: Number, default: 0, min: 0, max: 1000 },
      maxPerTable: { type: Number, default: 10, min: 1, max: 1000 },
    },
    presidentialSeating: { type: mongoose.Schema.Types.Mixed, default: {} },
    expenseSettings: {
      budget: { type: Number, default: 0, min: 0 },
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
