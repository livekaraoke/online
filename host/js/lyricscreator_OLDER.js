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

  const FONTS = ["Verdana", "Arial", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New", "Consolas"];
  const FONT_SIZES = ["12", "14", "16", "18", "20", "22", "24", "26", "28", "30", "32", "40", "48"];
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
      fontSize: type === "tab" ? 20 : 22,
      color: type === "tab" ? "#ffd400" : "#ffffff"
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

  function sectionToolbar(index, section) {
    const style = section.style || defaultStyle(section.type);
    return `
      <div class="rich-toolbar advanced-rich-toolbar">
        <select class="toolbar-select" data-font="${index}" title="Font name">${renderFontOptions(style.fontFamily)}</select>
        <select class="toolbar-select size-select" data-size="${index}" title="Font size">${renderSizeOptions(style.fontSize)}</select>
        <button type="button" data-command="bold" title="Bold"><b>B</b></button>
        <button type="button" data-command="italic" title="Italic"><i>I</i></button>
        <button type="button" data-command="underline" title="Underline"><u>U</u></button>
        <button type="button" data-colour="${index}" title="Text colour">🎨 COLOUR</button>
        <button type="button" class="quick-green" data-quick-colour="#42f35c" title="Bold green">GREEN</button>
        <button type="button" class="quick-yellow" data-quick-colour="#ffd400" title="Bold yellow">YELLOW</button>
        <button type="button" class="quick-teal" data-quick-colour="#19e3c5" title="Bold teal">TEAL</button>
        <button type="button" data-insert-chord="${index}">INSERT CHORD</button>
        <button type="button" data-insert-tab="${index}">INSERT BLANK TAB</button>
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
      card.draggable = true;
      card.dataset.index = index;

      if (s.type === "separator") {
        card.innerHTML = `
          <div class="creator-section-head">
            <span class="drag" title="Drag section">☰</span>
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
            <span class="drag" title="Drag section">☰</span>
            <button class="editor-collapse-btn" type="button" data-editor-collapse="${index}" title="Collapse editor section">${s.editorCollapsed ? "▼" : "▲"}</button>
            <input class="section-title-input" data-title="${index}" value="${esc(s.title)}">
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

    enableDrag();
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
    $("publicVisibleInput").checked = loadedSong.publicSongListVisible === true;

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
      publicSongListVisible: $("publicVisibleInput").checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!firebaseId) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    $("saveSongBtn").disabled = true;
    try {
      await db.collection("lyrics").doc(id).set(data, { merge: false });
      dirty = false;
      location.href = `lyricview.html?id=${encodeURIComponent(id)}`;
    } catch (error) {
      console.error(error);
      alert(`Could not save song: ${error.message}`);
      $("saveSongBtn").disabled = false;
    }
  }

  function enableDrag() {
    let dragging = null;
    document.querySelectorAll(".creator-section-card").forEach(card => {
      card.addEventListener("dragstart", event => {
        if (event.target.closest("input,textarea,button,select,[contenteditable='true']")) {
          event.preventDefault();
          return;
        }
        syncSectionsFromDOM();
        dragging = card;
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        if (!dragging) return;
        const oldSections = [...sections];
        sections = [...document.querySelectorAll(".creator-section-card")].map(node => oldSections[Number(node.dataset.index)]);
        dragging = null;
        markDirty();
        render();
      });
      card.addEventListener("dragover", event => {
        event.preventDefault();
        if (!dragging || dragging === card) return;
        const rect = card.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) card.after(dragging);
        else card.before(dragging);
      });
    });
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

    if (event.target.matches("[data-load-collapsed]")) {
      syncSectionsFromDOM();
      markDirty();
    }
  });

  document.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      syncSectionsFromDOM();
      sections.splice(Number(remove.dataset.remove), 1);
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
