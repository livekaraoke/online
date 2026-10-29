const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../admin-new');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const tsDate=v=>v==null?null:v?.toDate?v.toDate():new Date(v);
function extract(src,from,to,ctx={}){
 const a=src.indexOf(from),b=src.indexOf(to,a);
 assert.ok(a>=0&&b>a,'Expected calculation block: '+from);
 return vm.runInNewContext('(()=>{'+src.slice(a,b)+';return {sessionStart:typeof sessionStart==="function"?sessionStart:null,sessionActualStart:typeof sessionActualStart==="function"?sessionActualStart:null,sessionActualEnd:typeof sessionActualEnd==="function"?sessionActualEnd:null,actualStart:typeof actualStart==="function"?actualStart:null,actualEnd:typeof actualEnd==="function"?actualEnd:null,sessionDuration:typeof sessionDuration==="function"?sessionDuration:null,durationValues:typeof durationValues==="function"?durationValues:null,durationMs:typeof durationMs==="function"?durationMs:null}})()', {tsDate,formatDurationMs:ms=>String(ms), ...ctx});
}
test('Past Session modal separates preparation from first song and clips pre-show breaks',()=>{
 const s=read('js/admin-dashboard-enhancements.js');
 const fn=extract(s,'  function sessionStart(session)','  function openDetailModal(');
 const data={timingVersion:2,openedAt:100000,startedAt:101000,actualStartedAt:500000,actualEndedAt:1200000,
  breaks:[{start:150000,end:300000},{start:600000,end:660000}]};
 assert.equal(+fn.sessionStart(data),100000);
 assert.equal(+fn.sessionActualStart(data),500000);
 assert.equal(+fn.sessionActualEnd(data),1200000);
 assert.equal(fn.sessionDuration(data),'640000 (700000)');
 assert.equal(fn.sessionActualStart({...data,actualStartedAt:null}),null);
 assert.match(s,/detailCell\("SESSION START"/);
 assert.match(s,/detailCell\("ACTUAL START"/);
});
test('History and analytics use musical timestamps rather than preparation',()=>{
 const p=read('js/performance-sessions.js');
 const a=extract(p,'  function getBreakMs(session','  function requestStatusBucket(');
 const d={timingVersion:2,openedAt:100000,startedAt:100000,actualStartedAt:500000,
   actualEndedAt:1200000,status:'ended',breaks:[{start:200000,end:300000},{start:600000,end:660000}]};
 assert.equal(+a.sessionStart(d),100000);
 assert.equal(+a.actualStart(d),500000);
 assert.equal(a.durationValues(d).activeMs,640000);
 assert.equal(a.durationValues(d).totalMs,700000);
 assert.match(p,/SESSION START/);
 assert.match(p,/"Session Start","Actual Start"/);
 const q=read('js/analytics-reports.js');
 const b=extract(q,'  function actualStart(session)','  function requestSnapshot(');
 assert.equal(+b.actualStart(d),500000);
 assert.equal(b.durationMs(d),640000);
 assert.equal(b.actualStart({...d,actualStartedAt:null}),null);
});
test('Dashboard heading remains PRE-SHOW during preparation and goes LIVE at first-song Play',()=>{
 const s=read('js/sessions.js'),html=read('admin.html');
 assert.match(html,/id="sessionPanelHeading">◉ PRE-SHOW/);
 assert.match(html,/<span>Session Start<\/span>/);
 const a=s.indexOf('  function updateSessionUi(session)'),b=s.indexOf('  function initSessions()',a);
 assert.ok(a>=0&&b>a);
 const nodes=new Map();
 const $=id=>{
   if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',style:{},classList:{remove(){},toggle(){},add(){}},disabled:false});
   return nodes.get(id);
 };
 const context={$,document:{activeElement:null},window:{LKAdminRenderSessionPreview(){}},
   LK:{},updateDashboard(){},};
 const fn=vm.runInNewContext('('+s.slice(a,b).trim()+')',context);
 fn({timingVersion:2,status:'active',startedAt:1000,actualStartedAt:null,breaks:[]});
 assert.equal($('sessionPanelHeading').textContent,'◉ PRE-SHOW');
 fn({timingVersion:2,status:'active',startedAt:1000,actualStartedAt:5000,breaks:[]});
 assert.equal($('sessionPanelHeading').textContent,'◉ LIVE SESSION');
 fn(null);
 assert.equal($('sessionPanelHeading').textContent,'◉ PRE-SHOW');
});
