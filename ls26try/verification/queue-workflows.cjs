const vm=require('vm'),fs=require('fs'),assert=require('assert'),{webcrypto}=require('crypto');
const ctx={console,Date,Map,Set,Promise,crypto:webcrypto,queueMicrotask,localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null,setItem(){}},document:{readyState:'loading',getElementById:()=>null,addEventListener(){}},Event:class{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},window:null};ctx.window=ctx;ctx.addEventListener=()=>{};ctx.dispatchEvent=()=>{};ctx.ArtistNames=require('../shared/artist-names.js');vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'firebase-fixture.js'),'utf8'),ctx);ctx.firebase.initializeApp({projectId:'test'});ctx.db=ctx.firebase.firestore();ctx.LK={db:ctx.db};
// Test-only access to closed-over state, not shipped in the application.
let source=fs.readFileSync(require('path').join(__dirname,'../admin-new/js/top-statusbar-session-tools.js'),'utf8');source=source.replace('  const $ = id => document.getElementById(id);','  window.__state=state;\n  const $ = id => document.getElementById(id);');
source=source.replace('  function setStatusExpanded(expanded) {','  window.__statusExpandTest={expand:setStatusExpanded};\n  function setStatusExpanded(expanded) {');
vm.runInContext(source,ctx);Object.assign(ctx.__state,{db:ctx.db,sessionId:'s1',session:{id:'s1'},requests:[{id:'r0',...ctx.__fixture.data['publicSongRequests/r0']}],runOrder:ctx.__fixture.data['karaokeControl/runOrder']});
(async()=>{const a=ctx.LK.sessionTools.actions;await a.acceptRequest('r0');await a.acceptRequest('r0');assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items.filter(x=>x.requestId==='r0').length,1);assert.equal(ctx.__fixture.data['publicSongRequests/r0'].status,'queued');assert.equal(await a.moveRunOrder('q0',1),false);assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[0].id,'q0');assert.equal(await a.moveRunOrder('q2',-1),true);assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[0].id,'q0');assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[1].id,'q2');ctx.__fixture.data['publicSongRequests/r1'].sessionId='other';await a.acceptRequest('r1');assert.equal(ctx.__fixture.data['publicSongRequests/r1'].status,'pending');await ctx.LK.sessionTools.enqueueSong({firebaseId:'new',title:'New Song',artist:'Demo'});assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items.at(-1).songId,'new');await ctx.LK.sessionTools.enqueueSong({firebaseId:'song2',title:'Paper Satellites'},{next:true});
assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[1].songId,'song2');
assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items.filter(x=>x.songId==='song2').length,1);
await ctx.LK.sessionTools.enqueueSong({firebaseId:'fresh',title:'Fresh Song'},{next:true});
assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[1].songId,'fresh');
assert.equal(ctx.__fixture.data['karaokeControl/runOrder'].items[0].id,'q0');
await assert.rejects(()=>ctx.LK.sessionTools.enqueueSong({firebaseId:'song0'},{next:true}));
ctx.__state.sessionId='other';await assert.rejects(()=>ctx.LK.sessionTools.enqueueSong({firebaseId:'bad'}));ctx.__state.sessionId='';
ctx.__fixture.data['karaokeControl/runOrder'].sessionId='';
const pre=ctx.__fixture.data['karaokeControl/runOrder'].items.map(x=>x.id);
const preIndex=pre.indexOf('q2');
assert.ok(preIndex>=0&&preIndex<pre.length-1,'pre-session fixture needs movable song');
assert.equal(await a.moveRunOrder('q2',1),true,'pre-session Move Down should succeed');
const after=ctx.__fixture.data['karaokeControl/runOrder'].items.map(x=>x.id);
assert.equal(after.indexOf('q2'),preIndex+1,'pre-session persisted queue order');
assert.equal(ctx.__state.runOrder.items.map(x=>x.id).indexOf('q2'),preIndex+1,'UI cache reflects committed order before snapshot');
console.log('PASS: pre-session Run Order down arrow persists and immediately updates host UI cache.');
console.log('PASS: Library enqueue and session mismatch guard; atomic/idempotent acceptance, current song cannot reorder, queued song reorder, foreign-session request rejected.');
// Requests arriving do NOT expand the dashboard. Only an explicit expansion
// chooses Pending Requests when one or more actionable requests exist.
const dom={};
const classes=(initial=[])=>{
  const names=new Set(initial);
  return {
    add:x=>names.add(x),remove:x=>names.delete(x),
    contains:x=>names.has(x),
    toggle:(x,on)=>on?names.add(x):names.delete(x)
  };
};
const bar={classList:classes(['collapsed']),querySelector:()=>null};
dom.topStatusBar=bar;
for(const [name,id] of [['pending','tsPending'],['notes','tsNotes'],['session','tsSessionStatus']]){
  dom[id+'Tab']={classList:classes(),setAttribute(){}};
  dom[id+'Pane']={classList:classes(),hidden:true};
}
ctx.document.getElementById=id=>dom[id]||null;
const expand=ctx.__statusExpandTest.expand,choose=ctx.LK.sessionTools.setWorkflowTab;
ctx.__state.sessionId='s1';
ctx.__state.requests=[{id:'r-a',status:'pending'}];
assert.equal(bar.classList.contains('collapsed'),true,'New pending requests must not auto-expand');
expand(false);
assert.equal(bar.classList.contains('collapsed'),true,'Stays collapsed until the host expands');
expand(true);
assert.equal(bar.classList.contains('collapsed'),false,'Host expansion still works');
assert.equal(dom.tsPendingPane.hidden,false,'Pending Requests opens on host expansion with pending requests');
choose('notes');
expand(true);
assert.equal(dom.tsNotesPane.hidden,false,'No focus stealing while already expanded');
expand(false);
expand(true);
assert.equal(dom.tsPendingPane.hidden,false,'Next manual expansion chooses Pending Requests again');
expand(false);
choose('notes');
ctx.__state.requests=[{id:'r-b',status:'cancelled'}];
expand(true);
assert.equal(dom.tsNotesPane.hidden,false,'Cancelled requests alone must not select Pending Requests');
expand(false);
ctx.__state.requests=[{id:'r-b',status:'queued'}];
expand(true);
assert.equal(dom.tsNotesPane.hidden,false,'Accepted requests alone do not select Pending Requests');
expand(false);
ctx.__state.requests=[];
expand(true);
assert.equal(dom.tsNotesPane.hidden,false,'Without pending requests, the selected tab is preserved');
expand(false);
ctx.__state.requests=[{id:'r-c',status:'waiting'}];
expand(true);
assert.equal(dom.tsPendingPane.hidden,false,'Waiting requests are actionable and select Pending Requests');
console.log('PASS: Top Status Bar stays collapsed on arrivals, selects pending only upon manual expansion, and preserves manual tab choice.');
})().catch(e=>{console.error(e);process.exit(1)});
