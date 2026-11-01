const test = require("node:test");
const assert = require("node:assert/strict");
const EventData = require("../models/EventData");
const Invitation = require("../models/Invitation");
const router = require("./data");
const { buildGuestParty } = require("../services/guestCompanions");

function handler(method, path) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
}

async function request(method, path, data, body, id) {
  const originalFind = EventData.findOne;
  const originalDelete = Invitation.deleteMany;
  EventData.findOne = async () => data;
  Invitation.deleteMany = async () => ({ deletedCount: 0 });
  data.save = async () => { await data.validate(); return data; };
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  try {
    await handler(method, path)({ user: { _id: data.user }, params: { id }, body }, response);
    return response;
  } finally {
    EventData.findOne = originalFind;
    Invitation.deleteMany = originalDelete;
  }
}

const user = "507f1f77bcf86cd799439011";

test("POST creates VIP companion rows while blank slots count in the main row", async () => {
  const data = new EventData({ user });
  const result = await request("post", "/guests", data, {
    name: "Sponsor", pax: 3, category: "Principal", confirmed: true,
    companions: ["Companion", ""],
  });
  assert.equal(result.statusCode, 201);
  assert.deepEqual(result.body.guests.map((guest) => [guest.category, guest.pax]), [["Principal", 2], ["VIP", 1]]);
  assert.equal(String(data.guests[1].companionOf), String(data.guests[0]._id));
  assert.equal(data.guests[0].remarks, "Companions: Companion");
});

test("PUT main edits legacy companion and keeps separate seating", async () => {
  const data = new EventData({ user, guests: buildGuestParty({
    name: "Sponsor", pax: 3, category: "Principal", confirmed: true, companions: ["Old", ""],
  }) });
  const main = data.guests[0];
  const companion = data.guests[1];
  data.seating = { 1: [String(companion._id)] };
  data.seatingSettings = { tableCount: 2, maxPerTable: 10, initialized: true };
  const result = await request("put", "/guests/:id", data, {
    name: "Sponsor", pax: 3, category: "Principal", confirmed: true,
    companions: [{ id: String(companion._id), name: "New" }, { name: "" }],
  }, String(main._id));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.guests.length, 2);
  assert.equal(data.guests.id(companion._id).name, "New");
  assert.equal(data.guests.id(companion._id).tableNumber, 1);
  assert.equal(data.guests.id(companion._id).category, "VIP");
  assert.equal(data.guests.id(main._id).remarks, "Companions: New");
  assert.equal(data.guests.reduce((total, guest) => total + guest.pax, 0), 3);
});

test("PUT companion name updates main remarks without changing its seat", async () => {
  const data = new EventData({ user, guests: buildGuestParty({
    name: "Main", pax: 2, category: "Friends", confirmed: false, companions: ["Old"],
  }) });
  const child = data.guests[1];
  const result = await request("put", "/guests/:id", data, {
    name: "New", pax: 1, category: "VIP", confirmed: false,
  }, String(child._id));
  assert.equal(result.statusCode, 200);
  assert.equal(data.guests[0].remarks, "Companions: New");
  assert.equal(child.remarks, "Companion of Main");
  assert.equal(child.category, "VIP");
  assert.equal(String(child.companionOf), String(data.guests[0]._id));
});

test("PUT main with blank companion names clears remarks and retains reserved pax", async () => {
  const data = new EventData({ user, guests: buildGuestParty({
    name: "Main", pax: 3, category: "Friends", confirmed: false, companions: ["Old", ""],
  }) });
  const result = await request("put", "/guests/:id", data, {
    name: "Main", pax: 3, category: "Friends", confirmed: false,
    companions: [{ id: String(data.guests[1]._id), name: "" }, { name: "" }],
  }, String(data.guests[0]._id));
  assert.equal(result.statusCode, 200);
  assert.equal(data.guests.length, 1);
  assert.equal(data.guests[0].pax, 3);
  assert.equal(data.guests[0].remarks, "");
});

test("PUT main refuses an edit that would overfill its current table", async () => {
  const data = new EventData({ user, guests: buildGuestParty({
    name: "Main", pax: 2, category: "Friends", confirmed: false, companions: ["Old"],
  }) });
  const main = data.guests[0];
  data.seating = { 1: [String(main._id)] };
  data.seatingSettings = { tableCount: 1, maxPerTable: 1, initialized: true };
  const result = await request("put", "/guests/:id", data, {
    name: "Main", pax: 2, category: "Friends", confirmed: false,
    companions: [{ id: String(data.guests[1]._id), name: "" }],
  }, String(main._id));
  assert.equal(result.statusCode, 409);
  assert.match(result.body.message, /capacity/);
});
