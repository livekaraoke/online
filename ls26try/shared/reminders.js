/* LiveSuite reminder capture and management. One shared pending listener on Admin pages. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => LS26.escape(value);
  const auth = window.LK?.auth || window.firebase?.auth?.();
  const db = () => window.LK?.db || window.db || firebase.firestore();
  const collection = () => db().collection('reminders');
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const manage = !!$('reminderRows');
  let user = null, pending = [], rows = [], unsubscribe = null, generation = 0, listGeneration = 0;
  let pendingReady = false, pendingError = '', cursor = null, more = false, dialog, editing = null, saving = false, skipDraftClose = false;
  const contextKey = () => `${firebase.app().options.projectId}:${user?.uid || 'signed-out'}`;
  const draftKey = () => `ls26:reminderDraft:${contextKey()}`;
  const errorText = error => error.code === 'permission-denied'
    ? 'Reminders access is not enabled for this account. Ask the owner to enable the reminders rules for the selected database.'
    : (error.message || 'Could not connect. Please retry.');
  const dateString = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dueMillis = note => note.dueAt?.toMillis?.() || 0;
  const isOverdue = note => note.status === 'pending' && dueMillis(note) > 0 && dueMillis(note) < Date.now();
  function safeLink(value) {
    if (!value) return '';
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol)) throw Error('Use an https:// or http:// link.');
    return url.href;
  }
  function formValues() {
    return {text:$('reminderText').value.trim(),date:$('reminderDate').value,time:$('reminderTime').value,
      priority:$('reminderPriority').value,category:$('reminderCategory').value.trim(),link:$('reminderLink').value.trim()};
  }
  function saveDraft() {
    if (!editing && user) try { localStorage.setItem(draftKey(),JSON.stringify(formValues())); } catch (_) {}
  }
  function setBusy(value) {
    saving=value;
    dialog.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=value);
  }
  function open(note=null) {
    if (!user) { LS26.toast('Sign in to Admin to use reminders.'); return; }
    if (saving) return;
    editing=note;
    if (!dialog) {
      dialog=document.createElement('dialog');dialog.className='ls26-dialog reminder-dialog';dialog.setAttribute('aria-labelledby','reminderHeading');
      dialog.innerHTML=`<form id="reminderForm"><h2 id="reminderHeading">Add Reminder</h2>
        <label>What do you need to remember?<textarea id="reminderText" required maxlength="5000" rows="4" placeholder="A task, an idea, something to bring…"></textarea></label>
        <div class="tool-form-grid"><label>Due date · optional<input id="reminderDate" type="date"></label><label>Time · optional<input id="reminderTime" type="time"></label>
        <label>Priority<select id="reminderPriority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
        <label>Category · optional<input id="reminderCategory" maxlength="80" list="reminderCategories" placeholder="Live Karaoke, Roxanna, Solo…"></label></div>
        <datalist id="reminderCategories"><option>Live Karaoke</option><option>Roxanna</option><option>Solo</option><option>Equipment</option><option>Admin</option><option>Personal</option></datalist>
        <label>Related link · optional<input id="reminderLink" type="url" maxlength="2000" placeholder="https://…"></label>
        <small id="reminderTimezone"></small><p id="reminderSaveStatus" role="status"></p>
        <div class="tool-actions"><button id="reminderSave" type="submit">Save reminder</button><button id="reminderCancel" type="button">Cancel</button><a href="${LS26.url('admin-new/reminders.html')}">View reminders</a></div></form>`;
      document.body.append(dialog);
      $('reminderForm').addEventListener('input',()=>{ $('reminderText').setCustomValidity('');saveDraft(); });
      $('reminderCancel').onclick=()=>{saveDraft();dialog.close();};
      dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();else saveDraft();});
      dialog.addEventListener('close',()=>{if(!saving&&!skipDraftClose)saveDraft();skipDraftClose=false;});
      $('reminderForm').onsubmit=submit;
    }
    let draft={};if(!note)try{draft=JSON.parse(localStorage.getItem(draftKey())||'{}')||{};}catch(_){}
    const initial=note||draft;
    $('reminderHeading').textContent=note?'Edit Reminder':'Add Reminder';
    $('reminderText').value=initial.text||'';$('reminderDate').value=initial.date||'';$('reminderTime').value=initial.time||'';
    $('reminderPriority').value=initial.priority||'normal';$('reminderCategory').value=initial.category||'';$('reminderLink').value=initial.link||'';
    $('reminderTimezone').textContent=`Dates use ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Due dates are shown in Reminders; no background alarm.`;
    $('reminderSaveStatus').textContent='';$('reminderText').setCustomValidity('');
    if(!dialog.open)dialog.showModal();$('reminderText').focus();
  }
  async function submit(event) {
    event.preventDefault();if(saving)return;
    const account=user, version=generation, values=formValues();
    if(!values.text){$('reminderText').setCustomValidity('Enter a reminder.');$('reminderText').reportValidity();return;}
    if(values.time&&!values.date){$('reminderSaveStatus').textContent='Choose a date as well as a time.';return;}
    let due=null;
    try {
      values.link=safeLink(values.link);
      if(values.date){due=new Date(`${values.date}T${values.time?values.time+':00':'23:59:59'}`);if(!Number.isFinite(+due)||dateString(due)!==values.date)throw Error('Choose a valid due date.');}
    } catch(error){$('reminderSaveStatus').textContent=error.message;return;}
    if(!account){$('reminderSaveStatus').textContent='Sign in to Admin first.';return;}
    const old=editing, key=draftKey();setBusy(true);$('reminderSaveStatus').textContent='Saving…';
    try {
      // Preserve the original instant/timezone if only the text or priority changed.
      const unchangedDate=old&&old.date===values.date&&old.time===values.time;
      const data={...values,dueAt:unchangedDate?old.dueAt||null:due?firebase.firestore.Timestamp.fromDate(due):null,
        timeZone:unchangedDate?old.timeZone||'':Intl.DateTimeFormat().resolvedOptions().timeZone,updatedAt:stamp()};
      if(old)await collection().doc(old.id).update(data);
      else await collection().add({...data,status:'pending',createdAt:stamp(),createdBy:account.uid,sourcePage:location.pathname});
      if(!old)try{localStorage.removeItem(key);}catch(_){}
      if(version!==generation)return;
      skipDraftClose=true;dialog.close();LS26.toast('Reminder saved.');if(manage&&$('reminderFilter').value!=='pending')load(true);
    }catch(error){if(version===generation)$('reminderSaveStatus').textContent=errorText(error)+' Your reminder has been kept.';}
    finally{setBusy(false);}
  }
  function badge() {
    const el=$('sidebarReminderBadge');if(!el)return;
    el.classList.toggle('hidden',!user);
    el.textContent=pendingError?'!':pendingReady?String(pending.length):'…';
    el.title=pendingError||`${pending.length} pending reminders`;
    el.setAttribute('aria-label',pendingError?'Reminder count unavailable':`${pending.length} pending reminders`);
  }
  function subscribePending() {
    if(!user||unsubscribe||(!$('sidebarReminderBadge')&&!manage)||location.pathname.endsWith('/db-logs.html')){badge();return;}
    const version=generation;
    unsubscribe=collection().where('createdBy','==',user.uid).where('status','==','pending').onSnapshot(snap=>{
      if(version!==generation)return;
      pending=snap.docs.map(doc=>({...doc.data(),id:doc.id}));pendingReady=true;pendingError='';badge();
      if(manage&&$('reminderFilter').value==='pending'){rows=pending;more=false;render();$('reminderPageStatus').textContent='';}
    },error=>{if(version!==generation)return;pendingReady=false;pendingError=errorText(error);badge();if(manage)$('reminderPageStatus').textContent=pendingError;});
  }
  async function load(reset=true) {
    if(!manage||!user)return;
    const filter=$('reminderFilter').value;
    if(filter==='pending'){listGeneration++;rows=pending;more=false;render();$('reminderPageStatus').textContent=pendingError||(!pendingReady?'Loading reminders…':'');subscribePending();return;}
    const version=++listGeneration,accountVersion=generation;
    $('reminderPageStatus').textContent='Loading reminders…';$('reminderMore').disabled=true;
    if(reset){cursor=null;rows=[];more=false;render();}
    try {
      let query=collection().where('createdBy','==',user.uid);
      if(filter!=='all')query=query.where('status','==',filter);
      query=query.limit(50);if(!reset&&cursor)query=query.startAfter(cursor);
      const snap=await query.get();if(version!==listGeneration||accountVersion!==generation)return;
      const combined=new Map(rows.map(row=>[row.id,row]));snap.docs.forEach(doc=>combined.set(doc.id,{...doc.data(),id:doc.id}));rows=[...combined.values()];
      cursor=snap.docs.at(-1)||null;more=snap.size===50;render();$('reminderPageStatus').textContent=more?'Load more to include additional reminders in search and sorting.':'';
    }catch(error){if(version===listGeneration)$('reminderPageStatus').textContent=errorText(error);}
    finally{if(version===listGeneration)$('reminderMore').disabled=false;}
  }
  async function change(note,patch,button) {
    const version=generation;if(!user||button.disabled)return;button.disabled=true;
    try{await collection().doc(note.id).update({...patch,updatedAt:stamp()});if(version!==generation)return;LS26.toast('Reminder updated.');if($('reminderFilter').value!=='pending')load(true);}
    catch(error){if(version===generation){$('reminderPageStatus').textContent=errorText(error);button.disabled=false;}}
  }
  function render() {
    if(!manage)return;
    const query=$('reminderSearch').value.trim().toLowerCase(),priority=$('reminderPriorityFilter').value,category=$('reminderCategoryFilter').value;
    const categories=[...new Set(rows.map(n=>n.category).filter(Boolean))].sort();
    $('reminderCategoryFilter').innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('reminderCategoryFilter').value=categories.includes(category)?category:'';
    const selectedCategory=$('reminderCategoryFilter').value;
    let visible=rows.filter(note=>(!query||`${note.text} ${note.category||''}`.toLowerCase().includes(query))&&(!priority||note.priority===priority)&&(!selectedCategory||note.category===selectedCategory)&&(!$('reminderOverdue').checked||isOverdue(note)));
    const rank={high:0,normal:1,low:2},sort=$('reminderSort').value;
    visible.sort((a,b)=>sort==='priority'?(rank[a.priority]??1)-(rank[b.priority]??1)||(dueMillis(a)||Infinity)-(dueMillis(b)||Infinity):sort==='newest'?(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0):(dueMillis(a)||Infinity)-(dueMillis(b)||Infinity)||(rank[a.priority]??1)-(rank[b.priority]??1));
    $('reminderCount').textContent=`${visible.length} shown · ${rows.length} loaded`;
    const list=$('reminderRows');list.replaceChildren();
    for(const note of visible){
      const card=document.createElement('article');card.className='reminder-card'+(isOverdue(note)?' overdue':'')+(note.status==='completed'?' completed':'');
      let link='';try{link=safeLink(note.link);}catch(_){}
      card.innerHTML=`<div class="reminder-meta"><span>${esc(note.status||'pending')}</span><strong>${esc(note.priority||'normal')} priority</strong>${note.category?`<span>${esc(note.category)}</span>`:''}</div><p class="reminder-text">${esc(note.text)}</p><p class="reminder-due">${note.date?`${isOverdue(note)?'Overdue · ':''}${esc(note.date)}${note.time?' at '+esc(note.time):' · Any time'} <small>${esc(note.timeZone||'')}</small>`:'No due date'}</p>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open related link ↗</a>`:''}<div class="tool-actions"></div>`;
      const actions=card.querySelector('.tool-actions');
      const add=(label,action)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>action(button);actions.append(button);};
      add('Edit',()=>open(note));add(note.status==='pending'?'Mark completed':'Reopen',button=>change(note,{status:note.status==='pending'?'completed':'pending'},button));
      if(note.status==='pending')add('Tomorrow',button=>{const date=new Date();date.setDate(date.getDate()+1);const day=dateString(date),time=note.time||'';change(note,{date:day,time,dueAt:firebase.firestore.Timestamp.fromDate(new Date(`${day}T${time?time+':00':'23:59:59'}`)),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},button);});
      if(note.status!=='archived')add('Archive',button=>change(note,{status:'archived'},button));
      list.append(card);
    }
    if(!visible.length)list.textContent=user?'No reminders match these filters.':'Sign in to Admin to manage reminders.';
    $('reminderMore').hidden=!more;
  }
  window.LS26.openReminder=open;
  window.addEventListener('ls26:sidebar-ready',subscribePending);
  window.addEventListener('pagehide',()=>{unsubscribe?.();unsubscribe=null;});
  window.addEventListener('pageshow',subscribePending);
  if(manage){
    $('reminderAdd').onclick=()=>open();$('reminderFilter').onchange=()=>load(true);
    ['reminderSearch','reminderPriorityFilter','reminderCategoryFilter','reminderSort','reminderOverdue'].forEach(id=>$(id).addEventListener(id==='reminderSearch'?'input':'change',render));
    $('reminderMore').onclick=()=>load(false);
    $('reminderRefresh').onclick=()=>{unsubscribe?.();unsubscribe=null;pendingReady=false;pendingError='';subscribePending();load(true);};
    setInterval(()=>{if(user&&!document.hidden)render();},60000); // Only local due-state calculation, no reads.
  }
  auth?.onAuthStateChanged(account=>{
    generation++;listGeneration++;unsubscribe?.();unsubscribe=null;user=account;pending=[];rows=[];pendingReady=false;pendingError='';cursor=null;more=false;
    if(dialog?.open){skipDraftClose=true;dialog.close();}badge();
    if(manage){render();$('reminderAdd').disabled=!user;$('reminderPageStatus').textContent=user?'Loading reminders…':'Sign in using Admin to manage reminders.';}
    if(user){subscribePending();if(manage){LK.sidebar?.loadSidebar?.();load(true);}}
  });
})();
