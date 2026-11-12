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
  for(const [width,height] of [[1440,900],[1280,800],[960,1200],[768,1024],[390,844],[360,800]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:true,timezoneId:'Europe/Malta'}),page=await context.newPage();const errors=[];
   await page.clock.setFixedTime(new Date('2026-10-22T04:00:00Z'));
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const url=route.request().url();if(projected&&url.includes('/js/public-data-config.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/public-data-config.js'),'utf8')+"\nwindow.LK_PUBLIC_LIVE_V1={'live-karaoke':true};window.LK_PUBLIC_CATALOGUE_V1={'live-karaoke':true};"});if(url.includes('/livekaraoke26/js/public-catalogue.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'livekaraoke26/js/public-catalogue.js'),'utf8')+
     '\n// Simulate a slow catalogue so the request UI must repaint after it resolves.\nconst originalCatalogueLoad=window.LiveKaraokeCatalogue.load;window.LiveKaraokeCatalogue.load=async (...args)=>{await new Promise(resolve=>setTimeout(resolve,1200));return originalCatalogueLoad(...args);};'});
   if(url.startsWith('http://127.0.0.1:8180/'))return route.continue();if(url.includes('firebase-app-compat.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.includes('www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:''});return route.abort();});
   await page.goto('http://127.0.0.1:8180/online/',{waitUntil:'networkidle'});
   // Guard the homepage changes requested alongside the simplified public request UI.
   assert.equal(await page.locator('#heroSingWithUsBtn').isVisible(),true,'SING WITH US button');
   assert.equal(await page.locator('#heroBookUsBtn').isVisible(),true,'BOOK US button');
   assert.notEqual(await page.locator('.public-hero-title').evaluate(el=>getComputedStyle(el).textShadow),'none','hero title has high-contrast shadow');
   assert.equal(await page.locator('#howitworks .how-step').count(),4,'four clear How It Works cards');
   const howColumns=await page.locator('#howitworks .how-it-works-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
   assert.equal(howColumns,width<=720?2:4,'2x2 grid on phone and four columns on larger screens');
   assert.equal(await page.locator('.booking-faq > details:not(.booking-more-questions)').count(),5,'five visible booking FAQs');
   assert.equal(await page.locator('.booking-faq > details.booking-more-questions').count(),1,'remaining FAQs collapsed');
   assert.equal(await page.locator('.booking-faq > details.booking-more-questions').evaluate(el=>el.open),false);
   assert.equal(await page.locator('.weekly-residency-directions').count(),1,'Google Maps residency directions');
   assert.match(await page.locator('.weekly-residency-directions').getAttribute('href'),/google\.com\/maps\/search/);
   assert.equal(await page.locator('.weekly-residency-facebook').isDisabled(),true,'Facebook Event stays disabled');
   assert.equal(await page.evaluate(()=>{
     const song=document.querySelector('#songListBtn')?.closest('section');
     const past=document.querySelector('.lk-past-events-section');
     return !!song&&!!past&&!!(song.compareDocumentPosition(past)&Node.DOCUMENT_POSITION_FOLLOWING);
   }),true,'Past Events follows Song List Access');
   assert.equal(await page.locator('#publicWrittenReviews').count(),1,'written reviews module present');
   assert.equal(await page.locator('#publicStarReviews').count(),1,'star-only reviews module present');
   await page.evaluate(()=>{
     const f=__firebaseFixture, key='karaokeControl/liveKaraokeWebsiteSettings';
     f.update(key,{...f.docs[key],publicReviews:[
       {name:'Anna',country:'Malta',rating:5,review:'Loved the performance'},
       {name:'Chris',country:'UK',rating:4,review:'Great experience'},
       {name:'Maria',country:'Italy',rating:5,review:'Will sing again'},
       {name:'A',rating:5,review:''},{name:'B',rating:4,review:''},
       {name:'C',rating:5,review:''},{name:'D',rating:3,review:''},
       {name:'E',rating:2,review:''}
     ]});
   });
   await page.locator('#publicReviewSection').waitFor({state:'visible'});
   assert.equal(await page.locator('#publicWrittenReviewCards .lk-testimonial').count(),2,'two published written testimonials');
   assert.equal(await page.locator('#publicStarReviewCards .lk-star-review').count(),4,'four rating-only cards');
   assert.match(await page.locator('#publicWrittenReviewCards').innerText(),/Loved the performance/);
   assert.equal(await page.locator('#publicStarReviewCards').innerText().then(t=>t.includes('Will sing again')),false,'comments never leak into star cards');
      assert.equal(await page.locator('#heroLiveNow').isVisible(),false,'test session hidden');
   assert.equal(await page.locator('#liveStatus').isVisible(),true,'inactive status area retains countdown');
   assert.match(await page.locator('#liveStatus').innerText(),/NEXT LIVE KARAOKE EVENT/);
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
   await page.locator('#liveNowRequestBtn').waitFor({state:'visible'});
   assert.equal(await page.locator('.live-status-section > #heroLiveNow').count(),1,'live player replaces the status strip below the hero');
   assert.equal(await page.locator('.hero #heroLiveNow').count(),0,'player is no longer nested in the banner hero');
   assert.equal(await page.locator('#liveStatus').isVisible(),false,'duplicate live strip is hidden while playing');
   assert.equal(await page.locator('#heroLiveVenue').innerText(),'0 The Test Venue','venue name must not make active public session invisible');assert.equal(await page.locator('#songListBtn').getAttribute('aria-disabled'),null,'song browsing enabled for active public session');assert.match(await page.locator('#songListBtn').innerText(),/REQUEST A SONG/);
   assert.match(await page.locator('#heroCurrentSong').innerText(),/Wonderwall/);assert.doesNotMatch(await page.locator('#heroComingUp').innerText(),/Cancelled/);
   const list=await page.locator('#heroComingUp').boundingBox(),button=await page.locator('#liveNowRequestBtn').boundingBox();
   assert.ok(button.height>=48);assert.ok(width>600?button.x>list.x+list.width-2:button.y>=list.y+list.height,'requested responsive placement');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   if(process.env.LK_SCREENSHOT_DIR){fs.mkdirSync(process.env.LK_SCREENSHOT_DIR,{recursive:true});await page.locator('#heroLiveNow').screenshot({path:path.join(process.env.LK_SCREENSHOT_DIR,`live-panel-${width}.png`)});}
   await page.locator('#liveNowRequestBtn').tap();const frame=page.frameLocator('#liveKaraokeRequestFrame');
    await frame.locator('#requestNameGate').waitFor({state:'visible'});
    // Async catalogue/request loading must not dismiss the first-time name prompt.
    await frame.locator('#songResults .song-row').first().waitFor({state:'attached'});
    await page.waitForTimeout(250);
    assert.equal(await frame.locator('#requestNameGate').isVisible(),true,'new singer name gate persists after asynchronous loading');
    assert.equal(await frame.locator('#requestBrowser').isVisible(),false,'song list stays hidden until name entered');
    await frame.locator('#requestStartContinueBtn').click();
    assert.equal(await frame.locator('#requestNameGate').isVisible(),true,'blank name cannot continue');
    await frame.locator('#requestStartName').fill('Fixture Singer');
    await frame.locator('#requestStartContinueBtn').click();
    await frame.locator('.song-row').first().waitFor({state:'visible'});
    assert.equal(await frame.locator('#requestNameGate').isVisible(),false,'name accepted and singer can browse');
   assert.equal(await frame.locator('.request-header').isVisible(),false,'old REQUEST A SONG heading hidden');
   assert.equal(await frame.locator('.request-mobile-toolbar').isVisible(),true,'single unified toolbar visible');
   assert.equal((await frame.locator('#requestMobileHeading').innerText()).trim(),'CHOOSE A SONG');
   assert.equal(await frame.locator('.request-browser .request-panel-heading').isVisible(),false,'no duplicate heading');
   assert.equal(await frame.locator('#requestAlphabetRow').isVisible(),false,'no A-Z filter at any width');
   assert.equal(await frame.locator('#requestSongFilters').isVisible(),false,'no legacy category filters');
   assert.equal(await frame.locator('.request-alphabet-help').count(),0,'old alphabet help removed');
   const searchBox=await frame.locator('#songSearch').boundingBox(),listBox=await frame.locator('#songResults').boundingBox();
   assert.ok(searchBox&&listBox&&listBox.y>=searchBox.y+searchBox.height,'results follow search directly');
   assert.ok(listBox.height>140,'list occupies remaining viewport space');
   const titleBox=await frame.locator('#requestMobileHeading').boundingBox(),closeBox=await frame.locator('.request-modal-close').boundingBox();
   assert.ok(titleBox&&closeBox&&Math.abs((titleBox.y+titleBox.height/2)-(closeBox.y+closeBox.height/2))<9,'title aligns with X');
   assert.equal(await frame.locator('.song-row').count(),3);await frame.locator('#songSearch').fill('cranberries');assert.match(await frame.locator('#songResults').innerText(),/Zombie/);await frame.locator('#songSearch').fill('');
   const counts=await page.evaluate(()=>__firebaseFixture.counts);for(const p of (projected?['publicSites/live-karaoke/views/live','publicSites/live-karaoke/views/events','publicSites/live-karaoke/views/settings']:['karaokeControl/currentSession','karaoke/state','karaokeControl/runOrder','karaokeControl/liveKaraokeWebsiteSettings']))assert.equal(counts[p],1,`one shared listener ${p}`);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:false}));await page.waitForFunction(()=>document.querySelector('#liveKaraokeRequestFrame')?.contentDocument?.getElementById('requestGateStatus')?.textContent?.includes('REQUESTS CLOSED'),null,{timeout:12000});assert.equal(await frame.locator('.song-action:not(:disabled)').count(),0);
   await page.evaluate(()=>__firebaseFixture.update('karaoke/state',{songsEnabled:true}));await page.waitForFunction(()=>document.querySelector('#liveKaraokeRequestFrame')?.contentDocument?.getElementById('requestGateStatus')?.textContent?.includes('REQUESTS OPEN'),null,{timeout:12000});
   await frame.locator('#songSearch').fill('zombie');await frame.locator('#songResults [data-toggle-favourite]').click();assert.equal(await frame.locator('#songResults [data-toggle-favourite]').getAttribute('aria-label'),'Remove from favourites');
   await frame.locator('#requestFavouriteOnlyBtn').waitFor({state:'visible'});
   assert.match(await frame.locator('#requestFavouriteOnlyBtn').innerText(),/FAVOURITES/);
   await frame.locator('#requestFavouriteOnlyBtn').click();
   assert.match(await frame.locator('#requestFavouriteOnlyBtn').innerText(),/SHOW ALL SONGS/);
   assert.equal(await frame.locator('.song-row').count(),1,'favourites displays only selected songs');
   await frame.locator('#requestFavouriteOnlyBtn').click();
   assert.match(await frame.locator('#requestFavouriteOnlyBtn').innerText(),/FAVOURITES/);
   if(width<=640)await frame.locator('.request-bottom-tabs [data-request-tab="profile"]').click();else await frame.locator('#editRequesterNameBtn').click();await frame.locator('#singerName').fill('Fixture Singer');await frame.locator('#singerName').blur();await frame.locator('[data-request-tab="songs"]').click();await frame.locator('#songSearch').fill('zombie');await frame.locator('[data-song-id="zombie"]').click();await frame.locator('#requestNote').fill('Fixture note');
   await frame.locator('#sendRequestBtn').evaluate(el=>{el.click();el.click();});await frame.locator('#requestSuccess').waitFor({state:'visible'});
   const requests=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('publicSongRequests/')));assert.equal(requests.length,1,'double submit blocked');assert.equal(requests[0].data.source,'live-karaoke-website');assert.equal(requests[0].data.sessionId,'s');
   await frame.locator('#requestQuickRating').waitFor({state:'visible'});
   assert.equal(await frame.locator('[data-quick-review-rating]').count(),5,'five one-tap rating choices after successful send');
   await frame.locator('[data-quick-review-rating="5"]').click();
   await frame.locator('#requestQuickRatingStatus').getByText(/Thank you!/).waitFor({state:'visible'});
   const reviewWrites=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('websiteRequesterProfiles/review_')));
   assert.equal(reviewWrites.length,1,'rating-only review submitted once');
   assert.equal(reviewWrites[0].data.rating,5);
   assert.equal(reviewWrites[0].data.review,'');
   assert.equal(reviewWrites[0].data.reviewApproved,false,'public rating requires moderation');
   await frame.locator('#quickFullReviewBtn').click();
   await frame.locator('#requestReviewPanel').waitFor({state:'visible'});
   assert.equal(await frame.locator('#submitRequestReviewBtn').isVisible(),true,'full review opens from quick rating');
   assert.equal(await frame.locator('#requestMobileBack').isVisible(),true,'review has visible Back to Profile beside close');
   await frame.locator('[data-close="requestDialog"]').click();await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
    // The saved name should skip the initial gate on a fresh popup open.
    await page.locator('#liveNowRequestBtn').tap();
    const returningFrame=page.frameLocator('#liveKaraokeRequestFrame');
    await returningFrame.locator('#requestBrowser').waitFor({state:'visible'});
    assert.equal(await returningFrame.locator('#requestNameGate').isVisible(),false,'returning singer goes straight to song list');
    // The initial placeholder may be "Loading songs…" or "No songs found"
    // depending on when async catalogue loading starts. What matters is that
    // the correct songs appear without clicking another tab.
    await returningFrame.locator('.song-row').first().waitFor({state:'visible',timeout:12000});
    assert.equal(await returningFrame.locator('.song-row').count(),3,'catalogue repaints automatically when loading finishes without switching tabs');
    await returningFrame.locator('[data-close="requestDialog"]').click();
    await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
   await page.evaluate(()=>__firebaseFixture.update('performanceSessions/s',{...__firebaseFixture.docs['performanceSessions/s'],breakOpen:true}));assert.match(await page.locator('#heroCurrentSong').innerText(),/ON BREAK/);
   await page.evaluate(()=>__firebaseFixture.update('karaokeControl/currentSession',{active:false}));assert.equal(await page.locator('#heroLiveNow').isVisible(),false);assert.equal(await page.locator('#heroCurrentSong').innerText(),'');
   assert.equal(await page.locator('#liveStatus').isVisible(),true,'countdown restores when session ends');
   assert.match(await page.locator('#liveStatus').innerText(),/NEXT LIVE KARAOKE EVENT/);assert.equal(await page.locator('#songListBtn').getAttribute('aria-disabled'),null,'song browsing stays available after the session ends');
   assert.match(await page.locator('#songListBtn').innerText(),/BROWSE SONG LIST/);
   await page.locator('#songListBtn').click();
   const browseFrame=page.frameLocator('#liveKaraokeRequestFrame');
   await browseFrame.locator('#requestBrowser').waitFor({state:'visible'});
   await browseFrame.locator('.song-row').first().waitFor({state:'visible'});
   await browseFrame.locator('#songSearch').fill('zombie');
   assert.match(await browseFrame.locator('#songResults').innerText(),/Zombie/);
   assert.equal(await browseFrame.locator('#songResults .song-action:not(:disabled)').count(),0,'requests stay disabled when browsing after a gig');
   await browseFrame.locator('[data-close="requestDialog"]').click();
   await page.locator('#liveKaraokeRequestFrame').waitFor({state:'detached'});
   await page.locator('#liveKaraokeEnquiryOpen').click();await page.locator('#lkEnquiryName').fill('Fixture Visitor');await page.locator('#lkEnquiryEmail').fill('fixture@example.com');await page.locator('#lkEnquiryEventType').selectOption('Corporate Event');await page.locator('#lkEnquiryMessage').fill('Isolated fixture enquiry.');await page.locator('#lkEnquirySubmit').evaluate(el=>{el.click();el.click();});await page.locator('#liveKaraokeEnquirySuccess').waitFor({state:'visible'});
   const bookings=await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path.startsWith('bookingEnquiries/')));assert.equal(bookings.length,1);assert.equal(bookings[0].data.pageUrl,'https://livekaraoke.eu/');assert.equal(bookings[0].data.sourceKey,'live-karaoke');assert.equal(await page.evaluate(()=>__firebaseFixture.writes.filter(x=>x.path==='publicBookingLimits/fixture@example.com').length),1,'atomic booking limit');
   assert.deepEqual(errors,[]);console.log(`PASS ${projected?'projected':'compatibility'} ${width}x${height}: layout, test exclusion, search, favourites, profile, request, duplicate prevention, closed gate, break/end, enquiry, shared listeners`);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
