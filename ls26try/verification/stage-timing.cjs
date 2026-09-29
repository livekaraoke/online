/* Copyright © 2026 LiveSuite. Local timer/section regression checks; no live Firebase. */
const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert');
const els=new Map();function el(id){if(!els.has(id)){let value='';const classes=new Set();els.set(id,{writes:0,get textContent(){return value},set textContent(v){value=String(v);this.writes++},innerHTML:'',classList:{remove(...v){v.forEach(x=>classes.delete(x))},toggle(k,on){on?classes.add(k):classes.delete(k)},contains:k=>classes.has(k)}})}return els.get(id)}
let now=Date.parse('2026-09-10T21:00:00Z');class Clock extends Date{static now(){return now}}
const ctx={console,Date:Clock,Map,Set,Promise,localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>null,setItem(){}},document:{readyState:'loading',getElementById:el,addEventListener(){}},window:null};ctx.window=ctx;ctx.addEventListener=()=>{};ctx.dispatchEvent=()=>{};vm.createContext(ctx);
let code=fs.readFileSync(path.join(__dirname,'../admin-new/js/top-statusbar-session-tools.js'),'utf8').replace('  const $ = id => document.getElementById(id);','  window.test={state,tick:()=>{renderCompactHostStrip();renderRemaining();}};\n  const $ = id => document.getElementById(id);');vm.runInContext(code,ctx);
ctx.test.state.db=new Proxy({},{get(){throw Error('Unexpected database access during local timer')}});Object.assign(ctx.test.state,{sessionId:'s',session:{venue:'Test Venue',startedAt:new Clock('2026-09-10T20:05:00Z'),scheduledStartAt:new Clock('2026-09-10T20:00:00Z'),scheduledEndAt:new Clock('2026-09-10T23:00:00Z'),scheduledDurationMs:10800000}});
ctx.test.tick();const count=el('tsCompactType').writes;for(let i=0;i<120;i++){now+=1000;ctx.test.tick()}assert.equal(el('tsCompactType').writes,count);assert.equal(el('tsCompactVenue').writes,1);assert.equal(el('tsCompactScheduledEnd').textContent,'+5mins late');
now=Date.parse('2026-09-10T23:09:59Z');ctx.test.tick();assert.equal(el('tsCompactRemaining').classList.contains('is-overdue'),false);now+=1000;ctx.test.tick();assert.equal(el('tsCompactRemaining').classList.contains('is-overdue'),true);assert.equal(el('tsCompactRemaining').textContent,'−5m');
console.log('PASS: stable labels for 120 local ticks, no database access, late-start label and exact minus-five-minute threshold.');
let source=fs.readFileSync(path.join(__dirname,'../host/js/lyricview.js'),'utf8');source=source.slice(source.indexOf('  function sectionActivationOffset()'),source.indexOf('  window.addEventListener("resize"',source.indexOf('  function scrollToSection(index)')));
const nav={console,Date:Clock,currentSectionIndex:0,manualSectionUntil:0,relativeScrollFrame:0,autoScrollOn:false,autoScrollEndHandled:false,sectionPauseUntil:0,sectionPauseStartsAt:0,sectionPauseCountdownFrame:0,lastSectionPauseIndex:-1,setTimeout(){},requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){},centerActiveProgressSection(){},guitarTuningStickyHeight:()=>0,updateGuitarTuningStickyState(){},document:{getElementById:id=>id==='ls26StickyHeader'?{getBoundingClientRect:()=>({height:150})}:id==='performanceQuickInfo'?{classList:{toggle(){},contains:()=>true},getBoundingClientRect:()=>({height:60})}:null},$:()=>({children:[]}),window:{LS26Settings:{get:()=>({lyricSectionActivationOffset:12,lyricPastSectionOpacity:50,lyricUpcomingSectionOpacity:50,lyricUpcomingFadeDistance:180,lyricPreviousFadeDistance:180,lyricSectionFocusDuringPlayback:true,lyricSectionFocusWhenStopped:true})},scrollY:0,scrollTo({top}){this.scrollY=top}}};nav.sectionEls=[200,500,1100].map(top=>({getBoundingClientRect:()=>({top:top-nav.window.scrollY}),classList:{toggle(){}},dataset:{},style:{opacity:'1'}}));nav.sectionItems=nav.sectionEls.map((el,index)=>({el,section:{pauseMs:index===1?1200:0}}));vm.createContext(nav);vm.runInContext(source,nav);now=0;nav.scrollToSection(1);nav.updateSectionProgress();assert.equal(nav.currentSectionIndex,1);nav.scrollToSection(nav.currentSectionIndex+1);assert.equal(nav.currentSectionIndex,2);now=1000;nav.updateSectionProgress();assert.equal(nav.currentSectionIndex,2);assert.equal(nav.window.scrollY,938);
console.log('PASS: consecutive Next Section commands retain their destination through progress tracking.');
nav.currentSectionIndex=0;nav.manualSectionUntil=0;nav.window.scrollY=0;nav.updateSectionProgress();
assert.equal(nav.sectionEls[0].style.opacity,'1');
assert.equal(nav.sectionEls[1].style.opacity,'0.5');
nav.window.scrollY=248;nav.updateSectionProgress();
assert.equal(nav.currentSectionIndex,0);
assert.equal(nav.sectionEls[0].style.opacity,'1');
assert.equal(Number(nav.sectionEls[1].style.opacity).toFixed(2),'0.75');
nav.window.scrollY=338;nav.updateSectionProgress();
assert.equal(nav.currentSectionIndex,1);
assert.equal(nav.sectionEls[0].style.opacity,'1');
assert.equal(nav.sectionEls[0].dataset.focusState,'previous');
assert.equal(nav.sectionEls[1].style.opacity,'1');
nav.window.scrollY=428;nav.updateSectionProgress();
assert.equal(nav.currentSectionIndex,1);
assert.equal(Number(nav.sectionEls[0].style.opacity).toFixed(2),'0.75');
nav.window.scrollY=518;nav.updateSectionProgress();
assert.equal(nav.currentSectionIndex,1);
assert.equal(nav.sectionEls[0].style.opacity,'0.5');
console.log('PASS: previous section begins fading at activation and reaches its target after the configured scroll distance.');

