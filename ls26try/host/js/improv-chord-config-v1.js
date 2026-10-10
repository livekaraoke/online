/* LyricsCreator IMPROV chord-loop configuration. Persists on the inline card
 * itself so LyricView can loop the progression locally while the song timeline
 * remains held by the existing Chord Follow engine. */
(() => {
  'use strict';
  if (!/\/lyricscreator\.html$/i.test(String(location.pathname || ''))) return;
  if (window.LS26ImprovChordConfig) return;

  let savedRange = null, savedEditor = null, busy = false;
  const editorFromNode = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('.creator-rich-editor[data-html]') || null;
  const dialogs = () => window.LS26Dialogs;

  function rememberSelection() {
    const selection = window.getSelection?.(); if (!selection?.rangeCount) return;
    const editor = editorFromNode(selection.anchorNode); if (!editor) return;
    try { savedRange = selection.getRangeAt(0).cloneRange(); savedEditor = editor; } catch (_) {}
  }
  document.addEventListener('selectionchange', rememberSelection);
  document.addEventListener('keyup', rememberSelection, true);
  document.addEventListener('input', event => { if (editorFromNode(event.target)) rememberSelection(); }, true);

  function rangeFor(editor) {
    const selection = window.getSelection?.();
    if (selection?.rangeCount) { const live = selection.getRangeAt(0); if (editor.contains(live.commonAncestorContainer)) return live.cloneRange(); }
    if (savedRange && savedEditor === editor && editor.contains(savedRange.commonAncestorContainer)) return savedRange.cloneRange();
    return null;
  }

  function parseChords(value) {
    const raw = String(value || '').trim().split(/[\s,|]+/).map(item => item.trim()).filter(Boolean);
    if (!raw.length || raw.length > 12) return null;
    for (const chord of raw) {
      const core = chord.replace(/^[(\[]|[)\]]$/g, '');
      if (window.LS26Chords?.isChordToken && !window.LS26Chords.isChordToken(core) && !window.LS26Chords.isChordToken(chord)) return null;
    }
    return raw;
  }

  function suggestedDurations(count) {
    if (count === 1) return [4];
    if (count === 2) return [2, 2];
    if (count === 3) return [2, 2, 4];
    return Array.from({length:count}, () => 1);
  }

  function parseDurations(value, count) {
    const rows = String(value || '').trim().split(/[\s,|]+/).filter(Boolean).map(Number);
    if (rows.length !== count || rows.some(value => !Number.isFinite(value) || value < .5 || value > 32 || Math.abs(value * 2 - Math.round(value * 2)) > 1e-7)) return null;
    if (rows.reduce((sum, value) => sum + value, 0) > 64) return null;
    return rows;
  }

  function dispatchInput(editor) {
    editor.classList.remove('is-empty');
    try { editor.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertHTML', data:null })); }
    catch (_) { editor.dispatchEvent(new Event('input', { bubbles:true })); }
  }

  function configureNode(node, chords, durations) {
    node.dataset.improvLink = '1'; node.dataset.ls26Nonmusical = '1'; node.dataset.improvVersion = '2';
    node.dataset.improvChords = JSON.stringify(chords); node.dataset.improvDurations = JSON.stringify(durations);
    node.dataset.improvLoopBeats = String(durations.reduce((sum, value) => sum + value, 0));
    node.setAttribute('contenteditable', 'false'); node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Improvisation hold. Loops ${chords.join(', ')}. Tap during performance to continue.`);
    node.textContent = `IMPROV · ${chords.join(' · ')}`;
  }

  async function askConfiguration(existing = null) {
    const d = dialogs(); if (!d?.prompt) return null;
    let currentChords = [];
    try { currentChords = JSON.parse(existing?.dataset?.improvChords || '[]'); } catch (_) {}
    const chordText = await d.prompt('Chords to loop during IMPROV. Example: D C G', currentChords.join(' '));
    if (chordText == null) return null;
    const chords = parseChords(chordText);
    if (!chords) { await d.alert('Enter 1–12 valid chords separated by spaces or commas.'); return askConfiguration(existing); }
    let currentDurations = [];
    try { currentDurations = JSON.parse(existing?.dataset?.improvDurations || '[]'); } catch (_) {}
    if (currentDurations.length !== chords.length) currentDurations = suggestedDurations(chords.length);
    const durationText = await d.prompt('Quarter-note beats for each chord, in the same order. Half-beats are allowed. Example: 2 2 4', currentDurations.join(' '));
    if (durationText == null) return null;
    const durations = parseDurations(durationText, chords.length);
    if (!durations) { await d.alert(`Enter exactly ${chords.length} duration values from 0.5–32 beats, in 0.5-beat steps.`); return askConfiguration(existing); }
    return { chords, durations };
  }

  async function insertConfigured(editor) {
    if (busy) return; const range = rangeFor(editor);
    if (!range) { await dialogs()?.alert?.('Place the typing cursor in this section first, then press IMPROV HOLD.'); return; }
    busy = true;
    try {
      const config = await askConfiguration(); if (!config) return;
      const link = document.createElement('a'); link.className = 'lyrics-song-link lyrics-improv-link'; link.href = '#';
      configureNode(link, config.chords, config.durations);
      range.deleteContents(); range.insertNode(link);
      const after = document.createTextNode('\u200b'); link.parentNode.insertBefore(after, link.nextSibling);
      const selection = window.getSelection?.();
      if (selection) { const next = document.createRange(); next.setStartAfter(after); next.collapse(true); selection.removeAllRanges(); selection.addRange(next); savedRange = next.cloneRange(); savedEditor = editor; }
      dispatchInput(editor); editor.focus({preventScroll:true}); window.LS26?.toast?.('IMPROV chord loop inserted');
    } finally { busy = false; }
  }

  async function editConfigured(link) {
    if (busy) return; const editor = editorFromNode(link); if (!editor) return;
    busy = true;
    try { const config = await askConfiguration(link); if (!config) return; configureNode(link, config.chords, config.durations); dispatchInput(editor); window.LS26?.toast?.('IMPROV chord loop updated'); }
    finally { busy = false; }
  }

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('.section-improv-link-btn'); if (!button) return;
    rememberSelection(); event.preventDefault();
  }, true);

  document.addEventListener('click', event => {
    const existing = event.target.closest?.('.creator-rich-editor a.lyrics-improv-link[data-improv-link]');
    if (existing) { event.preventDefault(); event.stopImmediatePropagation(); void editConfigured(existing); return; }
    const button = event.target.closest?.('.section-improv-link-btn'); if (!button) return;
    const strip = button.closest('.section-visibility-strip[data-visibility-strip]');
    const index = strip?.dataset.visibilityStrip;
    const editor = index == null ? null : [...document.querySelectorAll('.creator-rich-editor[data-html]')].find(node => String(node.dataset.html) === String(index));
    event.preventDefault(); event.stopImmediatePropagation();
    if (editor) void insertConfigured(editor); else void dialogs()?.alert?.('Could not find this section editor.');
  }, true);

  window.LS26ImprovChordConfig = Object.freeze({ parseChords, parseDurations, suggestedDurations });
})();
