let selectedColor = "white";
let currentFormats = {
  bold: false,
  italic: false,
  underline: false
};
let currentAlign = "left";

let songData = {
  title: "",
  artist: "",
  userBpm: "",
  originalBpm: "",
  capo: "",
  key: "",
  sections: []
};

function updateMeta() {
  songData.title = document.getElementById("songTitle").value;
  songData.artist = document.getElementById("artistName").value;
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
    songData.capo ? songData.capo : "";

  document.getElementById("previewKey").innerText =
    songData.key ? songData.key : "";
}

["songTitle", "artistName", "userBpm", "originalBpm", "capoNote", "songKey"]
  .forEach(id => {
    document.getElementById(id).addEventListener("input", updateMeta);
  });

function setColor(color, btn) {
  selectedColor = color;

  document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function toggleFormat(type, btn) {
  currentFormats[type] = !currentFormats[type];
  btn.classList.toggle("active", currentFormats[type]);
}

function setAlign(align, btn) {
  currentAlign = align;

  document.querySelectorAll(".align-buttons button")
    .forEach(b => b.classList.remove("active"));

  btn.classList.add("active");
}

function getSectionTitle() {
  const preset = document.getElementById("sectionTitlePreset").value;
  const custom = document.getElementById("sectionTitleCustom").value;

  return (preset || custom || "").toUpperCase();
}

function addSection(index = null) {
  const title = getSectionTitle();
  const text = document.getElementById("sectionText").value;
  const fontFamily = document.getElementById("fontFamily").value;

  if (!text.trim()) {
    alert("Please enter lyrics/chords first.");
    return;
  }

  const section = {
    title,
    text,
    style: {
      fontFamily,
      color: selectedColor,
      bold: currentFormats.bold,
      italic: currentFormats.italic,
      underline: currentFormats.underline,
      align: currentAlign
    }
  };

  if (index === null) {
    songData.sections.push(section);
  } else {
    songData.sections.splice(index, 0, section);
  }

  document.getElementById("sectionTitlePreset").value = "";
  document.getElementById("sectionTitleCustom").value = "";
  document.getElementById("sectionText").value = "";

  renderPreview();
}

function renderPreview() {
  updateMeta();

  const container = document.getElementById("sectionsPreview");
  container.innerHTML = "";

  songData.sections.forEach((section, index) => {
    const div = document.createElement("div");
    div.className = "lyric-section";

    div.style.fontFamily = section.style.fontFamily;
    div.style.color = section.style.color;
    div.style.fontWeight = section.style.bold ? "900" : "400";
    div.style.fontStyle = section.style.italic ? "italic" : "normal";
    div.style.textDecoration = section.style.underline ? "underline" : "none";
    div.style.textAlign = section.style.align || "left";

    div.innerHTML = `
      ${section.title ? `<div class="lyric-section-title">${section.title}</div>` : ""}
      <div>${escapeHTML(section.text)}</div>

      <div class="section-actions">
        <button onclick="editSection(${index})">Edit</button>
        <button onclick="insertBefore(${index})">Insert Above</button>
        <button onclick="deleteSection(${index})">Delete</button>
      </div>
    `;

    container.appendChild(div);
  });
}

function editSection(index) {
  const section = songData.sections[index];

  document.getElementById("sectionTitlePreset").value = "";
  document.getElementById("sectionTitleCustom").value = section.title;
  document.getElementById("sectionText").value = section.text;
  document.getElementById("fontFamily").value = section.style.fontFamily;

  selectedColor = section.style.color || "white";

  currentFormats.bold = !!section.style.bold;
  currentFormats.italic = !!section.style.italic;
  currentFormats.underline = !!section.style.underline;
  currentAlign = section.style.align || "left";

  document.querySelectorAll(".format-buttons button").forEach(btn => btn.classList.remove("active"));
  document.getElementById("boldBtn").classList.toggle("active", currentFormats.bold);
  document.getElementById("italicBtn").classList.toggle("active", currentFormats.italic);
  document.getElementById("underlineBtn").classList.toggle("active", currentFormats.underline);

  document.querySelectorAll(".align-buttons button").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.toLowerCase() === currentAlign[0]);
  });

  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.classList.toggle("active", btn.style.backgroundColor === selectedColor);
  });

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
