const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const projection=require('../../js/public-catalogue-projection.js');
const source=fs.readFileSync(path.join(__dirname,'../../ls26try/shared/public-catalogue-publisher.js'),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,220));
function fixture(email='leeborg23@gmail.com'){
 const records={'publicPublication/config':{cataloguesEnabled:false},'karaokeControl/currentSession':{active:false},'karaokeControl/publicSongList':{setlistId:'lk'},'karaokeControl/liveKaraokeWebsiteSettings':{defaultBrowseSetlistId:'lk'},'karaokeControl/billyLeeWebsiteSettings':{defaultBrowseSetlistId:'solo'},'karaokeControl/roxannaWebsiteSettings':{defaultBrowseSetlistId:'rox'},'lyricsSetlists/lk':{name:'Live Karaoke',songIds:['a']},'lyricsSetlists/solo':{name:'Solo',songIds:['b']},'lyricsSetlists/rox':{name:'Roxanna',songIds:['c']},'lyrics/a':{title:'Alpha',artist:'A',lyrics:'PRIVATE'},'lyrics/b':{title:'Bravo',artist:'B',hostNote:'PRIVATE'},'lyrics/c':{title:'Charlie',artist:'C',timing:'PRIVATE'}};
 Object.assign(records,{'karaoke/state':{songsEnabled:true},'karaokeControl/runOrder':{sessionId:'gig',items:[{songId:'a',status:'playing',songTitle:'Alpha',note:'PRIVATE'}]},'performanceSessions/gig':{status:'active',actualStartedAt:1},'upcomingEvents/event':{type:'Live Karaoke',status:'Confirmed',date:'2026-11-04',startTime:'20:00',venue:'Whyte Harte',contact:'PRIVATE'},'publicSongRequests/request':{sessionId:'gig',songId:'a',status:'active',singerName:'PRIVATE'}});
 const listeners=new Set(),writes=[],transactionReads=[],events={};
 const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'&&!v.toMillis?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 const snap=p=>({id:p.split('/').pop(),exists:!!records[p],data:()=>p.startsWith('publicSites/')?sorted(records[p]):records[p],metadata:{fromCache:false}});
 const read=(p,query)=>query?{docs:Object.keys(records).filter(key=>key.startsWith(p+'/')&&key.split('/').length===p.split('/').length+1).map(snap).filter(s=>query.filters.every(([f,op,v])=>{const x=f==='__name__'?s.id:s.data()[f];return op==='in'?v.includes(x):op==='=='?x===v:op==='>='?x>=v:true;})).slice(0,query.limit),metadata:{fromCache:false}}:snap(p);
 function update(p,d){records[p]=d;for(const l of [...listeners])if(l.p===p||(l.ids&&p.startsWith(l.p+'/')))l.fn(read(l.p,l.ids));}
 function ref(p,ids){return{path:p,id:p.split('/').pop(),collection:n=>ref(p+'/'+n),doc:n=>ref(p+'/'+n),where:(f,op,v)=>ref(p,{filters:[...(ids?.filters||[]),[f,op,v]],limit:ids?.limit||Infinity}),orderBy:()=>ref(p,ids),limit:n=>ref(p,{filters:ids?.filters||[],limit:n}),get:async()=>read(p,ids),set:async(d,o)=>{writes.push(p);update(p,o?.merge?{...records[p],...d}:d);},onSnapshot(options,next){const fn=typeof options==='function'?options:next;const l={p,ids,fn};listeners.add(l);queueMicrotask(()=>fn(read(p,ids)));return()=>listeners.delete(l);}};}
 const db={collection:n=>ref(n),runTransaction:async fn=>fn({get:r=>{transactionReads.push(r.path);return r.get();},set:(r,d)=>r.set(d),update:(r,d)=>r.set(d,{merge:true})})};
 const user={email},auth={currentUser:user,onAuthStateChanged(fn){queueMicrotask(()=>fn(user));return()=>{};}};
 const firestore=()=>db;firestore.FieldPath={documentId:()=> '__name__'};firestore.Timestamp={fromMillis:n=>({toMillis:()=>n})};
 const context={URL,Map,Set,Promise,JSON,Object,String,Array,Error,Date,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{},LKCatalogueProjection:projection,
  LKPublicVisibility:require('../../js/public-visibility.js'),LKEventTime:require('../../js/public-event-time.js'),LKLiveProjection:require('../../js/public-live-projection.js'),
  document:{currentScript:{src:'https://example.test/ls26try/shared/public-catalogue-publisher.js'},readyState:'complete'},
  firebase:{auth:()=>auth,firestore,apps:[{}],app:()=>({options:{projectId:'demo-lk-public'}})},addEventListener:(name,fn)=>events[name]=fn};
 context.window=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../ls26try/shared/public-live-publisher.js'),'utf8'),context);vm.runInNewContext(source,context);
 return{records,writes,transactionReads,update,publisher:context.LS26CataloguePublisher,offline:p=>{for(const l of listeners)if(l.p===p)l.fn({...read(l.p,l.ids),metadata:{fromCache:true}});},close:()=>events.pagehide(),listeners};
}
test('owner publisher derives three isolated repertoires and follows source edits without private fields',async()=>{
 const f=fixture();try{
  await settle();assert.equal(f.writes.length,0,'disabled by default');await f.publisher.enable();await settle();
  for(const [act,id]of [['live-karaoke','a'],['billy-lee','b'],['roxanna','c']]){const v=f.records[`publicSites/${act}/views/catalogue`];assert.equal(v.songs[0].id,id);assert.equal(JSON.stringify(v).includes('PRIVATE'),false);}
  const stableCount=f.writes.length;f.update('lyrics/a',{...f.records['lyrics/a']});await settle();assert.equal(f.writes.length,stableCount,'Firestore key ordering does not trigger a duplicate write');
  const before=f.writes.length;f.update('lyrics/a',{...f.records['lyrics/a'],title:'Alpha edited'});await settle();assert.equal(f.records['publicSites/live-karaoke/views/catalogue'].songs[0].title,'Alpha edited');assert.equal(f.writes.length,before+1);
  f.update('lyricsSetlists/lk',{name:'Live Karaoke',songIds:['b']});await settle();assert.equal(f.records['publicSites/live-karaoke/views/catalogue'].songs[0].id,'b');
  f.update('karaokeControl/currentSession',{active:true,type:'Roxanna'});f.update('karaokeControl/publicSongList',{setlistId:'solo'});await settle();assert.equal(f.records['publicSites/roxanna/views/catalogue'].setlist.id,'rox','Roxanna keeps its own configured repertoire');assert.equal(f.records['publicSites/live-karaoke/views/catalogue'].setlist.id,'lk');
  await f.publisher.disable();await settle();const count=f.writes.length;f.update('lyrics/b',{title:'Paused'});await settle();assert.equal(f.writes.length,count);
 }finally{f.close();}
});
test('a signed-in stranger cannot activate the publisher or subscribe to private sources',async()=>{const f=fixture('stranger@example.com');try{await settle();await assert.rejects(f.publisher.enable(),/owner/);assert.equal(f.listeners.size,0);}finally{f.close();}});

