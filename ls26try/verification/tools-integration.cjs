/* Actual page controllers with a test-only DOM. No browser, network, live database or sound. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(page){
  const {window}=parseHTML(fs.readFileSync(path.join(root,'admin-new',page+'.html'),'utf8')),document=window.document;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>{if(option.value===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');});}});
  window.HTMLSelectElement.prototype.add=function(option){this.append(option);};
  const create=document.createElement.bind(document);document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>{el.open=true;el.setAttribute('open','');};el.close=()=>{el.open=false;el.removeAttribute('open');queueMicrotask(()=>el.dispatchEvent(new window.Event('close')));};}return el;};
  window.HTMLElement.prototype.setCustomValidity=function(text){this.validationMessage=text;};window.HTMLElement.prototype.reportValidity=()=>true;
  document.getElementById('sidebarContainer').innerHTML='<span id="sidebarReminderBadge"></span>';
  const storage=new Map(),intervals=new Map(),frames=new Map(),toasts=[];let sequence=0;
  const ctx={window,document,console,URL,Date,Intl,Promise,queueMicrotask,location:{pathname:'/ls26try/admin-new/'+page+'.html'},performance:{now:()=>ctx.now||0},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    Option:function(text,value){const el=create('option');el.textContent=text;el.value=value;return el;},LS26:{escape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),url:p=>'/ls26try/'+p,toast:text=>toasts.push(text)},LS26Dialogs:{confirm:async()=>true}};
  window.LS26=ctx.LS26;vm.createContext(ctx);
  return {window,document,ctx,storage,intervals,frames,toasts,el:id=>document.getElementById(id),run:file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx)};
}
async function reminders(){
  const env=setup('reminders'),{ctx,window,document,el,storage,run}=env;
  const data=new Map(),listeners=new Set();let uid='host1',writes=0,fail=false,listenCalls=0,getCalls=0;
  const timestamp=ms=>({toMillis:()=>ms,toDate:()=>new Date(ms)});
  const auth={currentUser:{uid},onAuthStateChanged:fn=>{auth.callback=fn;queueMicrotask(()=>fn(auth.currentUser));return()=>{};}};
  class Query{
    constructor(filters=[],limit=Infinity,cursor=''){this.filters=filters;this.max=limit;this.cursor=cursor;}
    where(k,op,v){assert.equal(op,'==');return new Query([...this.filters,[k,v]],this.max,this.cursor);}
    limit(n){return new Query(this.filters,n,this.cursor);}startAfter(doc){return new Query(this.filters,this.max,doc.id);}
    snapshot(){const docs=[...data].sort(([a],[b])=>a.localeCompare(b)).filter(([id,n])=>id>this.cursor&&this.filters.every(([k,v])=>n[k]===v)).slice(0,this.max).map(([id,n])=>({id,data:()=>({...n})}));return {docs,size:docs.length};}
    onSnapshot(fn){listenCalls++;const listener={query:this,fn};listeners.add(listener);queueMicrotask(()=>fn(this.snapshot()));return()=>listeners.delete(listener);}
    async get(){getCalls++;return this.snapshot();}
    doc(id){return {update:async patch=>{writes++;if(fail)throw Object.assign(Error('Denied'),{code:'permission-denied'});data.set(id,{...data.get(id),...patch});emit();}};}
    async add(value){writes++;if(fail)throw Object.assign(Error('Denied'),{code:'permission-denied'});const id='r'+writes;data.set(id,value);emit();return {id};}
  }
  const emit=()=>{for(const l of listeners)queueMicrotask(()=>l.fn(l.query.snapshot()));};
  const db={collection:name=>{assert.equal(name,'reminders');return new Query();}};
  ctx.firebase={app:()=>({options:{projectId:'test'}}),auth:()=>auth,firestore:Object.assign(()=>db,{Timestamp:{fromDate:d=>timestamp(+d)},FieldValue:{serverTimestamp:()=>timestamp(Date.now())}})};
  ctx.LK={auth,db,sidebar:{loadSidebar:()=>{}}};window.LK=ctx.LK;window.firebase=ctx.firebase;
  data.set('other',{text:'Not mine',status:'pending',createdBy:'other'});
  run('shared/reminders.js');await tick();assert.equal(listeners.size,1);assert.equal(el('sidebarReminderBadge').textContent,'0');
  window.dispatchEvent(new window.CustomEvent('ls26:sidebar-ready'));assert.equal(listenCalls,1,'sidebar remount must not duplicate listener');
  window.LS26.openReminder();el('reminderText').value='Bring the spare guitar cable';el('reminderCategory').value='Equipment';el('reminderText').dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.ok(storage.get('ls26:reminderDraft:test:host1').includes('spare guitar'));
  fail=true;await el('reminderForm').onsubmit({preventDefault(){}});assert.match(el('reminderSaveStatus').textContent,/kept/);assert.equal(el('sidebarReminderBadge').textContent,'0');
  fail=false;await el('reminderForm').onsubmit({preventDefault(){}});await tick();assert.equal(el('sidebarReminderBadge').textContent,'1');assert.equal(storage.has('ls26:reminderDraft:test:host1'),false,'successful close must not recreate a draft');
  assert.equal(data.get('r2').createdBy,'host1');assert.equal(data.get('r2').status,'pending');assert.equal(data.get('r2').dueAt,null);
  window.LS26.openReminder();el('reminderText').value='Check lights';el('reminderTime').value='18:00';const before=writes;await el('reminderForm').onsubmit({preventDefault(){}});assert.equal(writes,before);assert.match(el('reminderSaveStatus').textContent,/date/);
  el('reminderDate').value='2026-10-01';el('reminderLink').value='javascript:alert(1)';await el('reminderForm').onsubmit({preventDefault(){}});assert.equal(writes,before,'reject unsafe links');
  el('reminderLink').value='https://example.com/checklist';await el('reminderForm').onsubmit({preventDefault(){}});await tick();assert.equal(el('sidebarReminderBadge').textContent,'2');
  const action=name=>[...el('reminderRows').querySelectorAll('button')].find(b=>b.textContent===name);
  action('Mark completed').click();await tick();assert.equal(el('sidebarReminderBadge').textContent,'1');
  el('reminderFilter').value='completed';el('reminderFilter').onchange();await tick();assert.match(el('reminderRows').textContent,/Reopen/);
  action('Reopen').click();await tick();assert.equal(el('sidebarReminderBadge').textContent,'2');
  el('reminderFilter').value='pending';el('reminderFilter').onchange();await tick();action('Archive').click();await tick();assert.equal(el('sidebarReminderBadge').textContent,'1');
  el('reminderFilter').value='archived';el('reminderFilter').onchange();await tick();assert.match(el('reminderRows').textContent,/Reopen/);
  // Server-side pagination: 51 completed records, exact counts still come from pending listener.
  for(let i=0;i<51;i++)data.set('z'+String(i).padStart(2,'0'),{text:'Completed '+i,status:'completed',createdBy:'host1'});
  el('reminderFilter').value='completed';el('reminderFilter').onchange();await tick();assert.equal(el('reminderMore').hidden,false);assert.equal(el('reminderRows').querySelectorAll('article').length,50);
  el('reminderMore').onclick();await tick();assert.equal(el('reminderRows').querySelectorAll('article').length,51);assert.equal(el('reminderMore').hidden,true);
  window.LS26.openReminder();el('reminderText').value='Private draft';el('reminderText').dispatchEvent(new window.Event('input',{bubbles:true}));
  auth.currentUser={uid:'host2'};auth.callback(auth.currentUser);await tick();assert.equal(el('sidebarReminderBadge').textContent,'0');assert.equal(storage.has('ls26:reminderDraft:test:host2'),false,'account change must not copy another account draft');
  assert.ok(!el('reminderRows').textContent.includes('Private draft'));assert.equal(listeners.size,1);
  auth.currentUser=null;auth.callback(null);await tick();assert.equal(listeners.size,0);assert.equal(el('reminderAdd').disabled,true);
  console.log('PASS reminders: capture, failed-save recovery, dates/links, draft cleanup/isolation, pending count, completion/reopen/archive, pagination and listener lifecycle.');
}
async function metronome(){
  const env=setup('metronome'),{ctx,window,document,el,run,intervals,storage}=env;
  const sounds=[];let audio;
  const param=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  class Audio{
    constructor(){audio=this;this.currentTime=0;this.state='suspended';this.destination={};}
    async resume(){this.state='running';}
    createGain(){return {gain:param(),connect(){},disconnect(){}};}
    createOscillator(){const node={frequency:param(),connect(){},disconnect(){},start:time=>{node.startTime=time;},stop:()=>{node.stopped=true;}};sounds.push(node);return node;}
  }
  window.AudioContext=Audio;ctx.LS26Metronome=require('../shared/metronome-engine.js');run('admin-new/js/metronome.js');
  await el('metroStart').onclick();assert.equal(el('metroStart').textContent,'Stop click');assert.ok(sounds.length>0);assert.equal(intervals.size,1);
  audio.currentTime=.65;for(const callback of intervals.values())callback();assert.ok(sounds.length>1);
  el('metroStart').onclick();assert.equal(intervals.size,0);assert.ok(sounds.every(n=>n.stopped));assert.equal(el('metroStart').textContent,'Start click');
  ctx.now=0;el('metroTap').onclick();ctx.now=500;el('metroTap').onclick();ctx.now=1000;el('metroTap').onclick();assert.equal(el('metroBpm').value,'120');
  el('metroHalf').onclick();assert.equal(el('metroBpm').value,'60');el('metroDouble').onclick();assert.equal(el('metroBpm').value,'120');
  el('metroDivision').value='2';el('metroDivision').dispatchEvent(new window.Event('change'));assert.equal(el('metroSwing').disabled,false);
  el('metroVolume').value='0';el('metroVolume').dispatchEvent(new window.Event('input'));const before=sounds.length;await el('metroStart').onclick();assert.equal(sounds.length,before,'zero volume generates no sound');
  Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(intervals.size,0);assert.match(el('metroStatus').textContent,/hidden/);
  el('metroPresetName').value='Warm up';el('metroSavePreset').onclick();const state=JSON.parse(storage.get('ls26:metronomeV1'));assert.equal(state.presets.length,1);assert.equal(state.presets[0].settings.bpm,120);
  // Stop during an interrupted asynchronous start must not start a timer later.
  audio.resume=()=>new Promise(resolve=>audio.finishResume=resolve);Object.defineProperty(document,'hidden',{value:false});const starting=el('metroStart').onclick();window.dispatchEvent(new window.Event('pagehide'));audio.finishResume();await starting;assert.equal(intervals.size,0);
  console.log('PASS metronome controller: start/stop, scheduled audio, tap/half/double, swing control, silent mode, hidden-page stop, presets and cancelled startup.');
}
(async()=>{await reminders();await metronome();})().catch(error=>{console.error(error);process.exitCode=1;});
