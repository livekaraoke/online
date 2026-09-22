/* Shared quick capture and admin management of LiveSuite improvement notes. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const db=()=>window.db||window.LK?.db||firebase.firestore();
 const collection=()=>db().collection('appUpdateNotes');
 const auth=()=>window.LK?.auth||firebase.auth();
 const key=()=>`ls26:appUpdateDraft:${firebase.app().options.projectId}:${auth().currentUser?.uid||'host'}`;
 const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
 const errorText=e=>e.code==='permission-denied'?'Access denied. Ask the owner to enable appUpdateNotes for your host account in Firestore Rules.':e.message;
 let dialog,editing=null,rows=[],loading=false,cursor=null;
 const manage=!!$('appUpdateRows');
 function close(){LS26Dialogs.fadeClose(dialog);}
 function open(note=null){
  editing=note;
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='ls26UpdatesDialog';dialog.className='ls26-dialog ls26-capture-dialog';dialog.setAttribute('aria-labelledby','ls26UpdatesHeading');
   dialog.innerHTML='<form id="ls26UpdateForm"><h2 id="ls26UpdatesHeading">App Updates</h2><p>Capture an idea or something to fix in LiveSuite.</p><label for="ls26UpdateText">Your note</label><textarea id="ls26UpdateText" required maxlength="5000" rows="5" placeholder="What would you like to improve?"></textarea><p id="ls26UpdateSaveStatus" role="status"></p><button class="ls26-save-note" type="submit">Save note</button></form>';
   document.body.append(dialog);
   $('ls26UpdateText').oninput=()=>{$('ls26UpdateText').setCustomValidity('');if(!editing)try{localStorage.setItem(key(),$('ls26UpdateText').value);}catch(_){}};
   $('ls26UpdateForm').onsubmit=async e=>{
    e.preventDefault();const field=$('ls26UpdateText'),text=field.value.trim(),button=e.currentTarget.querySelector('[type=submit]');if(!text){field.setCustomValidity('Enter a note.');field.reportValidity();return;}
    button.disabled=true;field.disabled=true;dialog.querySelector('.ls26-modal-x')?.setAttribute('disabled','');$('ls26UpdateSaveStatus').textContent='Saving…';
    try{
     const user=auth().currentUser;if(!user)throw Error('Sign in to Admin first, then try again.');
     if(editing)await collection().doc(editing.id).update({text,updatedAt:stamp()});
     else await collection().add({text,page:location.pathname,completed:false,createdAt:stamp(),createdBy:user.uid});
     if(!editing)try{localStorage.removeItem(key());}catch(_){}
     field.value='';close();LS26.toast('Note saved successfully.');if(manage)load(true);
    }catch(err){$('ls26UpdateSaveStatus').textContent=errorText(err)+' Your note has been kept; please retry.';}
    finally{button.disabled=false;field.disabled=false;dialog.querySelector('.ls26-modal-x')?.removeAttribute('disabled');}
   };
   dialog.addEventListener('cancel',e=>{if($('ls26UpdateForm').querySelector('[type=submit]').disabled)e.preventDefault();});
  }
  $('ls26UpdatesHeading').textContent=note?'Edit app update':'App Updates';$('ls26UpdateSaveStatus').textContent='';
  let draft='';try{draft=localStorage.getItem(key())||'';}catch(_){}
  $('ls26UpdateText').value=note?.text||draft;if(!dialog.open)dialog.showModal();$('ls26UpdateText').focus();
 }
 function render(){
  const list=$('appUpdateRows'),filter=$('appUpdateFilter').value;list.replaceChildren();
  const visible=rows.filter(n=>filter==='all'||Boolean(n.completed)===(filter==='completed'));
  $('appUpdateCount').textContent=`${visible.length} shown · ${rows.length} loaded`;
  for(const note of visible){
   const article=document.createElement('article'),text=document.createElement('p'),meta=document.createElement('small'),actions=document.createElement('div'),edit=document.createElement('button'),done=document.createElement('button');
   article.className='ls26-update-card';text.textContent=note.text;meta.textContent=`${note.completed?'Completed':'Pending'} · ${note.createdAt?.toDate?.().toLocaleString()||''} · ${note.page||''}`;
   edit.textContent='Edit';edit.onclick=()=>open(note);done.textContent=note.completed?'Reopen':'Mark completed';done.onclick=async()=>{done.disabled=true;try{await collection().doc(note.id).update({completed:!note.completed,updatedAt:stamp()});note.completed=!note.completed;render();LS26.toast('Update saved successfully.');}catch(e){$('appUpdateStatus').textContent=errorText(e);done.disabled=false;}};
   actions.append(edit,done);article.append(text,meta,actions);list.append(article);
  }
  if(!visible.length)list.textContent='No matching updates in the loaded notes.';
 }
 async function load(reset=false){
  if(loading)return;loading=true;$('appUpdateStatus').textContent='Loading…';$('appUpdateMore').disabled=true;
  try{let q=collection().orderBy('createdAt','desc').limit(50);if(!reset&&cursor)q=q.startAfter(cursor);const snap=await q.get();if(reset)rows=[];rows.push(...snap.docs.map(d=>({...d.data(),id:d.id})));cursor=snap.docs.at(-1)||null;render();$('appUpdateMore').hidden=snap.size<50;$('appUpdateStatus').textContent='';}
  catch(e){$('appUpdateStatus').textContent=errorText(e);}
  finally{loading=false;$('appUpdateMore').disabled=false;}
 }
 window.LS26.openAppUpdates=open;
 if(manage){
  $('appUpdateAdd').onclick=()=>open();$('appUpdateFilter').onchange=render;$('appUpdateMore').onclick=()=>load();$('appUpdateRefresh').onclick=()=>load(true);
  auth().onAuthStateChanged(user=>{if(user){window.LK?.sidebar?.loadSidebar?.();$('appUpdateStatus').textContent='';load(true);}else{$('appUpdateRows').replaceChildren();$('appUpdateStatus').textContent='Sign in using Admin to manage app updates.';}});
 }
})();
