/* Copyright © 2026 LiveSuite. All rights reserved.
 * host/js/lyrics-common.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
window.LyricsCommon = (() => {
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
      artist: ArtistNames.display(song.artist) || "Unknown Artist",
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

  function isSingerPerformanceCueLine(text) {
    const line = String(text || "").trim().replace(/\s+/g, " ");
    if (!line) return false;

    // Standalone bracket cues belong in a Performance Note section instead.
    if (/^\[[^\]\n]{1,100}\]$/.test(line)) return true;

    // Common instrumental/performance cue shapes such as:
    // "Guitar Riff x8", "Bass Solo", "Instrumental x4", "Drum Break".
    if (/^(?:(?:guitar|bass|drums?|piano|keys?|keyboard|organ|sax(?:ophone)?|vocal)\s+)?(?:solo|riff|instrumental|interlude|break)(?:\s+(?:x|×)?\d+)?(?:\s+bars?)?$/i.test(line)) return true;
    if (/^(?:intro|outro)(?:\s+(?:riff|instrumental|solo))?(?:\s+(?:x|×)?\d+)?$/i.test(line)) return true;

    return false;
  }

  function isSingerTabNotationLine(text) {
    const line = String(text || "").trim();
    if (!line || line.length < 4) return false;

    // Standard six-string tab rows such as "e|-----4---|" or "G|--3h5--|".
    if (/^[eEbBgGdDaA]\|[0-9xXhHpPbBrR\/\\~^().*+|:\-\s]+$/.test(line)) return true;

    // Continuation rows sometimes omit the string name and start at the bar.
    if (/^\|[0-9xXhHpPbBrR\/\\~^().*+|:\-\s]{5,}$/.test(line)) return true;

    return false;
  }

  function singerLineShouldBeRemoved(text) {
    return isChordOnlyLine(text) ||
      isSingerTabNotationLine(text) ||
      isSingerPerformanceCueLine(text);
  }

  function stripSingerNonLyricBreakLines(block) {
    if (!block || block.querySelector("div,p,pre,li")) return;

    if (block.tagName === "PRE") {
      const kept = String(block.textContent || "")
        .split(/\r?\n/)
        .filter(line => !singerLineShouldBeRemoved(line));
      block.textContent = kept.join("\n");
      if (!block.textContent.trim()) block.remove();
      return;
    }

    const groups = [[]];
    [...block.childNodes].forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
        groups.push([]);
      } else {
        groups[groups.length - 1].push(node);
      }
    });

    if (groups.length <= 1) {
      if (singerLineShouldBeRemoved(block.textContent)) {
        if (block.parentNode) block.remove();
        else block.replaceChildren();
      }
      return;
    }

    const keptGroups = groups.filter(nodes => {
      const text = nodes.map(node => node.textContent || "").join("").trim();
      return text && !singerLineShouldBeRemoved(text);
    });

    block.replaceChildren();
    keptGroups.forEach((nodes, index) => {
      nodes.forEach(node => block.appendChild(node));
      if (index < keptGroups.length - 1) block.appendChild(document.createElement("br"));
    });

    if (!block.textContent.trim()) block.remove();
  }

  function defaultSingerScreenVisibility(section) {
    const type = String(section?.type || "lyrics").toLowerCase();
    return !["separator","tab","hostnote","host-note"].includes(type);
  }

  function sectionVisibleOnSingerScreen(section) {
    if (
      section &&
      Object.prototype.hasOwnProperty.call(section, "visibleOnSingerScreen")
    ) {
      return section.visibleOnSingerScreen === true;
    }
    return defaultSingerScreenVisibility(section);
  }

  function singerHTMLFromSection(section) {
    if (!section || section.type === "separator") return "";

    if (section.type === "performanceNote" || section.type === "performance-note") {
      return `<div class="performance-cue">${escapeHTML(section.text || section.title || section.html || "")}</div>`;
    }

    // Host Notes and Guitar Tabs are OFF on Singer Screen by default, but if
    // the host explicitly enables SINGER SCREEN for that section, render it.
    if (section.type === "hostNote" || section.type === "host-note") {
      return `<div class="performance-cue">${escapeHTML(section.text || section.title || "")}</div>`;
    }

    if (section.type === "tab") {
      const tabRoot = document.createElement("div");
      tabRoot.innerHTML = stripEditorControls(section.html || "");
      tabRoot.querySelectorAll(".host-only,.host-note,.my-note").forEach(el => el.remove());
      return tabRoot.innerHTML.trim();
    }

    const root = document.createElement("div");
    root.innerHTML = stripEditorControls(section.html || "");

    // Ordinary singer lyric sections are lyrics-only. Chords, embedded tabs,
    // host notes and legacy inline performance cues are removed; performance
    // cues should be authored as dedicated Performance Note sections.
    root.querySelectorAll(".tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.host-only,.host-note,.my-note,.chord-diagram,.chords-legend,.inserted-chord,[data-original-chord],[data-chord],.performance-note-line,.performance-cue").forEach(el => el.remove());

    const blocks = [...root.querySelectorAll("div,p,pre,li")];
    blocks.forEach(stripSingerNonLyricBreakLines);

    // LyricsCreator commonly stores direct text + <br> nodes with no wrapper.
    // Run the same per-line filter on the section root in that case so a cue
    // line can be removed without deleting the lyrics that follow it.
    if (!root.querySelector("div,p,pre,li")) {
      stripSingerNonLyricBreakLines(root);
    }

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

  return { escapeHTML, toDate, normalizeSong, transposeRoot, transposeChordText, transposeChordHTML, transposeTabHTML, stripEditorControls, singerHTMLFromSection, sectionVisibleOnSingerScreen, getPerformanceNotes, hasTabs, hasLyrics };
})();
