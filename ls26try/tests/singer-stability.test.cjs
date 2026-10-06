const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const lines=require('../shared/singer-lines.js'),chords=require('../shared/chord-foundation.js'),audio=require('../shared/song-audio.js');
const document=()=>parseHTML('<html></html>').document;
test('source mapping follows chord-model lines with blocks, blank lines, repeated lyrics and inline chords',()=>{
 const doc=document(),section={type:'lyrics',html:'<div><b>G</b></div><div>Same words</div><div><br></div><div><b>D</b></div><div>Same words</div><div><strong class="inserted-chord">C/G</strong> Inline lyric</div>'};
 const rows=lines.section(section,doc),events=chords.extractSections([section],doc).candidates;
 const targets=events.map(e=>lines.target(rows,e.anchor.lineIndex));
 assert.equal(targets.length,3);assert.equal(targets[0].text,'Same words');assert.equal(targets[1].text,'Same words');assert.notEqual(targets[0].sourceLineIndex,targets[1].sourceLineIndex);assert.equal(targets[2].sourceLineIndex,events[2].anchor.lineIndex);assert.equal(targets[2].text,'Inline lyric');
});
test('lyric rows exclude chord rows, host notes and time markers, preserving safe emphasis and performance cues',()=>{
 const doc=document(),rows=lines.section({html:'<div><strong>C/G</strong> <b>Bbmaj7/D</b></div><div>Sing <em onclick="bad()">this</em></div><div class="ls26-inline-host-note" data-host-note="Private">secret</div><span class="ls26-time-signature-change" data-time-signature="3/4"></span><span data-performance-note="LOUD" data-performance-note-size="24"></span><div>Next words</div>'},doc);
 assert.equal(rows.filter(r=>r.kind==='chord').length,1);assert.equal(rows.filter(r=>r.kind==='lyric').length,2);assert.ok(rows.find(r=>r.text==='Sing this').html.includes('<em>this</em>'));assert.ok(!JSON.stringify(rows).includes('onclick'));assert.ok(!JSON.stringify(rows).includes('secret'));assert.ok(rows.some(r=>r.kind==='cue'&&r.text==='LOUD'));
 assert.deepEqual(lines.section({type:'hostNote',text:'private',visibleOnSingerScreen:true},doc),[]);
 assert.equal(lines.target(rows,999),null,'never guess another line when no target exists');
});
function fakeAudio(){let context,time=0;const clicks=[],timers=new Map();const window={addEventListener(){},document:{addEventListener(){}},setInterval:f=>{timers.set(1,f);return 1;},clearInterval:id=>timers.delete(id),AudioContext:class{constructor(){context=this;this.state='suspended';this.destination={};}get currentTime(){return time;}async resume(){time+=.003;this.state='running';}createGain(){return {connect(){}};}}};return {window,clicks,timers,time:v=>time=v,now:()=>time};}
test('timed resume reanchors after unlock and schedules the original chord click, including fractional/improv offsets',async()=>{
 for(const start of [0,6,6.5,30]){
  const e=fakeAudio();let pausedArgument;
  e.window.LS26TimedView={enabled:()=>true,restartBeat:beat=>{pausedArgument=beat;return start;}};
  const driver=audio.create({window:e.window,getSettings:()=>({bpm:120,beats:4,volume:0}),onClick:c=>e.clicks.push(c)});
  await driver.start();e.time(4);driver.pause();const paused=driver.getBeat();e.time(20);e.clicks.length=0;
  await driver.resume();assert.equal(pausedArgument,paused);assert.equal(driver.getBeat(),start);assert.equal(e.timers.size,1);
  if(Number.isInteger(start)){assert.equal(e.clicks[0].position,start);assert.ok(e.clicks[0].time>e.now(),'restart downbeat is scheduled ahead, not skipped');assert.equal(e.clicks[0].beat,start%4);}
  driver.stop();assert.equal(e.timers.size,0);
 }
});
test('IMPROV hold and count-in may decline a chord restart without resetting the held transport',async()=>{
 const e=fakeAudio();e.window.LS26TimedView={enabled:()=>true,restartBeat:()=>null};const driver=audio.create({window:e.window,getSettings:()=>({bpm:120,volume:0})});await driver.start({countInBeats:4});e.time(.5);driver.pause();const beat=driver.getBeat();e.time(10);await driver.resume();assert.equal(driver.getBeat(),beat);driver.stop();
});
