/* No-network regression exercising LiveSuite's actual remaining-time renderer. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'admin-new/js/top-statusbar-session-tools.js'),'utf8');
const style=fs.readFileSync(path.join(root,'admin-new/css/top-statusbar-session-tools.css'),'utf8');
assert.match(style,/#tsCompactRemaining\.is-normal/);
assert.match(style,/#tsCompactRemaining\.is-warning/);
assert.match(style,/#tsCompactRemaining\.is-overdue/);
const ids=['tsCompactRemaining','tsAdjustedRemainingTime','tsRemainingTime','tsCompactScheduledEnd','tsAdjustedEndTime','tsAdjustedRemainingHint','tsScheduledWindow'];
const els=new Map(ids.map(id=>[id,{textContent:'',innerHTML:'',classList:{
 classes:new Set(),
 add(...names){names.forEach(n=>this.classes.add(n))},
 remove(...names){names.forEach(n=>this.classes.delete(n))},
 contains(n){return this.classes.has(n)}
}}]));
let now=0;
class TestDate extends Date {static now(){return now}}
const fakeWindow={LK:{sessionTools:{}},addEventListener(){}};
const ctx={window:fakeWindow,LK:fakeWindow.LK,Date:TestDate,document:{readyState:'loading',addEventListener(){},getElementById:id=>els.get(id)||null},console,CustomEvent:class{}};
const injection='window.__remainingTest={state,renderRemaining,remainingTarget,remainingColour};';
assert.match(source,/\}\)\(\);\s*$/);
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,injection+'\n})();'),ctx,{filename:'top-statusbar-session-tools.js'});
const test=fakeWindow.__remainingTest;
const start=+new Date('2026-10-23T20:00:00Z'),end=+new Date('2026-10-23T22:00:00Z');
const time=n=>new Date(n).toISOString();
const setSession=(actualMs,projected=null)=>{
 test.state.sessionId='test';
 test.state.session={
  scheduledStartAt:time(start),scheduledEndAt:time(end),actualStartedAt:actualMs==null?null:time(actualMs),
  eventSnapshot:{scheduledStartAt:time(start),scheduledEndAt:time(end)}
 };
 if(projected!=null)test.state.session.projectedEndAt=time(projected);
 test.state.currentControl=null;
};
const check=(at,colour,expected)=>{
 now=at;test.renderRemaining();
 for(const id of ['tsCompactRemaining','tsAdjustedRemainingTime','tsRemainingTime']){
  const el=els.get(id);
  assert.equal(el.classList.contains(colour),true,id+' expected '+colour+' at '+new Date(at).toISOString());
  assert.equal(el.classList.classes.size,1,id+' has competing colour states');
  if(expected!==undefined)assert.equal(el.textContent,expected,id+' wrong remaining');
 }
};
setSession(start+20*60000);
check(end+4*60000,'is-normal','16m');
check(end+5*60000,'is-warning','15m');
check(end+19*60000+59000,'is-warning','0m');
check(end+20*60000,'is-warning','0m');
check(end+20*60000+1000,'is-overdue','−0m');
assert.equal(els.get('tsCompactScheduledEnd').textContent,'+20mins late');
assert.match(els.get('tsAdjustedRemainingHint').textContent,/finish extended/);
setSession(start);
check(end-16*60000,'is-normal','16m');
check(end-15*60000,'is-warning','15m');
setSession(start-10*60000);
check(end-16*60000,'is-normal','16m');
setSession(start+20*60000,end+30*60000);
check(end+14*60000,'is-normal','16m');
check(end+15*60000,'is-warning','15m');
assert.match(els.get('tsAdjustedRemainingHint').textContent,/Host-adjusted/);
test.state.sessionId='';test.state.session=null;now=end;test.renderRemaining();
for(const id of ['tsCompactRemaining','tsAdjustedRemainingTime','tsRemainingTime']){
 assert.equal(els.get(id).textContent,'-');
 assert.equal(els.get(id).classList.classes.size,0);
}
console.log('PASS blue >15m, amber final 15m, red after late-adjusted finish, explicit projections, early starts and cleared state');
