/* Chromium regression: remote controls communicate between same-origin tabs.
 * Uses actual host and receiver scripts, without Firestore/network dependencies.
 */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const hostScript=fs.readFileSync(path.join(root,'host/js/lyricview-prompter-remote.js'),'utf8');
const receiverScript=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-remote-receiver.js'),'utf8');
const css=fs.readFileSync(path.join(root,'host/css/lyricview-prompter-remote.css'),'utf8');
const viewerHtml=fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8');
const prompterHtml=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/song.html'),'utf8');
const performance=fs.readFileSync(path.join(root,'shared/performance.js'),'utf8');
assert.match(viewerHtml,/lyricview-prompter-remote\.js\?v=20261027-v1/);
assert.match(viewerHtml,/lyricview-prompter-remote\.css\?v=20261027-v1/);
assert.match(prompterHtml,/prompter-remote-receiver\.js\?v=20261027-v1/);
assert.match(performance,/ls26:karaoke-tools-visibility/);
assert.match(prompterHtml,/prompterScrollUp/);assert.match(prompterHtml,/prompterScrollDown/);
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext();
  // Same-origin pages, exercising BroadcastChannel and real storage events.
  await context.route('http://remote.test/**',route=>route.fulfill({status:200,body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
  const host=await context.newPage(),prompter=await context.newPage();
  await host.goto('http://remote.test/ls26try/host/lyricview.html');
  await prompter.goto('http://remote.test/ls26try/oldadmin/host/lyrics/song.html');
  await host.setContent('<style>'+css+'</style><input type="checkbox" id="ls26ShowKaraoke" checked>');
  await prompter.setContent('<button id="scrollToggleBtn">▶</button><span id="scrollSpeedDisplay">0.80x</span><button id="prompterScrollUp"></button><button id="prompterScrollDown"></button>');
  await prompter.evaluate(()=>{
    window.__actions=[];
    window.toggleAutoScroll=()=>{
      const el=document.getElementById('scrollToggleBtn');
      el.textContent=el.textContent==='▶'?'⏸':'▶';window.__actions.push('toggle');
    };
    window.changeScrollSpeed=amount=>{
      const el=document.getElementById('scrollSpeedDisplay');
      el.textContent=(Math.round((parseFloat(el.textContent)+amount)*100)/100).toFixed(2)+'x';
      window.__actions.push(amount>0?'faster':'slower');
    };
    for(const direction of ['Up','Down'])document.getElementById('prompterScroll'+direction).onclick=()=>window.__actions.push(direction.toLowerCase());
  });
  await host.addScriptTag({content:hostScript});
  await prompter.addScriptTag({content:receiverScript});
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemoteStatus')?.textContent==='Connected');
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true);
  async function press(action,expected){
    await host.locator('[data-remote="'+action+'"]').click();
    await prompter.waitForFunction(expected);
  }
  await press('toggle',()=>document.getElementById('scrollToggleBtn').textContent==='⏸');
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemotePlay')?.getAttribute('aria-pressed')==='true');
  await press('faster',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.85x');
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemoteSpeed').textContent==='0.85x');
  await press('slower',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.80x');
  await press('up',()=>window.__actions.includes('up'));
  await press('down',()=>window.__actions.includes('down'));
  await press('toggle',()=>document.getElementById('scrollToggleBtn').textContent==='▶');
  assert.deepEqual(await prompter.evaluate(()=>window.__actions),['toggle','faster','slower','up','down','toggle'],'Every gesture must arrive once, not twice via channel + storage');
  console.log('PASS: cross-tab Play/Pause, +/− speed, scroll up/down, acknowledgement; no duplicate actions');
  await host.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:karaoke-tools-visibility',{detail:{visible:false}})));
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),false);
  await host.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:karaoke-tools-visibility',{detail:{visible:true}})));
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true);
  console.log('PASS: Show Karaoke Tools setting independently hides and reveals the remote');
  const b=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(b.width<=300&&b.height<=200,'Remote should remain compact on the stage');
  const buttonSizes=await host.locator('#ls26PrompterRemote button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  assert.ok(buttonSizes.every(h=>h>=48),'Remote requires large touch targets');
  console.log('PASS: compact floating card, 48px+ touch targets');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
