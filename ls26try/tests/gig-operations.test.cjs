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

test('next gig countdown never displays seconds',()=>{
 const vm=require('node:vm');
 const source=read('js/upcoming-events.js');
 const from=source.indexOf('  function formatGigCountdown(');
 const to=source.indexOf('  function tickNextGigCountdown()',from);
 assert.ok(from>=0&&to>from,'Countdown formatter must exist');
 const countdown=vm.runInNewContext('('+source.slice(from,to).trim()+')');
 assert.equal(countdown(1*3600000+43*60000+23*1000),'1h 43m');
 assert.equal(countdown(2*86400000+5*3600000+8*60000),'2d 5h 8m');
 assert.equal(countdown(2*60000+20*1000),'2m');
 assert.equal(countdown(40*1000),'STARTING SOON');
 assert.equal(countdown(0),'START TIME PASSED');
});
test('Venues page uses same LiveSuite theme tokens as Gigs & Events',()=>{
 const html=read('venues.html'),theme=read('css/venues-polish.css');
 assert.match(html,/venues-polish\.css\?v=20261023-livesuite-blue/);
 for(const token of ['--ls-bg','--ls-accent','--ls-border','--ls-success'])
  assert.ok(theme.includes(token),token+' theme token missing');
 assert.match(theme,/\.venues-btn\.primary\s*\{/);
 assert.match(theme,/\.venues-modal-card\s*\{/);
 assert.match(theme,/\.venues-summary-card/);
 assert.match(theme,/\.venue-row/);
 assert.match(theme,/\.venue-closed-badge|CLOSED DOWN badges intentionally stay red/);
});


test('existing Admin close buttons are not duplicated by the shared dialog enhancer',()=>{
 const shared=fs.readFileSync(path.join(__dirname,'../shared/dialogs.js'),'utf8');
 assert.match(shared,/panel\.querySelector\('\.events-modal-head button\[aria-label="Close"\], \.venues-modal-head button\[aria-label="Close"\]'\)/);
 assert.match(shared,/modal\.dataset\.ls26Close='native';/);
 const events=read('upcoming-events.html');
 assert.equal((events.match(/id="eventModalCloseBtn"/g)||[]).length,1);
 assert.match(events,/dialogs\.js\?v=20261023-single-close/);
});
test('venue history uses an accessible eye icon and a touch-sized button',()=>{
 const js=read('js/venues.js'),css=read('css/venues-polish.css'),html=read('venues.html');
 assert.match(js,/data-history-venue/);
 assert.match(js,/aria-label="View history for/);
 assert.match(js,/<svg aria-hidden="true" viewBox="0 0 24 24"/);
 assert.doesNotMatch(js,/>HISTORY<\/button>/);
 assert.match(css,/\.venue-row-actions button\.history\{/);
 assert.match(css,/min-width:44px/);
 assert.match(html,/js\/venues\.js\?v=20261023-eye-icon/);
});
