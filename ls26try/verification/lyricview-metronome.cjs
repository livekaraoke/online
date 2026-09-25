/* Actual sidebar/controller with simulated DOM and audio. No browser, sound or database. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),storage=new Map();
function setup(){
  const {window}=parseHTML(fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8')),document=window.document;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){this.querySelectorAll('option').forEach(option=>{if(option.value===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');});}});
  const el=id=>document.getElementById(id),header=document.createElement('div');header.id='ls26StickyHeader';document.body.prepend(header);
  let bpm=138,scrolling=false,audio;const sounds=[],timers=new Map(),frames=new Map();let sequence=0;
  const param=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  class Audio{constructor(){audio=this;this.state='suspended';this.currentTime=0;this.destination={};}async resume(){this.state='running';}createGain(){return {gain:param(),connect(){},disconnect(){}};}createOscillator(){const node={frequency:param(),connect(){},disconnect(){},start(time){this.time=time;},stop(){this.stopped=true;}};sounds.push(node);return node;}}
  class Observer{observe(){} disconnect(){}}
  const ctx={window,document,console,Date,Math,Promise,Event:window.Event,CustomEvent:window.CustomEvent,location:{search:'',pathname:'/ls26try/host/lyricview.html'},URLSearchParams,innerHeight:1200,scrollY:0,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},MutationObserver:Observer,ResizeObserver:Observer,
    performance:{now:()=>ctx.now||0},setTimeout,clearTimeout,setInterval:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  window.AudioContext=Audio;window.LS26Metronome=require('../shared/metronome-engine.js');
  window.LS26Performance={song:()=>({userBpm:138,originalBpm:140}),getBpm:()=>bpm,setBpm:value=>{bpm=Number(value);window.dispatchEvent(new window.Event('ls26:tempo-changed'));},sections:()=>[],isScrolling:()=>scrolling};ctx.LS26Performance=window.LS26Performance;
  vm.createContext(ctx);for(const file of ['shared/lyricview-metronome.js','shared/performance.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.dispatchEvent(new window.Event('ls26:song-ready'));
  return {el,ctx,window,document,sounds,timers,frames,audio:()=>audio,runFrame(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());},scroll(value){scrolling=value;window.dispatchEvent(new window.CustomEvent('ls26:scroll-state',{detail:{playing:value}}));}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let env=setup(),{el,ctx,window,document}=env;
  const cards=[...el('songInfoDrawer').querySelector('.song-info-scroll').children];assert.ok(cards.findIndex(x=>x.classList.contains('lv-metronome'))<cards.findIndex(x=>x.classList.contains('ls26-karaoke-toggle')));
  assert.equal(el('songInfoDrawer').classList.contains('open'),false);assert.equal(env.sounds.length,0,'no startup audio');
  el('ls26InfoStartup').checked=true;el('ls26InfoStartup').onchange({target:el('ls26InfoStartup')});
  env=setup();({el,ctx,window,document}=env);assert.equal(el('songInfoDrawer').classList.contains('open'),true);
  window.dispatchEvent(new window.Event('ls26:song-started'));assert.equal(el('songInfoDrawer').classList.contains('open'),true);
  assert.equal(el('songInfoDrawer').querySelector('.song-info-scroll').lastElementChild.className,'ls26-info-startup');
  await el('lvMetroStart').onclick();assert.ok(env.sounds.length>0);assert.equal(env.timers.size,1);
  env.scroll(false);assert.equal(env.timers.size,1,'independent click survives scroll pause');
  el('lvMetroStart').onclick();assert.equal(env.timers.size,0);
  el('lvMetroFollow').checked=true;el('lvMetroFollow').onchange({target:el('lvMetroFollow')});
  el('lvMetroVisual').checked=true;el('lvMetroVisual').onchange({target:el('lvMetroVisual')});
  env.scroll(true);await tick();assert.equal(env.timers.size,1);
  env.audio().currentTime=.06;env.runFrame();assert.equal(el('lvMetroScreenBeat').classList.contains('pulse'),true,'scroll-started click flashes the screen edges');assert.equal(el('lvMetroScreenBeat').classList.contains('accented'),true,'accented first beat uses distinct flash styling');assert.equal(el('lvMetroScreenBeat').querySelector('.lv-metro-screen-number').textContent,'1');
  env.scroll(false);assert.equal(env.timers.size,0,'linked pause cancels audio');assert.equal(el('lvMetroScreenBeat').classList.contains('pulse'),false,'stopping clears the visual flash');
  ctx.now=0;el('lvMetroTap').onclick();ctx.now=500;el('lvMetroTap').onclick();assert.equal(el('ls26CurrentBpm').value,'120');assert.equal(el('lvMetroBpm').textContent,'120');
  env.scroll(true);await tick();window.dispatchEvent(new window.Event('ls26:song-finished'));assert.equal(env.timers.size,0);
  await el('lvMetroStart').onclick();Object.defineProperty(document,'hidden',{value:true});document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(env.timers.size,0);
  assert.ok(env.sounds.every(sound=>sound.stopped));
  env.audio().resume=()=>new Promise(resolve=>env.audio().finishResume=resolve);
  const pending=el('lvMetroStart').onclick();window.dispatchEvent(new window.Event('pagehide'));env.audio().finishResume();await pending;assert.equal(env.timers.size,0,'cancelled audio startup must not resume later');
  el('ls26InfoStartup').checked=false;el('ls26InfoStartup').onchange({target:el('ls26InfoStartup')});
  env=setup();assert.equal(env.el('songInfoDrawer').classList.contains('open'),false);assert.equal(env.timers.size,0,'remembering Follow never autoplays');
  console.log('PASS: placement, startup preference, independent/linked playback, visual beat/accent flash, tap BPM sync, end/hidden-page stop and no autoplay.');
})().catch(error=>{console.error(error);process.exitCode=1;});
