/* LyricsCreator inline note styling/editor enhancement.
 * Owns PERF NOTE / HOST NOTE insertion and editing so both support text, size and colour.
 */
(() => {
  'use strict';
  if (!/\/lyricscreator\.html$/i.test(String(location.pathname || ''))) return;

  const PERF_DEFAULT = '#75F2A0';
  const HOST_DEFAULT = '#9BDCFF';
  const validColour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
  const noteSize = value => Math.max(10, Math.min(40, Math.round(Number(value) || 18)));

  const style = document.createElement('style');
  style.id = 'ls26InlineNoteStyleEditorV1';
  style.textContent = `
    .creator-page .creator-rich-editor .ls26-inline-performance-note{
      border-color:color-mix(in srgb,var(--ls26-performance-note-color,${PERF_DEFAULT}) 70%,transparent)!important;
      background:color-mix(in srgb,var(--ls26-performance-note-color,${PERF_DEFAULT}) 10%,transparent)!important;
      color:var(--ls26-performance-note-color,${PERF_DEFAULT})!important;
      font-size:var(--ls26-performance-note-size,18px)!important;
    }
    .creator-page .creator-rich-editor .ls26-inline-host-note{
      border-color:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 70%,transparent)!important;
      background:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 10%,transparent)!important;
      color:var(--ls26-host-note-color,${HOST_DEFAULT})!important;
      font-size:var(--ls26-host-note-size,18px)!important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  let savedRange = null;
  let savedEditor = null;

  function editorFromNode(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el?.closest?.('.creator-rich-editor[data-html]') || null;
  }

  function rememberSelection() {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) return;
    const editor = editorFromNode(selection.anchorNode);
    if (!editor) return;
    try {
      savedRange = selection.getRangeAt(0).cloneRange();
      savedEditor = editor;
    } catch (_) {}
  }

  document.addEventListener('selectionchange', rememberSelection);
  document.addEventListener('keyup', rememberSelection, true);
  document.addEventListener('input', event => {
    if (editorFromNode(event.target)) rememberSelection();
  }, true);

  function editorForButton(button) {
    const strip = button?.closest?.('.section-visibility-strip[data-visibility-strip]');
    const index = strip?.dataset?.visibilityStrip;
    if (index == null) return null;
    return document.querySelector(`.creator-rich-editor[data-html="${CSS.escape(String(index))}"]`);
  }

  function rangeFor(editor) {
    const selection = window.getSelection?.();
    if (selection?.rangeCount) {
      const live = selection.getRangeAt(0);
      if (editor.contains(live.commonAncestorContainer)) return live.cloneRange();
    }
    if (savedRange && savedEditor === editor && editor.contains(savedRange.commonAncestorContainer)) return savedRange.cloneRange();
    return null;
  }

  function dispatchEdit(editor) {
    try {
      editor.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertHTML', data:null }));
    } catch (_) {
      editor.dispatchEvent(new Event('input', { bubbles:true }));
    }
  }

  function restoreViewport(scrollTop) {
    const top = Math.max(0, Number(scrollTop) || 0);
    const restore = () => { try { window.scrollTo(0, top); } catch (_) {} };
    restore();
    requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
  }

  async function ask(text, initial='') {
    return window.LS26Dialogs?.prompt?.(text, initial);
  }

  async function readNoteValues(kind, node) {
    const isHost = kind === 'host';
    const textKey = isHost ? 'hostNote' : 'performanceNote';
    const sizeKey = isHost ? 'hostNoteSize' : 'performanceNoteSize';
    const colourKey = isHost ? 'hostNoteColor' : 'performanceNoteColor';
    const fallback = isHost ? HOST_DEFAULT : PERF_DEFAULT;
    const label = isHost ? 'Host note' : 'Performance note';
    const scrollTop = window.scrollY;

    const text = await ask(`${label} text`, node?.dataset?.[textKey] || '');
    restoreViewport(scrollTop);
    if (text == null || !String(text).trim()) return null;

    const sizeRaw = await ask(`${label} size in px (10–40)`, String(noteSize(node?.dataset?.[sizeKey] || 18)));
    restoreViewport(scrollTop);
    if (sizeRaw == null) return null;

    const colourRaw = await ask(`${label} colour (hex, e.g. ${fallback})`, validColour(node?.dataset?.[colourKey], fallback));
    restoreViewport(scrollTop);
    if (colourRaw == null) return null;

    return {
      text: String(text).trim(),
      size: noteSize(sizeRaw),
      colour: validColour(colourRaw, fallback),
      scrollTop
    };
  }

  function applyStyle(node, kind) {
    if (!node) return;
    if (kind === 'host') {
      const size = noteSize(node.dataset.hostNoteSize || 18);
      const colour = validColour(node.dataset.hostNoteColor, HOST_DEFAULT);
      node.dataset.hostNoteSize = String(size);
      node.dataset.hostNoteColor = colour;
      node.style.setProperty('--ls26-host-note-size', `${size}px`);
      node.style.setProperty('--ls26-host-note-color', colour);
    } else {
      const size = noteSize(node.dataset.performanceNoteSize || 18);
      const colour = validColour(node.dataset.performanceNoteColor, PERF_DEFAULT);
      node.dataset.performanceNoteSize = String(size);
      node.dataset.performanceNoteColor = colour;
      node.style.setProperty('--ls26-performance-note-size', `${size}px`);
      node.style.setProperty('--ls26-performance-note-color', colour);
    }
  }

  function createMarker(kind, values) {
    const host = kind === 'host';
    const span = document.createElement('span');
    span.className = host ? 'ls26-inline-host-note' : 'ls26-inline-performance-note';
    span.setAttribute('contenteditable', 'false');
    span.dataset.ls26Nonmusical = '1';
    if (host) {
      span.dataset.hostNote = values.text;
      span.dataset.hostNoteSize = String(values.size);
      span.dataset.hostNoteColor = values.colour;
      span.setAttribute('aria-label', `Host note: ${values.text}`);
      span.title = 'Tap to edit host note';
    } else {
      span.dataset.performanceNote = values.text;
      span.dataset.performanceNoteSize = String(values.size);
      span.dataset.performanceNoteColor = values.colour;
      span.setAttribute('aria-label', `Performance note: ${values.text}`);
      span.title = 'Tap to edit performance note';
    }
    applyStyle(span, kind);
    return span;
  }

  function insertAtRange(editor, range, node) {
    range.deleteContents();
    range.insertNode(node);
    const spacer = document.createTextNode('\u200b');
    node.parentNode.insertBefore(spacer, node.nextSibling);
    const selection = window.getSelection?.();
    if (selection) {
      const next = document.createRange();
      next.setStartAfter(spacer);
      next.collapse(true);
      selection.removeAllRanges();
      selection.addRange(next);
      savedRange = next.cloneRange();
      savedEditor = editor;
    }
    editor.classList.remove('is-empty');
    dispatchEdit(editor);
    editor.focus({ preventScroll:true });
  }

  async function insertNote(button, kind) {
    const editor = editorForButton(button);
    if (!editor) return;
    const range = rangeFor(editor);
    if (!range) {
      await window.LS26Dialogs?.alert?.('Place the typing cursor in this section first.');
      return;
    }
    const values = await readNoteValues(kind, null);
    if (!values) return;
    insertAtRange(editor, range, createMarker(kind, values));
    restoreViewport(values.scrollTop);
    window.LS26?.toast?.(kind === 'host' ? 'Host note inserted' : 'Performance note inserted');
  }

  async function editNote(node, kind) {
    const editor = editorFromNode(node);
    if (!editor) return;
    const values = await readNoteValues(kind, node);
    if (!values) return;
    if (kind === 'host') {
      node.dataset.hostNote = values.text;
      node.dataset.hostNoteSize = String(values.size);
      node.dataset.hostNoteColor = values.colour;
      node.setAttribute('aria-label', `Host note: ${values.text}`);
    } else {
      node.dataset.performanceNote = values.text;
      node.dataset.performanceNoteSize = String(values.size);
      node.dataset.performanceNoteColor = values.colour;
      node.setAttribute('aria-label', `Performance note: ${values.text}`);
    }
    applyStyle(node, kind);
    dispatchEdit(editor);
    restoreViewport(values.scrollTop);
  }

  function applyExisting(root=document) {
    if (root?.matches?.('.ls26-inline-performance-note')) applyStyle(root, 'performance');
    if (root?.matches?.('.ls26-inline-host-note')) applyStyle(root, 'host');
    root?.querySelectorAll?.('.ls26-inline-performance-note').forEach(node => applyStyle(node, 'performance'));
    root?.querySelectorAll?.('.ls26-inline-host-note').forEach(node => applyStyle(node, 'host'));
  }

  document.addEventListener('click', event => {
    const perfButton = event.target.closest?.('.section-performance-note-inline-btn');
    if (perfButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      insertNote(perfButton, 'performance');
      return;
    }
    const hostButton = event.target.closest?.('.section-host-note-inline-btn');
    if (hostButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      insertNote(hostButton, 'host');
      return;
    }
    const perf = event.target.closest?.('.creator-rich-editor .ls26-inline-performance-note');
    if (perf) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editNote(perf, 'performance');
      return;
    }
    const host = event.target.closest?.('.creator-rich-editor .ls26-inline-host-note');
    if (host) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editNote(host, 'host');
    }
  }, true);

  const start = () => {
    applyExisting(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) applyExisting(node);
    }))).observe(document.body, { subtree:true, childList:true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
