/* In-memory DOM/Firestore integration. No live reads/writes or browser claim. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setImmediate(r));
async function setup(page='library.html',cache=new Map()){
 const dom=parseHTML(read(page)),document=dom.document,window={Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,HTMLSelectElement:dom.window.HTMLSelectElement};
 // Linkedom does not implement native select.value assignment.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._value=String(v);}});
 document.readyState='complete';const listeners=new Map();window.addEventListener=(n,fn)=>{if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(fn);};window.dispatchEvent=e=>{for(const fn of listeners.get(e.type)||[])fn(e);return true;};
 const storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 const songs=[{id:'a',firebaseId:'a',title:'Dakota',artist:'Stereophonics',userBpm:120,sections:[]},{id:'b',firebaseId:'b',title:'Wonderwall',artist:'Oasis',userBpm:88,sections:[]},{id:'c',firebaseId:'c',title:'Valerie',artist:'Amy Winehouse',userBpm:105,sections:[]}];
 let session={id:'s1',venue:'Reflections'},run=[],performedCallback,authCallback,reads=0,subscribes=0,unsubscribes=0,writes=[];
 const history=[{id:'g1',venue:'Reflections',status:'ended',startedAt:Date.UTC(2026,9,16),playedSongsSnapshot:[{songId:'b',playedAt:Date.UTC(2026,9,16)}],performanceLogSnapshot:[],requestSnapshot:[]}];
 const ref={get:async()=>{reads++;return {docs:history.map(s=>({id:s.id,data:()=>s}))};},doc:()=>ref,collection:()=>ref,onSnapshot:fn=>{subscribes++;performedCallback=fn;queueMicrotask(()=>fn({docs:[]}));return()=>unsubscribes++;}};
 const tools={getSession:()=>session,getSessionId:()=>session?.id||'',getControl:()=>({venue:session?.venue||''}),getRunOrder:()=>run,ensureSongs:async()=>songs,enqueueSong:async(s,o)=>writes.push([s,o])};
 const ctx={console,document,window,URLSearchParams,location:{search:page.includes('lyricview.html')?'?id=a':''},sessionStorage:storage,localStorage:storage,Event:window.Event,CustomEvent:window.CustomEvent,Date,Map,Set,Promise,setTimeout,clearTimeout,firebase:{app:()=>({options:{projectId:'fixture'}}),auth:()=>({onAuthStateChanged:fn=>{authCallback=fn;queueMicrotask(()=>fn({uid:'host'}));}})},LK:{sessionTools:tools},db:{collection:()=>ref}};window.LK=ctx.LK;window.db=ctx.db;window.LS26={toast(){}};vm.createContext(ctx);vm.runInContext(read('shared/song-rotation.js'),ctx);vm.runInContext(read('shared/best-next.js'),ctx);await tick();await tick();
 return {window,document,ctx,songs,cache,tools,setSession:s=>{session=s;window.dispatchEvent(new window.Event('lk:session-updated'));},setRun:r=>{run=r;window.dispatchEvent(new window.Event('lk:runorder-updated'));},performed:r=>performedCallback({docs:r.map(data=>({data:()=>data}))}),auth:authCallback,stats:()=>({reads,subscribes,unsubscribes,writes}),emit:n=>window.dispatchEvent(new window.Event(n))};
}
test('Adapter loads once, renders top five, uses existing next action and does not read on open/venue updates',async()=>{
 const f=await setup();assert.equal(f.stats().reads,1);assert.equal(f.stats().subscribes,1);assert.match(f.document.getElementById('bestNextRows').textContent,/Dakota/);
 for(let i=0;i<20;i++){f.document.getElementById('bestNextOpen').click();f.document.getElementById('bestNextClose').click();f.emit('lk:session-updated');}
 assert.equal(f.stats().reads,1);assert.equal(f.stats().subscribes,1);
 const button=f.document.querySelector('[data-use-next="a"]');button.click();await tick();assert.equal(f.stats().writes.length,1);assert.equal(f.stats().writes[0][1].next,true);
 f.setSession({id:'s1',venue:'Other'});assert.equal(f.window.LS26BestNext.get('b').unseen,true);assert.equal(f.stats().reads,1);
 f.setRun([{songId:'a',status:'playing'}]);assert.equal(f.window.LS26BestNext.get('a').badge,'TONIGHT');assert.equal(f.document.querySelector('[data-use-next="a"]'),null);
 f.performed([{songId:'c'}]);assert.equal(f.window.LS26BestNext.get('c').badge,'TONIGHT');
 f.setSession({id:'s2',venue:'Other'});await tick();assert.equal(f.stats().unsubscribes,1);assert.equal(f.stats().subscribes,2);assert.equal(f.stats().reads,2);
});
test('Navigation reuses scoped history cache; explicit refresh works after a cache hit',async()=>{const cache=new Map();await setup('library.html',cache);const f=await setup('library.html',cache);assert.equal(f.stats().reads,0);f.document.getElementById('bestNextRefresh').click();await tick();assert.equal(f.stats().reads,1);});
test('Library rotation filters intersect existing filter pipeline and Recommended sorting',async()=>{
 const f=await setup(),api=f.window.LS26BestNext;api.filter('recent');assert.equal(api.matches(f.songs[1]),true);assert.equal(api.matches(f.songs[0]),false);api.filter('never');assert.equal(api.matches(f.songs[0]),true);api.filter('best');f.setRun([{songId:'a',status:'played'}]);assert.equal(api.matches(f.songs[0]),false);assert.ok(api.compare(f.songs[2],f.songs[1])<0);
});
test('LyricView history and current-song change update without DB reads',async()=>{const f=await setup('host/lyricview.html');assert.ok(f.document.getElementById('bestNextSongHistory'));assert.equal(f.document.querySelector('#bestNextRows [data-use-next="a"]'),null);assert.match(f.document.getElementById('bestNextSongHistory').textContent,/Reflections/);f.window.dispatchEvent(new f.window.CustomEvent('ls26:current-song',{detail:{songId:'b'}}));assert.match(f.document.getElementById('bestNextSongHistory').textContent,/1 venue gig ago/);assert.equal(f.stats().reads,1);});
test('Sign out detaches live listener and clears derived songs/history',async()=>{const f=await setup();await f.auth(null);assert.equal(f.stats().unsubscribes,1);assert.equal(f.window.LS26BestNext.get('a'),undefined);assert.match(f.document.getElementById('bestNextStatus').textContent,/Sign in/);});
