/* Copyright © 2026 LiveSuite. Isolated Library filter tests; no network/database. */
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
const els={};const el=id=>els[id]||(els[id]={value:'',checked:false});
const ctx={console,URLSearchParams,location:{search:''},localStorage:{getItem:()=>null},document:{getElementById:el},window:{addEventListener(){}},LyricsCommon:{hasTabs:()=>true,hasLyrics:()=>true,toDate:()=>null},LK:{sessionTools:{getSession:()=>({setlistSongIds:['b']}),getPublicList:()=>({})}}};ctx.window.LK=ctx.LK;ctx.ArtistNames=require('../shared/artist-names.js');vm.createContext(ctx);
let src=fs.readFileSync(path.join(__dirname,'../host/js/lyricsviewer.js'),'utf8');src=src.slice(0,src.indexOf('  function syncSidebarButton()'))+`window.test={highlight:rotationHighlight,analyse:analyseLibrary,played:playedSongIds,set:(a,b)=>{songs=a;setlists=b},scope:s=>scope=s,fav:id=>favourites.add(id),restore:applyImmediateRestoredState,rotation:changeRotation,sort:changeSort,result:()=>filteredSongs().map(s=>s.firebaseId)};})();`;vm.runInContext(src,ctx);
const t=ctx.window.test;t.set([{firebaseId:'a',title:'Alpha',artist:'One',key:'C',year:1998,userBpm:90,genre:'Rock',sections:[]},{firebaseId:'b',title:'Beta',artist:'Two',key:'Am',year:2004,originalBpm:120,genres:['Pop'],sections:[]},{firebaseId:'c',title:'Gamma',artist:'Three',year:'',userBpm:'',sections:[]}],[{id:'list',songIds:['a']}]);
const ids=()=>Array.from(t.result());assert.deepEqual(ids(),['a','b','c']);el('bpmMin').value='100';el('bpmMax').value='130';assert.deepEqual(ids(),['b']);el('bpmMin').value='';el('bpmMax').value='';el('decadeFilter').value='1990';assert.deepEqual(ids(),['a']);el('decadeFilter').value='';el('genreFilter').value='Pop';assert.deepEqual(ids(),['b']);el('genreFilter').value='';el('setlistFilter').value='list';assert.deepEqual(ids(),['a']);el('setlistFilter').value='';t.scope('session');assert.deepEqual(ids(),['b']);t.fav('a');t.scope('favourites');assert.deepEqual(ids(),['a']);console.log('PASS: BPM range/fallback, decade, genre, manual setlist, session setlist and favourites filters.');

// Rotation highlighting is independent of the displayed list and sorting.
t.scope('all');el('sortSelect').value='title';
let rotation='all';ctx.window.LS26BestNext={filter:v=>rotation=v,matches:s=>rotation==='fresh'?s.firebaseId!=='b':rotation==='recent'?s.firebaseId==='b':rotation==='never'?s.firebaseId==='c':true,compare:(a,b)=>b.title.localeCompare(a.title)};
const songA={firebaseId:'a',title:'Alpha'},songB={firebaseId:'b',title:'Beta'};
for(const mode of ['all','best','fresh','recent','never']){t.rotation(mode);assert.deepEqual(ids(),['a','b','c']);assert.equal(el('sortSelect').value,'title');}
t.rotation('all');assert.equal(t.highlight(songA),'');
t.rotation('fresh');assert.equal(t.highlight(songA),' rotation-highlight-yellow');assert.equal(t.highlight(songB),'');
t.rotation('recent');assert.equal(t.highlight(songA),'');assert.equal(t.highlight(songB),' rotation-highlight-blue');
assert.equal(t.highlight({title:'0 - 1 note'}),'');
el('setlistFilter').value='list';assert.deepEqual(ids(),['a']);el('setlistFilter').value='';
el('sortSelect').value='recommended';t.sort();assert.deepEqual(ids(),['c','b','a']);t.rotation('fresh');assert.deepEqual(ids(),['c','b','a']);
t.rotation('best');el('sortSelect').value='title';el('stickyFavToggle').checked=true;t.sort();assert.equal(el('rotationFilter').value,'best');assert.deepEqual(ids(),['a','b','c']);
ctx.localStorage.getItem=()=>JSON.stringify({sort:'recommended'});t.restore();assert.equal(el('sortSelect').value,'title');
ctx.localStorage.getItem=()=>JSON.stringify({sort:'recommended',sortExplicit:true});t.restore();assert.equal(el('sortSelect').value,'recommended');
console.log('PASS: rotation highlights without filtering or reordering, independent sort and setlist scope.');

