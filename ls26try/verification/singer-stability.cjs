/* Real Chromium, actual application pages, memory-only Firebase, all external
 * requests blocked. Usage: LS26_TEST_NODE_MODULES=... LS26_PLAYWRIGHT_MODULES=...
 * LS26_CHROMIUM=/path/to/chromium node verification/singer-stability.cjs
 * Optional LS26_BROWSER_OUTPUT directory receives screenshots/results. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_PLAYWRIGHT_MODULES||process.cwd()]}));
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'../..'),model=require('../shared/timing-model.js');
const output=process.env.LS26_BROWSER_OUTPUT;if(output)fs.mkdirSync(output,{recursive:true});
const chords=['G','D','G','C/G','Bbmaj7/D','G','Am','C'];
const row=i=>`<div><strong class="inserted-chord">${chords[i]}</strong></div><div>Lyric ${i+1} <em>formatted words</em></div>`;
const song={title:'Singer regression fixture',artist:'Test artist',userBpm:240,originalBpm:96,timeSignature:'4/4',sections:[
 {type:'lyrics',title:'VERSE',html:[0,1,2,3].map(row).join('')},
 {type:'lyrics',title:'CHORUS',html:'<div><a class="lyrics-song-link" data-improv-link="1" href="#improv">IMPROV</a></div>'+[4,5].map(row).join('')+'<div><span class="ls26-time-signature-change" data-time-signature="3/4"></span></div>'+[6,7].map(row).join('')},
 {type:'hostNote',title:'HIDDEN',text:'Private host instruction'},
 {type:'performanceNote',title:'CUE',text:'Singer cue'}]};
const durations=[4,2,4,4,4,4,3,2];
const log=(name,data)=>{console.log('PASS',name,data?JSON.stringify(data):'');};
(async()=>{
 let timing=await model.createDraft(await model.buildSource(song,parseHTML('<html></html>').document));
 for(const [i,event]of timing.events.entries())timing=model.setDuration(timing,event.id,durations[i]);timing.revision=1;
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.LS26_CHROMIUM,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const context=await browser.newContext({viewport:{width:768,height:1024}}),errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,body:'',contentType:'text/javascript'}));
 await context.addInitScript({content:fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8')+`\n__fixture.data['lyrics/song0']=${JSON.stringify(song)};__fixture.data['lyrics/song0/musicalTiming/v1']=${JSON.stringify(timing)};__fixture.data['karaokeControl/liveLyrics']={};__fixture.data['karaokeControl/currentSession']={active:false};__fixture.data['karaokeControl/runOrder']={items:[]};localStorage.setItem('ls26.lyricview.chordFollow.enabled','1');window.__beats=[];addEventListener('ls26:metronome-beat',e=>__beats.push({...e.detail,at:Date.now()}));window.__transport=[];addEventListener('ls26:transport-state',e=>__transport.push(e.detail));window.__packets=[];const observerChannel=new BroadcastChannel('ls26-singer-live-v3');observerChannel.onmessage=e=>{if(e.data?.type==='state')queueMicrotask(()=>__packets.push({state:e.data.state,lag:Date.now()-e.data.state.updatedAtMs,count:document.querySelector('.ls26-singer-count')?.textContent}));};`});
 const singer=await context.newPage();singer.on('pageerror',e=>errors.push('singer: '+e.message));
 const settings=async phase=>{await singer.locator('#singerSettingsBtn').click();assert.ok(await singer.locator('#singerSettings').isVisible(),phase);await singer.locator('#closeSingerSettings').click();log('Settings '+phase);};
 await singer.goto(base+'/ls26try/host/karaoke-lyric-view.html');await settings('idle');
 const cdp=await context.newCDPSession(singer);await cdp.send('Performance.enable');
 const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 await singer.waitForTimeout(500);const before=await metric();
 await singer.evaluate(()=>{window.__mutations=0;window.__testObserver=new MutationObserver(records=>__mutations+=records.length);__testObserver.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});});
 const idleSeconds=Number(process.env.LS26_IDLE_SECONDS)||60;
 for(let i=0;i<3;i++){await singer.waitForTimeout(idleSeconds*1000/3);assert.ok(await singer.locator('#singerSettingsBtn').isEnabled());console.log('Responsive idle checkpoint',idleSeconds/3*(i+1)+'s');}
 const after=await metric(),idle={seconds:idleSeconds,taskSeconds:after.TaskDuration-before.TaskDuration,scriptSeconds:after.ScriptDuration-before.ScriptDuration,mutations:await singer.evaluate(()=>__mutations)};
 assert.ok(idle.taskSeconds<2,'No busy idle loop');assert.equal(idle.mutations,0);log('Responsive idle',idle);
 await singer.evaluate(()=>__testObserver.disconnect());
 const viewer=await context.newPage();viewer.on('pageerror',e=>errors.push('viewer: '+e.message));
 await viewer.goto(base+'/ls26try/host/lyricview.html?id=song0');await viewer.waitForFunction(()=>window.LS26TimedView?.enabled()&&window.LS26MeterMap?.segments().length===2);
 await singer.waitForFunction(()=>document.querySelector('#ls26SingerV31State h1')?.textContent==='Singer regression fixture');
 assert.equal(await singer.locator('#ls26SingerV31State h2').textContent(),'Test artist');await settings('preview');
 await singer.bringToFront();await singer.locator('#fullscreenSingerBtn').click();await singer.waitForFunction(()=>!!document.fullscreenElement);await singer.locator('#fullscreenSingerBtn').click();await singer.waitForFunction(()=>!document.fullscreenElement);log('Fullscreen direct gesture');
 await singer.evaluate(()=>{window.__counts=[];new MutationObserver(()=>{const n=Number(document.querySelector('.ls26-singer-count').textContent);if(n>0&&__counts.at(-1)!==n)__counts.push(n);}).observe(document.querySelector('.ls26-singer-count'),{childList:true,subtree:true,characterData:true});});
 await viewer.locator('#autoScrollBtn').click();await singer.waitForFunction(()=>!document.querySelector('.ls26-singer-count').hidden);await settings('count-in');
 await viewer.waitForFunction(()=>LS26Click.driver().getBeat()>0.2);await singer.waitForFunction(()=>document.querySelector('.is-current')?.textContent.includes('Lyric 1'));
 const beats=await viewer.evaluate(()=>__beats.filter(e=>e.countIn).map(e=>e.beat));assert.deepEqual(beats,[1,2,3,4]);
 const packets=await singer.evaluate(()=>__packets.filter(e=>e.state.phase==='countin'&&e.state.countInBeat>0));assert.deepEqual(packets.map(p=>p.state.countInBeat),[1,2,3,4]);assert.deepEqual(await singer.evaluate(()=>__counts),[1,2,3,4]);log('Count-in uses actual due metronome beats',{beats,maxLocalLagMs:Math.max(...packets.map(p=>p.lag))});
 await settings('playing');

 // Pause at 8: the third G starts at logical beat 6 (beat 3 in 4/4).
 await viewer.evaluate(()=>{LS26Click.driver().seek(8);LS26TimedView.update();document.querySelector('#autoScrollBtn').click();});
 await singer.waitForFunction(()=>document.querySelector('.is-current')?.textContent.includes('Lyric 3'));
 assert.deepEqual(await singer.locator('.is-context').allTextContents(),[1,2,4,5].map(i=>`Lyric ${i} formatted words`));
 await singer.waitForTimeout(180);
 const sizes=await singer.evaluate(()=>Object.fromEntries(['current','context','muted'].map(c=>{const s=getComputedStyle(document.querySelector('.is-'+c));return [c,{size:parseFloat(s.fontSize),opacity:s.opacity}];})));
 assert.ok(sizes.current.size>sizes.context.size&&sizes.context.size>sizes.muted.size);assert.equal(sizes.current.opacity,'1');assert.equal(sizes.muted.opacity,'0.6');log('Source mapping + five-line hierarchy',sizes);await settings('paused');
 await viewer.evaluate(()=>LS26TimedView.suspend());assert.equal(await viewer.evaluate(()=>LS26TimedView.snapshot().manual),true);await viewer.evaluate(()=>LS26TimedView.rejoin());assert.equal(await viewer.evaluate(()=>LS26TimedView.snapshot().manual),false);log('Manual override and REJOIN retain paused transport');
 await viewer.locator('#autoScrollBtn').click();const resumed=await viewer.evaluate(()=>__transport.at(-1));assert.equal(resumed.beat,6);await viewer.waitForFunction(()=>__beats.some(e=>!e.countIn&&e.position===6&&e.beat===3));log('Pause mid-chord resumes original beat 3',resumed);
 // Settings modes use the same lyric-only focus list.
 await viewer.locator('#autoScrollBtn').click();await singer.locator('#singerSettingsBtn').click();
 assert.equal(await singer.locator('.is-chord-line').count(),0);
 await singer.locator('[data-guidance="pro"]').click();assert.equal(await singer.locator('.is-chord-line').count(),0);assert.ok(await singer.locator('#ls26SingerV31Lyrics em').count());
 await singer.locator('[data-guidance="guitaroke"]').click();assert.equal(await singer.locator('.is-chord-line').count(),8);assert.equal(await singer.locator('.is-context').count(),4);
 assert.ok(!(await singer.locator('#ls26SingerV31Lyrics').textContent()).includes('Private host instruction'));assert.ok((await singer.locator('#ls26SingerV31Lyrics').textContent()).includes('Singer cue'));
 await singer.locator('[data-font="arial"]').click();await singer.locator('#closeSingerSettings').click();await singer.reload();await singer.waitForFunction(()=>document.querySelectorAll('.is-chord-line').length===8);assert.equal(await singer.locator('body').getAttribute('data-font'),'arial');log('Guidance, host note exclusion, performance cue, settings persistence');
 // START HERE at second chord. Existing one-bar count-in must end there.
 await viewer.locator('.ls26-timed-chord').nth(1).click();await viewer.locator('#ls26StartHereCard button').first().click();assert.equal(await viewer.evaluate(()=>LS26TimedView.startBeat()),4);
 await viewer.locator('#autoScrollBtn').click();await viewer.waitForFunction(()=>LS26Click.driver().getBeat()>4.2);assert.equal(await viewer.evaluate(()=>LS26TimedView.snapshot().index),1);log('START HERE + count-in');
 // Natural gate entry; held meter must not advance past a future marker.
 await viewer.evaluate(()=>{LS26Click.driver().seek(13.7);LS26TimedView.update();});await viewer.waitForFunction(()=>LS26TimedView.snapshot().improvHeld);
 await viewer.evaluate(()=>LS26Click.driver().seek(25));await viewer.waitForTimeout(100);
 assert.equal(await viewer.evaluate(()=>LS26MeterMap.current(25).beatsPerBar),4);assert.equal(await viewer.evaluate(()=>LS26MeterMap.nextAfter(0)),null);
 await viewer.locator('[data-improv-link]').click();const release=await viewer.evaluate(()=>LS26TimedView.snapshot().improvReleaseBeat);assert.ok(release>=31);
 await viewer.evaluate(release=>LS26Click.driver().seek(release-.15),release);await viewer.waitForFunction(()=>!LS26TimedView.snapshot().improvHeld);
 const offset=await viewer.evaluate(()=>LS26TimedView.snapshot().timingOffset);assert.equal(offset,release-14);assert.equal(await viewer.evaluate(()=>LS26TimedView.snapshot().index),4);
 await viewer.evaluate(()=>{const d=LS26Click.driver();d.seek(LS26TimedView.snapshot().timingOffset+15);LS26TimedView.update();document.querySelector('#autoScrollBtn').click();});await viewer.locator('#autoScrollBtn').click();
 assert.equal(await viewer.evaluate(()=>__transport.at(-1).beat),14+offset);log('IMPROV hold/release and resume offset',{release,offset});
 await viewer.evaluate(()=>LS26Click.driver().seek(LS26TimedView.snapshot().timingOffset+21.8));await viewer.waitForFunction(()=>LS26TimedView.snapshot().index===6);
 assert.equal(await viewer.evaluate(()=>LS26TimedView.meter().beatsPerBar),3);await viewer.waitForFunction(()=>__beats.some(e=>e.position===LS26TimedView.snapshot().timingOffset+22&&e.beat===1));log('Later TIME SIG at shifted musical position');
 await viewer.locator('#autoScrollBtn').click();
 await viewer.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:song-finished')));await singer.waitForTimeout(100);await settings('complete');
 // Follow OFF retains normal scrolling and local singer updates.
 await viewer.evaluate(()=>LS26TimedView.disable());await viewer.locator('#autoScrollBtn').click();await viewer.waitForTimeout(400);assert.equal(await singer.evaluate(()=>__packets.at(-1).state.sync.followOn),false);await viewer.locator('#autoScrollBtn').click();log('Follow OFF fallback');
 for(const viewport of [{width:768,height:1024},{width:1024,height:768}]){await singer.setViewportSize(viewport);await settings(viewport.width+'px');assert.ok(await singer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await singer.screenshot({path:path.join(output,'singer-'+viewport.width+'.png')});}
 const writes=await viewer.evaluate(()=>__fixture.calls.filter(c=>c[0]==='set'));assert.ok(writes.every(c=>c[1]==='karaokeControl/liveLyrics'));assert.equal(await singer.evaluate(()=>__fixture.calls.filter(c=>c[0]==='set').length),0);assert.equal(await singer.evaluate(()=>__fixture.listeners.filter(p=>p==='karaokeControl/liveLyrics').length),1);
 assert.deepEqual(errors,[]);log('No page errors, one Singer listener, no song/timing writes');
 const creator=await context.newPage();creator.on('pageerror',e=>errors.push('creator: '+e.message));
 await creator.goto(base+'/ls26try/host/lyricscreator.html?firebaseId=song0');await creator.waitForFunction(()=>window.LS26InlineNoteEditor&&document.querySelector('.creator-rich-editor'));
 const editor=creator.locator('.creator-rich-editor').first(),modal=creator.locator('.ls26-inline-note-modal');
 const sourceBefore=await creator.evaluate(async()=>LS26Timing.buildSource({timeSignature:'4/4',sections:[{type:'lyrics',html:document.querySelector('.creator-rich-editor').innerHTML}]},document));
 const caret=async()=>{await editor.scrollIntoViewIfNeeded();await editor.evaluate(el=>{el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);});};
 for(const [kind,text]of [['performance','Bigger chorus'],['host','Private reminder']]){
  await caret();const beforeHtml=await editor.innerHTML();
  const trigger=creator.locator(kind==='host'?'.section-host-note-inline-btn':'.section-performance-note-inline-btn').first();
  await trigger.click();assert.ok(await modal.isVisible());assert.equal(await creator.locator('dialog[open]').count(),0);
  let rect=await creator.locator('.ls26-inline-note-box').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=1024,'note dialog stays in viewport at deep scroll');
  await creator.locator('#ls26InlineNoteCancel').click();assert.equal(await editor.innerHTML(),beforeHtml,'Cancel leaves section unchanged');
  await trigger.click();await creator.locator('#ls26InlineNoteText').fill(text);await creator.locator('#ls26InlineNoteSize').fill('24');await creator.locator('#ls26InlineNoteHex').fill('#FFCC66');
  if(output)await creator.screenshot({path:path.join(output,'creator-'+kind+'-note.png')});
  await creator.locator('#ls26InlineNoteSave').click();assert.ok(!(await modal.isVisible()));
  const marker=editor.locator(kind==='host'?'[data-host-note]':'[data-performance-note]');assert.equal(await marker.count(),1);assert.equal(await marker.textContent(),'');
  assert.equal(await marker.getAttribute(kind==='host'?'data-host-note':'data-performance-note'),text);
  await marker.click();await creator.locator('#ls26InlineNoteText').fill(text+' edited');await creator.locator('#ls26InlineNoteSave').click();
  assert.equal(await marker.getAttribute(kind==='host'?'data-host-note':'data-performance-note'),text+' edited');log(kind+' note inserts, edits and cancels with one visible modal');
 }
 const sourceAfter=await creator.evaluate(async()=>LS26Timing.buildSource({timeSignature:'4/4',sections:[{type:'lyrics',html:document.querySelector('.creator-rich-editor').innerHTML}]},document));
 let noteTiming=await model.createDraft(sourceBefore);for(const event of noteTiming.events)noteTiming=model.setDuration(noteTiming,event.id,4);
 const matched=await model.reconcile(noteTiming,sourceAfter);assert.ok(['VALID','RECONCILED'].includes(matched.status));assert.deepEqual(matched.timing.events.map(e=>[e.id,e.durationBeats,e.sourceAnchor]),noteTiming.events.map(e=>[e.id,e.durationBeats,e.sourceAnchor]),'Notes preserve every chord identity, duration and anchor');
 assert.equal(await creator.evaluate(()=>__fixture.calls.filter(c=>c[0]==='set').length),0,'Note editing remains local');
 assert.ok(await creator.locator('#saveSongBtn').isEnabled());assert.deepEqual(errors,[]);
 log('Creator notes safely reconcile unchanged chord identities/durations and do not write Firestore');
 const report={idle,errors,checks:'all passed',mockControlWrites:writes.length};if(output)fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
