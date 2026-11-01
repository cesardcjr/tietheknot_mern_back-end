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
      name: companion, pax: 1, category: input.category,
      confirmed: input.confirmed, listedBy: input.listedBy,
      remarks: `Companion of ${name}`,
    })),
  ];
}

module.exports = { buildGuestParty };
