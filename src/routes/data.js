const express = require('express');
const router = express.Router();
const EventData = require('../models/EventData');
const { protect } = require('../middleware/authMiddleware');

// Helper: get or create event data for user
async function getOrCreate(userId) {
  let data = await EventData.findOne({ user: userId });
  if (!data) data = await EventData.create({ user: userId });
  return data;
}

// GET /api/data — fetch all event data for current user
router.get('/', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GUEST SETTINGS ────────────────────────────────────────
router.put('/guest-settings', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.guestSettings = req.body;
    await data.save();
    res.json(data.guestSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GUESTS ────────────────────────────────────────────────
router.get('/guests', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    res.json(data.guests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/guests', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const guest = { ...req.body, _localId: Date.now() };
    data.guests.push(guest);
    await data.save();
    res.status(201).json(data.guests[data.guests.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/guests/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const guest = data.guests.id(req.params.id);
    if (!guest) return res.status(404).json({ message: 'Guest not found' });
    Object.assign(guest, req.body);
    await data.save();
    res.json(guest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/guests/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.guests = data.guests.filter(g => g._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Guest removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Bulk set guests (for sort A-Z)
router.put('/guests', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.guests = req.body;
    await data.save();
    res.json(data.guests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SPONSORS ──────────────────────────────────────────────
router.put('/primary-sponsors', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.primarySponsors = req.body;
    await data.save();
    res.json(data.primarySponsors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/secondary-sponsors', protect, async (req, res) => {
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
router.put('/seating-settings', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.seatingSettings = req.body;
    await data.save();
    res.json(data.seatingSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/seating', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.seating = req.body;
    data.markModified('seating');
    await data.save();
    res.json(data.seating);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/presidential-settings', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.presidentialSettings = req.body;
    await data.save();
    res.json(data.presidentialSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/presidential-seating', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.presidentialSeating = req.body;
    data.markModified('presidentialSeating');
    await data.save();
    res.json(data.presidentialSeating);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── EXPENSES ──────────────────────────────────────────────
router.put('/expense-settings', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenseSettings = req.body;
    await data.save();
    res.json(data.expenseSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/expenses', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const expense = { ...req.body, _localId: Date.now() };
    data.expenses.push(expense);
    await data.save();
    res.status(201).json(data.expenses[data.expenses.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/expenses/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const expense = data.expenses.id(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    Object.assign(expense, req.body);
    await data.save();
    res.json(expense);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/expenses/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenses = data.expenses.filter(e => e._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Expense removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/expenses', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.expenses = [];
    await data.save();
    res.json({ message: 'All expenses reset' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── TASKS ─────────────────────────────────────────────────
router.post('/tasks', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const task = { ...req.body, _localId: Date.now() };
    data.tasks.push(task);
    await data.save();
    res.status(201).json(data.tasks[data.tasks.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/tasks/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const task = data.tasks.id(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    Object.assign(task, req.body);
    await data.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/tasks/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.tasks = data.tasks.filter(t => t._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Task removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/tasks', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.tasks = [];
    await data.save();
    res.json({ message: 'All tasks reset' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CHECKLIST ─────────────────────────────────────────────
router.post('/checklist', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = { ...req.body, _localId: Date.now() };
    data.checklist.push(item);
    await data.save();
    res.status(201).json(data.checklist[data.checklist.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/checklist/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = data.checklist.id(req.params.id);
    if (!item) return res.status(404).json({ message: 'Checklist item not found' });
    Object.assign(item, req.body);
    await data.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/checklist/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.checklist = data.checklist.filter(c => c._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Item removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/checklist', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.checklist = [];
    await data.save();
    res.json({ message: 'Checklist reset' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PROGRAM ───────────────────────────────────────────────
router.post('/program', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = { ...req.body, _localId: Date.now() };
    data.program.push(item);
    await data.save();
    res.status(201).json(data.program[data.program.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/program/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const item = data.program.id(req.params.id);
    if (!item) return res.status(404).json({ message: 'Program item not found' });
    Object.assign(item, req.body);
    await data.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/program/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.program = data.program.filter(p => p._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Program item removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/program', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.program = [];
    await data.save();
    res.json({ message: 'Program reset' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SUPPLIERS ─────────────────────────────────────────────
router.post('/suppliers', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const supplier = { ...req.body, _localId: Date.now() };
    data.suppliers.push(supplier);
    await data.save();
    res.status(201).json(data.suppliers[data.suppliers.length - 1]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/suppliers/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    const supplier = data.suppliers.id(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    Object.assign(supplier, req.body);
    await data.save();
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/suppliers/:id', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.suppliers = data.suppliers.filter(s => s._id.toString() !== req.params.id);
    await data.save();
    res.json({ message: 'Supplier removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/suppliers', protect, async (req, res) => {
  try {
    const data = await getOrCreate(req.user._id);
    data.suppliers = [];
    await data.save();
    res.json({ message: 'Suppliers reset' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