test('one owner leader publishes live/event/settings views, shares source listeners and clears ended/test sessions',async()=>{
 const f=fixture();try{
  await settle();await f.publisher.enable();await settle();await f.publisher.enableLive();await settle();
  f.update('karaokeControl/currentSession',{active:true,sessionId:'gig',eventId:'event',type:'Live Karaoke',venue:'Whyte Harte'});await settle();
  const livePath='publicSites/live-karaoke/views/live';
  assert.equal(f.records[livePath].control.active,true);assert.equal(f.records[livePath].run.items[0].songTitle,'Alpha');
  assert.equal(JSON.stringify(f.records[livePath]).includes('PRIVATE'),false);assert.ok(f.records[livePath].expiresAt.toMillis()>Date.now());
  const previousReads=f.transactionReads.length;f.update('karaokeControl/runOrder',{...f.records['karaokeControl/runOrder']});await settle();assert.equal(f.transactionReads.length,previousReads,'unchanged views cause no transaction reads');
  for(const path of ['karaokeControl/currentSession','karaokeControl/liveKaraokeWebsiteSettings','karaokeControl/billyLeeWebsiteSettings','karaokeControl/roxannaWebsiteSettings'])assert.equal([...f.listeners].filter(l=>l.p===path).length,1,'shared '+path);
  assert.equal(f.records['publicSites/billy-lee/views/live'].control.active,false);assert.equal(f.records['publicSites/roxanna/views/live'].control.active,false);
  f.offline('karaokeControl/currentSession');const beforeOffline=f.writes.length;f.update('karaokeControl/runOrder',{sessionId:'gig',items:[]});await settle();assert.equal(f.writes.length,beforeOffline,'cache-only source cannot renew the live lease');f.update('karaokeControl/currentSession',{...f.records['karaokeControl/currentSession']});await settle();
  f.update('upcomingEvents/event',{...f.records['upcomingEvents/event'],publicVisibility:'test'});await settle();assert.equal(f.records[livePath].control.active,false);assert.equal(f.records[livePath].run.items.length,0);
  f.update('upcomingEvents/event',{...f.records['upcomingEvents/event'],publicVisibility:'public'});await settle();assert.equal(f.records[livePath].control.active,true);
  f.update('karaokeControl/currentSession',{active:false});await settle();assert.equal(f.records[livePath].sessionId,'');assert.equal(f.records[livePath].expiresAt,null);
  await f.publisher.disableLive();await settle();assert.equal([...f.listeners].some(l=>l.p==='publicSongRequests'),false);
 }finally{f.close();}
});

