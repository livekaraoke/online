/* Library note classification/filtering regression checks. No network or database. */
const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../host/js/lyricsviewer.js'),'utf8');
const storage=new Map();
function boot(){
  const elements={};
  const el=id=>elements[id]||(elements[id]={value:'',checked:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
  const ctx={console,URLSearchParams,location:{search:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:el},window:{addEventListener(){}},LyricsCommon:{hasTabs:()=>true,hasLyrics:()=>true,toDate:()=>null},LK:{sessionTools:{getSession:()=>({setlistSongIds:['a','n2']}),getPublicList:()=>({})}}};
  ctx.window.LK=ctx.LK;ctx.ArtistNames=require('../shared/artist-names.js');vm.createContext(ctx);
  const handlers=source.slice(source.indexOf('  $("personalNotesToggle")?.addEventListener'),source.indexOf('  $("refreshBtn").onclick'));
  vm.runInContext(source.slice(0,source.indexOf('  function syncSidebarButton()'))+`render=()=>{};saveViewState=()=>{};`+handlers+`window.test={
    set:data=>songs=data, classify:personalNote,
    visible:value=>{notesVisible=value;saveNotesState()},category:value=>{noteCategory=value;saveNotesState()},
    scope:value=>scope=value,fav:id=>favourites.add(id),
    result:()=>filteredSongs().map(s=>s.firebaseId)
  };})();`,ctx);
  return {t:ctx.window.test,el};
}
const titles={a:'Alpha',b:'Étoile',c:'日本語',n2:'0 - 1.2 Requests',n10:'0 - 1.10 Tools',rox:'0 – 2.0 Roxanna Tools',other:'3 - 1 Songwriting',symbol:'★ Reminders',numeric:'99 Red Balloons'};
const songs=Object.entries(titles).map(([firebaseId,title])=>({firebaseId,title,artist:'Demo',key:'C',year:'2026',originalBpm:'100',sections:[]}));
let {t,el}=boot();t.set(songs);
assert.equal(t.classify({title:' Étoile'}),null);
assert.equal(t.classify({title:'日本語'}),null);
assert.equal(t.classify({title:'  '}),null);
assert.equal(t.classify({title:'0 - 1.2 Requests'}).label,'0 - 1 · Live Karaoke');
assert.equal(t.classify({title:'0 — 2.10 Tools'}).category,'section:2');
assert.equal(t.classify({title:'3 - 1 Songwriting'}).category,'group:3');
assert.equal(t.classify({title:'★ Reminders'}).category,'symbols');
assert.equal(t.classify({title:'99 Red Balloons'}).category,'group:99'); // Literal rule requested by owner.
assert.equal(t.result().length,9);
assert.ok(t.result().indexOf('n2')<t.result().indexOf('n10'));
t.visible(false);assert.deepEqual(Array.from(t.result()).sort(),['a','b','c']);
({t,el}=boot());t.set(songs);assert.deepEqual(Array.from(t.result()).sort(),['a','b','c'],'hidden after reload');
t.scope('session');assert.deepEqual(Array.from(t.result()),['a'],'hidden in session scope');
t.fav('a');t.fav('n2');t.scope('favourites');assert.deepEqual(Array.from(t.result()),['a']);
t.scope('all');el('searchInput').value='Requests';assert.equal(t.result().length,0,'search cannot reveal hidden notes');el('searchInput').value='';
t.visible(true);t.category('section:1');assert.deepEqual(Array.from(t.result()),['n2','n10']);
({t,el}=boot());t.set(songs);assert.deepEqual(Array.from(t.result()),['n2','n10'],'shown category after reload');
t.category('notes');assert.equal(t.result().length,6);
t.category('symbols');assert.deepEqual(Array.from(t.result()),['symbol']);
t.category('section:2');assert.deepEqual(Array.from(t.result()),['rox']);
t.category('');assert.equal(t.result().length,9);
t.visible(false);t.category('');assert.equal(t.result().length,3,'clearing category retains hidden preference');
el('personalNotesToggle').handlers.click();assert.equal(t.result().length,9,'actual Show button handler');
el('personalNotesCategory').handlers.change({target:{value:'section:2'}});assert.deepEqual(Array.from(t.result()),['rox']);
el('personalNotesToggle').handlers.click();assert.equal(t.result().length,3,'Hide ignores the selected note category');
el('clearFiltersBtn').onclick();assert.equal(t.result().length,3,'actual Clear filters handler does not reveal notes');
assert.equal(JSON.parse(storage.get('ls26:libraryPersonalNotesV1')).visible,false);
assert.equal(JSON.parse(storage.get('ls26:libraryPersonalNotesV1')).category,'');
({t,el}=boot());t.set(songs);assert.equal(t.result().length,3,'hidden after Clear filters and reload');
storage.set('ls26:libraryPersonalNotesV1','{invalid');({t}=boot());t.set(songs);assert.equal(t.result().length,9,'invalid preference fails open');
console.log('PASS: number/symbol and Unicode classification; category boundaries; natural numbering; scopes/search; show/hide/category persistence.');
