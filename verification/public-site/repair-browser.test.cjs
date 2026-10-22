const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),fixture=fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8');
(async()=>{
 const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]).replace(/^\/online\/?/,'');const file=path.resolve(root,p||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.avif':'image/avif','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'text/plain'});res.end(e?'missing':b)})});
 await new Promise(r=>server.listen(8180,'127.0.0.1',r));
 const launch={headless:true};if(process.env.LK_CHROMIUM_PATH)launch.executablePath=process.env.LK_CHROMIUM_PATH;if(process.env.LK_CHROMIUM_ARGS)launch.args=JSON.parse(process.env.LK_CHROMIUM_ARGS);
 const browser=await chromium.launch(launch);
 try{
  for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:true,timezoneId:'Europe/Malta'}),page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http://127.0.0.1:8180/'))return route.continue();if(url.includes('firebase-app-compat.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.includes('www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:''});return route.abort();});
   await page.goto('http://127.0.0.1:8180/online/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('#heroLiveNow').isVisible(),false,'test session hidden');
   assert.equal(await page.locator('.live-karaoke-event-card').count(),1,'only one published future karaoke event');
   assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://livekaraoke.eu/');
   await page.evaluate(()=>{const f=__firebaseFixture;f.update('karaokeControl/currentSession',{...f.docs['karaokeControl/currentSession'],venue:'Whyte Harte'});f.update('performanceSessions/s',{...f.docs['performanceSessions/s'],venue:'Whyte Harte'});f.update('upcomingEvents/e',{...f.docs['upcomingEvents/e'],venue:'Whyte Harte'});});
   await page.locator('#liveNowRequestBtn').waitFor({state:'visible'});
   assert.match(await page.locator('#heroCurrentSong').innerText(),/Wonderwall/);assert.doesNotMatch(await page.locator('#heroComingUp').innerText(),/Cancelled/);
   const list=await page.locator('#heroComingUp').boundingBox(),button=await page.locator('#liveNowRequestBtn').boundingBox();
   assert.ok(button.height>=48);assert.ok(width>600?button.x>list.x+list.width-2:button.y>=list.y+list.height,'requested responsive placement');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   if(process.env.LK_SCREENSHOT_DIR){fs.mkdirSync(process.env.LK_SCREENSHOT_DIR,{recursive:true});await page.locator('#heroLiveNow').screenshot({path:path.join(process.env.LK_SCREENSHOT_DIR,`live-panel-${width}.png`)});}
   await page.locator('#liveNowRequestBtn').tap();const frame=page.frameLocator('#liveKaraokeRequestFrame');await frame.locator('.song-row').first().waitFor();
   assert.equal(await frame.locator('.song-row').count(),3);await frame.locator('#songSearch').fill('cranberries');assert.match(await frame.locator('#songResults').innerText(),/Zombie/);await frame.locator('#songSearch').fill('');
   const counts=await page.evaluate(()=>__firebaseFixture.counts);for(const p of ['karaokeControl/currentSession','karaoke/state','karaokeControl/runOrder','karaokeControl/liveKaraokeWebsiteSettings'])assert.equal(counts[p],1,`one shared listener ${p}`);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:false}));await frame.getByText('REQUESTS CLOSED · BROWSE THE SONG LIST',{exact:true}).waitFor();assert.equal(await frame.locator('.song-action:not(:disabled)').count(),0);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:true}));await frame.getByText('REQUESTS OPEN',{exact:true}).waitFor();
   await frame.locator('#songSearch').fill('zombie');await frame.locator('#songResults [data-toggle-favourite]').click();assert.equal(await frame.locator('#songResults [data-toggle-favourite]').getAttribute('aria-label'),'Remove from favourites');
   await frame.locator('#editRequesterNameBtn').click();await frame.locator('#singerName').fill('Fixture Singer');await frame.locator('#continueRequestBtn').click();await frame.locator('[data-request-tab="songs"]').click();await frame.locator('#songSearch').fill('zombie');await frame.locator('[data-song-id="zombie"]').click();await frame.locator('#requestNote').fill('Fixture note');
   await frame.locator('#sendRequestBtn').evaluate(el=>{el.click();el.click();});await frame.locator('#requestSuccess').waitFor({state:'visible'});
   const requests=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('publicSongRequests/')));assert.equal(requests.length,1,'double submit blocked');assert.equal(requests[0].data.source,'live-karaoke-website');assert.equal(requests[0].data.sessionId,'s');
   await frame.locator('[data-close="requestDialog"]').click();await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
   await page.evaluate(()=>__firebaseFixture.update('performanceSessions/s',{...__firebaseFixture.docs['performanceSessions/s'],breakOpen:true}));assert.match(await page.locator('#heroCurrentSong').innerText(),/ON BREAK/);
   await page.evaluate(()=>__firebaseFixture.update('karaokeControl/currentSession',{active:false}));assert.equal(await page.locator('#heroLiveNow').isVisible(),false);assert.equal(await page.locator('#heroCurrentSong').innerText(),'');
   await page.locator('#liveKaraokeEnquiryOpen').click();await page.locator('#lkEnquiryName').fill('Fixture Visitor');await page.locator('#lkEnquiryEmail').fill('fixture@example.com');await page.locator('#lkEnquiryEventType').selectOption('Corporate Event');await page.locator('#lkEnquiryMessage').fill('Isolated fixture enquiry.');await page.locator('#lkEnquirySubmit').evaluate(el=>{el.click();el.click();});await page.locator('#liveKaraokeEnquirySuccess').waitFor({state:'visible'});
   const bookings=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('bookingEnquiries/')));assert.equal(bookings.length,1);assert.equal(bookings[0].data.pageUrl,'https://livekaraoke.eu/');assert.equal(bookings[0].data.sourceKey,'live-karaoke');assert.equal(await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path==='publicBookingLimits/fixture@example.com').length),1,'atomic booking limit');
   assert.deepEqual(errors,[]);console.log(`PASS ${width}x${height}: layout, test exclusion, search, favourites, profile, request, duplicate prevention, closed gate, break/end, enquiry, shared listeners`);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
