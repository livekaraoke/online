/* Public signup scroll regression. Local files + mocked Firestore GETs only,
 * no production reads/writes. Checks iPad 2 landscape, portrait and Android. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_KIOSK_TEST_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'../..');
const token='a'.repeat(64),songs={};
for(let i=0;i<155;i++)songs['song'+i]={title:'Song '+String(i).padStart(3,'0'),artist:'Artist'};
function value(x){
 if(typeof x==='string')return {stringValue:x};
 if(typeof x==='number')return {integerValue:String(x)};
 if(typeof x==='boolean')return {booleanValue:x};
 if(Array.isArray(x))return {arrayValue:{values:x.map(value)}};
 if(x===null)return {nullValue:null};
 const fields={};for(const k of Object.keys(x))fields[k]=value(x[k]);return {mapValue:{fields}};
}
function fields(x){const out={};for(const k of Object.keys(x))out[k]=value(x[k]);return {fields:out};}
const queue={current:{songTitle:'Current song',singerName:'Alex'},
 next:[{songTitle:'Next song 1',singerName:'Ben'},
   {songTitle:'Next song 2',singerName:'Cara'},
   {songTitle:'Next song 3',singerName:'Dan'}]};
const discovery=fields({schemaVersion:1,enabled:true,token,queueSessionId:'s1',kioskQueue:queue});
const view=fields({schemaVersion:1,enabled:true,sessionId:'s1',revision:'r1',setlistId:'s1',setlistName:'Test',venue:'Test',songs});
function publicLive(){
 return fields({schemaVersion:1,act:'live-karaoke',sessionId:'s1',
   control:{active:true},karaoke:{songsEnabled:requestOpen},
   kioskQueue:{current:{songTitle:'Current song',singerName:'Alex'},
    next:[{songTitle:'Next song 1',singerName:'Ben'},
      {songTitle:'Next song 2',singerName:'Cara'},
      {songTitle:'Next song 3',singerName:'Dan'}]}});
}
let server,browser;let requestOpen=true,sessionActive=true;
(async()=>{
 server=http.createServer((req,res)=>{
  try{
   const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
   if(!file.startsWith(root+path.sep))throw Error('Bad path');
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/html');
   res.end(fs.readFileSync(file));
  }catch(e){res.statusCode=404;res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1024,height:768},{width:768,height:1024},
   {width:768,height:1024,standalone:true},{width:375,height:667},{width:960,height:1536}]){
  const context=await browser.newContext({viewport,hasTouch:true});
  if(viewport.standalone){
   // Emulate old iPad Home Screen: the fixed viewport is 1024px high,
   // but window.innerHeight initially reports additional phantom space.
   await context.addInitScript(()=>{
    Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
    const measured=window.innerHeight;
    Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>measured+112});
   });
  }
  await context.route('https://firestore.googleapis.com/**',route=>{
   const url=route.request().url();
   if(route.request().method()==='POST'&&url.endsWith(':commit'))
     return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({writeResults:[{},{}]})});
   if(url.endsWith(':runQuery')){
     const query=JSON.parse(route.request().postData());
     assert.deepEqual(query.structuredQuery.select.fields.map(x=>x.fieldPath).sort(),['songId','status']);
     assert.equal(query.structuredQuery.where.fieldFilter.value.stringValue,'s1');
     const row=(songId,status)=>({document:{fields:{songId:{stringValue:songId},status:{stringValue:status}}}});
     return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
       body:JSON.stringify([row('song0','pending'),row('song1','played'),row('song2','cancelled')])});
   }
   if(url.includes('/publicSites/live-karaoke/views/live'))
     return route.fulfill({status:404,contentType:'application/json',
       headers:{'access-control-allow-origin':'*'},body:'{}'});
   const doc=url.includes('/signupKioskPublic')?discovery:
     url.includes('/signupKioskViews/')?view:
     url.endsWith('/karaokeControl/currentSession')?fields({active:sessionActive,sessionId:'s1'}):
     url.endsWith('/karaoke/state')?fields({songsEnabled:requestOpen}):null;
   if(!doc)throw Error('Unexpected Firestore call '+url);
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(doc)});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/signup/sign%20up.html');
  await page.locator('.song').first().waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.getElementById('idleScreen').disabled);
  await page.waitForFunction(()=>document.getElementById('queueNextSinger3').textContent.indexOf('Dan')!==-1);
  assert.equal(await page.locator('#queueNowSong').textContent(),'Current song');
  assert.equal(await page.locator('#queueNowSinger').textContent(),'Singer: Alex');
  assert.equal(await page.locator('#queueNextSong1').textContent(),'Next song 1');
  assert.equal(await page.locator('#queueNextSinger3').textContent(),'Singer: Dan');
  assert.equal(await page.locator('#singerName').evaluate(el=>document.activeElement===el),false,
    'No automatic keyboard focus when landing appears after refresh');
  const geometry=await page.evaluate(()=>{
    const image=document.querySelector('.idle-brand-art').getBoundingClientRect();
    const queue=document.getElementById('idleQueue').getBoundingClientRect();
    return {imageBottom:image.bottom,queueTop:queue.top,queueBottom:queue.bottom,
      visibleHeight:Math.min(window.innerHeight,document.documentElement.clientHeight)};
  });
  assert.ok(Math.abs(geometry.imageBottom-geometry.queueTop)<2,'Queue must follow logo: '+JSON.stringify(geometry));
  assert.ok(geometry.queueBottom<=geometry.visibleHeight+2,'Queue must fit viewport: '+JSON.stringify(geometry));
  assert.equal(await page.locator('#idleScreen').getAttribute('aria-label'),'Click anywhere to sing');
  assert.ok(await page.locator('.idle-green-button').isVisible(),'Large TAP HERE TO SING action must be visible');
  assert.equal(await page.locator('.idle-green-button').innerText(),'TAP HERE TO SING');
  const ctaStyle=await page.locator('.idle-green-button').evaluate(el=>({
    rect:el.getBoundingClientRect().toJSON(),bg:getComputedStyle(el).backgroundColor,
    border:getComputedStyle(el).borderTopColor
  }));
  assert.ok(ctaStyle.rect.height>=58&&ctaStyle.rect.width>=200,'CTA must be large enough to tap: '+JSON.stringify(ctaStyle));
  assert.equal(ctaStyle.bg,'rgb(11, 120, 61)','CTA must show enabled green action');
  const finalRow=await page.locator('#queueNext3').boundingBox();
  assert.ok(finalRow&&finalRow.y+finalRow.height<=viewport.height+2,'All three queued singers must be visible: '+JSON.stringify(finalRow));
  const artworkScale=await page.locator('.idle-brand-art').evaluate(el=>getComputedStyle(el).backgroundSize);
  assert.equal(artworkScale,'contain','Uncropped original logo fits above the signup button');
  const imageLoaded=await page.evaluate(()=>new Promise(resolve=>{
    const img=new Image();img.onload=()=>resolve(img.naturalWidth>=1000&&img.naturalHeight>=1000);
    img.onerror=()=>resolve(false);img.src='assets/live-karaoke-landing-logo.jpg';
  }));
  assert.ok(imageLoaded,'Original attached LIVE KARAOKE artwork must load at full resolution');
  await page.locator('#idleScreen').click();
  assert.ok(await page.locator('#idleScreen').isHidden());
  const focused=await page.locator('#singerName').evaluate(el=>document.activeElement===el);
  assert.equal(focused,true,'Landing tap must focus singer name input');
  const refresh=page.locator('#pageRefresh'),refreshRect=await refresh.boundingBox();
  assert.ok(refreshRect&&refreshRect.width>=48&&refreshRect.height>=48,'Refresh must be a large touch target');
  assert.ok(refreshRect.x+refreshRect.width<=viewport.width+2,'Refresh must fit at top right');
  await refresh.click();
  await page.locator('.song').first().waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.getElementById('idleScreen').disabled);
  await page.locator('#idleScreen').click();
  assert.equal(await page.locator('#singerName').inputValue(),'');
  await page.locator('#singerName').fill('Jo');
  assert.ok(!await page.locator('#next').isEnabled(),'Two letters must not enable CHOOSE A SONG');
  await page.locator('#singerName').fill('Test singer');
  assert.ok(await page.locator('#next').isEnabled(),'Three or more characters must enable CHOOSE A SONG');
  await page.locator('#pageRefresh').click();
  await page.locator('#refreshDialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#singerName').inputValue(),'Test singer','Custom refresh dialog retains unfinished data');
  await page.locator('#refreshCancel').click();
  assert.ok(await page.locator('#refreshDialog').isHidden());
  await page.locator('#next').click();
  assert.equal(await page.locator('#cancel').isVisible(),true,'Cancel must appear in the top header on the song screen');
  assert.equal(await page.locator('#back').count(),0,'BACK button must be absent');
  const positions=await page.evaluate(()=>{
    const cancel=document.getElementById('cancel').getBoundingClientRect();
    const refresh=document.getElementById('pageRefresh').getBoundingClientRect();
    return {cancelLeft:cancel.left,cancelTop:cancel.top,refreshTop:refresh.top};
  });
  assert.ok(positions.cancelLeft<120&&Math.abs(positions.cancelTop-positions.refreshTop)<3,'Cancel aligns opposite refresh: '+JSON.stringify(positions));
  await page.locator('#cancel').click();
  assert.equal(await page.locator('#idleScreen').isVisible(),true,'Cancel returns to landing art');
  assert.equal(await page.locator('#singerName').evaluate(el=>document.activeElement===el),false,'Keyboard input must lose focus on landing');
  assert.equal(await page.locator('#singerName').inputValue(),'','Cancel must clear the unfinished signup');
  await page.locator('#idleScreen').click();
  assert.equal(await page.locator('#singerName').evaluate(el=>document.activeElement===el),true,'Next singer tap must focus name input');
  await page.locator('#singerName').fill('Test singer');
  await page.locator('#next').click();
  await page.waitForFunction(()=>document.querySelector('#songResults button').disabled);
  assert.ok(!await page.locator('#songResults button').nth(0).isEnabled(),'Requested song unavailable');
  assert.ok(!await page.locator('#songResults button').nth(1).isEnabled(),'Played song unavailable');
  assert.ok(await page.locator('#songResults button').nth(2).isEnabled(),'Cancelled request allows new selection');
  assert.equal(await page.locator('#songResults button').nth(0).locator('.song-unavailable').textContent(),'ALREADY REQUESTED');
  assert.equal(await page.locator('#songResults button').nth(1).locator('.song-unavailable').textContent(),'ALREADY PLAYED');
  const selectionHeight=await page.locator('#selection').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(selectionHeight<=2,'Selected-song banner must not consume space');
  const noteStyle=await page.locator('#noteToggle').evaluate(el=>({
    height:el.getBoundingClientRect().height,size:parseFloat(getComputedStyle(el).fontSize)
  }));
  assert.ok(noteStyle.height>=57&&noteStyle.size>=20,'Optional note control should be readable: '+JSON.stringify(noteStyle));
  const labelPlacement=await page.evaluate(()=>{
    const row=document.querySelector('#songResults button.unavailable');
    const title=row.querySelector('strong').getBoundingClientRect();
    const indicator=row.querySelector('.song-unavailable').getBoundingClientRect();
    return {titleRight:title.right,labelLeft:indicator.left};
  });
  assert.ok(labelPlacement.labelLeft>=labelPlacement.titleRight-2,
    'ALREADY REQUESTED must not overlap song title: '+JSON.stringify(labelPlacement));
  const layout=await page.evaluate(()=>{
   const list=document.getElementById('songResults'),send=document.getElementById('send'),bottom=document.getElementById('songBottom');
   const r=send.getBoundingClientRect(),b=bottom.getBoundingClientRect(),l=list.getBoundingClientRect();
   const original=list.scrollTop;list.scrollTop=list.scrollHeight;
   const scrolled=list.scrollTop;list.scrollTop=original;
   return {scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrolled,
    sendBottom:r.bottom,panelBottom:b.bottom,listBottom:l.bottom,
    gapBeforeFooter:b.top-l.bottom,position:getComputedStyle(list).position,
    heightRule:list.style.height,footerInset:getComputedStyle(bottom).bottom,
    viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),
    buttons:list.querySelectorAll('button').length,
    extraFooter:!!document.getElementById('songFooter')};
  });
  assert.equal(layout.buttons,155,'Full selected setlist should be in DOM');
  assert.ok(layout.scrollHeight>layout.clientHeight+100,'List needs a real inner overflow height: '+JSON.stringify(layout));
  assert.ok(layout.scrolled>100,'Old Safari list must support scrolling: '+JSON.stringify(layout));
  assert.ok(layout.sendBottom>0&&layout.sendBottom<=layout.viewport+2,'SEND REQUEST must be in viewport: '+JSON.stringify(layout));
  assert.ok(layout.panelBottom<=layout.viewport+2,'Bottom request panel must be in viewport: '+JSON.stringify(layout));
  assert.equal(layout.position,'fixed','List should fill space using viewport anchors, not stale fieldset height');
  assert.equal(layout.heightRule,'auto','Do not cache a short first-render height');
  if(viewport.standalone)assert.equal(layout.footerInset,'8px',
    'Home Screen mode must not mistake an innerHeight discrepancy for keyboard space');
  assert.ok(layout.gapBeforeFooter>=4&&layout.gapBeforeFooter<=14,
    'Song list must reach the note/SEND panel on the first opening, no empty gap: '+JSON.stringify(layout));
  assert.equal(layout.extraFooter,false,'Redundant song-screen footer must be absent');
  await page.locator('#songResults button').last().click();
  assert.ok(await page.locator('#send').isEnabled(),'Last song should be selectable');
  assert.equal(await page.locator('#songResults button').last().locator('.song-symbol').textContent(),'✓');
  assert.equal(await page.locator('#songResults button').nth(2).locator('.song-symbol').textContent(),'+');
  const enabledColor=await page.locator('#send').evaluate(x=>getComputedStyle(x).backgroundColor);
  assert.equal(enabledColor,'rgb(20, 107, 59)','SEND REQUEST turns green when song is selected');
  await page.locator('#noteToggle').click();
  const expanded=await page.evaluate(()=>{
    const list=document.getElementById('songResults').getBoundingClientRect();
    const footer=document.getElementById('songBottom').getBoundingClientRect();
    return {sendBottom:document.getElementById('send').getBoundingClientRect().bottom,
      viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),
      listHeight:document.getElementById('songResults').clientHeight,
      gapBeforeFooter:footer.top-list.bottom};
  });
  assert.ok(expanded.sendBottom<=expanded.viewport+2&&expanded.listHeight>40,'Expanded note should keep send button visible: '+JSON.stringify(expanded));
  assert.ok(expanded.gapBeforeFooter>=4&&expanded.gapBeforeFooter<=14,
    'Expanding the note must immediately resize the list to the new panel: '+JSON.stringify(expanded));
  const noteFont=await page.locator('#note').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(noteFont>=22,'Optional note textbox must use a large font');
  await page.locator('#send').click();
  await page.locator('#success').waitFor({state:'visible'});
  assert.ok(await page.locator('#idleScreen').isHidden(),'Success must temporarily replace landing');
  const confirmation=await page.evaluate(()=>{
   const box=document.getElementById('success'),rect=box.getBoundingClientRect(),
     paragraphs=box.querySelectorAll('p'),h=box.querySelector('h2'),
     cta=document.getElementById('anotherSong'),
     top=h.getBoundingClientRect().top,
     bottom=cta.getBoundingClientRect().bottom;
   return {top:rect.top,bottom:rect.bottom,height:rect.height,center:(top+bottom)/2,
     boxCenter:(rect.top+rect.bottom)/2,viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),
     paragraphSize:parseFloat(getComputedStyle(paragraphs[0]).fontSize),
     gap:paragraphs[1].getBoundingClientRect().top-paragraphs[0].getBoundingClientRect().bottom};
  });
  assert.ok(confirmation.bottom<=confirmation.viewport+2,'Success border must fit viewport: '+JSON.stringify(confirmation));
  assert.ok(Math.abs(confirmation.center-confirmation.boxCenter)<26,'Success text must be vertically centered: '+JSON.stringify(confirmation));
  assert.ok(confirmation.paragraphSize>=18,'Success messages should be larger: '+JSON.stringify(confirmation));
  assert.ok(confirmation.gap>=10,'Confirmation paragraphs should be separated: '+JSON.stringify(confirmation));
  assert.ok(await page.locator('#anotherSong').isVisible(),'Repeat-request button must show after confirmed submission');
  if(viewport.width!==1024){
    await page.locator('#anotherSong').click();
    assert.ok(await page.locator('#success').isHidden(),'Repeat button closes confirmation');
    assert.ok(await page.locator('#nameStep').isVisible(),'Repeat must return to name entry');
    assert.equal(await page.locator('#singerName').inputValue(),'','Repeat request must clear the old singer');
    assert.equal(await page.locator('#singerName').evaluate(el=>document.activeElement===el),true,'Repeat tap focuses name');
    await page.locator('#singerName').fill('Next singer');
    await page.locator('#next').click();
    assert.ok(!await page.locator('#send').isEnabled(),'A new song must be selected before sending');
    await page.locator('#cancel').click();
    assert.ok(await page.locator('#idleScreen').isVisible(),'Cancel after repeat returns to landing');
    assert.equal(await page.locator('#singerName').evaluate(el=>document.activeElement===el),false,'Landing must not focus keyboard');
  }
  if(viewport.width===1024){
    await page.locator('#idleScreen').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.locator('#idleScreen').getAttribute('aria-label'),'Click anywhere to sing');
    requestOpen=false;
    await page.waitForFunction(()=>document.getElementById('idleScreen').disabled,{timeout:30000});
    assert.equal(await page.locator('#idleScreen').getAttribute('aria-label'),'Requests closed');
    requestOpen=true;
    await page.waitForFunction(()=>!document.getElementById('idleScreen').disabled,{timeout:30000});
    await page.locator('#idleScreen').click();
    sessionActive=false;
    await page.waitForFunction(()=>document.getElementById('idleScreen').disabled,{timeout:30000});
    assert.equal(await page.locator('#idleScreen').getAttribute('aria-label'),'Requests closed');
    sessionActive=true;
  }
  assert.deepEqual(errors,[],'No page errors expected');
  console.log('PASS signup artwork, scroll, send and gate at '+viewport.width+'x'+viewport.height);
  await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
