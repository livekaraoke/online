/* Structural and simulated-geometry tests, not browser rendering tests. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES]}));
const read=p=>fs.readFileSync(__dirname+'/../'+p,'utf8');
test('Performance setup retains title and Best Next together inside the canonical shell',()=>{
 const {document}=parseHTML(read('host/lyricview.html'));
 const header=document.createElement('div');header.id='ls26StickyHeader';document.body.prepend(header);header.append(document.getElementById('topStatusContainer'));
 const strip=document.createElement('div');strip.id='lyricBestNextStrip';document.getElementById('hostStickyStack').append(strip);
 let script=read('shared/performance.js');script=script.slice(0,script.indexOf("    const drawer=$('songInfoDrawer');"))+'}\nsetup();})();';vm.runInNewContext(script,{document});
 assert.equal(strip.parentElement.id,'hostStickyStack');assert.equal(strip.parentElement.parentElement.id,'ls26StickyHeader');assert.ok(header.querySelector('.host-view-topbar'));assert.ok(document.querySelector('#lyricControlRail .host-nav-pad'));
});
test('Every legacy offset alias measures the full shell at top/mid/end and resize',()=>{
 const {document}=parseHTML('<html><body><div id="ls26StickyHeader"></div><div id="hostStickyStack"></div></body></html>');
 let height=290;document.getElementById('ls26StickyHeader').getBoundingClientRect=()=>({height,bottom:height});document.getElementById('hostStickyStack').getBoundingClientRect=()=>({height:130});
 const source=read('host/js/lyricview.js');const start=source.indexOf('  function syncHostStickyStack(){');const end=source.indexOf('  function bindObservers(){',start);const window={};vm.runInNewContext(source.slice(start,end),{document,window});
 for(const scrollY of [0,250,900,1800,4000,900,0]){window.scrollY=scrollY;window.syncHostStickyStack();for(const key of ['--lv-stack-h','--ls-stack-h','--host-sticky-stack-height'])assert.equal(document.documentElement.style.getPropertyValue(key),'290px');}
 height=350;window.syncHostStickyStack();assert.equal(document.documentElement.style.getPropertyValue('--ls-stack-h'),'350px');
});
test('Non-sticky reference controls contribute no fixed activation height',()=>{
 const {document}=parseHTML('<html><body><div id="guitarTuningCard"></div></body></html>');const source=read('host/js/lyricview.js'),start=source.indexOf('  function updateGuitarTuningStickyState()'),end=source.indexOf('  async function loadSectionTitleDefaultsForView()',start);
 const ctx={document,$:id=>document.getElementById(id)};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nresult=guitarTuningStickyHeight();',ctx);assert.equal(ctx.result,0);
 const styles=read('host/css/lyricview-fixes.css');assert.match(styles,/\.host-guitar-tuning-card\{\s*position:relative/);assert.match(styles,/#performanceQuickInfo\.performance-quick-info\{\s*position:relative/);
});
