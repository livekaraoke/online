let songData = {
  title: "",
  artist: "",
  bpm: "",
  sections: []
};

function updateMeta() {
  songData.title = document.getElementById("songTitle").value;
  songData.artist = document.getElementById("artistName").value;
  songData.bpm = document.getElementById("bpm").value;

  document.getElementById("previewTitle").innerText =
    `${songData.title || "Song Title"} - ${songData.artist || "Artist"}`;

  document.getElementById("previewBpm").innerText =
    songData.bpm ? `${songData.bpm} BPM` : "BPM";
}

document.getElementById("songTitle").addEventListener("input", updateMeta);
document.getElementById("artistName").addEventListener("input", updateMeta);
document.getElementById("bpm").addEventListener("input", updateMeta);

function addSection(index = null) {
  const title = document.getElementById("sectionTitle").value;
  const text = document.getElementById("sectionText").value;
  const fontFamily = document.getElementById("fontFamily").value;
  const color = document.getElementById("textColor").value;
  const bold = document.getElementById("boldText").checked;

  if (!text.trim()) {
    alert("Please enter lyrics/chords first.");
    return;
  }

  const section = {
    title,
    text,
    style: {
      fontFamily,
      color,
      bold
    }
  };

  if (index === null) {
    songData.sections.push(section);
  } else {
    songData.sections.splice(index, 0, section);
  }

  document.getElementById("sectionTitle").value = "";
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

  document.getElementById("sectionTitle").value = section.title;
  document.getElementById("sectionText").value = section.text;
  document.getElementById("fontFamily").value = section.style.fontFamily;
  document.getElementById("textColor").value = section.style.color;
  document.getElementById("boldText").checked = section.style.bold;

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
      bold: false
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
