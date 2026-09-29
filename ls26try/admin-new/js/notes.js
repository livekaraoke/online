(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const db = window.LK?.db || window.db || (window.firebase?.firestore ? firebase.firestore() : null);
  const auth = window.LK?.auth || (window.firebase?.auth ? firebase.auth() : null);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

  let allNotes = [];
  let currentId = "";
  let dirty = false;
  let user = null;
  let unsubscribe = null;
  let applying = false;
  const params = new URLSearchParams(location.search);
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : "";

  function timestampMillis(value) {
    return value?.toMillis?.() || 0;
  }

  function plainFromHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.innerText || "").trim();
  }

  function formatUpdated(note) {
    const ms = timestampMillis(note?.updatedAt);
    if (!ms) return "";
    return new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function setStatus(text, kind) {
    const el = $("noteStatus");
    el.textContent = text || "";
    el.className = "";
    if (kind) el.classList.add(kind);
  }

  function setDirty(value = true) {
    if (applying) return;
    dirty = value;
    if (dirty) setStatus("Unsaved changes", "unsaved");
  }

  function categoriesFromInput() {
    const values = $("noteCategories").value
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(values));
    const withoutFavourite = unique.filter(value => value.toLowerCase() !== "favourites");
    if ($("noteFavourite").checked) withoutFavourite.unshift("Favourites");
    return withoutFavourite;
  }

  function currentValues() {
    return {
      title: $("noteTitle").value.trim(),
      contentHtml: $("noteEditor").innerHTML.trim(),
      plainText: plainFromHtml($("noteEditor").innerHTML),
      scheduledDate: $("noteDate").value,
      scheduledTime: $("noteTime").value,
      categories: categoriesFromInput()
    };
  }

  function updateCategoryFilter() {
    const select = $("notesCategoryFilter");
    const current = select.value;
    const categories = Array.from(new Set(allNotes.flatMap(note => Array.isArray(note.categories) ? note.categories : []).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">All categories</option>';
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
    select.value = categories.includes(current) ? current : "";
  }

  function renderList() {
    updateCategoryFilter();
    const query = $("notesSearch").value.trim().toLowerCase();
    const category = $("notesCategoryFilter").value;
    const list = $("notesList");
    list.replaceChildren();

    const visible = allNotes
      .filter(note => {
        const haystack = ((note.title || "") + " " + (note.plainText || plainFromHtml(note.contentHtml || ""))).toLowerCase();
        const categories = Array.isArray(note.categories) ? note.categories : [];
        return (!query || haystack.includes(query)) && (!category || categories.includes(category));
      })
      .sort((a, b) => timestampMillis(b.updatedAt) - timestampMillis(a.updatedAt) || (a.title || "").localeCompare(b.title || ""));

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "note-empty-editor";
      empty.textContent = allNotes.length ? "No notes match these filters." : "No notes yet. Create your first note.";
      list.append(empty);
      return;
    }

    visible.forEach(note => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-list-row" + (note.id === currentId ? " active" : "");

      const title = document.createElement("strong");
      title.textContent = note.title || "Untitled Note";

      const preview = document.createElement("span");
      preview.textContent = (note.plainText || plainFromHtml(note.contentHtml || "") || "Empty note").slice(0, 150);

      const meta = document.createElement("span");
      meta.className = "note-list-meta";
      const categories = Array.isArray(note.categories) ? note.categories : [];
      if (note.scheduledDate) {
        const date = document.createElement("em");
        date.textContent = "📅 " + note.scheduledDate + (note.scheduledTime ? " " + note.scheduledTime : "");
        meta.append(date);
      }
      categories.slice(0, 2).forEach(categoryName => {
        const tag = document.createElement("em");
        tag.textContent = categoryName === "Favourites" ? "★ Favourite" : categoryName;
        meta.append(tag);
      });

      button.append(title, preview, meta);
      button.onclick = () => chooseNote(note.id);
      list.append(button);
    });
  }

  async function confirmDiscard() {
    if (!dirty) return true;
    if (window.LS26Dialogs?.confirm) return LS26Dialogs.confirm("Discard unsaved changes to this note?");
    return window.confirm("Discard unsaved changes to this note?");
  }

  function fill(note, fallbackDate) {
    applying = true;
    $("noteTitle").value = note?.title || "";
    $("noteEditor").innerHTML = note?.contentHtml || "";
    $("noteDate").value = note?.scheduledDate || fallbackDate || "";
    $("noteTime").value = note?.scheduledTime || "";
    const categories = Array.isArray(note?.categories) ? note.categories : [];
    $("noteFavourite").checked = categories.includes("Favourites");
    $("noteCategories").value = categories.filter(value => value !== "Favourites").join(", ");
    $("noteDelete").disabled = !note?.id;
    $("noteUpdated").textContent = note ? (formatUpdated(note) ? "Updated " + formatUpdated(note) : "") : "";
    applying = false;
    dirty = false;
    setStatus(note ? "Saved" : "New note", note ? "saved" : "");
    renderList();
  }

  async function chooseNote(id) {
    if (id === currentId) return;
    if (!(await confirmDiscard())) return;
    const note = allNotes.find(item => item.id === id);
    if (!note) return;
    currentId = id;
    history.replaceState(null, "", "notes.html?id=" + encodeURIComponent(id));
    fill(note);
  }

  async function newNote(date = "") {
    if (!(await confirmDiscard())) return;
    currentId = "";
    history.replaceState(null, "", date ? "notes.html?date=" + encodeURIComponent(date) : "notes.html");
    fill(null, date);
    $("noteTitle").focus();
  }

  function validSchedule(values) {
    if (values.scheduledTime && !values.scheduledDate) {
      setStatus("Choose a date when assigning a time.", "unsaved");
      $("noteDate").focus();
      return false;
    }
    if (!values.scheduledDate) return true;
    const date = new Date(values.scheduledDate + "T" + (values.scheduledTime || "12:00") + ":00");
    if (Number.isNaN(date.getTime())) {
      setStatus("Choose a valid date and time.", "unsaved");
      return false;
    }
    return true;
  }

  async function saveNote() {
    if (!user) {
      setStatus("Sign in to Admin first.", "unsaved");
      return;
    }
    const values = currentValues();
    if (!values.title) {
      setStatus("Enter a note title before saving.", "unsaved");
      $("noteTitle").focus();
      return;
    }
    if (!validSchedule(values)) return;

    const button = $("noteSave");
    button.disabled = true;
    setStatus("Saving…");

    const ref = currentId ? db.collection("notes").doc(currentId) : db.collection("notes").doc();
    const data = {
      title: values.title,
      contentHtml: values.contentHtml,
      plainText: values.plainText,
      categories: values.categories,
      scheduledDate: values.scheduledDate,
      scheduledTime: values.scheduledTime,
      scheduledAt: values.scheduledDate
        ? firebase.firestore.Timestamp.fromDate(new Date(values.scheduledDate + "T" + (values.scheduledTime || "12:00") + ":00"))
        : null,
      updatedAt: stamp()
    };
    if (!currentId) data.createdAt = stamp();

    try {
      await ref.set(data, { merge: true });
      currentId = ref.id;
      dirty = false;
      history.replaceState(null, "", "notes.html?id=" + encodeURIComponent(currentId));
      setStatus("Saved", "saved");
      $("noteDelete").disabled = false;
      $("noteUpdated").textContent = "Saved just now";
    } catch (error) {
      console.error("Could not save note", error);
      dirty = true;
      setStatus(error.message || "Could not save note.", "unsaved");
    } finally {
      button.disabled = false;
    }
  }

  async function deleteNote() {
    if (!currentId) return;
    const note = allNotes.find(item => item.id === currentId);
    const label = note?.title || $("noteTitle").value || "this note";
    const ok = window.LS26Dialogs?.confirm
      ? await LS26Dialogs.confirm('Delete "' + label + '"?')
      : window.confirm('Delete "' + label + '"?');
    if (!ok) return;

    $("noteDelete").disabled = true;
    try {
      await db.collection("notes").doc(currentId).delete();
      currentId = "";
      dirty = false;
      history.replaceState(null, "", "notes.html");
      fill(null);
      setStatus("Note deleted.");
    } catch (error) {
      console.error("Could not delete note", error);
      setStatus(error.message || "Could not delete note.", "unsaved");
      $("noteDelete").disabled = false;
    }
  }

  function exec(command, value) {
    $("noteEditor").focus();
    document.execCommand(command, false, value || null);
    setDirty(true);
  }

  function subscribeNotes() {
    unsubscribe?.();
    unsubscribe = db.collection("notes").onSnapshot(snapshot => {
      allNotes = snapshot.docs.map(doc => Object.assign({ id: doc.id }, doc.data() || {}));
      renderList();

      if (!currentId) return;
      const current = allNotes.find(note => note.id === currentId);
      if (!current) {
        if (!dirty) {
          currentId = "";
          fill(null);
        }
        return;
      }
      if (!dirty) fill(current);
    }, error => {
      console.error("Notes listener failed", error);
      setStatus(error.message || "Notes could not be loaded.", "unsaved");
    });
  }

  function bind() {
    window.LK?.sidebar?.loadSidebar?.();

    $("notesSearch").addEventListener("input", renderList);
    $("notesCategoryFilter").addEventListener("change", renderList);
    $("notesOpenCalendar").onclick = () => { location.href = "calendar.html"; };
    $("notesNew").onclick = () => newNote();
    $("noteSave").onclick = saveNote;
    $("noteDelete").onclick = deleteNote;

    ["noteTitle", "noteDate", "noteTime", "noteCategories", "noteFavourite"].forEach(id => {
      $(id).addEventListener("input", () => setDirty(true));
      $(id).addEventListener("change", () => setDirty(true));
    });
    $("noteEditor").addEventListener("input", () => setDirty(true));

    document.querySelectorAll("[data-command]").forEach(button => {
      button.onclick = () => exec(button.dataset.command);
    });
    $("noteBlockFormat").onchange = event => exec("formatBlock", event.target.value);
    $("noteTextColor").oninput = event => exec("foreColor", event.target.value);

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNote();
      }
    });
    window.addEventListener("beforeunload", event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("pagehide", () => {
      unsubscribe?.();
      unsubscribe = null;
    });

    auth?.onAuthStateChanged(account => {
      user = account;
      if (!account) {
        unsubscribe?.();
        unsubscribe = null;
        location.replace("admin.html");
        return;
      }
      subscribeNotes();
    });

    const requestedId = params.get("id") || "";
    if (requestedId) currentId = requestedId;
    else fill(null, initialDate);
  }

  if (!db || !auth) {
    document.addEventListener("DOMContentLoaded", () => setStatus("Notes could not connect to LiveSuite data.", "unsaved"));
    return;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
