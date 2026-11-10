/* Chromium regression: remote controls communicate between same-origin tabs.
 * Uses actual host and receiver scripts, without Firestore/network dependencies.
 */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const hostScript=fs.readFileSync(path.join(root,'host/js/lyricview-prompter-remote.js'),'utf8');
const receiverScript=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-remote-receiver.js'),'utf8');
const css=fs.readFileSync(path.join(root,'host/css/lyricview-prompter-remote.css'),'utf8');
const singerCss=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-end-rating.css'),'utf8');
const viewerHtml=fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8');
const prompterHtml=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/song.html'),'utf8');
const performance=fs.readFileSync(path.join(root,'shared/performance.js'),'utf8');
assert.match(viewerHtml,/lyricview-prompter-remote\.js\?v=20261111-shared-stage-v1/);
assert.match(viewerHtml,/lyricview-prompter-remote\.css\?v=20261103-remote-layout-v2/);
assert.match(prompterHtml,/prompter-remote-receiver\.js\?v=20261111-logo-artwork-v1/);
assert.match(performance,/ls26:karaoke-tools-visibility/);
assert.match(performance,/id="ls26ShowKaraoke"> Show karaoke tools<\/label>\s*<label class="ls26-karaoke-toggle"><input type="checkbox" id="ls26ShowPrompterRemote"> Show Prompter Remote/);
assert.match(performance,/ls26:prompter-remote-visibility/);
assert.match(viewerHtml,/performance\.js\?v=20261103-tap-tempo-v1/);
assert.match(prompterHtml,/prompter-end-rating\.css\?v=20261111-logo-artwork-v1/);
assert.match(receiverScript,/live-karaoke-artwork\.jpg/);
assert.doesNotMatch(receiverScript,/song-about-to-begin\.jpg|waiting-for-next-singer\.jpg/);
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
  await host.setContent('<style>'+css+'</style><input type="checkbox" id="ls26ShowKaraoke" checked><input type="checkbox" id="ls26ShowPrompterRemote" checked>');
  // Mirror performance.js's event contract for this isolated remote test.
  await host.evaluate(()=>{
    const toggle=document.getElementById('ls26ShowPrompterRemote');
    toggle.addEventListener('change',()=>{
      localStorage.setItem('ls26:showPrompterRemote',String(toggle.checked));
      dispatchEvent(new CustomEvent('ls26:prompter-remote-visibility',{detail:{visible:toggle.checked}}));
    });
  });
  await prompter.setContent('<button id="scrollToggleBtn">▶</button><span id="scrollSpeedDisplay">0.80x</span><button id="prompterScrollUp"></button><button id="prompterScrollDown"></button>');
  await prompter.addStyleTag({content:singerCss});
  await prompter.evaluate(()=>{
    window.__actions=[];
    window.autoScrollActive=false;
    window.stopAutoScroll=()=>{
      window.autoScrollActive=false;
      document.getElementById('scrollToggleBtn').textContent='▶';
    };
    window.toggleAutoScroll=()=>{
      const el=document.getElementById('scrollToggleBtn');
      el.textContent=el.textContent==='▶'?'⏸':'▶';
      window.autoScrollActive=el.textContent==='⏸';
      window.__actions.push('toggle');
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
  assert.deepEqual(
    await host.locator('#ls26PrompterRemote .ls26-prompter-remote-controls button').evaluateAll(nodes=>nodes.map(el=>el.dataset.remote)),
    ['toggle','slower','faster','up','down'],
    'Speed placeholder removed; functional tempo +/- remain adjacent'
  );
  assert.equal(await host.locator('#ls26PrompterRemoteSpeed').count(),0,'Remove unused dash output');
  assert.deepEqual(
    await host.locator('#ls26PrompterRemote .ls26-prompter-remote-stage-actions button').evaluateAll(nodes=>nodes.map(el=>el.dataset.remote)),
    ['song','instrumental'],
    'START SONG must be on the left'
  );
  async function press(action,expected){
    await host.locator('[data-remote="'+action+'"]').click();
    await prompter.waitForFunction(expected);
  }
  assert.equal(await prompter.evaluate(()=>document.body.dataset.ls26SingerStage),'idle');
  assert.equal(await prompter.locator('.ls26-singer-artwork-idle img').getAttribute('src'),'live-karaoke-artwork.jpg');
  assert.equal((await prompter.locator('.ls26-singer-message-idle').innerText()).replace(/\s+/g,' '),'WAITING FOR NEXT SINGER');
  assert.equal(await prompter.locator('.ls26-singer-artwork-preview img').getAttribute('src'),'live-karaoke-artwork.jpg');
  assert.equal(await prompter.locator('.ls26-singer-message-preview').textContent(),'PLEASE WAIT');
  assert.equal(await host.locator('#ls26PrompterSongCue').isDisabled(),true,'An idle screen is not a playable song');
  await prompter.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:prompter-song-changed',{
    detail:{songId:'demo',cue:true,title:'All the Small Things',artist:'Blink 182',year:1999}
  })));
  await prompter.waitForFunction(()=>document.body.dataset.ls26SingerStage==='waiting');
  assert.equal(await prompter.locator('#ls26SingerUpcomingTitle').textContent(),'All the Small Things');
  assert.equal(await prompter.locator('#ls26SingerUpcomingArtist').textContent(),'Blink 182');
  const previewStyle=await prompter.evaluate(()=>{
    const art=document.querySelector('.ls26-singer-artwork-preview');
    const info=document.querySelector('.ls26-singer-song-info');
    const title=document.getElementById('ls26SingerUpcomingTitle');
    const artist=document.getElementById('ls26SingerUpcomingArtist');
    const year=document.getElementById('ls26SingerUpcomingYear');
    const artBox=art.getBoundingClientRect();
    const style=getComputedStyle(info);
    return {topRatio:(info.getBoundingClientRect().top-artBox.top)/artBox.height,
      title:getComputedStyle(title).color,artist:getComputedStyle(artist).color,
      year:getComputedStyle(year).color,
      border:style.borderTopColor,borderWidth:style.borderTopWidth,
      radius:style.borderTopLeftRadius,padding:style.paddingTop,
      background:style.backgroundImage};
  });
  assert.ok(previewStyle.topRatio>0.765&&previewStyle.topRatio<0.775,'Preview metadata sits clearly below PLEASE WAIT');
  assert.equal(previewStyle.title,'rgb(255, 255, 255)');
  assert.equal(previewStyle.artist,'rgb(174, 180, 188)');
  assert.equal(previewStyle.year,'rgb(142, 148, 156)');
  assert.equal(previewStyle.border,'rgb(54, 213, 138)','Song information must have a green border');
  assert.equal(previewStyle.borderWidth,'2px');
  assert.ok(parseFloat(previewStyle.radius)>=12,'Card has professional rounded corners');
  assert.ok(parseFloat(previewStyle.padding)>=14,'Card must have comfortable inner spacing');
  assert.ok(previewStyle.background.includes('linear-gradient'),'Card uses a dark-green gradient');
  assert.equal(await prompter.locator('#ls26SingerUpcomingYear').textContent(),'(1999)');
  await host.waitForFunction(()=>document.getElementById('ls26PrompterSongCue')?.disabled===false);
  await press('song',()=>document.body.dataset.ls26SingerStage==='running');
  assert.equal(await prompter.locator('#scrollToggleBtn').textContent(),'▶','START SONG reveals lyrics without auto-scrolling');
  assert.equal(await prompter.evaluate(()=>window.autoScrollActive),false);
  assert.deepEqual(await prompter.evaluate(()=>window.__actions),[],'No toggle action is caused by START SONG');
  assert.equal(await host.locator('#ls26PrompterSongCue').textContent(),'END SONG');
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemotePlay')?.getAttribute('aria-pressed')==='false');
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶','Host remote also shows scrolling paused');
  await press('toggle',()=>document.getElementById('scrollToggleBtn').textContent==='⏸');
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'■','Play is the separate start-scroll action');
  await press('faster',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.90x');
  await press('slower',()=>document.getElementById('scrollSpeedDisplay').textContent==='0.80x');
  await press('up',()=>window.__actions.includes('up'));
  await press('down',()=>window.__actions.includes('down'));
  await press('toggle',()=>document.getElementById('scrollToggleBtn').textContent==='▶');
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶');
  assert.deepEqual(await prompter.evaluate(()=>window.__actions),['toggle','faster','slower','up','down','toggle'],'Every gesture must arrive once, not twice via channel + storage');
  console.log('PASS: cross-tab Play/Pause, +/− speed, scroll up/down, acknowledgement; no duplicate actions');
  await press('instrumental',()=>document.body.dataset.ls26SingerStage==='instrumental');
  assert.equal(await prompter.locator('#scrollToggleBtn').textContent(),'▶','Instrumental holds scrolling');
  assert.equal(await host.locator('#ls26PrompterInstrumental').textContent(),'RESUME LYRICS');
  await press('instrumental',()=>document.body.dataset.ls26SingerStage==='running');
  assert.equal(await prompter.locator('#scrollToggleBtn').textContent(),'⏸','Resuming restarts scrolling');
  await press('song',()=>document.body.dataset.ls26SingerStage==='ended');
  assert.equal(await prompter.locator('#scrollToggleBtn').textContent(),'▶','Song end stops scrolling');
  assert.equal(await host.locator('#ls26PrompterSongCue').textContent(),'START AGAIN');
  await prompter.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:prompter-feedback-complete',{detail:{rating:'good'}})));
  await prompter.waitForFunction(()=>document.body.dataset.ls26SingerStage==='idle');
  assert.equal(await host.locator('#ls26PrompterSongCue').isDisabled(),true);
  console.log('PASS: preview art and metadata, instrumental hold/resume, END SONG, and feedback return to idle art');
  // The remote's own toggle, not the separate Karaoke Tools visibility, owns it.
  await host.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:karaoke-tools-visibility',{detail:{visible:false}})));
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true,'Karaoke Tools can hide independently');
  const title=host.locator('.ls26-prompter-remote-head');
  const beforeClose=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.equal(await host.locator('#ls26PrompterRemoteClose').count(),0,'X removed');
  await host.locator('#ls26ShowPrompterRemote').uncheck();
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),false);
  assert.equal(await host.locator('#ls26ShowKaraoke').isChecked(),true);
  await host.locator('#ls26ShowPrompterRemote').check();
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true);
  const afterOpen=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs(afterOpen.x-beforeClose.x)<1&&Math.abs(afterOpen.y-beforeClose.y)<1,'Sidebar visibility preserves card placement');
  // Setting is independent in both directions.
  await host.locator('#ls26ShowPrompterRemote').uncheck();
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),false);
  await host.locator('#ls26ShowPrompterRemote').check();
  assert.equal(await host.locator('#ls26PrompterRemote').isVisible(),true);
  console.log('PASS: sidebar toggle, independent visibility and card-position preservation');
  // Match the portrait tablet: low, centred, and clear of right-hand navigation.
  await host.setViewportSize({width:1024,height:1536});
  await host.waitForFunction(()=>{
    const box=document.getElementById('ls26PrompterRemote').getBoundingClientRect();
    const gap=window.innerHeight-box.bottom;
    return gap>=175&&gap<=195;
  });
  const b=await host.locator('#ls26PrompterRemote').boundingBox();
  const bottomGap=1536-(b.y+b.height);
  assert.ok(b.width>=490&&b.width<=510&&b.height<=250,'Remote remains compact with larger arrow buttons');
  assert.ok(b.x>=195&&b.x+b.width<=750,'Remote must clear side navigation');
  assert.ok(bottomGap>=175&&bottomGap<=195,'Remote must start just above the bottom toolbar');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>getComputedStyle(el).position),'fixed','Remote must float independently of sticky tools');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>el.parentElement===document.body),true,'Remote must not be nested inside Karaoke Tools bar');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>el.style.top),'','Default position must not freeze top coordinates');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>getComputedStyle(el).bottom),'190px','Default remote must remain bottom anchored');
  // Chromium has no Android address-bar UI. Reproduce its viewport-height
  // change: screen-bottom placement must stay identical even as top shifts.
  const stableBefore=await host.locator('#ls26PrompterRemote').boundingBox();
  await host.setViewportSize({width:1024,height:1400});
  const stableAfter=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs((1400-stableAfter.y-stableAfter.height)-
    (1536-stableBefore.y-stableBefore.height))<1&&Math.abs(stableAfter.x-stableBefore.x)<1,
    'Chrome top-toolbar collapse must not change the bottom screen offset');
  assert.ok(Math.abs((stableAfter.y-stableBefore.y)+136)<2,
    'Remote must follow the bottom-docked controls, not the top browser chrome');
  await host.setViewportSize({width:1024,height:1536});
  console.log('PASS: default card stays docked to screen bottom when Chrome top bars collapse');
  const buttonSizes=await host.locator('#ls26PrompterRemote button[data-remote]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  assert.ok(buttonSizes.every(h=>h>=56),'All touch targets should be at least 48px tall');
  const controlTops=await host.locator('#ls26PrompterRemote .ls26-prompter-remote-controls button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  assert.ok(controlTops.every(y=>Math.abs(y-controlTops[0])<2),'Tablet remote buttons must occupy one row');
  for(const direction of ['up','down']){
    const arrow=host.locator('[data-remote="'+direction+'"]');
    assert.equal((await arrow.textContent()).trim(),'','Up/down controls must have no text');
    assert.equal(await arrow.locator('svg path').count(),1,'Chevron icon should be present');
    assert.ok((await arrow.locator('svg').evaluate(el=>el.getBoundingClientRect().width))>=47,'Chevron icon should be visibly larger');
    assert.ok((await arrow.evaluate(el=>el.getBoundingClientRect().height))>=74,'Arrow touch area must be larger than the other controls');
  }
  await host.setViewportSize({width:600,height:740});
  await host.waitForFunction(()=>{
    const play=document.getElementById('ls26PrompterRemotePlay')?.getBoundingClientRect();
    const up=document.querySelector('#ls26PrompterRemote [data-remote="up"]')?.getBoundingClientRect();
    return play&&up&&up.top>play.top+40;
  });
  const compact=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(compact.x+compact.width<=525,'Narrow remote must leave space for side navigation');
  const positions=await host.evaluate(()=>{
    const play=document.getElementById('ls26PrompterRemotePlay').getBoundingClientRect();
    const arrow=document.querySelector('#ls26PrompterRemote [data-remote="up"]').getBoundingClientRect();
    return {play:play.top,arrow:arrow.top};
  });
  assert.ok(positions.arrow>positions.play+40,'Narrow remote should wrap the arrows to the second row');
  console.log('PASS: portrait placement, compact controls, large arrow icons, small-screen layout, 48px touch targets');
  await host.setViewportSize({width:1024,height:1536});
  await host.waitForFunction(()=>{
    const box=document.getElementById('ls26PrompterRemote').getBoundingClientRect();
    return box.left>195&&box.right<750&&window.innerHeight-box.bottom>=175&&window.innerHeight-box.bottom<=195;
  });
  const original=await host.locator('#ls26PrompterRemote').boundingBox();
  const header=await host.locator('.ls26-prompter-remote-head').boundingBox();
  await host.mouse.move(header.x+55,header.y+header.height/2);
  await host.mouse.down();
  await host.mouse.move(header.x+125,header.y+header.height/2-65,{steps:5});
  await host.mouse.up();
  const moved=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(moved.x>original.x+45&&moved.y<original.y-40,'Title drag repositions card');
  const saved=await host.evaluate(()=>JSON.parse(localStorage.getItem('ls26:prompter-remote-bottom-position-v4')));
  const movedBottom=1536-moved.y-moved.height;
  assert.ok(Math.abs(saved.x-moved.x)<2&&Math.abs(saved.bottom-movedBottom)<2,'Drag bottom offset saved');
  assert.equal(await host.locator('#ls26PrompterRemote').evaluate(el=>el.style.top),'auto','Dragged card never uses a top anchor');
  await host.setViewportSize({width:1024,height:1400});
  const duringToolbarResize=await host.locator('#ls26PrompterRemote').boundingBox();
  const toolbarBottom=1400-duringToolbarResize.y-duringToolbarResize.height;
  assert.ok(Math.abs(duringToolbarResize.x-moved.x)<1&&Math.abs(toolbarBottom-movedBottom)<1,
    'Chrome top-toolbar collapse must not move a dragged card relative to bottom dock');
  await host.setViewportSize({width:1024,height:1536});
  const fresh=await context.newPage();
  await fresh.setViewportSize({width:1024,height:1536});
  await fresh.goto('http://remote.test/ls26try/host/lyricview.html');
  await fresh.setContent('<style>'+css+'</style><input type="checkbox" id="ls26ShowKaraoke" checked>');
  await fresh.addScriptTag({content:hostScript});
  const restored=await fresh.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs(restored.x-moved.x)<2&&Math.abs((1536-restored.y-restored.height)-movedBottom)<2,'Reload restores bottom-anchored card position');
  await fresh.setViewportSize({width:350,height:560});
  await fresh.waitForFunction(()=>{
    const rect=document.getElementById('ls26PrompterRemote').getBoundingClientRect();
    return rect.left>=7&&rect.right<=window.innerWidth-7;
  },{timeout:2000});
  const clamp=await fresh.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(clamp.x>=7&&clamp.x+clamp.width<=343,'Card stays within resized screen');
  await fresh.close();
  // Migrate the saved TOP pixel positions from the previous release.
  // After migration the remote must use only a bottom anchor.
  const migration=await context.newPage();
  await migration.setViewportSize({width:1024,height:1536});
  await migration.goto('http://remote.test/ls26try/host/lyricview.html');
  await migration.setContent('<style>'+css+'</style><input type="checkbox" id="ls26ShowKaraoke" checked>');
  await migration.evaluate(()=>{
    localStorage.removeItem('ls26:prompter-remote-bottom-position-v4');
    localStorage.setItem('ls26:prompter-remote-fixed-position-v3',JSON.stringify({x:255,y:1010}));
  });
  await migration.addScriptTag({content:hostScript});
  const migrated=await migration.locator('#ls26PrompterRemote').boundingBox();
  const migratedSaved=await migration.evaluate(()=>JSON.parse(localStorage.getItem('ls26:prompter-remote-bottom-position-v4')));
  assert.ok(Math.abs(migrated.x-255)<1&&Math.abs(migrated.y-1010)<1,'Earlier dragged position migrates intact');
  assert.ok(Math.abs(migratedSaved.bottom-(1536-migrated.y-migrated.height))<2,'Migration creates bottom position, not another top position');
  assert.equal(await migration.locator('#ls26PrompterRemote').evaluate(el=>el.style.top),'auto');
  await migration.setViewportSize({width:1024,height:1400});
  const migratedAfter=await migration.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs((1400-migratedAfter.y-migratedAfter.height)-(1536-migrated.y-migrated.height))<1,
    'Migrated position stays bottom-stationary when Chrome top chrome collapses');
  await migration.close();
  console.log('PASS: saved top position migrates into stable bottom anchored position');
  // A separate sticky Karaoke Tools bar moves according to its own layout.
  // The remote must keep exactly the same viewport coordinates as the page scrolls.
  await host.evaluate(()=>{
    const spacer=document.createElement('div');spacer.id='lyricScrollTestSpacer';
    spacer.style.height='3500px';document.body.append(spacer);
    const top=document.createElement('div');top.id='karaokeToolsTestBar';
    top.style.cssText='position:sticky;top:0;height:35px;background:#123';
    top.textContent='Karaoke Tools';document.body.prepend(top);
    window.scrollTo(0,0);
  });
  await host.waitForFunction(()=>window.scrollY===0);
  const atTop=await host.locator('#ls26PrompterRemote').boundingBox();
  await host.evaluate(()=>window.scrollTo(0,230));
  await host.waitForFunction(()=>window.scrollY>=200);
  await host.setViewportSize({width:1024,height:1400});
  const afterScroll=await host.locator('#ls26PrompterRemote').boundingBox();
  assert.ok(Math.abs((1400-afterScroll.y-afterScroll.height)-(1536-atTop.y-atTop.height))<1 &&
    Math.abs(afterScroll.x-atTop.x)<1,
    'Remote must stay stationary relative to bottom dock as lyrics scroll and Chrome top bars hide');
  await host.evaluate(()=>window.scrollTo(0,0));
  console.log('PASS: remote remains independently fixed during page scroll');
  console.log('PASS: drag from title only, persisted bottom offset, reload, resize clamp');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
