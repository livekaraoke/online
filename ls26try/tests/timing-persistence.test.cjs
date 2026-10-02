/* Entirely local DOM + optimistic Firestore mock. No Firebase SDK/network. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const model=require('../shared/timing-model.js'),store=require('../shared/timing-store.js');
const {create:transport}=require('../shared/musical-transport.js');
const {document}=parseHTML('<html><body></body></html>');
const copy=value=>JSON.parse(JSON.stringify(value));
const song=html=>({title:'Fixture',artist:'Local',timeSignature:'4/4',sections:[{type:'lyrics',title:'VERSE',html}]});
const source=html=>model.buildSource(song(html),document);
async function timed(html){let draft=await model.createDraft(await source(html));for(const event of draft.events)draft=model.setDuration(draft,event.id,1.5);return draft;}
const ids=timing=>timing.events.map(e=>e.id);
const path=store.pathFor('fixture');
function database(initial){
 const rows=new Map(Object.entries(initial).map(([k,v])=>[k,copy(v)])),versions=new Map(),calls=[];
 const bump=(key,value)=>{rows.set(key,copy(value));versions.set(key,(versions.get(key)||0)+1);};
 const snap=key=>({exists:rows.has(key),data:()=>copy(rows.get(key))});
 const db={calls,rows,bump,failGet:null,failTransaction:null,beforeCommit:null,
  doc:key=>({path:key,async get(options){calls.push(['get',key,options]);if(db.failGet)throw db.failGet;return snap(key);}}),
  async runTransaction(callback){
   if(db.failTransaction)throw db.failTransaction;
   for(let attempt=0;attempt<4;attempt++){
    const reads=new Map(),writes=[];
    const result=await callback({async get(ref){assert.equal(writes.length,0,'all reads precede writes');calls.push(['tx-get',ref.path]);reads.set(ref.path,versions.get(ref.path)||0);return snap(ref.path);},
     set(ref,value){writes.push([ref.path,copy(value)]);}});
    if(db.beforeCommit){const hook=db.beforeCommit;db.beforeCommit=null;await hook();}
    if([...reads].some(([key,version])=>(versions.get(key)||0)!==version)){calls.push(['retry']);continue;}
    for(const [key,value]of writes){bump(key,value);calls.push(['write',key]);}return result;
   }
   throw Object.assign(Error('Too much contention'),{code:'aborted'});
  }
 };return db;
}
async function fixture(html='G D G C'){
 const parent=song(html),db=database({'lyrics/fixture':parent}),api=store.create({db,document});
 const opened=await api.load('fixture',parent),draft=await timed(html);
 return {parent,db,api,opened,draft};
}
test('versioned document, numeric half beats and deterministic ordering',async()=>{
 let t=await timed('A Am A7 Am7 Amaj7 Asus2 Asus4 Aadd9 A5 A# Bb F#m C/G Bbmaj7/D');
 assert.equal(t.schemaVersion,1);assert.equal(t.revision,0);assert.equal(t.events.length,14);
 for(const n of [.5,1,1.5,2,2.5,3,3.5,4]){t=model.setDuration(t,t.events[0].id,n);await model.validate(t);}
 for(const bad of ['1.5',0,-.5,.25,NaN,Infinity])assert.throws(()=>model.setDuration(t,t.events[0].id,bad));
 const reverse=copy(t);reverse.events.reverse();await assert.rejects(model.validate(reverse),/order/);
 assert.ok(!JSON.stringify(t).includes('<'));assert.equal(new Set(ids(t)).size,14);
});
test('save/reload preserves repeated opaque IDs and slash chord snapshots',async()=>{
 const {api,db,parent,opened,draft}=await fixture('G D G C C/G Bbmaj7/D');
 const saved=await api.save('fixture',{timing:draft,base:opened.base});assert.equal(saved.status,'SAVED');assert.equal(saved.timing.revision,1);
 const loaded=await api.load('fixture',parent);assert.equal(loaded.status,'VALID');assert.deepEqual(ids(loaded.timing),ids(draft));assert.notEqual(ids(draft)[0],ids(draft)[2]);
 assert.deepEqual(loaded.timing.events.slice(-2).map(e=>[e.chord,e.durationBeats]),[['C/G',1.5],['Bbmaj7/D',1.5]]);
 assert.deepEqual(db.rows.get('lyrics/fixture'),parent);assert.equal(db.calls.filter(c=>c[0]==='write').length,1);
});
test('untimed loading does one server read and never creates a document',async()=>{
 const {opened,db}=await fixture();assert.equal(opened.status,'UNTIMED');assert.equal(opened.timing,null);assert.equal(opened.base,null);
 assert.deepEqual(db.calls,[['get',path,{source:'server'}]]);assert.equal(db.rows.has(path),false);
});
test('exact source is VALID and styles/HTML wrappers do not change fingerprints',async()=>{
 const t=await timed('<p><b>G</b> D G C</p>');
 const next=await source('<div style="font-size:80px"><strong style="color:red">G</strong> D G C</div>');
 assert.equal(next.fingerprint,t.source.fingerprint);const result=await model.reconcile(t,next);assert.equal(result.status,'VALID');assert.deepEqual(ids(result.timing),ids(t));
});
test('lyrics-only edits on another line retain timing without rendered positions',async()=>{
 const t=await timed('G D G C<br>Old lyric words');const next=await source('G D G C<br>New lyric words');
 assert.notEqual(t.source.fingerprint,next.fingerprint);assert.equal(t.source.musicalFingerprint,next.musicalFingerprint);
 const r=await model.reconcile(t,next);assert.equal(r.status,'RECONCILED');assert.deepEqual(ids(r.timing),ids(t));
});
test('same-line lyric edits with unchanged unique chord anchors retain timing',async()=>{
 const t=await timed('<b>G</b> old words <b>D</b>');
 const r=await model.reconcile(t,await source('<b>G</b> new words <b>D</b>'));
 assert.equal(r.status,'RECONCILED');assert.deepEqual(ids(r.timing),ids(t));
});
test('new separate chord line preserves safely matched events and remains untimed',async()=>{
 const t=await timed('G D G C<br>Am F');const r=await model.reconcile(t,await source('G D G C<br>Em<br>Am F'));
 assert.equal(r.status,'PARTIAL');assert.deepEqual(ids(r.timing).slice(0,4),ids(t).slice(0,4));assert.deepEqual(ids(r.timing).slice(5),ids(t).slice(4));
 assert.equal(r.timing.events[4].durationBeats,undefined);assert.equal(r.timing.unresolved.length,0);
});
test('deleted event cannot donate duration to a surviving same-named chord',async()=>{
 let t=await timed('G D<br>G C');t=model.setDuration(t,t.events[0].id,4);t=model.setDuration(t,t.events[2].id,.5);
 const r=await model.reconcile(t,await source('G C'));assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.timing.events[0].id,t.events[2].id);assert.equal(r.timing.events[0].durationBeats,.5);
 assert.equal(r.timing.unresolved.find(x=>x.event.id===t.events[0].id).event.durationBeats,4);
});
test('repeated identical insertion within a changed line never shifts timings by index',async()=>{
 const t=await timed('G D G C');const r=await model.reconcile(t,await source('G D G G C'));
 assert.equal(r.status,'NEEDS_REVIEW');assert.equal(r.timing.unresolved.length,4);assert.equal(new Set(ids(r.timing)).size,5);
 assert.ok(r.timing.events.every(e=>e.durationBeats===undefined&&!ids(t).includes(e.id)));
 const again=await model.reconcile(r.timing,r.timing.source);assert.equal(again.status,'NEEDS_REVIEW');assert.equal(again.timing.unresolved.length,4);
});
test('moving a unique unchanged line preserves IDs; an individual move requires review',async()=>{
 const t=await timed('G D G C<br>Am F');const r=await model.reconcile(t,await source('Am F<br>G D G C'));
 assert.equal(r.status,'RECONCILED');assert.deepEqual(ids(r.timing).slice(2),ids(t).slice(0,4));
 const uncertain=await model.reconcile(await timed('G D G C'),await source('G G D C'));assert.equal(uncertain.status,'NEEDS_REVIEW');
});
test('unique section reorder is detected and safely reconciled',async()=>{
 const original={sections:[{type:'lyrics',title:'VERSE',html:'G D G C'},{type:'lyrics',title:'CHORUS',html:'Am F'}]};
 let t=await model.createDraft(await model.buildSource(original,document));for(const e of t.events)t=model.setDuration(t,e.id,2);
 const next=await model.buildSource({sections:[...original.sections].reverse()},document);assert.notEqual(next.fingerprint,t.source.fingerprint);
 const r=await model.reconcile(t,next);assert.equal(r.status,'RECONCILED');assert.deepEqual(ids(r.timing).slice(2),ids(t).slice(0,4));
});
test('Am to Am7 preserves identity/duration when one unique template proves correspondence',async()=>{
 const t=await timed('<b>Am</b>  <b>D</b>');const r=await model.reconcile(t,await source('<b>Am7</b>  <b>D</b>'));
 assert.equal(r.status,'RECONCILED');assert.deepEqual(ids(r.timing),ids(t));assert.equal(r.timing.events[0].chord,'Am7');assert.equal(r.timing.events[0].durationBeats,1.5);
});
test('duplicate line templates and multi-symbol swaps are ambiguous',async()=>{
 const t=await timed('G D<br>G D');const r=await model.reconcile(t,await source('G Am<br>G D'));assert.equal(r.status,'NEEDS_REVIEW');
 const swap=await model.reconcile(await timed('G D'),await source('D G'));assert.equal(swap.status,'NEEDS_REVIEW');
});
test('explicit validated resolution can match movement or discard deleted events',async()=>{
 const t=await timed('G D G C'),s=await source('G G D C');
 const options={expectedFingerprint:t.source.fingerprint,matches:[{eventId:t.events[2].id,candidateIndex:0}]};
 const r=await model.reconcile(t,s,options);assert.equal(r.timing.events[0].id,t.events[2].id);
 await assert.rejects(model.reconcile(t,s,{...options,expectedFingerprint:'stale'}));
 await assert.rejects(model.reconcile(t,s,{...options,matches:[...options.matches,...options.matches]}));
 const deleted=await model.reconcile(t,await source('G D G'),{expectedFingerprint:t.source.fingerprint,discardEventIds:ids(t)});
 assert.equal(deleted.timing.unresolved.length,0);assert.equal(deleted.status,'PARTIAL');
});
test('meter uses quarter transport beats and represents 3/4 and 6/8 without rewriting song',async()=>{
 for(const signature of ['3/4','6/8','7/8']){
  const parent={...song('G'),timeSignature:signature},before=copy(parent),s=await model.buildSource(parent,document);
  assert.equal(s.meter.beatUnit,Number(signature.split('/')[1]));assert.equal(s.meter.transportBeatUnit,4);assert.deepEqual(parent,before);
 }
 const s=await model.buildSource({sections:[]},document);assert.deepEqual(s.meter,{beatsPerBar:4,beatUnit:4,transportBeatUnit:4,assumed:true});
 await assert.rejects(model.buildSource({...song('G'),timeSignature:'unrecognized'},document));
 const t=await timed('G'),next=await model.buildSource({...song('G'),timeSignature:'3/4'},document);
 const r=await model.reconcile(t,next);assert.equal(r.status,'NEEDS_REVIEW');assert.ok(r.timing.reviewReasons.includes('meter-changed'));
 const accepted=await model.reconcile(t,next,{expectedFingerprint:t.source.fingerprint,acceptMeter:true});assert.equal(accepted.status,'RECONCILED');
});
test('making the assumed default 4/4 explicit does not invalidate timing',async()=>{
 const original={sections:[{type:'lyrics',title:'VERSE',html:'G'}]};
 let t=await model.createDraft(await model.buildSource(original,document));t=model.setDuration(t,t.events[0].id,4);
 const next=await model.buildSource({...original,timeSignature:'4/4'},document);
 assert.equal(next.fingerprint,t.source.fingerprint);const result=await model.reconcile(t,next);
 assert.equal(result.status,'VALID');assert.equal(result.timing.meter.assumed,false);assert.deepEqual(ids(result.timing),ids(t));
});
test('unknown/outdated schema, corrupt source, unsupported kind and duplicate IDs are rejected',async()=>{
 const t=await timed('G D');
 for(const version of [0,2,undefined]){const bad=copy(t);bad.schemaVersion=version;await assert.rejects(model.validate(bad),e=>e.code==='UNSUPPORTED_SCHEMA');}
 const bad=copy(t);bad.source.fingerprint='sha256:'+'0'.repeat(64);await assert.rejects(model.validate(bad),/fingerprint/);
 const duplicate=copy(t);duplicate.events[1].id=duplicate.events[0].id;await assert.rejects(model.validate(duplicate),/duplicate/);
 const future=copy(t);future.events[0].kind='rest';await assert.rejects(model.validate(future),e=>e.code==='UNSUPPORTED_EVENT');
});
test('invalid/future persisted data and denied reads are not treated as an untimed song',async()=>{
 const {api,db,parent,draft}=await fixture();db.bump(path,{...draft,schemaVersion:2,revision:1});
 assert.equal((await api.load('fixture',parent)).status,'UNSUPPORTED');
 assert.equal((await api.save('fixture',{timing:draft,base:null})).status,'UNSUPPORTED');
 db.failGet=Object.assign(Error('Denied'),{code:'permission-denied'});const denied=await api.load('fixture',parent);
 assert.equal(denied.status,'UNAVAILABLE');assert.equal(denied.base,undefined);assert.equal(db.calls.filter(c=>c[0]==='write').length,0);
});
test('one compact save writes only the timing document; duration editing and playback do no I/O',async()=>{
 const {api,db,draft}=await fixture();db.calls.length=0;
 let next=draft;for(const event of draft.events)next=model.setDuration(next,event.id,4.5);
 let now=0;const t=transport({now:()=>now,bpm:120});t.start();for(let i=0;i<100;i++){now+=.25;t.getBeat();}t.pause();t.resume();t.stop();
 assert.equal(db.calls.length,0);const saved=await api.save('fixture',{timing:next,base:null});assert.equal(saved.status,'SAVED');
 assert.deepEqual(db.calls.map(c=>c.slice(0,2)),[['tx-get','lyrics/fixture'],['tx-get',path],['write',path]]);
});
test('two loaded editors cannot silently overwrite a newer timing revision',async()=>{
 const {api,db,parent,draft}=await fixture();await api.save('fixture',{timing:draft,base:null});
 const a=await api.load('fixture',parent),b=await api.load('fixture',parent);
 const changed=model.setDuration(a.timing,a.timing.events[0].id,4);const saved=await api.save('fixture',{timing:changed,base:a.base});assert.equal(saved.status,'SAVED');assert.equal(saved.base.revision,2);
 const conflict=await api.save('fixture',{timing:b.timing,base:b.base});assert.equal(conflict.code,'TIMING_CHANGED');assert.equal(conflict.status,'CONFLICT');assert.equal(db.rows.get(path).events[0].durationBeats,4);
});
test('timing creation race and delete/recreate generation mismatch cause conflicts',async()=>{
 const {api,db,draft}=await fixture();const other=await timed('G D G C');await api.save('fixture',{timing:other,base:null});
 assert.equal((await api.save('fixture',{timing:draft,base:null})).code,'TIMING_CHANGED');
 const current=copy(db.rows.get(path)),replacement=await timed('G D G C');db.bump(path,{...replacement,revision:1});
 assert.equal((await api.save('fixture',{timing:current,base:{generation:current.generation,revision:1}})).code,'TIMING_CHANGED');
});
test('stale song structure, unsaved lyrics and missing parent prevent timing writes',async()=>{
 const {api,db,draft}=await fixture();db.bump('lyrics/fixture',song('G D G G C'));
 assert.equal((await api.save('fixture',{timing:draft,base:null})).code,'SOURCE_CHANGED');
 db.rows.delete('lyrics/fixture');assert.equal((await api.save('fixture',{timing:draft,base:null})).code,'SONG_MISSING');
 assert.equal(db.calls.filter(c=>c[0]==='write').length,0);
});
test('optimistic retry detects source changes occurring during the save transaction',async()=>{
 const {api,db,draft}=await fixture();db.beforeCommit=()=>db.bump('lyrics/fixture',song('G D G G C'));
 const result=await api.save('fixture',{timing:draft,base:null});assert.equal(result.code,'SOURCE_CHANGED');assert.equal(db.calls.filter(c=>c[0]==='retry').length,1);assert.equal(db.calls.filter(c=>c[0]==='write').length,0);
});
test('optimistic retry detects another timing writer during commit',async()=>{
 const {api,db,draft}=await fixture();const other=await timed('G D G C');db.beforeCommit=()=>db.bump(path,{...other,revision:1});
 assert.equal((await api.save('fixture',{timing:draft,base:null})).code,'TIMING_CHANGED');assert.equal(db.calls.filter(c=>c[0]==='write').length,0);
});
test('review state survives save/reload; ordinary parent replacement leaves timing separate',async()=>{
 const {api,db,parent,draft}=await fixture();await api.save('fixture',{timing:draft,base:null});
 const changed=song('G D G G C');db.bump('lyrics/fixture',changed);const opened=await api.load('fixture',changed);assert.equal(opened.status,'NEEDS_REVIEW');
 const saved=await api.save('fixture',{timing:opened.timing,base:opened.base});assert.equal(saved.status,'SAVED');
 assert.equal((await api.load('fixture',changed)).status,'NEEDS_REVIEW');
 const before=copy(db.rows.get(path));db.bump('lyrics/fixture',{...changed,note:'Ordinary merge:false replacement'});assert.deepEqual(db.rows.get(path),before);
 assert.ok(!JSON.stringify(db.rows.get('lyrics/fixture')).includes(draft.events[0].id));assert.equal(parent.sections[0].html,'G D G C');
});
test('save fails closed for permission errors and invalid draft/base without writes',async()=>{
 const {api,db,draft}=await fixture();assert.equal((await api.save('fixture',{timing:draft})).status,'INVALID');
 const bad=copy(draft);bad.events[0].durationBeats='4';assert.equal((await api.save('fixture',{timing:bad,base:null})).status,'INVALID');
 db.failTransaction=Object.assign(Error('Denied'),{code:'permission-denied'});assert.equal((await api.save('fixture',{timing:draft,base:null})).status,'UNAVAILABLE');
 assert.equal(db.calls.filter(c=>c[0]==='write').length,0);assert.throws(()=>store.pathFor('nested/id'));
});
test('source hashing captures a coherent snapshot before asynchronous digest work',async()=>{
 const parent=song('G D');const pending=model.buildSource(parent,document);
 parent.timeSignature='7/8';parent.sections[0].html='Am F';
 const captured=await pending;assert.equal(captured.meter.beatsPerBar,4);assert.deepEqual(captured.sections[0].lines[0].slots.map(s=>s.chord),['G','D']);
});
test('browser module loading/local edits have no ambient database or playback side effects',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const fail=()=>{throw Error('Unexpected I/O or playback');};
 const ctx={window:{},crypto:require('node:crypto').webcrypto,TextEncoder,document,setTimeout:fail,setInterval:fail,fetch:fail,requestAnimationFrame:fail};
 for(const key of ['firebase','db','localStorage','sessionStorage'])Object.defineProperty(ctx,key,{get:fail});
 vm.createContext(ctx);
 for(const file of ['chord-foundation.js','timing-model.js','timing-store.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared',file),'utf8'),ctx);
 let draft=await ctx.window.LS26Timing.createDraft(await ctx.window.LS26Timing.buildSource(song('G D G C'),document));
 draft=ctx.window.LS26Timing.setDuration(draft,draft.events[0].id,.5);
 await ctx.window.LS26Timing.reconcile(draft,draft.source);
 ctx.window.LS26TimingStore.create({db:{doc:fail,runTransaction:fail},document});
});
