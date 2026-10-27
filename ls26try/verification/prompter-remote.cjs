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
assert.match(viewerHtml,/lyricview-prompter-remote\.js\?v=20261028-page-scroll-v1/);
assert.match(viewerHtml,/lyricview-prompter-remote\.css\?v=20261028-page-scroll-v1/);
assert.match(prompterHtml,/prompter-remote-receiver\.js\?v=20261027-cross-tablet-v1/);
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
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'■');
  await press('faster',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.85x');
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemoteSpeed').textContent==='0.85x');
  await press('slower',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.80x');
  await press('up',()=>window.__actions.includes('up'));
  await press('down',()=>window.__actions.includes('down'));
  await press('toggle',()=>document.getElementById('scrollToggleBtn').textContent==='▶');
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶');
  assert.deepEqual(await prompter.evaluate(()=>window.__actions),['toggle','faster','slower','up','down','toggle'],'Every gesture must arrive once, not twice via channel + storage');
  console.log('PASS: cross-tab Play/Pause, +/− speed, scroll up/down, acknowledgement; no duplicate actions');
  await host.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:karaoke-tools-visibility',{detail:{visible:false}})));
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),false);
  await host.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:karaoke-tools-visibility',{detail:{visible:true}})));
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true);
  console.log('PASS: Show Karaoke Tools setting independently hides and reveals the remote');
  // Match the portrait tablet: low, centred, and clear of right-hand navigation.
  await host.setViewportSize({width:1024,height:1536});
  await host.waitForFunction(()=>{
    const box=document.getElementById('ls26PrompterRemote').getBoundingClientRect();
    const gap=window.innerHeight-box.bottom;
    return gap>=175&&gap<=195;
  });
  const b=await host.locator('#ls26PrompterRemote').boundingBox();
  const bottomGap=1536-(b.y+b.height);
  assert.ok(b.width>=490&&b.width<=510&&b.height<=150,'Remote must be wide and shallow');
  assert.ok(b.x>=195&&b.x+b.width<=750,'Remote must clear side navigation');
  assert.ok(bottomGap>=175&&bottomGap<=195,'Remote must start just above the bottom toolbar');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>getComputedStyle(el).position),'absolute','Remote must not be fixed or sticky');
  const buttonSizes=await host.locator('#ls26PrompterRemote button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  assert.ok(buttonSizes.every(h=>h>=56),'All touch targets should be at least 48px tall');
  const controlTops=await host.locator('#ls26PrompterRemote .ls26-prompter-remote-controls button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  assert.ok(controlTops.every(y=>Math.abs(y-controlTops[0])<2),'Tablet remote buttons must occupy one row');
  for(const direction of ['up','down']){
    const arrow=host.locator('[data-remote="'+direction+'"]');
    assert.equal((await arrow.textContent()).trim(),'','Up/down controls must have no text');
    assert.equal(await arrow.locator('svg path').count(),1,'Chevron icon should be present');
    assert.ok((await arrow.locator('svg').evaluate(el=>el.getBoundingClientRect().width))>=35,'Chevron must be large');
  }
  await host.setViewportSize({width:600,height:740});
  const compact=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(compact.x+compact.width<=525,'Narrow remote must leave space for side navigation');
  const playTop=await host.locator('#ls26PrompterRemotePlay').evaluate(el=>el.getBoundingClientRect().top);
  const arrowTop=await host.locator('[data-remote="up"]').evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(arrowTop>playTop+40,'Narrow remote should wrap the arrows to the second row');
  console.log('PASS: portrait placement, compact controls, large arrow icons, small-screen layout, 48px touch targets');
  await host.setViewportSize({width:1024,height:1536});
  const original=await host.locator('#ls26PrompterRemote').boundingBox();
  const header=await host.locator('.ls26-prompter-remote-head').boundingBox();
  await host.mouse.move(header.x+55,header.y+header.height/2);
  await host.mouse.down();
  await host.mouse.move(header.x+125,header.y+header.height/2-65,{steps:5});
  await host.mouse.up();
  const moved=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(moved.x>original.x+45&&moved.y<original.y-40,'Title drag repositions card');
  const saved=await host.evaluate(()=>JSON.parse(localStorage.getItem('ls26:prompter-remote-page-position-v2')));
  assert.ok(Math.abs(saved.x-moved.x)<2&&Math.abs(saved.y-moved.y)<2,'Drag position saved');
  const fresh=await context.newPage();
  await fresh.setViewportSize({width:1024,height:1536});
  await fresh.goto('http://remote.test/ls26try/host/lyricview.html');
  await fresh.setContent('<style>'+css+'</style><input type="checkbox" id="ls26ShowKaraoke" checked>');
  await fresh.addScriptTag({content:hostScript});
  const restored=await fresh.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2,'Reload restores card position');
  await fresh.setViewportSize({width:350,height:560});
  await fresh.waitForFunction(()=>{
    const rect=document.getElementById('ls26PrompterRemote').getBoundingClientRect();
    return rect.left>=7&&rect.right<=window.innerWidth-7;
  },{timeout:2000});
  const clamp=await fresh.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(clamp.x>=7&&clamp.x+clamp.width<=343,'Card stays within resized screen');
  await fresh.close();
  // Scrolling the page must move the card with the lyric document, rather
  // than pinning it like the Karaoke Tools sticky bar.
  await host.evaluate(()=>{
    const spacer=document.createElement('div');spacer.id='lyricScrollTestSpacer';
    spacer.style.height='3500px';document.body.append(spacer);
    window.scrollTo(0,0);
  });
  const atTop=await host.locator('#ls26PrompterRemote').boundingBox();
  await host.evaluate(()=>window.scrollTo(0,230));
  await host.waitForFunction(()=>window.scrollY>=200);
  const afterPageScroll=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs((atTop.y-afterPageScroll.y)-230)<3,
    'Remote must scroll away with lyrics, not follow sticky Karaoke Tools');
  await host.evaluate(()=>window.scrollTo(0,0));
  console.log('PASS: remote scrolls with page content, independent of sticky Karaoke Tools');
  console.log('PASS: drag from title only, persisted page position, restore and resize clamp');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
