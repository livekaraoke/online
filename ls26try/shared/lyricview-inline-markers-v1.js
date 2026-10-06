/* Inline marker presentation for host LyricView. */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const style=document.createElement('style');
  style.id='ls26InlineMarkerViewStyle';
  style.textContent=`
    .host-section-body .ls26-inline-performance-note{display:block!important;width:max-content!important;max-width:calc(100% - 28px)!important;margin:10px auto!important;padding:7px 12px!important;border:1px solid color-mix(in srgb,var(--ls26-performance-note-color,#75f2a0) 70%,transparent)!important;background:color-mix(in srgb,var(--ls26-performance-note-color,#75f2a0) 10%,transparent)!important;color:var(--ls26-performance-note-color,#75f2a0)!important;border-radius:8px!important;font-size:var(--ls26-performance-note-size,16px)!important;font-weight:950!important;line-height:1.15!important;text-align:center!important;white-space:normal!important}
    .host-section-body .ls26-inline-performance-note::before{content:'PERFORMANCE NOTE · ' attr(data-performance-note)!important}
    .host-section-body .ls26-inline-host-note{display:block!important;width:max-content!important;max-width:calc(100% - 28px)!important;margin:10px auto!important;padding:7px 12px!important;border:1px solid rgba(102,199,255,.65)!important;background:rgba(102,199,255,.10)!important;color:#9bdcff!important;border-radius:8px!important;font-size:16px!important;font-weight:950!important;line-height:1.15!important;text-align:center!important;white-space:normal!important}
    .host-section-body .ls26-inline-host-note::before{content:'HOST NOTE · ' attr(data-host-note)!important}
    .host-section-body .ls26-time-signature-change{display:block!important;width:max-content!important;max-width:calc(100% - 28px)!important;margin:10px auto!important;text-align:center!important;font-size:14px!important}
  `;
  (document.head||document.documentElement).append(style);

  function validColour(value){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toUpperCase():'#75F2A0';}
  function apply(root=document){
    const nodes=[];
    if(root?.matches?.('.ls26-inline-performance-note'))nodes.push(root);
    root?.querySelectorAll?.('.ls26-inline-performance-note').forEach(node=>nodes.push(node));
    for(const node of nodes){
      const size=Math.max(10,Math.min(40,Number(node.dataset.performanceNoteSize)||16));
      const colour=validColour(node.dataset.performanceNoteColor);
      node.style.setProperty('--ls26-performance-note-size',size+'px');
      node.style.setProperty('--ls26-performance-note-color',colour);
    }
  }

  const start=()=>{
    apply(document);
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)apply(node);}))).observe(document.body,{subtree:true,childList:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();