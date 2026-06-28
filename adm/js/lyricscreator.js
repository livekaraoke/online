let selectedColor = "white";
let selectedSectionColor = "white";
let editingIndex = null;
let editingBackup = null;
let currentFirebaseId = null;

let songData = {
  id: "",
  title: "",
  artist: "",
  userBpm: "",
  originalBpm: "",
  capo: "",
  key: "",
  year: "",
  karaokeLyrics: "",
  note: "",
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
  songData.karaokeLyrics = document.getElementById("karaokeLyrics").value;
  songData.note = document.getElementById("songNote").value;

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

  document.getElementById("previewKaraokeLyrics").innerText =
  songData.karaokeLyrics ? `Karaoke Lyrics: ${songData.karaokeLyrics}` : "";

  document.getElementById("previewSongNote").innerText =
  songData.note ? `Note: ${songData.note}` : "";
}

["songTitle", "artistName", "userBpm", "originalBpm", "capoNote", "songKey", "songYear", "karaokeLyrics", "songNote"]
  .forEach(id => {
    document.getElementById(id).addEventListener("input", updateMeta);
  });

function formatText(command) {
  document.execCommand(command, false, null);
  document.getElementById("sectionEditor").focus();
  updateLivePreview();
}

function formatColor(color) {
  const sel = window.getSelection();

  if (sel.rangeCount) {
    const node = sel.anchorNode;
    const el =
      node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : node;

    const tabCell = el.closest?.(".tab-cell");
    const noteCell = el.closest?.(".note-cell");

    if (tabCell) {
      if (tabCell.classList.contains("dash")) return;

      tabCell.style.color = color;
      tabCell.style.webkitTextFillColor = color;
      updateLivePreview();
      return;
    }

    if (noteCell) {
      if (noteCell.classList.contains("empty")) return;

      noteCell.style.color = color;
      noteCell.style.webkitTextFillColor = color;
      updateLivePreview();
      return;
    }
  }

  document.execCommand("foreColor", false, color);
  document.getElementById("sectionEditor").focus();
  updateLivePreview();
}

