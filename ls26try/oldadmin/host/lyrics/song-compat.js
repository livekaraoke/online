(() => {
  'use strict';
  if(!/\/ls26try\/oldadmin\/host\/lyrics\/song(?:\.html)?\/?$/i.test(location.pathname))return;

  const normalize=value=>String(value||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');

  function legacyEntries(){
    return (Array.isArray(window.songs)?window.songs:[])
      .map(song=>{
        const url=String(song?.url||'');
        const match=url.match(/[?&]id=([^&#]+)/i);
        let urlId='';
        if(match){
          try{urlId=decodeURIComponent(match[1]);}catch(_){urlId=match[1];}
        }
        const id=String(urlId||song?.id||'').trim();
        return {
          id,
          title:String(song?.title||'').trim(),
          artist:String(song?.artist||'').trim(),
          song
        };
      })
      .filter(entry=>entry.id);
  }

  function metadataValue(meta,...keys){
    for(const key of keys){
      const value=meta?.[key];
      if(value!=null&&String(value).trim())return String(value).trim();
    }
    return '';
  }

  function resolveLegacySync(rawId,meta={}){
    const raw=String(rawId||'').trim();
    const entries=legacyEntries();
    if(!raw||!entries.length)return '';

    const savedId=metadataValue(meta,'karaokeLyrics','karaokeId','legacyId');
    const candidates=[savedId,raw].filter(Boolean);
    for(const candidate of candidates){
      const wanted=normalize(candidate);
      const exact=entries.find(entry=>normalize(entry.id)===wanted);
      if(exact)return exact.id;
    }

    const title=metadataValue(meta,'songTitle','title') || metadataValue(meta?.song,'title');
    const artist=metadataValue(meta,'songArtist','artist') || metadataValue(meta?.song,'artist');

    if(title){
      const titleKey=normalize(title);
      const artistKey=normalize(artist);
      const metadataMatch=entries.find(entry=>
        normalize(entry.title)===titleKey &&
        (!artistKey||normalize(entry.artist)===artistKey)
      );
      if(metadataMatch)return metadataMatch.id;

      const titleMatches=entries.filter(entry=>normalize(entry.title)===titleKey);
      if(titleMatches.length===1)return titleMatches[0].id;
    }

    const rawKey=normalize(raw);
    const combined=entries.find(entry=>normalize(entry.title+entry.artist)===rawKey);
    if(combined)return combined.id;

    const titleOnly=entries.filter(entry=>normalize(entry.title)===rawKey);
    if(titleOnly.length===1)return titleOnly[0].id;

    return '';
  }

  async function resolveLegacyId(rawId,meta={}){
    const direct=resolveLegacySync(rawId,meta);
    if(direct)return direct;

    const raw=String(rawId||'').trim();
    if(!raw||!window.firebase?.firestore)return raw;

    try{
      const snap=await firebase.firestore().collection('lyrics').doc(raw).get();
      if(snap.exists){
        const resolved=resolveLegacySync(raw,snap.data()||{});
        if(resolved)return resolved;
      }
    }catch(error){
      console.warn('Legacy lyrics ID lookup failed:',error);
    }

    return raw;
  }

  function replaceCurrentId(id){
    const url=new URL(location.href);
    url.searchParams.set('id',id);
    history.replaceState(null,'',url.href);
  }

  const start=()=>{
    const originalLoadSong=window.loadSong;

    if(typeof originalLoadSong==='function'){
      let loading=false;
      window.loadSong=async function(){
        if(loading)return;
        loading=true;
        try{
          const rawId=new URLSearchParams(location.search).get('id')||'';
          const resolved=await resolveLegacyId(rawId);
          if(resolved&&resolved!==rawId){
            console.info('Mapped LiveSuite song ID to legacy lyrics ID:',rawId,'→',resolved);
            replaceCurrentId(resolved);
          }
          originalLoadSong();
        }finally{
          loading=false;
        }
      };
    }

    try{window.stopSlaveLyrics?.();}catch(_){}
    let compatUnsubscribe=null;
    let resolutionToken=0;
    const originalStopSlave=window.stopSlaveLyrics;

    window.stopSlaveLyrics=function(){
      resolutionToken++;
      if(compatUnsubscribe){
        compatUnsubscribe();
        compatUnsubscribe=null;
      }
      try{originalStopSlave?.();}catch(_){}
    };

    window.startSlaveLyrics=function(){
      if(compatUnsubscribe||!window.firebase?.firestore)return;
      compatUnsubscribe=firebase.firestore()
        .collection('karaokeControl')
        .doc('liveLyrics')
        .onSnapshot(async snap=>{
          if(!snap.exists)return;
          const data=snap.data()||{};
          const remoteId=String(
            // Manual SEND LYRICS can update currentSongId while the modern field is stale.
            data.currentSongId||
            data.currentLyricsSongId||
            data.songId||
            ''
          ).trim();
          if(!remoteId)return;

          const token=++resolutionToken;
          const resolved=await resolveLegacyId(remoteId,data.song||data);
          if(token!==resolutionToken||!resolved)return;

          const currentRaw=new URLSearchParams(location.search).get('id')||'';
          const currentResolved=resolveLegacySync(currentRaw)||currentRaw;
          if(normalize(resolved)===normalize(currentResolved))return;

          const url=new URL(location.href);
          url.searchParams.set('id',resolved);
          url.searchParams.set('slave','1');
          location.href=url.href;
        },error=>console.warn('Slave Lyrics sync failed:',error));
    };

    const slaveToggle=document.getElementById('slaveLyricsToggle');
    if(slaveToggle?.checked)window.startSlaveLyrics();
  };

  // Initialize before the original DOMContentLoaded handler loads a file.
  if(document.getElementById('slaveLyricsToggle')&&typeof window.loadSong==='function'){
    start();
  }else if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();