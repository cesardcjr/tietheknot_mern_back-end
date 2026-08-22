function resolveGuest(data, reference) {
  const value = String(reference);
  return data.guests.find(
    (guest) => String(guest._id) === value || guest.name === reference,
  );
}

function guestPax(guest) {
  if (!guest) return 0;
  if (guest.rsvpStatus === "Accepted") {
    return Number(guest.attendingPax || guest.pax || 1);
  }
  return Number(guest.pax || 1);
}

function normalizeSeating(data) {
  const before = JSON.stringify({
    seating: data.seating,
    presidentialSeating: data.presidentialSeating,
    guests: data.guests.map((guest) => [guest._id, guest.status, guest.tableNumber]),
  });
  const assigned = new Set();

  data.guests.forEach((guest) => {
    guest.status = "Not Seated";
    guest.tableNumber = null;
  });

  for (const [field, prefix] of [
    ["seating", ""],
    ["presidentialSeating", "P"],
  ]) {
    const normalized = {};
    for (const [tableNumber, references] of Object.entries(data[field] || {})) {
      normalized[tableNumber] = [];
      for (const reference of Array.isArray(references) ? references : []) {
        const guest = resolveGuest(data, reference);
        if (!guest || assigned.has(String(guest._id))) continue;
        assigned.add(String(guest._id));
        normalized[tableNumber].push(String(guest._id));
        guest.status = "Seated";
        guest.tableNumber = prefix ? `${prefix}${tableNumber}` : Number(tableNumber);
      }
    }
    data[field] = normalized;
    data.markModified(field);
  }

  const after = JSON.stringify({
    seating: data.seating,
    presidentialSeating: data.presidentialSeating,
    guests: data.guests.map((guest) => [guest._id, guest.status, guest.tableNumber]),
  });
  return before !== after;
}

function removeGuestFromSeating(data, guest) {
  for (const field of ["seating", "presidentialSeating"]) {
    data[field] = Object.fromEntries(
      Object.entries(data[field] || {}).map(([tableNumber, references]) => [
        tableNumber,
        (references || []).filter(
          (reference) =>
            String(reference) !== String(guest._id) && reference !== guest.name,
        ),
      ]),
    );
    data.markModified(field);
  }
}

function seatingResponse(data) {
  return {
    seating: data.seating,
    presidentialSeating: data.presidentialSeating,
    seatingSettings: data.seatingSettings,
    presidentialSettings: data.presidentialSettings,
    guests: data.guests,
  };
}

module.exports = {
  guestPax,
  normalizeSeating,
  removeGuestFromSeating,
  resolveGuest,
  seatingResponse,
};
