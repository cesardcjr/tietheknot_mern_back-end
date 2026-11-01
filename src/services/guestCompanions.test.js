const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGuestParty, getCompanions, findMainGuest, setCompanionRemarks, updateGuestParty } = require("./guestCompanions");
const EventData = require("../models/EventData");
const { guestPax, normalizeSeating, removeGuestFromSeating } = require("./seatingService");

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

test("principal sponsor companions are VIP; blank places remain in the main guest's pax", async () => {
  const party = buildGuestParty({ ...input, category: "Principal", pax: 4, companions: ["Guest 1", "", ""] });
  assert.deepEqual(party.map((guest) => [guest.category, guest.pax]), [["Principal", 3], ["VIP", 1]]);
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: party });
  data.guests[1].companionOf = data.guests[0]._id;
  await data.validate();
  assert.equal(data.guests.reduce((total, guest) => total + guestPax(guest), 0), 4);
  assert.equal(getCompanions(data, data.guests[0])[0]._id.toString(), data.guests[1]._id.toString());
});

test("main guest edit renames linked companions, adds one and keeps total pax", async () => {
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: buildGuestParty({ ...input, pax: 4, companions: ["Guest 1", "", ""] }) });
  const main = data.guests[0];
  const child = data.guests[1];
  child.companionOf = main._id;
  data.seating = { 1: [String(main._id)], 2: [String(child._id)] };
  normalizeSeating(data);
  const result = updateGuestParty(data, main, {
    name: "New Main", pax: 4,
    companions: [{ id: String(child._id), name: "Renamed Guest" }, { name: "New Guest" }, { name: "" }],
  }, removeGuestFromSeating);
  await data.validate();
  assert.equal(result.removed.length, 0);
  assert.equal(data.guests.reduce((total, guest) => total + guest.pax, 0), 4);
  assert.equal(data.guests.id(child._id).tableNumber, 2);
  assert.equal(data.guests.id(child._id).remarks, "Companion of New Main");
  assert.equal(result.main.remarks, "Companions: Renamed Guest, New Guest");
  assert.equal(getCompanions(data, result.main).length, 2);
});

test("clearing an existing name converts it to reserved pax and removes its seat", async () => {
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: buildGuestParty(input) });
  const main = data.guests[0];
  const [first, second] = data.guests.slice(1);
  first.companionOf = main._id;
  second.companionOf = main._id;
  data.seating = { 1: [String(first._id)] };
  normalizeSeating(data);
  const result = updateGuestParty(data, main, {
    name: main.name, pax: 3,
    companions: [{ id: String(first._id), name: "" }, { id: String(second._id), name: "Guest 2" }],
  }, removeGuestFromSeating);
  await data.validate();
  assert.equal(result.main.pax, 2);
  assert.equal(result.main.remarks, "Companions: Guest 2");
  assert.equal(data.guests.id(first._id), null);
  assert.deepEqual(data.seating[1], []);
  assert.equal(data.guests.reduce((total, guest) => total + guest.pax, 0), 3);
});

test("legacy companions can be linked and their standalone rename refreshes main remarks", () => {
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: buildGuestParty(input) });
  const main = data.guests[0];
  const child = data.guests[1];
  assert.equal(findMainGuest(data, child)._id.toString(), main._id.toString());
  child.companionOf = main._id;
  child.name = "Updated Guest";
  child.remarks = `Companion of ${main.name}`;
  setCompanionRemarks(data, main);
  assert.equal(main.remarks, "Companions: Updated Guest, Guest 2");
});

test("main edit rejects duplicate names and foreign companion IDs", () => {
  const data = new EventData({ user: "507f1f77bcf86cd799439011", guests: [...buildGuestParty(input), { name: "Other" }] });
  const main = data.guests[0];
  assert.throws(() => updateGuestParty(data, main, { name: main.name, pax: 3, companions: [{ name: "Other" }] }, removeGuestFromSeating));
  assert.throws(() => updateGuestParty(data, main, { name: main.name, pax: 3, companions: [{ id: String(data.guests[3]._id), name: "Other Else" }] }, removeGuestFromSeating));
});
