const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const fragment=fs.readFileSync(path.join(__dirname,'../../docs/public-site/public-request-gate.rules.fragment'),'utf8');
 const rules=process.env.LK_FULL_RULES?fs.readFileSync(process.env.LK_FULL_RULES,'utf8'):`rules_version='2';service cloud.firestore {match /databases/{database}/documents {function isOwner(){return request.auth!=null&&request.auth.token.email=='leeborg23@gmail.com';}${fragment}
 match /publicSongRequests/{requestId}{allow create:if isOwner() || (request.resource.data.createdAt==request.time && validPublicRequestGate(request.resource.data,requestId));}
 match /publicSongRequestOwners/{requestId}{allow create:if request.resource.data.createdAt==request.time && getAfter(/databases/$(database)/documents/publicSongRequests/$(requestId)).data.createdAt==request.time;}
 }}`;
 const env=await initializeTestEnvironment({projectId:'demo-lk-public',firestore:{host:'127.0.0.1',port:8088,rules}});
 const db=env.unauthenticatedContext().firestore();let sequence=0;
 const initial={
  'karaokeControl/currentSession':{active:true,sessionId:'s',eventId:'e',type:'Live Karaoke',venue:'Venue'},
  'performanceSessions/s':{status:'active',breakOpen:false},
  'upcomingEvents/e':{type:'Live Karaoke',status:'Confirmed',venue:'Venue'},
  'karaoke/state':{songsEnabled:true},
  'karaokeControl/publicSongList':{setlistId:'list'},
  'karaokeControl/liveKaraokeWebsiteSettings':{defaultBrowseSetlistId:'browse'},
  'lyrics/a':{title:'Alpha'},'lyrics/b':{title:'Bravo'},'lyricsSetlists/list':{name:'Roxanna',songIds:['a']},'lyricsSetlists/browse':{songIds:['b']}
 };
 async function seed(patch={}){await env.withSecurityRulesDisabled(async c=>{const admin=c.firestore();for(const [p,d]of Object.entries({...initial,...patch}))await setDoc(doc(admin,p),d);});}
 async function send(change={},code='',client=db){const id='request-'+(++sequence),batch=writeBatch(client);console.log('Case',sequence,change.source||'LIVE KARAOKE',change.sessionId||'s');batch.set(doc(client,'publicSongRequests',id),{singerName:'Fixture Singer',status:'pending',source:'live-karaoke-website',songId:'a',sessionId:'s',publicSetlistId:'list',createdAt:serverTimestamp(),...change});batch.set(doc(client,'publicSongRequestOwners',id),{token:'a'.repeat(64),createdAt:serverTimestamp(),proofAt:serverTimestamp(),accessCode:code});return batch.commit();}
 await seed();await assertSucceeds(send());await assertFails(send({source:'billylee26'}));await assertFails(send({source:'roxanna26'}));await assertFails(send({source:'invented'}));await assertFails(send({sessionId:'other'}));await assertFails(send({songId:'not-selected'}));await assertFails(send({publicSetlistId:'other'}));await assertFails(send({isTestSession:true}));
 for(const patch of [
  {'karaoke/state':{songsEnabled:false}},
  {'karaokeControl/currentSession':{...initial['karaokeControl/currentSession'],active:false}},
  {'karaokeControl/currentSession':{...initial['karaokeControl/currentSession'],venue:'0 The Test Venue'}},
  {'performanceSessions/s':{status:'ended'}},
  {'performanceSessions/s':{status:'active',isTest:true}},
  {'upcomingEvents/e':{type:'Live Karaoke',status:'Tentative'}},
  {'upcomingEvents/e':{type:'Live Karaoke',status:'Cancelled',publicVisibility:'public'}},
  {'upcomingEvents/e':{type:'Live Karaoke',status:'Confirmed',publicVisibility:'private'}}
 ]){await seed(patch);await assertFails(send());}
 await seed({'performanceSessions/s':{status:'active',breakOpen:true}});await assertSucceeds(send());
 await seed({'karaoke/state':{songsEnabled:true,venueAccessCode:'venue-code'}});await assertFails(send());await assertFails(send({},'wrong'));await assertSucceeds(send({},'venue-code'));
 await seed({'karaokeControl/currentSession':{active:false},'karaoke/state':{songsEnabled:true,preSessionRequestSessionId:'reserved',preSessionRequestEventId:'e'}});await assertSucceeds(send({sessionId:'reserved',songId:'b',publicSetlistId:'browse'}));await assertFails(send({sessionId:'reserved'}));
 for(const [type,source]of [['Solo','billylee26'],['Roxanna','roxanna26']]){await seed({'karaokeControl/currentSession':{...initial['karaokeControl/currentSession'],type},'upcomingEvents/e':{type,status:'Confirmed'}});await assertSucceeds(send({source}));await assertFails(send());}
 await seed({'karaoke/state':{songsEnabled:false}});await assertSucceeds(send({},'',env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore()));await assertFails(send({},'',env.authenticatedContext('stranger',{email:'stranger@example.com'}).firestore()));
 console.log('PASS: authoritative request gate, act/source isolation, repertoire/session binding, private/test/tentative/cancelled/end denial, break, pre-session, venue QR, owner preview and stranger denial.');await env.cleanup();
})().catch(e=>{console.error(e);process.exitCode=1;});