const liveSession={id:'live-a',status:'active'};
const playedRecords={sessionId:'live-a',records:[{songId:'a',status:'completed'},{songId:'b',status:'playing'},{songId:'c',status:'abandoned'},{songId:'old',sessionId:'live-b',status:'completed'}]};
const queued=[{songId:'d',status:'played'},{songId:'e',status:'queued'},{songId:'f',status:'deleted'}];
assert.deepEqual(Array.from(t.played(liveSession,'live-a',playedRecords,queued)),['a','d']);
assert.deepEqual(Array.from(t.played({id:'live-b',status:'active'},'live-b',playedRecords,[])),[]);
assert.deepEqual(Array.from(t.played({...liveSession,status:'ended'},'live-a',playedRecords,queued)),[]);
assert.deepEqual(Array.from(t.played(null,'',playedRecords,queued)),[]);
console.log('PASS: played title markers are completed-only, session-scoped, and ignore removed/unplayed songs.');

const analysis=t.analyse([{title:'Alpha',artist:'One',key:'F♯ minor',year:1998,userBpm:87,originalBpm:100,genres:['Rock','Pop']},{title:'Beta',artist:'Two',key:'C',year:2004,originalBpm:120,genre:'Rock'},{title:'Gamma',artist:'One',key:'',year:'',userBpm:'',originalBpm:0},{title:'0 - 1 note',userBpm:100}]);
assert.equal(analysis.total,3);assert.equal(analysis.excluded,1);assert.equal(analysis.bpmCount,2);assert.equal(analysis.mean,103.5);assert.equal(analysis.median,103.5);assert.equal(analysis.keyCount,2);assert.equal(analysis.yearCount,2);assert.equal(analysis.genres[0][0],'Rock');assert.equal(analysis.genres[0][1],2);assert.equal(analysis.decades[0][0],'1990s');assert.equal(analysis.keys.some(row=>row[0]==='F#m'),true);
const tempoSample=[{title:'Alpha',userBpm:87,originalBpm:100},{title:'Beta',originalBpm:120}];
assert.equal(t.analyse(tempoSample,'user').bpmCount,1);assert.equal(t.analyse(tempoSample,'original').mean,110);assert.equal(t.analyse([]).median,null);
console.log('PASS: current-list analytics, tempo sources, missing data, notes, key normalization, decades, and multi-genre counts.');

assert.equal(analysis.groups.tempo.get('80–99')[0].song.title,'Alpha');
assert.equal(analysis.groups.tempo.get('120–139')[0].song.title,'Beta');
assert.equal(analysis.groups.keys.get('F#m')[0].song.title,'Alpha');
assert.equal(analysis.groups.decades.get('1990s')[0].value,'1998');
assert.equal(analysis.groups.genres.get('Rock').length,2);
assert.equal(analysis.groups.modes.get('Minor').length,1);
assert.equal(analysis.groups.coverage.get('Original BPM').length,2);
assert.equal(t.analyse(tempoSample,'original').groups.tempo.get('100–119')[0].value,'100 BPM');
assert.equal(t.analyse(tempoSample,'user').groups.tempo.has('120–139'),false);
console.log('PASS: drill-down song membership matches chart groups and selected tempo source.');
