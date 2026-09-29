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
 const VERSION_RE=/^\d\.\d\.\d{2}$/;
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
 function refreshVersionFilter(){
  const select=$('appUpdateVersionFilter');
  if(!select)return;
  const selected=select.value||'all';
  const versions=[...new Set(rows.map(item=>normaliseVersion(item.version)).filter(Boolean))]
    .sort((a,b)=>compareVersion(b,a));
  select.replaceChildren();
  const all=document.createElement('option');all.value='all';all.textContent='All versions';select.append(all);
  const unassigned=document.createElement('option');unassigned.value='unassigned';unassigned.textContent='Unassigned';select.append(unassigned);
  versions.forEach(version=>{
   const option=document.createElement('option');
   option.value=version;option.textContent='v'+version;select.append(option);
  });
  select.value=[...select.options].some(option=>option.value===selected)?selected:'all';
 }

 function updateSortComparator(sort){
  const byNewest=(a,b)=>dateMs(b.createdAt)-dateMs(a.createdAt);
  if(sort==='oldest')return (a,b)=>dateMs(a.createdAt)-dateMs(b.createdAt);
  if(sort==='type-major')return (a,b)=>typeRank(a.updateType)-typeRank(b.updateType)||byNewest(a,b);
  if(sort==='type-patch')return (a,b)=>typeRank(b.updateType)-typeRank(a.updateType)||byNewest(a,b);
  return byNewest;
 }

 function releaseLink(url,label='GitHub PR'){
  const clean=normalisePr(url);
  if(!clean)return null;
  const link=document.createElement('a');
  link.href=clean;link.target='_blank';link.rel='noopener noreferrer';
  link.className='ls26-update-pr-link';link.textContent=label+' ↗';
  return link;
 }

 function renderUpdateCard(note){
  const article=document.createElement('article');
  article.className='ls26-update-card'+(note.completed?' is-completed':'');
  article.dataset.updateType=normaliseType(note.updateType);

  const badges=document.createElement('div');badges.className='ls26-update-badges';
  const type=document.createElement('span');type.className='ls26-update-type type-'+normaliseType(note.updateType);type.textContent=typeLabel(note.updateType);
  badges.append(type);
  if(normaliseVersion(note.version)){
   const version=document.createElement('span');version.className='ls26-update-version-badge';version.textContent='v'+normaliseVersion(note.version);badges.append(version);
  }
  const status=document.createElement('span');status.className='ls26-update-status-badge '+(note.completed?'completed':'pending');status.textContent=note.completed?'Completed':'Pending';badges.append(status);

  const text=document.createElement('p');text.textContent=note.text||'';
  const meta=document.createElement('small');
  meta.textContent=`${note.createdAt?.toDate?.().toLocaleString()||''}${note.page?' · '+note.page:''}`;

  const pr=releaseLink(note.pullRequestUrl);
  const metaRow=document.createElement('div');metaRow.className='ls26-update-meta-row';metaRow.append(meta);if(pr)metaRow.append(pr);

  const actions=document.createElement('div');actions.className='ls26-update-actions';
  const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>open(note);
  const copy=document.createElement('button');copy.type='button';copy.className='ls26-update-copy';copy.innerHTML='<span aria-hidden="true">⧉</span> Copy';copy.title='Copy update text';
  copy.onclick=async()=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(note.text||'');else{const ta=document.createElement('textarea');ta.value=note.text||'';ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();}LS26.toast('Update text copied.');}catch(error){$('appUpdateStatus').textContent='Could not copy this update.';}};
  const done=document.createElement('button');done.type='button';done.textContent=note.completed?'Reopen':'Mark completed';
  done.onclick=async()=>{done.disabled=true;try{await collection().doc(note.id).update({completed:!note.completed,updatedAt:stamp()});note.completed=!note.completed;render();LS26.toast('Update saved successfully.');}catch(e){$('appUpdateStatus').textContent=errorText(e);done.disabled=false;}};
  actions.append(edit,copy,done);
  article.append(badges,text,metaRow,actions);
  return article;
 }

 function render(){
  if(!manage)return;
  const list=$('appUpdateRows');
  const statusFilter=$('appUpdateFilter')?.value||'all';
  const typeFilter=$('appUpdateTypeFilter')?.value||'all';
  const versionFilter=$('appUpdateVersionFilter')?.value||'all';
  const sort=$('appUpdateSort')?.value||'newest';

  refreshVersionFilter();

  const visible=rows.filter(note=>{
   if(statusFilter!=='all'&&Boolean(note.completed)!==(statusFilter==='completed'))return false;
   if(typeFilter!=='all'&&normaliseType(note.updateType)!==typeFilter)return false;
   const version=normaliseVersion(note.version);
   if(versionFilter==='unassigned'&&version)return false;
   if(versionFilter!=='all'&&versionFilter!=='unassigned'&&version!==versionFilter)return false;
   return true;
  });

  const updateCount=visible.filter(note=>note.kind!=='release').length;
  $('appUpdateCount').textContent=`${updateCount} update${updateCount===1?'':'s'} shown · ${rows.filter(note=>note.kind!=='release').length} loaded`;
  list.replaceChildren();

  if(!visible.length){
   list.textContent='No matching updates.';
   return;
  }

  const groups=new Map();
  visible.forEach(note=>{
   const version=normaliseVersion(note.version)||'unassigned';
   if(!groups.has(version))groups.set(version,[]);
   groups.get(version).push(note);
  });

  const groupKeys=[...groups.keys()].sort((a,b)=>{
   if(a==='unassigned')return 1;
   if(b==='unassigned')return -1;
   return sort==='oldest'?compareVersion(a,b):compareVersion(b,a);
  });

  for(const version of groupKeys){
   const notes=groups.get(version)||[];
   const release=notes.find(note=>note.kind==='release')||null;
   const updates=notes.filter(note=>note.kind!=='release').sort(updateSortComparator(sort));

   const section=document.createElement('section');
   section.className='ls26-update-version-group'+(version==='unassigned'?' is-unassigned':'');
   const head=document.createElement('header');head.className='ls26-update-version-head';

   const titleWrap=document.createElement('div');
   const title=document.createElement('h2');title.textContent=version==='unassigned'?'Unassigned updates':'LiveSuite v'+version;
   titleWrap.append(title);

   const releaseMeta=document.createElement('div');releaseMeta.className='ls26-update-release-meta';
   if(release){
    const badge=document.createElement('span');badge.className='ls26-update-type type-'+normaliseType(release.updateType);badge.textContent=typeLabel(release.updateType)+' release';releaseMeta.append(badge);
    const pr=releaseLink(release.pullRequestUrl,'Release PR');if(pr)releaseMeta.append(pr);
    if(release.createdAt?.toDate){
     const date=document.createElement('small');date.textContent='Released '+release.createdAt.toDate().toLocaleString();releaseMeta.append(date);
    }
    const editRelease=document.createElement('button');editRelease.type='button';editRelease.className='ls26-edit-release';editRelease.textContent='Edit release';editRelease.onclick=()=>open(release);releaseMeta.append(editRelease);
   }else if(version!=='unassigned'){
    const badge=document.createElement('span');badge.className='ls26-update-version-badge';badge.textContent='Version history';releaseMeta.append(badge);
   }

   head.append(titleWrap,releaseMeta);
   section.append(head);

   if(release?.text){
    const summary=document.createElement('p');summary.className='ls26-release-summary';summary.textContent=release.text;section.append(summary);
   }

   if(!updates.length){
    const empty=document.createElement('p');empty.className='ls26-update-group-empty';empty.textContent='No update items match the current filters for this version.';section.append(empty);
   }else{
    updates.forEach(note=>section.append(renderUpdateCard(note)));
   }
   list.append(section);
  }
 }

 async function load(reset=false){
  if(loading)return;
  loading=true;
  if(manage){$('appUpdateStatus').textContent='Loading version history…';if($('appUpdateMore'))$('appUpdateMore').disabled=true;}
  try{
   const snap=await collection().orderBy('createdAt','desc').get();
   rows=snap.docs.map(d=>({...d.data(),id:d.id}));
   cursor=null;
   render();
   if(manage&&$('appUpdateMore'))$('appUpdateMore').hidden=true;
   if(manage)$('appUpdateStatus').textContent='';
  }catch(e){if(manage)$('appUpdateStatus').textContent=errorText(e);}
  finally{loading=false;if(manage&&$('appUpdateMore'))$('appUpdateMore').disabled=false;}
 }

 let versionDialog=null;
 function ensureVersionDialog(){
  if(versionDialog)return versionDialog;
  versionDialog=document.createElement('dialog');
  versionDialog.id='ls26CreateVersionDialog';
  versionDialog.className='ls26-dialog ls26-create-version-dialog';
  versionDialog.setAttribute('aria-labelledby','ls26CreateVersionHeading');
  versionDialog.innerHTML=`
   <form id="ls26CreateVersionForm">
    <h2 id="ls26CreateVersionHeading">Create LiveSuite Version</h2>
    <p class="ls26-update-intro">Create a release, update the LiveSuite app version, and optionally assign all completed unversioned updates to it.</p>
    <div class="ls26-update-form-grid">
     <label>Release type
      <select id="ls26ReleaseType"><option value="major">Major</option><option value="minor">Minor</option><option value="patch" selected>Patch</option></select>
     </label>
     <label>New version
      <input id="ls26ReleaseVersion" required inputmode="decimal" placeholder="3.1.56">
     </label>
    </div>
    <label>GitHub pull request <small>(recommended)</small>
     <input id="ls26ReleasePr" type="url" inputmode="url" placeholder="https://github.com/.../pull/123">
    </label>
    <label>Release summary
     <textarea id="ls26ReleaseSummary" rows="4" maxlength="5000" placeholder="Summary of this LiveSuite version"></textarea>
    </label>
    <label class="ls26-release-assign"><input id="ls26ReleaseAssign" type="checkbox" checked> Assign all completed updates that do not yet have a version to this release</label>
    <label class="ls26-release-assign"><input id="ls26ReleaseMakeCurrent" type="checkbox" checked> Make this the current LiveSuite version shown in the app footer</label>
    <p id="ls26ReleaseStatus" role="status"></p>
    <div class="ls26-dialog-actions"><button class="primary" type="submit">Create Version</button><button id="ls26ReleaseCancel" type="button">Cancel</button></div>
   </form>`;
  document.body.append(versionDialog);
  $('ls26ReleaseCancel').onclick=()=>versionDialog.close();
  $('ls26ReleaseType').onchange=()=>{$('ls26ReleaseVersion').value=bumpVersion(currentVersion(),$('ls26ReleaseType').value);};
  $('ls26CreateVersionForm').onsubmit=async event=>{
   event.preventDefault();
   const button=event.currentTarget.querySelector('[type=submit]');
   const updateType=normaliseType($('ls26ReleaseType').value);
   const version=normaliseVersion($('ls26ReleaseVersion').value);
   const rawPr=String($('ls26ReleasePr').value||'').trim();
   const pullRequestUrl=normalisePr(rawPr);
   const summary=String($('ls26ReleaseSummary').value||'').trim();
   const assign=$('ls26ReleaseAssign').checked;
   const makeCurrent=$('ls26ReleaseMakeCurrent').checked;
   if(!version){$('ls26ReleaseStatus').textContent='Use the LiveSuite version format 0.0.00, for example 3.1.56.';return;}
   if(rows.some(item=>item.kind==='release'&&normaliseVersion(item.version)===version)){
    $('ls26ReleaseStatus').textContent='That LiveSuite version already exists in the version history.';
    return;
   }
   if(rawPr&&!pullRequestUrl){$('ls26ReleaseStatus').textContent='Enter a GitHub pull-request URL.';return;}
   if(!window.LS26Settings?.save){$('ls26ReleaseStatus').textContent='App Settings has not loaded yet. Reload the page and try again.';return;}
   const user=auth().currentUser;if(!user){$('ls26ReleaseStatus').textContent='Sign in to Admin first.';return;}

   button.disabled=true;$('ls26ReleaseStatus').textContent='Creating version…';
   try{
    let assigned=0;
    if(assign){
     const completedSnap=await collection().where('completed','==',true).get();
     const candidates=completedSnap.docs.filter(doc=>{
      const data=doc.data()||{};
      return data.kind!=='release'&&!normaliseVersion(data.version);
     });
     for(let offset=0;offset<candidates.length;offset+=400){
      const batch=db().batch();
      candidates.slice(offset,offset+400).forEach(doc=>{
       const data=doc.data()||{};
       const patch={version,updatedAt:stamp()};
       if(!UPDATE_TYPES[String(data.updateType||'').toLowerCase()])patch.updateType=updateType;
       if(pullRequestUrl&&!normalisePr(data.pullRequestUrl))patch.pullRequestUrl=pullRequestUrl;
       batch.update(doc.ref,patch);
      });
      await batch.commit();
     }
     assigned=candidates.length;
    }

    await collection().add({
     kind:'release',
     text:summary||`LiveSuite v${version} release`,
     updateType,
     version,
     pullRequestUrl,
     completed:true,
     page:location.pathname,
     createdAt:stamp(),
     updatedAt:stamp(),
     createdBy:user.uid
    });

    if(makeCurrent)await window.LS26Settings.save({appVersion:version});
    versionDialog.close();
    LS26.toast(`LiveSuite v${version} created · ${assigned} update${assigned===1?'':'s'} assigned.`);
    await load(true);
   }catch(error){
    $('ls26ReleaseStatus').textContent=errorText(error);
   }finally{button.disabled=false;}
  };
  return versionDialog;
 }

 async function openCreateVersion(){
  const dlg=ensureVersionDialog();
  try{await window.LS26Settings?.syncRemoteOncePerSession?.(true);}catch(_){}
  const type='patch';
  $('ls26ReleaseType').value=type;
  $('ls26ReleaseVersion').value=bumpVersion(currentVersion(),type);
  $('ls26ReleasePr').value='';
  $('ls26ReleaseSummary').value='';
  $('ls26ReleaseAssign').checked=true;
  $('ls26ReleaseMakeCurrent').checked=true;
  $('ls26ReleaseStatus').textContent='';
  if(!dlg.open)dlg.showModal();
 }
 window.LS26.openAppUpdates=open;
 if(manage){
  $('appUpdateAdd').onclick=()=>open();
  $('appUpdateCreateVersion').onclick=openCreateVersion;
  ['appUpdateFilter','appUpdateTypeFilter','appUpdateVersionFilter','appUpdateSort'].forEach(id=>{
   const element=$(id);
   if(element)element.onchange=render;
  });
  if($('appUpdateMore'))$('appUpdateMore').onclick=()=>load();
  $('appUpdateRefresh').onclick=()=>load(true);
  auth().onAuthStateChanged(user=>{
   if(user){
    window.LK?.sidebar?.loadSidebar?.();
    $('appUpdateStatus').textContent='';
    load(true);
   }else{
    $('appUpdateRows').replaceChildren();
    $('appUpdateStatus').textContent='Sign in using Admin to manage app updates.';
   }
  });
 }
})();