test('explicit kiosk publishes its own safe queue even when public website hides a test gig',async()=>{
  const f=fixture();
  try{
    await f.publisher.enable();
    await f.publisher.enableLive();
    await settle();
    f.update('karaokeControl/signupKioskPublic',{schemaVersion:1,enabled:true,token:'a'.repeat(64)});
    f.update('karaokeControl/currentSession',{active:true,isTestSession:true,sessionId:'gig',eventId:'event',type:'Live Karaoke',venue:'0 The Test Venue'});
    f.update('karaokeControl/runOrder',{sessionId:'gig',items:[
      {id:'1',songTitle:'Playing song',singerName:'Anna',status:'playing',note:'PRIVATE'},
      {id:'2',songTitle:'First queued',singerName:'Bob',status:'queued',hostNote:'PRIVATE'},
      {id:'3',songTitle:'Second queued',singerName:'Cara',status:'queued'},
      {id:'4',songTitle:'Third queued',singerName:'Dan',status:'queued'},
      {id:'5',songTitle:'Fourth queued',singerName:'Eve',status:'queued'}
    ]});
    await settle();
    const doc=f.records['karaokeControl/signupKioskPublic'];
    assert.equal(doc.queueSessionId,'gig');
    assert.deepEqual(JSON.parse(JSON.stringify(doc.kioskQueue)),{
      current:{songTitle:'Playing song',singerName:'Anna'},
      next:[{songTitle:'First queued',singerName:'Bob'},
        {songTitle:'Second queued',singerName:'Cara'},
        {songTitle:'Third queued',singerName:'Dan'}]
    });
    assert.equal(JSON.stringify(doc.kioskQueue).includes('PRIVATE'),false);
    assert.equal(JSON.stringify(doc.kioskQueue).includes('Eve'),false);
    assert.equal(f.records['publicSites/live-karaoke/views/live'].sessionId,'','The general public website remains hidden for test gigs');
    assert.equal([...f.listeners].filter(l=>l.p==='karaokeControl/runOrder').length,1,'Kiosk reuses the host Run Order listener');
    f.update('karaoke/state',{songsEnabled:false});await settle();
    assert.equal(f.records['karaokeControl/signupKioskPublic'].queueSessionId,'');
    assert.deepEqual(JSON.parse(JSON.stringify(f.records['karaokeControl/signupKioskPublic'].kioskQueue)),{current:null,next:[]});
  }finally{f.close();}
});

test('enabled kiosk publishes next songs without optional public live publication',async()=>{
 const f=fixture();try{
   await settle();
   assert.equal(f.writes.length,0,'The kiosk starts disabled and no public views are written');
   f.update('karaokeControl/signupKioskPublic',{schemaVersion:1,enabled:true,token:'a'.repeat(64)});
   f.update('karaokeControl/currentSession',{active:true,sessionId:'gig',type:'Live Karaoke',venue:'0 The Test Venue'});
   f.update('karaokeControl/runOrder',{sessionId:'gig',items:[
     {id:'a',status:'playing',songTitle:'Now playing',singerName:'Ana',note:'PRIVATE'},
     {id:'b',status:'queued',songTitle:'First next',singerName:'Ben',hostNote:'PRIVATE'},
     {id:'c',status:'queued',songTitle:'Second next',singerName:'Cara'}]});
   await settle();
   const path='karaokeControl/signupKioskPublic';
   const state=[];const unsubscribe=f.publisher.subscribe(x=>state.push({...x}));
   assert.ok(f.records[path].kioskQueue,JSON.stringify({
     publisher:state.at(-1),writes:f.writes,transactionReads:f.transactionReads,
     listeners:[...f.listeners].map(x=>x.p),kioskDoc:f.records[path]}));
   unsubscribe();
   assert.deepEqual(JSON.parse(JSON.stringify(f.records[path].kioskQueue)),{
     current:{songTitle:'Now playing',singerName:'Ana'},
     next:[{songTitle:'First next',singerName:'Ben'},{songTitle:'Second next',singerName:'Cara'}]});
   assert.equal(f.records[path].queueSessionId,'gig');
   assert.equal(f.records['publicSites/live-karaoke/views/live'],undefined,'Disabled public live website is not published');
   assert.equal([...f.listeners].filter(x=>x.p==='karaokeControl/runOrder').length,1,'One existing Run Order listener');
   assert.equal([...f.listeners].filter(x=>x.p==='karaokeControl/signupKioskPublic').length,1,'One shared kiosk control listener');
   assert.equal([...f.listeners].some(x=>x.p==='upcomingEvents'),false,'Kiosk does not depend on unrelated public events');
   assert.equal(JSON.stringify(f.records[path].kioskQueue).includes('PRIVATE'),false);
   f.update('karaokeControl/runOrder',{sessionId:'gig',items:[
     {id:'new',status:'queued',songTitle:'Changed next',singerName:'Dani'}]});
   await settle();
   assert.deepEqual(JSON.parse(JSON.stringify(f.records[path].kioskQueue)),{
     current:null,next:[{songTitle:'Changed next',singerName:'Dani'}]});
   f.update('karaoke/state',{songsEnabled:false});await settle();
   assert.deepEqual(JSON.parse(JSON.stringify(f.records[path].kioskQueue)),{current:null,next:[]},'Closing requests clears public stage names');
   f.update('karaokeControl/signupKioskPublic',{...f.records[path],enabled:false});await settle();
   assert.equal([...f.listeners].filter(x=>x.p==='karaokeControl/runOrder').length,0,'Disabling kiosk releases Run Order subscription');
 }finally{f.close();}
});
