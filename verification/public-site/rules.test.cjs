/* Dependencies: firebase, @firebase/rules-unit-testing. A demo emulator only. */
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp,Timestamp}=require('firebase/firestore');
const fs=require('node:fs');
(async()=>{
 const fragment=fs.readFileSync(require('node:path').join(__dirname,'../../docs/public-site/booking-enquiries.rules.fragment'),'utf8');
 const env=await initializeTestEnvironment({projectId:'demo-lk-public',firestore:{host:'127.0.0.1',port:8088,rules:`rules_version = '2';service cloud.firestore {match /databases/{database}/documents {${fragment}}}`}});
 const db=env.unauthenticatedContext().firestore();
 const valid=()=>({status:'pending',source:'Live Karaoke Website',sourceKey:'live-karaoke',type:'Live Karaoke',performerType:'Live Karaoke',name:'Test visitor',email:'visitor@example.com',phone:'',eventType:'Corporate Event',preferredDate:'',venueOrLocality:'',company:'',estimatedGuests:null,message:'Test enquiry\nwith a newline.',pageUrl:'https://livekaraoke.github.io/online/',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 const ref=doc(db,'bookingEnquiries','valid');
 await assertSucceeds(setDoc(ref,valid()));
 let index=0;
 for(const change of [{extra:'unexpected'},{name:''},{name:' '.repeat(3)},{name:'x'.repeat(81)},{email:'bad-email'},{phone:12},{eventType:'not allowed'},{status:'approved'},{sourceKey:'other'},{estimatedGuests:-1},{estimatedGuests:1.5},{estimatedGuests:'10'},{estimatedGuests:100001},{message:'\n<script>invalid</script>\n'},{message:'bad\x00data'},{message:'x'.repeat(1501)},{message:' \n\t '},{createdAt:Timestamp.fromMillis(0)},{pageUrl:'https://attacker.example/'}]) {
  await assertFails(setDoc(doc(db,'bookingEnquiries','invalid-'+(++index)),{...valid(),...change}));
 }
 const missing=valid();delete missing.phone;await assertFails(setDoc(doc(db,'bookingEnquiries','missing'),missing));
 await assertFails(getDoc(ref));await assertFails(getDocs(collection(db,'bookingEnquiries')));await assertFails(updateDoc(ref,{message:'edited'}));await assertFails(deleteDoc(ref));
 await assertFails(setDoc(doc(db,'arbitrary','document'),valid()));
 console.log('PASS: valid enquiry; 20 invalid payloads rejected; anonymous read/list/update/delete and arbitrary collection writes rejected.');
 await env.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
