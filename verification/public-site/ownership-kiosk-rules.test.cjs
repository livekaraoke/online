/* Full replacement rules, actual local emulator. Never uses a live project. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const modules=process.env.LS26_KIOSK_TEST_MODULES;
if(!modules)throw Error('Set LS26_KIOSK_TEST_MODULES to isolated test dependencies.');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require(require.resolve('@firebase/rules-unit-testing',{paths:[modules]}));
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,writeBatch,serverTimestamp}=require(require.resolve('firebase/firestore',{paths:[modules]}));
const project='demo-lk-public';
const rules=fs.readFileSync(process.env.LK_FULL_RULES,'utf8');
const protocol=require('../../signup/signup.js');
const key='a'.repeat(64),token='b'.repeat(64),bad='c'.repeat(64);
const view={schemaVersion:1,enabled:true,revision:'r1',sessionId:'s1',setlistId:'set1',setlistName:'Test',venue:'Test venue',songs:{song1:{title:'Test song',artist:'Artist'}}};
let env,db,owner,seq=0,count=0;
async function check(name,fn){await fn();console.log('PASS',name);count++;}
async function seed(changes={}){await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [p,v]of Object.entries(changes))await setDoc(doc(d,p),v);});}
function request(extra={}){return {source:'live-karaoke-website',sessionId:'s1',songId:'song1',songTitle:'Test song',songArtist:'Artist',singerName:'Guest',status:'active',note:'',comment:'',createdAt:serverTimestamp(),...extra};}
function edit(id,secret=key,patch={note:'Updated',comment:'Updated'},proofId='proof'+(++seq)){
 const b=writeBatch(db);
 b.update(doc(db,'publicSongRequests/'+id),{...patch,requestProofId:proofId,updatedAt:serverTimestamp()});
 b.set(doc(db,'publicSongRequestProofs/'+proofId),{requestId:id,token:secret,createdAt:serverTimestamp()});
 return b.commit();
}
async function create(id){const b=writeBatch(db);b.set(doc(db,'publicSongRequests/'+id),request());b.set(doc(db,'publicSongRequestOwners/'+id),{token:key,createdAt:serverTimestamp(),proofAt:serverTimestamp()});await b.commit();}
async function kiosk(editPayload){const id='kiosk_'+(++seq).toString(16).padStart(32,'0');const payload=protocol.commitBody(project,id,token,view,{id:'song1',...view.songs.song1},'Kiosk guest','');if(editPayload)editPayload(payload);const r=await fetch('http://127.0.0.1:8088/v1/projects/'+project+'/databases/(default)/documents:commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json(),id};}
(async()=>{
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8088,rules}});
 await env.clearFirestore();db=env.unauthenticatedContext().firestore();owner=env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore();
 await seed({'lyrics/song1':{title:'Test song',artist:'Artist'},'lyricsSetlists/set1':{songIds:['song1']},'karaokeControl/publicSongList':{setlistId:'set1'},'performanceSessions/s1':{status:'active'},'upcomingEvents/e':{type:'Live Karaoke',status:'Confirmed',venue:'Venue'},'karaokeControl/currentSession':{active:true,sessionId:'s1',eventId:'e',type:'Live Karaoke'},'karaoke/state':{songsEnabled:true},'karaokeControl/liveKaraokeWebsiteSettings':{enableLiveRequestTestMode:false},'signupKioskAdmin/control':{...view,token},['signupKioskViews/'+token]:view});
 await check('normal public create + private owner record',()=>create('one'));
 const compat=require(require.resolve('firebase/compat/app',{paths:[modules]}));
 require(require.resolve('firebase/compat/firestore',{paths:[modules]}));
 for(const site of ['livekaraoke26','billylee26']) {
  const stored=new Map(),storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  function load(){
   const firebase={apps:[{}],firestore:Object.assign(()=>db,{FieldValue:compat.firestore.FieldValue})};
   const window={SITE_FIREBASE_CONFIG:{projectId:project},firebase,localStorage:storage,crypto:require('crypto').webcrypto};
   new Function('window','firebase','location',fs.readFileSync(path.join(__dirname,'../../'+site+'/js/firebase-config.js'),'utf8'))(window,firebase,{search:''});
   return window.BillyLeeDB;
  }
  await check(site+' actual client create, reload key, note edit and cancel',async()=>{
   const client=load(),ref=await client.collection('publicSongRequests').add(request());
   const reloaded=load(),record=reloaded.collection('publicSongRequests').doc(ref.id);
   await record.set({note:'Reloaded edit',comment:'Reloaded edit',updatedAt:compat.firestore.FieldValue.serverTimestamp()},{merge:true});
   const saved=(await getDoc(doc(db,'publicSongRequests/'+ref.id))).data();assert.equal(saved.note,'Reloaded edit');assert.ok(saved.requestProofId);assert.ok(!saved.token);
   await record.set({status:'cancelled',reason:'Cancelled by requester',cancelledAt:compat.firestore.FieldValue.serverTimestamp(),updatedAt:compat.firestore.FieldValue.serverTimestamp()},{merge:true});
   const cancelled=(await getDoc(doc(db,'publicSongRequests/'+ref.id))).data();assert.equal(cancelled.status,'cancelled');assert.notEqual(cancelled.requestProofId,saved.requestProofId);
  });
 }
 await check('legacy create-only client remains compatible',()=>assertSucceeds(setDoc(doc(db,'publicSongRequests/legacy'),request({source:'public-songlist'}))));
 await check('private owner record unreadable',()=>assertFails(getDoc(doc(db,'publicSongRequestOwners/one'))));
 await check('partial-update bypass denied',async()=>{const b=writeBatch(db);b.update(doc(db,'publicSongRequests/one'),{note:'Attacker',updatedAt:serverTimestamp()});b.update(doc(db,'publicSongRequestOwners/one'),{proofAt:serverTimestamp()});await assertFails(b.commit());});
 await check('correct capability edits note',()=>assertSucceeds(edit('one')));
 await check('wrong capability denied',()=>assertFails(edit('one',bad)));
 await check('proof cannot be refreshed or read',async()=>{await assertFails(updateDoc(doc(db,'publicSongRequestProofs/proof1'),{createdAt:serverTimestamp()}));await assertFails(getDoc(doc(db,'publicSongRequestProofs/proof1')));});
 await check('proof replay denied',()=>assertFails(edit('one',key,{note:'Replay',comment:'Replay'},'proof1')));
 await check('request edit without fresh paired proof denied',()=>assertFails(updateDoc(doc(db,'publicSongRequests/one'),{note:'Alone',updatedAt:serverTimestamp()})));
 await check('secret cannot be claimed for legacy record',()=>assertFails(setDoc(doc(db,'publicSongRequestOwners/legacy'),{token:key,createdAt:serverTimestamp(),proofAt:serverTimestamp()})));
 await check('request identity change denied',()=>assertFails(edit('one',key,{songId:'other'})));
 await check('private proof cannot be created alone',()=>assertFails(setDoc(doc(db,'publicSongRequestProofs/alone'),{requestId:'one',token:key,createdAt:serverTimestamp()})));
 await check('correct cancellation allowed',()=>assertSucceeds(edit('one',key,{status:'cancelled',reason:'Cancelled by requester',cancelledAt:serverTimestamp()})));
 await check('completed/cancelled request cannot be edited',()=>assertFails(edit('one')));
 await check('anonymous delete denied; owner queue update allowed',async()=>{await assertFails(deleteDoc(doc(db,'publicSongRequests/one')));await assertSucceeds(updateDoc(doc(owner,'publicSongRequests/one'),{status:'queued'}));});
 for(const extra of [{source:'anything'},{songId:'missing'},{status:'playing'},{sessionId:'wrong'},{hostNote:'Forged'},{singerName:' '}])await check('invalid public create '+JSON.stringify(extra),()=>assertFails(setDoc(doc(db,'publicSongRequests/bad'+(++seq)),request(extra))));
 await seed({'karaoke/state':{songsEnabled:false}});
 await check('ordinary requests rejected while closed',()=>assertFails(setDoc(doc(db,'publicSongRequests/closed'),request())));
 await seed({'karaoke/state':{songsEnabled:true},'karaokeControl/currentSession':{active:false,sessionId:'s1'}});
 await check('ordinary requests rejected after session ends',()=>assertFails(setDoc(doc(db,'publicSongRequests/ended'),request())));
 await seed({'karaokeControl/currentSession':{active:true,sessionId:'s1',eventId:'e',type:'Live Karaoke'}});
 const accepted=await kiosk();await check('valid kiosk REST batch creates two records',async()=>{assert.equal(accepted.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.writeResults.length,2);});
 await check('kiosk receipt hidden and request immutable to guest',async()=>{await assertFails(getDoc(doc(db,'signupKioskReceipts/'+accepted.id)));await assertFails(updateDoc(doc(db,'publicSongRequests/'+accepted.id),{note:'wrong'}));});
 for(const [label,mutate]of [['wrong token',p=>p.writes[1].update.fields.token.stringValue=bad],['missing receipt',p=>p.writes.pop()],['forged song',p=>p.writes[0].update.fields.songId.stringValue='missing']])await check('kiosk '+label+' denied',async()=>assert.equal((await kiosk(mutate)).status,403));
 await check('token snapshot allowed; enumeration/private config denied',async()=>{await assertSucceeds(getDoc(doc(db,'signupKioskViews/'+token)));await assertFails(getDocs(collection(db,'signupKioskViews')));await assertFails(getDoc(doc(db,'signupKioskAdmin/control')));});
 await seed({'signupKioskAdmin/control':{...view,token,enabled:false}});await check('disabled kiosk rejected',async()=>assert.equal((await kiosk()).status,403));
 await seed({'signupKioskAdmin/control':{...view,token:bad}});await check('rotated kiosk rejected',async()=>assert.equal((await kiosk()).status,403));
 await seed({'signupKioskAdmin/control':{...view,token},'karaokeControl/currentSession':{active:false,sessionId:'s1'}});await check('ended kiosk session rejected',async()=>assert.equal((await kiosk()).status,403));
 for(const p of ['lyrics/song1','lyrics/song1/musicalTiming/v1','lyricsSetlists/set1','karaokeControl/currentSession','karaokeControl/runOrder','karaoke/state','performanceSessions/s1','noteSettings/livesuiteAppSettings','liveLyrics/current','notes/one','venues/one','upcomingEvents/one','signupKioskAdmin/control'])await check('owner-only writes '+p,async()=>{await assertFails(setDoc(doc(db,p),{test:true}));await assertSucceeds(setDoc(doc(owner,p),{test:true}));});
 const other=env.authenticatedContext('other',{email:'other@example.com'}).firestore();await check('other signed-in user cannot impersonate owner',()=>assertFails(setDoc(doc(other,'lyrics/other'),{title:'Denied'})));
 console.log(count+' complete-rules emulator checks passed; no production data touched.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(env)await env.cleanup();});
