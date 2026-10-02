/* Actual workspace/controller DOM with isolated Firestore and dialogs. No network. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const model=require('../shared/timing-model.js'),stores=require('../shared/timing-store.js');
const workspace=require('../host/js/chord-timing-workspace.js');
const copy=model.clone;
const parent=html=>({title:'Local fixture',artist:'Fixture',timeSignature:'4/4',sections:[{type:'lyrics',title:'VERSE',html}]});
async function setup({html='G D G C C/G Bbmaj7/D',savedHtml,allowSave=true,songId='fixture',auth=null,ownerEmail=''}={}){
 const {window,document}=parseHTML(fs.readFileSync(path.join(__dirname,'../host/lyricscreator.html'),'utf8'));
 window.matchMedia=()=>({matches:true});
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {top:10,bottom:62,height:52,left:0,right:600,width:600};};
 const scrolls=[];window.HTMLElement.prototype.scrollBy=function(v){scrolls.push(v);};
 let current=parent(html),readError=null,saveError=null;
 const rows=new Map([['lyrics/'+songId,copy(current)]]),calls=[],confirmations=[],answers=[];
 const timingPath=stores.pathFor(songId||'unsaved');
 if(savedHtml!==undefined){
  let saved=await model.createDraft(await model.buildSource(parent(savedHtml),document));
  for(const [i,event] of saved.events.entries())saved=model.setDuration(saved,event.id,(i+1)*.5);
  saved.revision=1;rows.set(timingPath,saved);
 }
 const snap=key=>({exists:rows.has(key),data:()=>copy(rows.get(key))});
 const db={doc:key=>({path:key,async get(){calls.push(['get',key]);if(readError)throw readError;return snap(key);}}),async runTransaction(callback){
  if(saveError)throw saveError;
  const writes=[];const result=await callback({async get(ref){calls.push(['tx-get',ref.path]);return snap(ref.path);},set(ref,data){writes.push([ref.path,copy(data)]);}});
  for(const [key,data]of writes){rows.set(key,data);calls.push(['write',key]);}return result;
 }};
 const dialogs={async confirm(text,options){confirmations.push({text,options});return answers.length?answers.shift():true;}};
 const root=document.getElementById('chordTimingWorkspace');
 let reloads=0;
 const api=workspace.mount({document,window,root,songId,getSong:()=>copy(current),store:stores.create({db,document}),dialogs,allowSave,auth,ownerEmail,reloadSong:()=>reloads++});
 return {api,window,document,root,rows,calls,confirmations,answers,scrolls,timingPath,
  el:id=>document.getElementById(id),song:()=>copy(current),setSong:html=>current=parent(html),setMeter:value=>current.timeSignature=value,get reloads(){return reloads;},
  denyRead:()=>readError=Object.assign(Error('Denied'),{code:'permission-denied'}),allowRead:()=>readError=null,
  denySave:()=>saveError=Object.assign(Error('Denied'),{code:'permission-denied'})};
}
const click=(env,id)=>env.el(id).click();
const event=(env,target,key,extra={})=>{const e=new env.window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(e,{key,...extra});target.dispatchEvent(e);return e;};
const values=env=>env.api.snapshot().draft.events.map(e=>e.durationBeats);
test('mounting ordinary Creator adds zero timing I/O; first entry loads once without creating timing',async()=>{
 const e=await setup();assert.equal(e.root.hidden,true);assert.deepEqual(e.calls,[]);
 await e.api.enter();assert.equal(e.root.hidden,false);assert.equal(e.calls.length,1);assert.equal(e.rows.has(e.timingPath),false);assert.ok(values(e).every(x=>x===undefined));assert.equal(e.api.snapshot().dirty,false);
 await e.api.exit();await e.api.enter();assert.equal(e.calls.length,1);assert.equal(e.api.snapshot().dirty,false);
});
test('individual repeated and slash chords are selectable without mutating source',async()=>{
 const e=await setup(),before=JSON.stringify(e.song());await e.api.enter();
 assert.equal(e.root.querySelectorAll('[data-ct-index]').length,6);
 e.root.querySelector('[data-ct-index="2"]').click();const secondG=e.api.snapshot().selectedId;
 e.root.querySelector('[data-ct-index="0"]').click();assert.notEqual(e.api.snapshot().selectedId,secondG);
 e.api.select(4);assert.match(e.el('ctSelection').textContent,/C\/G/);e.api.select(5);assert.match(e.el('ctSelection').textContent,/Bbmaj7\/D/);
 assert.equal(JSON.stringify(e.song()),before);assert.equal(e.root.querySelectorAll('[aria-pressed="true"].ct-chord').length,1);
});
test('plus/minus affect only selected occurrence; half beat returns to untimed, never zero',async()=>{
 const e=await setup();await e.api.enter();e.api.select(2);
 for(const n of [.5,1,1.5,2,2.5,3,3.5]){click(e,'ctPlus');assert.equal(values(e)[2],n);}
 assert.ok(values(e).every((v,i)=>i===2||v===undefined));
 for(const n of [3,2.5,2,1.5,1,.5,undefined]){click(e,'ctMinus');assert.equal(values(e)[2],n);}
 click(e,'ctMinus');assert.equal(values(e)[2],undefined);assert.match(e.el('ctDuration').textContent,/—/);
});
test('presets, clear and custom validation are local and individually undoable',async()=>{
 const e=await setup();await e.api.enter();e.root.querySelector('[data-ct-preset="4"]').click();assert.equal(values(e)[0],4);
 click(e,'ctClear');assert.equal(values(e)[0],undefined);click(e,'ctUndo');assert.equal(values(e)[0],4);
 e.el('ctCustomValue').value='2.5';e.el('ctCustom').dispatchEvent(new e.window.Event('submit',{cancelable:true}));assert.equal(values(e)[0],2.5);
 for(const invalid of ['0','-1','1.2','NaN']){e.el('ctCustomValue').value=invalid;e.el('ctCustom').dispatchEvent(new e.window.Event('submit',{cancelable:true}));assert.equal(values(e)[0],2.5);}
 click(e,'ctUndo');assert.equal(values(e)[0],4);click(e,'ctUndo');assert.ok(values(e).every(v=>v===undefined));assert.equal(e.api.snapshot().dirty,false);
 assert.equal(e.calls.length,1);
});
test('next/previous stay within bounds and scroll only when selected chord is outside pane',async()=>{
 const e=await setup();await e.api.enter();e.el('ctSong').getBoundingClientRect=()=>({top:0,bottom:400});
 e.root.querySelectorAll('[data-ct-index]').forEach(b=>b.getBoundingClientRect=()=>({top:100,bottom:152}));
 click(e,'ctNext');assert.match(e.el('ctSelection').textContent,/Chord 2 of 6/);assert.equal(e.scrolls.length,0);
 const third=e.root.querySelector('[data-ct-index="2"]');third.getBoundingClientRect=()=>({top:450,bottom:502});click(e,'ctNext');assert.equal(e.scrolls.length,1);assert.equal(e.scrolls[0].top,118);
 click(e,'ctPrevious');assert.match(e.el('ctSelection').textContent,/Chord 2 of 6/);e.api.select(0);assert.equal(e.el('ctPrevious').disabled,true);e.api.select(5);assert.equal(e.el('ctNext').disabled,true);
});
test('50 edits and 100 navigations perform zero additional timing I/O',async()=>{
 const e=await setup();await e.api.enter();for(let i=0;i<50;i++){e.api.select(i%6);e.api.step(.5);}for(let i=0;i<100;i++)e.api.select(i%6);
 for(let i=0;i<30;i++)e.api.undo();assert.equal(e.calls.length,1);assert.equal(e.rows.has(e.timingPath),false);
});
test('dirty switch warns once, cancellation stays put, confirmation keeps local draft without reread',async()=>{
 const e=await setup();await e.api.enter();e.api.step(.5);const id=e.api.snapshot().selectedId;
 assert.match(e.el('ctSaveNote').textContent,/Unsaved/);e.answers.push(false);assert.equal(await e.api.exit(),false);assert.equal(e.api.snapshot().active,true);
 e.answers.push(true);assert.equal(await e.api.exit(),true);assert.equal(e.api.snapshot().dirty,true);assert.equal(e.root.hidden,true);
 await e.api.enter();assert.equal(e.api.snapshot().selectedId,id);assert.equal(values(e)[0],.5);assert.equal(e.calls.length,1);assert.equal(e.confirmations.length,2);
 const unload=new e.window.Event('beforeunload',{cancelable:true});e.window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
});
test('save uses one compact Stage 3 transaction, clears dirty/undo and reloads IDs/durations',async()=>{
 const e=await setup();await e.api.enter();e.api.select(4);e.api.setDuration(2.5);const id=e.api.snapshot().selectedId;
 e.calls.length=0;assert.equal(await e.api.save(),true);
 assert.deepEqual(e.calls.map(x=>x[0]),['tx-get','tx-get','write']);assert.equal(e.calls[2][1],e.timingPath);assert.equal(e.api.snapshot().dirty,false);assert.equal(e.api.snapshot().undoCount,0);assert.equal(e.api.snapshot().selectedId,id);
 await e.api.reload();assert.equal(e.api.snapshot().draft.events[4].id,id);assert.equal(values(e)[4],2.5);assert.equal(e.api.snapshot().base.revision,1);assert.match(e.el('ctSelection').textContent,/C\/G/);
});
test('production write gate stays disabled while local editing and lazy loading work',async()=>{
 const e=await setup({allowSave:false});await e.api.enter();e.api.step(.5);assert.equal(e.el('ctSave').disabled,true);assert.match(e.el('ctSaveNote').textContent,/needs setup/);
 assert.equal(await e.api.save(),false);assert.equal(e.calls.length,1);assert.equal(e.rows.has(e.timingPath),false);
});
test('new unsaved songs are local only and require ordinary song save first',async()=>{
 const e=await setup({songId:null});await e.api.enter();assert.equal(e.calls.length,0);e.api.step(.5);assert.equal(e.el('ctSave').disabled,true);assert.match(e.el('ctSaveNote').textContent,/Save this song/);
});
test('review clearly surfaces ambiguous timing and manual assignment resolves only one entry',async()=>{
 const e=await setup({html:'G D G G C',savedHtml:'G D G C'});await e.api.enter();
 assert.match(e.el('ctStatus').textContent,/review/);assert.equal(e.el('ctReviewToggle').hidden,false);click(e,'ctReviewToggle');assert.equal(e.el('ctReview').hidden,false);
 const before=e.api.snapshot().draft,oldId=before.unresolved[0].event.id;e.api.select(2);assert.equal(await e.api.assign(),true);
 const after=e.api.snapshot().draft;assert.equal(after.events[2].id,oldId);assert.equal(after.events[2].durationBeats,.5);assert.equal(after.unresolved.length,3);
 assert.ok(after.events.every((x,i)=>i===2||x.durationBeats===undefined));assert.equal(e.el('ctAssign').disabled,true);assert.equal(await e.api.assign(),false);
 assert.equal(new Set([...after.events,...after.unresolved.map(x=>x.event)].map(x=>x.id)).size,8);assert.match(e.confirmations[0].text,/chord 3/);
 e.api.undo();assert.deepEqual(e.api.snapshot().draft,before);assert.equal(e.api.snapshot().draft.unresolved.length,4);
});
test('review discard is explicit, cancellable and undoable; never writes per decision',async()=>{
 const e=await setup({html:'G D G G C',savedHtml:'G D G C'});await e.api.enter();const before=e.api.snapshot().draft;
 e.answers.push(false);assert.equal(await e.api.discard(),false);assert.deepEqual(e.api.snapshot().draft,before);
 assert.equal(await e.api.discard(),true);assert.equal(e.api.snapshot().draft.unresolved.length,3);e.api.undo();assert.deepEqual(e.api.snapshot().draft,before);assert.equal(e.calls.length,1);
});
test('safely reconciled lyrics use existing durations and display a small update indication',async()=>{
 const e=await setup({html:'G D<br>New lyric words',savedHtml:'G D<br>Old lyric words'});await e.api.enter();
 assert.deepEqual(values(e),[.5,1]);assert.match(e.el('ctStatus').textContent,/updated/);assert.equal(e.el('ctReviewToggle').hidden,true);assert.equal(e.api.snapshot().dirty,true);
});
test('returning after lyric edits reconciles locally with no second document read',async()=>{
 const e=await setup({html:'G D<br>Old words',savedHtml:'G D<br>Old words'});await e.api.enter();const ids=e.api.snapshot().draft.events.map(x=>x.id);
 await e.api.exit();e.setSong('G D<br>Changed words');await e.api.enter();assert.deepEqual(e.api.snapshot().draft.events.map(x=>x.id),ids);assert.equal(e.calls.length,1);assert.equal(e.api.snapshot().dirty,true);
});
test('meter review shows the actual signature and explicit acceptance has local Undo',async()=>{
 const e=await setup({html:'G D',savedHtml:'G D'});await e.api.enter();await e.api.exit();e.setMeter('3/4');await e.api.enter();
 assert.equal(e.el('ctAcceptMeter').hidden,false);assert.match(e.el('ctMeterReview').textContent,/3\/4/);assert.match(e.el('ctMeterSummary').textContent,/quarter-note/);
 await e.api.acceptMeter();assert.equal(e.api.snapshot().draft.reviewReasons.includes('meter-changed'),false);e.api.undo();assert.equal(e.api.snapshot().draft.reviewReasons.includes('meter-changed'),true);assert.equal(e.calls.length,1);
});
test('conflict preserves the local draft and never overwrites newer timing; reload requires confirmation',async()=>{
 const e=await setup({savedHtml:'G D G C C/G Bbmaj7/D'});await e.api.enter();e.api.setDuration(8);const local=copy(e.api.snapshot().draft);
 const newer=copy(e.rows.get(e.timingPath));newer.revision++;newer.events[0].durationBeats=6;e.rows.set(e.timingPath,newer);
 assert.equal(await e.api.save(),false);assert.equal(e.api.snapshot().conflict,'TIMING_CHANGED');assert.deepEqual(e.api.snapshot().draft,local);assert.equal(e.rows.get(e.timingPath).events[0].durationBeats,6);
 assert.equal(e.el('ctReload').hidden,false);assert.equal(e.el('ctSave').disabled,true);
 e.answers.push(false);await e.api.reload();assert.equal(values(e)[0],8);e.answers.push(true);await e.api.reload();assert.equal(values(e)[0],6);assert.equal(e.api.snapshot().dirty,false);
});
test('source conflict offers reload song; no force-save or parent write',async()=>{
 const e=await setup();await e.api.enter();e.api.step(.5);e.rows.set('lyrics/fixture',parent('G D G G C'));
 assert.equal(await e.api.save(),false);assert.equal(e.api.snapshot().conflict,'SOURCE_CHANGED');assert.equal(e.el('ctReloadSong').hidden,false);assert.equal(e.calls.filter(c=>c[0]==='write').length,0);
});
test('denied load is not treated as absent saved timing; retry retains draft on failure',async()=>{
 const e=await setup();e.denyRead();await e.api.enter();assert.match(e.el('ctStatus').textContent,/unavailable/);e.api.step(.5);assert.equal(e.el('ctSave').disabled,true);
 const draft=e.api.snapshot().draft;await e.api.reload();assert.deepEqual(e.api.snapshot().draft,draft);assert.equal(e.api.snapshot().dirty,true);
 e.allowRead();e.answers.push(false);await e.api.reload();assert.equal(values(e)[0],.5);assert.equal(e.rows.has(e.timingPath),false);
});
test('permission failure during save leaves local changes unsaved and intact',async()=>{
 const e=await setup();await e.api.enter();e.api.step(.5);e.denySave();assert.equal(await e.api.save(),false);assert.equal(values(e)[0],.5);assert.equal(e.api.snapshot().dirty,true);assert.match(e.el('ctNotice').textContent,/not saved/);
});
test('keyboard navigation, half steps and scoped Undo work; Space is untouched',async()=>{
 const e=await setup();await e.api.enter();event(e,e.root,'ArrowRight');assert.match(e.el('ctSelection').textContent,/Chord 2/);
 event(e,e.root,'+');assert.equal(values(e)[1],.5);event(e,e.root,'z',{ctrlKey:true});assert.equal(values(e)[1],undefined);
 assert.equal(event(e,e.root,' ').defaultPrevented,false);event(e,e.root,'ArrowLeft');assert.match(e.el('ctSelection').textContent,/Chord 1/);
});
test('shortcuts never trigger in text-entry controls or outside the timing workspace',async()=>{
 const e=await setup();await e.api.enter();
 for(const html of ['<input>','<textarea></textarea>','<select><option>A</option></select>','<div contenteditable="true"><span>x</span></div>','<div role="textbox"></div>','<div role="combobox"></div>']){
  const wrap=e.document.createElement('div');wrap.innerHTML=html;e.root.append(wrap);const target=wrap.querySelector('span')||wrap.firstElementChild;
  for(const key of ['ArrowRight','+','-','z'])assert.equal(event(e,target,key,{ctrlKey:key==='z'}).defaultPrevented,false);
  wrap.remove();
 }
 assert.ok(values(e).every(x=>x===undefined));assert.equal(event(e,e.document.body,'+').defaultPrevented,false);
});
test('ordinary Creator controller snapshots source without edits and keeps timing input out of lyric dirty state',async()=>{
 const {setup:actual,tick}=require('../verification/chord-foundation-pages.cjs');const e=actual('lyricscreator');for(let i=0;i<10;i++)await tick();
 const api=e.window.LS26CreatorTiming;assert.ok(api);const before=[...e.document.querySelectorAll('[data-html]')].map(x=>x.innerHTML);
 assert.equal(e.window.__fixture.calls.filter(c=>c[1].includes('/musicalTiming/')).length,0);
 await api.enter();assert.deepEqual([...e.document.querySelectorAll('[data-html]')].map(x=>x.innerHTML),before);
 const input=e.document.getElementById('ctCustomValue');input.value='2.5';input.dispatchEvent(new e.window.Event('input',{bubbles:true}));
 const unload=new e.window.Event('beforeunload',{cancelable:true});e.window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,false,'Typing a custom value must not dirty normal lyrics');
 api.step(.5);api.undo();const cleanUnload=new e.window.Event('beforeunload',{cancelable:true});e.window.dispatchEvent(cleanUnload);assert.equal(cleanUnload.defaultPrevented,false,'Timing Undo must not leave normal lyrics dirty');
 api.step(.5);assert.equal(e.document.getElementById('ctSave').disabled,true);const draft=api.snapshot().draft;
 e.window.LS26Dialogs.confirm=async()=>true;await api.exit();await e.document.getElementById('saveSongBtn').onclick();
 const saved=JSON.stringify(e.window.__fixture.data['lyrics/song0']);for(const item of draft.events)assert.ok(!saved.includes(item.id));assert.ok(!saved.includes('durationBeats'));
 assert.equal(e.window.__fixture.calls.filter(c=>c[0]==='set'&&c[1].includes('/musicalTiming/')).length,0);
});

// Stage 4.1: authenticated owner writes, isolated in-memory Firestore only.
const ownerEmail='leeborg23@gmail.com';
const ownerUser=(email=ownerEmail)=>({email:ownerEmail,async getIdTokenResult(){return {claims:{email}};}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function authFixture(user){
 let notify;
 const auth={currentUser:user,onIdTokenChanged(callback){notify=callback;queueMicrotask(()=>callback(auth.currentUser));return()=>{};},
  async change(next){auth.currentUser=next;notify(next);await settle();}};
 return auth;
}
test('owner token enables explicit compact save; repeated and slash chord IDs survive reload',async()=>{
 const auth=authFixture(ownerUser()),e=await setup({auth,ownerEmail});await settle();
 assert.equal(e.calls.length,0,'Auth verification must not load timing');
 await e.api.enter();assert.equal(e.rows.has(e.timingPath),false);assert.equal(e.calls.length,1);
 for(const [index,value] of [4,2.5,1.5,3.5,.5,6].entries()){e.api.select(index);e.api.setDuration(value);}
 const before=e.api.snapshot().draft.events;assert.equal(new Set(before.map(x=>x.id)).size,6);
 assert.equal(e.calls.filter(c=>c[0]==='write').length,0);assert.equal(e.el('ctSave').disabled,false);
 e.calls.length=0;assert.equal(await e.api.save(),true);
 assert.deepEqual(e.calls.map(c=>c[0]),['tx-get','tx-get','write']);assert.equal(e.calls[2][1],'lyrics/fixture/musicalTiming/v1');
 assert.equal(e.api.snapshot().dirty,false);assert.equal(e.api.snapshot().base.revision,1);assert.match(e.el('ctNotice').textContent,/Timing saved/);
 await e.api.reload();assert.deepEqual(e.api.snapshot().draft.events,before);assert.equal(e.el('ctSave').disabled,true);
 // Firestore replaces only this parent document, not documents beneath it.
 e.rows.set('lyrics/fixture',{...e.song(),title:'Updated normal parent'});
 await e.api.reload();assert.deepEqual(e.api.snapshot().draft.events,before);
});
test('signed-out host can edit locally but cannot send a timing transaction',async()=>{
 const e=await setup({auth:authFixture(null),ownerEmail});await settle();await e.api.enter();e.api.step(.5);
 assert.equal(e.el('ctSave').disabled,true);assert.match(e.el('ctSaveNote').textContent,/Sign in with your owner account/);
 assert.equal(await e.api.save(),false);assert.deepEqual(e.calls.map(c=>c[0]),['get']);assert.equal(e.api.snapshot().dirty,true);
});
test('client email alone cannot authorize saving when token claims do not match the rule',async()=>{
 const e=await setup({auth:authFixture(ownerUser('member@example.test')),ownerEmail});await settle();await e.api.enter();e.api.step(.5);
 assert.equal(e.el('ctSave').disabled,true);assert.match(e.el('ctSaveNote').textContent,/Only the signed-in owner/);
 assert.equal(await e.api.save(),false);assert.equal(e.calls.length,1);
});
test('exact owner token email is required and missing claims or token errors fail closed',async()=>{
 for(const user of [ownerUser('LeeBorg23@gmail.com'),{email:ownerEmail,async getIdTokenResult(){throw Error('Offline');}},
  {email:ownerEmail,async getIdTokenResult(){return {claims:{}};}}]){
  const e=await setup({auth:authFixture(user),ownerEmail});await settle();await e.api.enter();e.api.step(.5);
  assert.equal(e.el('ctSave').disabled,true);assert.equal(await e.api.save(),false);assert.equal(e.calls.length,1);
 }
});
test('sign-out revokes Save immediately and preserves local edits for a later owner sign-in',async()=>{
 const auth=authFixture(ownerUser()),e=await setup({auth,ownerEmail});await settle();await e.api.enter();e.api.step(.5);
 const draft=e.api.snapshot().draft;assert.equal(e.el('ctSave').disabled,false);
 await auth.change(null);assert.equal(e.el('ctSave').disabled,true);assert.deepEqual(e.api.snapshot().draft,draft);
 await auth.change(ownerUser());assert.equal(e.el('ctSave').disabled,false);assert.equal(e.calls.length,1);
});
test('late token verification from an old account cannot re-enable Save after sign-out',async()=>{
 let resolveToken;const user={email:ownerEmail,getIdTokenResult:()=>new Promise(resolve=>resolveToken=resolve)};
 const auth=authFixture(user),e=await setup({auth,ownerEmail});await settle();await e.api.enter();e.api.step(.5);
 await auth.change(null);resolveToken({claims:{email:ownerEmail}});await settle();assert.equal(e.el('ctSave').disabled,true);
 assert.equal(await e.api.save(),false);assert.equal(e.calls.length,1);
});
test('Save rechecks the actual user even if no auth notification has arrived',async()=>{
 const auth=authFixture(ownerUser()),e=await setup({auth,ownerEmail});await settle();await e.api.enter();e.api.step(.5);
 auth.currentUser=ownerUser('member@example.test');assert.equal(await e.api.save(),false);assert.equal(e.el('ctSave').disabled,true);assert.equal(e.calls.length,1);
});
test('reference visibility does not imply events: section type and source markup determine occurrences',async()=>{
 const e=await setup();
 const sections=[
  {type:'hostNote',title:'UG CHORDS NOTES',html:'<span class="inserted-chord">G</span> D G'},
  {type:'performanceNote',title:'Any custom reference title',text:'G D G C'},
  {type:'tab',title:'CHORDS LEGEND',html:'<span class="inserted-chord">C/G</span>'},
  {type:'lyrics',title:'CHORDS LEGEND',html:'SOLO: D C G x8 + x2 (10)<br>G = major chord<br>C/G = slash chord'},
  {type:'lyrics',title:'VERSE',html:'G D G C'}
 ];
 const chords=require('../shared/chord-foundation.js'),extracted=chords.extractSections(sections,e.document);
 assert.equal(extracted.sections.length,5);assert.equal(extracted.candidates.length,4);
 assert.ok(extracted.candidates.every(c=>c.anchor.sectionIndex===4));
 const draft=await model.createDraft(await model.buildSource({sections},e.document));assert.deepEqual(draft.events.map(x=>x.chord),['G','D','G','C']);
 // A custom title cannot suppress genuine chord source in a lyrics section.
 const titled=chords.extractSections([{type:'lyrics',title:'CHORDS LEGEND',html:'G D'}],e.document);
 assert.equal(titled.candidates.length,2);
});
test('actual Creator wiring enables owner Save and ordinary parent Save preserves the timing subdocument',async()=>{
 const {setup:actual,tick}=require('../verification/chord-foundation-pages.cjs'),e=actual('lyricscreator');
 e.window.auth.currentUser.email=ownerEmail;
 e.window.auth.currentUser.getIdTokenResult=async()=>({claims:{email:ownerEmail}});
 for(let i=0;i<10;i++)await tick();
 const api=e.window.LS26CreatorTiming,path='lyrics/song0/musicalTiming/v1';
 assert.equal(e.window.__fixture.calls.filter(c=>c[1].includes('/musicalTiming/')).length,0);
 await api.enter();api.step(1.5);assert.equal(e.document.getElementById('ctSave').disabled,false);
 assert.equal(await api.save(),true);const saved=JSON.stringify(e.window.__fixture.data[path]);
 assert.equal(api.snapshot().dirty,false);assert.equal(api.snapshot().base.revision,1);
 e.window.LS26Dialogs.confirm=async()=>true;await api.exit();await e.document.getElementById('saveSongBtn').onclick();
 assert.equal(JSON.stringify(e.window.__fixture.data[path]),saved);
 for(const event of api.snapshot().draft.events)assert.ok(!JSON.stringify(e.window.__fixture.data['lyrics/song0']).includes(event.id));
 await api.enter();await api.reload();assert.equal(JSON.stringify(e.window.__fixture.data[path]),saved);
 assert.equal(api.snapshot().draft.events[0].durationBeats,1.5);
 assert.equal(e.window.__fixture.calls.filter(c=>c[0]==='set'&&c[1]===path).length,1);
});