nav.window.LS26Settings.get=()=>({lyricSectionActivationOffset:12,lyricPastSectionOpacity:50,lyricUpcomingSectionOpacity:50,lyricUpcomingFadeDistance:180,lyricPreviousFadeDistance:180,lyricSectionFocusDuringPlayback:true,lyricSectionFocusWhenStopped:false});
nav.autoScrollOn=false;nav.currentSectionIndex=0;nav.window.scrollY=248;nav.updateSectionProgress();
assert.deepEqual(nav.sectionEls.map(el=>el.style.opacity),['1','1','1']);
nav.autoScrollOn=true;nav.updateSectionProgress();
assert.equal(nav.sectionEls[0].style.opacity,'1');
assert.equal(Number(nav.sectionEls[1].style.opacity).toFixed(2),'0.75');

nav.window.LS26Settings.get=()=>({lyricSectionActivationOffset:12,lyricPastSectionOpacity:50,lyricUpcomingSectionOpacity:50,lyricUpcomingFadeDistance:180,lyricPreviousFadeDistance:180,lyricSectionFocusDuringPlayback:false,lyricSectionFocusWhenStopped:true});
nav.autoScrollOn=true;nav.updateSectionProgress();
assert.deepEqual(nav.sectionEls.map(el=>el.style.opacity),['1','1','1']);
nav.autoScrollOn=false;nav.updateSectionProgress();
assert.equal(nav.sectionEls[0].style.opacity,'1');
assert.equal(Number(nav.sectionEls[1].style.opacity).toFixed(2),'0.75');
console.log('PASS: playback and stopped fading modes can be enabled or disabled independently.');


/* Per-section auto-scroll pause regression. */
now=0;
nav.autoScrollOn=true;
nav.currentSectionIndex=0;
nav.lastSectionPauseIndex=0;
nav.sectionPauseUntil=0;
nav.manualSectionUntil=0;
nav.window.scrollY=338;
nav.updateSectionProgress();
assert.equal(nav.currentSectionIndex,1);
assert.equal(nav.sectionPauseUntil,1200);
assert.equal(nav.lastSectionPauseIndex,1);
now=400;
nav.updateSectionProgress();
assert.equal(nav.sectionPauseUntil,1200);
now=1200;
assert.equal(now>=nav.sectionPauseUntil,true);
console.log('PASS: section pause starts once on activation and does not restart while the same section remains active.');
