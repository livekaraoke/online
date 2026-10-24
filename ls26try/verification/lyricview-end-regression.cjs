/* Focused no-network regression for explicit song completion and queue navigation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const lyric=fs.readFileSync(path.join(root,'host/js/lyricview.js'),'utf8');
const html=fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8');
const status=fs.readFileSync(path.join(root,'admin-new/js/top-statusbar-session-tools.js'),'utf8');
const tools=fs.readFileSync(path.join(root,'shared/performance-tools-ui.js'),'utf8');
assert.match(html,/id="endCompleteSongBtn"/);
assert.match(html,/id="endCompletionFinishSlot"/);
assert.match(tools,/const finishDestination=finishSlot\|\|row/);
assert.match(status,/const destination=slot\|\|row/);
assert.match(lyric,/await performanceLifecycle\(\)\.finish\(\{sessionId,itemId:active\.id,status:'abandoned'\}\)/);
const nextBody=lyric.split('async function goToNextRunOrderSong()')[1].split('function stayOnCurrentSong()')[0];
assert.doesNotMatch(nextBody,/finalizeCurrentSongPlayed/);
function extract(name){
 const i=lyric.indexOf('async function '+name+'(');
 assert.ok(i>=0,name+' not found');
 const first=lyric.indexOf('{',i),lastName=lyric.indexOf('(',i);
 let depth=0,end=-1;
 for(let n=first;n<lyric.length;n++){if(lyric[n]==='{')depth++;if(lyric[n]==='}'&&--depth===0){end=n+1;break;}}
 assert.ok(end>first,name+' unbalanced');
 return lyric.slice(i,end);
}
const button={disabled:false,textContent:'✓ COMPLETE',focused:false,focus(){this.focused=true;}};
const panel={hidden:true};
const play={classList:{remove(){}},innerHTML:''};
const endNext={hidden:true};
const actions={hidden:true};
const els={endCompletionPanel:panel,endCompleteSongBtn:button,autoScrollBtn:play,endNextRunOrderSongBtn:endNext,endSessionActions:actions};
const counters={finish:0,singer:0,details:0,scroll:0,event:[]};
let failSave=false;
const ctx={
 console,Promise,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail;}},
 window:{dispatchEvent:e=>counters.event.push(e.type),LS26:{toast:m=>counters.event.push(m)}},
 document:{},
 $:id=>els[id]||null,
 autoScrollEndHandled:false,autoScrollOn:true,sectionPauseStartsAt:4,sectionPauseUntil:4,scrollTimer:99,completingSong:false,
 clearSectionPauseCountdown:()=>{},queueSingerSync:()=>{},cancelAnimationFrame:()=>{},
 finalizeCurrentSongPlayed:async()=>{counters.finish++;if(failSave)throw Error('network failure')},
 publishSingerSongFinished:async()=>{counters.singer++},
 showEndCompletionPanel:show=>{panel.hidden=!show;ctx.window.dispatchEvent({type:'ls26:completion-state'})},
 showEndNextSongButton:show=>{endNext.hidden=!show},
 syncEndSessionActions:()=>{},
 renderEndNextSongDetails:async()=>{counters.details++},
 requestAnimationFrame:()=>{},setTimeout:()=>{},slowScrollCompletionIntoView:()=>{}
};
vm.createContext(ctx);
vm.runInContext(extract('stopAutoScrollAtEnd')+'\n'+extract('completeSongAtEnd')+'\nthis.stop=stopAutoScrollAtEnd;this.complete=completeSongAtEnd;',ctx);
(async()=>{
 await ctx.stop();
 assert.equal(panel.hidden,true,'[ END ] cannot show Song Complete');
 assert.equal(counters.finish,0,'[ END ] cannot finish the performance');
 assert.equal(counters.singer,0,'[ END ] cannot publish singer finished');
 assert.equal(ctx.autoScrollOn,false);
 assert.equal(button.focused,true);
 await ctx.complete();
 assert.equal(counters.finish,1,'COMPLETE must finalize exactly once');
 assert.equal(counters.singer,1,'COMPLETE must update singer state once');
 assert.equal(panel.hidden,false,'COMPLETE must reveal panel');
 await ctx.complete();
 assert.equal(counters.finish,1,'Repeated COMPLETE must be idempotent');
 panel.hidden=true;failSave=true;
 await ctx.complete();
 assert.equal(panel.hidden,true,'Failed persistence must not show success');
 assert.equal(counters.finish,2);
 assert.ok(counters.event.some(s=>String(s).includes('network failure')));
 console.log('PASS: END pauses only, COMPLETE finalizes once, persistence failure leaves success hidden');
 console.log('PASS: next-song navigation never silently completes; new playback abandons interrupted song');
 console.log('PASS: same Finish & Next element moves to completion panel; BEST NEXT stays in Run Order');
})().catch(e=>{console.error(e);process.exitCode=1});
