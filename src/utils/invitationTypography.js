// Keep these persisted IDs in sync with Invitation Studio's font picker.
const FONT_FAMILIES = [
  "classic", "modern", "romantic", "elegant", "alex-brush", "allura",
  "baskervville", "cinzel", "crimson-text", "ephesis", "gloock",
  "hedvig-letters-serif", "instrument-serif", "italiana", "marck-script",
  "old-standard-tt", "parisienne", "spectral", "young-serif",
];

const TYPOGRAPHY_FIELDS = [
  "welcomeMessage", "videoMessage", "closingMessage",
  "venueKicker", "venueHeading",
  "ceremonyHeading", "ceremonyVenue", "ceremonyAddress", "ceremonyTime", "ceremonyMapLabel",
  "receptionHeading", "receptionVenue", "receptionAddress", "receptionTime", "receptionMapLabel",
  "dressHeading", "dressCode", "womenDressHeading", "menDressHeading",
  "dressCodeWomen", "dressCodeMen", "dressFooterNotes", "dressGeneralNotes",
  "rsvpTitle", "rsvpButtonText",
];

module.exports = { FONT_FAMILIES, TYPOGRAPHY_FIELDS };
