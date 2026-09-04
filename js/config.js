window.ROXANNA_CONFIG = {
  actName: "Roxanna",
  actType: "Roxanna",
  tagline: "LIVE MUSIC. GOOD PEOPLE. GREAT TIMES.",

  // Create/select a Lyrics Suite setlist called "Roxanna" in LiveSuite.
  // If you know its Firestore document ID, put it in repertoireSetlistId.
  // The ID takes priority over the name.
  repertoireSetlistId: "",
  repertoireSetlistName: "Roxanna",

  // Safety default: do not expose the whole Lyrics database if a Roxanna
  // setlist has not been configured.
  fallbackToAllPublicSongs: false,

  // Optional: let LiveSuite's global Public Song List dropdown override the
  // ROXANNA repertoire while a Roxanna session is live. Keep false unless
  // you deliberately want that shared control.
  useLiveSuitePublicSetlistAsLiveOverride: false,

  // Optional explicit featured song IDs. If left empty, the first 5 songs
  // from the Roxanna setlist are used for the Popular Songs block.
  featuredSongIds: [],

  // Public links. Leave blank to show a friendly "coming soon" message.
  tipUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  tiktokUrl: "",
  mediaUrl: "",
  contactEmail: "",

  // Change these later without touching the application logic.
  copy: {
    requestClosed: "Song requests open automatically while ROXANNA is performing.",
    noGigs: "New ROXANNA dates will appear here when announced.",
    noRepertoire: "The ROXANNA public repertoire has not been configured yet."
  }
};
