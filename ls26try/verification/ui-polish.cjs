// Browser regression checks against local fixture data; all external requests are intercepted.
// Run: node ls26try/verification/ui-polish.cjs (requires Playwright and Chromium).
const fs=require('fs'),http=require('http'),path=require('path');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'../..');
const artifacts=process.env.LS26_TEST_ARTIFACTS;
if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));try{res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}});
const seed=`
const html='<span class="inserted-chord">Bb</span>       <span class="inserted-chord">F</span><br>'+('Copper lanterns warm the quay while silver boats sail across the quiet harbour. ').repeat(5)+'<br>'+('A    Bb       C    D       Eb     F    G       Ab    ').repeat(5);
for (const key of Object.keys(__fixture.data).filter(k=>k.startsWith('lyrics/'))) __fixture.data[key].sections=Array.from({length:5},(_,i)=>({type:'lyrics',title:'VERSE '+(i+1),html,style:{fontFamily:'Verdana',fontSize:23,color:'#ffffff'}}));
__fixture.data['karaokeControl/currentSession']={active:false};
__fixture.data['upcomingEvents/next']={name:'Evening at the harbour',date:'2026-09-25',startTime:'20:00',endTime:'23:00',venue:'Harbour Venue',type:'Solo',status:'Confirmed',arrivalTime:'19:00',contactName:'Venue manager',contact:'1234',notes:'Outdoor performance'};
__fixture.data['upcomingEvents/past']={name:'Old unclosed booking',date:'2020-01-01',startTime:'20:00',status:'Confirmed'};
`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--single-process','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader'],headless:true});
 const context=await browser.newContext({viewport:{width:1024,height:900}});
 await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.fulfill({body:'',contentType:'text/javascript'}));
 await context.addInitScript(fs.readFileSync(path.join(root,'ls26try/verification/firebase-fixture.js'),'utf8')+'\n'+seed);
 const page=await context.newPage();await page.clock.install({time:new Date('2026-09-24T12:00:00Z')});page.on('pageerror',e=>console.log('PAGE ERROR',e.message));


 const assert=require('node:assert/strict');
 const measure=el=>{
  const lines=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;let lastTop;
  while(node=walker.nextNode())for(let i=0;i<node.length;i++){
    const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const rect=range.getBoundingClientRect();
    if(lastTop===undefined||Math.abs(rect.top-lastTop)>2){lines.push('');lastTop=rect.top;}
    lines[lines.length-1]+=node.textContent[i];
  }
  return {width:el.getBoundingClientRect().width,lines};
 };
 for(const width of [768,1024,1280]){
  await page.setViewportSize({width,height:900});
  for(const scale of [1,1.25]){
   const data={};
   for(const [name,file,selector]of [['creator','host/lyricscreator.html?firebaseId=song0','.creator-rich-editor'],['viewer','host/lyricview.html?id=song0','.host-section-body']]){
    await page.goto(url+'/ls26try/'+file);await page.waitForTimeout(300);
    await page.locator(selector).first().waitFor();
    await page.evaluate(scale=>document.documentElement.style.setProperty('--ls26-lyric-text-scale',scale),String(scale));
    data[name]=await page.locator(selector).first().evaluate(measure);
   }
   assert.equal(data.creator.width,data.viewer.width,`${width}px scale ${scale} widths`);
   assert.deepEqual(data.creator.lines,data.viewer.lines,`${width}px scale ${scale} line breaks`);
   console.log('PASS wrap parity',width,scale,data.creator.width,data.creator.lines.length);
  }
 }
 await page.setViewportSize({width:1024,height:900});
 await page.goto(url+'/ls26try/host/lyricview.html?id=song0');await page.waitForTimeout(400);
 assert.equal(await page.locator('[data-original-chord="Bb"]').first().textContent(),'Bb');
 await page.locator('#songInfoBtn').click();await page.waitForTimeout(200);
 assert.equal(await page.locator('#songInfoDrawer').getAttribute('aria-hidden'),'false');
 for(const width of [768,1024,1280]){
  await page.setViewportSize({width,height:900});
  const fit=await page.locator('.ls26-bpm-panel').evaluate(el=>{
   const box=el.getBoundingClientRect();return [...el.querySelectorAll('*')].every(child=>{const b=child.getBoundingClientRect();return b.left>=box.left&&b.right<=box.right+1;});
  });assert.ok(fit,'tempo controls fit at '+width);
 }
 const current=Number(await page.locator('#ls26CurrentBpm').inputValue());
 await page.locator('#ls26BpmPlus').click();assert.equal(Number(await page.locator('#ls26CurrentBpm').inputValue()),current+1);
 await page.locator('#ls26BpmMinus').click();assert.equal(Number(await page.locator('#ls26CurrentBpm').inputValue()),current);
 await page.locator('#ls26ShowKaraoke').uncheck();assert.equal(await page.locator('#performanceQuickInfo').isVisible(),false);
 await page.locator('#ls26ShowKaraoke').check();assert.equal(await page.locator('#performanceQuickInfo').isVisible(),true);
 await page.setViewportSize({width:1024,height:900});if(artifacts)await page.screenshot({path:path.join(artifacts,'viewer.png')});
 await page.locator('#closeSongInfoBtn').click();await page.locator('#songActionsBtn').click();await page.locator('#songNoteActionBtn').click();
 await page.locator('#songNoteEditInput').fill('Performance note verification');await page.locator('#songNoteSaveBtn').click();
 await page.locator('#ls26Toast').waitFor({state:'visible'});
 assert.match(await page.locator('#ls26Toast').innerText(),/saved successfully/);
 assert.equal(await page.evaluate(()=>__fixture.data['lyrics/song0'].note),'Performance note verification');
 const toast=await page.locator('#ls26Toast').boundingBox();assert.ok(toast.x<30&&toast.y+toast.height>=880,'toast lower left');
 console.log('PASS Bb spelling, tempo controls, karaoke checkbox and note save/toast');
 await page.goto(url+'/ls26try/host/lyricscreator.html?firebaseId=song0');await page.waitForTimeout(300);
 await page.evaluate(()=>window.scrollTo(0,1400));await page.waitForTimeout(120);
 assert.equal(await page.locator('#lyricsCreatorScrollTop').isVisible(),false);
 await page.evaluate(()=>window.scrollTo(0,1200));await page.waitForTimeout(120);
 assert.equal(await page.locator('#lyricsCreatorScrollTop').isVisible(),true);
 if(artifacts)await page.screenshot({path:path.join(artifacts,'creator.png')});
 await page.locator('#lyricsCreatorScrollTop').click();await page.waitForFunction(()=>window.scrollY===0);
 assert.equal(await page.locator('#lyricsCreatorScrollTop').isVisible(),false);
 console.log('PASS upward-only sticky return control');
 await page.goto(url+'/ls26try/admin-new/upcoming-events.html');await page.waitForTimeout(400);
 assert.equal(await page.locator('#eventsNextGigHeroTitle').innerText(),'Evening at the harbour');
 assert.equal(await page.locator('#eventsNextGigCountdownDate').innerText(),'FRI 25 SEP 2026');
 assert.equal(await page.locator('.events-eyebrow').count(),0);
 const before=await page.evaluate(()=>__fixture.calls.filter(([m])=>m==='get').length);
 await page.waitForTimeout(1200);
 assert.equal(await page.evaluate(()=>__fixture.calls.filter(([m])=>m==='get').length),before,'countdown has no extra reads');
 await page.locator('[data-event-id="next"]').first().scrollIntoViewIfNeeded();
 if(artifacts)await page.screenshot({path:path.join(artifacts,'events-row.png')});
 const date=await page.locator('[data-event-id="next"] .event-date-block').innerText();assert.match(date,/FRI\s+25\s+SEP\s+2026/);
 await page.locator('#toggleEventsCalendarBtn').click();assert.equal(await page.locator('#eventsCalendarPanel').isVisible(),true);
 console.log('PASS next gig, separate date rows, local countdown and calendar toggle');
 await page.goto(url+'/ls26try/admin-new/admin.html');await page.waitForTimeout(400);
 assert.equal(await page.locator('#liveCircleBtn').isDisabled(),true);
 assert.equal(await page.locator('#liveCircleBtn').getAttribute('onclick'),null);
 console.log('PASS read-only dashboard indicator');
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
