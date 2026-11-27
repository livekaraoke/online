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
 const c={document:{getElementById:id=>nodes[id]},console,URL,location:{href:'https://livesuite.test/ls26try/admin-new/admin.html'},addEventListener:()=>{},LK:{db:{collection:ref}}};c.window=c;vm.createContext(c);vm.runInContext(read('admin-new/js/sidebar.js'),c);
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
 const items=['queued','played','completed','finished','abandoned','declined','playing'].map((status,i)=>({id:String(i),songTitle:status,status,singerName:'Example singer',requesterNote:'Example note'}));
 const c={$:id=>nodes[id],renderBestNextRunOrder:()=>{},ArtistNames:{display:x=>x},state:{sessionId:'s'},displayState:()=>({sessionId:'s'}),queueItems:()=>items,getBreakState:()=>({open:false}),runOrderPlayingItem:rows=>rows.find(x=>x.status==='playing'),requestForRunItem:()=>null,esc:x=>x,window:{matchMedia:()=>({matches:true})}};
 vm.createContext(c);vm.runInContext(code,c);c.renderRunOrder();assert.equal(nodes.tsRunOrderCount.textContent,'(2)');assert.match(nodes.tsRunOrderList.innerHTML,/data-ts-run-details="6"/);assert.doesNotMatch(nodes.tsRunOrderList.innerHTML,/data-ts-run-details="[12345]"/);assert.equal(items.length,7);assert.match(nodes.tsRunOrderList.innerHTML,/class="ts-run-requester-name">Example singer/);assert.match(nodes.tsRunOrderList.innerHTML,/class="ts-run-requester-note">Example note/);
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

test('native demo uses mock presentation records without replacing live session state',()=>{
 const source=read('shared/session-ui.js'),controller=read('admin-new/js/top-statusbar-session-tools.js');
 const code=source.slice(source.indexOf('  let demo=null;'),source.indexOf('  function renderSession(){'));
 const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
 const {document}=parseHTML('<html><body><div id="topStatusBar"><strong id="tsLiveLabel">OFFLINE</strong><span id="tsLiveDot" class="dot blue"></span></div></body></html>');
 let active='',view=null;const c={document,Date,tools:()=>({getSessionId:()=>active,getSession:()=>null,setDemoView:v=>{view=v}}),$:id=>document.getElementById(id),renderSession:()=>{},mirror:()=>{},console};
 vm.createContext(c);vm.runInContext(code,c);
 c.startDemo();assert.ok(view);assert.equal(view.session.venue,'Example Venue');assert.equal(view.requests.length,3);assert.equal(view.runOrder.items.length,4);assert.equal(view.notifications.length,5);
 assert.equal(document.querySelectorAll('#topStatusBar').length,1);assert.equal(document.getElementById('tsLiveLabel').textContent,'ONLINE');assert.equal(document.getElementById('topStatusBar').classList.contains('is-session-demo'),true);
 let blocked=false;c.guardDemoAction({target:document.getElementById('tsLiveLabel'),type:'click',preventDefault(){blocked=true},stopImmediatePropagation(){}});
 const button=document.createElement('button');button.setAttribute('data-ts-accept','demo-request-0');document.getElementById('topStatusBar').append(button);
 c.guardDemoAction({target:button,type:'click',preventDefault(){blocked=true},stopImmediatePropagation(){}});assert.equal(blocked,true);
 assert.match(controller,/getSessionId = \(\) => state.sessionId/);assert.match(controller,/getRequests = \(\) => state.requests/);
 c.stopDemo(false);assert.equal(view,null);assert.equal(document.getElementById('topStatusBar').classList.contains('is-session-demo'),false);
 c.startDemo();active='real-session';c.refreshDemo();assert.equal(view,null);c.startDemo();assert.equal(view,null);
});

test('manual request picker includes two unnamed requester shortcuts above new names',()=>{
 const source=read('shared/manual-request.js');
 assert.match(source,/unnamedRequesters=\['Unknown male','Unknown female'\]/);
 assert.match(source,/ls26-unnamed-requester-row\">\$\{unnamedRequesters\.map/);
 assert.ok(source.indexOf('class="ls26-unnamed-requester-row"')<source.indexOf('class="is-new" data-manual-new-requester'));
 assert.match(source,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('pending requests show a dedicated singer column and the actual suggested rotation priority',()=>{
 const I=require('../shared/performance-intelligence.js');
 const source=read('admin-new/js/top-statusbar-session-tools.js');
 const code=source.slice(source.indexOf('  function isPendingRequest('),source.indexOf('  function runOrderPlayingItem('));
 const nodes=Object.fromEntries(['tsPendingRequestsList','tsPendingCount','tsPendingTabCount'].map(id=>[id,element()]));
 const requests=[{id:'a',songId:'1',songTitle:'First',singerName:'Alex',createdAt:1000,status:'pending',note:'Birthday'},{id:'b',songId:'2',songTitle:'Second',singerName:'Sam',createdAt:2000,status:'pending'},{id:'c',songId:'3',songTitle:'Third',singerName:'Alex',createdAt:3000,status:'pending'},{id:'d',songId:'4',songTitle:'Cancelled',singerName:'Jamie',createdAt:4000,status:'cancelled'}];
 const state={sessionId:'s',session:{sessionType:'Live Karaoke'},requests,runOrder:{sessionId:'s',items:[]}};
 const ctx={state,displayState:()=>state,$:id=>nodes[id],tsDate:x=>new Date(x),ArtistNames:{display:x=>x},esc:x=>String(x??''),window:{LS26Intelligence:I}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.renderPending();
 const markup=nodes.tsPendingRequestsList.innerHTML;
 const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
 const {document}=parseHTML('<html><body>'+markup+'</body></html>');
 const rows=[...document.querySelectorAll('.ts-pending-request-row')];
 assert.deepEqual(rows.map(r=>r.dataset.lsRequest),['a','b','c','d']);
 assert.deepEqual(rows.map(r=>r.querySelector('[data-singer-rank]').textContent),['1','2','–','–']);
 assert.equal(rows[0].querySelector('.ts-pending-singer-name').textContent,'Alex');
 assert.equal(rows[0].querySelector('.ts-pending-note').textContent,'Birthday');
 assert.doesNotMatch(rows[0].querySelector('.ts-pending-main').textContent,/Alex/);
 state.runOrder.items=[{id:'q',songId:'1',singerName:'Alex',status:'queued'}];ctx.renderPending();
 const updated=parseHTML('<html><body>'+nodes.tsPendingRequestsList.innerHTML+'</body></html>').document;
 assert.deepEqual([...updated.querySelectorAll('[data-singer-rank]')].map(r=>r.textContent),['–','1','–','–']);
});
