/* Actual Chromium tablet UI + real local Firestore rules/REST. All nonlocal
 * traffic intercepted. The production rollout flag is enabled only in memory. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const modules=process.env.LS26_KIOSK_TEST_MODULES;
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_PLAYWRIGHT_MODULES||process.cwd()]}));
const {initializeTestEnvironment}=require(require.resolve('@firebase/rules-unit-testing',{paths:[modules]}));
const {doc,setDoc,getDocs,collection}=require(require.resolve('firebase/firestore',{paths:[modules]}));
const root=path.resolve(__dirname,'../..'),project='demo-ls26-kiosk',token='a'.repeat(64),other='b'.repeat(64);
const rest='http://127.0.0.1:8188/v1/projects/'+project+'/databases/(default)/documents';
let view={schemaVersion:1,enabled:true,sessionId:'s1',setlistId:'set1',setlistName:'Tonight',venue:'Test venue',displayTitle:'Tonight at the test venue',revision:'r1',songs:{song0:{title:'Wonderwall',artist:'Oasis'},song1:{title:'Zombie',artist:'The Cranberries'}}};
for(let i=2;i<155;i++)view.songs['song'+i]={title:'Song '+String(i).padStart(3,'0'),artist:'Test artist'};
const log=message=>console.log('PASS',message);
let browser,server,env;
(async()=>{
 env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8188}});
 async function seed(changes={}){await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [p,d]of Object.entries({'signupKioskAdmin/control':{...view,token},['signupKioskViews/'+token]:view,'karaokeControl/currentSession':{active:true,sessionId:'s1'},'karaoke/state':{songsEnabled:true},...changes}))await setDoc(doc(db,p),d);});}
 await seed();
 server=http.createServer((req,res)=>{try{const uri=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/online/,'');const file=path.join(root,uri);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.LS26_CHROMIUM,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true});
 const network=[],errors=[];let offline=false,failCommit=false,commitDelay=false;
 await context.route('**/*',async route=>{
   const req=route.request(),url=req.url();
   if(url.includes('/signup/kiosk-policy.js'))return route.fulfill({contentType:'text/javascript',body:`window.LKSignupPolicy={rulesVerified:true,projectId:'${project}',schemaVersion:1};`});
   if(url.startsWith('https://firestore.googleapis.com/')){
     network.push({method:req.method(),url});
     if(offline||failCommit&&req.method()==='POST')return route.abort();
     if(commitDelay&&req.method()==='POST')await new Promise(r=>setTimeout(r,200));
     const response=await route.fetch({url:url.replace('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents',rest)});
     return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
   }
   if(new URL(url).origin===base)return route.continue();
   return route.fulfill({status:200,body:'',contentType:'text/javascript'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const kiosk=base+'/online/signup/sign%20up.html';
 await page.goto(kiosk);await page.getByText('KIOSK LINK REQUIRED',{exact:false}).waitFor();assert.equal(network.length,0);assert.ok(!await page.locator('#send').isEnabled());log('missing token: no Firestore traffic, form disabled');
 await page.goto(kiosk+'?k='+other);await page.getByText('SIGN-UP UNAVAILABLE',{exact:false}).waitFor();assert.ok(!await page.locator('#send').isEnabled());log('invalid token denied by emulator');
 await page.goto(kiosk+'?k='+token);await page.locator('.song').first().waitFor();assert.equal(await page.locator('.song').count(),30);assert.ok(!await page.locator('#send').isEnabled());log('valid token: one snapshot with bounded initial song DOM');
 const start=network.length;await page.locator('#songSearch').fill('oAsIs');assert.equal(await page.locator('.song').count(),1);assert.match(await page.locator('.song').textContent(),/Wonderwall/);await page.locator('.song').click();assert.ok(!await page.locator('#send').isEnabled());await page.locator('#singerName').fill('Tablet test singer');assert.ok(await page.locator('#send').isEnabled());assert.equal(network.length,start);log('artist search/selection/name validation: zero remote calls');
 await page.locator('#clearSearch').click();await page.locator('#songSearch').fill('zOmBiE');assert.equal(await page.locator('.song').count(),1);await page.locator('.song').click();await page.locator('#note').fill('A test note');assert.equal(network.length,start);log('title search and optional note remain local');
 for(const width of [375,768,1024]){await page.setViewportSize({width,height:width===1024?768:1024});const size=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,send:document.querySelector('#send').getBoundingClientRect().height,row:document.querySelector('.song').getBoundingClientRect().height}));assert.ok(!size.overflow);assert.ok(size.send>=44&&size.row>=44);log('no overflow, large touch targets at '+width+'px');}
 await page.setViewportSize({width:768,height:1024});
 if(process.env.LS26_BROWSER_OUTPUT){fs.mkdirSync(process.env.LS26_BROWSER_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.LS26_BROWSER_OUTPUT,'signup-kiosk-tablet.png'),fullPage:true});}
 commitDelay=true;const before=network.filter(n=>n.method==='POST').length;
 await page.locator('#send').click();await page.evaluate(()=>document.querySelector('#signupForm').dispatchEvent(new Event('submit',{cancelable:true})));await page.locator('#success').waitFor({state:'visible'});assert.equal(network.filter(n=>n.method==='POST').length,before+1);assert.equal(await page.locator('#singerName').inputValue(),'');assert.equal(await page.locator('#note').inputValue(),'');log('double-submit protected; confirmed REST success clears PII immediately');
 let requestData,requestId;
 await env.withSecurityRulesDisabled(async c=>{const snap=await getDocs(collection(c.firestore(),'publicSongRequests'));const found=snap.docs.find(d=>d.data().singerName==='Tablet test singer');assert.ok(found);requestData=found.data();requestId=found.id;assert.equal(requestData.songId,'song1');assert.equal(requestData.sessionId,'s1');assert.equal(requestData.source,'signup-kiosk');});
 await page.locator('#success').waitFor({state:'hidden',timeout:6000});assert.ok(!await page.locator('#send').isEnabled());assert.equal(await page.locator('#songSearch').inputValue(),'');log('four-second reset + fresh snapshot for next customer');
 // Same URL receives a new list; no iPad reconfiguration.
 view={...view,revision:'r2',setlistId:'set2',setlistName:'New list',songs:{fresh:{title:"Summer of '69",artist:'Bryan Adams'}}};await seed();await page.locator('#refresh').click();await page.getByRole('button',{name:/Summer of/}).waitFor();assert.equal(await page.locator('.song').count(),1);log('host setlist publication reaches same kiosk link');
 await seed({'signupKioskAdmin/control':{...view,token,enabled:false},['signupKioskViews/'+token]:{...view,enabled:false}});await page.locator('#refresh').click();await page.getByText('SIGN-UP CLOSED',{exact:false}).waitFor();assert.ok(!await page.locator('#send').isEnabled());log('disabled kiosk visibly closes');
 await seed();await page.locator('#refresh').click();await page.getByRole('button',{name:/Summer of/}).waitFor();await page.locator('.song').click();await page.locator('#singerName').fill('Failed request');failCommit=true;await page.locator('#send').click();await page.getByText('REQUEST NOT CONFIRMED',{exact:false}).waitFor();assert.ok(await page.locator('#success').isHidden());assert.ok(!await page.locator('#send').isEnabled());log('submission network failure never claims success or retries automatically');
 failCommit=false;offline=true;await page.reload();await page.getByText('NO CONNECTION',{exact:false}).waitFor();assert.ok(!await page.locator('#send').isEnabled());offline=false;await page.locator('#refresh').click();await page.locator('.song').first().waitFor();log('song-load network failure + explicit Retry recovery');
 await seed({'signupKioskAdmin/control':{...view,token:other},['signupKioskViews/'+other]:view});await page.locator('#refresh').click();await page.getByText('SIGN-UP UNAVAILABLE',{exact:false}).waitFor();log('rotated token expires old kiosk');
 await seed();await page.goto(base+'/online/signup/index.html?k='+token);await page.waitForURL('**/sign%20up.html?k=*');await page.locator('.song').first().waitFor();log('index alias preserves token');
 // Host page uses existing Firebase fixture, never live SDK. Project generated
 // payload then validates against real rules in the tests above.
 const hostContext=await browser.newContext({viewport:{width:1024,height:768}});
 await hostContext.route('**/*',route=>{
   const url=route.request().url();
   if(url.includes('/signup/kiosk-policy.js'))return route.fulfill({contentType:'text/javascript',body:"window.LKSignupPolicy={rulesVerified:true,projectId:'livekaraokesuite'};"});
   return new URL(url).origin===base?route.continue():route.fulfill({contentType:'text/javascript',body:''});
 });
 const fixture=fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8');
 await hostContext.addInitScript({content:fixture+`\nfirebase.auth().currentUser.email='leeborg23@gmail.com';firebase.auth().currentUser.getIdTokenResult=async()=>({claims:{email:'leeborg23@gmail.com'}});firebase.firestore.FieldPath={documentId:()=>'__name__'};const Proto=firebase.firestore.Query.prototype,orig=Proto.snapshot;Proto.snapshot=function(){const snap=orig.call(this);const ids=this.filters.find(f=>f[0]==='__name__');if(ids&&snap.docs)snap.docs=snap.docs.filter(d=>ids[2].includes(d.id));return snap;};__fixture.data['publicSongRequests/${requestId}']=${JSON.stringify({...requestData,createdAt:null})};`});
 const host=await hostContext.newPage();host.on('pageerror',e=>{errors.push(e.message);if(errors.length<4)console.log('HOST PAGE ERROR',e.message);});await host.goto(base+'/online/ls26try/requests.html',{waitUntil:'domcontentloaded'});await host.waitForFunction(()=>window.LS26SignupKiosk&&window.LK?.sessionTools);
 assert.equal(await host.evaluate(()=>__fixture.calls.filter(x=>x[1].includes('signupKiosk')).length),0);await host.locator('#openSignupKiosk').click();await host.waitForFunction(()=>document.querySelector('#kioskList').options.length===1);await host.locator('#kioskEnable').click();await host.getByText('Kiosk published.',{exact:false}).waitFor();const config=await host.evaluate(()=>__fixture.data['signupKioskAdmin/control']);assert.match(config.token,/^[a-f0-9]{64}$/);assert.equal(config.sessionId,'s1');const snapshot=await host.evaluate(t=>__fixture.data['signupKioskViews/'+t],config.token);assert.deepEqual(Object.keys(snapshot.songs),['song0','song1']);assert.deepEqual(Object.keys(snapshot.songs.song0),['title','artist']);assert.ok(!snapshot.token);assert.equal(await host.evaluate(()=>__fixture.listeners.filter(x=>x.includes('signupKiosk')).length),0);log('host controls publish selected snapshot + private token; no kiosk listener');
 await host.locator('#tsPendingRequestsList').getByText('SIGN-UP KIOSK',{exact:false}).waitFor();await host.locator('[data-ts-accept="'+requestId+'"]').click();await host.waitForFunction(id=>__fixture.data['publicSongRequests/'+id].status==='queued',requestId);assert.equal(await host.evaluate(id=>__fixture.data['karaokeControl/runOrder'].items.find(x=>x.requestId===id).requesterNote,requestId),'A test note');log('actual existing Requests page displays kiosk source and accepts into Run Order');
 await host.locator('#kioskRotate').click();await host.getByRole('button',{name:'Confirm',exact:true}).click();await host.waitForFunction(t=>__fixture.data['signupKioskAdmin/control'].token!==t,config.token);const rotated=await host.evaluate(()=>__fixture.data['signupKioskAdmin/control']);assert.notEqual(rotated.token,config.token);const stale=await host.evaluate(async revision=>{const n=__fixture.calls.length;try{await LS26SignupKiosk.publish({setlistId:'set1',expectedRevision:revision});return null;}catch(error){return {message:error.message,writes:__fixture.calls.slice(n).filter(x=>x[0]==='set').length};}},config.revision);assert.match(stale.message,/Another host/);assert.equal(stale.writes,0);log('host rotation and stale configuration conflict protection');
 await host.locator('#kioskDisable').click();await host.getByText('Kiosk disabled.',{exact:false}).waitFor();assert.equal(await host.evaluate(()=>__fixture.data['signupKioskAdmin/control'].enabled),false);log('host Disable changes kiosk only');await host.locator('#kioskRotate').click();await host.getByRole('button',{name:'Confirm',exact:true}).click();await host.waitForFunction(t=>__fixture.data['signupKioskAdmin/control'].token!==t,rotated.token);assert.equal(await host.evaluate(()=>__fixture.data['signupKioskAdmin/control'].enabled),false);log('rotation preserves disabled state');
 assert.deepEqual(errors,[]);log('no JavaScript page errors');await hostContext.close();await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();if(env)await env.cleanup();});
