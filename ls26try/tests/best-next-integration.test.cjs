/* In-memory DOM/Firestore integration. No live reads/writes or browser claim. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setImmediate(r));
async function setup(page='library.html',cache=new Map()){
 const dom=parseHTML(read(page.replace(/\/$/,'').replace(/host\/lyricview$/,'host/lyricview.html'))),document=dom.document,window={Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,HTMLSelectElement:dom.window.HTMLSelectElement};
 // Linkedom does not implement native select.value assignment.
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){this._value=String(v);}});
 document.readyState='complete';const listeners=new Map();window.addEventListener=(n,fn)=>{if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(fn);};window.dispatchEvent=e=>{for(const fn of listeners.get(e.type)||[])fn(e);return true;};
 const include=document.createElement('div');include.innerHTML=read('admin-new/includes/top-statusbar.html');document.body.append(include);
 const storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 const songs=[{id:'a',firebaseId:'a',title:'Dakota',artist:'Stereophonics',userBpm:120,sections:[]},{id:'b',firebaseId:'b',title:'Wonderwall',artist:'Oasis',userBpm:88,sections:[]},{id:'c',firebaseId:'c',title:'Valerie',artist:'Amy Winehouse',userBpm:105,sections:[]}];
 let session={id:'s1',venue:'Reflections',setlistSongIds:['a','b','c']},run=[],performedCallback,authCallback,reads=0,subscribes=0,unsubscribes=0,writes=[];
 const history=[{id:'g1',venue:'Reflections',status:'ended',startedAt:Date.UTC(2026,9,16),playedSongsSnapshot:[{songId:'b',playedAt:Date.UTC(2026,9,16)}],performanceLogSnapshot:[],requestSnapshot:[]}];
 const ref={orderBy:(field,order)=>{assert.equal(field,'startedAt');assert.equal(order,'desc');return ref;},limit:n=>{assert.equal(n,101);return ref;},get:async()=>{reads++;return {docs:history.map(s=>({id:s.id,data:()=>s}))};},doc:()=>ref,collection:()=>ref,onSnapshot:fn=>{subscribes++;performedCallback=fn;queueMicrotask(()=>fn({docs:[]}));return()=>unsubscribes++;}};
 const tools={getSession:()=>session,getSessionId:()=>session?.id||'',getControl:()=>({venue:session?.venue||''}),getRunOrder:()=>run,ensureSongs:async()=>songs,enqueueSong:async(s,o)=>writes.push([s,o])};
 const ctx={console,document,window,URLSearchParams,location:{search:page.includes('host/lyricview')?'?id=a':''},sessionStorage:storage,localStorage:storage,Event:window.Event,CustomEvent:window.CustomEvent,Date,Map,Set,Promise,setTimeout,clearTimeout,firebase:{app:()=>({options:{projectId:'fixture'}}),auth:()=>({onAuthStateChanged:fn=>{authCallback=fn;queueMicrotask(()=>fn({uid:'host'}));}})},LK:{sessionTools:tools},db:{collection:()=>ref}};window.LK=ctx.LK;window.db=ctx.db;window.LS26={toast(){}};window.LS26Data={collection:async()=>({docs:[{id:'alternate',data:()=>({name:'Alternate',songIds:['b']})}]})};vm.createContext(ctx);vm.runInContext(read('shared/song-rotation.js'),ctx);vm.runInContext(read('shared/best-next.js'),ctx);const sessionSource=read('admin-new/js/top-statusbar-session-tools.js');vm.runInContext(`const $=id=>document.getElementById(id);`+sessionSource.slice(sessionSource.indexOf('  function renderBestNextRunOrder()'),sessionSource.indexOf('  function renderRunOrder()')),ctx);await tick();await tick();
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

test('Recommendations do not occupy the approved LyricView header; library tools are separate',async()=>{
 const f=await setup('host/lyricview.html');assert.equal(f.document.querySelector('.host-song-actions #bestNextOpen'),null);assert.equal(f.document.getElementById('lyricBestNextStrip'),null);assert.equal(f.document.getElementById('bestNextPreview'),null);assert.ok(f.document.querySelector('#tsRunOrderBestNext [data-show-best]'));
 assert.deepEqual([...f.document.querySelector('.host-song-actions').children].map(e=>e.id),['quickEditSongBtn','songInfoBtn','songActionsBtn','songActionsMenu']);
 const l=await setup();assert.ok(l.document.querySelector('#libraryRecommendationTools #bestNextOpen'));assert.ok(l.document.querySelector('#libraryRecommendationTools #rotationFilter'));assert.equal(l.document.querySelector('.library-scope #rotationFilter'),null);
});

for(const route of ['host/lyricview','host/lyricview.html'])test('Run Order owns recommendation on '+route,async()=>{
 const f=await setup(route),d=f.document,card=d.getElementById('tsRunOrderBestNext'),list=d.getElementById('tsRunOrderList');
 assert.equal(card.nextElementSibling,list);assert.equal(card.previousElementSibling.id,'ls26AddSong');assert.match(list.textContent,/empty/);
 assert.equal(d.querySelector('#hostStickyStack #tsRunOrderBestNext'),null);assert.match(card.textContent,/FRESH/);
 card.querySelector('[data-show-best]').click();assert.equal(d.getElementById('bestNextPanel').hidden,false);
 d.getElementById('bestNextClose').click();assert.equal(d.getElementById('bestNextPanel').hidden,true);
 const selected=card.querySelector('[data-use-next]').dataset.useNext;card.querySelector('[data-use-next]').click();await tick();assert.equal(f.stats().writes[0][0].id,selected);assert.equal(f.stats().writes[0][1].next,true);
 list.innerHTML='<div>Existing queued song</div>';f.setRun([{songId:'b',status:'queued'}]);assert.equal(card.nextElementSibling,list);assert.match(list.textContent,/Existing/);
 f.performed([{songId:selected}]);assert.equal(card.querySelector(`[data-use-next="${selected}"]`),null);
 f.window.dispatchEvent(new f.window.CustomEvent('ls26:current-song',{detail:{songId:'b'}}));assert.equal(card.querySelector('[data-use-next="b"]'),null);
 f.setSession({id:'s1',venue:'Other'});assert.equal(d.querySelectorAll('#tsRunOrderBestNext').length,1);assert.equal(f.stats().reads,1);
});

test('Session context, deliberate override, source selection and act scope stay independent',async()=>{
 const f=await setup(),api=f.window.LS26BestNext,d=f.document;
 assert.equal(api.snapshot().context.venue,'Reflections');assert.equal(api.snapshot().context.poolIds.size,3);
 const venue=d.getElementById('bestNextVenueSelect');venue.value='planning venue';venue.onchange({target:venue});assert.equal(api.snapshot().context.venueKey,'planning venue');assert.equal(f.tools.getSession().venue,'Reflections');assert.match(d.getElementById('bestNextVenue').textContent,/OVERRIDE/);
 d.getElementById('bestNextSessionVenue').click();assert.equal(api.snapshot().context.venue,'Reflections');
 const source=d.getElementById('bestNextSource');source.value='alternate';source.onchange({target:source});assert.equal(api.snapshot().context.poolIds.size,1);assert.equal(api.get('a').eligible,false);assert.equal(api.get('b').eligible,true);
 source.value='all';source.onchange({target:source});assert.equal(api.snapshot().context.poolIds,null);assert.equal(api.get('a').eligible,true);
 f.setSession({id:'s2',venue:'Band Venue',venueId:'v2',sessionType:'Roxanna',setlistSongIds:['c']});await tick();assert.equal(api.snapshot().context.venueKey,'id:v2');assert.equal(api.snapshot().context.act,'roxanna');assert.equal(api.get('a').eligible,false);assert.equal(api.get('c').eligible,true);
 const act=d.getElementById('bestNextAct');act.value='all';act.onchange({target:act});assert.equal(api.snapshot().context.act,'all');assert.equal(f.tools.getSession().sessionType,'Roxanna');
});

test('Expanded tools render without performance-area insertion; Finish & Next is guarded and does not play transport',async()=>{
 const f=await setup('host/lyricview.html'),d=f.document;f.ctx.setInterval=()=>0;
 vm.runInContext(read('shared/performance-intelligence.js'),f.ctx);f.tools.getSongs=()=>f.songs;f.tools.getRequests=()=>[{id:'r',requesterId:'person',singerName:'Sarah',songId:'a',status:'pending',createdAt:Date.now()-120000}];
 let finishes=0,opened=0,stopped=0,resolve;f.tools.actions={openRunOrderSong:async()=>opened++,openRunOrderDetails(){},acceptRequest:async()=>{}};
 f.tools.finishCurrent=()=>{finishes++;return new Promise(r=>resolve=r);};f.window.LS26Performance={flushTempo:async()=>{},stop:()=>stopped++};
 vm.runInContext(read('shared/performance-tools-ui.js'),f.ctx);
 f.setSession({id:'s1',venue:'Reflections',sessionType:'Live Karaoke',setlistSongIds:['a','b','c']});
 f.setRun([{id:'p',songId:'b',songTitle:'Wonderwall',status:'playing'},{id:'next',songId:'c',songTitle:'Valerie',status:'queued'}]);
 assert.ok(d.getElementById('smartSingerRotation'));assert.ok(d.getElementById('smartSessionTiming'));assert.ok(d.querySelector('#smartVenueIntelligence summary'));assert.equal(d.querySelector('#hostStickyStack #smartRunTools'),null);
 const finish=d.querySelector('[data-smart-finish]');finish.click();finish.click();await tick();assert.equal(finishes,1);resolve({completed:true,next:{id:'next'}});await tick();assert.equal(opened,1);assert.equal(stopped,1);
 f.setSession({id:'s1',venue:'Reflections',sessionType:'Solo'});assert.equal(d.getElementById('smartSingerRotation'),null);
});

test('Smart performance scripts resolve to existing shared modules on clean and HTML entry routes',()=>{
 for(const page of ['library.html','requests.html','host/lyricview.html','host/lyricsviewer.html','host/lyricscreator.html','admin-new/admin.html','admin-new/performance-sessions.html']){
  const {document}=parseHTML(read(page));
  for(const route of [page,page.replace(/\.html$/,'')]){
   const url=new URL('/ls26try/'+route,'https://livesuite.livekaraoke.eu');
   const base=new URL(document.querySelector('base')?.getAttribute('href')||url.href,url);
   const scripts=[...document.querySelectorAll('script[src]')].filter(s=>/\/(performance-intelligence|performance-lifecycle|performance-tools-ui|gig-summary)\.js/.test('/'+s.getAttribute('src')));
   assert.ok(scripts.length>=2,page);
   for(const script of scripts){
    const resolved=new URL(script.getAttribute('src'),base);
    assert.match(resolved.pathname,/^\/ls26try\/shared\//,route+': '+resolved.pathname);
    assert.ok(fs.existsSync(path.join(root,resolved.pathname.slice('/ls26try/'.length))),resolved.pathname);
   }
  }
 }
});
