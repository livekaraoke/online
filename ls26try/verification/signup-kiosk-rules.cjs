/* Real Firestore emulator only. Never points at a production project. */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const modules=process.env.LS26_KIOSK_TEST_MODULES;
if(!modules)throw Error('Set LS26_KIOSK_TEST_MODULES to isolated test dependencies.');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require(require.resolve('@firebase/rules-unit-testing',{paths:[modules]}));
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp}=require(require.resolve('firebase/firestore',{paths:[modules]}));
const protocol=require('../../signup/signup.js');
const project='demo-ls26-kiosk',port=8188,host='127.0.0.1',base=`http://${host}:${port}/v1/projects/${project}/databases/(default)/documents`;
const fragment=fs.readFileSync(path.join(__dirname,'../docs/signup-kiosk/rules.fragment'),'utf8');
const rules=`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents {
 function isOwner(){return request.auth != null && request.auth.token.email == 'leeborg23@gmail.com';}
 ${fragment}
 match /publicSongRequests/{requestId} {
   allow read: if true;
   allow create: if isOwner() || (isKioskRequest(requestId) ? validKioskRequest(requestId) :
     request.resource.data.keys().hasOnly(['source','sessionId','singerName','songId','status','createdAt']) &&
     request.resource.data.source == 'legacy-test-client' && request.resource.data.status == 'active');
   allow update, delete: if isOwner();
 }
 }}`;
const token='a'.repeat(64),nextToken='b'.repeat(64),view={schemaVersion:1,enabled:true,revision:'r1',sessionId:'s1',setlistId:'set1',setlistName:'Tonight',venue:'Test venue',displayTitle:'Test night',songs:{song1:{title:'Wonderwall',artist:'Oasis'},song2:{title:'Zombie',artist:'The Cranberries'}}};
let env,seq=0,passes=0;
function check(name){passes++;console.log('PASS',name);}
async function seed(changes={}){await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const [p,v] of Object.entries({'signupKioskAdmin/control':{...view,token,songs:undefined},['signupKioskViews/'+token]:view,'karaokeControl/currentSession':{active:true,sessionId:'s1'},'karaoke/state':{songsEnabled:true},...changes})){const value={...v};delete value.songs;if(p.startsWith('signupKioskViews/'))value.songs=v.songs;await setDoc(doc(db,p),value);}});}
function payload(edit){const id='kiosk_'+(++seq).toString(16).padStart(32,'0');const value=protocol.commitBody(project,id,token,view,{id:'song1',...view.songs.song1},'Alex','');if(edit)edit(value);return value;}
async function commit(value){const response=await fetch(base+':commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});return {status:response.status,body:await response.json()};}
async function deny(name,edit){const r=await commit(payload(edit));assert.equal(r.status,403,JSON.stringify(r));check(name);}
(async()=>{
 env=await initializeTestEnvironment({projectId:project,firestore:{host,port,rules}});await env.clearFirestore();await seed();
 const guest=env.unauthenticatedContext().firestore(),owner=env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore();
 await assertSucceeds(getDoc(doc(guest,'signupKioskViews/'+token)));check('valid token reads one snapshot');
 await assertFails(getDoc(doc(guest,'signupKioskViews/'+nextToken)));await assertFails(getDocs(collection(guest,'signupKioskViews')));await assertFails(getDoc(doc(guest,'signupKioskAdmin/control')));check('wrong token, enumeration and private configuration denied');
 const first=payload(),result=await commit(first);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.writeResults.length,2);check('ES5 REST payload creates queue request + private receipt atomically');
 const id=first.writes[0].update.name.split('/').pop(),saved=(await getDoc(doc(guest,'publicSongRequests/'+id))).data();assert.equal(saved.source,'signup-kiosk');assert.equal(saved.singerName,'Alex');assert.ok(!('token'in saved));assert.ok(!('kioskToken'in saved));check('existing queue schema with no disclosed token');
 await assertFails(getDoc(doc(guest,'signupKioskReceipts/'+id)));await assertFails(updateDoc(doc(guest,'publicSongRequests/'+id),{note:'changed'}));await assertFails(deleteDoc(doc(guest,'publicSongRequests/'+id)));check('no guest receipt read or queue update/delete');
 const again=await commit(first);assert.notEqual(again.status,200);check('same ID cannot be submitted twice');
 await deny('wrong token rejected',p=>p.writes[1].update.fields.token.stringValue=nextToken);
 await deny('missing receipt rejected',p=>p.writes.pop());
 await deny('receipt alone rejected',p=>p.writes.shift());
 await deny('missing required name rejected',p=>delete p.writes[0].update.fields.singerName);
 await deny('blank name rejected',p=>p.writes[0].update.fields.singerName.stringValue='   ');
 await deny('long name rejected',p=>p.writes[0].update.fields.singerName.stringValue='a'.repeat(81));
 await deny('long note rejected',p=>p.writes[0].update.fields.note.stringValue='a'.repeat(301));
 await deny('HTML text rejected',p=>p.writes[0].update.fields.note.stringValue='<script>bad</script>');
 await deny('extra fields rejected',p=>p.writes[0].update.fields.admin={booleanValue:true});
 await deny('forged title rejected',p=>p.writes[0].update.fields.songTitle.stringValue='Something else');
 await deny('song outside selected snapshot rejected',p=>p.writes[0].update.fields.songId.stringValue='not-listed');
 await deny('stale list revision rejected',p=>p.writes[0].update.fields.kioskRevision.stringValue='old');
 await deny('wrong session rejected',p=>p.writes[0].update.fields.sessionId.stringValue='other');
 await deny('forged queue status rejected',p=>p.writes[0].update.fields.status.stringValue='queued');
 await seed({'signupKioskAdmin/control':{...view,token,enabled:false}});await deny('disable immediately rejects submissions');
 await seed({'signupKioskAdmin/control':{...view,token:nextToken},['signupKioskViews/'+nextToken]:view});await deny('rotation immediately rejects old token');await assertFails(getDoc(doc(guest,'signupKioskViews/'+token)));check('old snapshot no longer readable');
 await seed({'karaokeControl/currentSession':{active:false,sessionId:'s1'}});await deny('ended session rejects submissions');
 await seed({'karaokeControl/currentSession':{active:true,sessionId:'s2'}});await deny('changed session rejects submissions');
 await seed({'karaoke/state':{songsEnabled:false}});await deny('global requests closed rejects submissions');
 await seed();
 for(const p of ['lyrics/song1','lyrics/song1/musicalTiming/v1','lyricsSetlists/set1','users/someone','performanceSessions/s1','noteSettings/livesuiteAppSettings','signupKioskAdmin/control','signupKioskViews/'+token])await assertFails(setDoc(doc(guest,p),{evil:true}));check('guest cannot modify songs/timing/users/setlists/admin/sessions/settings');
 await assertSucceeds(updateDoc(doc(owner,'publicSongRequests/'+id),{status:'queued'}));check('existing host acceptance retained');
 await assertSucceeds(setDoc(doc(guest,'publicSongRequests/legacy-test'),{source:'legacy-test-client',sessionId:'s1',singerName:'Old public workflow',songId:'song1',status:'active',createdAt:serverTimestamp()}));check('separate legacy-create predicate remains usable in integration harness');
 await assertSucceeds(setDoc(doc(owner,'signupKioskAdmin/control'),{...view,token}));check('owner configuration write permitted');
 console.log(`${passes} emulator checks passed; NO production requests.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(env)await env.cleanup();});
