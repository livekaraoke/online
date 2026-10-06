/* Live Karaoke-specific Website Settings additions. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const select = $("liveKaraokeDefaultSetlist");
  const status = $("liveKaraokeDefaultSetlistStatus");
  const saveButton = $("saveBillyWebsiteSettingsBtn");
  const resetButton = $("resetWebsiteCategoriesBtn");
  if (!select || !window.LK?.db || !window.LK?.auth) return;

  const settingsRef = () => LK.db.collection("karaokeControl").doc("liveKaraokeWebsiteSettings");
  let setlists = [];
  let ready = false;

  function setStatus(message, error=false) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", !!error);
  }

  function setlistName(item) {
    return String(item?.name || item?.title || item?.label || item?.id || "Untitled setlist").trim();
  }

  async function load() {
    setStatus("Loading setlists…");
    try {
      const [listSnap, settingsSnap] = await Promise.all([
        LK.db.collection("lyricsSetlists").get(),
        settingsRef().get()
      ]);

      setlists = listSnap.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }))
        .sort((a,b) => setlistName(a).localeCompare(setlistName(b), undefined, {sensitivity:"base"}));

      const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      const selectedId = String(settings.defaultBrowseSetlistId || "").trim();

      select.innerHTML = '<option value="">Use current public song list</option>' + setlists.map(item =>
        `<option value="${String(item.id).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">${setlistName(item).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</option>`
      ).join("");
      select.value = selectedId;
      ready = true;
      setStatus(selectedId
        ? `Default browse setlist: ${setlistName(setlists.find(item => item.id === selectedId) || {id:selectedId})}`
        : "When no Live Karaoke session is active, the popup will use the current public song list unless you choose a setlist here.");
    } catch (error) {
      console.error("Could not load Live Karaoke default songbook setting", error);
      setStatus(error.message || "Could not load setlists.", true);
    }
  }

  async function saveDefaultSetlist() {
    if (!ready || !LK.auth.currentUser) return;
    const id = String(select.value || "").trim();
    const item = setlists.find(row => row.id === id) || null;
    try {
      await settingsRef().set({
        defaultBrowseSetlistId:id,
        defaultBrowseSetlistName:item ? setlistName(item) : "",
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:LK.auth.currentUser.uid
      }, {merge:true});
      setStatus(id
        ? `Default browse setlist saved: ${setlistName(item)}`
        : "Default browse setlist cleared; the current public song list will be used.");
    } catch (error) {
      console.error("Could not save Live Karaoke default songbook setting", error);
      setStatus(error.message || "Could not save the default songbook.", true);
    }
  }

  select.addEventListener("change", () => {
    const item = setlists.find(row => row.id === select.value) || null;
    setStatus(item
      ? `Will use ${setlistName(item)} for browsing when no Live Karaoke session is active. Press Save Website Settings.`
      : "Will use the current public song list when no Live Karaoke session is active. Press Save Website Settings.");
  });

  saveButton?.addEventListener("click", () => {
    // The shared settings controller saves first. This merge writes only the Live Karaoke-specific field.
    setTimeout(() => void saveDefaultSetlist(), 0);
  });

  resetButton?.addEventListener("click", () => {
    select.value = "";
    setStatus("Default browse setlist reset locally. Press Save Website Settings to publish it.");
  });

  LK.auth.onAuthStateChanged(user => {
    if (user && !ready) void load();
  });
})();
