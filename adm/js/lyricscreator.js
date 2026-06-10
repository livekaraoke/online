let selectedColor = "white";
let selectedSectionColor = "white";

let songData = {
  id: "",
  title: "",
  artist: "",
  userBpm: "",
  originalBpm: "",
  capo: "",
  key: "",
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

  const html = (e.clipboardData || window.clipboardData).getData("text/html");
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");

  if (!html) {
    document.execCommand("insertText", false, text);
    return;
  }

  const cleaned = cleanWordPaste(html);

  document.execCommand("insertHTML", false, cleaned);
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

  songData.userBpm = document.getElementById("userBpm").value;
  songData.originalBpm = document.getElementById("originalBpm").value;
  songData.capo = document.getElementById("capoNote").value;
  songData.key = document.getElementById("songKey").value;

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
}

["songTitle", "artistName", "userBpm", "originalBpm", "capoNote", "songKey"]
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

/*
function loadSectionPreset() {
  const preset = document.getElementById("sectionTitlePreset").value;
  const input = document.getElementById("sectionTitleCustom");

  if (preset) {
    input.value = preset + " ";
    input.focus();
  }
}
*/

function addSection(index = null) {
  const title = document.getElementById("sectionTitleCustom").value.toUpperCase().trim();
  const editor = document.getElementById("sectionEditor");
  const html = editor.innerHTML.trim();
  const fontFamily = document.getElementById("fontFamily").value;

  if (!html || html === "Enter chords and lyrics here...") {
    alert("Please enter lyrics/chords first.");
    return;
  }

  const section = {
    type: "section",
    title,
    html,
    style: {
      fontFamily,
      color: selectedSectionColor
    }
  };

  if (index === null) {
    songData.sections.push(section);
  } else {
    songData.sections.splice(index, 0, section);
  }

  document.getElementById("sectionTitleCustom").value = "";
  document.getElementById("sectionEditor").innerHTML = "";
  document.getElementById("liveSectionPreview").innerHTML = "";

  renderPreview();
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
  
    const div = document.createElement("div");
    div.className = "lyric-section";
  
    div.style.fontFamily = section.style.fontFamily;
    div.style.color = section.style.color;
  
    div.innerHTML = `
      ${section.title ? `<div class="lyric-section-title">${section.title}</div>` : ""}
      <div class="section-text">${section.html}</div>
  
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

function editSection(index) {
  const section = songData.sections[index];

  if (section.type === "separator") return;

  document.getElementById("sectionTitleCustom").value = section.title;
  document.getElementById("sectionEditor").innerHTML = section.html;
  document.getElementById("fontFamily").value = section.style.fontFamily;
  document.getElementById("sectionEditor").style.fontFamily = section.style.fontFamily;

  selectedSectionColor = section.style.color || "white";

  songData.sections.splice(index, 1);
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
`const ${variableName} = ${JSON.stringify(songData, null, 2)};`;

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

  const title =
    document.getElementById("sectionTitleCustom")
    .value
    .toUpperCase();

  const html =
    document.getElementById("sectionEditor")
    .innerHTML;

  const font =
    document.getElementById("fontFamily")
    .value;

  const preview =
    document.getElementById("liveSectionPreview");

  preview.innerHTML = `
    ${title ?
      `<div class="lyric-section-title">${title}</div>`
      : ""
    }

    <div
      class="section-text"
      style="
        font-family:${font};
        color:${selectedSectionColor};
      ">
      ${html}
    </div>
  `;
}

  
            
