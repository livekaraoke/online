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


/**********************************************************/
/********************** SAVE SECTION **********************/
/**********************************************************/
function saveSection() {

  /*
  if (editingIndex !== null) {
    const ok = confirm("Update this section?");
    if (!ok) return;
  }
  */
  
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
    html = editor.innerHTML
      .replace(/<!--StartFragment-->/g, "")
      .replace(/<!--EndFragment-->/g, "")
      .replace(/<br\s*\/?>\s*$/gi, "")
      .replace(/contenteditable="true"/gi, "")
      .replace(/contenteditable="false"/gi, "")
      .trim();
  }
  
  /*
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
    html = editor.innerHTML
      .replace(/<!--StartFragment-->/g, "")
      .replace(/<!--EndFragment-->/g, "")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/<(?!\/?(font|span|b)\b)[^>]+>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (sectionType === "tab") {
  html = editor.innerHTML
    .replace(/<!--StartFragment-->/g, "")
    .replace(/<!--EndFragment-->/g, "")
    .replace(/<br\s*\/?>\s*$/gi, "")
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
/**********************************************************/
/******************* END OF SAVE SECTION ******************/
/**********************************************************/

async function confirmUpdateSection() {
  return await showConfirm(
    "Update Section?",
    "Do you want to update this section?"
  );
}

