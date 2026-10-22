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
  const status={enabled:false,liveEnabled:false,leader:false,acts:{},error:'',liveError:''};
  const emit=()=>watchers.forEach(fn=>fn({...status,acts:{...status.acts}}));
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL(src,root);s.onload=resolve;s.onerror=()=>reject(Error('Publication support could not load.'));document.head.append(s);});
  const ready=(async()=>{
    if(!window.LKCatalogueProjection)await loadScript('js/public-catalogue-projection.js?v=20261022-views');
    if(!window.LKPublicVisibility)await loadScript('js/public-visibility.js?v=20261022-views');
    if(!window.LKEventTime)await loadScript('js/public-event-time.js?v=20261022-public');
    if(!window.LKLiveProjection)await loadScript('js/public-live-projection.js?v=20261022-views');
    if(!window.LS26CreateLivePublisher)await loadScript('ls26try/shared/public-live-publisher.js?v=20261022-views');
  })();
  let db=null,stopLeader=null,releaseLeader=null,configUnsub=null,authUnsub=null,leaderRequested=false,restartRequested=false;
  const clean=v=>String(v||'').trim();
  function normalAct(d){const t=clean(d.sessionType||d.type).toLowerCase();return ['live karaoke','live-karaoke'].includes(t)?'live-karaoke':['solo','billy lee'].includes(t)?'billy-lee':t==='roxanna'?'roxanna':'';}
  function owner(){return firebase.auth().currentUser?.email?.toLowerCase()==='leeborg23@gmail.com';}
  function createLeader(){
    const unsub=[],states=new Map(),documents=new Map(),sourceErrors=new Set();
    // Catalogue and live publishers share source document listeners in this tab.
    function sharedWatch(path,fn,error){
      let entry=documents.get(path);
      if(!entry){
        entry={subscribers:new Set(),value:null,exists:false};documents.set(path,entry);
        const [c,id]=path.split('/');
        entry.off=db.collection(c).doc(id).onSnapshot({includeMetadataChanges:true},s=>{
          if(s.metadata?.fromCache||s.metadata?.hasPendingWrites){sourceErrors.add(path);entry.value=null;for(const observer of entry.subscribers)observer.error(Error('Waiting for the source connection.'));return;}
          sourceErrors.delete(path);entry.value=s.exists?s.data():{};entry.exists=s.exists;
          for(const observer of entry.subscribers)observer.fn(entry.value,entry.exists);
        },e=>{sourceErrors.add(path);for(const observer of entry.subscribers)observer.error(e);});
      }
      const observer={fn,error};entry.subscribers.add(observer);
      if(entry.value)fn(entry.value,entry.exists);
      return ()=>{entry.subscribers.delete(observer);if(!entry.subscribers.size){entry.off();documents.delete(path);sourceErrors.delete(path);}};
    }
    const stopLive=status.liveEnabled?LS26CreateLivePublisher({db,watch:sharedWatch,report:error=>{status.liveError=error;emit();}}):null;
    let control={},list={},settings={},controlReady=false,listReady=false,closed=false;
    for(const act of acts)states.set(act,{id:'',generation:0,listRevision:0,sourceUnsub:null,songUnsubs:[],timer:0,revision:0,writing:false,setlist:null,groups:[],expected:0});
    const report=(act,error,count)=>{status.acts[act]={error:String(error||''),count:count??status.acts[act]?.count??0};emit();};
    async function publish(act,st,generation){
      if(closed||sourceErrors.size||generation!==st.generation||st.groups.filter(Boolean).length!==st.expected)return;
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
          if(!LKCatalogueProjection.equal(previous.data(),value))tx.set(ref,value);
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
      st.sourceUnsub=db.collection('lyricsSetlists').doc(id).onSnapshot({includeMetadataChanges:true},snap=>{
        if(closed||generation!==st.generation)return;
        if(snap.metadata?.fromCache||snap.metadata?.hasPendingWrites){st.groups=[];st.setlist=null;report(act,'Waiting for the repertoire connection.');return;}
        st.listRevision++;const listRevision=st.listRevision;
        st.songUnsubs.forEach(fn=>fn());st.songUnsubs=[];st.groups=[];st.setlist=snap.exists?{...snap.data(),id:snap.id}:null;
        if(!st.setlist){report(act,'The selected setlist no longer exists.');return;}
        const ids=[...new Set((st.setlist.songIds||[]).filter(x=>typeof x==='string'&&x&&!x.includes('/')))];
        if(ids.length>500){report(act,'Public catalogue limit exceeded; contact support before changing the limit.');return;}
        const chunks=[];for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));st.expected=chunks.length;
        if(!chunks.length)schedule(act,st,generation);
        chunks.forEach((chunk,index)=>st.songUnsubs.push(db.collection('lyrics').where(firebase.firestore.FieldPath.documentId(),'in',chunk).onSnapshot({includeMetadataChanges:true},s=>{
          if(closed||generation!==st.generation||listRevision!==st.listRevision)return;
          if(s.metadata?.fromCache||s.metadata?.hasPendingWrites){st.groups[index]=null;report(act,'Waiting for the song connection.');return;}
          st.groups[index]=s.docs.map(d=>({...d.data(),id:d.id}));schedule(act,st,generation);
        },error=>report(act,error.message))));
      },error=>report(act,error.message));
    }
    function choose(){
      if(!status.enabled||!controlReady||!listReady)return;
      for(const act of acts){
        if(!settings[act])continue;
        const cfg=settings[act];
        const active=control.active===true&&normalAct(control)===act;
        const id=clean(active&&act!=='roxanna'?list.setlistId:cfg.defaultBrowseSetlistId||cfg.repertoireSetlistId||'');
        watchSetlist(act,id);
      }
    }
    function watch(path,fn){unsub.push(sharedWatch(path,d=>{fn(d);choose();},error=>{status.error=error.message;emit();}));}
    if(status.enabled){
    watch('karaokeControl/currentSession',d=>{control=d;controlReady=true;});
    watch('karaokeControl/publicSongList',d=>{list=d;listReady=true;});
    for(const act of acts)watch('karaokeControl/'+settingsId[act],d=>{settings[act]=d;});
    }
    return ()=>{closed=true;stopLive?.();unsub.forEach(fn=>fn());for(const st of states.values()){clearTimeout(st.timer);st.sourceUnsub?.();st.songUnsubs.forEach(fn=>fn());}};
  }
  async function startLeader(){
    if(leaderRequested)return;leaderRequested=true;
    const work=async()=>{
      restartRequested=false;
      if(!owner()||(!status.enabled&&!status.liveEnabled))return;
      status.leader=true;emit();stopLeader=createLeader();
      await new Promise(resolve=>{releaseLeader=resolve;});
      stopLeader?.();stopLeader=null;status.leader=false;emit();
    };
    try{
      await ready;
      if(navigator.locks)await navigator.locks.request('ls26-public-catalogue-'+firebase.app().options.projectId,work);
      else await work(); // Transactional equality prevents duplicate writes on browsers without Web Locks.
    }catch(error){status.error=error.message;emit();}finally{leaderRequested=false;if(restartRequested&&owner()&&(status.enabled||status.liveEnabled))void startLeader();}
  }
  function stop(){releaseLeader?.();releaseLeader=null;stopLeader?.();stopLeader=null;}
  function init(){
    if(!window.firebase?.auth||!firebase.apps?.length)return;
    db=firebase.firestore();
    authUnsub=firebase.auth().onAuthStateChanged(user=>{
      configUnsub?.();configUnsub=null;status.enabled=false;status.liveEnabled=false;stop();
      if(user?.email?.toLowerCase()!=='leeborg23@gmail.com'){emit();return;}
      configUnsub=db.collection('publicPublication').doc('config').onSnapshot(s=>{
        const enabled=s.exists&&s.data().cataloguesEnabled===true,liveEnabled=s.exists&&s.data().liveEnabled===true;
        const changed=enabled!==status.enabled||liveEnabled!==status.liveEnabled;
        status.enabled=enabled;status.liveEnabled=liveEnabled;emit();
        if(changed){restartRequested=leaderRequested;stop();}
        if(enabled||liveEnabled)void startLeader();
      },error=>{status.error=error.message;emit();});
    });
  }
  window.LS26CataloguePublisher=Object.freeze({
    subscribe(fn){watchers.add(fn);fn(status);return()=>watchers.delete(fn);},
    async enable(){if(!owner())throw Error('Sign in as the owner first.');await ready;await db.collection('publicPublication').doc('config').set({cataloguesEnabled:true},{merge:true});},
    async enableLive(){if(!owner())throw Error('Sign in as the owner first.');await ready;await db.collection('publicPublication').doc('config').set({liveEnabled:true},{merge:true});},
    async disableLive(){if(!owner())throw Error('Sign in as the owner first.');await db.collection('publicPublication').doc('config').set({liveEnabled:false},{merge:true});},
    async disable(){if(!owner())throw Error('Sign in as the owner first.');await db.collection('publicPublication').doc('config').set({cataloguesEnabled:false},{merge:true});}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  addEventListener('pagehide',()=>{status.enabled=false;status.liveEnabled=false;stop();configUnsub?.();authUnsub?.();},{once:true});
})();
