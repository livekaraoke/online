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
 const fields={};for(const k of Object.keys(x))fields[k]=value(x[k]);return {mapValue:{fields}};
}
function fields(x){const out={};for(const k of Object.keys(x))out[k]=value(x[k]);return {fields:out};}
const discovery=fields({schemaVersion:1,enabled:true,token});
const view=fields({schemaVersion:1,enabled:true,sessionId:'s1',revision:'r1',setlistId:'s1',setlistName:'Test',venue:'Test',songs});
let server,browser;
(async()=>{
 server=http.createServer((req,res)=>{
  try{
   const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
   if(!file.startsWith(root+path.sep))throw Error('Bad path');
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
   res.end(fs.readFileSync(file));
  }catch(e){res.statusCode=404;res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:375,height:667}]){
  const context=await browser.newContext({viewport,hasTouch:true});
  await context.route('https://firestore.googleapis.com/**',route=>{
   const url=route.request().url();
   if(route.request().method()==='POST'&&url.endsWith(':commit'))
     return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({writeResults:[{},{}]})});
   const doc=url.includes('/signupKioskPublic')?discovery:url.includes('/signupKioskViews/')?view:null;
   if(!doc)throw Error('Unexpected Firestore call '+url);
   return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(doc)});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/signup/sign%20up.html');
  await page.locator('.song').first().waitFor({state:'attached'});
  const refresh=page.locator('#pageRefresh'),refreshRect=await refresh.boundingBox();
  assert.ok(refreshRect&&refreshRect.width>=48&&refreshRect.height>=48,'Refresh must be a large touch target');
  assert.ok(refreshRect.x+refreshRect.width<=viewport.width+2,'Refresh must fit at top right');
  await refresh.click();
  await page.locator('.song').first().waitFor({state:'attached'});
  assert.equal(await page.locator('#singerName').inputValue(),'');
  await page.locator('#singerName').fill('Test singer');
  await page.locator('#next').click();
  const layout=await page.evaluate(()=>{
   const list=document.getElementById('songResults'),send=document.getElementById('send'),bottom=document.getElementById('songBottom');
   const r=send.getBoundingClientRect(),b=bottom.getBoundingClientRect(),l=list.getBoundingClientRect();
   const original=list.scrollTop;list.scrollTop=list.scrollHeight;
   const scrolled=list.scrollTop;list.scrollTop=original;
   return {scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,scrolled,
    sendBottom:r.bottom,panelBottom:b.bottom,listBottom:l.bottom,
    viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),
    buttons:list.querySelectorAll('button').length,
    extraFooter:!!document.getElementById('songFooter')};
  });
  assert.equal(layout.buttons,155,'Full selected setlist should be in DOM');
  assert.ok(layout.scrollHeight>layout.clientHeight+100,'List needs a real inner overflow height: '+JSON.stringify(layout));
  assert.ok(layout.scrolled>100,'Old Safari list must support scrolling: '+JSON.stringify(layout));
  assert.ok(layout.sendBottom>0&&layout.sendBottom<=layout.viewport+2,'SEND REQUEST must be in viewport: '+JSON.stringify(layout));
  assert.ok(layout.panelBottom<=layout.viewport+2,'Bottom request panel must be in viewport: '+JSON.stringify(layout));
  assert.ok(layout.listBottom<=layout.sendBottom-90,'List must stop above request panel: '+JSON.stringify(layout));
  assert.equal(layout.extraFooter,false,'Redundant song-screen footer must be absent');
  await page.locator('#songResults button').last().click();
  assert.ok(await page.locator('#send').isEnabled(),'Last song should be selectable');
  await page.locator('#noteToggle').click();
  const expanded=await page.evaluate(()=>({sendBottom:document.getElementById('send').getBoundingClientRect().bottom,viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),listHeight:document.getElementById('songResults').clientHeight}));
  assert.ok(expanded.sendBottom<=expanded.viewport+2&&expanded.listHeight>40,'Expanded note should keep send button visible: '+JSON.stringify(expanded));
  await page.locator('#send').click();
  await page.locator('#success').waitFor({state:'visible'});
  const confirmation=await page.evaluate(()=>{
   const box=document.getElementById('success'),rect=box.getBoundingClientRect(),
     paragraphs=box.querySelectorAll('p'),h=box.querySelector('h2'),
     texts=[h,paragraphs[0],paragraphs[1]],
     top=texts[0].getBoundingClientRect().top,
     bottom=texts[2].getBoundingClientRect().bottom;
   return {top:rect.top,bottom:rect.bottom,height:rect.height,center:(top+bottom)/2,
     boxCenter:(rect.top+rect.bottom)/2,viewport:Math.min(window.innerHeight,document.documentElement.clientHeight),
     paragraphSize:parseFloat(getComputedStyle(paragraphs[0]).fontSize),
     gap:paragraphs[1].getBoundingClientRect().top-paragraphs[0].getBoundingClientRect().bottom};
  });
  assert.ok(confirmation.bottom<=confirmation.viewport+2,'Success border must fit viewport: '+JSON.stringify(confirmation));
  assert.ok(Math.abs(confirmation.center-confirmation.boxCenter)<26,'Success text must be vertically centered: '+JSON.stringify(confirmation));
  assert.ok(confirmation.paragraphSize>=18,'Success messages should be larger: '+JSON.stringify(confirmation));
  assert.ok(confirmation.gap>=10,'Confirmation paragraphs should be separated: '+JSON.stringify(confirmation));
  assert.deepEqual(errors,[],'No page errors expected');
  console.log('PASS signup scroll, send and confirmation at '+viewport.width+'x'+viewport.height);
  await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
