const LyricsCommon = (() => {
  const NOTE_TO_INDEX = {
    C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
    E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7,
    "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11
  };
  const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const CHORD_TOKEN = /^([A-G](?:#|b)?)(.*)$/;

  function escapeHTML(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizeSong(raw, id) {
    const song = raw || {};
    return {
      ...song,
      firebaseId: id || song.firebaseId || song.id || "",
      title: song.title || "Untitled",
      artist: song.artist || "Unknown Artist",
      userBpm: song.userBpm || "",
      originalBpm: song.originalBpm || "",
      key: song.key || "",
      capo: song.capo || "",
      year: song.year || "",
      note: song.note || song.hostNote || "",
      timeSignature: song.timeSignature || "4/4",
      sections: Array.isArray(song.sections) ? song.sections : [],
      publicSongListVisible: song.publicSongListVisible !== false
    };
  }

  function semitoneMod(value) {
    return ((Number(value) % 12) + 12) % 12;
  }

  function transposeRoot(root, amount, preferFlats = false) {
    const index = NOTE_TO_INDEX[root];
    if (index === undefined) return root;
    return (preferFlats ? FLAT_NOTES : SHARP_NOTES)[semitoneMod(index + amount)];
  }

  function transposeChordToken(token, amount) {
    if (!amount) return token;
    const slashParts = token.split("/");
    return slashParts.map((part, i) => {
      const match = part.match(CHORD_TOKEN);
      if (!match) return part;
      const root = match[1];
      const suffix = match[2] || "";
      const preferFlats = root.includes("b");
      return transposeRoot(root, amount, preferFlats) + suffix;
    }).join("/");
  }

  function transposeChordText(text, amount) {
    if (!amount) return text;
    return String(text).replace(/(^|[\s|(])([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?)(?=$|[\s),|])/g,
      (full, lead, chord) => lead + transposeChordToken(chord, amount));
  }

  function transposeChordHTML(html, amount) {
    const root = document.createElement("div");
    root.innerHTML = html || "";
    const skipSelector = ".tab-block,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,script,style";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest(skipSelector)) return;
      node.nodeValue = transposeChordText(node.nodeValue, amount);
    });
    return root.innerHTML;
  }

  function transposeTabHTML(html, amount) {
    const root = document.createElement("div");
    root.innerHTML = html || "";
    const tabRoots = root.querySelectorAll(".tab-block,.viewer-tab,.tab-dashes");
    tabRoots.forEach(tabRoot => {
      const walker = document.createTreeWalker(tabRoot, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        if (node.parentElement?.closest(".tab-repeat-number,.tab-note,.note-cell,.performance-note-line")) return;
        node.nodeValue = node.nodeValue.replace(/\d+/g, number => String(Math.max(0, Number(number) + Number(amount || 0))));
      });
    });
    return root.innerHTML;
  }

  function stripEditorControls(html) {
    const root = document.createElement("div");
    root.innerHTML = html || "";
    root.querySelectorAll(".tab-block-controls,.tab-insert-row,.delete-tab-line-btn,.delete-tab-btn,.delete-tab-btn-bottom,.move-tab-up-btn,.move-tab-down-btn,.duplicate-tab-btn,button[contenteditable='false']").forEach(el => el.remove());
    return root.innerHTML;
  }

  function isChordOnlyLine(text) {
    const line = String(text || "").trim();
    if (!line || line.length > 90) return false;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 14) return false;
    return tokens.every(token => /^([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|[|:()x0-9.-]+)$/.test(token));
  }

  function singerHTMLFromSection(section) {
    if (!section || section.type === "separator" || section.type === "tab") return "";
    if (section.type === "performanceNote" || section.type === "performance-note") {
      return `<div class="performance-cue">${escapeHTML(section.text || section.title || section.html || "")}</div>`;
    }
    const root = document.createElement("div");
    root.innerHTML = stripEditorControls(section.html || "");
    root.querySelectorAll(".tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.host-only,.host-note,.my-note,.chord-diagram,.chords-legend").forEach(el => el.remove());
    root.querySelectorAll(".performance-note-line").forEach(el => el.classList.add("performance-cue"));

    const blocks = [...root.querySelectorAll("div,p,pre")];
    blocks.forEach(block => {
      if (block.querySelector(".performance-cue")) return;
      const lines = block.innerText.split(/\n/);
      if (lines.length && lines.every(isChordOnlyLine)) block.remove();
    });

    const html = root.innerHTML.trim();
    return html ? html : "";
  }

  function getPerformanceNotes(song) {
    const notes = [];
    (song.sections || []).forEach(section => {
      if (section.type === "performanceNote" || section.type === "performance-note") {
        notes.push(section.text || section.title || section.html || "Performance cue");
      }
      const root = document.createElement("div");
      root.innerHTML = section.html || "";
      root.querySelectorAll(".performance-note-line,.performance-cue").forEach(el => {
        const text = el.innerText.trim();
        if (text) notes.push(text);
      });
    });
    return [...new Set(notes)];
  }

  function hasTabs(song) {
    return (song.sections || []).some(section => section.type === "tab" || /tab-block/.test(section.html || ""));
  }

  function hasLyrics(song) {
    return (song.sections || []).some(section => section.type !== "tab" && section.type !== "separator" && String(section.html || section.text || "").trim());
  }

  return { escapeHTML, toDate, normalizeSong, transposeRoot, transposeChordText, transposeChordHTML, transposeTabHTML, stripEditorControls, singerHTMLFromSection, getPerformanceNotes, hasTabs, hasLyrics };
})();
