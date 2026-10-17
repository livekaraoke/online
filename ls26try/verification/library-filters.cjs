/* Copyright © 2026 LiveSuite. Isolated Library filter tests; no network/database. */
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
const els={};const el=id=>els[id]||(els[id]={value:'',checked:false});
const ctx={console,URLSearchParams,location:{search:''},localStorage:{getItem:()=>null},document:{getElementById:el},window:{addEventListener(){}},LyricsCommon:{hasTabs:()=>true,hasLyrics:()=>true,toDate:()=>null},LK:{sessionTools:{getSession:()=>({setlistSongIds:['b']}),getPublicList:()=>({})}}};ctx.window.LK=ctx.LK;ctx.ArtistNames=require('../shared/artist-names.js');vm.createContext(ctx);
let src=fs.readFileSync(path.join(__dirname,'../host/js/lyricsviewer.js'),'utf8');src=src.slice(0,src.indexOf('  function syncSidebarButton()'))+`window.test={set:(a,b)=>{songs=a;setlists=b},scope:s=>scope=s,fav:id=>favourites.add(id),restore:applyImmediateRestoredState,rotation:changeRotation,sort:changeSort,result:()=>filteredSongs().map(s=>s.firebaseId)};})();`;vm.runInContext(src,ctx);
const t=ctx.window.test;t.set([{firebaseId:'a',title:'Alpha',artist:'One',key:'C',year:1998,userBpm:90,genre:'Rock',sections:[]},{firebaseId:'b',title:'Beta',artist:'Two',key:'Am',year:2004,originalBpm:120,genres:['Pop'],sections:[]},{firebaseId:'c',title:'Gamma',artist:'Three',year:'',userBpm:'',sections:[]}],[{id:'list',songIds:['a']}]);
const ids=()=>Array.from(t.result());assert.deepEqual(ids(),['a','b','c']);el('bpmMin').value='100';el('bpmMax').value='130';assert.deepEqual(ids(),['b']);el('bpmMin').value='';el('bpmMax').value='';el('decadeFilter').value='1990';assert.deepEqual(ids(),['a']);el('decadeFilter').value='';el('genreFilter').value='Pop';assert.deepEqual(ids(),['b']);el('genreFilter').value='';el('setlistFilter').value='list';assert.deepEqual(ids(),['a']);el('setlistFilter').value='';t.scope('session');assert.deepEqual(ids(),['b']);t.fav('a');t.scope('favourites');assert.deepEqual(ids(),['a']);console.log('PASS: BPM range/fallback, decade, genre, manual setlist, session setlist and favourites filters.');

// Recommendation order must never leak into ordinary browsing.
t.scope('all');el('sortSelect').value='title';
let rotation='all';ctx.window.LS26BestNext={filter:v=>rotation=v,matches:s=>rotation==='fresh'?s.firebaseId!=='b':true,compare:(a,b)=>b.title.localeCompare(a.title)};
t.rotation('best');assert.deepEqual(ids(),['c','b','a']);assert.equal(el('sortSelect').value,'title');
for(const mode of ['all','fresh','recent','never']){t.rotation(mode);assert.deepEqual(ids(),mode==='fresh'?['a','c']:['a','b','c']);}
el('sortSelect').value='recommended';t.sort();assert.deepEqual(ids(),['c','b','a']);t.rotation('fresh');assert.deepEqual(ids(),['c','a']);
t.rotation('best');el('sortSelect').value='title';el('stickyFavToggle').checked=true;t.sort();assert.equal(el('rotationFilter').value,'all');assert.deepEqual(ids(),['a','b','c']);
ctx.localStorage.getItem=()=>JSON.stringify({sort:'recommended'});t.restore();assert.equal(el('sortSelect').value,'title');
ctx.localStorage.getItem=()=>JSON.stringify({sort:'recommended',sortExplicit:true});t.restore();assert.equal(el('sortSelect').value,'recommended');
console.log('PASS: temporary BEST NEXT, independent rotation/sort, alphabetical reset and persisted-sort migration.');
