// ---------------------------------------------------------------------------
//  Your wedding details — the ONLY file you need to edit.
//
//  These are placeholder values. Two ways to use your real ones:
//
//   A) Private repo: just edit the values below, commit, and deploy.
//   B) Public repo: leave this file alone and put your real values in
//      Cloudflare instead (see README → "Keep your details out of GitHub").
//      Every value here can be overridden by the variable named on its right.
// ---------------------------------------------------------------------------

export default {
  // Shown as the big title on the guest page.            Override: COUPLE_NAMES
  coupleNames: "Alex & Sam",

  // Shown under the names, exactly as written.           Override: WEDDING_DATE
  weddingDate: "September 18, 2027",

  // Shown next to the date. Leave "" to hide.            Override: VENUE
  venue: "The Garden Pavilion",

  // A short line for your guests.                        Override: WELCOME_MESSAGE
  welcomeMessage:
    "Thank you for celebrating with us! Share every photo and video you take today — we can't wait to see the day through your eyes.",

  // Upload window. Guests can only upload between these two moments.
  // Use the format YYYY-MM-DDTHH:MM:SS+HH:MM (the +HH:MM is your time zone's
  // offset from UTC, e.g. +08:00 for Manila, -04:00 for New York in summer).
  uploadOpens: "2027-09-18T12:00:00-04:00", //           Override: UPLOAD_OPENS
  uploadCloses: "2027-09-25T23:59:59-04:00", //          Override: UPLOAD_CLOSES

  // Time zone used to display the dates above.           Override: TIMEZONE
  // List: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  timezone: "America/New_York",

  // Colours (hex codes).
  colors: {
    background: "#FBF8F1", // ivory                      Override: COLOR_BACKGROUND
    primary: "#7D8F69", //    sage — buttons & accents    Override: COLOR_PRIMARY
    text: "#3B3A36", //       dark text                   Override: COLOR_TEXT
  },

  // "serif" (elegant, Cormorant Garamond) or "modern" (clean sans-serif).
  font: "serif", //                                       Override: FONT

  // Optional header photo: a full https:// link, or a file you put in the
  // public/ folder (e.g. "/header.jpg"). Leave "" for none. You can also
  // upload one from the admin page instead.               Override: HEADER_PHOTO
  headerPhoto: "",

  // Optional: the address printed on the QR card. Leave "" to use whatever
  // address you open the admin page at.                   Override: SITE_URL
  siteUrl: "",

  // Free R2 storage, used for the storage meter on the admin page.
  storageLimitGB: 10,
};