async function saveSectionWithConfirm() {
  if (editingIndex !== null) {
    const ok = await confirmUpdateSection();
    if (!ok) return;
  }

  saveSection();
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

  document.getElementById("updateNextBtn").style.display = "none";
  document.getElementById("updateNextBtn").disabled = false;
  document.getElementById("updateNextBtn").classList.remove("disabled");

  document.getElementById("sectionType").disabled = false;
  document.getElementById("fontFamily").disabled = false;
  setTabControlMode(false);
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

async function updateAndGoNext() {
  if (editingIndex === null) return;

  const currentIndex = editingIndex;

  const ok = await showConfirm(
    "Update Section?",
    "Update this section and go to the next section?"
  );

  if (!ok) return;

  saveSection();

  let nextIndex = currentIndex + 1;

  while (
    nextIndex < songData.sections.length &&
    songData.sections[nextIndex].type === "separator"
  ) {
    nextIndex++;
  }

  if (nextIndex < songData.sections.length) {
    editSection(nextIndex);
  }
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

/* Disable font/B/I/U/align/ type controls when editing tabs */
function setTabControlMode(isTab) {
  const font = document.getElementById("fontFamily");
  const sectionType = document.getElementById("sectionType");

  sectionType.disabled = isTab;

  font.disabled = isTab;

  document
    .querySelectorAll(".format-buttons button")
    .forEach(btn => {
      btn.disabled = isTab;
      btn.classList.toggle("disabled-control", isTab);
    });
}

/* EDIT SECTION */
function editSection(index) {
  const section = songData.sections[index];

  const updateNextBtn = document.getElementById("updateNextBtn");

  updateNextBtn.style.display = "inline-block";
  
  const hasNextSection =
    songData.sections.slice(index + 1).some(sec => sec.type !== "separator");
  
  updateNextBtn.disabled = !hasNextSection;
  
  if (updateNextBtn.disabled) {
    updateNextBtn.classList.add("disabled");
  } else {
    updateNextBtn.classList.remove("disabled");
  }
  
  if (section.type === "separator") return;

  setTabControlMode(section.type === "tab");
  
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

/* sectionType Listener */
document.getElementById("sectionType").addEventListener("change", function () {
  const editor = document.getElementById("sectionEditor");
  const fontSelect = document.getElementById("fontFamily");
  const tabBtn = document.getElementById("insertTabBtn");
  const tabOptions = document.getElementById("tabOptions");
 
  if (this.value === "tab") { /* TAB MODE */
    setTabControlMode(true);
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
    setTabControlMode(false);
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

/**********************************************************/
/******************* GUITAR TAB DESIGN ********************/
/**********************************************************/

/*** Insert Blank Tab *************/
/**********************************/
function insertBlankTab() {
  const editor = document.getElementById("sectionEditor");

  const tabHtml = `
    <div class="tab-block" contenteditable="false">
  
    <div class="tab-line tab-apostrophe">'</div>
  
    <div class="tab-line tab-note-line">
      <span class="tab-fixed">»</span><span class="tab-note" contenteditable="true">__________________________________________________________</span><span class="tab-fixed">«</span>
    </div>
  
    <div class="tab-spacer">&nbsp;</div>
  
    ${createStringLine("e")}
    ${createStringLine("B")}
    ${createStringLine("G", true)}
    ${createStringLine("D")}
    ${createStringLine("A")}
    ${createStringLine("E")}
  
    </div><br>`;

  insertHtmlAtCursor(tabHtml);
  updateLivePreview();

  document.querySelectorAll(".tab-note").forEach(note => {
    note.classList.add("tab-hidden-fill");
  });
  
}
/*** Insert Blank Tab END *********/
/**********************************/

function createStringLine(letter, repeat = false) {
  return `
  <div class="tab-line">
    <span class="tab-fixed">${letter}⦗|</span><span class="tab-dashes" contenteditable="true">---------------------------------------------------------</span><span class="tab-fixed">|⦘</span>${repeat ? ` <span class="tab-repeat">(x<span contenteditable="true" class="tab-repeat-number">1</span>)</span>` : ""}
  </div>`;
}

function insertHtmlAtCursor(html) {
  const editor = document.getElementById("sectionEditor");
  editor.focus();

  const selection = window.getSelection();

  if (!selection.rangeCount) {
    editor.insertAdjacentHTML("beforeend", html);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const temp = document.createElement("div");
  temp.innerHTML = html;

  const fragment = document.createDocumentFragment();
  let node;
  let lastNode;

  while ((node = temp.firstChild)) {
    lastNode = fragment.appendChild(node);
  }

  range.insertNode(fragment);

  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/*** Tab Event Handlers ***********/
/**********************************/

/**/
/** Tab note (dash '-') input **/
/**/
document.addEventListener("input", function (e) {
  if (!e.target.classList.contains("tab-note")) return;

  const max = 58;
  let text = e.target.innerText.replace(/\n/g, "");

  if (!text || /^_+$/.test(text)) {
    e.target.innerText = "_".repeat(max);
    e.target.classList.add("tab-hidden-fill");
    return;
  }

  text = text.replace(/_/g, "");

  if (text.length > max) {
    text = text.slice(0, max);
  }

  e.target.innerText =
    text + "_".repeat(Math.max(0, max - text.length));

  e.target.classList.remove("tab-hidden-fill");
});
/**/
/**/

/**/
/** Limit repeat number to 0-9 **/
/**/
document.addEventListener("input", function (e) {
  if (!e.target.classList.contains("tab-repeat-number")) return;

  let value = e.target.innerText.replace(/[^0-9]/g, "").slice(0, 1);

  if (value === "") value = "0";

  e.target.innerText = value;

  const repeat = e.target.closest(".tab-repeat");
  repeat.classList.toggle("zero", value === "0");
});
/**/
/**/

/**/
/** Prevent typing outside tab blocks while in Guitar Tab mode**/
/**/
document.getElementById("sectionEditor").addEventListener("keydown", function (e) {
  const sectionType = document.getElementById("sectionType").value;

  if (sectionType !== "tab") return;

  const allowed =
    e.target.closest(".tab-note") ||
    e.target.closest(".tab-dashes") ||
    e.target.closest(".tab-repeat-number") ||
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Tab"].includes(e.key);

  if (!allowed) {
    e.preventDefault();
  }
});
/**/
/**/

/*** Tab Event Handlers END *******/
/**********************************/

/**********************************************************/
/**************** END OF GUITAR TAB DESIGN ****************/
/**********************************************************/

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

  await showConfirm(
    "Saved",
    "Lyrics saved successfully."
  );
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
