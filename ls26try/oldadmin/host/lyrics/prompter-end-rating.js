/* Singer's own Live Karaoke experience, separate from LyricView's
 * host-rated crowdResponse. Linked to an existing performanceSessions/
 * performedSongs record: no duplicate performance or listener system.
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

  const norm = value => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const status = (message,error=false) => {
    const el=$('prompterRatingStatus');
    if(el){el.textContent=message;el.classList.toggle('is-error',error);}
  };
  const buttons = () => {
    const active=Boolean(current && ['playing','completed'].includes(current.record?.status))&&!working;
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
        status('This rating is available when singing at an active Live Karaoke session.');
        return;
      }
      if(!firebase.auth?.().currentUser){
        status('Ask the host to enable rating on this device.');
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
      selected=Object.hasOwn(values,String(record.singerExperienceRating))?
        String(record.singerExperienceRating):null;
      buttons();
      status(selected!==null && selected!=='' ?
        'Your rating: '+values[selected]+'. Thanks for your feedback!' :
        'Choose how the Live Karaoke experience felt to you.');
    }catch(error){
      if(ticket===requestVersion)status('Cannot load tonight’s performance: '+error.message,true);
    }
  }
  async function rate(value){
    if(!Object.hasOwn(values,value)||!current||
      !['playing','completed'].includes(current.record.status)||working)return;
    if(selected===value){status(value ? 'Thanks! Your rating is saved.' :
      'No rating selected.');return;}
    const info=current,ticket=requestVersion;
    working=true;buttons();status('Saving rating...');
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(info.ref),data=snap.exists?snap.data()||{}:{};
        if(!snap.exists||!['playing','completed'].includes(data.status)||
            String(data.songId||'')!==info.songId)
          throw new Error('This performance was changed. Your rating was not saved.');
        const fields = value
          ? {singerExperienceRating:value,
             singerExperienceRatedAt:firebase.firestore.FieldValue.serverTimestamp()}
          : {singerExperienceRating:firebase.firestore.FieldValue.delete(),
             singerExperienceRatedAt:firebase.firestore.FieldValue.delete()};
        // Deliberately do NOT update crowdResponse: that belongs to LyricView.
        tx.update(info.ref,fields);
      });
      if(ticket===requestVersion){
        selected=value;
        current.record={...current.record,singerExperienceRating:value};
        status(value ? 'Thank you! Your experience rating was saved.' :
          'Your rating was cleared. Thank you for singing!');
      }
    }catch(error){
      if(ticket===requestVersion)status('Sorry, your rating could not be saved: '+error.message,true);
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
