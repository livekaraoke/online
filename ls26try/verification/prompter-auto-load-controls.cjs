/* Chromium: strip controls mirror the existing INFO & TOOLS settings.
 * AUTO sends using the same existing SEND LYRICS pathway after song load,
 * without starting playback or writing to the singer display.
 * Memory-only Firestore fixture: no actual live data writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'ls26try/host/js/lyricview.js'),'utf8');
const html=fs.readFileSync(path.join(root,'ls26try/host/lyricview.html'),'utf8');
const preferences=fs.readFileSync(path.join(root,'ls26try/shared/performance.js'),'utf8');
const song={title:'Prompter auto send regression',artist:'QA Artist',year:2026,userBpm:100,originalBpm:100,sections:[
 {type:'lyrics',title:'VERSE',html:'<p>This is a testing lyric</p>'}]};
assert.match(preferences,/AUTO SEND TO PROMPTER ON LOAD/);
assert.doesNotMatch(preferences,/AUTO SEND TO KARAOKE ON PLAY/);
assert.doesNotMatch(source,/autoSendCurrentSongToKaraoke/);
assert.match(source,/await loadSlaveLyricsOptions\(\);/);
assert.match(source,/if\(autoSendToPrompterOnLoadEnabled\(\)\)\{\s*void sendSlaveLyrics\("quickSlaveLyricsSelect"\)/);
assert.doesNotMatch(html,/id="quickSendToKaraokeBtn"|id="quickKaraokeMenuBtn"/);
for(const id of ['quickPrompterToggle','quickSingerAutoScrollToggle','quickAutoSendPrompterBtn','quickSendSlaveLyricsBtn','quickSlaveLyricsSelect'])
 assert.ok(html.includes('id="'+id+'"'),'Missing strip element '+id);
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file))}
  catch{res.writeHead(404);res.end()}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const executable=['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:1536}});
  const errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,body:'',contentType:'text/javascript'}));
  await context.addInitScript({content:fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8')+
    '\n__fixture.data["lyrics/auto-song"]='+JSON.stringify(song)+';'+
    '\n__fixture.data["karaokeControl/liveLyrics"]={displayState:"idle"};'+
    '\n__fixture.data["karaokeControl/currentSession"]={active:false};'+
    '\n__fixture.data["karaokeControl/runOrder"]={items:[]};'+
    '\nif(localStorage.getItem("ls26:autoSendPrompterOnLoad")===null)localStorage.setItem("ls26:autoSendPrompterOnLoad","false");'+
    '\nlocalStorage.setItem("ls26:syncSingerScroll","true");'
  });
  const host=await context.newPage();
  host.on('pageerror',error=>errors.push(error.message));
  await host.goto(base+'/ls26try/host/lyricview.html?id=auto-song');
  await host.waitForFunction(()=>document.getElementById('topbarSongTitle')?.textContent.includes('Prompter auto send regression'));
  await host.locator('#quickPrompterToggle').waitFor();
  await host.locator('#quickSingerAutoScrollToggle').waitFor();
  await host.locator('#quickAutoSendPrompterBtn').waitFor();
  assert.equal(await host.locator('#quickAutoSendPrompterBtn').getAttribute('aria-pressed'),'false');
  assert.equal(await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.prompterSongId||''),'','Auto OFF: no Prompter send on load');
  // The sidebar and strip operate on the same setting.
  await host.locator('#quickPrompterToggle').click();
  assert.equal(await host.locator('#ls26ShowPrompterRemote').isChecked(),await host.locator('#quickPrompterToggle').getAttribute('aria-pressed')==='true');
  await host.locator('#ls26ShowPrompterRemote').uncheck();
  assert.equal(await host.locator('#quickPrompterToggle').getAttribute('aria-pressed'),'false');
  await host.locator('#quickSingerAutoScrollToggle').click();
  assert.equal(await host.locator('#ls26SyncSingerScroll').isChecked(),false);
  assert.equal(await host.locator('#quickSingerSyncToggle').isChecked(),false);
  await host.locator('#quickSingerSyncToggle').check();
  assert.equal(await host.locator('#quickSingerAutoScrollToggle').getAttribute('aria-pressed'),'true');
  await host.locator('#quickAutoSendPrompterBtn').click();
  assert.equal(await host.locator('#ls26AutoSendKaraoke').getAttribute('aria-pressed'),'true');
  assert.equal(await host.evaluate(()=>localStorage.getItem('ls26:autoSendPrompterOnLoad')),'true');
  assert.equal(await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.prompterSongId||''),'','Switch ON does not force extra immediate send');
  await host.reload();
  await host.waitForFunction(()=>__fixture.data['karaokeControl/liveLyrics']?.prompterSongId==='auto-song');
  assert.equal(await host.locator('#quickAutoSendPrompterBtn').getAttribute('aria-pressed'),'true');
  const value=await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']);
  assert.equal(value.prompterLyricsSource,'modern');
  assert.equal(value.displayState,'idle','Auto SEND LYRICS must not change singer display state');
  assert.equal(value.prompterRemoteState.playing,false,'Auto send must not start Prompter playback');
  assert.equal(value.prompterRemoteState.mode,'waiting');
  assert.ok(value.prompterRequestToken,'Existing sender refresh token used');
  const token=value.prompterRequestToken;
  // Press Play: must not cause another song send.
  await host.locator('#autoScrollBtn').click({force:true});
  assert.equal(await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.prompterRequestToken),token,'Play does not re-send to Prompter');
  await host.locator('#quickAutoSendPrompterBtn').click();
  assert.equal(await host.locator('#ls26AutoSendKaraoke').getAttribute('aria-pressed'),'false');
  await host.reload();
  await host.waitForFunction(()=>document.getElementById('topbarSongTitle')?.textContent.includes('Prompter auto send regression'));
  const unchanged=await host.evaluate(()=>__fixture.data['karaokeControl/liveLyrics']?.prompterRequestToken);
  assert.equal(unchanged,undefined,'Auto OFF must not re-send on next page load');
  assert.equal(await host.locator('#quickAutoSendPrompterBtn').getAttribute('aria-pressed'),'false');
  assert.ok(!errors.length,'Browser errors: '+errors.join('; '));
  console.log('PASS: remote/singer/auto strip toggles mirror sidebar; auto SEND LYRICS on load, off by default, no singer display writes, no Play resend');
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
