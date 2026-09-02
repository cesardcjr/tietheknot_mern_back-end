const express = require("express");
const router = express.Router();
const EventData = require("../models/EventData");
const Invitation = require("../models/Invitation");
const { protect } = require("../middleware/authMiddleware");
const {
  guestPax,
  normalizeSeating,
  removeGuestFromSeating,
  resolveGuest,
  seatingResponse,
} = require("../services/seatingService");

// Helper: get or create event data for user
async function getOrCreate(userId) {
  let data = await EventData.findOne({ user: userId });
  if (!data) data = await EventData.create({ user: userId });
  return data;
}

const GUEST_FIELDS = [
  "name",
  "pax",
  "category",
  "confirmed",
  "rsvpStatus",
  "attendingPax",
  "email",
  "phone",
  "dietaryNotes",
  "guestMessage",
  "declineReason",
  "remarks",
  "listedBy",
];
const EXPENSE_FIELDS = ["supplierName", "expenseType", "cost", "downpayment", "contactPerson", "contactNum", "paymentStatus", "paymentTracker"];
const TASK_FIELDS = ["title", "details", "dueDate", "status"];
const CHECKLIST_FIELDS = ["title", "details", "checked"];
const PROGRAM_FIELDS = ["title", "startTime", "endTime", "details", "_start", "_end"];
const SUPPLIER_FIELDS = ["supplierName", "categoryType", "quotedPrice", "contactPerson", "contactNum", "location", "links", "quoteDetails"];
const EVENT_FIELDS = ["title", "targetDate"];
const FLOOR_ELEMENT_TYPES = new Set(["table", "shape", "chair"]);
const FLOOR_TABLE_KINDS = new Set(["round", "presidential", "free"]);
const FLOOR_SHAPE_KINDS = new Set(["stage", "dance-floor", "custom"]);

function pick(source, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]]),
  );
}

