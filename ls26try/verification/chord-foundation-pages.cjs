/* Load actual Creator/Viewer controllers in an isolated DOM and in-memory Firebase.
 * No browser, network, real credentials, live database, or audio is used.
 * Optional LS26_BASELINE_REF compares unchanged rendering against a Git restore point.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..');
const read=(file,ref)=>ref?execFileSync('git',['show',ref+':ls26try/'+file],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const song={title:'Stage Two Fixture',artist:'Fixture',userBpm:'96',timeSignature:'4/4',sections:[
 {type:'lyrics',title:'VERSE',html:'<strong class="inserted-chord">  C/G  </strong>    <strong>Bbmaj7/D</strong><br>Words stay exactly here<br>G   D   G   C',style:{fontFamily:'Verdana',fontSize:23,color:'#ffffff'}},
 {type:'separator'},
 {type:'lyrics',title:'CHORUS',html:'<span><b>  G  </b></span>  <span>Am7</span><br>Unchanged words'},
 {type:'hostNote',title:'NOTE',text:'Host cue only'},
 {type:'tab',title:'TAB',html:'<pre class="inserted-blank-tab">e|----0----|</pre>'}
]};
function setup(page,ref){
 const {window}=parseHTML(read('host/'+page+'.html',ref)),document=window.document;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){this.querySelectorAll('option').forEach(o=>o.toggleAttribute('selected',o.value===String(value)));}});
 Object.defineProperty(window.HTMLElement.prototype,'innerText',{configurable:true,get(){return this.textContent;},set(v){this.textContent=v;}});
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {top:1000,bottom:1100,height:100,width:900,left:0,right:900};};
 window.HTMLElement.prototype.scrollTo=function(){};
 const events=[],storage=new Map();let seq=0;
 const location={search:page==='lyricscreator'?'?firebaseId=song0':'?id=song0',pathname:'/ls26try/host/'+page+'.html',href:'https://fixture.test/ls26try/host/'+page+'.html',origin:'https://fixture.test'};
 const ctx={window,document,location,console,URL,URLSearchParams,TextEncoder,Date,Math,Promise,Event:window.Event,CustomEvent:window.CustomEvent,Node:window.Node,
  NodeFilter:{SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2},crypto:require('node:crypto').webcrypto,queueMicrotask,
  setTimeout:()=>++seq,clearTimeout(){},setInterval:()=>++seq,clearInterval(){},requestAnimationFrame:()=>++seq,cancelAnimationFrame(){},
  performance:{now:()=>0},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},
  getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'23px',fontFamily:'Verdana'}),matchMedia:()=>({matches:false}),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:()=>null,setItem(){}},
  fetch:()=>{throw Error('Network is forbidden');},history:{replaceState(){}},innerHeight:900,scrollY:0,scrollTo(){}};
 Object.assign(window,{location,innerHeight:900,scrollY:0,scrollTo(){},scrollBy(){},requestAnimationFrame:ctx.requestAnimationFrame,LS26:{url:p=>'/ls26try/'+p,toast:msg=>events.push(msg)},LS26Dialogs:{alert:async msg=>{throw Error(msg);}},LS26Settings:{get:()=>({})}});
 ctx.LS26=window.LS26;ctx.LS26Dialogs=window.LS26Dialogs;
 vm.createContext(ctx);vm.runInContext(read('verification/firebase-fixture.js',ref),ctx);
 ctx.firebase=window.firebase;ctx.__fixture=window.__fixture;
 window.firebase.initializeApp({projectId:'in-memory-test'});window.db=ctx.db=ctx.firebase.firestore();window.auth=ctx.auth=ctx.firebase.auth();
 window.__fixture.data['lyrics/song0']=JSON.parse(JSON.stringify(song));
 window.__fixture.data['karaokeControl/currentSession']={active:false};window.__fixture.data['karaokeControl/runOrder']={items:[]};
 window.songs=[{title:'Fixture',artist:'Fixture',hasLyrics:true,url:'lyrics/song.html?id=fixture'}];
 window.LK={db:ctx.db,sessionTools:{getSessionId:()=>'',getRunOrder:()=>[]}};ctx.LK=window.LK;
 function run(file){let code=read(file,ref);if(file==='host/js/lyricview.js')code=code.replace('  function captureOriginalTabCells()', '  window.__testTranspose=shift=>{chordShift=shift;applyChordTranspose();};\n  function captureOriginalTabCells()');vm.runInContext(code,ctx,{filename:file});for(const key of ['ArtistNames','LyricsCommon','LS26SectionContent','LS26PerformanceTempo'])if(window[key])ctx[key]=window[key];}
 run('shared/artist-names.js');run('shared/section-content.js');
 if(document.querySelector('script[src*="chord-foundation.js"]')){run('shared/chord-foundation.js');run('shared/musical-transport.js');}
 if(document.querySelector('script[src*="timing-model.js"]')){run('shared/timing-model.js');run('shared/timing-store.js');}
 if(document.querySelector('script[src*="chord-timing-workspace.js"]'))run('host/js/chord-timing-workspace.js');
 if(page==='lyricscreator')run('host/js/lyrics-common.js');else run('shared/performance-tempo.js');
 run('host/js/'+page+'.js');if(page==='lyricview')document.dispatchEvent(new window.Event('DOMContentLoaded'));
 return {window,ctx,document,events,run,ref};
}
async function check(page,ref){
 const env=setup(page,ref);for(let i=0;i<8;i++)await tick();
 const {document,window,ctx}=env;
 const selector=page==='lyricscreator'?'.creator-section-card':'.host-section';
 assert.equal(document.querySelectorAll(selector).length,page==='lyricscreator'?5:4,page+' section count');
 assert.equal(window.__fixture.calls.filter(c=>c[0]!=='get').length,0,page+' must not write this untimed fixture');
 assert.equal(JSON.stringify(window.__fixture.data['lyrics/song0']),JSON.stringify(song),'original song data unchanged');
 if(!ref){
  const model=window.LS26ChordOccurrences.snapshot();assert.deepEqual(Array.from(model.events,e=>e.symbol),['C/G','Bbmaj7/D','G','D','G','C','G','Am7']);
  assert.equal(new Set(model.events.map(e=>e.id)).size,8);assert.equal(model.needsReview,false);
  assert.equal(document.querySelectorAll('[data-chord-id],[data-occurrence-id]').length,0);
  assert.ok(window.LS26MusicalTransport,'local transport available without starting playback');
  if(page==='lyricscreator'){
   const ids=model.events.map(e=>e.id);window.LS26ChordOccurrences.refresh();assert.deepEqual(Array.from(window.LS26ChordOccurrences.snapshot().events,e=>e.id),Array.from(ids));
  }else{
   const first=document.querySelector('.inserted-chord'),html=first.innerHTML,ids=model.events.map(e=>e.id);
   window.__testTranspose(2);assert.equal(first.textContent,'  D/A  ');
   window.__testTranspose(0);assert.equal(first.innerHTML,html);
   assert.deepEqual(Array.from(window.LS26ChordOccurrences.snapshot().events,e=>e.id),Array.from(ids));
  }
 }
 const normalized=[...document.querySelectorAll(selector)].map(el=>{const clone=el.cloneNode(true);clone.querySelectorAll('[data-original-chord]').forEach(n=>n.removeAttribute('data-original-chord'));return clone.outerHTML;});
 let saved=null,companion=null;
 if(page==='lyricscreator'){
  if(window.LS26Timing){
   const source=await window.LS26Timing.buildSource(song,document);
   companion=await window.LS26Timing.createDraft(source);
   companion=window.LS26Timing.setDuration(companion,companion.events[0].id,1.5);
   companion.revision=1;
   window.__fixture.data['lyrics/song0/musicalTiming/v1']=JSON.parse(JSON.stringify(companion));
  }
  await document.getElementById('saveSongBtn').onclick();
  assert.ok(window.__fixture.calls.some(c=>c[0]==='set'&&c[1]==='lyrics/song0'),'Explicit Save reaches only the in-memory fixture');
  saved=JSON.parse(JSON.stringify(window.__fixture.data['lyrics/song0']));delete saved.updatedAt;
  assert.equal(saved.durationBeats,undefined);assert.equal(saved.musicalTiming,undefined);
  if(!ref)for(const event of window.LS26ChordOccurrences.snapshot().events)assert.ok(!JSON.stringify(saved).includes(event.id),'Local occurrence ID must never enter saved payload');
  if(companion){
   assert.equal(JSON.stringify(window.__fixture.data['lyrics/song0/musicalTiming/v1']),JSON.stringify(companion),'Actual parent Save must leave companion document untouched');
   for(const event of companion.events)assert.ok(!JSON.stringify(saved).includes(event.id),'Persistent timing IDs must never enter parent Save payload');
   assert.equal(window.__fixture.calls.filter(c=>c[0]==='set'&&c[1].includes('/musicalTiming/')).length,0,'No automatic timing writes');
  }
 }
 return {rendered:normalized,saved};
}
if(require.main===module)(async()=>{
 for(const page of ['lyricscreator','lyricview']){
  const current=await check(page);if(process.env.LS26_BASELINE_REF){const baseline=await check(page,process.env.LS26_BASELINE_REF);assert.deepEqual(current,baseline,page+' zero-transpose DOM and explicit-save payload unchanged');}
  console.log('PASS '+page+': actual controller loads, sections/chords render, untimed source unchanged, no load-time fixture writes'+(page==='lyricscreator'?', explicit mock Save excludes occurrence IDs':'')+(process.env.LS26_BASELINE_REF?', baseline rendering/save parity':''));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={setup,check,song,tick};
