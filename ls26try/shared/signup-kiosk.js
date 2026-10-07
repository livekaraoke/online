/* Physical kiosk configuration belongs to Requests. No additional listeners.
 * Guest UI/protocol is standalone at /signup/. Owner saves publish a snapshot. */
(() => {
  'use strict';
  const policy=window.LKSignupPolicy||{};
  const ownerEmail='leeborg23@gmail.com'; // Same existing owner predicate as admin-new/js/firebase.js.
  const db=()=>window.db||window.LK?.db;
  const ref=path=>db().doc(path);
  const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const data=snap=>snap.exists?snap.data():null;
  const checkId=id=>typeof id==='string'&&id.length>0&&id.length<=256&&!id.includes('/');
  const esc=value=>LS26.escape(value);
  let loaded=null,lists=[],busy=false;
  async function requireOwner(){
    if(policy.rulesVerified!==true)throw Error('Secure kiosk rules need verification before activation. See the kiosk setup guide.');
    if(firebase.app().options.projectId!==policy.projectId)throw Error('Kiosk and LiveSuite must use the same Firebase project.');
    const auth=window.auth||window.LK?.auth,user=auth?.currentUser;
    if(!user)throw Error('Sign in as the LiveSuite owner in Admin, then reopen Requests.');
    const result=await user.getIdTokenResult();
    if(result.claims.email!==ownerEmail)throw Error('Only the existing LiveSuite owner can configure this kiosk.');
  }
  function token(){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  }
  function projectSongs(documents){
    const songs={};
    for(const doc of documents){
      const value=doc.data();
      if(!value||value.publicSongListVisible===false)continue;
      const title=String(value.title||'').trim(),artist=ArtistNames.display(value.artist||'');
      if(!title)continue;
      if(!checkId(doc.id)||title.length>240||artist.length>240)throw Error('A song has an unusually long ID/title/artist. Please shorten it before publishing.');
      Object.defineProperty(songs,doc.id,{value:{title,artist},enumerable:true,writable:true,configurable:true});
    }
    if(!Object.keys(songs).length)throw Error('This setlist has no public songs with titles.');
    return songs;
  }
  async function publish({setlistId,displayTitle,rotate=false,enabled=true,expectedRevision}){
    await requireOwner();
    if(!checkId(setlistId))throw Error('Choose a setlist.');
    const listRef=ref('lyricsSetlists/'+setlistId),listSnap=await listRef.get(),list=data(listSnap);
    if(!list||!Array.isArray(list.songIds))throw Error('The selected setlist no longer exists.');
    const ids=[...new Set(list.songIds)];
    if(!ids.length||ids.length>500||ids.some(id=>!checkId(id)))throw Error('Choose a setlist containing 1–500 valid song IDs.');
    const docs=[];
    // Bounded batches; only this list is read, never the full lyrics collection.
    for(let i=0;i<ids.length;i+=10){
      const batch=await db().collection('lyrics').where(firebase.firestore.FieldPath.documentId(),'in',ids.slice(i,i+10)).get();
      docs.push(...batch.docs);
    }
    if(docs.length!==ids.length)throw Error('Some setlist songs are missing. Fix the setlist before publishing.');
    const songs=projectSongs(docs),revision=token(),candidateToken=token();
    let result;
    await db().runTransaction(async tx=>{
      const config=data(await tx.get(ref('signupKioskAdmin/control')));
      const current=data(await tx.get(ref('karaokeControl/currentSession')))||{};
      const latestList=data(await tx.get(listRef));
      const gate=data(await tx.get(ref('karaoke/state')))||{};
      if((config?.revision||'')!==(expectedRevision||''))throw Error('Another host changed the kiosk. Reload configuration before saving.');
      if(!current.active||!checkId(current.sessionId||current.activeSessionId))throw Error('Start an active performance session first.');
      if(enabled&&gate.songsEnabled!==true)throw Error('Open song requests in the session controls first.');
      if(JSON.stringify(latestList?.songIds)!==JSON.stringify(list.songIds))throw Error('The setlist changed while loading. Please try again.');
      const kioskToken=!rotate&&/^[a-f0-9]{64}$/.test(config?.token||'')?config.token:candidateToken;
      result={schemaVersion:1,enabled:enabled===true,token:kioskToken,revision,sessionId:current.sessionId||current.activeSessionId,
        setlistId,setlistName:String(latestList.name||'').slice(0,160),venue:String(current.venue||'').slice(0,160),
        displayTitle:String(displayTitle||'').trim().slice(0,100),updatedAt:stamp()};
      const view={...result,songs};delete view.token;
      tx.set(ref('signupKioskAdmin/control'),result);
      tx.set(ref('signupKioskViews/'+kioskToken),view);
      // Old views remain inaccessible after rotation; no destructive cleanup.
    });
    return result;
  }
  async function disable(expectedRevision){
    await requireOwner();
    return db().runTransaction(async tx=>{
      const config=data(await tx.get(ref('signupKioskAdmin/control')));
      if(!config)return null;
      if(config.revision!==expectedRevision)throw Error('Another host changed the kiosk. Reload configuration first.');
      const next={...config,enabled:false,revision:token(),updatedAt:stamp()};
      tx.set(ref('signupKioskAdmin/control'),next);
      tx.set(ref('signupKioskViews/'+config.token),{enabled:false,revision:next.revision,updatedAt:stamp()},{merge:true});
      return next;
    });
  }
  // Stable base captured while this script executes, independent of async calls.
  const publicPage=new URL('../../signup/sign%20up.html',document.currentScript.src).href;
  function renderAvailability(){
    const state=document.getElementById('kioskState');if(!state)return;
    const sessionId=window.LK?.sessionTools?.getSessionId?.(),open=window.LK?.topStatus?.getRequestsEnabled?.();
    state.textContent=loaded?.enabled&&sessionId===loaded.sessionId&&open===true?'ACTIVE':loaded?.enabled?'DISABLED — session ended/changed or requests closed':'DISABLED';
  }
  function renderConfig(){
    const $=id=>document.getElementById(id);
    renderAvailability();
    $('kioskList').innerHTML=lists.map(row=>`<option value="${esc(row.id)}">${esc(row.name||row.id)}</option>`).join('');
    $('kioskList').value=loaded?.setlistId||window.LK?.sessionTools?.getPublicList?.()?.setlistId||lists[0]?.id||'';
    $('kioskDisplayTitle').value=loaded?.displayTitle||'';
    $('kioskSession').textContent=loaded?.sessionId?`${loaded.venue||'Current venue'} · Session ${loaded.sessionId}`:'Derived from your active session when enabled.';
    $('kioskUrl').textContent=loaded?.token?publicPage+'?k='+loaded.token:'Enable the kiosk to generate its private link.';
    $('kioskUrl').href=loaded?.token?publicPage+'?k='+loaded.token:'#';
    $('kioskUrl').hidden=!loaded?.token;
    $('kioskDisable').disabled=!loaded||!loaded.enabled||busy;
    $('kioskRotate').disabled=!loaded?.token||busy;
  }
  async function loadConfig(){
    await requireOwner();
    const [configSnap,listSnap]=await Promise.all([ref('signupKioskAdmin/control').get(),db().collection('lyricsSetlists').get()]);
    loaded=data(configSnap);lists=listSnap.docs.map(doc=>({...doc.data(),id:doc.id}));renderConfig();
  }
  function mount(){
    const button=document.getElementById('openSignupKiosk'),panel=document.getElementById('signupKioskPanel');
    if(!button||!panel)return;
    const $=id=>document.getElementById(id),status=message=>{$('kioskMessage').textContent=message;};
    button.onclick=async()=>{
      panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)return;
      if(policy.rulesVerified!==true){status('SETUP REQUIRED: kiosk activation is locked until the narrow Firestore rules are deployed and verified. No public submissions are enabled.');panel.querySelector('fieldset').disabled=true;return;}
      status('Loading kiosk configuration…');
      try{await loadConfig();status('Choose a setlist and enable the kiosk. Song list updates reach the iPad within 60 seconds.');}catch(error){status(error.message);}
    };
    async function run(action){
      if(busy)return;busy=true;panel.querySelector('fieldset').disabled=true;
      try{
        if(action==='reload'){await loadConfig();status('Configuration reloaded.');return;}
        if(action==='rotate'&&!await LS26Dialogs.confirm('Rotate the kiosk link? The old link will stop working. Reopen the new link on the iPad.'))return;
        if(action==='disable')loaded=await disable(loaded?.revision);
        else loaded=await publish({setlistId:$('kioskList').value,displayTitle:$('kioskDisplayTitle').value,rotate:action==='rotate',enabled:action==='rotate'?loaded?.enabled===true:true,expectedRevision:loaded?.revision});
        status(action==='disable'?'Kiosk disabled. No further requests will be accepted.':'Kiosk published. Open the private link on the iPad.');renderConfig();
      }catch(error){status(error.message);}finally{busy=false;panel.querySelector('fieldset').disabled=false;renderButtons();}
    }
    function renderButtons(){ $('kioskDisable').disabled=!loaded?.enabled; $('kioskRotate').disabled=!loaded?.token; }
    $('kioskEnable').onclick=()=>run('enable');$('kioskDisable').onclick=()=>run('disable');$('kioskRotate').onclick=()=>run('rotate');$('kioskReload').onclick=()=>run('reload');
    window.addEventListener('ls26:requests-gate',renderAvailability);
    window.addEventListener('lk:session-updated',()=>{
      renderAvailability();
      if(!panel.hidden&&loaded)status('Session state changed. Re-enable/publish to bind the kiosk to the current session. The server rejects requests for an ended or different session.');
    });
  }
  window.LS26SignupKiosk={publish,disable,projectSongs};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
