/* Isolated deterministic Firebase double. All external requests are blocked by the runner. */
(() => {
  const inherited=window.parent!==window&&window.parent.__firebaseFixture;
  const docs=inherited?.docs||{
    'karaokeControl/currentSession':{active:true,sessionId:'s',eventId:'e',type:'Live Karaoke',venue:'0 The Test Venue'},
    'performanceSessions/s':{status:'active',type:'Live Karaoke',venue:'0 The Test Venue',actualStartedAt:1},
    'karaoke/state':{songsEnabled:true},
    'karaokeControl/runOrder':{sessionId:'s',items:[{id:'now',status:'playing',songId:'wonderwall',songTitle:'Wonderwall',artist:'Oasis'},{id:'next',status:'queued',songTitle:'Angels',artist:'Robbie Williams'},{id:'two',status:'queued',songTitle:'Let It Be',artist:'The Beatles'},{id:'three',status:'queued',songTitle:'All Summer Long',artist:'Kid Rock'},{id:'bad',status:'cancelled',songTitle:'Cancelled song'}]},
    'karaokeControl/liveKaraokeWebsiteSettings':{defaultBrowseSetlistId:'public',categories:[{id:'90s',label:'90s',subtitle:'1990–1999',enabled:true,mode:'rule',rule:'90s'}]},
    'karaokeControl/publicSongList':{setlistId:'public',setlistName:'Live Karaoke',songCount:3},
    'lyricsSetlists/public':{name:'Live Karaoke',songIds:['wonderwall','zombie','brightside']},
    'lyrics/wonderwall':{title:'Wonderwall',artist:'Oasis',year:1995},
    'lyrics/zombie':{title:'Zombie',artist:'Cranberries, The',year:1994},
    'lyrics/brightside':{title:'Mr Brightside',artist:'Killers, The',year:2004},
    'upcomingEvents/e':{type:'Live Karaoke',venue:'0 The Test Venue',status:'Confirmed',date:'2026-10-22',startTime:'20:00'},
    'upcomingEvents/next':{type:'Live Karaoke',venue:'Whyte Harte',status:'Confirmed',date:'2026-11-04',startTime:'20:00'},
    'upcomingEvents/private':{type:'Live Karaoke',venue:'Private venue',status:'Confirmed',publicVisibility:'private',date:'2026-11-05'},
    'upcomingEvents/tentative':{type:'Live Karaoke',venue:'Tentative venue',status:'Tentative',date:'2026-11-06'},
    'upcomingEvents/old':{type:'Live Karaoke',venue:'Old venue',status:'Confirmed',date:'2025-01-01'},
    'upcomingEvents/other':{type:'Roxanna',venue:'Black Gold',status:'Confirmed',date:'2026-11-07'}
  };
  const listeners=inherited?.listeners||new Map(),counts=inherited?.counts||{},writes=inherited?.writes||[];
  let seq=0;
  function snap(path){return {id:path.split('/').pop(),exists:!!docs[path],data:()=>docs[path]};}
  function query(name,filters=[],limit=Infinity){return {docs:Object.keys(docs).filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(p=>snap(p)).filter(s=>filters.every(([f,op,v])=>{const x=f==='__name__'?s.id:s.data()[f];return op==='=='?x===v:op==='in'?v.includes(x):op==='>='?x>=v:true;})).slice(0,limit)};}
  function watch(key,read,next,error){counts[key]=(counts[key]||0)+1;const listener={read,next,error};if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(listener);queueMicrotask(()=>next(read()));return ()=>{listeners.get(key).delete(listener);counts[key]--;};}
  function update(path,value){docs[path]=value;for(const [key,list] of listeners)if(key===path||key.split('?')[0]===path.split('/')[0])for(const l of list)l.next(l.read());}
  function collection(name,filters=[],max=Infinity){return {where(f,op,v){return collection(name,[...filters,[f,op,v]],max)},orderBy(){return this},limit(n){return collection(name,filters,n)},get:async()=>query(name,filters,max),onSnapshot(next,error){return watch(name+'?'+JSON.stringify(filters),()=>query(name,filters,max),next,error)},doc(id){id=id||'request-'+(++seq);const path=name+'/'+id;return {id,path,get:async()=>snap(path),onSnapshot:(next,error)=>watch(path,()=>snap(path),next,error),set:async(data,options)=>{if(window.top.__writeError)throw Error('offline');writes.push({path,data});update(path,options?.merge?{...docs[path],...data}:data);}}},async add(data){const ref=this.doc();await new Promise(r=>setTimeout(r,40));await ref.set(data);return ref;}};}
  const db={collection,batch(){const ops=[];return {set(ref,data,options){ops.push([ref,data,options])},async commit(){await new Promise(r=>setTimeout(r,40));if(window.top.__writeError)throw Error('offline');for(const [r,d,o]of ops)await r.set(d,o);}}}};
  window.__firebaseFixture={docs,listeners,counts,writes,update,db,fail(path){for(const l of listeners.get(path)||[])l.error?.(Error('offline'))}};
  const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>({seconds:1792627200}),delete:()=>null};firestore.FieldPath={documentId:()=> '__name__'};firestore.Timestamp={fromMillis:n=>({seconds:n/1000})};
  window.firebase={apps:[],initializeApp(options){const app={options};this.apps.push(app);return app},app(){return this.apps[0]},firestore};
})();
