/* Baseline restoration assertions; these do not claim browser rendering coverage. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),cp=require('node:child_process');
const root=__dirname+'/../..',read=p=>fs.readFileSync(root+'/ls26try/'+p,'utf8');
const baseline=p=>cp.execFileSync('git',['show','e9ac3893638d3184494f5774a6bbaac461522c31:ls26try/'+p],{cwd:root,encoding:'utf8'});
test('Baseline positioning and playback integrations restored exactly',()=>{
 for(const p of ['host/css/lyricview-fixes.css','shared/performance.js','shared/lyricview-chord-follow.js','shared/lyricview-follow-refinements-v2.js','shared/performance-tempo.js'])assert.equal(read(p),baseline(p),p);
 // Persistence intentionally changed. Guard the scrolling/offset functions separately.
 const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 for(const [a,b]of [['  function updateGuitarTuningStickyState()', '  async function loadSectionTitleDefaultsForView()'],['  function setQuickToolsReleased(', '  function beginCurrentSectionEndPause('],['(function initHostStickyStack()', 'NEVER_PRESENT_END_MARKER']]){
   const tail=s=>b==='NEVER_PRESENT_END_MARKER'?s.slice(s.indexOf(a)):section(s,a,b);
   assert.equal(tail(read('host/js/lyricview.js')),tail(baseline('host/js/lyricview.js')));
 }

});
test('Original LyricView markup preserved apart from resource versions and Best Next resources',()=>{
 const clean=s=>s.replace(/<(?:script|link)\b[^>]*(?:best-next|song-rotation|performance-intelligence|performance-lifecycle|performance-tools-ui)[^>]*>(?:<\/script>)?/g,'').replace(/\?v=[^"\s]+/g,'');
 assert.equal(clean(read('host/lyricview.html')),clean(baseline('host/lyricview.html')));
 assert.equal(fs.existsSync(root+'/ls26try/host/css/lyricview-layout.css'),false);
 assert.doesNotMatch(read('shared/best-next.js'),/hostStickyStack|host-song-actions|lyricBestNextStrip|bestNextPreview/);
});
