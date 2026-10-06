/* Apply per-note size/colour metadata in host LyricView. */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const PERF_DEFAULT = '#75F2A0';
  const HOST_DEFAULT = '#9BDCFF';
  const validColour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
  const noteSize = value => Math.max(10, Math.min(40, Math.round(Number(value) || 18)));

  const style = document.createElement('style');
  style.id = 'ls26LyricViewNoteStylesV1';
  style.textContent = `
    .host-section-body .ls26-inline-performance-note{
      border-color:color-mix(in srgb,var(--ls26-performance-note-color,${PERF_DEFAULT}) 70%,transparent)!important;
      background:color-mix(in srgb,var(--ls26-performance-note-color,${PERF_DEFAULT}) 10%,transparent)!important;
      color:var(--ls26-performance-note-color,${PERF_DEFAULT})!important;
      font-size:var(--ls26-performance-note-size,18px)!important;
    }
    .host-section-body .ls26-inline-host-note{
      border-color:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 70%,transparent)!important;
      background:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 10%,transparent)!important;
      color:var(--ls26-host-note-color,${HOST_DEFAULT})!important;
      font-size:var(--ls26-host-note-size,18px)!important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function apply(root=document) {
    const perf = [];
    const host = [];
    if (root?.matches?.('.ls26-inline-performance-note')) perf.push(root);
    if (root?.matches?.('.ls26-inline-host-note')) host.push(root);
    root?.querySelectorAll?.('.ls26-inline-performance-note').forEach(node => perf.push(node));
    root?.querySelectorAll?.('.ls26-inline-host-note').forEach(node => host.push(node));

    perf.forEach(node => {
      const size = noteSize(node.dataset.performanceNoteSize || 18);
      const colour = validColour(node.dataset.performanceNoteColor, PERF_DEFAULT);
      node.style.setProperty('--ls26-performance-note-size', `${size}px`);
      node.style.setProperty('--ls26-performance-note-color', colour);
    });

    host.forEach(node => {
      const size = noteSize(node.dataset.hostNoteSize || 18);
      const colour = validColour(node.dataset.hostNoteColor, HOST_DEFAULT);
      node.style.setProperty('--ls26-host-note-size', `${size}px`);
      node.style.setProperty('--ls26-host-note-color', colour);
    });
  }

  const start = () => {
    apply(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) apply(node);
    }))).observe(document.body, { subtree:true, childList:true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
