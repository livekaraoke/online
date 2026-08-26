(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const firebaseId = new URLSearchParams(location.search).get("firebaseId");

  let sections = [];
  let loadedSong = null;
  let dirty = false;
  let activeEditor = null;
  let savedRange = null;
  let confirmResolver = null;

  // Setlist membership for the song currently being edited.
  let availableSetlists = [];
  let selectedSetlistIds = new Set();

  const FONTS = ["Verdana", "Arial", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New", "Consolas"];
  const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "40", "48"];
  const COLOURS = [
    ["White", "#ffffff"], ["Light Gray", "#cfcfcf"], ["Red", "#ff4f5e"],
    ["Orange", "#ff982f"], ["Yellow", "#ffd400"], ["Green", "#42f35c"],
    ["Teal", "#19e3c5"], ["Blue", "#4fa3ff"], ["Purple", "#ac70ff"], ["Pink", "#ff66ad"]
  ];

  const TEMPLATES = [
    { label: "Verse", type: "lyrics", title: "VERSE", html: "Enter verse lyrics here..." },
    { label: "Chorus", type: "lyrics", title: "CHORUS", html: "Enter chorus lyrics here...", colour: "#ffd400" },
    { label: "Pre-Chorus", type: "lyrics", title: "PRE-CHORUS", html: "Enter pre-chorus lyrics here..." },
    { label: "Bridge", type: "lyrics", title: "BRIDGE", html: "Enter bridge lyrics here..." },
    { label: "Intro", type: "performanceNote", title: "INTRO", text: "Short instrumental (wait for signal)" },
    { label: "Outro", type: "performanceNote", title: "OUTRO", text: "Ending cue (wait for signal)" },
    { label: "Instrumental", type: "performanceNote", title: "INSTRUMENTAL", text: "Instrumental section (wait for signal)" },
    { label: "Solo", type: "performanceNote", title: "SOLO", text: "Solo section (wait for signal)" },
    { label: "Guitar Tab", type: "tab", title: "GUITAR TAB" },
    { label: "Host Note", type: "hostNote", title: "HOST NOTE", text: "Private reminder for the host..." },
    { label: "Ending", type: "lyrics", title: "ENDING", html: "Enter final lyrics here...", colour: "#ff6675" },
    { label: "Separator", type: "separator" }
  ];

  function esc(value) {
    return LyricsCommon.escapeHTML(String(value ?? ""));
  }

  function blankTabHTML() {
    return `<pre class="inserted-blank-tab">e|--------------------------------|\nB|--------------------------------|\nG|--------------------------------|\nD|--------------------------------|\nA|--------------------------------|\nE|--------------------------------|</pre>`;
  }

  function defaultStyle(type = "lyrics") {
    return {
      fontFamily: type === "tab" ? "Consolas" : "Verdana",
      fontSize: type === "tab" ? 16 : 18,
      color: type === "tab" ? "#ffd400" : "#ffffff",

      // NEW: every "-" character defaults to gray. This is especially useful
      // for guitar tabs so fret numbers stand out clearly.
      dashColor: "#777777",

      // NEW: empty string means use the normal/default section-title colour
      // supplied by Lyric View. Set a hex colour to override it.
      titleColor: ""
    };
  }

  function normalizeSection(section) {
    const type = section?.type || "lyrics";
    if (type === "separator") return { type: "separator" };
    return {
      ...section,
      type,
      title: section.title || (type === "performanceNote" ? "PERFORMANCE NOTE" : type === "hostNote" ? "HOST NOTE" : type === "tab" ? "GUITAR TAB" : "VERSE"),
      html: section.html || "",
      text: section.text || "",
      collapsed: section.collapsed === true,
      editorCollapsed: section.editorCollapsed === true,
      style: {
        ...defaultStyle(type),
        ...(section.style || {})
      }
    };
  }

  function makeSection(type, template = null) {
    if (type === "separator") return { type: "separator" };
    if (type === "performanceNote") {
      return normalizeSection({ type, title: template?.title || "PERFORMANCE NOTE", text: template?.text || "Short instrumental (wait for signal)" });
    }
    if (type === "hostNote") {
      return normalizeSection({ type, title: template?.title || "HOST NOTE", text: template?.text || "Private reminder for the host..." });
    }
    if (type === "tab") {
      return normalizeSection({ type, title: template?.title || "GUITAR TAB", html: blankTabHTML() });
    }
    return normalizeSection({
      type: "lyrics",
      title: template?.title || "VERSE",
      html: template?.html || "Enter lyrics and chords here...",
      style: { ...defaultStyle("lyrics"), color: template?.colour || "#ffffff" }
    });
  }

  function updateEditingStatus() {
    const title = $("songTitleInput").value.trim() || "New Song";
    const artist = $("artistInput").value.trim();
    $("creatorStatus").textContent = `Editing: ${title}${artist ? ` - ${artist}` : ""}`;
  }

  function markDirty() {
    dirty = true;
    updateEditingStatus();
  }

  function captureSelection(editor) {
    activeEditor = editor;
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!activeEditor) return false;
    activeEditor.focus();
    if (!savedRange) return true;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return true;
  }

  function insertHTMLAtSelection(html) {
    if (!restoreSelection()) return;
    document.execCommand("insertHTML", false, html);
    captureSelection(activeEditor);
    syncSectionsFromDOM();
    markDirty();
  }

  function applyCommand(command, value = null) {
    if (!restoreSelection()) return;
    document.execCommand(command, false, value);
    captureSelection(activeEditor);
    syncSectionsFromDOM();
    markDirty();
  }

  function applyQuickColour(colour) {
    applyCommand("bold");
    applyCommand("foreColor", colour);
  }

  function renderFontOptions(selected) {
    return FONTS.map(font => `<option value="${esc(font)}" ${font === selected ? "selected" : ""}>${esc(font)}</option>`).join("");
  }

  function renderSizeOptions(selected) {
    return FONT_SIZES.map(size => `<option value="${size}" ${String(size) === String(selected) ? "selected" : ""}>${size}px</option>`).join("");
  }


  function renderDashColourOptions(selected) {
    const value = selected || "#777777";
    const options = [
      ["Gray (Default)", "#777777"],
      ["Light Gray", "#b8b8b8"],
      ["White", "#ffffff"],
      ["Yellow", "#ffd400"],
      ["Green", "#42f35c"],
      ["Teal", "#19e3c5"],
      ["Blue", "#4fa3ff"],
      ["Red", "#ff4f5e"],
      ["Orange", "#ff982f"],
      ["Purple", "#ac70ff"]
    ];
    return options.map(([label, colour]) =>
      `<option value="${colour}" ${colour.toLowerCase() === String(value).toLowerCase() ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function renderTitleColourOptions(selected) {
    const value = selected || "";
    const options = [
      ["Default", ""],
      ["White", "#ffffff"],
      ["Light Gray", "#cfcfcf"],
      ["Red", "#ff4f5e"],
      ["Orange", "#ff982f"],
      ["Yellow", "#ffd400"],
      ["Green", "#42f35c"],
      ["Teal", "#19e3c5"],
      ["Blue", "#4fa3ff"],
      ["Purple", "#ac70ff"],
      ["Pink", "#ff66ad"]
    ];
    return options.map(([label, colour]) =>
      `<option value="${colour}" ${colour.toLowerCase() === String(value).toLowerCase() ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function unwrapDashSpans(root) {
    if (!root) return;
    root.querySelectorAll("span.creator-dash-char").forEach(span => {
      span.replaceWith(document.createTextNode(span.textContent || "-"));
    });
  }

  function applyDashColourToEditor(editor, colour) {
    if (!editor) return;
    const dashColour = colour || "#777777";

    // Unwrap our own generated dash spans first so changing colour never nests.
    unwrapDashSpans(editor);

    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.includes("-")) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest("script,style,button,select,option")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const parts = node.nodeValue.split("-");
      if (parts.length < 2) return;

      const frag = document.createDocumentFragment();
      parts.forEach((part, index) => {
        if (part) frag.appendChild(document.createTextNode(part));
        if (index < parts.length - 1) {
          const span = document.createElement("span");
          span.className = "creator-dash-char";
          span.style.color = dashColour;
          span.textContent = "-";
          frag.appendChild(span);
        }
      });
      node.replaceWith(frag);
    });
  }

  function refreshAllDashColours() {
    document.querySelectorAll("[data-html]").forEach(editor => {
      const index = Number(editor.dataset.html);
      const section = sections[index];
      if (!section) return;
      applyDashColourToEditor(editor, section.style?.dashColor || "#777777");
    });
  }

  function sectionToolbar(index, section) {
    const style = section.style || defaultStyle(section.type);
    return `
      <div class="rich-toolbar advanced-rich-toolbar">
        <select class="toolbar-select" data-font="${index}" title="Font name">${renderFontOptions(style.fontFamily)}</select>
        <select class="toolbar-select size-select" data-size="${index}" title="Font size">${renderSizeOptions(style.fontSize)}</select>
        <button type="button" data-command="bold" title="Bold"><b>B</b></button>
        <button type="button" data-command="italic" title="Italic"><i>I</i></button>
        <button type="button" data-command="underline" title="Underline"><u>U</u></button>
        <label class="text-colour-control" title="Apply a colour to the selected text">
          <span class="text-colour-icon">🎨</span>
          <input type="color" data-text-colour="${index}" value="${esc(style.color || "#ffffff")}" aria-label="Selected text colour">
        </label>
        <label class="dash-colour-control" title="Colour every dash / hyphen character in this section">
          DASHES
          <select data-dash-colour="${index}">${renderDashColourOptions(style.dashColor)}</select>
          <input type="color" data-dash-custom="${index}" value="${esc(style.dashColor || "#777777")}" title="Custom dash colour">
        </label>
        <button type="button" class="beat-colour beat-1" data-quick-colour="#42f35c" title="Bold green timing marker">BEAT 1</button>
        <button type="button" class="beat-colour beat-2" data-quick-colour="#19e3c5" title="Bold teal timing marker">BEAT 2</button>
        <button type="button" class="beat-colour beat-3" data-quick-colour="#ffd400" title="Bold yellow timing marker">BEAT 3</button>
        <button type="button" class="beat-colour beat-4" data-quick-colour="#ffb45c" title="Bold light-orange timing marker">BEAT 4</button>
        <button type="button" data-insert-chord="${index}">＋ CHORD</button>
        <button type="button" data-insert-tab="${index}">＋ BLANK TAB</button>
      </div>`;
  }

  function render() {
    const root = $("sectionEditorList");
    root.innerHTML = "";

    sections.forEach((section, index) => {
      const s = normalizeSection(section);
      sections[index] = s;
      const card = document.createElement("article");
      card.className = `creator-section-card type-${s.type} ${s.editorCollapsed ? "editor-collapsed" : ""}`;
      card.dataset.index = index;

      if (s.type === "separator") {
        card.innerHTML = `
          <div class="creator-section-head">
            <strong>SEPARATOR</strong>
            <div class="creator-section-actions">
              <button type="button" data-up="${index}">↑</button>
              <button type="button" data-down="${index}">↓</button>
              <button type="button" data-remove="${index}">×</button>
            </div>
          </div><hr>`;
      } else {
        const isTextNote = s.type === "performanceNote" || s.type === "hostNote";
        card.innerHTML = `
          <div class="creator-section-head">
            <button class="editor-collapse-btn" type="button" data-editor-collapse="${index}" title="Collapse editor section">${s.editorCollapsed ? "▼" : "▲"}</button>
            <input class="section-title-input" data-title="${index}" value="${esc(s.title)}" style="${s.style?.titleColor ? `color:${esc(s.style.titleColor)}` : ""}">
            <label class="section-title-colour-control" title="Section title font colour">
              TITLE
              <select data-title-colour="${index}">${renderTitleColourOptions(s.style?.titleColor)}</select>
              <input type="color" data-title-custom="${index}" value="${esc(s.style?.titleColor || "#ffffff")}" title="Custom title colour">
            </label>
            <span class="section-type-badge ${s.type === "hostNote" ? "host-note-badge" : ""}">${s.type === "tab" ? "TAB" : s.type === "performanceNote" ? "SINGER NOTE" : s.type === "hostNote" ? "HOST ONLY" : "LYRICS"}</span>
            <label class="load-collapse-option"><input type="checkbox" data-load-collapsed="${index}" ${s.collapsed ? "checked" : ""}> Load collapsed</label>
            <div class="creator-section-actions">
              <button type="button" data-up="${index}">↑</button>
              <button type="button" data-down="${index}">↓</button>
              <button type="button" data-duplicate="${index}">⧉</button>
              <button type="button" data-remove="${index}">×</button>
            </div>
          </div>
          <div class="creator-section-body ${s.editorCollapsed ? "hidden" : ""}">
            ${isTextNote ? "" : sectionToolbar(index, s)}
            ${isTextNote
              ? `<textarea class="${s.type === "hostNote" ? "host-note-editor" : "performance-note-editor"}" data-note="${index}">${esc(s.text)}</textarea>`
              : `<div class="creator-rich-editor ${s.type === "tab" ? "tab-editor" : ""}" data-html="${index}" contenteditable="true" style="font-family:${esc(s.style.fontFamily)};font-size:${Number(s.style.fontSize) || 18}px;color:${esc(s.style.color)}">${s.html || ""}</div>`}
          </div>`;
      }
      root.appendChild(card);
    });

    // Preview each section's dash colour immediately in the creator.
    requestAnimationFrame(refreshAllDashColours);
  }

  function syncSectionsFromDOM() {
    document.querySelectorAll("[data-title]").forEach(el => {
      const i = Number(el.dataset.title);
      if (sections[i]) sections[i].title = el.value;
    });
    document.querySelectorAll("[data-note]").forEach(el => {
      const i = Number(el.dataset.note);
      if (sections[i]) sections[i].text = el.value;
    });
    document.querySelectorAll("[data-html]").forEach(el => {
      const i = Number(el.dataset.html);
      if (sections[i]) sections[i].html = el.innerHTML;
    });
    document.querySelectorAll("[data-load-collapsed]").forEach(el => {
      const i = Number(el.dataset.loadCollapsed);
      if (sections[i]) sections[i].collapsed = el.checked;
    });

    document.querySelectorAll("[data-dash-colour]").forEach(el => {
      const i = Number(el.dataset.dashColour);
      if (sections[i]) {
        sections[i].style = { ...defaultStyle(sections[i].type), ...(sections[i].style || {}) };
        sections[i].style.dashColor = el.value || "#777777";
      }
    });

    document.querySelectorAll("[data-title-colour]").forEach(el => {
      const i = Number(el.dataset.titleColour);
      if (sections[i]) {
        sections[i].style = { ...defaultStyle(sections[i].type), ...(sections[i].style || {}) };
        sections[i].style.titleColor = el.value || "";
      }
    });
  }

  function showConfirm(title, message) {
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    $("confirmModal").classList.remove("hidden");
    return new Promise(resolve => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(value) {
    $("confirmModal").classList.add("hidden");
    if (confirmResolver) confirmResolver(value);
    confirmResolver = null;
  }

  async function leaveWithoutSaving() {
    if (!dirty) {
      history.back();
      return;
    }
    const ok = await showConfirm("Discard Changes?", "Are you sure you want to cancel? All unsaved changes will be lost.");
    if (ok) {
      dirty = false;
      history.back();
    }
  }


  function renderSetlistMembership() {
    const list = $("setlistMembershipList");
    const summary = $("setlistMembershipSummary");
    if (!list || !summary) return;

    if (!availableSetlists.length) {
      list.innerHTML = `<span class="setlist-membership-empty">No setlists found.</span>`;
      summary.textContent = "Not in any setlist";
      return;
    }

    const selectedCount = availableSetlists.filter(item => selectedSetlistIds.has(item.id)).length;
    summary.textContent = selectedCount
      ? `${selectedCount} setlist${selectedCount === 1 ? "" : "s"} selected`
      : "Not in any setlist";

    list.innerHTML = availableSetlists.map(setlist => {
      const checked = selectedSetlistIds.has(setlist.id);
      const songCount = Array.isArray(setlist.songIds) ? setlist.songIds.length : 0;
      return `
        <label class="creator-setlist-chip ${checked ? "selected" : ""}">
          <input type="checkbox" data-setlist-membership="${esc(setlist.id)}" ${checked ? "checked" : ""}>
          <span>
            <strong>${esc(setlist.name || "Untitled Setlist")}</strong>
            <small>${songCount} song${songCount === 1 ? "" : "s"}</small>
          </span>
        </label>
      `;
    }).join("");
  }

  async function loadSetlistMembership(songId = firebaseId) {
    const list = $("setlistMembershipList");
    const summary = $("setlistMembershipSummary");
    if (list) list.innerHTML = `<span class="setlist-membership-empty">Loading...</span>`;
    if (summary) summary.textContent = "Loading setlists...";

    try {
      const snap = await db.collection("lyricsSetlists").get();
      availableSetlists = snap.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: data.name || "Untitled Setlist",
          songIds: Array.isArray(data.songIds) ? data.songIds : []
        };
      }).sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
      );

      selectedSetlistIds = new Set(
        songId
          ? availableSetlists.filter(item => item.songIds.includes(songId)).map(item => item.id)
          : []
      );

      renderSetlistMembership();
    } catch (error) {
      console.error("Could not load setlists:", error);
      availableSetlists = [];
      selectedSetlistIds = new Set();
      if (list) list.innerHTML =
        `<span class="setlist-membership-empty error">Could not load setlists.</span>`;
      if (summary) summary.textContent = "Setlists unavailable";
    }
  }

  async function saveSetlistMembership(songId) {
    if (!availableSetlists.length) return;

    // lyricsSetlists writes use the existing Firebase Admin authentication
    // session. No second login is shown on this page.
    if (window.auth && !auth.currentUser) {
      console.warn("Song saved, but setlist membership was not changed because no Firebase Admin session is active.");
      return;
    }

    const operations = [];

    availableSetlists.forEach(setlist => {
      const currentlyContains = setlist.songIds.includes(songId);
      const shouldContain = selectedSetlistIds.has(setlist.id);

      if (currentlyContains === shouldContain) return;

      const ref = db.collection("lyricsSetlists").doc(setlist.id);
      operations.push(
        ref.set({
          songIds: shouldContain
            ? firebase.firestore.FieldValue.arrayUnion(songId)
            : firebase.firestore.FieldValue.arrayRemove(songId),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
      );
    });

    await Promise.all(operations);
  }

  async function load() {
    if (!firebaseId) {
      sections = [makeSection("lyrics")];
      updateEditingStatus();
      render();
      dirty = false;
      return;
    }

    const doc = await db.collection("lyrics").doc(firebaseId).get();
    if (!doc.exists) {
      alert("Song not found");
      return;
    }

    loadedSong = doc.data() || {};
    sections = Array.isArray(loadedSong.sections)
      ? loadedSong.sections.map(normalizeSection)
      : [];

    $("creatorHeading").textContent = "✎ EDIT LYRICS & CHORDS";
    $("songTitleInput").value = loadedSong.title || "";
    $("artistInput").value = loadedSong.artist || "";
    $("userBpmInput").value = loadedSong.userBpm || "";
    $("originalBpmInput").value = loadedSong.originalBpm || "";
    $("keyInput").value = loadedSong.key || "";
    $("capoInput").value = loadedSong.capo || "";
    $("yearInput").value = loadedSong.year || "";
    $("timeSignatureInput").value = loadedSong.timeSignature || "4/4";
    $("youtubeInput").value = loadedSong.youtubeLink || "";
    $("hostNoteInput").value = loadedSong.note || "";
    await loadSetlistMembership(firebaseId);

    updateEditingStatus();
    render();
    dirty = false;
  }

  async function save() {
    syncSectionsFromDOM();
    const title = $("songTitleInput").value.trim();
    const artist = $("artistInput").value.trim();
    if (!title || !artist) {
      alert("Title and artist are required.");
      return;
    }

    const id = firebaseId || `${title}${artist}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const data = {
      title,
      artist,
      userBpm: $("userBpmInput").value,
      originalBpm: $("originalBpmInput").value,
      key: $("keyInput").value.trim(),
      capo: $("capoInput").value.trim(),
      year: $("yearInput").value,
      timeSignature: $("timeSignatureInput").value.trim() || "4/4",
      youtubeLink: $("youtubeInput").value.trim(),
      note: $("hostNoteInput").value,
      sections: sections.map(normalizeSection),
      // Public Song List visibility is managed elsewhere.
      // Preserve existing value; new songs stay hidden by default.
      publicSongListVisible: firebaseId ? loadedSong?.publicSongListVisible === true : false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!firebaseId) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    $("saveSongBtn").disabled = true;
    try {
      await db.collection("lyrics").doc(id).set(data, { merge: false });

      try {
        await saveSetlistMembership(id);
      } catch (setlistError) {
        console.error("Song saved but setlist membership update failed:", setlistError);
        await showConfirm(
          "Song Saved",
          "The song was saved, but one or more setlist changes could not be saved. Check your Firebase Admin login and lyricsSetlists permissions."
        );
      }

      dirty = false;
      location.href = `lyricview.html?id=${encodeURIComponent(id)}`;
    } catch (error) {
      console.error(error);
      alert(`Could not save song: ${error.message}`);
      $("saveSongBtn").disabled = false;
    }
  }

  function moveSection(index, delta) {
    syncSectionsFromDOM();
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    markDirty();
    render();
  }

  function openChordModal(editor) {
    captureSelection(editor);
    $("chordInput").value = "G";
    $("chordPreview").textContent = "G";
    $("chordModal").classList.remove("hidden");
    setTimeout(() => $("chordInput").select(), 30);
  }

  function openColourModal(editor) {
    captureSelection(editor);
    $("colourModal").classList.remove("hidden");
  }

  function renderModals() {
    $("chordQuickGrid").innerHTML = ["C", "D", "E", "F", "G", "A", "B", "Am", "Em", "Dm", "G7", "Cmaj7", "F#m", "Bb"].map(chord => `<button type="button" data-chord-quick="${esc(chord)}">${esc(chord)}</button>`).join("");
    $("colourPalette").innerHTML = COLOURS.map(([name, colour]) => `<button type="button" data-palette-colour="${colour}" title="${esc(name)}"><span style="background:${colour}"></span>${esc(name)}</button>`).join("");
    $("templateGrid").innerHTML = TEMPLATES.map((template, index) => `<button type="button" data-template="${index}"><strong>${esc(template.label)}</strong><span>${esc(template.type)}</span></button>`).join("");
  }

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const editor = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest?.(".creator-rich-editor");
    if (editor) captureSelection(editor);
  });

  document.addEventListener("input", event => {
    if (event.target.matches("input, textarea, [contenteditable='true']")) markDirty();
    if (event.target.id === "songTitleInput" || event.target.id === "artistInput") updateEditingStatus();
    if (event.target.id === "chordInput") $("chordPreview").textContent = event.target.value || "—";
    if (event.target.matches("[data-title],[data-note],[data-html],[data-load-collapsed]")) syncSectionsFromDOM();

    // Colour inputs update live while the colour picker is dragged.
    if (event.target.matches("[data-dash-custom],[data-title-custom]")) {
      event.target.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  document.addEventListener("change", event => {
    const font = event.target.closest("[data-font]");
    if (font) {
      const index = Number(font.dataset.font);
      const editor = document.querySelector(`[data-html="${index}"]`);
      sections[index].style.fontFamily = font.value;
      editor.style.fontFamily = font.value;
      captureSelection(editor);
      applyCommand("fontName", font.value);
      markDirty();
      return;
    }

    const size = event.target.closest("[data-size]");
    if (size) {
      const index = Number(size.dataset.size);
      const editor = document.querySelector(`[data-html="${index}"]`);
      sections[index].style.fontSize = Number(size.value);
      editor.style.fontSize = `${size.value}px`;
      captureSelection(editor);
      markDirty();
      return;
    }

    const textColour = event.target.closest("[data-text-colour]");
    if (textColour) {
      const index = Number(textColour.dataset.textColour);
      const editor = textColour.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      if (editor) {
        captureSelection(editor);
        applyCommand("foreColor", textColour.value);
        sections[index].style = { ...defaultStyle(sections[index].type), ...(sections[index].style || {}) };
        sections[index].style.color = textColour.value;
      }
      markDirty();
      return;
    }

    const dashColour = event.target.closest("[data-dash-colour]");
    if (dashColour) {
      const index = Number(dashColour.dataset.dashColour);
      sections[index].style = { ...defaultStyle(sections[index].type), ...(sections[index].style || {}) };
      sections[index].style.dashColor = dashColour.value || "#777777";

      const custom = document.querySelector(`[data-dash-custom="${index}"]`);
      if (custom) custom.value = sections[index].style.dashColor;

      const editor = document.querySelector(`[data-html="${index}"]`);
      applyDashColourToEditor(editor, sections[index].style.dashColor);
      markDirty();
      return;
    }

    const dashCustom = event.target.closest("[data-dash-custom]");
    if (dashCustom) {
      const index = Number(dashCustom.dataset.dashCustom);
      sections[index].style = { ...defaultStyle(sections[index].type), ...(sections[index].style || {}) };
      sections[index].style.dashColor = dashCustom.value || "#777777";

      const select = document.querySelector(`[data-dash-colour="${index}"]`);
      if (select) {
        const matching = [...select.options].some(opt => opt.value.toLowerCase() === dashCustom.value.toLowerCase());
        if (matching) select.value = dashCustom.value;
      }

      const editor = document.querySelector(`[data-html="${index}"]`);
      applyDashColourToEditor(editor, sections[index].style.dashColor);
      markDirty();
      return;
    }

    const titleColour = event.target.closest("[data-title-colour]");
    if (titleColour) {
      const index = Number(titleColour.dataset.titleColour);
      sections[index].style = { ...defaultStyle(sections[index].type), ...(sections[index].style || {}) };
      sections[index].style.titleColor = titleColour.value || "";

      const custom = document.querySelector(`[data-title-custom="${index}"]`);
      if (custom && sections[index].style.titleColor) custom.value = sections[index].style.titleColor;

      const titleInput = document.querySelector(`[data-title="${index}"]`);
      if (titleInput) titleInput.style.color = sections[index].style.titleColor || "";

      markDirty();
      return;
    }

    const titleCustom = event.target.closest("[data-title-custom]");
    if (titleCustom) {
      const index = Number(titleCustom.dataset.titleCustom);
      sections[index].style = { ...defaultStyle(sections[index].type), ...(sections[index].style || {}) };
      sections[index].style.titleColor = titleCustom.value || "";

      const select = document.querySelector(`[data-title-colour="${index}"]`);
      if (select) {
        const matching = [...select.options].some(opt => opt.value.toLowerCase() === titleCustom.value.toLowerCase());
        if (matching) select.value = titleCustom.value;
      }

      const titleInput = document.querySelector(`[data-title="${index}"]`);
      if (titleInput) titleInput.style.color = sections[index].style.titleColor || "";

      markDirty();
      return;
    }

    const setlistMembership = event.target.closest("[data-setlist-membership]");
    if (setlistMembership) {
      const id = setlistMembership.dataset.setlistMembership;
      if (setlistMembership.checked) selectedSetlistIds.add(id);
      else selectedSetlistIds.delete(id);
      renderSetlistMembership();
      markDirty();
      return;
    }

    if (event.target.matches("[data-load-collapsed]")) {
      syncSectionsFromDOM();
      markDirty();
    }
  });

  document.addEventListener("click", async event => {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const index = Number(remove.dataset.remove);
      const section = sections[index];
      const title = section?.type === "separator"
        ? "separator"
        : `"${section?.title || "this section"}"`;

      const ok = await showConfirm(
        "Delete Section?",
        `Are you sure you want to permanently remove ${title} from this song?`
      );

      if (!ok) return;

      syncSectionsFromDOM();
      sections.splice(index, 1);
      markDirty();
      render();
      return;
    }

    const duplicate = event.target.closest("[data-duplicate]");
    if (duplicate) {
      syncSectionsFromDOM();
      const index = Number(duplicate.dataset.duplicate);
      sections.splice(index + 1, 0, JSON.parse(JSON.stringify(sections[index])));
      markDirty();
      render();
      return;
    }

    const up = event.target.closest("[data-up]");
    if (up) return moveSection(Number(up.dataset.up), -1);
    const down = event.target.closest("[data-down]");
    if (down) return moveSection(Number(down.dataset.down), 1);

    const collapse = event.target.closest("[data-editor-collapse]");
    if (collapse) {
      syncSectionsFromDOM();
      const index = Number(collapse.dataset.editorCollapse);
      sections[index].editorCollapsed = !sections[index].editorCollapsed;
      render();
      return;
    }

    const command = event.target.closest("[data-command]");
    if (command) {
      const editor = command.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      captureSelection(editor);
      applyCommand(command.dataset.command);
      return;
    }

    const quickColour = event.target.closest("[data-quick-colour]");
    if (quickColour) {
      const editor = quickColour.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      captureSelection(editor);
      applyQuickColour(quickColour.dataset.quickColour);
      return;
    }

    const colour = event.target.closest("[data-colour]");
    if (colour) {
      const editor = colour.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      openColourModal(editor);
      return;
    }

    const chord = event.target.closest("[data-insert-chord]");
    if (chord) {
      const editor = chord.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      openChordModal(editor);
      return;
    }

    const tab = event.target.closest("[data-insert-tab]");
    if (tab) {
      const editor = tab.closest(".creator-section-body")?.querySelector(".creator-rich-editor");
      captureSelection(editor);
      insertHTMLAtSelection(blankTabHTML());
      return;
    }

    const quickChord = event.target.closest("[data-chord-quick]");
    if (quickChord) {
      $("chordInput").value = quickChord.dataset.chordQuick;
      $("chordPreview").textContent = quickChord.dataset.chordQuick;
      return;
    }

    const palette = event.target.closest("[data-palette-colour]");
    if (palette) {
      $("colourModal").classList.add("hidden");
      applyCommand("foreColor", palette.dataset.paletteColour);
      return;
    }

    const template = event.target.closest("[data-template]");
    if (template) {
      syncSectionsFromDOM();
      const item = TEMPLATES[Number(template.dataset.template)];
      sections.push(makeSection(item.type, item));
      $("templatesModal").classList.add("hidden");
      markDirty();
      render();
    }
  });

  $("addLyricsSectionBtn").onclick = () => { syncSectionsFromDOM(); sections.push(makeSection("lyrics")); markDirty(); render(); };
  $("addTabSectionBtn").onclick = () => { syncSectionsFromDOM(); sections.push(makeSection("tab")); markDirty(); render(); };
  $("addPerformanceNoteBtn").onclick = () => { syncSectionsFromDOM(); sections.push(makeSection("performanceNote")); markDirty(); render(); };
  $("addHostNoteBtn").onclick = () => { syncSectionsFromDOM(); sections.push(makeSection("hostNote")); markDirty(); render(); };
  $("addSeparatorBtn").onclick = () => { syncSectionsFromDOM(); sections.push(makeSection("separator")); markDirty(); render(); };
  $("openTemplatesBtn").onclick = () => $("templatesModal").classList.remove("hidden");
  $("refreshSetlistsBtn").onclick = () => loadSetlistMembership(firebaseId);

  $("saveSongBtn").onclick = save;
  $("saveMenuBtn").onclick = () => {
    const menu = $("saveDropdown");
    menu.classList.toggle("hidden");
    $("saveMenuBtn").setAttribute("aria-expanded", menu.classList.contains("hidden") ? "false" : "true");
  };
  $("cancelChangesBtn").onclick = leaveWithoutSaving;
  $("backToViewerBtn").onclick = leaveWithoutSaving;

  $("confirmOkBtn").onclick = () => closeConfirm(true);
  $("confirmCancelBtn").onclick = () => closeConfirm(false);
  $("insertChordCancelBtn").onclick = () => $("chordModal").classList.add("hidden");
  $("insertChordConfirmBtn").onclick = () => {
    const chord = $("chordInput").value.trim();
    if (!chord) return;
    $("chordModal").classList.add("hidden");
    insertHTMLAtSelection(`<strong class="inserted-chord">${esc(chord)}</strong>`);
  };
  $("colourCancelBtn").onclick = () => $("colourModal").classList.add("hidden");
  $("templatesCancelBtn").onclick = () => $("templatesModal").classList.add("hidden");

  document.addEventListener("click", event => {
    if (!event.target.closest(".save-split-wrap")) $("saveDropdown").classList.add("hidden");
  });

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  renderModals();
  load().catch(error => {
    console.error(error);
    alert(`Could not load song: ${error.message}`);
  });
})();
