// Split named companions into individual seats without increasing the party's pax.
function buildGuestParty(input, existingGuests = []) {
  if (!Array.isArray(input.companions)) throw new Error("Companions must be a list of names");
  const pax = Number(input.pax);
  if (!Number.isInteger(pax) || pax < 1 || pax > 50) throw new Error("Pax must be a whole number between 1 and 50");
  if (input.companions.length > pax - 1) throw new Error("Companions cannot exceed the additional pax");
  if (input.companions.some((name) => typeof name !== "string")) throw new Error("Companion names must be text");
  const name = String(input.name || "").trim();
  const companions = input.companions.map((value) => value.trim()).filter(Boolean);
  const names = [name, ...companions];
  const seen = new Set(existingGuests.map((guest) => guest.name.trim().toLowerCase()));
  for (const value of names) {
    if (!value || value.length > 120) throw new Error("Guest names must contain 1 to 120 characters");
    if (seen.has(value.toLowerCase())) throw new Error(`"${value}" is already in the guest list or this party`);
    seen.add(value.toLowerCase());
  }
  const remarks = companions.length ? `Companions: ${companions.join(", ")}` : "";
  if (remarks.length > 1000) throw new Error("Companion names exceed the remarks limit. Please shorten the names or add guests separately.");
  return [
    { ...input, name, pax: pax - companions.length, remarks },
    ...companions.map((companion) => ({
      name: companion, pax: 1, category: input.category === "Principal" ? "VIP" : input.category,
      confirmed: input.confirmed, listedBy: input.listedBy,
      remarks: `Companion of ${name}`,
    })),
  ];
}

function getCompanions(data, main) {
  const listed = main.remarks?.startsWith("Companions: ")
    ? main.remarks.slice("Companions: ".length).split(", ").map((name) => name.toLowerCase())
    : [];
  return data.guests.filter((guest) =>
    String(guest._id) !== String(main._id) && (
      String(guest.companionOf || "") === String(main._id) ||
      (!guest.companionOf && listed.includes(guest.name.toLowerCase()) && guest.remarks === `Companion of ${main.name}`)
    ),
  );
}

function findMainGuest(data, companion) {
  if (companion.companionOf) return data.guests.id(companion.companionOf);
  return data.guests.find((main) => getCompanions(data, main).some((guest) => String(guest._id) === String(companion._id)));
}

function setCompanionRemarks(data, main) {
  const names = getCompanions(data, main).map((guest) => guest.name);
  const remarks = names.length ? `Companions: ${names.join(", ")}` : "";
  if (remarks.length > 1000) throw new Error("Companion names exceed the remarks limit");
  main.remarks = remarks;
}

function updateGuestParty(data, main, input, removeGuestFromSeating) {
  const pax = Number(input.pax);
  if (!Number.isInteger(pax) || pax < 1 || pax > 50) throw new Error("Pax must be a whole number between 1 and 50");
  if (!Array.isArray(input.companions) || input.companions.length > pax - 1) throw new Error("Invalid companion list for this pax");
  const name = String(input.name || "").trim();
  const current = getCompanions(data, main);
  const currentIds = new Set(current.map((guest) => String(guest._id)));
  const entries = input.companions.map((entry) => ({
    id: entry && typeof entry === "object" ? String(entry.id || "") : "",
    name: entry && typeof entry === "object" ? String(entry.name || "").trim() : "",
  }));
  const retained = new Set();
  const seen = new Set(data.guests.filter((guest) =>
    String(guest._id) !== String(main._id) && !currentIds.has(String(guest._id)),
  ).map((guest) => guest.name.toLowerCase()));
  for (const entry of [{ name }, ...entries]) {
    if (entry.name.length > 120) throw new Error("Guest names must be 120 characters or fewer");
    if (entry.name && seen.has(entry.name.toLowerCase())) throw new Error(`"${entry.name}" is already in the guest list or this party`);
    if (entry.name) seen.add(entry.name.toLowerCase());
    if (entry.id) {
      if (!currentIds.has(entry.id) || retained.has(entry.id)) throw new Error("Invalid companion reference");
      retained.add(entry.id);
    }
  }
  if (!name) throw new Error("Guest name is required");
  const named = entries.filter((entry) => entry.name);
  if (named.length && `Companions: ${named.map((entry) => entry.name).join(", ")}`.length > 1000) {
    throw new Error("Companion names exceed the remarks limit");
  }
  const removed = current.filter((guest) => !named.some((entry) => entry.id === String(guest._id)));
  for (const guest of removed) removeGuestFromSeating(data, guest);
  const removedIds = new Set(removed.map((guest) => String(guest._id)));
  const mainId = main._id;
  data.guests = data.guests.filter((guest) => !removedIds.has(String(guest._id)));
  main = data.guests.id(mainId);
  main.name = name;
  main.pax = pax - named.length;
  if (main.rsvpStatus === "Accepted") main.attendingPax = main.pax;
  for (const entry of named) {
    const guest = entry.id ? data.guests.id(entry.id) : null;
    if (guest) {
      guest.name = entry.name;
      guest.companionOf = main._id;
      guest.remarks = `Companion of ${name}`;
      guest.pax = 1;
      if (main.category === "Principal" && guest.category === "Principal") guest.category = "VIP";
    } else {
      data.guests.push({
        name: entry.name, pax: 1, companionOf: main._id,
        category: main.category === "Principal" ? "VIP" : main.category,
        confirmed: main.confirmed, rsvpStatus: main.confirmed ? "Accepted" : "Pending",
        attendingPax: main.confirmed ? 1 : 0, listedBy: main.listedBy,
        remarks: `Companion of ${name}`, status: "Not Seated", tableNumber: null,
      });
    }
  }
  setCompanionRemarks(data, main);
  return { removed, main };
}

module.exports = { buildGuestParty, getCompanions, findMainGuest, setCompanionRemarks, updateGuestParty };
