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
 const UPDATE_TYPES=Object.freeze({
  major:{label:'Major',rank:0},
  minor:{label:'Minor',rank:1},
  patch:{label:'Patch',rank:2}
 });
 const VERSION_RE=/^\d+\.\d+\.\d{2}$/;
 const normaliseType=value=>UPDATE_TYPES[String(value||'').toLowerCase()]?String(value).toLowerCase():'patch';
 const normaliseVersion=value=>{const clean=String(value||'').trim();return VERSION_RE.test(clean)?clean:'';};
 const normalisePr=value=>{
  const clean=String(value||'').trim();
  if(!clean)return '';
  try{
   const url=new URL(clean);
   return /(^|\.)github\.com$/i.test(url.hostname)&&/\/pull\/\d+(?:\/|$)/.test(url.pathname)?url.href:'';
  }catch(_){return '';}
 };
 const typeLabel=value=>UPDATE_TYPES[normaliseType(value)].label;
 const typeRank=value=>UPDATE_TYPES[normaliseType(value)].rank;
 const dateMs=value=>value?.toMillis?.()||value?.toDate?.()?.getTime?.()||Date.parse(value||0)||0;
 const versionParts=value=>String(value||'').split('.').map(part=>Number(part)||0);
 const compareVersion=(a,b)=>{
  const av=versionParts(a),bv=versionParts(b);
  for(let i=0;i<3;i++){if(av[i]!==bv[i])return av[i]-bv[i];}
  return 0;
 };
 const currentVersion=()=>{
  const settings=window.LS26Settings?.get?.();
  const fromSettings=normaliseVersion(settings?.appVersion);
  if(fromSettings)return fromSettings;
  const versions=rows.map(item=>normaliseVersion(item.version)).filter(Boolean).sort(compareVersion);
  return versions.at(-1)||'3.1.55';
 };
 const bumpVersion=(base,type)=>{
  const [major=0,minor=0,patch=0]=versionParts(normaliseVersion(base)||'3.1.55');
  if(type==='major')return `${major+1}.0.00`;
  if(type==='minor')return `${major}.${minor+1}.00`;
  return `${major}.${minor}.${String(patch+1).padStart(2,'0')}`;
 };

 function open(note=null){
  editing=note;
  if(!dialog){
   dialog=document.createElement('dialog');
   dialog.id='ls26UpdatesDialog';
   dialog.className='ls26-dialog ls26-capture-dialog ls26-update-editor-dialog';
   dialog.setAttribute('aria-labelledby','ls26UpdatesHeading');
   dialog.innerHTML=`
    <form id="ls26UpdateForm">
      <h2 id="ls26UpdatesHeading">App Updates</h2>
      <p class="ls26-update-intro">Capture a LiveSuite change, fix or improvement.</p>
      <div class="ls26-update-form-grid">
        <label>Update type
          <select id="ls26UpdateType">
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="patch" selected>Patch</option>
          </select>
        </label>
        <label>LiveSuite version <small>(optional until released)</small>
          <input id="ls26UpdateVersion" inputmode="decimal" placeholder="e.g. 3.1.56">
        </label>
      </div>
      <label>GitHub pull request <small>(optional)</small>
        <input id="ls26UpdatePr" type="url" inputmode="url" placeholder="https://github.com/.../pull/123">
      </label>
      <label>Update details
        <textarea id="ls26UpdateText" aria-label="Update details" required maxlength="5000" rows="5" placeholder="What changed in LiveSuite?"></textarea>
      </label>
      <p id="ls26UpdateSaveStatus" role="status"></p>
      <button class="ls26-save-note" type="submit">Save update</button>
    </form>`;
   document.body.append(dialog);
   $('ls26UpdateText').oninput=()=>{
    $('ls26UpdateText').setCustomValidity('');
    if(!editing)try{localStorage.setItem(key(),$('ls26UpdateText').value);}catch(_){}
   };
   $('ls26UpdateForm').onsubmit=async e=>{
    e.preventDefault();
    const field=$('ls26UpdateText');
    const text=field.value.trim();
    const button=e.currentTarget.querySelector('[type=submit]');
    const updateType=normaliseType($('ls26UpdateType').value);
    const rawVersion=String($('ls26UpdateVersion').value||'').trim();
    const version=normaliseVersion(rawVersion);
    const rawPr=String($('ls26UpdatePr').value||'').trim();
    const pullRequestUrl=normalisePr(rawPr);
    if(!text){field.setCustomValidity('Enter an update.');field.reportValidity();return;}
    if(rawVersion&&!version){$('ls26UpdateSaveStatus').textContent='Use a version such as 3.1.56.';return;}
    if(rawPr&&!pullRequestUrl){$('ls26UpdateSaveStatus').textContent='Enter a GitHub pull-request URL, for example https://github.com/owner/repo/pull/123.';return;}
    button.disabled=true;field.disabled=true;dialog.querySelector('.ls26-modal-x')?.setAttribute('disabled','');$('ls26UpdateSaveStatus').textContent='Saving…';
    try{
     const user=auth().currentUser;if(!user)throw Error('Sign in to Admin first, then try again.');
     const data={text,updateType,version,pullRequestUrl,updatedAt:stamp()};
     if(editing)await collection().doc(editing.id).update(data);
     else await collection().add({...data,kind:'update',page:location.pathname,completed:false,createdAt:stamp(),createdBy:user.uid});
     if(!editing)try{localStorage.removeItem(key());}catch(_){}
     field.value='';close();LS26.toast('App update saved.');if(manage)load(true);
    }catch(err){$('ls26UpdateSaveStatus').textContent=errorText(err)+' Your update has been kept; please retry.';}
    finally{button.disabled=false;field.disabled=false;dialog.querySelector('.ls26-modal-x')?.removeAttribute('disabled');}
   };
   dialog.addEventListener('cancel',e=>{if($('ls26UpdateForm').querySelector('[type=submit]').disabled)e.preventDefault();});
  }
  $('ls26UpdatesHeading').textContent=note?'Edit app update':'Add App Update';
  $('ls26UpdateSaveStatus').textContent='';
  let draft='';try{draft=localStorage.getItem(key())||'';}catch(_){}
  $('ls26UpdateText').value=note?.text||draft;
  $('ls26UpdateType').value=normaliseType(note?.updateType);
  $('ls26UpdateVersion').value=normaliseVersion(note?.version);
  $('ls26UpdatePr').value=normalisePr(note?.pullRequestUrl);
  if(!dialog.open)dialog.showModal();
  $('ls26UpdateText').focus();
 }
 function render(){
  const list=$('appUpdateRows'),filter=$('appUpdateFilter').value;list.replaceChildren();
  const visible=rows.filter(n=>filter==='all'||Boolean(n.completed)===(filter==='completed')).slice().sort((a,b)=>{const ac=Boolean(a.completed),bc=Boolean(b.completed);if(ac!==bc)return ac?1:-1;const at=a.createdAt?.toMillis?.()||Date.parse(a.createdAt||0)||0,bt=b.createdAt?.toMillis?.()||Date.parse(b.createdAt||0)||0;return bt-at;});
  $('appUpdateCount').textContent=`${visible.length} shown · ${rows.length} loaded`;
  let updateGroup='';for(const note of visible){const group=note.completed?'Completed':'Incomplete';if(filter==='all'&&group!==updateGroup){const heading=document.createElement('h3');heading.className='ls26-update-group-title '+(note.completed?'completed':'incomplete');heading.textContent=group;list.append(heading);updateGroup=group;}
   const article=document.createElement('article'),text=document.createElement('p'),meta=document.createElement('small'),actions=document.createElement('div'),edit=document.createElement('button'),done=document.createElement('button');
   article.className='ls26-update-card'+(note.completed?' is-completed':'');text.textContent=note.text;meta.textContent=`${note.completed?'Completed':'Pending'} · ${note.createdAt?.toDate?.().toLocaleString()||''} · ${note.page||''}`;
   edit.textContent='Edit';edit.onclick=()=>open(note);
   const copy=document.createElement('button');copy.type='button';copy.className='ls26-update-copy';copy.innerHTML='<span aria-hidden="true">⧉</span> Copy';copy.title='Copy update text';copy.onclick=async()=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(note.text||'');else{const ta=document.createElement('textarea');ta.value=note.text||'';ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();}LS26.toast('Update text copied.');}catch(error){$('appUpdateStatus').textContent='Could not copy this update.';}};
   done.textContent=note.completed?'Reopen':'Mark completed';done.onclick=async()=>{done.disabled=true;try{await collection().doc(note.id).update({completed:!note.completed,updatedAt:stamp()});note.completed=!note.completed;render();LS26.toast('Update saved successfully.');}catch(e){$('appUpdateStatus').textContent=errorText(e);done.disabled=false;}};
   actions.append(edit,copy,done);article.append(text,meta,actions);list.append(article);
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