function colourDashSegment(el, pos, color) {
  const text = el.innerText;
  let left = pos;
  let right = pos;

  while (left > 0 && text[left - 1] === "-") left--;
  while (right < text.length && text[right] === "-") right++;

  const before = text.slice(0, left);
  const middle = text.slice(left, right);
  const after = text.slice(right);

  el.innerHTML =
    escapeHTML(before) +
    `<span style="color:${color}">${escapeHTML(middle)}</span>` +
    escapeHTML(after);
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

const TIME_SYMBOLS = ["⸳", "𝅝", "𝅗𝅥", "𝅘𝅥", "𝅘𝅥𝅮", "𝄽", "𝄾", "♯", "♮", "♭", "⫰", "|", "⸾", "⦚"];

function createTabTimeLine() {
  return `
    <div class="tab-time-line" contenteditable="false">
      <button type="button" class="delete-tab-time-btn">✕</button>
      ${Array.from({ length: 16 }).map(() =>
        `<span class="tab-time-symbol" contenteditable="true">⸳</span>`
      ).join('<span class="tab-time-gap">   </span>')}
    </div>
  `;
}

function insertTabTimeLine() {
  const sel = window.getSelection();
  if (!sel.rangeCount) {
    showAlert("No Tab Selected", "Click inside a guitar tab block first.");
    return;
  }

  const node = sel.anchorNode;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const block = el.closest?.(".tab-block");

  if (!block) {
    showAlert("No Tab Selected", "Click inside a guitar tab block first.");
    return;
  }

  const existing = block.querySelector(".tab-time-line");

  if (existing) {
    showAlert("Time Line Exists", "This guitar tab block already has a time line.");
    return;
  }

  const controls = block.querySelector(".tab-block-controls");
  if (controls) {
    controls.insertAdjacentHTML("beforebegin", createTabTimeLine());
  } else {
    block.insertAdjacentHTML("beforeend", createTabTimeLine());
  }
  restoreTabEditability(document.getElementById("sectionEditor"));
  updateLivePreview();
}

document.addEventListener("click", function (e) {
  if (!e.target.classList.contains("tab-time-symbol")) return;

  if (e.target.classList.contains("delete-tab-time-btn")) {
    const ok = await showConfirm("Delete Time Line?", "Delete this time indication line?");
    if (!ok) return;

    e.target.closest(".tab-time-line").remove();
    updateLivePreview();
    return;
  }
  

  const current = e.target.innerText.trim();
  const index = TIME_SYMBOLS.indexOf(current);
  const next = TIME_SYMBOLS[(index + 1) % TIME_SYMBOLS.length];

  e.target.innerText = next;

  updateLivePreview();
});

document.addEventListener("keydown", function (e) {
  if (!e.target.classList.contains("tab-time-symbol")) return;

  e.preventDefault();

  if (TIME_SYMBOLS.includes(e.key)) {
    e.target.innerText = e.key;
    updateLivePreview();
  }
});

function togglePerfNoteMenu() {
  document.getElementById("perfNoteMenu").classList.toggle("hidden");
}

function createPerformanceNote(icon) {
  return `
    <div class="performance-note-line" contenteditable="false"><span class="performance-note-icon">${icon}</span><span class="performance-note-bracket">⦓</span><span class="performance-note-text" contenteditable="true"></span><span class="performance-note-bracket">⦔</span><span class="performance-note-icon">${icon}</span></div>`;
}

function insertPerformanceNote(icon) {
  insertHtmlAtCursor(createPerformanceNote(icon));
  document.getElementById("perfNoteMenu").classList.add("hidden");
  updateLivePreview();
}

document.addEventListener("keydown", function (e) {
  const target = e.target.closest(".performance-note-text");
  if (!target) return;

  const allowed = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Tab"];
  if (allowed.includes(e.key)) return;

  if (e.key.length !== 1) return;

  e.preventDefault();

  const max = 40;
  const text = target.innerText;
  const clean = text.trimEnd();

  if (clean.length >= max) return;

  document.execCommand("insertText", false, e.key);
  target.innerText = target.innerText.slice(0, max).padEnd(max, " ");
  setCaret(target, Math.min(clean.length + 1, max));
  updateLivePreview();
});

function toggleSymbolMenu() {
  document.getElementById("symbolMenu").classList.toggle("hidden");
}

function insertMusicSymbol(symbol) {
  insertHtmlAtCursor(symbol);
  document.getElementById("symbolMenu").classList.add("hidden");
  updateLivePreview();
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

  if (!title) {
    showAlert("Missing Section Title", "Please enter a section title before adding this section.");
    return;
  }
  
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
  
  if (sectionType === "tab") {
    html = editor.innerHTML
      .replace(/<!--StartFragment-->/g, "")
      .replace(/<!--EndFragment-->/g, "")
      .replace(/<button[^>]*class="delete-tab-btn"[^>]*>.*?<\/button>/gi, "")
      .replace(/<button[^>]*class="delete-tab-line-btn"[^>]*>.*?<\/button>/gi, "")
      .replace(/<div[^>]*class="tab-insert-row"[^>]*>.*?<\/div>/gi, "")
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

  if (sectionType === "tab") {
    html = upgradeOldTabStrings(html);
  }

  html = addSectionMarker(html);
  
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

  editor.querySelectorAll(".tab-block-controls")
    .forEach(el => el.style.display = "none");
  
  editor.querySelectorAll(".delete-tab-line-btn")
    .forEach(el => el.style.display = "none");

  clearEditor();
  renderPreview();
}
/**********************************************************/
/******************* END OF SAVE SECTION ******************/
/**********************************************************/

function upgradeOldTabStrings(html) {

  return html.replace(
    /<span class="tab-fixed">([eBGDAE])\s*⦗\|<\/span>/g,
    (_, letter) =>
      `<span class="tab-fixed"><span class="tab-string-letter">${letter}</span><span class="tab-string-gap"> </span>⦗|</span>`
  );

}


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

function formatPreset(color) {
  document.execCommand("foreColor", false, color);
  document.execCommand("bold", false, null);
  updateLivePreview();
}

function insertRepeatLabel() {
  const html =
    `<span class="tab-repeat-label" contenteditable="false">(x<span contenteditable="true" class="tab-repeat-number">2</span>)</span>`;

  insertHtmlAtCursor(html);
  updateLivePreview();
}

/*** INSERT SONG LINK ***/
async function insertSongLink() {
  const modal = document.getElementById("songLinkModal");
  const select = document.getElementById("songLinkSelect");
  const insertBtn = document.getElementById("songLinkInsertBtn");
  const cancelBtn = document.getElementById("songLinkCancelBtn");

  select.innerHTML = "";

  const snap = await db.collection("lyrics").orderBy("title").get();

  snap.forEach(doc => {
    const song = doc.data();
    const option = document.createElement("option");

    option.value = doc.id;
    option.dataset.title = song.title || "";
    option.dataset.artist = song.artist || "";
    option.textContent = `${song.title || "Untitled"} - ${song.artist || "Unknown Artist"}`;

    select.appendChild(option);
  });

  modal.classList.remove("hidden");

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  insertBtn.onclick = () => {
    const selected = select.options[select.selectedIndex];

    const id = selected.value;
    const title = selected.dataset.title;
    const artist = selected.dataset.artist;

    const html = `
      <span class="song-link-pill" contenteditable="false">
        <a href="lyricview.html?id=${id}">${title} - ${artist}</a>
        <button type="button" onclick="this.parentElement.remove()">×</button>
      </span>
    `;

    insertHtmlAtCursor(html);
    updateLivePreview();
    modal.classList.add("hidden");
  };
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

  const tabBtn = document.getElementById("insertTabBtn");
  tabBtn.style.display = "none";
  tabBtn.disabled = true;
  tabBtn.classList.remove("enabled");

  const tabBarBtn = document.getElementById("insertBarBtn");
  tabBarBtn.style.display = "none";
  tabBarBtn.disabled = true;
  tabBarBtn.classList.remove("enabled");

  document.getElementById("insertTimeBtn").style.display = "none";
  document.getElementById("insertTimeBtn").disabled = true;
  document.getElementById("insertTimeBtn").classList.remove("enabled");


  document.getElementById("sectionType").disabled = false;
  
  document.getElementById("sectionEditor").classList.remove("tab-editing");
  document.querySelector(".editor-panel").classList.remove("editing-mode");

  document.getElementById("fontFamily").value = "Verdana";
  document.getElementById("fontFamily").disabled = false;
  document.getElementById("sectionEditor").style.fontFamily = "Verdana";
  document.getElementById("sectionEditor").classList.remove("tab-editing");

  document.getElementById("updateNextBtn").style.display = "none";
  document.getElementById("updateNextBtn").disabled = false;
  document.getElementById("updateNextBtn").classList.remove("disabled");

  const tabCheckbox = document.getElementById("tabStartsCollapsed");
  tabCheckbox.checked = false;
  syncTabToggleButton();

  document.getElementById("tabOptions").style.display = "none";

  document.getElementById("sectionType").disabled = false;
  setTabControlMode(false);
}

function insertSeparator(index) {
  songData.sections.splice(index + 1, 0, {
    type: "separator"
  });

  renderPreview();
}

function insertTabBar() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const node = sel.anchorNode;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;

  const currentCell = el.closest?.(".tab-cell");
  if (!currentCell) {
    showAlert("No Tab Position", "Click inside a guitar tab line first.");
    return;
  }

  const currentLine = currentCell.closest(".tab-line");
  const block = currentCell.closest(".tab-block");

  if (!currentLine || !block) return;

  const currentCells = [...currentLine.querySelectorAll(".tab-cell")];
  const pos = currentCells.indexOf(currentCell);

  if (pos < 0) return;

  block.querySelectorAll(".tab-line").forEach(line => {
    const cells = [...line.querySelectorAll(".tab-cell")];
    if (!cells[pos]) return;

    cells[pos].innerText = "|";
    cells[pos].className = "tab-cell filled tab-bar";
    cells[pos].style.color = selectedSectionColor || "white";
    cells[pos].style.webkitTextFillColor = selectedSectionColor || "white";
  });

  updateLivePreview();
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
          <button onclick="duplicateTabBlock(${index}, 1)">⧉ Duplicate</button>
          <button onclick="deleteSection(${index})">Delete</button>
        </div>
      `;
      container.appendChild(sep);
      return;
    }

    const isTab = section.type === "tab";
    const isCollapsed = section.collapsed === true;
    /*const isCollapsed = isTab && section.collapsed === true;*/

    const div = document.createElement("div");
    div.className = isTab ? "lyric-section tab-section" : "lyric-section";
    
    if (index === editingIndex) {
      div.classList.add("section-being-edited");
    }

    div.style.fontFamily = section.style?.fontFamily || "Verdana";
    div.style.color = section.style?.color || "white";

    let sectionHtml = section.html || "";

    sectionHtml = sectionHtml
      .replace(/<div[^>]*class="tab-block-controls"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*class="tab-insert-row"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<button[^>]*class="delete-tab-line-btn"[^>]*>[\s\S]*?<\/button>/gi, "");


    if (isTab) {
      sectionHtml = section.html || ""; // DO NOT replace dashes here
      //sectionHtml = sectionHtml.replace(/-/g, `<span class="tab-dash">-</span>`);
    }
    
    /*div.innerHTML = `
      ${section.title ? `
        <div class="lyric-section-title ${isTab ? "tab-title" : ""}"
             onclick="toggleSectionCollapse(${index})">
          <span class="tab-arrow">${isCollapsed ? "▶ " : "▼ "}</span>
          ${section.title}
        </div>
      ` : ""}*/
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
        <button onclick="duplicateSection(${index})">Duplicate</button>
        <button onclick="insertSeparator(${index})">Insert Separator</button>
        <button onclick="moveSection(${index}, -1)">↑ Move Up</button>
        <button onclick="moveSection(${index}, 1)">↓▼ Move Down</button>
        <button onclick="deleteSection(${index})">Delete</button>
      </div>
    `;

    container.appendChild(div);
  });
}

function toggleSectionCollapse(index) {
  songData.sections[index].collapsed = !songData.sections[index].collapsed;
  renderPreview();
}

function duplicateSection(index) {
  const copy = JSON.parse(JSON.stringify(songData.sections[index]));
  copy.collapsed = false;
  songData.sections.splice(index + 1, 0, copy);
  renderPreview();
}

function addSectionMarker(html) {
  html = String(html || "");

  // Remove old marker versions first, so it never duplicates
  html = html
    .replace(/<div[^>]*class=["']section-marker["'][^>]*>●<\/div>/gi, "")
    .replace(/<span[^>]*class=["']section-anchor["'][^>]*>●<\/span><br\s*\/?>?/gi, "")
    .replace(/<span[^>]*class=["']section-marker["'][^>]*>●<\/span><br\s*\/?>?/gi, "")
    .replace(/^(<br\s*\/?>|\s)+/gi, "");

  return `<div class="section-marker" contenteditable="false">●</div>` + html;
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
  
    tabCheckbox.checked = section.collapsed === true;
    syncTabToggleButton();
  
    tabBtn.classList.toggle("active", tabCheckbox.checked);
    tabBtn.innerText = tabCheckbox.checked ? "Load Closed" : "Load Open";

    syncTabToggleButton();
  
    document.getElementById("insertTabBtn").style.display = "inline-block";
    document.getElementById("insertTabBtn").disabled = false;
    document.getElementById("insertTabBtn").classList.add("enabled");
  
    document.getElementById("insertBarBtn").style.display = "inline-block";
    document.getElementById("insertBarBtn").disabled = false;
    document.getElementById("insertBarBtn").classList.add("enabled");

    document.getElementById("sectionType").disabled = true;
  

    document.getElementById("insertTimeBtn").style.display = "inline-block";
    document.getElementById("insertTimeBtn").disabled = false;
    document.getElementById("insertTimeBtn").classList.add("enabled");


  } else {
    
    tabOptions.style.display = "none";
    document.getElementById("insertTabBtn").style.display = "none";
    document.getElementById("insertTabBtn").disabled = true;
    document.getElementById("insertBarBtn").style.display = "none";
    document.getElementById("insertBarBtn").disabled = true;
    document.getElementById("sectionType").disabled = true;
    
    document.getElementById("insertTimeBtn").style.display = "none";
    document.getElementById("insertTimeBtn").disabled = true;
    document.getElementById("insertTimeBtn").classList.remove("enabled");
  }
  
  const editor = document.getElementById("sectionEditor");

  //editor.innerHTML = section.html || "";

  editor.innerHTML = (section.html || "")
    .replace(/<div[^>]*class=["']section-marker["'][^>]*>●<\/div>/gi, "")
    .replace(/<span[^>]*class=["']section-anchor["'][^>]*>●<\/span><br\s*\/?>?/gi, "")
    .replace(/<span[^>]*class=["']section-marker["'][^>]*>●<\/span><br\s*\/?>?/gi, "");
  
  if (section.type !== "tab") {
    editor.style.whiteSpace = "pre-wrap";
  }
  
  if (section.type === "tab") {
    restoreTabEditability(document.getElementById("sectionEditor"));
    editor.querySelectorAll(".tab-line").forEach(line => {

  if (!line.querySelector(".tab-dashes")) return;

  if (!line.querySelector(".delete-tab-line-btn")) {
/* Saved symbols:  ↑   ↓   ▲    ▼    ⧉   ✕   ✖  */
    line.insertAdjacentHTML(
      "afterbegin",
      '<button type="button" class="delete-tab-line-btn">✕</button>'
    );
  }
});
  }
  
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

function ensureTabInsertRows(root) {
  const blocks = [...root.querySelectorAll(".tab-block")];

  blocks.forEach((block, index) => {
    const next = block.nextElementSibling;

    if (index < blocks.length - 1) {
      if (!next || !next.classList.contains("tab-insert-row")) {
        block.insertAdjacentHTML("afterend", createTabInsertButton());
      }
    }
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
      fontFamily: "Verdana",
      color: "white",
      bold: false,
      italic: false,
      underline: false,
      align: "left"
    }
  });

  renderPreview();
}

function restoreTabEditability(root) {
  root.querySelectorAll(
    ".tab-note, .tab-dashes, .tab-repeat-number, .tab-time-symbol, .performance-note-text"
  ).forEach(el => {
    el.setAttribute("contenteditable", "true");
  });

  root.querySelectorAll(".tab-block").forEach(el => {
    el.setAttribute("contenteditable", "false");
  });
}

async function deleteSection(index) {
  const ok = await showConfirm(
    "Delete Section?",
    "Are you sure you want to delete this section?"
  );

  if (!ok) return;

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

  previewHtml = previewHtml
    .replace(/<div[^>]*class="tab-block-controls"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*class="tab-insert-row"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<button[^>]*class="delete-tab-line-btn"[^>]*>[\s\S]*?<\/button>/gi, "");

  if (sectionType === "tab") {
    previewHtml = previewHtml;
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
  const tabBarBtn = document.getElementById("insertBarBtn");
  const tabOptions = document.getElementById("tabOptions");
  const tabCheckbox = document.getElementById("tabStartsCollapsed");
 
  if (this.value === "tab") { /* TAB MODE */
    
    setTabControlMode(true);

    fontSelect.value = "Courier New";
    editor.style.fontFamily = "Courier New";
    editor.classList.add("tab-editing");

    tabBtn.style.display = "inline-block";
    tabBtn.disabled = false;
    tabBtn.classList.add("enabled");

    tabBarBtn.style.display = "inline-block";
    tabBarBtn.disabled = false;
    tabBarBtn.classList.add("enabled");

    tabOptions.style.display = "flex";

    tabCheckbox.checked = false;
    syncTabToggleButton();
    /*tabBtn.classList.add("active");
    tabBtn.innerText = "Load Closed";*/

    document.getElementById("insertTimeBtn").style.display = "inline-block";
    document.getElementById("insertTimeBtn").disabled = false;
    document.getElementById("insertTimeBtn").classList.add("enabled");


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
    tabBtn.style.display = "none";
    
    tabBarBtn.disabled = true;
    tabBarBtn.classList.remove("enabled");
    tabBarBtn.style.display = "none";

    document.getElementById("insertTimeBtn").style.display = "none";
    document.getElementById("insertTimeBtn").disabled = true;
    document.getElementById("insertTimeBtn").classList.remove("enabled");
    
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
  const existingTabs = editor.querySelectorAll(".tab-block");

  const tabHtml =
    createTabInsertButton() +
    createTabBlock();

  if (existingTabs.length > 0) {
    existingTabs[existingTabs.length - 1]
      .insertAdjacentHTML("afterend", createTabInsertButton() + createTabBlock());
  } else {
    insertHtmlAtCursor(createTabBlock());
  }

  restoreTabEditability(editor);
  updateLivePreview();
}
/*** Insert Blank Tab END *********/
/**********************************/

function createTabBlock() {
  return (
    '<div class="tab-gap"></div>' +
    '<div class="tab-block" contenteditable="false">' +
      '<div class="tab-line tab-apostrophe">●</div>' +
      '<div class="tab-line tab-note-line">' +
        '<span class="tab-fixed"><span class="tab-note-space-fix">  </span><span class="tab-n-fix"> </span>»</span>' +
        '<span class="tab-note tab-hidden-fill" contenteditable="true">' +
  '<span class="note-cell empty"> </span>'.repeat(65) +
'</span>' +
        '<span class="tab-fixed">«</span>' +
      '</div>' +
      '<div class="tab-spacer"></div>' +
      createStringLine("e") +
      createStringLine("B") +
      createStringLine("G", true) +
      createStringLine("D") +
      createStringLine("A") +
      createStringLine("E") +
      '<div class="tab-block-controls">' +
        '<button type="button" class="move-tab-up-btn">▲ Up</button>' +
        '<button type="button" class="move-tab-down-btn">▼ Down</button>' +
        '<button type="button" class="duplicate-tab-btn">⧉ Duplicate</button>' +
        '<button type="button" class="delete-tab-btn-bottom">✖ Delete</button>' +
      '</div>' +
    '</div>'
  );
  /* Saved symbols:  ↑   ↓   ▲    ▼    ⧉    ✖  */
 
}

function createTabInsertButton() {
  return '<div class="tab-insert-row" contenteditable="false"><button type="button" class="insert-tab-here-btn">＋</button></div>';
}

function createStringLine(letter, repeat = false) {
  return (
    '<div class="tab-line">' +
      '<button type="button" class="delete-tab-line-btn">✕</button>' +
      '<span class="tab-fixed">' +
        `<span class="tab-string-letter">${letter}</span>` +
        '<span class="tab-string-gap"> </span>' +
        '⦗|' +
      '</span>' +
      '<span class="tab-dashes" contenteditable="true">' +
        '<span class="tab-cell dash">-</span>'.repeat(55) +
      '</span>' +
      '<span class="tab-fixed">|⦘</span>' +
      (repeat
        ? '<span class="tab-repeat"> (x<span contenteditable="true" class="tab-repeat-number">1</span>)</span>'
        : '') +
    '</div>'
  );
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

function setCaret(el, pos) {
  const textNode = el.firstChild;
  if (!textNode) return;

  const range = document.createRange();
  const sel = window.getSelection();

  range.setStart(textNode, Math.min(pos, textNode.length));
  range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
}

function setCaretInsideCell(cell) {
  const range = document.createRange();
  const sel = window.getSelection();

  range.selectNodeContents(cell);
  range.collapse(false);

  sel.removeAllRanges();
  sel.addRange(range);
}

function getCurrentEditorColor() {
  return document.queryCommandValue("foreColor") || "white";
}

/*** Tab Event Handlers ***********/
/**********************************/

/**/
/** Tab note (dash '-') input **/
/**/
document.addEventListener("beforeinput", function (e) {
  const target = e.target.closest(".tab-dashes");
  if (!target) return;

  e.preventDefault();

  const cells = Array.from(target.querySelectorAll(".tab-cell"));
  if (!cells.length) return;

  let pos = getActiveCellIndex(cells);
  if (pos < 0) pos = 0;

  if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
    resetTabCell(cells[pos]);
    setCaretInsideCell(cells[pos]);
    updateLivePreview();
    return;
  }

  const text = e.data || "";
  if (!text) return;

  for (let i = 0; i < text.length && pos + i < cells.length; i++) {
    fillTabCell(cells[pos + i], text[i]);
  }

  setCaretInsideCell(cells[Math.min(pos + text.length, cells.length - 1)]);
  updateLivePreview();
});

function getActiveCellIndex(cells) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return -1;

  const node = sel.anchorNode;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const cell = el.closest ? el.closest(".tab-cell, .note-cell") : null;

  return cells.indexOf(cell);
}

function fillTabCell(cell, ch) {
  cell.innerText = ch;
  cell.className = "tab-cell filled";
  cell.style.color = selectedSectionColor || "#FFFFFF";
  cell.style.webkitTextFillColor = selectedSectionColor || "#FFFFFF";
}

function resetTabCell(cell) {
  cell.innerText = "-";
  cell.className = "tab-cell dash";
  cell.removeAttribute("style");
}
/**/
/*** DELETE / INSERT / MOVE HANDLERS ***/
document.addEventListener("click", async function (e) {
  if (e.target.classList.contains("insert-tab-here-btn")) {
    e.target.closest(".tab-insert-row")
      .insertAdjacentHTML("afterend", createTabBlock() + createTabInsertButton());

    restoreTabEditability(document.getElementById("sectionEditor"));
    updateLivePreview();
  }

  if (e.target.classList.contains("delete-tab-btn") ||
      e.target.classList.contains("delete-tab-btn-bottom")) {
    const ok = await showConfirm("Delete Tab?", "Delete this guitar tab block?");
    if (!ok) return;

    const block = e.target.closest(".tab-block");
    const next = block.nextElementSibling;
    const prev = block.previousElementSibling;

    if (next && next.classList.contains("tab-insert-row")) {
      next.remove();
    }

    if (prev && prev.classList.contains("tab-insert-row")) {
      prev.remove();
    }

    block.remove();
    ensureTabInsertRows(document.getElementById("sectionEditor"));
    updateLivePreview();
  }

  if (e.target.classList.contains("delete-tab-line-btn")) {
    const ok = await showConfirm("Delete Tab Line?", "Delete this tab line?");
    if (!ok) return;

    e.target.closest(".tab-line").remove();
    updateLivePreview();
  }

  if (e.target.classList.contains("move-tab-up-btn")) {
    const block = e.target.closest(".tab-block");
    const prev = block.previousElementSibling?.previousElementSibling;
    if (prev) prev.before(block);
    updateLivePreview();
  }

  if (e.target.classList.contains("move-tab-down-btn")) {
    const block = e.target.closest(".tab-block");
    const next = block.nextElementSibling?.nextElementSibling;
    if (next) next.after(block);
    updateLivePreview();
  }

  if (e.target.classList.contains("duplicate-tab-btn")) {
    const block = e.target.closest(".tab-block");
    const clone = block.cloneNode(true);
  
    block.insertAdjacentHTML("afterend", createTabInsertButton());
    block.nextElementSibling.insertAdjacentElement("afterend", clone);
  
    restoreTabEditability(document.getElementById("sectionEditor"));
    updateLivePreview();
  }

  if (!e.target.classList.contains("tab-dashes")) return;

  const el = e.target;
  const textNode = el.firstChild;
  if (!textNode) return;

  const range = document.caretRangeFromPoint
    ? document.caretRangeFromPoint(e.clientX, e.clientY)
    : null;

  if (!range) return;

  const pos = Math.min(range.startOffset, textNode.length - 1);

  const selRange = document.createRange();
  selRange.setStart(textNode, pos);
  selRange.setEnd(textNode, pos + 1);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(selRange);
  
});
/**/
document.addEventListener("click", function (e) {
  const cell = e.target.closest(".tab-cell, .note-cell");
  if (!cell) return;

  setCaretInsideCell(cell);
});
/**/
/*
document.addEventListener("keydown", function (e) {
  const target = e.target.closest(".tab-note");
  if (!target) return;

  const navKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"];
  if (navKeys.includes(e.key)) return;

  e.preventDefault();

  prepareNoteCells(target);

  const cells = [...target.querySelectorAll(".note-cell")];
  if (!cells.length) return;

  const sel = window.getSelection();
  let pos = 0;

  if (sel.rangeCount) {
    const node = sel.anchorNode;
    const cell = node.nodeType === Node.TEXT_NODE
        ? node.parentElement.closest(".note-cell")
        : node.closest?.(".note-cell");

    const found = cells.indexOf(cell);
    if (found >= 0) pos = found;
  }

  if (e.key === "Backspace") {
    pos = Math.max(0, pos - 1);
    resetNoteCell(cells[pos]);
    setCaretInsideCell(cells[pos]);
    updateLivePreview();
    return;
  }

  if (e.key === "Delete") {
    resetNoteCell(cells[pos]);
    setCaretInsideCell(cells[pos]);
    updateLivePreview();
    return;
  }

  if (e.key.length === 1) {
    cells[pos].innerText = e.key;
    cells[pos].className = "note-cell filled";
    cells[pos].style.color = "white";
    cells[pos].style.webkitTextFillColor = "white";

    setCaretInsideCell(cells[Math.min(pos + 1, cells.length - 1)]);
    updateLivePreview();
  }
});
*/

document.addEventListener("beforeinput", function (e) {
  const target = e.target.closest(".tab-note");
  if (!target) return;

  e.preventDefault();

  prepareNoteCells(target);

  const cells = Array.from(target.querySelectorAll(".note-cell"));
  if (!cells.length) return;

  let pos = getActiveCellIndex(cells);
  if (pos < 0) pos = 0;

  if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
    resetNoteCell(cells[pos]);
    setCaretInsideCell(cells[pos]);
    updateLivePreview();
    return;
  }

  const text = e.data || "";
  if (!text) return;

  for (let i = 0; i < text.length && pos + i < cells.length; i++) {
    fillNoteCell(cells[pos + i], text[i]);
  }

  setCaretInsideCell(cells[Math.min(pos + text.length, cells.length - 1)]);
  updateLivePreview();
});

function prepareNoteCells(note) {
  if (note.querySelector(".note-cell")) return;

  const text = note.innerText || " ".repeat(65);
  note.innerHTML = "";

  for (let i = 0; i < 65; i++) {
    const ch = text[i] || " ";
    const span = document.createElement("span");

    if (ch === " " || ch === "_") {
      span.className = "note-cell empty";
      span.innerText = " ";
    } else {
      span.className = "note-cell filled";
      span.innerText = ch;
      span.style.color = selectedSectionColor || "#FFFFFF";
      span.style.webkitTextFillColor = selectedSectionColor || "#FFFFFF";
    }

    note.appendChild(span);
  }
}

function fillNoteCell(cell, ch) {
  cell.innerText = ch;
  cell.className = "note-cell filled";
  cell.style.color = selectedSectionColor || "#FFFFFF";
  cell.style.webkitTextFillColor = selectedSectionColor || "#FFFFFF";
}

function resetNoteCell(cell) {
  cell.innerText = " ";
  cell.className = "note-cell empty";
  cell.removeAttribute("style");
}

function updateNoteClass(el) {
  const hasText = el.innerText.replace(/_/g, "").trim().length > 0;

  el.classList.toggle("tab-hidden-fill", !hasText);
  el.classList.toggle("has-input", hasText);
}
/**/
function updateTabNoteStates(root) {
  root.querySelectorAll(".tab-note").forEach(updateNoteClass);
}
/**/
document.addEventListener("input", function (e) {
  if (!e.target.classList.contains("tab-repeat-number")) return;

  let value = e.target.innerText.replace(/[^0-9]/g, "").slice(0, 1);
  if (value === "") value = "0";

  e.target.innerText = value;

  const repeat = e.target.closest(".tab-repeat");
  repeat.classList.toggle("zero", value === "0");

  setCaret(e.target, 1);
});
/**/
document.addEventListener("input", function (e) {
  if (!e.target.classList.contains("tab-repeat-number")) return;

  let value = e.target.innerText.replace(/[^0-9]/g, "").slice(0, 1);
  if (value === "") value = "0";

  e.target.innerText = value;

  const repeat = e.target.closest(".tab-repeat");
  repeat.classList.toggle("zero", value === "0");

  setCaret(e.target, 1);
});
/**/
document.addEventListener("click", function (e) {
  if (!e.target.classList.contains("tab-repeat-number")) return;

  const range = document.createRange();
  const sel = window.getSelection();

  range.selectNodeContents(e.target);
  sel.removeAllRanges();
  sel.addRange(range);
});
/**/
document.addEventListener("click", function (e) {
  const cell = e.target.closest(".tab-cell.filled, .note-cell.filled");
  if (!cell) return;

  const range = document.createRange();
  const sel = window.getSelection();

  range.selectNodeContents(cell);
  sel.removeAllRanges();
  sel.addRange(range);
});
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
    await showAlert("Missing Details", "Please enter song title and artist.");
    return;
  }

  const docId = currentFirebaseId || songData.id;

  await db.collection("lyrics").doc(docId).set(songData, { merge: false });

  currentFirebaseId = docId;

  await showAlert("Saved", "Lyrics saved successfully.");
}

async function loadSongFromFirebase(firebaseId) {
  try {
    const doc = await db.collection("lyrics").doc(firebaseId).get();

    if (!doc.exists) {
      alert("Could not find song in DB.");
      return;
    }

    currentFirebaseId = firebaseId;

    songData = doc.data();

    document.getElementById("songTitle").value = songData.title || "";
    document.getElementById("artistName").value = songData.artist || "";
    document.getElementById("userBpm").value = songData.userBpm || "";
    document.getElementById("originalBpm").value = songData.originalBpm || "";
    document.getElementById("capoNote").value = songData.capo || "";
    document.getElementById("songKey").value = songData.key || "";
    document.getElementById("songYear").value = songData.year || "";
    document.getElementById("karaokeLyrics").value = songData.karaokeLyrics || "Default";
    document.getElementById("songNote").value = songData.note || "";

    document.getElementById("creatorTopTitle").innerText =
      "● Lyrics & Chords Editor ●";

    const subTitle = document.getElementById("creatorSubTitle");
    if (subTitle) {
      subTitle.innerText = songData.title ? songData.title : "";
    }

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

    loadKaraokeLyricsList();

    if (songData.karaokeLyrics && songData.karaokeLyrics !== "No") {
      const found = karaokeLyricsList.find(s => cleanKaraokeUrl(s.url) === songData.karaokeLyrics);
    
      const dropdown = document.getElementById("karaokeLyrics");
    
      if (![...dropdown.options].some(opt => opt.value === songData.karaokeLyrics)) {
        const opt = document.createElement("option");
        opt.value = songData.karaokeLyrics;
        opt.textContent = found?.title || songData.karaokeLyrics;
    
        dropdown.insertBefore(opt, dropdown.querySelector('option[value="__add...__"]'));
      }
    
      dropdown.value = songData.karaokeLyrics;
    }

    renderPreview();

  } catch (error) {
    console.error(error);
    alert("Error loading song from DB");
  }
}

function showAlert(title, message) {
  return new Promise(resolve => {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");

    titleEl.innerText = title;
    messageEl.innerText = message;

    cancel.style.display = "none";
    modal.classList.remove("hidden");

    ok.onclick = () => {
      modal.classList.add("hidden");
      cancel.style.display = "";
      resolve(true);
    };
  });
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

    cancel.style.display = "";
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

  if (editingIndex !== null) {
    const ok = await showConfirm(
      "Update & Save?",
      "You are editing a section. Update this section and save the song?"
    );

    if (!ok) return;

    saveSection();
    await saveSongToFirebase();
    history.back();
    return;
  }

  const ok = await showConfirm("Save Lyrics?", "Do you want to save this song?");
  if (!ok) return;

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

async function handleDeleteSong() {
  document.getElementById("saveDropdown").classList.remove("show");

  if (!currentFirebaseId) {
    await showAlert("Cannot Delete", "This song has not been saved yet.");
    return;
  }

  const ok = await showConfirm(
    "Delete Song?",
    "Are you sure you want to permanently delete this song?"
  );

  if (!ok) return;

  await db.collection("lyrics").doc(currentFirebaseId).delete();

  await showAlert("Deleted", "Song deleted successfully.");
  window.location.href = "lyricsviewer.html";
}

function toggleBackMenu() {
  document.getElementById("backDropdown").classList.toggle("show");
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

/*******************************************************************/
/*********************** KARAOKE LYRICS LIST ***********************/
/*******************************************************************/
let karaokeLyricsList = [];

function cleanKaraokeUrl(url) {
  return String(url || "")
    .replace(/^lyrics\/song\.html\?id=/i, "")
    .replace(/^\.?\/?lyrics\/song\.html\?id=/i, "")
    .trim();
}

function loadKaraokeLyricsList() {
  karaokeLyricsList = (window.songs || [])
    .filter(song => song && song.url && song.hasLyrics === true)
    .map(song => ({
      ...song,
      karaokeId: cleanKaraokeUrl(song.url)
    }));

  console.log("karaokeLyricsList:", karaokeLyricsList);
}

async function handleKaraokeLyricsChange() {
  const dropdown = document.getElementById("karaokeLyrics");

  if (dropdown.value !== "__add__") {
    updateMeta();
    return;
  }

  if (!karaokeLyricsList.length) {
    await loadKaraokeLyricsList();
  }

  const picker = document.getElementById("karaokePickerSelect");
  picker.innerHTML = "";

  karaokeLyricsList.forEach(song => {
    const opt = document.createElement("option");
    opt.value = cleanKaraokeUrl(song.url);
    opt.textContent = song.title || song.name || cleanKaraokeUrl(song.url);
    picker.appendChild(opt);
  });

  document.getElementById("karaokePickerModal").classList.remove("hidden");
}

function confirmKaraokeLyricsChoice() {
  const picker = document.getElementById("karaokePickerSelect");
  const selectedId = picker.value;
  const selectedText = picker.options[picker.selectedIndex].textContent;

  const dropdown = document.getElementById("karaokeLyrics");

  let existing = [...dropdown.options].find(opt => opt.value === selectedId);

  if (!existing) {
    const opt = document.createElement("option");
    opt.value = selectedId;
    opt.textContent = selectedText;

    const addOption = [...dropdown.options].find(opt => opt.value === "__add...__");
    dropdown.insertBefore(opt, addOption);
  }

  dropdown.value = selectedId;
  closeKaraokePicker();
  updateMeta();
}

function closeKaraokePicker() {
  const dropdown = document.getElementById("karaokeLyrics");
  if (dropdown.value === "__add...__") dropdown.value = "No";

  document.getElementById("karaokePickerModal").classList.add("hidden");
}
/*******************************************************************/
/******************** END OF KARAOKE LYRICS LIST *******************/
/*******************************************************************/



