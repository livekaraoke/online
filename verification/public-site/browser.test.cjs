/* Run with Playwright and a Chromium executable. Test writes are intercepted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const fixture = `(() => {
  const events = [
    {id:'later',type:'Live Karaoke',date:'2026-12-01',startTime:'20:00',venue:'Later venue'},
    {id:'next',type:'Live Karaoke',date:'2026-10-07',startTime:'20:00',endTime:'23:00',venue:'Test venue',address:'Malta'},
    {id:'old',type:'Live Karaoke',date:'2025-10-07',startTime:'20:00',venue:'Old venue'},
    {id:'cancelled',type:'Live Karaoke',status:'cancelled',date:'2026-10-06',startTime:'20:00',venue:'Cancelled venue'},
    {id:'other',type:'Solo',date:'2026-10-06',startTime:'20:00',venue:'Other venue'}
  ];
  const docs = {'karaokeControl/currentSession':{active:false},'karaoke/state':{},'karaokeControl/runOrder':{items:[]},'performanceSessions/test':{type:'Live Karaoke',venue:'Test venue'}};
  const listeners = {};
  window.__writes = [];
  window.__writeError = false;
  window.__setDoc = (key,data) => {docs[key]=data;listeners[key]?.({exists:true,id:key.split('/').pop(),data:()=>data})};
  const db = {collection(name) {return {
    onSnapshot(fn) {setTimeout(()=>fn({docs:events.map(e=>({id:e.id,data:()=>e}))}),30);return ()=>{}},
    doc(id) {const key=name+'/'+id;return {onSnapshot(fn) {listeners[key]=fn;setTimeout(()=>fn({exists:!!docs[key],id,data:()=>docs[key]}),30);return ()=>{delete listeners[key]}}}},
    async add(data) {await new Promise(r=>setTimeout(r,60));if(window.__writeError) throw new Error('offline');window.__writes.push({collection:name,data});return {id:'test'} }
  }}};
  const firestore = () => db;
  firestore.FieldValue = {serverTimestamp:()=>({serverTimestamp:true})};
  const appcheck = () => ({activate(){},async getToken(){return {token:'test-only'}}});
  appcheck.ReCaptchaEnterpriseProvider = class {constructor(key){}};
  window.firebase={apps:[],initializeApp(options){const app={options};this.apps.push(app);return app},app(){return this.apps[0]},firestore,appCheck:appcheck};
})();`;
async function fill(page) {
  await page.locator('#lkEnquiryName').fill('Test Visitor');
  await page.locator('#lkEnquiryEmail').fill('visitor@example.com');
  await page.locator('#lkEnquiryEventType').selectOption('Corporate Event');
  await page.locator('#lkEnquiryMessage').fill('A test enquiry, never sent to production.');
}
(async()=>{
  const path=require('node:path');
  const server=require('node:http').createServer((req,res)=>{
    const requested=decodeURIComponent(req.url.split('?')[0]);
    const relative=requested.replace(/^\/online\//,'');
    const file=path.join(__dirname,'../..',relative || 'index.html');
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon'};
    fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'Missing':data)});
  });
  await new Promise(resolve=>server.listen(8080,'127.0.0.1',resolve));
  const launch = {headless:true};
  if (process.env.LK_CHROMIUM_PATH) {launch.executablePath=process.env.LK_CHROMIUM_PATH;launch.args=['--no-sandbox'];}
  const browser=await chromium.launch(launch);
  fs.mkdirSync('/tmp/lk-public-screens',{recursive:true});
  for (const [width,height] of [[1920,1080],[1366,768],[1280,800],[1024,768],[390,844],[360,800]]) {
    const context=await browser.newContext({viewport:{width,height},timezoneId:'America/New_York'});
    const page=await context.newPage();
    const errors=[]; const missing=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400 && r.url().startsWith('http://127.0.0.1'))missing.push(r.url())});
    await page.route('https://www.gstatic.com/firebasejs/**',async route=>route.fulfill({contentType:'application/javascript',body:route.request().url().includes('firebase-app-compat')?fixture:''}));
    await page.clock.install({time:new Date('2026-10-06T03:00:00Z')});
    await page.clock.setFixedTime(new Date('2026-10-06T03:00:00Z'));
    await page.goto(process.env.LK_QA_URL || 'http://127.0.0.1:8080/online/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://livekaraoke.github.io/online/');
    assert.equal(await page.locator('#copyrightYear').textContent(),'2026');
    await page.waitForFunction(()=>document.querySelectorAll('.live-karaoke-event-card').length===2);
    assert.match(await page.locator('.live-karaoke-event-card').first().textContent(),/TEST VENUE|Test venue/);
    assert.match(await page.locator('#liveStatus').textContent(),/1d 15h/);
    assert.match(await page.locator('#liveStatus').textContent(),/20:00 \(Malta time\)/);
    await page.evaluate(()=>[...document.querySelectorAll('script[type="application/ld+json"]')].forEach(n=>JSON.parse(n.textContent)));
    const schema=await page.locator('#public-event-schema').textContent();
    assert.match(schema,/2026-10-07T18:00:00.000Z/);
    assert.equal(await page.evaluate(()=>new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size===document.querySelectorAll('[id]').length),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.equal(await page.locator('.hero-banner').evaluate(n=>n.complete && n.naturalWidth===1774),true);
    assert.match(await page.locator('.hero-banner').evaluate(n=>n.currentSrc),/banner.avif$/);
    await page.screenshot({path:'/tmp/lk-public-screens/'+width+'x'+height+'.png',fullPage:true});
    const summary=page.locator('.booking-faq summary').first();
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate(n=>n.parentElement.open),true);
    await page.keyboard.press('Space');
    assert.equal(await summary.evaluate(n=>n.parentElement.open),false);
    await page.locator('.hero-content a.main-button').click();
    await page.locator('#liveKaraokeEnquiryOpen').click();
    await fill(page);
    if(width===390) await page.screenshot({path:'/tmp/lk-public-screens/mobile-form.png'});
    await page.evaluate(()=>{
      const form=document.getElementById('liveKaraokeEnquiryForm');
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>document.querySelector('#liveKaraokeEnquirySuccess').hidden===false);
    assert.equal(await page.evaluate(()=>__writes.length),1);
    assert.equal(await page.evaluate(()=>__writes[0].collection),'bookingEnquiries');
    assert.equal(await page.locator('#liveKaraokeEnquiryForm').isVisible(),false);
    await page.locator('#liveKaraokeEnquirySuccessClose').click();
    await page.locator('#liveKaraokeEnquiryOpen').click();
    await fill(page); await page.locator('#lkEnquirySubmit').click();
    assert.match(await page.locator('#lkEnquiryStatus').textContent(),/already sent/);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      __setDoc('karaokeControl/currentSession',{active:true,sessionId:'test',type:'Live Karaoke',venue:'Test venue'});
      __setDoc('karaokeControl/runOrder',{items:[{id:'now',status:'playing',songTitle:'Current song',artist:'Artist'},{id:'next',status:'queued',songTitle:'Next song'}]});
    });
    await page.waitForFunction(()=>!document.getElementById('heroLiveNow').classList.contains('hidden'));
    assert.match(await page.locator('#heroCurrentSong').textContent(),/Current song/);
    assert.match(await page.locator('#heroComingUp').textContent(),/Next song/);
    await page.waitForFunction(()=>document.getElementById('heroRequestBtn').getAttribute('aria-disabled')==='false');
    await page.evaluate(()=>__setDoc('performanceSessions/test',{type:'Live Karaoke',breakOpen:true}));
    assert.match(await page.locator('#heroCurrentSong').textContent(),/ON BREAK/);
    await page.evaluate(()=>__setDoc('karaokeControl/currentSession',{active:false}));
    assert.equal(await page.locator('#heroRequestBtn').getAttribute('aria-disabled'),'true');
    await page.evaluate(()=>{window.__popupTest=false;window.openLiveKaraokeRequestPopup=()=>{window.__popupTest=true}});
    await page.locator('#songListBtn').click();
    assert.equal(await page.evaluate(()=>window.__popupTest),true);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    console.log('PASS',width+'x'+height,'hero, navigation, FAQ, form, live state, events, metadata, no overflow/errors');
    await context.close();
  }
  // Error, validation and attestation branches on a fresh page, never live writes.
  const context=await browser.newContext(); const page=await context.newPage();
  await page.route('https://www.gstatic.com/firebasejs/**',async r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('firebase-app-compat')?fixture:''}));
  await page.goto('http://127.0.0.1:8080/online/',{waitUntil:'networkidle'});
  await page.locator('#liveKaraokeEnquiryOpen').click();await fill(page);
  await page.locator('#lkEnquiryMessage').fill('<script>invalid</script>');await page.locator('#lkEnquirySubmit').click();
  assert.match(await page.locator('#lkEnquiryStatus').textContent(),/plain text/);
  assert.equal(await page.evaluate(()=>__writes.length),0);
  await fill(page);await page.evaluate(()=>window.__writeError=true);await page.locator('#lkEnquirySubmit').click();
  await page.waitForFunction(()=>document.querySelector('#lkEnquiryStatus').classList.contains('error'));
  assert.equal(await page.locator('#lkEnquirySubmit').isEnabled(),true);
  await page.evaluate(()=>{__writeError=false;LK_PUBLIC_APP_CHECK_KEYS[firebase.app().options.projectId]='configured-test-key';LK_PUBLIC_APP_CHECK_READY=false});
  await page.locator('#lkEnquirySubmit').click();assert.match(await page.locator('#lkEnquiryStatus').textContent(),/verify/);
  assert.equal(await page.evaluate(()=>__writes.length),0);
  await page.evaluate(()=>LK_PUBLIC_APP_CHECK_READY=true);await page.locator('#lkEnquirySubmit').click();
  await page.waitForFunction(()=>__writes.length===1);
  for(const ext of ['webp','png']) {
    await page.locator('picture').evaluate((n,ext)=>{n.querySelectorAll('source').forEach(s=>s.remove());if(ext==='webp'){const s=document.createElement('source');s.srcset='img/banner.webp';s.type='image/webp';n.prepend(s)}},ext);
    await page.waitForFunction(ext=>document.querySelector('.hero-banner').currentSrc.endsWith('banner.'+ext) && document.querySelector('.hero-banner').complete,ext);
  }
  console.log('PASS validation, error recovery, configured App Check branches, WebP/PNG fallbacks');
  await browser.close();
  server.close();
})().catch(e=>{console.error(e);process.exit(1)});
