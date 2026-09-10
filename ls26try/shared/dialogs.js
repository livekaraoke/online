/* Copyright © 2026 LiveSuite. All rights reserved.
 * Promise-based app dialogs. Cancellation always resolves without approving an
 * action. Also adds a persistent close control to existing custom modals.
 * This module has no database access.
 */
(() => {
  'use strict';
  let sequence=0;
  function ask(kind,message,initial=''){
    return new Promise(resolve=>{
      const d=document.createElement('dialog');d.className='ls26-dialog';
      const title=document.createElement('h2');title.id='ls26DialogTitle'+(++sequence);title.textContent=kind==='confirm'?'Confirm action':kind==='prompt'?'Enter details':'LiveSuite';d.setAttribute('aria-labelledby',title.id);
      const text=document.createElement('p');text.textContent=String(message??'');text.className='ls26-dialog-message';
      const form=document.createElement('form');form.method='dialog';form.append(title,text);
      let input;if(kind==='prompt'){input=document.createElement('input');input.value=String(initial??'');input.setAttribute('aria-label',String(message));form.append(input);}
      const actions=document.createElement('div');actions.className='ls26-dialog-actions';
      const ok=document.createElement('button');ok.type='submit';ok.className='primary';ok.textContent=kind==='confirm'?'Confirm':kind==='prompt'?'Save':'OK';actions.append(ok);
      let result=kind==='prompt'?null:false;
      if(kind!=='alert'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>d.close();actions.append(cancel);}
      form.append(actions);d.append(form);document.body.append(d);enhance(d);
      form.onsubmit=e=>{e.preventDefault();result=kind==='prompt'?input.value:true;d.close();};
      d.addEventListener('close',()=>{d.remove();resolve(result);},{once:true});d.showModal();(input||ok).focus();
    });
  }
  window.LS26Dialogs={alert:message=>ask('alert',message),confirm:message=>ask('confirm',message),prompt:(message,initial)=>ask('prompt',message,initial)};
  const overlays='dialog,.confirm-modal,.suite-modal,.admin-modal,.creator-modal,.session-modal,.events-modal,.venues-modal,.signup-modal,.custom-dialog,[role="dialog"]';
  function enhance(modal){
    if(modal.dataset.ls26Close)return;
    const panel=modal.tagName==='DIALOG'?modal:(modal.querySelector('.suite-modal-box,.admin-modal-box,.creator-modal-box,.session-modal-box,.events-modal-card,.venues-modal-card,.signup-box,.dialog-box')||modal.firstElementChild);
    if(!panel)return;modal.dataset.ls26Close='true';
    const bar=document.createElement('div');bar.className='ls26-modal-close-bar';
    const x=document.createElement('button');x.type='button';x.className='ls26-modal-x';x.textContent='×';x.setAttribute('aria-label','Close dialog');bar.append(x);panel.prepend(bar);
    x.onclick=()=>{
      if(modal.tagName==='DIALOG'){modal.close();return;}
      // Invoke the existing cancellation handler so pending confirmation Promises resolve.
      const cancel=[...modal.querySelectorAll('button')].find(b=>b!==x&&(/cancel|close/i.test(b.id+' '+b.className+' '+(b.getAttribute('aria-label')||''))||/^(cancel|close|back|no)$/i.test(b.textContent.trim())));
      if(cancel){cancel.click();return;}modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');
    };
  }
  function scan(root){if(root.nodeType!==1)return;if(root.matches(overlays))enhance(root);root.querySelectorAll(overlays).forEach(enhance);}
  const start=()=>{scan(document.body);new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(scan))).observe(document.body,{subtree:true,childList:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
