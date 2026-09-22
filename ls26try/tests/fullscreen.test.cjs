// Run with: node --test ls26try/tests/fullscreen.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
function fixture({unsupported=false,reject=false,webkit=false}={}){
 const elements=new Map(),listeners={},calls=[];
 function element(){return {dataset:{},style:{setProperty(){}},setAttribute(k,v){this[k]=v;},append(){},prepend(){},classList:{add(){}},getBoundingClientRect(){return {height:100}}};}
 for(const id of ['ls26StickyHeader','ls26Fullscreen','ls26InboxOpen','ls26LyricLink'])elements.set(id,element());
 const document={readyState:'loading',currentScript:{src:'https://example.org/ls26try/shared/shell.js'},documentElement:element(),body:element(),getElementById:id=>elements.get(id),createElement:element,addEventListener:(n,f)=>listeners[n]=f};
 document.body.append=e=>elements.set(e.id,e);
 if(!unsupported)document.documentElement[webkit?'webkitRequestFullscreen':'requestFullscreen']=()=>{
  calls.push('request');if(reject)return Promise.reject(new Error('denied'));
  document[webkit?'webkitFullscreenElement':'fullscreenElement']=document.documentElement;
  listeners[webkit?'webkitfullscreenchange':'fullscreenchange']?.();return Promise.resolve();
 };
 document[webkit?'webkitExitFullscreen':'exitFullscreen']=()=>{document[webkit?'webkitFullscreenElement':'fullscreenElement']=null;listeners[webkit?'webkitfullscreenchange':'fullscreenchange']();return Promise.resolve();};
 const context={document,location:{pathname:'/ls26try/library.html',search:''},URL,URLSearchParams,ResizeObserver:class{observe(){}},setTimeout(){},clearTimeout(){},sessionStorage:{getItem(){return null}},console};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'shared/shell.js'),'utf8'),context);listeners.DOMContentLoaded();
 return {context,document,listeners,calls,button:elements.get('ls26Fullscreen'),elements};
}
for(const webkit of [false,true])test(`fullscreen enter/exit and external exit (${webkit?'WebKit':'standard'})`,async()=>{
 const f=fixture({webkit});await f.button.onclick();assert.equal(f.button['aria-pressed'],'true');
 await f.context.LS26.enterFullscreen();assert.equal(f.calls.length,1,'already fullscreen does not request again');
 await f.button.onclick();assert.equal(f.button['aria-pressed'],'false');
 await f.button.onclick();f.document[webkit?'webkitFullscreenElement':'fullscreenElement']=null;f.listeners[webkit?'webkitfullscreenchange':'fullscreenchange']();assert.equal(f.button['aria-label'],'Enter fullscreen');
});
test('denied and unsupported fullscreen resolve without blocking playback',async()=>{
 for(const opts of [{reject:true},{unsupported:true}]){const f=fixture(opts);await assert.doesNotReject(()=>f.context.LS26.enterFullscreen());assert.ok(f.elements.get('ls26Toast'));if(opts.unsupported)assert.equal(f.button.disabled,true);}
});
test('LyricView Play requests fullscreen synchronously; Pause does not',()=>{
 const source=fs.readFileSync(path.join(root,'host/js/lyricview.js'),'utf8');
 const start=source.indexOf('  function startAutoScroll() {');let level=1,end=source.indexOf('{',start)+1;
 for(;level;end++){if(source[end]==='{')level++;if(source[end]==='}')level--;}
 const calls=[],button={classList:{toggle(){}},setAttribute(){}};
 const c={autoScrollOn:false,$:id=>id==='autoScrollBtn'?button:null,window:{LS26:{enterFullscreen(){calls.push('fullscreen')}},dispatchEvent(){}},showEndNextSongButton(){},recordCurrentSongPlayed(){calls.push('record')},performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},clearInterval(){},Event:class{}};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);c.startAutoScroll();assert.deepEqual(calls,['fullscreen','record']);assert.equal(c.autoScrollOn,true);c.startAutoScroll();assert.equal(c.autoScrollOn,false);assert.equal(calls.length,2);
});
