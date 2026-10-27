/* End-to-end: host SEND TO KARAOKE -> existing Firestore channel -> singer lyrics.
 * Real application pages, memory-only Firebase, no external network or live data.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'../..');
const song={title:'Karaoke send regression',artist:'Regression Artist',year:2026,originalBpm:98,userBpm:98,timeSignature:'4/4',sections:[
 {type:'lyrics',title:'VERSE',html:'<p>First line visible on singer screen</p><p>Second line without host chords</p>'},
 {type:'lyrics',title:'CHORUS',html:'<p>Chorus visible to singer</p>'},
 {type:'hostNote',title:'HOST ONLY',text:'Private host instruction, never show'}
]};
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const chrome=['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(process.env.LS26_CHROMIUM?{executablePath:process.env.LS26_CHROMIUM}:chrome?{executablePath:chrome}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:960,height:768}});
  const errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,body:'',contentType:'text/javascript'}));
  await context.addInitScript({content:fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8')+
    '\n__fixture.data["lyrics/send-song"]='+JSON.stringify(song)+';'+
    '\n__fixture.data["karaokeControl/liveLyrics"]={};'+
    '\n__fixture.data["karaokeControl/currentSession"]={active:false};'+
    '\n__fixture.data["karaokeControl/runOrder"]={items:[]};'+
    '\nlocalStorage.setItem("ls26:syncSingerScroll","false");'
  });
  const singer=await context.newPage();
  singer.on('pageerror',e=>errors.push('Singer: '+e.message));
  await singer.goto(base+'/ls26try/host/karaoke-lyric-view.html');
  await singer.waitForFunction(()=>document.querySelector('#standbyView')&&!document.querySelector('#standbyView').classList.contains('hidden'));
  const host=await context.newPage();
  host.on('pageerror',e=>errors.push('Host: '+e.message));
  await host.goto(base+'/ls26try/host/lyricview.html?id=send-song');
  await host.waitForFunction(()=>document.querySelector('#topbarSongTitle')?.textContent.includes('Karaoke send regression'));
  // Real host button, not a synthetic write. No Play/count-in beforehand.
  await host.locator('#quickSendToKaraokeBtn').click();
  await host.waitForFunction(()=>__fixture.data['karaokeControl/liveLyrics']?.displayState==='song');
  // The memory-only Firebase fixture is tab-local; replicate the accepted
  // host write to the singer tab as Firestore's realtime listener would.
  const mirror=async()=>{
    const payload=await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']);
    await singer.evaluate(async value=>db.collection('karaokeControl').doc('liveLyrics').set(value,{merge:true}),payload);
  };
  await mirror();
  await singer.waitForFunction(()=>!document.querySelector('#ls26SingerV31Lyrics')?.hidden&&document.querySelector('#ls26SingerV31Lyrics')?.textContent.includes('First line visible on singer screen'),{timeout:15000});
  assert.ok(await singer.locator('#ls26SingerV31Lyrics').isVisible(),'Lyrics must display before pressing Play');
  const content=await singer.locator('#ls26SingerV31Lyrics').textContent();
  assert.ok(content.includes('Chorus visible to singer'));
  assert.ok(!content.includes('Private host instruction'),'Private notes must not leak to singer');
  assert.ok(await singer.evaluate(()=>document.querySelector('#ls26SingerV31State')?.hidden),'UP NEXT card should be hidden after explicit send');
  assert.equal(await singer.locator('#singerPlayBtn').textContent(),'▶','Manual SEND must not start playback');
  const firstToken=await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.forceReloadToken);
  console.log('PASS SEND TO KARAOKE displays singer lyrics immediately without Play/count-in');
  await host.locator('#confirmOk').click();
  await host.locator('#quickKaraokeMenuBtn').click();
  await host.locator('#quickResetKaraokeBtn').click();
  await host.waitForFunction(()=>__fixture.data['karaokeControl/liveLyrics']?.reset===true);
  await mirror();
  await singer.waitForFunction(()=>document.querySelector('#ls26SingerV31Lyrics')?.hidden);
  console.log('PASS RESET KARAOKE returns singer screen to standby');
  await host.locator('#quickSendToKaraokeBtn').click();
  await host.waitForFunction(()=>__fixture.data['karaokeControl/liveLyrics']?.displayState==='song');
  await mirror();
  await singer.waitForFunction(()=>!document.querySelector('#ls26SingerV31Lyrics')?.hidden&&document.querySelector('#ls26SingerV31Lyrics')?.textContent.includes('First line visible on singer screen'));
  const newToken=await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.forceReloadToken);
  assert.notEqual(firstToken,newToken,'Resending same song must force reload');
  console.log('PASS resending the same song redisplays lyrics using refreshed token');
  await host.locator('#confirmOk').click();
  await singer.evaluate(async()=>{await db.collection('karaokeControl').doc('liveLyrics').set({displayState:'idle',reset:true,currentLyricsSongId:'',currentSongId:'',songId:''},{merge:true});});
  await singer.waitForFunction(()=>document.querySelector('#ls26SingerV31Lyrics')?.hidden);
  assert.ok(!errors.length,'Browser errors: '+errors.join('; '));
  console.log('PASS display idle/reset retains original singer standby and no browser errors');
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
