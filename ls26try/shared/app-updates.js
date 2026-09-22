/* LiveSuite App Updates: shared quick capture and paged cloud-backed notes. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const collection=()=>{const db=window.db||window.LK?.db||window.firebase?.firestore?.();if(!db)throw Error('Connection is not ready. Please try again.');return db.collection('appUpdateNotes');};
  const draftKey=()=>`ls26:appUpdateDraft:${window.firebase?.app?.().options.projectId||location.host}:${window.firebase?.auth?.().currentUser?.uid||'host'}`;
  let dialog,cursor,rows=[],loading=false;
  function render(){
    const list=$('ls26UpdateRows');list.replaceChildren();
    for(const note of rows){
      const article=document.createElement('article'),text=document.createElement('p'),meta=document.createElement('small'),button=document.createElement('button');
      text.textContent=note.text;meta.textContent=`${note.createdAt?.toDate?.().toLocaleString()||'Just saved'} · ${note.page||''}`;
      button.type='button';button.textContent=note.completed?'Reopen':'Mark done';button.setAttribute('aria-label',`${button.textContent}: ${note.text.slice(0,60)}`);
      article.classList.toggle('is-done',!!note.completed);
      button.onclick=async()=>{button.disabled=true;try{await collection().doc(note.id).update({completed:!note.completed});note.completed=!note.completed;render();}catch(e){$('ls26UpdateListStatus').textContent='Could not update note: '+e.message;button.disabled=false;}};
      article.append(text,meta,button);list.append(article);
    }
    if(!rows.length)list.textContent='No app update notes yet.';
  }
  async function load(reset=false){
    if(loading)return;loading=true;$('ls26UpdateMore').disabled=true;$('ls26UpdateRefresh').disabled=true;$('ls26UpdateListStatus').textContent='Loading notes…';
    try{
      let query=collection().orderBy('createdAt','desc').limit(50);if(!reset&&cursor)query=query.startAfter(cursor);
      const snap=await query.get();if(reset)rows=[];rows.push(...snap.docs.map(d=>({...d.data(),id:d.id})));cursor=snap.docs.at(-1)||null;
      render();$('ls26UpdateMore').hidden=snap.size<50;$('ls26UpdateListStatus').textContent='';
    }catch(e){$('ls26UpdateListStatus').textContent='Could not load notes: '+e.message;}
    finally{loading=false;$('ls26UpdateMore').disabled=false;$('ls26UpdateRefresh').disabled=false;}
  }
  window.LS26.openAppUpdates=()=>{
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='ls26UpdatesDialog';dialog.className='ls26-dialog';dialog.setAttribute('aria-labelledby','ls26UpdatesHeading');
      dialog.innerHTML='<form id="ls26UpdateForm"><h2 id="ls26UpdatesHeading">App Updates</h2><p>Capture an idea or something to fix in LiveSuite.</p><label for="ls26UpdateText">Your note</label><textarea id="ls26UpdateText" required maxlength="5000" rows="4" placeholder="What would you like to improve?"></textarea><p id="ls26UpdateSaveStatus" role="status"></p><div class="ls26-dialog-actions"><button type="submit">Save note</button><button id="ls26UpdateClose" type="button">Close</button></div></form><hr><div class="ls26-updates-heading"><h3>Saved notes</h3><button id="ls26UpdateRefresh" type="button">Refresh</button></div><p id="ls26UpdateListStatus" role="status"></p><div id="ls26UpdateRows"></div><button id="ls26UpdateMore" type="button" hidden>Load more</button>';
      document.body.append(dialog);
      $('ls26UpdateClose').onclick=()=>dialog.close();$('ls26UpdateRefresh').onclick=()=>load(true);$('ls26UpdateMore').onclick=()=>load();
      $('ls26UpdateText').oninput=()=>{$('ls26UpdateText').setCustomValidity('');try{localStorage.setItem(draftKey(),$('ls26UpdateText').value);}catch(_){}};
      $('ls26UpdateForm').onsubmit=async e=>{
        e.preventDefault();const field=$('ls26UpdateText'),text=field.value.trim(),button=e.currentTarget.querySelector('[type=submit]');if(!text){field.setCustomValidity('Enter a note.');field.reportValidity();return;}
        button.disabled=true;field.disabled=true;$('ls26UpdateSaveStatus').textContent='Saving…';
        try{await collection().add({text,page:location.pathname,completed:false,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:firebase.auth?.().currentUser?.uid||null});field.value='';try{localStorage.removeItem(draftKey());}catch(_){}$('ls26UpdateSaveStatus').textContent='Note saved. Find it here or under System → App Updates in Admin.';await load(true);}
        catch(error){$('ls26UpdateSaveStatus').textContent='Cloud save failed. Your note is still here; please retry. '+error.message;}
        finally{button.disabled=false;field.disabled=false;field.focus();}
      };
    }
    if(!dialog.open)dialog.showModal();try{if(!$('ls26UpdateText').value)$('ls26UpdateText').value=localStorage.getItem(draftKey())||'';}catch(_){}
    $('ls26UpdateText').focus();load(true);
  };
})();
