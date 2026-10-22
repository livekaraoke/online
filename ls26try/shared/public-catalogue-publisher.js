/* Spark-only publisher. Source records stay in lyrics/lyricsSetlists.
 * One leader per browser/project; source queries contain selected song IDs only.
 * Nothing starts until the owner enables publicPublication/config.cataloguesEnabled.
 */
(() => {
  'use strict';
  if(window.LS26CataloguePublisher)return;
  const root=new URL('../../',document.currentScript.src);
  const acts=['live-karaoke','billy-lee','roxanna'];
  const settingsId={'live-karaoke':'liveKaraokeWebsiteSettings','billy-lee':'billyLeeWebsiteSettings','roxanna':'roxannaWebsiteSettings'};
  const watchers=new Set();
  const status={enabled:false,leader:false,acts:{},error:''};
  const emit=()=>watchers.forEach(fn=>fn({...status,acts:{...status.acts}}));
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL(src,root);s.onload=resolve;s.onerror=()=>reject(Error('Publication support could not load.'));document.head.append(s);});
  const ready=window.LKCatalogueProjection?Promise.resolve():loadScript('js/public-catalogue-projection.js?v=20261022');
  let db=null,stopLeader=null,releaseLeader=null,configUnsub=null,authUnsub=null,leaderRequested=false;
  const clean=v=>String(v||'').trim();
  function normalAct(d){const t=clean(d.sessionType||d.type).toLowerCase();return ['live karaoke','live-karaoke'].includes(t)?'live-karaoke':['solo','billy lee'].includes(t)?'billy-lee':t==='roxanna'?'roxanna':'';}
  function owner(){return firebase.auth().currentUser?.email?.toLowerCase()==='leeborg23@gmail.com';}
  function createLeader(){
    const unsub=[],states=new Map();
    let control={},list={},settings={},controlReady=false,listReady=false,closed=false;
    for(const act of acts)states.set(act,{id:'',generation:0,listRevision:0,sourceUnsub:null,songUnsubs:[],timer:0,revision:0,writing:false,setlist:null,groups:[],expected:0});
    const report=(act,error,count)=>{status.acts[act]={error:String(error||''),count:count??status.acts[act]?.count??0};emit();};
    async function publish(act,st,generation){
      if(closed||generation!==st.generation||st.groups.filter(Boolean).length!==st.expected)return;
      if(st.writing){st.revision++;return;}
      st.writing=true;const revision=st.revision,listRevision=st.listRevision;
      try{
        const value=LKCatalogueProjection.catalogue(act,st.setlist,st.groups.flat());
        const ref=db.collection('publicSites').doc(act).collection('views').doc('catalogue');
        // Compare under a transaction so identical publications from two host devices
        // cause no extra write. A changed source generation never publishes an old list.
        await db.runTransaction(async tx=>{
          const source=await tx.get(db.collection('lyricsSetlists').doc(st.id));
          const previous=await tx.get(ref);
          const selected=source.exists?source.data():null;
          if(!selected||JSON.stringify([...new Set(selected.songIds||[])])!==JSON.stringify(value.setlist.songIds)||String(selected.name||'')!==value.setlist.name)throw Error('Source setlist changed; waiting for its latest snapshot.');
          if(closed||generation!==st.generation||listRevision!==st.listRevision)throw Error('The selected setlist changed; publication restarted.');
          if(JSON.stringify(previous.data())!==JSON.stringify(value))tx.set(ref,value);
        });
        report(act,'',value.songs.length);
      }catch(error){report(act,error.message);}finally{
        st.writing=false;
        if(!closed&&st.revision!==revision)schedule(act,st,st.generation);
      }
    }
    function schedule(act,st,generation){clearTimeout(st.timer);st.revision++;st.timer=setTimeout(()=>void publish(act,st,generation),150);}
    function watchSetlist(act,id){
      const st=states.get(act);if(st.id===id)return;
      st.sourceUnsub?.();st.songUnsubs.forEach(fn=>fn());st.songUnsubs=[];clearTimeout(st.timer);
      st.id=id;st.generation++;st.groups=[];st.setlist=null;const generation=st.generation;
      if(!id){report(act,'Choose a public repertoire in the existing website settings.');return;}
      st.sourceUnsub=db.collection('lyricsSetlists').doc(id).onSnapshot(snap=>{
        if(closed||generation!==st.generation||snap.metadata?.fromCache)return;
        st.listRevision++;const listRevision=st.listRevision;
        st.songUnsubs.forEach(fn=>fn());st.songUnsubs=[];st.groups=[];st.setlist=snap.exists?{...snap.data(),id:snap.id}:null;
        if(!st.setlist){report(act,'The selected setlist no longer exists.');return;}
        const ids=[...new Set((st.setlist.songIds||[]).filter(x=>typeof x==='string'&&x&&!x.includes('/')))];
        if(ids.length>500){report(act,'Public catalogue limit exceeded; contact support before changing the limit.');return;}
        const chunks=[];for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));st.expected=chunks.length;
        if(!chunks.length)schedule(act,st,generation);
        chunks.forEach((chunk,index)=>st.songUnsubs.push(db.collection('lyrics').where(firebase.firestore.FieldPath.documentId(),'in',chunk).onSnapshot(s=>{
          if(closed||generation!==st.generation||listRevision!==st.listRevision||s.metadata?.fromCache)return;
          st.groups[index]=s.docs.map(d=>({...d.data(),id:d.id}));schedule(act,st,generation);
        },error=>report(act,error.message))));
      },error=>report(act,error.message));
    }
    function choose(){
      if(!controlReady||!listReady)return;
      for(const act of acts){
        if(!settings[act])continue;
        const cfg=settings[act];
        const active=control.active===true&&normalAct(control)===act;
        const id=clean(active?list.setlistId:cfg.defaultBrowseSetlistId||cfg.repertoireSetlistId||(act==='live-karaoke'?list.setlistId:''));
        watchSetlist(act,id);
      }
    }
    function watch(path,fn){const [c,id]=path.split('/');unsub.push(db.collection(c).doc(id).onSnapshot(s=>{if(s.metadata?.fromCache)return;fn(s.exists?s.data():{});choose();},error=>{status.error=error.message;emit();}));}
    watch('karaokeControl/currentSession',d=>{control=d;controlReady=true;});
    watch('karaokeControl/publicSongList',d=>{list=d;listReady=true;});
    for(const act of acts)watch('karaokeControl/'+settingsId[act],d=>{settings[act]=d;});
    return ()=>{closed=true;unsub.forEach(fn=>fn());for(const st of states.values()){clearTimeout(st.timer);st.sourceUnsub?.();st.songUnsubs.forEach(fn=>fn());}};
  }
  async function startLeader(){
    if(leaderRequested)return;leaderRequested=true;
    await ready;
    const work=async()=>{
      if(!owner()||!status.enabled)return;
      status.leader=true;emit();stopLeader=createLeader();
      await new Promise(resolve=>{releaseLeader=resolve;});
      stopLeader?.();stopLeader=null;status.leader=false;emit();
    };
    try{
      if(navigator.locks)await navigator.locks.request('ls26-public-catalogue-'+firebase.app().options.projectId,work);
      else await work(); // Transactional equality prevents duplicate writes on browsers without Web Locks.
    }catch(error){status.error=error.message;emit();}finally{leaderRequested=false;}
  }
  function stop(){releaseLeader?.();releaseLeader=null;stopLeader?.();stopLeader=null;}
  function init(){
    if(!window.firebase?.auth||!firebase.apps?.length)return;
    db=firebase.firestore();
    authUnsub=firebase.auth().onAuthStateChanged(user=>{
      configUnsub?.();configUnsub=null;stop();status.enabled=false;
      if(user?.email?.toLowerCase()!=='leeborg23@gmail.com'){emit();return;}
      configUnsub=db.collection('publicPublication').doc('config').onSnapshot(s=>{
        status.enabled=s.exists&&s.data().cataloguesEnabled===true;emit();
        if(status.enabled)void startLeader();else stop();
      },error=>{status.error=error.message;emit();});
    });
  }
  window.LS26CataloguePublisher=Object.freeze({
    subscribe(fn){watchers.add(fn);fn(status);return()=>watchers.delete(fn);},
    async enable(){if(!owner())throw Error('Sign in as the owner first.');await ready;await db.collection('publicPublication').doc('config').set({cataloguesEnabled:true},{merge:true});},
    async disable(){if(!owner())throw Error('Sign in as the owner first.');await db.collection('publicPublication').doc('config').set({cataloguesEnabled:false},{merge:true});}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  addEventListener('pagehide',()=>{stop();configUnsub?.();authUnsub?.();},{once:true});
})();
