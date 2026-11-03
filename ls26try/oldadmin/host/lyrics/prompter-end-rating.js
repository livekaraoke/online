/* Singer's own Live Karaoke experience, separate from LyricView's
 * host-rated crowdResponse. Linked to an existing performanceSessions/
 * performedSongs record: no duplicate performance or listener system.
 * Guest submissions use the pre-existing publicSignupSessions feedback path,
 * with session/performance IDs only (no lyrics or singer identity).
 * Ratings never complete songs or alter session state.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = $('prompterEndRating');
  if (!card || !window.firebase?.firestore) return;

  const db = firebase.firestore();
  const values = {amazing:'Amazing',good:'Good',okay:'Okay',notGreat:'Not great','':'Skipped'};
  let current = null;
  let selected = null;
  let working = false;
  let reachedEnd = false;
  let requestVersion = 0;
  let lastSongKey = '';
  // One voting identity per page/song instance for corrections without
  // overwriting another singer's response. This is not an auth credential.
  let feedbackToken = '';
  let feedbackRevision = 0;
  let savedInSession = false;
  const freshToken = () => (window.crypto?.randomUUID?.() ||
    Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const localKey = () => 'ls26:prompter:feedback:' +
    (current?.sessionId && current?.item?.performanceId
      ? current.sessionId+':'+current.item.performanceId : songKey());
  const saveLocal = (value) => {
    try { sessionStorage.setItem(localKey(), value); }
    catch (_) {}
  };
  const getLocal = () => {
    try { return sessionStorage.getItem(localKey()); }
    catch (_) { return null; }
  };

  const norm = value => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const status = (message,error=false) => {
    const el=$('prompterRatingStatus');
    if(el){el.textContent=message;el.classList.toggle('is-error',error);}
  };
  const buttons = () => {
    // The singer's choice is always available, including on unsigned-in
    // tablets. Session persistence is handled separately from button access.
    const active=!working;
    card.querySelectorAll('[data-prompter-rating]').forEach(button=>{
      button.disabled=!active;
      const chosen=selected!==null&&selected===button.dataset.prompterRating;
      button.classList.toggle('is-selected',chosen);
      button.setAttribute('aria-pressed',String(chosen));
    });
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
    feedbackToken=freshToken();
    feedbackRevision=0;
    savedInSession=false;
    ++requestVersion;
    current=null;
    selected=null;
    buttons();
    status('How was your experience singing with live music?');
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
    if(!song.id){status('Finish singing a song to rate your experience.');return;}
    status('Getting your experience rating ready...');
    try{
      const controlSnap=await db.collection('karaokeControl').doc('currentSession').get();
      if(ticket!==requestVersion)return;
      const control=controlSnap.data()||{};
      const sessionId=String(control.active===true?
        (control.sessionId||control.activeSessionId||''):'');
      if(!sessionId){
        status('You can still rate. Without a recorded session, your choice stays on this device.');
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
        status('Your song is not linked to a recorded performance yet. Ask the host.');
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
      const local = getLocal();
      selected=local!==null && Object.hasOwn(values,local)
        ? local
        : Object.hasOwn(values,String(record.singerExperienceRating))
          ? String(record.singerExperienceRating):null;
      buttons();
      status(selected!==null && selected!=='' ?
        'Your rating: '+values[selected]+'. Thanks for your feedback!' :
        'Choose how the Live Karaoke experience felt to you.');
    }catch(error){
      if(ticket===requestVersion)status('Cannot load tonight’s performance: '+error.message,true);
    }
  }
  async function rate(value){
    if(!Object.hasOwn(values,value)||working) return;
    const key=songKey();
    // Resolve the active performance again if the card loaded before the
    // session was started. No singer Firebase sign-in is required.
    if(!current) await refresh();
    if(key!==songKey()) return;
    if(!current || !['playing','completed'].includes(current.record.status)){
      selected=value;
      saveLocal(value);
      buttons();
      status('Your choice is on this device only. No recorded performance was available to save it to Session History.');
      return;
    }
    if(savedInSession && selected===value){
      status('Your rating is already saved. Thank you!');
      return;
    }
    const info=current, ticket=requestVersion;
    working=true;buttons();status('Saving your experience rating...');
    try{
      const user=typeof firebase.auth==='function' ? firebase.auth().currentUser : null;
      if(user){
        // Authenticated host/performer: retain the canonical performedSongs
        // rating field and do not touch the LyricView crowdResponse field.
        await db.runTransaction(async tx=>{
          const snap=await tx.get(info.ref),data=snap.exists?snap.data()||{}:{};
          if(!snap.exists||!['playing','completed'].includes(data.status)||
              String(data.songId||'')!==info.songId)
            throw new Error('This performance changed before the rating could be saved.');
          tx.update(info.ref,value
            ? {singerExperienceRating:value,
               singerExperienceRatedAt:firebase.firestore.FieldValue.serverTimestamp()}
            : {singerExperienceRating:firebase.firestore.FieldValue.delete(),
               singerExperienceRatedAt:firebase.firestore.FieldValue.delete()});
        });
      }else{
        // Guest tablets are intentionally not allowed to modify private
        // performedSongs. Append a small, anonymous rating linked to the
        // existing session + performance; Session History joins those IDs.
        // Repeated choices use the same token and are deduplicated there.
        const submittedAtMs=Date.now();
        await db.collection('publicSignupSessions').add({
          source:'prompter-singer-experience',
          sessionId:info.sessionId,
          performanceId:String(info.item.performanceId),
          songId:info.songId,
          feedbackToken,
          feedbackRevision:++feedbackRevision,
          rating:value,
          submittedAtMs,
          submittedAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      if(ticket===requestVersion && key===songKey()){
        selected=value;
        savedInSession=true;
        saveLocal(value);
        current.record={...current.record,singerExperienceRating:value};
        status(value
          ? 'Thank you! Your experience rating was saved for this performance.'
          : 'Your rating was cleared. Thank you for singing!');
      }
    }catch(error){
      if(ticket===requestVersion){
        // Keep controls available for another attempt. Never falsely report
        // an unsuccessful network write as saved to the session.
        status('Could not save your rating to tonight’s session. Please tap again. '+error.message,true);
      }
    }finally{working=false;buttons();}
  }

  card.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-prompter-rating]');
    if(button&&card.contains(button)) void rate(button.dataset.prompterRating);
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

  window.addEventListener('ls26:prompter-song-changed',()=>{
    // A second performance of the same song can reuse the song ID, so do not
    // keep the previous performance's rating across an explicit resend.
    if(lastSongKey===songKey()){
      ++requestVersion;
      current=null;selected=null;feedbackToken=freshToken();feedbackRevision=0;savedInSession=false;buttons();
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
