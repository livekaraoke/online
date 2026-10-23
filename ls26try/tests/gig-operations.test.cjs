const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const g=require('../admin-new/js/gig-operations.js');
const read=p=>fs.readFileSync(path.join(__dirname,'../admin-new',p),'utf8');
test('weekly and fortnightly gig occurrences remain calendar-aligned over DST',()=>{
 assert.deepEqual(g.recurrenceDates('2026-10-18','weekly',3),['2026-10-18','2026-10-25','2026-11-01']);
 assert.deepEqual(g.recurrenceDates('2026-10-18','biweekly',3),['2026-10-18','2026-11-01','2026-11-15']);
 assert.throws(()=>g.recurrenceDates('2026-10-18','weekly',53));
});
test('Malta cross-midnight gigs preserve wall-clock finish on both DST weekends',()=>{
 const autumn=g.schedule('2026-10-24','23:00','03:00');
 const spring=g.schedule('2027-03-27','23:00','03:00');
 assert.equal(autumn.durationMs,5*3600000);
 assert.equal(spring.durationMs,3*3600000);
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Malta',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 assert.equal(fmt.format(autumn.end),'03:00');
});
test('venue uniqueness ignores case and punctuation but distinguishes separate branches',()=>{
 assert.equal(g.sameVenue({name:'The Whyte Harte',locality:"St Paul's Bay"},{name:'whyte-harte',locality:'St Pauls Bay'}),true);
 assert.equal(g.sameVenue({name:'Blue Bar',locality:'Sliema'},{name:'Blue Bar',locality:'Valletta'}),false);
});
test('band revenue and performer income are separated',()=>{
 assert.deepEqual(g.financeSummary({agreedFee:270,amountReceived:270,personalShare:90,organiserFee:30,expenses:10}),
  {fee:270,received:270,outstanding:0,personalNet:110});
});
test('recurring gigs and finance use existing event and dedicated private collection',()=>{
 const source=read('js/upcoming-events.js');
 assert.match(source,/recurrenceSeriesId/);
 assert.match(source,/batch\.commit\(\)/);
 assert.match(source,/gigFinances/);
 assert.match(source,/eventLinkedSession/);
 assert.match(source,/performanceSessions"\)\.where\("eventId"/);
 const html=read('upcoming-events.html');
 for(const id of ['eventRepeatInput','eventRepeatCountInput','eventFeeInput','eventShareInput','eventReceivedInput'])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test('venue deletion blocks records with historical references and venue history reuses archives',()=>{
 const s=read('js/venues.js');
 assert.match(s,/verifyVenueUnique/);
 assert.match(s,/loadVenueReferences/);
 assert.match(s,/if\(links\.blocked\)/);
 assert.match(s,/openVenueHistory/);
 assert.match(s,/playedSongsSnapshot/);
 assert.match(s,/gigFinances/);
});