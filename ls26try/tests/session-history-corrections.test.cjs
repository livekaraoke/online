const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const utils=require('../admin-new/js/session-history-correction.js');
const gig=require('../admin-new/js/gig-operations.js');
const read=p=>fs.readFileSync(path.join(__dirname,'../admin-new',p),'utf8');

test('Malta dates round-trip as local datetime inputs without changing a timestamp',()=>{
 const date=new Date('2026-11-03T00:30:00.000Z');
 const value=utils.asInput(date);
 assert.equal(value,'2026-11-03T01:30');
 assert.equal(utils.parseInput(value,gig.maltaTime).getTime(),date.getTime());
});
test('night gig schedule edits allow cross-midnight but reject negative intervals',()=>{
 const start=utils.parseInput('2026-11-03T23:30',gig.maltaTime);
 const end=utils.parseInput('2026-11-04T02:30',gig.maltaTime);
 assert.equal(utils.validateTimes({scheduledStart:start,scheduledEnd:end}),true);
 assert.throws(()=>utils.validateTimes({scheduledStart:end,scheduledEnd:start}),/Scheduled end/);
 assert.throws(()=>utils.validateTimes({scheduledStart:start,scheduledEnd:end,actualEnd:end}),/actual start/i);
 assert.throws(()=>utils.validateTimes({scheduledStart:start,scheduledEnd:end,actualStart:end,actualEnd:start}),/Actual end/);
 assert.throws(()=>utils.parseInput('2027-03-28T02:30',gig.maltaTime),/time/i);
});
test('changing act or venue regenerates title with gig date, not current date',()=>{
 assert.equal(utils.titleFor('Roxanna','Black Gold Saloon',new Date('2026-11-03T00:30:00.000Z')),
   'Roxanna @ Black Gold Saloon 03/11');
});
test('Session History shows venue and act above the four real editable timestamps',()=>{
 const source=read('js/performance-sessions.js');
 const identity=source.indexOf('correctionCard(session,"VENUE"');
 const act=source.indexOf('correctionCard(session,"ACT TYPE"');
 const start=source.indexOf('correctionCard(session,"SCHEDULED START"');
 assert.ok(identity>=0&&act>identity&&start>act);
 for(const name of ['SCHEDULED END','ACTUAL START','ACTUAL END'])assert.match(source,new RegExp('correctionCard\\(session,"'+name+'"'));
 assert.doesNotMatch(source,/editableFinishedCard\(session,"actualStart"/);
 assert.match(source,/sessionHistorySummary\(session, detail\)/);
 assert.match(source,/sessionHistorySummary\(session,detail\)/);
});
test('Archive editor verifies linked session, writes transaction, keeps IDs and request/song snapshots intact',()=>{
 const source=read('js/session-history-editor.js');
 assert.match(source,/db\.runTransaction\(async tx/);
 assert.match(source,/ev\.linkedSessionId!==id/);
 assert.match(source,/current\.status==="active"/);
 assert.match(source,/live\.active===true/);
 assert.match(source,/tx\.update\(eventRef,eventPatch\)/);
 assert.match(source,/tx\.update\(ref,sessionPatch\)/);
 assert.match(source,/tx\.update\(financeRef,/);
 assert.match(source,/sessionCorrectionHistory:history/);
 assert.doesNotMatch(source,/tx\.delete\(/);
 assert.doesNotMatch(source,/playedSongsSnapshot\s*:/);
 assert.doesNotMatch(source,/requestSnapshot\s*:/);
});
test('Session History popup is contained within visual viewport and summary is collapsible',()=>{
 const html=read('performance-sessions.html');
 const css=read('css/performance-sessions.css');
 assert.match(html,/id="sessionCorrectionModal"/);
 assert.match(html,/session-history-editor\.js/);
 assert.match(css,/max-height:calc\(100dvh - 20px\)/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/history-gig-summary/);
 assert.match(css,/history-correction-modal/);
});
