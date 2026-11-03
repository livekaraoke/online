const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const utils=require('../admin-new/js/session-history-correction.js');
const gig=require('../admin-new/js/gig-operations.js');
const read=p=>fs.readFileSync(path.join(__dirname,'../admin-new',p),'utf8');

test('Malta dates round-trip as local datetime inputs without changing a timestamp',()=>{
 const date=new Date('2026-11-03T00:30:00.000Z');
 const value=utils.asInput(date);
 assert.equal(value,'2026-11-03T01:30');
 assert.equal(utils.parseInput(value,gig.maltaTime).getTime(),date.getTime());
});
test('night gig schedule edits allow cross-midnight but reject negative intervals',()=>{
 const start=utils.parseInput('2026-11-03T23:30',gig.maltaTime);
 const end=utils.parseInput('2026-11-04T02:30',gig.maltaTime);
 assert.equal(utils.validateTimes({scheduledStart:start,scheduledEnd:end}),true);
 assert.throws(()=>utils.validateTimes({scheduledStart:end,scheduledEnd:start}),/Scheduled end/);
 assert.throws(()=>utils.validateTimes({scheduledStart:start,scheduledEnd:end,actualEnd:end}),/actual start/i);
 assert.throws(()=>utils.validateTimes({scheduledStart:start,scheduledEnd:end,actualStart:end,actualEnd:start}),/Actual end/);
 assert.throws(()=>utils.parseInput('2027-03-28T02:30',gig.maltaTime),/time/i);
});
test('changing act or venue regenerates title with gig date, not current date',()=>{
 assert.equal(utils.titleFor('Roxanna','Black Gold Saloon',new Date('2026-11-03T00:30:00.000Z')),
   'Roxanna @ Black Gold Saloon TUE 03/11');
});
test('Session History shows venue and act above the four real editable timestamps',()=>{
 const source=read('js/performance-sessions.js');
 const identity=source.indexOf('correctionCard(session,"VENUE"');
 const act=source.indexOf('correctionCard(session,"ACT TYPE"');
 const start=source.indexOf('correctionCard(session,"SCHEDULED START"');
 assert.ok(identity>=0&&act>identity&&start>act);
 for(const name of ['SCHEDULED END','ACTUAL START','ACTUAL END'])assert.match(source,new RegExp('correctionCard\\(session,"'+name+'"'));
 assert.doesNotMatch(source,/editableFinishedCard\(session,"actualStart"/);
 assert.match(source,/sessionHistorySummary\(session, detail\)/);
 assert.match(source,/sessionHistorySummary\(session,detail\)/);
});
test('Archive editor verifies linked session, writes transaction, keeps IDs and request/song snapshots intact',()=>{
 const source=read('js/session-history-editor.js');
 assert.match(source,/db\.runTransaction\(async tx/);
 assert.match(source,/ev\.linkedSessionId!==id/);
 assert.match(source,/current\.status==="active"/);
 assert.match(source,/live\.active===true/);
 assert.match(source,/tx\.update\(eventRef,eventPatch\)/);
 assert.match(source,/tx\.update\(ref,sessionPatch\)/);
 assert.match(source,/tx\.update\(financeRef,/);
 assert.match(source,/sessionCorrectionHistory:history/);
 assert.doesNotMatch(source,/tx\.delete\(/);
 assert.doesNotMatch(source,/playedSongsSnapshot\s*:/);
 assert.doesNotMatch(source,/requestSnapshot\s*:/);
});
test('Session History popup is contained within visual viewport and summary is collapsible',()=>{
 const html=read('performance-sessions.html');
 const css=read('css/performance-sessions.css');
 assert.match(html,/id="sessionCorrectionModal"/);
 assert.match(html,/session-history-editor\.js/);
 assert.match(css,/max-height:calc\(100dvh - 20px\)/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/history-gig-summary/);
 assert.match(css,/history-correction-modal/);
});


test('archived venue reassignment transaction updates only this session, linked gig and private finance',async()=>{
 const vm=require('node:vm');
 const script=read('js/session-history-editor.js');
 const actions={},elements={};
 const element=id=>elements[id]||(elements[id]={
   value:'',innerHTML:'',textContent:'',disabled:false,hidden:false,
   classList:{add(){},remove(){}},
   addEventListener:(type,handler)=>{actions[id+':'+type]=handler;}
 });
 const stamp=s=>({toDate:()=>new Date(s)});
 const docs={
   'performanceSessions/s1':{
     id:'s1',eventId:'g1',status:'ended',venueId:'v1',venue:'Black Gold',
     title:'Solo @ Black Gold 23/10',sessionType:'Solo',type:'Solo',
     scheduledStartAt:stamp('2026-10-23T19:00:00Z'),
     requestSnapshot:[{id:'request1'}],playedSongsSnapshot:[{id:'song1'}]
   },
   'upcomingEvents/g1':{linkedSessionId:'s1',name:'Solo @ Black Gold 23/10',type:'Solo',venueId:'v1',venue:'Black Gold'},
   'gigFinances/g1':{agreedFee:200,venueId:'v1'},
   'karaokeControl/currentSession':{active:false},
   'karaokeControl/eventTypes':{options:['Solo','Roxanna','Live Karaoke']},
   'venues/v1':{name:'Black Gold',locality:'Sliema'},
   'venues/v2':{name:'Black Gold Saloon',locality:'Sliema'}
 };
 const updated=[];
 const doc=(collection,id)=>({
   path:collection+'/'+id,
   get:async()=>({exists:Object.hasOwn(docs,collection+'/'+id),data:()=>docs[collection+'/'+id]})
 });
 const db={
   collection:name=>({
     doc:id=>doc(name,id),
     get:async()=>({docs:Object.keys(docs).filter(x=>x.startsWith(name+'/')).map(key=>({
       id:key.split('/')[1],data:()=>docs[key]
     }))})
   }),
   runTransaction:async fn=>{
     const changes=[];
     await fn({
       get:async ref=>({exists:Object.hasOwn(docs,ref.path),data:()=>docs[ref.path]}),
       update:(ref,patch)=>changes.push({path:ref.path,patch})
     });
     updated.push(...changes);
     for(const {path,patch} of changes)docs[path]={...docs[path],...patch};
   }
 };
 const context={
   window:{
     db,auth:{currentUser:{uid:'owner'}},
     LS26GigOps:gig,LS26SessionCorrection:utils,
     LS26Dialogs:{confirm:async()=>true,alert:async()=>{}}
   },
   document:{readyState:'complete',getElementById:element},
   firebase:{firestore:{
     Timestamp:{fromDate:date=>({toDate:()=>date})},
     FieldValue:{serverTimestamp:()=>({server:true})}
   }},
   console
 };
 vm.runInNewContext(script,context);
 let refreshed=false;
 await context.window.LS26SessionHistoryEditor.open({id:'s1',...docs['performanceSessions/s1']},'identity',async()=>{refreshed=true;});
 assert.equal(elements.sessionCorrectionVenue.disabled,false);
 elements.sessionCorrectionVenue.value='v2';
 elements.sessionCorrectionAct.value='Roxanna';
 await actions['sessionCorrectionForm:submit']({preventDefault(){}});
 assert.equal(elements.sessionCorrectionMessage.textContent,'Correction saved.');
 assert.equal(refreshed,true);
 assert.deepEqual(updated.map(x=>x.path),['upcomingEvents/g1','performanceSessions/s1','gigFinances/g1']);
 assert.equal(docs['performanceSessions/s1'].venueId,'v2');
 assert.equal(docs['performanceSessions/s1'].sessionType,'Roxanna');
 assert.equal(docs['performanceSessions/s1'].title,'Roxanna @ Black Gold Saloon FRI 23/10');
 assert.equal(docs['upcomingEvents/g1'].name,'Roxanna @ Black Gold Saloon FRI 23/10');
 assert.equal(docs['gigFinances/g1'].venueId,'v2');
 assert.deepEqual(docs['performanceSessions/s1'].requestSnapshot,[{id:'request1'}]);
 assert.deepEqual(docs['performanceSessions/s1'].playedSongsSnapshot,[{id:'song1'}]);
 assert.equal(docs['performanceSessions/s1'].sessionCorrectionHistory.length,1);
});


test('weekday name follows the actual Malta gig date without duplicates or changing custom names',()=>{
 assert.equal(utils.withWeekday('Live Karaoke @ Venue 03/11','2026-11-03'),'Live Karaoke @ Venue TUE 03/11');
 assert.equal(utils.withWeekday('Roxanna @ Venue 01/08','2027-08-01'),'Roxanna @ Venue SUN 01/08');
 assert.equal(utils.withWeekday('Solo @ Venue FRI 23/10','2026-10-23'),'Solo @ Venue FRI 23/10');
 assert.equal(utils.withWeekday('Solo @ Venue MON 23/10','2026-10-23'),'Solo @ Venue FRI 23/10');
 assert.equal(utils.withWeekday('Wedding Celebration','2026-10-23'),'Wedding Celebration');
 assert.equal(utils.withWeekday('Solo @ Venue 24/10','2026-10-23'),'Solo @ Venue 24/10');
 assert.equal(utils.titleFor('Solo','Venue','2026-10-23'),'Solo @ Venue FRI 23/10');
});

test('insights appear below session metrics and are expanded by default',()=>{
 const js=read('js/performance-sessions.js'),css=read('css/performance-sessions.css');
 assert.match(js,/<details class="history-gig-summary" open>/);
 const bodyStart=js.indexOf('$("sessionModalContent").innerHTML');
 const body=js.slice(bodyStart,js.indexOf('    $("sessionDetailModal").classList.remove',bodyStart));
 const header=body.indexOf('<div class="session-detail-header">');
 const metrics=body.indexOf('<div class="detail-grid history-session-metrics">');
 const insights=body.indexOf('sessionHistorySummary(session, detail)');
 const notes=body.indexOf('SESSION NOTES');
 assert.ok(header>=0 && metrics>header && insights>metrics && notes>insights);
 assert.match(css,/\.session-modal \.history-session-close/);
});

test('session close button is in the header below browser chrome, with no extra injected X',()=>{
 const html=read('performance-sessions.html'),js=read('js/performance-sessions.js');
 assert.match(html,/id="sessionDetailModal"[^>]*data-ls26-close="native"/);
 assert.match(js,/class="history-session-close" onclick="closeSessionModal\(\)"/);
 assert.match(read('css/performance-sessions.css'),/padding:18px 2px 14px!important/);
});

test('new sessions persist weekday name and archive displays it without altering the stored title',()=>{
 const startup=read('js/sessions.js'),dashboard=read('admin.html'),history=read('js/performance-sessions.js');
 assert.match(dashboard,/session-history-correction\.js\?v=20261103-weekday-names/);
 assert.match(startup,/LS26SessionCorrection\?\.withWeekday/);
 assert.match(history,/function displaySessionTitle\(session\)/);
 assert.match(history,/esc\(displaySessionTitle\(session\)\)/);
});
