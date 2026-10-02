const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {create,fromAudioContext}=require('../shared/musical-transport.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('beat position derives from elapsed time without polling, including half beats and long gaps',()=>{
 let now=10;const t=create({now:()=>now,bpm:120});assert.equal(t.getBeat(),0);t.start();now+=.25;near(t.getBeat(),.5);
 now=3610;near(t.getBeat(),7200);for(let i=0;i<1000;i++)near(t.getBeat(),7200);
 assert.equal(t.timeAtBeat(7202),3611);
});
test('pause/resume, stop, seek and reset have explicit fractional positions',()=>{
 let now=0;const t=create({now:()=>now,bpm:120});t.start();now=1.25;t.pause();near(t.getBeat(),2.5);
 now=20;near(t.getBeat(),2.5);t.resume();now=20.25;near(t.getBeat(),3);
 t.seek(7.5);near(t.getBeat(),7.5);now=21;near(t.getBeat(),9);t.stop();near(t.getBeat(),0);
 now=99;near(t.getBeat(),0);assert.equal(t.timeAtBeat(4),null);t.reset(1.5);assert.equal(t.snapshot().state,'stopped');near(t.getBeat(),1.5);
});
test('tempo changes preserve musical position; paused changes do not advance it',()=>{
 let now=0;const t=create({now:()=>now,bpm:120});t.start();now=2;near(t.getBeat(),4);t.setBpm(60);near(t.getBeat(),4);
 now=3;near(t.getBeat(),5);t.pause();now=10;t.setBpm(180);near(t.getBeat(),5);t.resume();now=11;near(t.getBeat(),8);
});
test('future count-in is negative beats; scheduled start delay survives BPM change',()=>{
 let now=0;const t=create({now:()=>now,bpm:120});t.start({countInBeats:4,delaySeconds:1});near(t.getBeat(),-4);
 now=.5;t.setBpm(60);now=1;near(t.getBeat(),-4);now=5;near(t.getBeat(),0);
});
test('Web Audio adapter shares the audio clock and never falls back to wall time',()=>{
 const audio={currentTime:50},t=fromAudioContext(audio,{bpm:120});t.start();audio.currentTime=51;near(t.getBeat(),2);
 for(let i=0;i<100;i++)near(t.getBeat(),2);audio.currentTime=51.5;near(t.getBeat(),3);
});
test('invalid inputs and backwards clocks fail explicitly without changing position',()=>{
 let now=0;const t=create({now:()=>now,bpm:120});t.start();now=1;near(t.getBeat(),2);
 for(const n of [NaN,Infinity,0,-1])assert.throws(()=>t.setBpm(n));near(t.getBeat(),2);
 assert.throws(()=>t.seek(NaN));assert.throws(()=>t.start({countInBeats:-1}));
 now=.5;assert.throws(()=>t.getBeat(),/backwards/);assert.throws(()=>create({beatUnit:'dotted-quarter'}));
});
test('new modules have no Firestore, storage, timer, fetch or rendering side effects',()=>{
 const fail=()=>{throw Error('Unexpected side effect');};
 const ctx={window:{},performance:{now:()=>1000},setTimeout:fail,setInterval:fail,requestAnimationFrame:fail,fetch:fail};
 for(const key of ['firebase','db','localStorage','sessionStorage'])Object.defineProperty(ctx,key,{get:fail});
 vm.createContext(ctx);
 for(const file of ['chord-foundation.js','musical-transport.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared',file),'utf8'),ctx);
 const t=ctx.window.LS26MusicalTransport.create();t.start();t.setBpm(100);t.pause();t.resume();t.seek(.5);t.stop();
 assert.equal(ctx.window.LS26Chords.transpose('Bbmaj7/D',2),'Cmaj7/E');
});
