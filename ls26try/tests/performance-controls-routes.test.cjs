const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES]}));
const source=fs.readFileSync(__dirname+'/../shared/lyricview-performance-controls.js','utf8');
for(const route of ['/ls26try/host/lyricview','/ls26try/host/lyricview/','/ls26try/host/lyricview.html','/ls26try/host/lyricview.html/'])test('Controls and shared events: '+route,()=>{
 const {document,window}=parseHTML('<html><head></head><body><section id="guitarTuningCard">Standard Tuning</section><div class="host-guitar-tuning-spacer"></div><input id="ls26SyncSingerScroll"></body></html>');document.readyState='complete';delete window.__ls26PerformanceControlCards;
 const saved=new Map([['ls26:syncSingerScroll','false']]);const ctx={window,document,location:{pathname:route},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},CustomEvent:window.CustomEvent,setTimeout:fn=>fn()};window.LS26Click={countInEnabled:false,visualEnabled:true};
 vm.createContext(ctx);vm.runInContext(source,ctx);vm.runInContext(source,ctx);
 assert.equal(document.querySelectorAll('#ls26PerformanceControlRow').length,1);assert.equal(document.getElementById('ls26PerformanceControlRow').children[1].id,'guitarTuningCard');assert.equal(document.querySelectorAll('#guitarTuningCard').length,1);
 const sync=document.getElementById('quickSingerSyncToggle'),count=document.getElementById('quickCountInToggle'),visual=document.getElementById('quickVisualBeatToggle');
 assert.equal(sync.checked,false);assert.equal(count.checked,false);assert.equal(visual.checked,true);
 for(const [node,event,key]of [[sync,'ls26:singer-scroll-sync-changed','enabled'],[count,'ls26:count-in-setting-request','enabled'],[visual,'ls26:visual-beat-settings-request','visual']]){let result;window.addEventListener(event,e=>result=e.detail);node.checked=true;node.onchange({target:node});assert.equal(result[key],true);}
 assert.equal(saved.get('ls26:syncSingerScroll'),'true');
 window.dispatchEvent(new window.CustomEvent('ls26:count-in-setting',{detail:{enabled:false}}));assert.equal(count.checked,false);
 window.dispatchEvent(new window.CustomEvent('ls26:visual-beat-settings',{detail:{visual:false}}));assert.equal(visual.checked,false);
});
