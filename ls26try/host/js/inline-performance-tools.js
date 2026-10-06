/* LiveSuite inline section metadata tools.
 * LyricsCreator: inserts zero-text metadata markers at the live caret so chord
 * source/timing anchors remain unchanged.
 * Singer view: makes inline Performance Notes singer-visible even when their
 * parent section is hidden from the singer screen.
 */
(() => {
  'use strict';
  const path=String(location.pathname||'');

  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function installCreatorTools(){
    if(!/\/lyricscreator\.html$/i.test(path))return;
    if(document.getElementById('ls26InlineSectionToolsStyle'))return;

    const style=document.createElement('style');
    style.id='ls26InlineSectionToolsStyle';
    style.textContent=`
      .creator-page .section-time-signature-btn,.creator-page .section-performance-note-inline-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-height:32px!important;padding:5px 9px!important;border-radius:7px!important;font-size:10px!important;font-weight:900!important;line-height:1!important;white-space:nowrap!important}
      .creator-page .section-time-signature-btn{border:1px solid rgba(255,178,64,.58)!important;background:rgba(255,178,64,.08)!important;color:#ffc86a!important}
      .creator-page .section-performance-note-inline-btn{border:1px solid rgba(65,227,122,.52)!important;background:rgba(65,227,122,.08)!important;color:#75f2a0!important}
      .creator-page .section-time-signature-btn:hover{border-color:#ffb240!important;background:rgba(255,178,64,.14)!important}
      .creator-page .section-performance-note-inline-btn:hover{border-color:#41e37a!important;background:rgba(65,227,122,.14)!important}
      .creator-page .creator-rich-editor .ls26-time-signature-change,.creator-page .creator-rich-editor .ls26-inline-performance-note{display:block!important;width:max-content!important;max-width:calc(100% - 24px)!important;vertical-align:middle!important;margin:10px auto!important;border-radius:7px!important;font-weight:950!important;line-height:1.15!important;white-space:normal!important;text-align:center!important;user-select:none!important}
      .creator-page .creator-rich-editor .ls26-time-signature-change{padding:6px 10px!important;border:1px solid rgba(255,178,64,.65)!important;background:rgba(255,178,64,.10)!important;color:#ffc86a!important;font-size:13px!important}
      .creator-page .creator-rich-editor .ls26-time-signature-change::before{content:'TIME ' attr(data-time-signature)!important}
      .creator-page .creator-rich-editor .ls26-inline-performance-note{padding:7px 12px!important;border:1px solid rgba(65,227,122,.58)!important;background:rgba(65,227,122,.10)!important;color:#75f2a0!important;font-size:16px!important}
      .creator-page .creator-rich-editor .ls26-inline-performance-note::before{content:'PERFORMANCE NOTE · ' attr(data-performance-note)!important}
    `;
    (document.head||document.documentElement).append(style);

    let savedRange=null,savedEditor=null;
    function editorFromNode(node){const el=node?.nodeType===1?node:node?.parentElement;return el?.closest?.('.creator-rich-editor[data-html]')||null;}
    function rememberSelection(){
      const selection=window.getSelection?.();if(!selection?.rangeCount)return;
      const editor=editorFromNode(selection.anchorNode);if(!editor)return;
      try{savedRange=selection.getRangeAt(0).cloneRange();savedEditor=editor;}catch(_){}
    }
    document.addEventListener('selectionchange',rememberSelection);
    document.addEventListener('keyup',rememberSelection,true);
    document.addEventListener('input',event=>{if(editorFromNode(event.target))rememberSelection();},true);

    function rangeFor(editor){
      const selection=window.getSelection?.();
      if(selection?.rangeCount){const live=selection.getRangeAt(0);if(editor.contains(live.commonAncestorContainer))return live.cloneRange();}
      if(savedRange&&savedEditor===editor&&editor.contains(savedRange.commonAncestorContainer))return savedRange.cloneRange();
      return null;
    }
    function restoreCaretAfter(node,editor){
      const after=document.createTextNode('\u200b');node.parentNode.insertBefore(after,node.nextSibling);
      const selection=window.getSelection?.();
      if(selection){const next=document.createRange();next.setStartAfter(after);next.collapse(true);selection.removeAllRanges();selection.addRange(next);savedRange=next.cloneRange();savedEditor=editor;}
    }
    function restoreViewport(scrollTop){
      const top=Math.max(0,Number(scrollTop)||0);
      const restore=()=>{try{window.scrollTo(0,top);}catch(_){}};
      restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
    }
    function commitInsertion(editor,node,label){
      const range=rangeFor(editor);if(!range){window.LS26Dialogs?.alert?.('Place the typing cursor in this section first, then press '+label+'.');return false;}
      range.deleteContents();range.insertNode(node);restoreCaretAfter(node,editor);editor.classList.remove('is-empty');
      try{editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertHTML',data:null}));}catch(_){editor.dispatchEvent(new Event('input',{bubbles:true}));}
      editor.focus({preventScroll:true});return true;
    }
    function marker(className){const span=document.createElement('span');span.className=className;span.setAttribute('contenteditable','false');span.dataset.ls26Nonmusical='1';return span;}

    async function insertTimeSignature(editor){
      const scrollTop=window.scrollY;
      const current=(document.getElementById('timeSignatureInput')?.value||'4/4').trim();
      const promptPromise=window.LS26Dialogs?.prompt?.('Time signature from this point (for example 3/4, 6/8 or 7/8)',current);
      requestAnimationFrame(()=>restoreViewport(scrollTop));
      const raw=await promptPromise;restoreViewport(scrollTop);
      if(raw==null)return;
      const match=String(raw).trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);
      const beats=match?Number(match[1]):0;
      if(!match||beats<1||beats>32){await window.LS26Dialogs?.alert?.('Use a time signature such as 3/4, 4/4, 6/8 or 7/8. The top number can be 1–32.');restoreViewport(scrollTop);return;}
      const signature=beats+'/'+match[2],span=marker('ls26-time-signature-change');
      span.dataset.timeSignature=signature;span.setAttribute('aria-label','Time signature changes to '+signature+' from here');span.title='Time signature changes to '+signature+' from here';
      if(commitInsertion(editor,span,'TIME SIGNATURE'))window.LS26?.toast?.('Time signature change inserted: '+signature);
      restoreViewport(scrollTop);
    }
    async function insertPerformanceNote(editor){
      const scrollTop=window.scrollY;
      const promptPromise=window.LS26Dialogs?.prompt?.('Performance note for this point in the section (always visible on the singer screen)');
      requestAnimationFrame(()=>restoreViewport(scrollTop));
      const raw=await promptPromise;restoreViewport(scrollTop);
      if(raw==null||!String(raw).trim())return;
      const text=String(raw).trim(),span=marker('ls26-inline-performance-note');
      span.dataset.performanceNote=text;span.setAttribute('aria-label','Performance note: '+text);span.title='Performance note: '+text;
      if(commitInsertion(editor,span,'PERFORMANCE NOTE'))window.LS26?.toast?.('Performance note inserted');
      restoreViewport(scrollTop);
    }

    function makeButton(className,label,title,handler){
      const button=document.createElement('button');button.type='button';button.className=className;button.innerHTML=label;button.title=title;
      button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('mousedown',event=>event.preventDefault());button.onclick=handler;return button;
    }
    function addButtons(strip){
      if(!strip||strip.dataset.ls26InlineTools==='1')return;
      const index=strip.dataset.visibilityStrip;if(index==null)return;
      const editor=document.querySelector(`.creator-rich-editor[data-html="${CSS.escape(String(index))}"]`);if(!editor)return;
      strip.dataset.ls26InlineTools='1';
      const time=makeButton('section-time-signature-btn','<span aria-hidden="true">⏱</span><span>TIME SIG</span>','Insert a time-signature change at the current typing cursor',()=>insertTimeSignature(editor));
      const perf=makeButton('section-performance-note-inline-btn','<span aria-hidden="true">★</span><span>PERF NOTE</span>','Insert a singer-visible performance note at the current typing cursor',()=>insertPerformanceNote(editor));
      const improv=strip.querySelector('.section-improv-link-btn'),copy=strip.querySelector('.section-copy-btn');
      const before=improv||copy||null;strip.insertBefore(time,before);strip.insertBefore(perf,before);
    }
    function scan(root=document){if(root?.matches?.('.section-visibility-strip[data-visibility-strip]'))addButtons(root);root?.querySelectorAll?.('.section-visibility-strip[data-visibility-strip]').forEach(addButtons);}
    const start=()=>{scan(document);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}))).observe(document.body,{subtree:true,childList:true});};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  }

  function installSingerPerformanceNotes(){
    if(!/\/karaoke-lyric-view\.html$/i.test(path)||!window.LyricsCommon)return;
    if(window.LyricsCommon.__ls26InlinePerformancePatched)return;
    const common=window.LyricsCommon,baseVisible=common.sectionVisibleOnSingerScreen.bind(common),baseHTML=common.singerHTMLFromSection.bind(common);
    const holderFor=section=>{const holder=document.createElement('div');holder.innerHTML=section?.html||'';return holder;};
    const noteNodes=holder=>[...holder.querySelectorAll('[data-performance-note]')].filter(node=>String(node.dataset.performanceNote||'').trim());
    function noteCue(text){return `<div class="performance-cue ls26-inline-performance-cue">${esc(text)}</div>`;}
    function hasNotes(section){return noteNodes(holderFor(section)).length>0;}
    function visible(section){return baseVisible(section)||hasNotes(section);}
    function html(section){
      const source=holderFor(section),notes=noteNodes(source);if(!notes.length)return baseHTML(section);
      if(!baseVisible(section))return notes.map(node=>noteCue(node.dataset.performanceNote)).join('');
      notes.forEach((node,index)=>{const placeholder=document.createElement('span');placeholder.dataset.ls26PerformancePlaceholder=String(index);placeholder.textContent='LS26PERFNOTE'+index+'X';node.replaceWith(placeholder);});
      const rendered=baseHTML({...section,html:source.innerHTML});
      const output=document.createElement('div');output.innerHTML=rendered;
      output.querySelectorAll('[data-ls26-performance-placeholder]').forEach(node=>{
        const index=Number(node.dataset.ls26PerformancePlaceholder),text=notes[index]?.dataset?.performanceNote||'';
        const cue=document.createElement('div');cue.className='performance-cue ls26-inline-performance-cue';cue.textContent=text;node.replaceWith(cue);
      });
      return output.innerHTML;
    }
    window.LyricsCommon={...common,sectionVisibleOnSingerScreen:visible,singerHTMLFromSection:html,__ls26InlinePerformancePatched:true};
  }

  installCreatorTools();
  installSingerPerformanceNotes();
})();
