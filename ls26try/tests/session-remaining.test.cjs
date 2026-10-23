const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../admin-new/js/top-statusbar-session-tools.js'),'utf8');
function fixture(session){
 let now=0;
 class Clock extends Date {static now(){return now;}}
 const nodes={};
 for(const id of ['tsCompactRemaining','tsCompactScheduledEnd','tsAdjustedRemainingTime','tsAdjustedEndTime','tsAdjustedRemainingHint','tsRemainingTime','tsScheduledWindow']){
  const classes=new Set();nodes[id]={textContent:'',innerHTML:'',classes,classList:{remove:(...names)=>names.forEach(n=>classes.delete(n)),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}};
 }
 const state={sessionId:'s',session,currentControl:null,linkedEvent:null};
 const c={Date:Clock,state,$:id=>nodes[id],inferLinkedEvent:()=>null};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('  function tsDate('),source.indexOf('  function breakStartDate('))+source.match(/  function shortDuration\(ms\)\{[^\n]+/)[0],c);
 return {state,nodes,render(time){now=time;c.renderRemaining();},colour(expected){for(const id of ['tsCompactRemaining','tsAdjustedRemainingTime','tsRemainingTime'])assert.deepEqual([...nodes[id].classes],expected?[expected]:[]);}};
}
const start=Date.parse('2026-10-23T20:00:00Z'),end=start+2*3600000;
test('exact thresholds use adjusted finish, including fractional late-start minutes',()=>{
 const delay=9*60000+12345,f=fixture({scheduledStartAt:new Date(start),scheduledEndAt:new Date(end),actualStartedAt:new Date(start+delay),timingVersion:2});
 const finish=end+delay;
 for(const [remaining,colour] of [[900001,'is-remaining'],[900000,'is-ending-soon'],[899999,'is-ending-soon'],[1,'is-ending-soon'],[0,'is-ending-soon'],[-1,'is-overdue'],[-299999,'is-overdue']]){f.render(finish-remaining);f.colour(colour);}
 f.state.session=null;f.render(finish);f.colour(null);assert.equal(f.nodes.tsCompactRemaining.textContent,'-');
});
test('explicit projected end takes precedence and breaks never extend the target',()=>{
 const projected=end-600000,f=fixture({scheduledStartAt:new Date(start),scheduledEndAt:new Date(end),actualStartedAt:new Date(start+600000),projectedEndAt:{toDate:()=>new Date(projected)},breaks:[{startedAt:new Date(start+1200000)}]});
 f.render(projected+1);f.colour('is-overdue');assert.equal(f.nodes.tsAdjustedRemainingHint.textContent,'Host-adjusted projected finish');
 f.state.session.breaks[0].endedAt=new Date(projected);f.render(projected-900001);f.colour('is-remaining');
});
test('early starts do not shorten finish; v2 prepared sessions ignore legacy startedAt',()=>{
 for(const session of [{actualStartedAt:new Date(start-600000)},{timingVersion:2,startedAt:new Date(start+600000)},{}]){
 const f=fixture({scheduledStartAt:new Date(start),scheduledEndAt:new Date(end),...session});f.render(end+1);f.colour('is-overdue');}
});
test('legacy start and event/control schedule fallbacks retain compatibility',()=>{
 const f=fixture({startedAt:new Date(start+600000)});f.state.currentControl={scheduledStartAt:new Date(start),scheduledEndAt:new Date(end)};f.render(end+600000-900001);f.colour('is-remaining');
 f.state.currentControl=null;f.state.linkedEvent={scheduledStartAt:{toDate:()=>new Date(start)},scheduledEndAt:{toDate:()=>new Date(end)}};f.render(end+600001);f.colour('is-overdue');
 f.state.linkedEvent=null;f.render(end);f.colour(null);
});
test('CSS provides the three colours for every remaining-time display',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../admin-new/css/top-statusbar-session-tools.css'),'utf8');
 for(const [cls,colour] of [['is-remaining','var(--host-blue, #67bff0)'],['is-ending-soon','#f2cf4d'],['is-overdue','#ff4b55']]){
 for(const id of ['tsCompactRemaining','tsAdjustedRemainingTime','tsRemainingTime']) assert.ok(css.includes(`#topStatusBar #${id}.${cls}`));
 const rule=css.slice(css.indexOf(`#topStatusBar #tsCompactRemaining.${cls}`)).split('}')[0];assert.ok(rule.includes(`color: ${colour} !important`));}
});