function validateGuestRsvp(guest) {
  const pax = Number(guest.pax || 1);
  const attendingPax = Number(guest.attendingPax || 0);
  if (guest.rsvpStatus === "Accepted" && (attendingPax < 1 || attendingPax > pax)) {
    return `Attending pax must be between 1 and ${pax}`;
  }
  if (guest.rsvpStatus === "Declined" && attendingPax !== 0) {
    return "Declined guests must have zero attending pax";
  }
  return null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function sanitizeFloorPlan(input = {}) {
  const paperSize = ["A4", "Letter", "Legal"].includes(input.paperSize) ? input.paperSize : "A4";
  const canvasWidth = Math.round(clampNumber(input.canvasWidth, 400, 3000, 1200));
  const canvasHeight = Math.round(clampNumber(input.canvasHeight, 300, 2000, 700));
  const elements = Array.isArray(input.elements) ? input.elements.slice(0, 300).map((item, index) => {
    const type = FLOOR_ELEMENT_TYPES.has(item.type) ? item.type : "shape";
    const tableKind = FLOOR_TABLE_KINDS.has(item.tableKind) ? item.tableKind : "round";
    const shapeKind = FLOOR_SHAPE_KINDS.has(item.shapeKind) ? item.shapeKind : "custom";
    const isPresidential = tableKind === "presidential";
    const x = clampNumber(item.x, 0, canvasWidth - 40, 80);
    const y = clampNumber(item.y, 0, canvasHeight - 40, 80);
    return {
      id: String(item.id || `element-${Date.now()}-${index}`).slice(0, 80),
      type,
      tableKind: type === "table" ? tableKind : undefined,
      shapeKind: type === "shape" ? shapeKind : undefined,
      tableType: type === "table" ? (isPresidential ? "presidential" : "regular") : undefined,
      tableNumber: type === "table" ? Math.round(clampNumber(item.tableNumber, 1, 10000, 1)) : undefined,
      label: String(item.label || "").trim().slice(0, 80),
      x,
      y,
      width: clampNumber(item.width, 40, canvasWidth - x, type === "chair" ? 44 : 160),
      height: clampNumber(item.height, 40, canvasHeight - y, type === "chair" ? 44 : 140),
      rotation: clampNumber(item.rotation, -180, 180, 0),
      seatCount: type === "table" ? Math.round(clampNumber(item.seatCount, 1, isPresidential ? 24 : 50, isPresidential ? 12 : 8)) : 0,
    };
  }) : [];
  return { paperSize, canvasWidth, canvasHeight, elements };
}

function floorTableCapacity(data, type, tableNumber, fallback) {
  const element = data.seatingFloorPlan?.elements?.find(
    (item) => item.type === "table" && item.tableType === type && Number(item.tableNumber) === Number(tableNumber),
  );
  return Number(element?.seatCount || fallback);
}

// GET /api/data — fetch all event data for current user
router.get("/", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    if (normalizeSeating(data)) await data.save();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GUEST SETTINGS ────────────────────────────────────────
router.put("/guest-settings", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.guestSettings = req.body;
    await data.save();
    res.json(data.guestSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── NOMINATED GUESTS ──────────────────────────────────────
router.put("/nominated-guests", protect, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ message: "Expected an array of names" });
    const data = await getOrCreate(req.user._id);
    data.nominatedGuests = [...new Set(req.body.map((name) => String(name).trim()).filter(Boolean))];
    await data.save();
    res.json(data.nominatedGuests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GUESTS ────────────────────────────────────────────────
router.get("/guests", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    res.json(data.guests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/guests", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Guest name is required" });
    if (data.guests.some((guest) => guest.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ message: "Guest name already exists" });
    }
    const guest = {
      ...pick({ ...req.body, name }, GUEST_FIELDS),
      status: "Not Seated",
      tableNumber: null,
      _localId: Date.now(),
    };
    if (guest.confirmed && req.body.rsvpStatus === undefined) {
      guest.rsvpStatus = "Accepted";
      guest.attendingPax = Number(guest.pax || 1);
    }
    const rsvpError = validateGuestRsvp(guest);
    if (rsvpError) return res.status(400).json({ message: rsvpError });
    data.guests.push(guest);
    await data.save();
    res.status(201).json(data.guests[data.guests.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/guests/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const guest = data.guests.id(req.params.id);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    const name = req.body.name === undefined ? guest.name : String(req.body.name).trim();
    if (!name) return res.status(400).json({ message: "Guest name is required" });
    if (data.guests.some((item) => String(item._id) !== String(guest._id) && item.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ message: "Guest name already exists" });
    }
    normalizeSeating(data);
    const updates = pick({ ...req.body, name }, GUEST_FIELDS);
    if (updates.confirmed !== undefined && updates.rsvpStatus === undefined) {
      updates.rsvpStatus = updates.confirmed ? "Accepted" : "Pending";
      updates.attendingPax = updates.confirmed ? Number(updates.pax || guest.pax || 1) : 0;
    }
    const candidate = { ...guest.toObject(), ...updates };
    const rsvpError = validateGuestRsvp(candidate);
    if (rsvpError) return res.status(400).json({ message: rsvpError });
    Object.assign(guest, updates);
    await data.save();
    res.json(guest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/guests/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const guest = data.guests.id(req.params.id);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    removeGuestFromSeating(data, guest);
    await Invitation.deleteMany({ eventData: data._id, guestId: guest._id });
    data.guests = data.guests.filter((g) => g._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: "Guest removed", ...seatingResponse(data) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SPONSORS ──────────────────────────────────────────────
router.put("/primary-sponsors", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.primarySponsors = req.body;
    await data.save();
    res.json(data.primarySponsors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/secondary-sponsors", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.secondarySponsors = req.body;
    await data.save();
    res.json(data.secondarySponsors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SEATING ───────────────────────────────────────────────
router.put("/seating-settings", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.seatingSettings = req.body;
    await data.save();
    res.json(data.seatingSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/seating/floor-plan", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    normalizeSeating(data);
    const floorPlan = sanitizeFloorPlan(req.body);
    for (const element of floorPlan.elements.filter((item) => item.type === "table")) {
      const field = element.tableType === "presidential" ? "presidentialSeating" : "seating";
      const occupied = (data[field]?.[element.tableNumber] || []).reduce(
        (total, reference) => total + guestPax(resolveGuest(data, reference)),
        0,
      );
      if (occupied > element.seatCount) {
        return res.status(409).json({ message: `${element.label || "Table"} already has ${occupied} seated pax` });
      }
    }
    data.seatingFloorPlan = floorPlan;
    data.markModified("seatingFloorPlan");
    await data.save();
    res.json(data.seatingFloorPlan);
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.post("/seating/assign", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    normalizeSeating(data);
    const type = req.body.type === "presidential" ? "presidential" : "regular";
    const tableNumber = Number(req.body.tableNumber);
    const guest = data.guests.id(req.body.guestId);
    const settings = type === "regular" ? data.seatingSettings : data.presidentialSettings;
    const field = type === "regular" ? "seating" : "presidentialSeating";

    if (!guest) return res.status(404).json({ message: "Guest not found" });
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > settings.tableCount) {
      return res.status(400).json({ message: "Invalid table number" });
    }

    removeGuestFromSeating(data, guest);
    const map = { ...(data[field] || {}) };
    const references = [...(map[tableNumber] || [])];
    const occupiedPax = references.reduce(
      (total, reference) => total + guestPax(resolveGuest(data, reference)),
      0,
    );
    const capacity = floorTableCapacity(data, type, tableNumber, settings.maxPerTable);
    if (occupiedPax + guestPax(guest) > capacity) {
      return res.status(409).json({ message: "Table capacity would be exceeded" });
    }

    references.push(String(guest._id));
    map[tableNumber] = references;
    data[field] = map;
    data.markModified(field);
    normalizeSeating(data);
    await data.save();
    res.json(seatingResponse(data));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.post("/seating/remove", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    normalizeSeating(data);
    const guest = data.guests.id(req.body.guestId);
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    removeGuestFromSeating(data, guest);
    normalizeSeating(data);
    await data.save();
    res.json(seatingResponse(data));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.delete("/seating/reset", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.seatingSettings = { tableCount: 0, maxPerTable: 10, initialized: false };
    data.presidentialSettings = { tableCount: 0, maxPerTable: 10 };
    data.seating = {};
    data.presidentialSeating = {};
    data.seatingFloorPlan = {
      paperSize: data.seatingFloorPlan?.paperSize || "A4",
      canvasWidth: data.seatingFloorPlan?.canvasWidth || 1200,
      canvasHeight: data.seatingFloorPlan?.canvasHeight || 700,
      elements: [],
    };
    data.markModified("seating");
    data.markModified("presidentialSeating");
    data.markModified("seatingFloorPlan");
    normalizeSeating(data);
    await data.save();
    res.json(seatingResponse(data));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.delete("/seating/tables/:type/:tableNumber", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    normalizeSeating(data);
    const type = req.params.type === "presidential" ? "presidential" : "regular";
    const tableNumber = Number(req.params.tableNumber);
    const field = type === "regular" ? "seating" : "presidentialSeating";
    const settingsField = type === "regular" ? "seatingSettings" : "presidentialSettings";
    const settings = data[settingsField];

    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > settings.tableCount) {
      return res.status(400).json({ message: "Invalid table number" });
    }

    const shifted = {};
    let next = 1;
    for (let current = 1; current <= settings.tableCount; current += 1) {
      if (current === tableNumber) continue;
      shifted[next] = data[field]?.[current] || [];
      next += 1;
    }
    data[field] = shifted;
    data[settingsField].tableCount = settings.tableCount - 1;
    if (data.seatingFloorPlan?.elements) {
      data.seatingFloorPlan.elements = data.seatingFloorPlan.elements
        .filter((item) => !(item.type === "table" && item.tableType === type && Number(item.tableNumber) === tableNumber))
        .map((item) => {
          if (item.type !== "table" || item.tableType !== type || Number(item.tableNumber) <= tableNumber) return item;
          const oldNumber = Number(item.tableNumber);
          const defaultOldLabel = item.tableKind === "presidential" ? `Presidential ${oldNumber}` : `Table ${oldNumber}`;
          const nextNumber = oldNumber - 1;
          const label = item.label === defaultOldLabel
            ? (item.tableKind === "presidential" ? `Presidential ${nextNumber}` : `Table ${nextNumber}`)
            : item.label;
          return { ...item, tableNumber: nextNumber, label };
        });
      data.markModified("seatingFloorPlan");
    }
    data.markModified(field);
    normalizeSeating(data);
    await data.save();
    res.json(seatingResponse(data));
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ message: err.message });
  }
});

router.put("/presidential-settings", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.presidentialSettings = req.body;
    await data.save();
    res.json(data.presidentialSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── EXPENSES ──────────────────────────────────────────────
router.put("/expense-settings", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenseSettings = req.body;
    await data.save();
    res.json(data.expenseSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/expenses", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const expense = { ...pick(req.body, EXPENSE_FIELDS), _localId: Date.now() };
    if (Number(expense.downpayment || 0) > Number(expense.cost || 0)) {
      return res.status(400).json({ message: "Downpayment cannot exceed total cost" });
    }
    data.expenses.push(expense);
    await data.save();
    res.status(201).json(data.expenses[data.expenses.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/expenses/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const expense = data.expenses.id(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    const updates = pick(req.body, EXPENSE_FIELDS);
    const nextCost = updates.cost ?? expense.cost;
    const nextDownpayment = updates.downpayment ?? expense.downpayment;
    if (Number(nextDownpayment || 0) > Number(nextCost || 0)) {
      return res.status(400).json({ message: "Downpayment cannot exceed total cost" });
    }
    Object.assign(expense, updates);
    await data.save();
    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/expenses/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenses = data.expenses.filter(
      (e) => e._id.toString() !== req.params.id,
    );
    await data.save();
    res.json({ message: "Expense removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/expenses", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenses = [];
    await data.save();
    res.json({ message: "All expenses reset" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── TASKS ─────────────────────────────────────────────────
router.post("/tasks", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const task = { ...pick(req.body, TASK_FIELDS), _localId: Date.now() };
    data.tasks.push(task);
    await data.save();
    res.status(201).json(data.tasks[data.tasks.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/tasks/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const task = data.tasks.id(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    Object.assign(task, pick(req.body, TASK_FIELDS));
    await data.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/tasks/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.tasks = data.tasks.filter((t) => t._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: "Task removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/tasks", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.tasks = [];
    await data.save();
    res.json({ message: "All tasks reset" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CHECKLIST ─────────────────────────────────────────────
router.post("/checklist", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = { ...pick(req.body, CHECKLIST_FIELDS), _localId: Date.now() };
    data.checklist.push(item);
    await data.save();
    res.status(201).json(data.checklist[data.checklist.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/checklist/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = data.checklist.id(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Checklist item not found" });
    Object.assign(item, pick(req.body, CHECKLIST_FIELDS));
    await data.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/checklist/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.checklist = data.checklist.filter(
      (c) => c._id.toString() !== req.params.id,
    );
    await data.save();
    res.json({ message: "Item removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/checklist", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.checklist = [];
    await data.save();
    res.json({ message: "Checklist reset" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PROGRAM ───────────────────────────────────────────────
router.post("/program", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = { ...pick(req.body, PROGRAM_FIELDS), _localId: Date.now() };
    if (!item._start || !item._end || item._end <= item._start) {
      return res.status(400).json({ message: "Program end time must be later than start time" });
    }
    data.program.push(item);
    await data.save();
    res.status(201).json(data.program[data.program.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/program/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = data.program.id(req.params.id);
    if (!item)
      return res.status(404).json({ message: "Program item not found" });
    const updates = pick(req.body, PROGRAM_FIELDS);
    const nextStart = updates._start ?? item._start;
    const nextEnd = updates._end ?? item._end;
    if (!nextStart || !nextEnd || nextEnd <= nextStart) {
      return res.status(400).json({ message: "Program end time must be later than start time" });
    }
    Object.assign(item, updates);
    await data.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/program/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.program = data.program.filter(
      (p) => p._id.toString() !== req.params.id,
    );
    await data.save();
    res.json({ message: "Program item removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/program", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.program = [];
    await data.save();
    res.json({ message: "Program reset" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SUPPLIERS ─────────────────────────────────────────────
router.post("/suppliers", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const supplier = { ...pick(req.body, SUPPLIER_FIELDS), _localId: Date.now() };
    data.suppliers.push(supplier);
    await data.save();
    res.status(201).json(data.suppliers[data.suppliers.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/suppliers/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const supplier = data.suppliers.id(req.params.id);
    if (!supplier)
      return res.status(404).json({ message: "Supplier not found" });
    Object.assign(supplier, pick(req.body, SUPPLIER_FIELDS));
    await data.save();
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/suppliers/:id", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.suppliers = data.suppliers.filter(
      (s) => s._id.toString() !== req.params.id,
    );
    await data.save();
    res.json({ message: "Supplier removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/suppliers", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.suppliers = [];
    await data.save();
    res.json({ message: "Suppliers reset" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── EVENT ─────────────────────────────────────────────────
router.post("/event", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.event = { ...pick(req.body, EVENT_FIELDS), _localId: Date.now() };
    await data.save();
    res.status(201).json(data.event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/event", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.event = { ...pick(req.body, EVENT_FIELDS), _localId: data.event?._localId || Date.now() };
    await data.save();
    res.json(data.event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/event", protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.event = null;
    await data.save();
    res.json({ message: "Event removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
