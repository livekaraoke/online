const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function element(){const classes=new Set();return {textContent:'',innerHTML:'',classList:{add:x=>classes.add(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},querySelectorAll:()=>[]};}
test('sidebar pending badge follows current session and ignores stale snapshots',()=>{
 const nodes=Object.fromEntries(['sidebarRequestBadge','sidebarLiveNowBadge','sidebarRunOrderBadge'].map(id=>[id,element()]));const listeners=[],queries=[];
 function ref(name){return {doc:id=>ref(name+'/'+id),where:(...q)=>{queries.push(q);return ref(name)},onSnapshot(callback){listeners.push({name,callback});return ()=>{};}};}
 const c={document:{getElementById:id=>nodes[id]},console,LK:{db:{collection:ref}}};c.window=c;vm.createContext(c);vm.runInContext(read('admin-new/js/sidebar.js'),c);
 c.LK.sidebar.listenSidebarSongRequests();assert.equal(queries.length,0);assert.equal(nodes.sidebarRequestBadge.textContent,'0');
 c.LK.sidebar.listenSidebarLiveSession();const control=listeners.find(l=>l.name==='karaokeControl/currentSession').callback;
 const snapshot=(data)=>({exists:true,data:()=>data});control(snapshot({active:true,sessionId:'current'}));assert.deepEqual(queries[0],['sessionId','==','current']);
 const first=listeners.find(l=>l.name==='publicSongRequests').callback;
 const requests=statuses=>({docs:statuses.map(status=>({data:()=>({status})}))});first(requests(['pending','waiting','active','','queued','completed','played']));assert.equal(nodes.sidebarRequestBadge.textContent,'4');
 c.LK.sidebar.listenSidebarRunOrder();listeners.find(l=>l.name==='karaokeControl/runOrder').callback(snapshot({sessionId:'current',items:[{status:'queued'},{status:'played'},{status:'finished'},{status:'declined'}]}));assert.equal(nodes.sidebarRunOrderBadge.textContent,'1');
 control(snapshot({active:true,sessionId:'next'}));assert.equal(nodes.sidebarRequestBadge.textContent,'0');assert.equal(nodes.sidebarRunOrderBadge.textContent,'0');first(requests(['pending','pending']));assert.equal(nodes.sidebarRequestBadge.textContent,'0');
 control(snapshot({active:false}));assert.equal(nodes.sidebarRequestBadge.classList.contains('hidden'),true);
});
test('active Run Order excludes terminal songs without deleting history',()=>{
 const source=read('admin-new/js/top-statusbar-session-tools.js');const code=source.slice(source.indexOf('  function renderRunOrder()'),source.indexOf('  function renderSongSelect()'));
 const nodes=Object.fromEntries(['tsRunOrderList','tsRunOrderCount','tsRunOrderTabCount'].map(id=>[id,element()]));
 const items=['queued','played','completed','finished','abandoned','declined','playing'].map((status,i)=>({id:String(i),songTitle:status,status}));
 const c={$:id=>nodes[id],state:{sessionId:'s'},queueItems:()=>items,getBreakState:()=>({open:false}),runOrderPlayingItem:rows=>rows.find(x=>x.status==='playing'),requestForRunItem:()=>null,esc:x=>x,window:{matchMedia:()=>({matches:true})}};
 vm.createContext(c);vm.runInContext(code,c);c.renderRunOrder();assert.equal(nodes.tsRunOrderCount.textContent,'(2)');assert.match(nodes.tsRunOrderList.innerHTML,/data-ts-run-details="6"/);assert.doesNotMatch(nodes.tsRunOrderList.innerHTML,/data-ts-run-details="[12345]"/);assert.equal(items.length,7);
 items.splice(0,items.length,{id:'done',status:'played'});c.renderRunOrder();assert.equal(nodes.tsRunOrderCount.textContent,'(0)');assert.match(nodes.tsRunOrderList.innerHTML,/Run Order is empty/);
});
test('open break timer advances locally while completed break duration remains fixed',()=>{
 const source=read('shared/session-ui.js');const code=source.slice(source.indexOf('  function breakDurationMs'),source.indexOf('  function renderSession'));
 let now=Date.parse('2026-09-22T21:10:00Z');class Clock extends Date{static now(){return now;}}
 const breaks=[{start:new Date(now-180000)},{startedAt:{toDate:()=>new Date(now-300000)},endedAt:new Date(now-240000)}];
 const cells=[{dataset:{lsBreakTime:'0'}},{dataset:{lsBreakTime:'1'}}],summary={};
 const c={Date:Clock,date:x=>x?.toDate?.()||(x?new Date(x):null),tools:()=>({getSession:()=>({breaks})}),document:{querySelectorAll:()=>cells},$:()=>summary};vm.createContext(c);vm.runInContext(code,c);c.refreshBreakTimers();assert.equal(cells[0].textContent,'3m 00s');assert.equal(cells[1].textContent,'1m 00s');
 // Capture the completed start as a fixed timestamp before advancing our clock.
 breaks[1].startedAt=new Date(now-300000);now+=5000;c.refreshBreakTimers();assert.equal(cells[0].textContent,'3m 05s');assert.equal(cells[1].textContent,'1m 00s');assert.match(summary.textContent,/4m 05s total/);
 breaks[0].end=new Date(now);now+=10000;c.refreshBreakTimers();assert.equal(cells[0].textContent,'3m 05s');
});
