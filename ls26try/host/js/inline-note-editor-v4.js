/* LiveSuite LyricsCreator inline Performance/Host Note editor v4.
 * Uses one purpose-built modal so note text, size and colour are edited in a
 * single transaction without stacking LS26Dialogs overlays.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricscreator\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26InlineNoteEditorV4) return;
  window.__ls26InlineNoteEditorV4 = true;

  const PERF_DEFAULT = '#75F2A0';
  const HOST_DEFAULT = '#9BDCFF';
  const validColour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
  const clampSize = value => Math.max(10, Math.min(40, Math.round(Number(value) || 18)));

  const style=document.createElement('style');
  style.id='ls26InlineNoteEditorV4Style';
  style.textContent=`
    .creator-page .creator-rich-editor .ls26-inline-host-note{
      border-color:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 70%,transparent)!important;
      background:color-mix(in srgb,var(--ls26-host-note-color,${HOST_DEFAULT}) 10%,transparent)!important;
      color:var(--ls26-host-note-color,${HOST_DEFAULT})!important;
      font-size:var(--ls26-host-note-size,18px)!important;
    }
    .creator-page dialog.ls26-dialog{position:fixed!important}
    .ls26-inline-note-modal[hidden]{display:none!important}
    .ls26-inline-note-modal{position:fixed;inset:0;z-index:250000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,5,9,.72);backdrop-filter:blur(3px)}
    .ls26-inline-note-box{width:min(620px,calc(100vw - 30px));max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow:auto;border:1px solid rgba(0,202,255,.45);border-radius:14px;background:#001923;color:#edfaff;box-shadow:0 18px 70px rgba(0,0,0,.62);padding:18px}
    .ls26-inline-note-box h3{margin:0 0 15px;color:#12d9ff;font-size:21px}
    .ls26-inline-note-field{display:block;margin:0 0 14px;font-size:12px;font-weight:900;letter-spacing:.06em;color:#9fc3cf}
    .ls26-inline-note-field textarea,.ls26-inline-note-field input[type=number],.ls26-inline-note-field input[type=text]{box-sizing:border-box;width:100%;margin-top:7px;border:1px solid #214957;border-radius:9px;background:#001119;color:#fff;padding:11px 12px;font:inherit;font-size:16px;letter-spacing:0}
    .ls26-inline-note-field textarea{min-height:105px;resize:vertical}
    .ls26-inline-note-style-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .ls26-inline-colour-wrap{display:grid;grid-template-columns:54px 1fr;gap:9px;margin-top:7px}
    .ls26-inline-colour-wrap input[type=color]{width:54px;height:46px;padding:3px;border:1px solid #214957;border-radius:9px;background:#001119}
    .ls26-inline-colour-wrap input[type=text]{margin-top:0}
    .ls26-inline-note-preview{margin:8px 0 16px;padding:12px;border-radius:9px;text-align:center;font-weight:900;border:1px solid color-mix(in srgb,var(--note-preview-colour) 65%,transparent);background:color-mix(in srgb,var(--note-preview-colour) 9%,transparent);color:var(--note-preview-colour);font-size:var(--note-preview-size)}
    .ls26-inline-note-actions{display:flex;justify-content:flex-end;gap:10px}
    .ls26-inline-note-actions button{min-height:44px;padding:9px 17px;border-radius:9px;border:1px solid #2a5260;background:#082631;color:#fff;font-weight:900}
    .ls26-inline-note-actions .save{border-color:#1bbd70;background:#06351f;color:#70f0a5}
    @media(max-width:620px){.ls26-inline-note-style-row{grid-template-columns:1fr}.ls26-inline-note-box{padding:14px}}
  `;
  (document.head||document.documentElement).appendChild(style);

  let savedRange=null;
  let savedEditor=null;
  let activeResolve=null;
  let activeType='performance';
  let previousFocus=null;

  function editorFromNode(node){
    const el=node?.nodeType===1?node:node?.parentElement;
    return el?.closest?.('.creator-rich-editor[data-html]')||null;
  }
  function rememberSelection(){
    const selection=window.getSelection?.();
    if(!selection?.rangeCount)return;
    const editor=editorFromNode(selection.anchorNode);
    if(!editor)return;
    try{savedRange=selection.getRangeAt(0).cloneRange();savedEditor=editor;}catch(_){}
  }
  document.addEventListener('selectionchange',rememberSelection);
  document.addEventListener('keyup',rememberSelection,true);
  document.addEventListener('input',event=>{if(editorFromNode(event.target))rememberSelection();},true);

  function currentRange(editor){
    const selection=window.getSelection?.();
    if(selection?.rangeCount){
      const range=selection.getRangeAt(0);
      if(editor.contains(range.commonAncestorContainer))return range.cloneRange();
    }
    if(savedRange&&savedEditor===editor&&editor.contains(savedRange.commonAncestorContainer))return savedRange.cloneRange();
    return null;
  }
  function dispatchEdit(editor){
    try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertHTML',data:null}));}
    catch(_){editor.dispatchEvent(new Event('input',{bubbles:true}));}
  }
  function markerFor(type){
    const span=document.createElement('span');
    span.className=type==='host'?'ls26-inline-host-note':'ls26-inline-performance-note';
    span.setAttribute('contenteditable','false');
    span.dataset.ls26Nonmusical='1';
    return span;
  }
  function applyMarkerStyle(marker,type,size,colour){
    if(type==='host'){
      marker.dataset.hostNoteSize=String(size);
      marker.dataset.hostNoteColor=colour;
      marker.style.setProperty('--ls26-host-note-size',`${size}px`);
      marker.style.setProperty('--ls26-host-note-color',colour);
    }else{
      marker.dataset.performanceNoteSize=String(size);
      marker.dataset.performanceNoteColor=colour;
      marker.style.setProperty('--ls26-performance-note-size',`${size}px`);
      marker.style.setProperty('--ls26-performance-note-color',colour);
    }
  }
  function applyExistingStyles(root=document){
    root.querySelectorAll?.('.ls26-inline-performance-note').forEach(node=>applyMarkerStyle(node,'performance',clampSize(node.dataset.performanceNoteSize),validColour(node.dataset.performanceNoteColor,PERF_DEFAULT)));
    root.querySelectorAll?.('.ls26-inline-host-note').forEach(node=>applyMarkerStyle(node,'host',clampSize(node.dataset.hostNoteSize),validColour(node.dataset.hostNoteColor,HOST_DEFAULT)));
  }

  const modal=document.createElement('div');
  modal.className='ls26-inline-note-modal';
  modal.hidden=true;
  modal.innerHTML=`
    <div class="ls26-inline-note-box" role="dialog" aria-modal="true" data-ls26-close="true" aria-labelledby="ls26InlineNoteTitle">
      <h3 id="ls26InlineNoteTitle">EDIT NOTE</h3>
      <label class="ls26-inline-note-field">NOTE TEXT<textarea id="ls26InlineNoteText" maxlength="1500"></textarea></label>
      <div class="ls26-inline-note-style-row">
        <label class="ls26-inline-note-field">FONT SIZE (10–40 px)<input id="ls26InlineNoteSize" type="number" min="10" max="40" step="1"></label>
        <label class="ls26-inline-note-field">COLOUR
          <div class="ls26-inline-colour-wrap"><input id="ls26InlineNoteColour" type="color"><input id="ls26InlineNoteHex" type="text" maxlength="7" placeholder="#75F2A0"></div>
        </label>
      </div>
      <div id="ls26InlineNotePreview" class="ls26-inline-note-preview">Note preview</div>
      <div class="ls26-inline-note-actions"><button id="ls26InlineNoteCancel" type="button">CANCEL</button><button id="ls26InlineNoteSave" class="save" type="button">SAVE NOTE</button></div>
    </div>`;
  document.body.appendChild(modal);

  const textInput=modal.querySelector('#ls26InlineNoteText');
  const sizeInput=modal.querySelector('#ls26InlineNoteSize');
  const colourInput=modal.querySelector('#ls26InlineNoteColour');
  const hexInput=modal.querySelector('#ls26InlineNoteHex');
  const preview=modal.querySelector('#ls26InlineNotePreview');

  function syncPreview(){
    const fallback=activeType==='host'?HOST_DEFAULT:PERF_DEFAULT;
    const c=validColour(hexInput.value||colourInput.value,fallback);
    const size=clampSize(sizeInput.value);
    if(colourInput.value.toUpperCase()!==c)colourInput.value=c;
    if(hexInput.value.toUpperCase()!==c)hexInput.value=c;
    preview.style.setProperty('--note-preview-colour',c);
    preview.style.setProperty('--note-preview-size',`${size}px`);
    preview.textContent=(activeType==='host'?'HOST NOTE · ':'PERFORMANCE NOTE · ')+(textInput.value.trim()||'Note preview');
  }
  textInput.addEventListener('input',syncPreview);
  sizeInput.addEventListener('input',syncPreview);
  colourInput.addEventListener('input',()=>{hexInput.value=colourInput.value.toUpperCase();syncPreview();});
  hexInput.addEventListener('input',()=>{if(/^#[0-9a-f]{6}$/i.test(hexInput.value))colourInput.value=hexInput.value;syncPreview();});

  function closeModal(result){
    modal.hidden=true;
    document.body.classList.remove('ls26-inline-note-modal-open');
    const resolve=activeResolve;activeResolve=null;
    previousFocus?.focus?.({preventScroll:true});
    if(resolve)resolve(result);
  }
  modal.querySelector('#ls26InlineNoteCancel').onclick=()=>closeModal(null);
  modal.addEventListener('pointerdown',event=>{if(event.target===modal)closeModal(null);});
  document.addEventListener('keydown',event=>{if(!modal.hidden&&event.key==='Escape'){event.preventDefault();closeModal(null);}},true);
  modal.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const fields=[...modal.querySelectorAll('textarea,input,button')],first=fields[0],last=fields.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  modal.querySelector('#ls26InlineNoteSave').onclick=()=>{
    const fallback=activeType==='host'?HOST_DEFAULT:PERF_DEFAULT;
    const text=textInput.value.trim();
    if(!text){textInput.focus();return;}
    closeModal({text,size:clampSize(sizeInput.value),colour:validColour(hexInput.value||colourInput.value,fallback)});
  };

  function openModal(type,initial={}){
    if(activeResolve)return Promise.resolve(null);
    previousFocus=document.activeElement;activeType=type;
    const fallback=type==='host'?HOST_DEFAULT:PERF_DEFAULT;
    modal.querySelector('#ls26InlineNoteTitle').textContent=type==='host'?'HOST NOTE':'PERFORMANCE NOTE';
    textInput.value=String(initial.text||'');
    sizeInput.value=String(clampSize(initial.size||18));
    const c=validColour(initial.colour,fallback);
    colourInput.value=c;hexInput.value=c;
    syncPreview();
    modal.hidden=false;
    document.body.classList.add('ls26-inline-note-modal-open');
    requestAnimationFrame(()=>textInput.focus({preventScroll:true}));
    return new Promise(resolve=>{activeResolve=resolve;});
  }

  async function createNote(type,editor){
    const range=currentRange(editor);
    if(!range){window.LS26Dialogs?.alert?.('Place the typing cursor in this section first, then press '+(type==='host'?'HOST NOTE':'PERF NOTE')+'.');return;}
    const result=await openModal(type,{size:18,colour:type==='host'?HOST_DEFAULT:PERF_DEFAULT});
    if(!result)return;
    const node=markerFor(type);
    if(type==='host')node.dataset.hostNote=result.text;
    else node.dataset.performanceNote=result.text;
    applyMarkerStyle(node,type,result.size,result.colour);
    node.setAttribute('aria-label',(type==='host'?'Host note: ':'Performance note: ')+result.text);
    node.title='Tap to edit '+(type==='host'?'host':'performance')+' note';
    try{
      range.deleteContents();range.insertNode(node);
      // A collapsed DOM boundary after the zero-text marker is sufficient.
      // Do not append a sentinel lyric character/line that changes timing source.
      const next=document.createRange();next.setStartAfter(node);next.collapse(true);
      const selection=window.getSelection?.();if(selection){selection.removeAllRanges();selection.addRange(next);savedRange=next.cloneRange();savedEditor=editor;}
      editor.classList.remove('is-empty');dispatchEdit(editor);editor.focus({preventScroll:true});
      window.LS26?.toast?.((type==='host'?'Host':'Performance')+' note inserted');
    }catch(error){console.error('Could not insert inline note:',error);window.LS26Dialogs?.alert?.('Could not insert the note at the current cursor. Please place the cursor again and retry.');}
  }

  async function editNote(type,marker,editor){
    const initial=type==='host'
      ?{text:marker.dataset.hostNote,size:marker.dataset.hostNoteSize,colour:marker.dataset.hostNoteColor}
      :{text:marker.dataset.performanceNote,size:marker.dataset.performanceNoteSize,colour:marker.dataset.performanceNoteColor};
    const result=await openModal(type,initial);if(!result)return;
    if(type==='host')marker.dataset.hostNote=result.text;else marker.dataset.performanceNote=result.text;
    applyMarkerStyle(marker,type,result.size,result.colour);
    marker.setAttribute('aria-label',(type==='host'?'Host note: ':'Performance note: ')+result.text);
    dispatchEdit(editor);
  }

  // One owner: toolbar buttons delegate here; markers open this same editor.
  window.LS26InlineNoteEditor=Object.freeze({createNote});
  document.addEventListener('click',event=>{
    const perf=event.target.closest?.('.creator-rich-editor .ls26-inline-performance-note');
    const host=event.target.closest?.('.creator-rich-editor .ls26-inline-host-note');
    if(perf||host){
      event.preventDefault();event.stopImmediatePropagation();
      const marker=host||perf,editor=editorFromNode(marker);
      if(editor)void editNote(host?'host':'performance',marker,editor);
    }
  },true);

  applyExistingStyles(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)applyExistingStyles(node);}))).observe(document.body,{subtree:true,childList:true});
})();
