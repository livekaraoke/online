/* Live tempo is separate from song metadata. Writes only to an attached performed-song record. */
(() => {
  'use strict';
  function create({song,storage,key,onChange=()=>{},onError=()=>{}}) {
    const valid=value=>Number.isFinite(Number(value))&&Number(value)>0;
    const clamp=value=>Math.max(1,Math.min(400,Math.round(Number(value))));
    let current=clamp([song.userBpm,song.originalBpm,song.bpm,96].find(valid));
    try{const saved=storage?.getItem(key);if(valid(saved))current=clamp(saved);}catch(_){}
    let ref=null,savedBpm=null,work=Promise.resolve(true),timer=null;
    function flush(){
      clearTimeout(timer);timer=null;
      if(!ref)return work;
      work=work.then(async()=>{
        const bpm=current;
        if(savedBpm===bpm)return true;
        try{await ref.set({performanceBpm:bpm},{merge:true});savedBpm=bpm;return true;}
        catch(error){onError(error);return false;}
      });
      return work;
    }
    return {
      get:()=>current,
      set(value){
        if(!valid(value))return current;
        current=clamp(value);
        try{storage?.setItem(key,String(current));}catch(_){}
        onChange(current);
        if(ref){clearTimeout(timer);timer=setTimeout(flush,400);}
        return current;
      },
      attach(recordRef,initialBpm){ref=recordRef;savedBpm=initialBpm;return flush();},
      flush
    };
  }
  if(typeof module==='object'&&module.exports)module.exports={create};
  else window.LS26PerformanceTempo={create};
})();

/* LyricView-only follow-card polish, dynamic meter and inline marker support. */
if (typeof document !== 'undefined' && /\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) {
  const load=(src,onload)=>{const script=document.createElement('script');script.src=src;script.async=false;if(onload)script.addEventListener('load',onload,{once:true});(document.head||document.documentElement).appendChild(script);};
  load('../shared/lyricview-follow-polish.js?v=20261006-follow-polish-v1',()=>{
    load('../shared/lyricview-follow-refinements-v2.js?v=20261006-follow-refinements-v3',()=>{
      load('../shared/lyricview-improv-timeline-sync-v2.js?v=20261006-improv-timeline-v2',()=>{
        load('../shared/lyricview-inline-markers-v1.js?v=20261006-inline-markers-v1');
      });
    });
  });
}
