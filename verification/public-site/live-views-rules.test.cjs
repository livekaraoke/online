const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDocFromServer:getDoc,getDocs,collection,Timestamp,serverTimestamp}=require('firebase/firestore');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const rules=fs.readFileSync(path.join(__dirname,'../../docs/public-site/firestore.production-views.rules'),'utf8');
 const env=await initializeTestEnvironment({projectId:'demo-lk-public',firestore:{host:'127.0.0.1',port:8088,rules}});
 try{
  await env.clearFirestore();
  const owner=env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore(),anon=env.unauthenticatedContext().firestore(),stranger=env.authenticatedContext('stranger').firestore();
  const put=(p,d)=>setDoc(doc(owner,p),d);
  for(const act of ['live-karaoke','billy-lee','roxanna']){
   for(const view of ['events','settings','live']){
    const p=`publicSites/${act}/views/${view}`;
    await assertSucceeds(put(p,{schemaVersion:1,act,sessionId:''}));
    await assertSucceeds(getDoc(doc(anon,p)));await assertSucceeds(getDoc(doc(stranger,p)));
    await assertFails(setDoc(doc(anon,p),{sessionId:'stolen'}));await assertFails(setDoc(doc(stranger,p),{sessionId:'stolen'}));
   }
   await assertFails(getDocs(collection(anon,`publicSites/${act}/views`)));
  }
  await put('karaokeControl/currentSession',{active:true,sessionId:'s',eventId:'e',type:'Live Karaoke',venue:'Whyte Harte'});
  await put('karaoke/state',{songsEnabled:true});await put('performanceSessions/s',{status:'active',isActive:true});
  const event={type:'Live Karaoke',status:'Confirmed',venue:'Whyte Harte'};
  await put('upcomingEvents/e',event);
  await put('publicPublication/testClock',{now:serverTimestamp()});
  const serverNow=(await getDoc(doc(owner,'publicPublication/testClock'))).data().now.toMillis();
  console.log('Emulator clock offset (ms)',serverNow-Date.now());
  const p='publicSites/live-karaoke/views/live',value={schemaVersion:1,act:'live-karaoke',sessionId:'s',expiresAt:Timestamp.fromMillis(serverNow+180000)};
  await put(p,value);await assertSucceeds(getDoc(doc(anon,p)));
  for(const change of [{publicVisibility:'private'},{isTest:true},{venue:'0 The Test Venue'},{status:'Cancelled'},{status:'Tentative'},{type:'Solo'}]){
   await put('upcomingEvents/e',{...event,...change});await assertFails(getDoc(doc(anon,p)));
  }
  await put('upcomingEvents/e',event);await put(p,{...value,expiresAt:Timestamp.fromMillis(serverNow-60000)});await assertFails(getDoc(doc(anon,p)));
  await put(p,value);await put('performanceSessions/s',{status:'ended'});await assertFails(getDoc(doc(anon,p)));
  await put('performanceSessions/s',{status:'active'});await put('karaokeControl/currentSession',{active:true,sessionId:'different',eventId:'e',type:'Live Karaoke'});await assertFails(getDoc(doc(anon,p)));
  await put('karaokeControl/currentSession',{active:false});await put('karaoke/state',{songsEnabled:true,preSessionRequestSessionId:'reserved',preSessionRequestEventId:'e'});
  await put(p,{...value,sessionId:'reserved'});await assertSucceeds(getDoc(doc(anon,p)));
  await put('upcomingEvents/e',{...event,isPrivate:true});await assertFails(getDoc(doc(anon,p)));
  await assertSucceeds(getDoc(doc(owner,p)));await assertFails(getDoc(doc(anon,'publicPublication/config')));
  console.log('PASS full candidate rules: bounded single-view reads, owner writes, test/private/cancelled/tentative/other-act exclusion, expiry, ended/replaced sessions and reserved-session visibility. Legacy private grants remain unchanged.');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
