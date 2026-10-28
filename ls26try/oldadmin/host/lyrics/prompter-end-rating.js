/* End-of-song rating in the legacy Prompter.
 * Reads only when the card is reached; uses the existing Run Order,
 * LS26Lifecycle, and performedSongs.crowdResponse. No extra listeners.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('prompterEndRating');
  if (!card || !window.firebase?.firestore) return;

  const db = firebase.firestore();
  const values = {great:'Great response',good:'Good',average:'Average',weak:'Weak','':'Not rated'};
  let current = null;
  let selected = null;
  let working = false;
  let reachedEnd = false;
  let requestVersion = 0;
  let lastSongKey = '';

  const norm = value => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const status = (message,error=false) => {
    const el=$('prompterRatingStatus');
    if(el){el.textContent=message;el.classList.toggle('is-error',error);}
  };
  const buttons = () => {
    const active=Boolean(current?.record?.status==='completed')&&!working;
    card.querySelectorAll('[data-prompter-rating]').forEach(button=>{
      button.disabled=!active;
      const chosen=selected!==null&&selected===button.dataset.prompterRating;
      button.classList.toggle('is-selected',chosen);
      button.setAttribute('aria-pressed',String(chosen));
    });
    const finish=$('prompterCompleteSong');
    if(finish){
      finish.hidden=!(current?.item?.status==='playing'&&current?.record?.status==='playing');
      finish.disabled=working;
    }
  };
  function songDetails(){
    const params=new URLSearchParams(location.search);
    const id=String(params.get('id')||'').trim();
    const modern=params.get('source')==='modern';
    const legacy=(window.songs||[]).find(s=>{
      const found=String(s.url||'').match(/[?&]id=([^&#]+)/);
      if(!found)return false;
      try{return decodeURIComponent(found[1])===id;}catch(_){return found[1]===id;}
    });
    const main=$('songTitle');
    return {
      id,modern,
      title:String(main?.querySelector('.song-main-title')?.textContent||legacy?.title||'').trim(),
      artist:String(main?.querySelector('.song-artist')?.textContent||legacy?.artist||'').trim()
    };
  }
  function songKey(){
    const song=songDetails();
    return [song.modern?'modern':'legacy',song.id].join(':');
  }
  function clearForSong(){
    const key=songKey();
    if(lastSongKey===key)return;
    lastSongKey=key;
    ++requestVersion;
    current=null;
    selected=null;
    buttons();
    status('Rating available for a completed performance in an active session.');
    if(reachedEnd) void refresh();
  }
  function chooseItem(items,song){
    const eligible=items.filter(item=>{
      if(!['playing','played','completed'].includes(item.status)||!item.performanceId)return false;
      if(song.modern)return String(item.songId||'')===song.id;
      if(String(item.songId||'')===song.id)return true;
      return Boolean(song.title&&song.artist&&
        norm(item.songTitle||item.title)===norm(song.title)&&
        norm(item.artist||item.songArtist)===norm(song.artist));
    });
    // Exact active Run Order entry first; otherwise the most recent occurrence
    // of this song. Never use another song's performance ID.
    const playing=eligible.filter(x=>x.status==='playing');
    if(playing.length>1)return null;
    if(playing.length===1)return playing[0];
    eligible.sort((a,b)=>Number(b.playedAtMs||b.playingAtMs||0)-
      Number(a.playedAtMs||a.playingAtMs||0));
    return eligible[0]||null;
  }
  async function refresh(){
    if(!reachedEnd||working)return;
    const ticket=++requestVersion;
    current=null;selected=null;buttons();
    const song=songDetails();
    if(!song.id){status('Load a song to rate its performance.');return;}
    status('Checking tonight’s performance...');
    try{
      const controlSnap=await db.collection('karaokeControl').doc('currentSession').get();
      if(ticket!==requestVersion)return;
      const control=controlSnap.data()||{};
      const sessionId=String(control.active===true?
        (control.sessionId||control.activeSessionId||''):'');
      if(!sessionId){
        status('No active session. Ratings can only be saved to a recorded performance.');
        return;
      }
      if(!firebase.auth?.().currentUser){
        status('Sign in to LiveSuite as the owner on this device to save ratings.');
        return;
      }
      const runSnap=await db.collection('karaokeControl').doc('runOrder').get();
      if(ticket!==requestVersion)return;
      const run=runSnap.data()||{};
      if(String(run.sessionId||'')!==sessionId){
        status('Session and Run Order do not match. Nothing was changed.',true);return;
      }
      const item=chooseItem(run.items||[],song);
      if(!item){
        status('No saved performance for this song tonight. Start the song in LyricView first.');
        return;
      }
      const ref=db.collection('performanceSessions').doc(sessionId)
        .collection('performedSongs').doc(String(item.performanceId));
      const recordSnap=await ref.get();
      if(ticket!==requestVersion)return;
      const record=recordSnap.exists?recordSnap.data()||{}:null;
      if(!record||String(record.songId||'')!==String(item.songId||'')||
          !['playing','completed'].includes(record.status)){
        status('No matching started/completed performance record was found.',true);return;
      }
      current={sessionId,item,ref,record,songId:String(item.songId)};
      selected=Object.hasOwn(values,String(record.crowdResponse))?
        String(record.crowdResponse):null;
      buttons();
      if(record.status==='completed')status(selected!==null?
        'Saved: '+values[selected]:'How did the audience respond? Select a rating.');
      else status('The song is still playing. Complete it to enable rating.');
    }catch(error){
      if(ticket===requestVersion)status('Cannot load tonight’s performance: '+error.message,true);
    }
  }
  async function finish(){
    if(!current||current.item.status!=='playing'||working)return;
    const info=current,ticket=requestVersion;
    if(!window.LS26Lifecycle?.create){
      status('Session completion tools could not load.',true);return;
    }
    working=true;buttons();status('Completing song...');
    try{
      const api=window.LS26Lifecycle.create(db,ms=>firebase.firestore.Timestamp.fromMillis(ms));
      const result=await api.finish({sessionId:info.sessionId,itemId:info.item.id});
      if(ticket!==requestVersion)return;
      if(!result?.completed){
        status('The song was already changed. Refreshing performance...');
        return;
      }
      const saved=await info.ref.get();
      if(ticket!==requestVersion)return;
      if(!saved.exists||saved.data()?.status!=='completed'){
        throw new Error('The completed record could not be verified.');
      }
      current={...info,item:{...info.item,status:'played'},record:saved.data()};
      selected=Object.hasOwn(values,String(saved.data().crowdResponse))?
        String(saved.data().crowdResponse):null;
      status('Song complete. How did the audience respond?');
    }catch(error){
      if(ticket===requestVersion)status('Could not complete song: '+error.message,true);
    }finally{
      working=false;buttons();
    }
  }
  async function rate(value){
    if(!Object.hasOwn(values,value)||!current||current.record.status!=='completed'||working)return;
    const info=current,ticket=requestVersion;
    working=true;buttons();status('Saving rating...');
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(info.ref),data=snap.exists?snap.data()||{}:{};
        if(!snap.exists||data.status!=='completed'||String(data.songId||'')!==info.songId)
          throw new Error('Completed song mismatch. Rating not saved.');
        tx.update(info.ref,{crowdResponse:value||firebase.firestore.FieldValue.delete()});
      });
      if(ticket===requestVersion){
        selected=value;
        current.record={...current.record,crowdResponse:value};
        status('Saved: '+values[value]+'. View it in Session History.');
      }
    }catch(error){
      if(ticket===requestVersion)status('Rating not saved: '+error.message,true);
    }finally{working=false;buttons();}
  }

  card.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-prompter-rating]');
    if(button&&card.contains(button)){void rate(button.dataset.prompterRating);return;}
    if(event.target.closest?.('#prompterCompleteSong'))void finish();
  });
  const guide=$('prompterRatingGuide'),guideButton=$('prompterRatingInfoBtn');
  guideButton?.addEventListener('click',()=>{
    if(!guide?.open){guide?.showModal();guideButton.setAttribute('aria-expanded','true');}
  });
  guide?.addEventListener('close',()=>{
    guideButton?.setAttribute('aria-expanded','false');
    guideButton?.focus({preventScroll:true});
  });
  guide?.addEventListener('click',event=>{if(event.target===guide)guide.close();});

  // Auth persists across LiveSuite pages on the same device. An initial
  // Firebase sign-in restoration can occur after the card becomes visible.
  if(typeof firebase.auth==='function'){
    firebase.auth().onAuthStateChanged(user=>{
      if(user&&reachedEnd&&!current&&!working)void refresh();
    });
  }
  window.addEventListener('ls26:prompter-song-changed',()=>{
    // A second performance of the same song can reuse the song ID, so do not
    // keep the previous performance's rating across an explicit resend.
    if(lastSongKey===songKey()){
      ++requestVersion;
      current=null;selected=null;buttons();
      if(reachedEnd)void refresh();
    }else clearForSong();
  });
  // Check the selected song on startup without any network reads until the
  // card actually enters the viewport, even during long stage sessions.
  clearForSong();
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)){reachedEnd=true;void refresh();}
      else reachedEnd=false;
    },{threshold:0.05});
    observer.observe(card);
  }else{
    window.addEventListener('scroll',()=>{
      if(reachedEnd)return;
      if(card.getBoundingClientRect().top<window.innerHeight){
        reachedEnd=true;void refresh();
      }
    },{passive:true});
  }
})();
