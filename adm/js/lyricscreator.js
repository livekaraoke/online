let selectedColor = "white";
let selectedSectionColor = "white";
let editingIndex = null;
let editingBackup = null;

let songData = {
  id: "",
  title: "",
  artist: "",
  userBpm: "",
  originalBpm: "",
  capo: "",
  key: "",
  year: "",
  sections: []
};

function generateSongId(title, artist) {
  return (title + artist)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

let currentFormats = {
  bold: false,
  italic: false,
  underline: false
};
let currentAlign = "left";

const editor = document.getElementById("sectionEditor");

editor.addEventListener("paste", function (e) {
  e.preventDefault();

  const text = (e.clipboardData || window.clipboardData)
    .getData("text/plain");

  document.execCommand("insertText", false, text);

  updateLivePreview();
});

function cleanWordPaste(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("*").forEach(el => {
    const tag = el.tagName.toLowerCase();

    // Remove Word junk attributes
    [...el.attributes].forEach(attr => {
      if (!["style"].includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    });

    // Remove paragraph spacing/margins but keep useful styles
    let style = el.getAttribute("style") || "";

    const keep = [];

    if (/font-weight:\s*(bold|[7-9]00)/i.test(style)) {
      keep.push("font-weight:bold");
    }

    if (/font-style:\s*italic/i.test(style)) {
      keep.push("font-style:italic");
    }

    if (/text-decoration[^;]*underline/i.test(style)) {
      keep.push("text-decoration:underline");
    }

    const colorMatch = style.match(/color:\s*([^;]+)/i);
    if (colorMatch) {
      keep.push(`color:${colorMatch[1].trim()}`);
    }

    el.setAttribute("style", keep.join("; "));

    // Convert paragraphs/divs into line breaks, not spaced blocks
    if (tag === "p" || tag === "div") {
      el.style.margin = "0";
      el.style.padding = "0";
    }
  });

  let cleaned = doc.body.innerHTML;

  cleaned = cleaned
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "<br>")
    .replace(/<div[^>]*>/gi, "")
    .replace(/<\/div>/gi, "<br>")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");

  return cleaned;
}

function updateMeta() {
  songData.title = document.getElementById("songTitle").value;
  songData.artist = document.getElementById("artistName").value;
  songData.id = generateSongId(songData.title, songData.artist);
  const subTitle = document.getElementById("creatorSubTitle");
  if (subTitle) {
    subTitle.innerText = songData.title
      ? `Editing: ${songData.title}`
      : "";
  }

  songData.userBpm = document.getElementById("userBpm").value;
  songData.originalBpm = document.getElementById("originalBpm").value;
  songData.capo = document.getElementById("capoNote").value;
  songData.key = document.getElementById("songKey").value;
  songData.year = document.getElementById("songYear").value;

  document.getElementById("previewTitle").innerText =
    `${songData.title || "Song Title"} - ${songData.artist || "Artist"}`;

  document.getElementById("previewUserBpm").innerText =
    songData.userBpm ? `${songData.userBpm} BPM` : "";

  document.getElementById("previewOriginalBpm").innerText =
    songData.originalBpm ? `Original: ${songData.originalBpm} BPM` : "";

  document.getElementById("previewCapo").innerText =
    songData.capo ? `Capo: ${songData.capo}` : "";

  document.getElementById("previewKey").innerText =
    songData.key ? `Key: ${songData.key}` : "";

  const previewYear = document.getElementById("previewYear");

  if (previewYear) {
    previewYear.innerText =
      songData.year ? `Year: ${songData.year}` : "";
  }
}

["songTitle", "artistName", "userBpm", "originalBpm", "capoNote", "songKey", "songYear"]
  .forEach(id => {
    document.getElementById(id).addEventListener("input", updateMeta);
  });

function formatText(command) {
  document.execCommand(command, false, null);
  document.getElementById("sectionEditor").focus();
  updateLivePreview();
}

function formatColor(color) {
  document.execCommand("foreColor", false, color);
  document.getElementById("sectionEditor").focus();
  updateLivePreview();
}

function setSectionColor(color, btn) {
  selectedSectionColor = color;

  document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function updateEditorFont() {
  const font = document.getElementById("fontFamily").value;
  document.getElementById("sectionEditor").style.fontFamily = font;
}


/* SAVE SECTION */
function saveSection() {

  if (editingIndex !== null) {
    const ok = confirm("Update this section?");
    if (!ok) return;
  }
  
  const title = document.getElementById("sectionTitleCustom").value.toUpperCase().trim();
  const editor = document.getElementById("sectionEditor");
  const fontFamily = document.getElementById("fontFamily").value;
  const sectionType = document.getElementById("sectionType").value;

  let html = editor.innerHTML;

  if (!html.replace(/<br\s*\/?>/gi, "").trim()) {
    alert("Please enter lyrics/chords first.");
    return;
  }

  html = html
  .replace(/<!--StartFragment-->/g, "")
  .replace(/<!--EndFragment-->/g, "")
  .replace(/<div[^>]*>/gi, "<br>")
  .replace(/<\/div>/gi, "")
  .replace(/<p[^>]*>/gi, "<br>")
  .replace(/<\/p>/gi, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
  .replace(/^(<br\s*\/?>|\s)+/gi, "")
  .replace(/(<br\s*\/?>|\s)+$/gi, "")
  .trim();

  if (sectionType === "tab") {
    html = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\u200B/g, "")
      .replace(/\uFEFF/g, "");
  }

  /*
  if (sectionType === "tab") {
    html = html
      .replace(/<br\s*\/?>/gi, "\n")
      .split("\n")
      .map(line => line.trimStart())
      .join("\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }
  */

  const section = {
    type: sectionType,
    title,
    html,
    collapsed:
      sectionType === "tab"
        ? document.getElementById("tabStartsCollapsed").checked
        : false,
    style: {
      fontFamily,
      color: selectedSectionColor,
      isTab: sectionType === "tab"
    }
  };

  if (editingIndex !== null && editingIndex >= 0) {
    songData.sections.splice(editingIndex, 1, section);
  } else {
    songData.sections.push(section);
  }

  clearEditor();
  renderPreview();
}
  

/* CLEAR EDITOR */
function clearEditor() {
  document.getElementById("livePreviewBox").classList.add("hidden");
  document.getElementById("sectionTitleCustom").value = "";
  document.getElementById("sectionType").value = "lyrics";
  document.getElementById("sectionEditor").innerHTML = "";
  document.getElementById("liveSectionPreview").innerHTML = "";
  document.getElementById("sectionEditor").classList.remove("tab-editing");

  editingIndex = null;
  editingBackup = null;

  document.getElementById("saveSectionBtn").innerText = "Add Section";
  document.getElementById("cancelEditBtn").style.display = "none";

  document.getElementById("editorTitle").innerText = "Create Section";
  document.getElementById("saveSectionBtn").innerText = "Create Section";
  document.getElementById("saveSectionBtn").classList.remove("editing");
  document.getElementById("cancelEditBtn").style.display = "none";
  
  document.getElementById("insertTabBtn").disabled = true;
  document.getElementById("insertTabBtn").classList.remove("enabled");
  
  document.getElementById("sectionEditor").classList.remove("tab-editing");
  document.querySelector(".editor-panel").classList.remove("editing-mode");

  document.getElementById("fontFamily").value = "Verdana";
  document.getElementById("sectionEditor").style.fontFamily = "Verdana";
  document.getElementById("sectionEditor").classList.remove("tab-editing");
}

function insertSeparator(index) {
  songData.sections.splice(index + 1, 0, {
    type: "separator"
  });

  renderPreview();
}

function moveSection(index, direction) {
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= songData.sections.length) return;

  const temp = songData.sections[index];
  songData.sections[index] = songData.sections[newIndex];
  songData.sections[newIndex] = temp;

  renderPreview();
}

/* RENDER PREVIEW */
function renderPreview() {
  updateMeta();

  const container = document.getElementById("sectionsPreview");
  container.innerHTML = "";

  songData.sections.forEach((section, index) => {

    if (section.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "section-separator";
      sep.innerHTML = `
        <hr>
        <div class="section-actions">
          <button onclick="moveSection(${index}, -1)">↑</button>
          <button onclick="moveSection(${index}, 1)">↓</button>
          <button onclick="deleteSection(${index})">Delete</button>
        </div>
      `;
      container.appendChild(sep);
      return;
    }

    const isTab = section.type === "tab";
    const isCollapsed = isTab && section.collapsed === true;

    const div = document.createElement("div");
    div.className = isTab ? "lyric-section tab-section" : "lyric-section";
    
    if (index === editingIndex) {
      div.classList.add("section-being-edited");
    }

    div.style.fontFamily = section.style?.fontFamily || "Verdana";
    div.style.color = section.style?.color || "white";

    let sectionHtml = section.html || "";

    if (isTab) {
      sectionHtml = sectionHtml.replace(/-/g, `<span class="tab-dash">-</span>`);
    }
    
    div.innerHTML = `
      ${section.title ? `
        <div class="lyric-section-title ${isTab ? "clickable-title" : ""}"
             ${isTab ? `onclick="toggleTabSection(${index})"` : ""}>
          ${isTab ? (isCollapsed ? "▶ " : "▼ ") : ""}${section.title}
        </div>
      ` : ""}

      <div class="section-text ${isCollapsed ? "collapsed" : ""}">
        ${sectionHtml}
      </div>

      <div class="section-actions">
        <button onclick="editSection(${index})">Edit</button>
        <button onclick="insertBefore(${index})">Insert Above</button>
        <button onclick="insertSeparator(${index})">Insert Separator</button>
        <button onclick="moveSection(${index}, -1)">↑ Move Up</button>
        <button onclick="moveSection(${index}, 1)">↓ Move Down</button>
        <button onclick="deleteSection(${index})">Delete</button>
      </div>
    `;

    container.appendChild(div);
  });
}

/* TAB TOGGLE COLLAPSE SECTION */
function toggleTabSection(index) {
  songData.sections[index].collapsed = !songData.sections[index].collapsed;
  renderPreview();
}

/* EDIT SECTION */
function editSection(index) {
  const section = songData.sections[index];

  if (section.type === "separator") return;
  document.getElementById("sectionEditor")
    .classList.toggle("tab-editing", section.type === "tab");
  editingIndex = index;
  editingBackup = JSON.parse(JSON.stringify(section));

  document.getElementById("sectionTitleCustom").value = section.title || "";
  document.getElementById("sectionType").value = section.type === "tab" ? "tab" : "lyrics";

  const tabOptions = document.getElementById("tabOptions");
  const tabCheckbox = document.getElementById("tabStartsCollapsed");
  const tabBtn = document.getElementById("tabStartsCollapsedBtn");
  
  if (section.type === "tab") {
    tabOptions.style.display = "flex";
  
    tabCheckbox.checked =
      section.collapsed !== undefined ? section.collapsed : true;
  
    tabBtn.classList.toggle("active", tabCheckbox.checked);
    tabBtn.innerText = tabCheckbox.checked ? "Load Closed" : "Load Open";

    syncTabToggleButton();
  
    document.getElementById("insertTabBtn").disabled = false;
    document.getElementById("insertTabBtn").classList.add("enabled");
  
  } else {
    tabOptions.style.display = "none";
  }
  
  document.getElementById("sectionEditor").innerHTML = section.html || "";
  document.getElementById("fontFamily").value = section.style.fontFamily;
  document.getElementById("sectionEditor").style.fontFamily = section.style.fontFamily;

  selectedSectionColor = section.style.color || "white";

  document.getElementById("editorTitle").innerText = "Edit Section";
  document.getElementById("saveSectionBtn").innerText = "Update Section";
  document.getElementById("saveSectionBtn").classList.add("editing");
  document.getElementById("cancelEditBtn").style.display = "inline-block";
  document.querySelector(".editor-panel").classList.add("editing-mode");
  document.getElementById("creatorTopTitle").innerText =
  "● Lyrics & Chords Editor ●";
  

  updateLivePreview();

  window.scrollTo({
    top: document.querySelector(".editor-panel").offsetTop - 20,
    behavior: "smooth"
  });
}

/* CANCEL EDIT FUNCTION */
function cancelEdit() {
  editingIndex = null;
  editingBackup = null;
  clearEditor();
  renderPreview();
}

function insertBefore(index) {
  const title = prompt("Section title:");
  const text = prompt("Lyrics / chords:");

  if (!text) return;

  songData.sections.splice(index, 0, {
    title,
    text,
    style: {
      fontFamily: "Arial",
      color: "white",
      bold: false,
      italic: false,
      underline: false,
      align: "left"
    }
  });

  renderPreview();
}

function deleteSection(index) {
  if (!confirm("Delete this section?")) return;

  songData.sections.splice(index, 1);
  renderPreview();
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function makeSafeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function downloadJS() {
  updateMeta();

  if (!songData.title.trim()) {
    alert("Please enter a song title.");
    return;
  }

  const variableName =
    "song_" + makeSafeFileName(songData.title).replace(/-/g, "_");

  const content =
`window.${variableName} = ${JSON.stringify(songData, null, 2)};`;

  const blob = new Blob([content], { type: "text/javascript" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = makeSafeFileName(songData.title) + ".js";
  a.click();

  URL.revokeObjectURL(a.href);
}

document.getElementById("sectionEditor")
.addEventListener("input", updateLivePreview);

document.getElementById("sectionTitleCustom")
.addEventListener("input", updateLivePreview);

document.getElementById("fontFamily")
.addEventListener("change", updateLivePreview);

function updateLivePreview() {
  const title = document.getElementById("sectionTitleCustom").value.toUpperCase();
  const html = document.getElementById("sectionEditor").innerHTML;
  const font = document.getElementById("fontFamily").value;

  const previewBox = document.getElementById("livePreviewBox");
  const preview = document.getElementById("liveSectionPreview");

  const sectionType = document.getElementById("sectionType").value;

  const previewFont =
  sectionType === "tab" ? "Courier New" : "Verdana";

  const cleanHtml = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, "")
    .trim();

  const isEmpty = !title.trim() && !cleanHtml;

  if (isEmpty) {
    previewBox.classList.add("hidden");
    preview.innerHTML = "";
    return;
  }

  previewBox.classList.remove("hidden");

  preview.className =
    sectionType === "tab"
      ? "lyric-section preview-draft tab-preview"
      : "lyric-section preview-draft lyrics-preview";

  let previewHtml = html;

  if (sectionType === "tab") {
    previewHtml = html.replace(/-/g, `<span class="tab-dash">-</span>`);
  }
  
  preview.innerHTML = `
    ${title ? `<div class="lyric-section-title">${title}${sectionType === "tab" ? " (TAB)" : ""}</div>` : ""}
    <div class="section-text" style="font-family:${previewFont}; color:${selectedSectionColor};">
      ${previewHtml}
    </div>
  `;
}

document.getElementById("sectionType").addEventListener("change", function () {
  const editor = document.getElementById("sectionEditor");
  const fontSelect = document.getElementById("fontFamily");
  const tabBtn = document.getElementById("insertTabBtn");
  const tabOptions = document.getElementById("tabOptions");
 
  if (this.value === "tab") { /* TAB MODE */
    fontSelect.value = "Courier New";
    editor.style.fontFamily = "Courier New";
    editor.classList.add("tab-editing");
    tabBtn.disabled = false;
    tabBtn.classList.add("enabled");
    document.execCommand("bold", false, null);
    tabOptions.style.display = "flex";
    tabCheckbox.checked = true;
    syncTabToggleButton();
    tabBtn.classList.add("active");
    tabBtn.innerText = "Load Closed";
    editor.focus();
    document.execCommand("bold", false, true);
  } else { /* LYRICS MODE */
    fontSelect.value = "Verdana";
    editor.style.fontFamily = "Verdana";
    editor.classList.remove("tab-editing");
    tabOptions.style.display = "none";
    tabBtn.disabled = true;
    tabBtn.classList.remove("enabled");
  }

  updateLivePreview();
});



function loadSongForEditing(file) {
  const script = document.createElement("script");

  script.src = `lyrics/new-lyrics-data/${file}`;

  script.onload = () => {
    const variableName = getSongVariableName(file);
    const loadedSong = window[variableName];

    if (!loadedSong) {
      alert("Could not load song for editing.");
      return;
    }

    songData = JSON.parse(JSON.stringify(loadedSong));

    document.getElementById("songTitle").value = songData.title || "";
    document.getElementById("artistName").value = songData.artist || "";
    document.getElementById("userBpm").value = songData.userBpm || "";
    document.getElementById("originalBpm").value = songData.originalBpm || "";
    document.getElementById("capoNote").value = songData.capo || "";
    document.getElementById("songKey").value = songData.key || "";

    document.getElementById("creatorTopTitle").innerText = "● Lyrics & Chords Editor ●";
    
    updateMeta();
    renderPreview();
  };

  script.onerror = () => {
    alert("Could not find file: " + file);
  };

  document.body.appendChild(script);
}

function insertBlankTab() {
  const editor = document.getElementById("sectionEditor");

  const tabText =
`e|-----------------------------------------------------------|
B|-----------------------------------------------------------|
G|-----------------------------------------------------------|
D|-----------------------------------------------------------|
A|-----------------------------------------------------------|
E|-----------------------------------------------------------|`;

  editor.focus();

  document.execCommand(
    "insertHTML",
    false,
    `<b>${tabText.replace(/\n/g, "<br>")}</b>`
  );

  updateLivePreview();
}

function getSongVariableName(fileName) {
  return "song_" + fileName
    .replace(".js", "")
    .replace(/-/g, "_");
}

async function saveSongToFirebase() {
  updateMeta();

  if (!songData.title.trim() || !songData.artist.trim()) {
    alert("Please enter song title and artist.");
    return;
  }

  await db.collection("lyrics").doc(songData.id).set(songData);

  alert("Lyrics saved successfully!");
}

async function loadSongFromFirebase(firebaseId) {
  try {
    const doc = await db.collection("lyrics").doc(firebaseId).get();

    if (!doc.exists) {
      alert("Could not find song in DB.");
      return;
    }

    songData = doc.data();

    document.getElementById("songTitle").value = songData.title || "";
    document.getElementById("artistName").value = songData.artist || "";
    document.getElementById("userBpm").value = songData.userBpm || "";
    document.getElementById("originalBpm").value = songData.originalBpm || "";
    document.getElementById("capoNote").value = songData.capo || "";
    document.getElementById("songKey").value = songData.key || "";
    document.getElementById("songYear").value = songData.year || "";

    document.getElementById("creatorTopTitle").innerText =
      "● Lyrics & Chords Editor ●";

    updateMeta();

if (!Array.isArray(songData.sections)) {
  songData.sections = [];
}

songData.sections = songData.sections.map(section => ({
  type: section.type || "lyrics",
  title: section.title || "",
  html: section.html || "",
  collapsed: section.collapsed !== undefined ? section.collapsed : true,
  style: {
    fontFamily: section.style?.fontFamily || "Verdana",
    color: section.style?.color || "white",
    isTab: section.style?.isTab || false
  }
}));
    renderPreview();

  } catch (error) {
    console.error(error);
    alert("Error loading song from DB");
  }
}

function syncTabToggleButton() {
  const checkbox = document.getElementById("tabStartsCollapsed");
  const btn = document.getElementById("tabStartsCollapsedBtn");

  btn.innerText = checkbox.checked ? "Load Closed" : "Load Open";
  btn.classList.toggle("active", !checkbox.checked);
}

function toggleTabStartsCollapsed() {
  const checkbox = document.getElementById("tabStartsCollapsed");
  checkbox.checked = !checkbox.checked;
  syncTabToggleButton();
}

const MAX_CHARS_PER_LINE = 90;

document.getElementById("sectionEditor").addEventListener("input", function () {
  limitLineLength(this, MAX_CHARS_PER_LINE);
  updateLivePreview();
});

function limitLineLength(editor) {
  /*
  const text = editor.innerText;
  const lines = text.split("\n");

  const wrapped = lines.flatMap(line => {
    const chunks = [];

    while (line.length > MAX_CHARS_PER_LINE) {
      chunks.push(line.slice(0, MAX_CHARS_PER_LINE));
      line = line.slice(MAX_CHARS_PER_LINE);
    }

    chunks.push(line);
    return chunks;
  }).join("\n");

  if (text !== wrapped) {
    editor.innerText = wrapped;

    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(editor);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  }*/
}

function toggleSaveMenu() {
  document.getElementById("saveDropdown").classList.toggle("show");
}

function showConfirm(title, message) {
  return new Promise(resolve => {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");

    titleEl.innerText = title;
    messageEl.innerText = message;
    modal.classList.remove("hidden");

    ok.onclick = () => {
      modal.classList.add("hidden");
      resolve(true);
    };

    cancel.onclick = () => {
      modal.classList.add("hidden");
      resolve(false);
    };
  });
}

async function confirmPendingSectionUpdate() {
  if (editingIndex !== null) {
    const updateNow = await showConfirm(
      "Update Section?",
      "You are currently editing a section. Update it before continuing?"
    );

    if (!updateNow) return false;

    saveSection();
  }

  return true;
}

async function handleSaveClick() {
  document.getElementById("saveDropdown").classList.remove("show");

  const updated = await confirmPendingSectionUpdate();
  if (!updated) return;

  const confirmSave = await showConfirm(
    "Save Lyrics?",
    "Do you want to save this song?"
  );

  if (!confirmSave) return;

  await saveSongToFirebase();

  history.back();
}

async function handleDownloadClick() {
  document.getElementById("saveDropdown").classList.remove("show");

  const updated = await confirmPendingSectionUpdate();
  if (!updated) return;

  const confirmDownload = await showConfirm(
    "Download .JS File?",
    "Do you want to download this lyrics file?"
  );

  if (!confirmDownload) return;

  downloadJS();

  history.back();
}
                                    

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const firebaseId = params.get("firebaseId");

  console.log("Page URL:", window.location.href);
  console.log("firebaseId:", firebaseId);

  if (firebaseId) {
    loadSongFromFirebase(firebaseId);
  } else {
    document.getElementById("creatorTopTitle").innerText =
      "● Lyrics & Chords Creator ●";
  }
});
