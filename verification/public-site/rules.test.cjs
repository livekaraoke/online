/* Dependencies: firebase, @firebase/rules-unit-testing. A demo emulator only. */
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch}=require('firebase/firestore');
const fs=require('node:fs');
(async()=>{
 const fragment=fs.readFileSync(require('node:path').join(__dirname,'../../docs/public-site/booking-enquiries.rules.fragment'),'utf8');
 const env=await initializeTestEnvironment({projectId:'demo-lk-public',firestore:{host:'127.0.0.1',port:8088,rules:process.env.LK_FULL_RULES?fs.readFileSync(process.env.LK_FULL_RULES,'utf8'):`rules_version = '2';service cloud.firestore {match /databases/{database}/documents {function isOwner(){ return request.auth != null && request.auth.token.email == "leeborg23@gmail.com"; }${fragment}}}`}});
 const db=env.unauthenticatedContext().firestore();
 const valid=()=>({status:'pending',source:'Live Karaoke Website',sourceKey:'live-karaoke',type:'Live Karaoke',performerType:'Live Karaoke',name:'Test visitor',email:'visitor@example.com',phone:'',eventType:'Corporate Event',preferredDate:'',venueOrLocality:'',company:'',estimatedGuests:null,message:'Test enquiry\nwith a newline.',pageUrl:'https://livekaraoke.eu/',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 async function send(id,data){const batch=writeBatch(db);batch.set(doc(db,'bookingEnquiries',id),data);batch.set(doc(db,'publicBookingLimits',data.email.toLowerCase()),{enquiryId:id,submittedAt:serverTimestamp()});return batch.commit();}
 const ref=doc(db,'bookingEnquiries','valid');
 await assertSucceeds(send('valid',valid()));
 for(const [source,sourceKey,type] of [['Billy Lee Website','billylee26','Solo'],['Roxanna Website','roxanna26','Roxanna']])await assertSucceeds(send(sourceKey,{...valid(),email:sourceKey+'@example.com',source,sourceKey,type,performerType:type,pageUrl:'https://livesuite.livekaraoke.eu/'+sourceKey+'/'}));
 await assertFails(setDoc(doc(db,'bookingEnquiries','mixed-act'),{...valid(),type:'Roxanna'}));
 let index=0;
 for(const change of [{extra:'unexpected'},{name:''},{name:' '.repeat(3)},{name:'x'.repeat(81)},{email:'bad-email'},{phone:12},{eventType:'not allowed'},{status:'approved'},{sourceKey:'other'},{estimatedGuests:-1},{estimatedGuests:1.5},{estimatedGuests:'10'},{estimatedGuests:100001},{message:'\n<script>invalid</script>\n'},{message:'bad\x00data'},{message:'x'.repeat(1501)},{message:' \n\t '},{createdAt:Timestamp.fromMillis(0)},{pageUrl:'https://attacker.example/'}]) {
  await assertFails(send('invalid-'+(++index),{...valid(),email:'invalid'+index+'@example.com',...change}));
 }
 await assertFails(send('duplicate',valid()));
 await assertFails(setDoc(doc(db,'bookingEnquiries','missing-cooldown'),{...valid(),email:'other@example.com'}));
 await assertFails(getDoc(doc(db,'publicBookingLimits','visitor@example.com')));
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'publicBookingLimits','visitor@example.com'),{enquiryId:'valid',submittedAt:Timestamp.fromMillis(Date.now()-61000)});});
 await assertSucceeds(send('after-cooldown',valid()));
 const owner=env.authenticatedContext('owner',{email:'leeborg23@gmail.com'}).firestore();
 await assertSucceeds(getDoc(doc(owner,'bookingEnquiries','valid')));
 await assertSucceeds(updateDoc(doc(owner,'bookingEnquiries','valid'),{status:'completed'}));
 await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(),'bookingEnquiries','valid')));
 const missing=valid();delete missing.phone;await assertFails(setDoc(doc(db,'bookingEnquiries','missing'),missing));
 await assertFails(getDoc(ref));await assertFails(getDocs(collection(db,'bookingEnquiries')));await assertFails(updateDoc(ref,{message:'edited'}));await assertFails(deleteDoc(ref));
 await assertFails(setDoc(doc(db,'arbitrary','document'),valid()));
 console.log('PASS: atomic cooldown and duplicate rejection; owner management; stranger denial; valid enquiry; 20 invalid payloads rejected; anonymous read/list/update/delete and arbitrary collection writes rejected.');
 await env.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
