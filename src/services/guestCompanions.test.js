const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGuestParty } = require("./guestCompanions");
const EventData = require("../models/EventData");
const { guestPax, normalizeSeating } = require("./seatingService");

const input = { name: " Main Guest ", pax: 3, category: "Friends", confirmed: true, listedBy: "Bride", companions: [" Guest 1 ", "Guest 2"] };

test("named companions preserve total pax, remarks and shared details", () => {
  const party = buildGuestParty(input);
  assert.equal(party.reduce((total, guest) => total + guest.pax, 0), 3);
  assert.deepEqual(party.map((guest) => guest.pax), [1, 1, 1]);
  assert.equal(party[0].remarks, "Companions: Guest 1, Guest 2");
  assert.equal(party[1].remarks, "Companion of Main Guest");
  assert.equal(party[2].category, "Friends");
  assert.equal(party[2].listedBy, "Bride");
  assert.equal(party[2].confirmed, true);
});

test("blank companions clear remarks; partly named parties retain unnamed pax", () => {
  const blank = buildGuestParty({ ...input, companions: ["", "  "], remarks: "Old remarks" });
  assert.equal(blank.length, 1);
  assert.equal(blank[0].remarks, "");
  assert.equal(blank[0].pax, 3);
  const partial = buildGuestParty({ ...input, companions: ["Guest 1", ""] });
  assert.deepEqual(partial.map((guest) => guest.pax), [2, 1]);
});

test("rejects existing names, repeated names, invalid pax and excess companions", () => {
  assert.throws(() => buildGuestParty(input, [{ name: "guest 2" }]));
  assert.throws(() => buildGuestParty({ ...input, companions: ["main guest", ""] }));
  assert.throws(() => buildGuestParty({ ...input, companions: ["Guest 1", " guest 1 "] }));
  for (const pax of [0, 1.5, 51]) assert.throws(() => buildGuestParty({ ...input, pax }));
  assert.throws(() => buildGuestParty({ ...input, pax: 2 }));
});

test("saved companion records have distinct IDs and can occupy separate tables", async () => {
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: buildGuestParty(input) });
  await data.validate();
  assert.equal(new Set(data.guests.map((guest) => String(guest._id))).size, 3);
  data.seating = { 1: [String(data.guests[0]._id)], 2: [String(data.guests[1]._id)] };
  normalizeSeating(data);
  assert.equal(data.guests[0].tableNumber, 1);
  assert.equal(data.guests[1].tableNumber, 2);
  assert.equal(data.guests[2].status, "Not Seated");
  assert.equal(data.guests.reduce((total, guest) => total + guestPax(guest), 0), 3);
});
