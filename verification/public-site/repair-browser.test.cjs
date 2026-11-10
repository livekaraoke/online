const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const projected=process.env.LK_TEST_PROJECTED==='1';
const root=path.resolve(__dirname,'../..');
let fixture=fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8');
if(projected){
 fixture+=['js/public-event-time.js','js/public-visibility.js','js/public-live-projection.js','js/public-catalogue-projection.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
 fixture+=`
if(window.parent===window){window.__publishFixture=()=>{const f=__firebaseFixture,d=f.docs,c=d['karaokeControl/currentSession'],k=d['karaoke/state'],sid=c.active?c.sessionId:'',eid=c.active?c.eventId:k.preSessionRequestEventId;
 const input={control:c,karaoke:k,session:sid?{...d['performanceSessions/'+sid],id:sid}:{},event:eid?{...d['upcomingEvents/'+eid],id:eid}:{},run:d['karaokeControl/runOrder'],requests:Object.entries(d).filter(([p])=>p.startsWith('publicSongRequests/')).map(([p,v])=>({...v,id:p.split('/')[1]}))};
 const v=LKLiveProjection.live(input,'live-karaoke');v.expiresAt=v.sessionId?{seconds:(Date.now()+180000)/1000}:null;f.update('publicSites/live-karaoke/views/live',v);
 f.update('publicSites/live-karaoke/views/events',LKLiveProjection.events(Object.entries(d).filter(([p])=>p.startsWith('upcomingEvents/')).map(([p,v])=>({...v,id:p.split('/')[1]})),'live-karaoke'));
 f.update('publicSites/live-karaoke/views/settings',LKLiveProjection.settings(d['karaokeControl/liveKaraokeWebsiteSettings'],'live-karaoke'));
 f.update('publicSites/live-karaoke/views/catalogue',LKCatalogueProjection.catalogue('live-karaoke',{...d['lyricsSetlists/public'],id:'public'},Object.entries(d).filter(([p])=>p.startsWith('lyrics/')).map(([p,v])=>({...v,id:p.split('/')[1]}))));};__publishFixture();}
`;
}
(async()=>{
 const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]).replace(/^\/online\/?/,'');const file=path.resolve(root,p||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.avif':'image/avif','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'text/plain'});res.end(e?'missing':b)})});
 await new Promise(r=>server.listen(8180,'127.0.0.1',r));
 const launch={headless:true};if(process.env.LK_CHROMIUM_PATH)launch.executablePath=process.env.LK_CHROMIUM_PATH;if(process.env.LK_CHROMIUM_ARGS)launch.args=JSON.parse(process.env.LK_CHROMIUM_ARGS);
 const browser=await chromium.launch(launch);
 try{
  for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:true,timezoneId:'Europe/Malta'}),page=await context.newPage();const errors=[];
   await page.clock.setFixedTime(new Date('2026-10-22T04:00:00Z'));
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const url=route.request().url();if(projected&&url.includes('/js/public-data-config.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/public-data-config.js'),'utf8')+"\nwindow.LK_PUBLIC_LIVE_V1={'live-karaoke':true};window.LK_PUBLIC_CATALOGUE_V1={'live-karaoke':true};"});if(url.startsWith('http://127.0.0.1:8180/'))return route.continue();if(url.includes('firebase-app-compat.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.includes('www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:''});return route.abort();});
   await page.goto('http://127.0.0.1:8180/online/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('#heroLiveNow').isVisible(),false,'test session hidden');
   // The normal Wednesday at Whyte Harte is represented by the residency
   // card rather than duplicated among individual event cards.
   assert.equal(await page.locator('.live-karaoke-event-card').count(),0,'weekly Whyte Harte dates excluded from event cards');
   assert.equal(await page.locator('.lk-past-events-photo').count(),6,'six past-event thumbnails');
   assert.equal(await page.locator('.lk-past-events-photo a, .lk-past-events-photo button').count(),0,'no clickable photo or lightbox control');
   await page.locator('.lk-past-events-grid').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll('.lk-past-events-photo img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:12000});
   const galleryCols=await page.locator('.lk-past-events-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
   assert.equal(galleryCols,width<=720?2:3,'responsive gallery columns');
   // Another venue on a Wednesday and Whyte Harte on a Friday are exceptions.
   await page.evaluate(()=>{
     __firebaseFixture.update('upcomingEvents/specialWednesday',{type:'Live Karaoke',venue:'Other Venue',status:'Confirmed',date:'2026-11-11',startTime:'20:00'});
     __firebaseFixture.update('upcomingEvents/whyteFriday',{type:'Live Karaoke',venue:'Whyte Harte',status:'Confirmed',date:'2026-10-30',startTime:'20:00'});
   });
   await page.waitForFunction(()=>document.querySelectorAll('.live-karaoke-event-card').length===2,null,{timeout:12000});
   assert.equal(await page.locator('.live-karaoke-event-card').count(),2,'special and other-venue events remain in cards');
   assert.match(await page.locator('#liveKaraokeEventsList').innerText(),/Other Venue/i);
   assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://livekaraoke.eu/');
   await page.evaluate(()=>{const f=__firebaseFixture;f.update('karaokeControl/currentSession',{...f.docs['karaokeControl/currentSession'],isTestSession:false});f.update('upcomingEvents/e',{...f.docs['upcomingEvents/e'],publicVisibility:'public'});});
   await page.locator('#liveNowRequestBtn').waitFor({state:'visible'});assert.equal(await page.locator('#heroLiveVenue').innerText(),'0 The Test Venue','venue name must not make active public session invisible');assert.equal(await page.locator('#songListBtn').getAttribute('aria-disabled'),null,'song browsing enabled for active public session');assert.match(await page.locator('#songListBtn').innerText(),/REQUEST A SONG/);
   assert.match(await page.locator('#heroCurrentSong').innerText(),/Wonderwall/);assert.doesNotMatch(await page.locator('#heroComingUp').innerText(),/Cancelled/);
   const list=await page.locator('#heroComingUp').boundingBox(),button=await page.locator('#liveNowRequestBtn').boundingBox();
   assert.ok(button.height>=48);assert.ok(width>600?button.x>list.x+list.width-2:button.y>=list.y+list.height,'requested responsive placement');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   if(process.env.LK_SCREENSHOT_DIR){fs.mkdirSync(process.env.LK_SCREENSHOT_DIR,{recursive:true});await page.locator('#heroLiveNow').screenshot({path:path.join(process.env.LK_SCREENSHOT_DIR,`live-panel-${width}.png`)});}
   await page.locator('#liveNowRequestBtn').tap();const frame=page.frameLocator('#liveKaraokeRequestFrame');
    await frame.locator('#requestNameGate').waitFor({state:'visible'});
    // Async catalogue/request loading must not dismiss the first-time name prompt.
    await frame.locator('.song-row').first().waitFor({state:'attached'});
    assert.equal(await frame.locator('#requestNameGate').isVisible(),true,'new singer name gate persists after songs load');
    assert.equal(await frame.locator('#requestBrowser').isVisible(),false,'song list stays hidden until name entered');
    await frame.locator('#requestStartContinueBtn').click();
    assert.equal(await frame.locator('#requestNameGate').isVisible(),true,'blank name cannot continue');
    await frame.locator('#requestStartName').fill('Fixture Singer');
    await frame.locator('#requestStartContinueBtn').click();
    await frame.locator('.song-row').first().waitFor({state:'visible'});
    assert.equal(await frame.locator('#requestNameGate').isVisible(),false,'name accepted and singer can browse');
   assert.equal(await frame.locator('.song-row').count(),3);await frame.locator('#songSearch').fill('cranberries');assert.match(await frame.locator('#songResults').innerText(),/Zombie/);await frame.locator('#songSearch').fill('');
   const counts=await page.evaluate(()=>__firebaseFixture.counts);for(const p of (projected?['publicSites/live-karaoke/views/live','publicSites/live-karaoke/views/events','publicSites/live-karaoke/views/settings']:['karaokeControl/currentSession','karaoke/state','karaokeControl/runOrder','karaokeControl/liveKaraokeWebsiteSettings']))assert.equal(counts[p],1,`one shared listener ${p}`);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:false}));await frame.getByText('REQUESTS CLOSED · BROWSE THE SONG LIST',{exact:true}).waitFor();assert.equal(await frame.locator('.song-action:not(:disabled)').count(),0);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:true}));await frame.getByText('REQUESTS OPEN',{exact:true}).waitFor();
   await frame.locator('#songSearch').fill('zombie');await frame.locator('#songResults [data-toggle-favourite]').click();assert.equal(await frame.locator('#songResults [data-toggle-favourite]').getAttribute('aria-label'),'Remove from favourites');
   await frame.locator('#editRequesterNameBtn').click();await frame.locator('#singerName').fill('Fixture Singer');await frame.locator('#continueRequestBtn').click();await frame.locator('[data-request-tab="songs"]').click();await frame.locator('#songSearch').fill('zombie');await frame.locator('[data-song-id="zombie"]').click();await frame.locator('#requestNote').fill('Fixture note');
   await frame.locator('#sendRequestBtn').evaluate(el=>{el.click();el.click();});await frame.locator('#requestSuccess').waitFor({state:'visible'});
   const requests=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('publicSongRequests/')));assert.equal(requests.length,1,'double submit blocked');assert.equal(requests[0].data.source,'live-karaoke-website');assert.equal(requests[0].data.sessionId,'s');
   await frame.locator('[data-close="requestDialog"]').click();await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
    // The saved name should skip the initial gate on a fresh popup open.
    await page.locator('#liveNowRequestBtn').tap();
    const returningFrame=page.frameLocator('#liveKaraokeRequestFrame');
    await returningFrame.locator('#requestBrowser').waitFor({state:'visible'});
    assert.equal(await returningFrame.locator('#requestNameGate').isVisible(),false,'returning singer goes straight to song list');
    await returningFrame.locator('[data-close="requestDialog"]').click();
    await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
   await page.evaluate(()=>__firebaseFixture.update('performanceSessions/s',{...__firebaseFixture.docs['performanceSessions/s'],breakOpen:true}));assert.match(await page.locator('#heroCurrentSong').innerText(),/ON BREAK/);
   await page.evaluate(()=>__firebaseFixture.update('karaokeControl/currentSession',{active:false}));assert.equal(await page.locator('#heroLiveNow').isVisible(),false);assert.equal(await page.locator('#heroCurrentSong').innerText(),'');assert.equal(await page.locator('#songListBtn').getAttribute('aria-disabled'),'true','song browsing locks after session ends');
   await page.locator('#liveKaraokeEnquiryOpen').click();await page.locator('#lkEnquiryName').fill('Fixture Visitor');await page.locator('#lkEnquiryEmail').fill('fixture@example.com');await page.locator('#lkEnquiryEventType').selectOption('Corporate Event');await page.locator('#lkEnquiryMessage').fill('Isolated fixture enquiry.');await page.locator('#lkEnquirySubmit').evaluate(el=>{el.click();el.click();});await page.locator('#liveKaraokeEnquirySuccess').waitFor({state:'visible'});
   const bookings=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('bookingEnquiries/')));assert.equal(bookings.length,1);assert.equal(bookings[0].data.pageUrl,'https://livekaraoke.eu/');assert.equal(bookings[0].data.sourceKey,'live-karaoke');assert.equal(await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path==='publicBookingLimits/fixture@example.com').length),1,'atomic booking limit');
   assert.deepEqual(errors,[]);console.log(`PASS ${projected?'projected':'compatibility'} ${width}x${height}: layout, test exclusion, search, favourites, profile, request, duplicate prevention, closed gate, break/end, enquiry, shared listeners`);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
