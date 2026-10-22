const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection}=require('firebase/firestore');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const fragment=fs.readFileSync(path.join(__dirname,'../../docs/public-site/public-catalogue.rules.fragment'),'utf8');
 const rules=process.env.LK_FULL_RULES?fs.readFileSync(process.env.LK_FULL_RULES,'utf8'):`rules_version='2';service cloud.firestore {match /databases/{database}/documents {function isOwner(){return request.auth!=null&&request.auth.token.email=='leeborg23@gmail.com';}${fragment}}}`;
 const env=await initializeTestEnvironment({projectId:'demo-lk-public',firestore:{host:'127.0.0.1',port:8088,rules}});
 const owner=env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore(),anon=env.unauthenticatedContext().firestore(),stranger=env.authenticatedContext('stranger').firestore();
 for(const act of ['live-karaoke','billy-lee','roxanna']){
  const p=`publicSites/${act}/views/catalogue`;
  await assertSucceeds(setDoc(doc(owner,p),{schemaVersion:1,act,setlist:{id:'existing',name:'Public',songIds:['s']},songs:[{id:'s',title:'Song',artist:'Artist'}]}));
  await assertSucceeds(getDoc(doc(anon,p)));await assertSucceeds(getDoc(doc(stranger,p)));
  await assertFails(setDoc(doc(anon,p),{songs:[]}));await assertFails(setDoc(doc(stranger,p),{songs:[]}));
  await assertFails(getDocs(collection(anon,`publicSites/${act}/views`)));
 }
 await assertSucceeds(setDoc(doc(owner,'publicPublication/config'),{cataloguesEnabled:true}));
 await assertFails(getDoc(doc(anon,'publicPublication/config')));await assertFails(setDoc(doc(stranger,'publicPublication/config'),{cataloguesEnabled:true}));
 await assertFails(getDoc(doc(anon,'publicSites/live-karaoke/views/private')));
 console.log('PASS: all three public catalogue GETs; owner publishing; anonymous/stranger mutation, collection listing and private config denial. Additive fragment only; legacy read cutover not asserted.');
 await env.cleanup();
})().catch(e=>{console.error(e);process.exitCode=1;});
