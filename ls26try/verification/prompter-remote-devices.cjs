/* Separate Chromium browser contexts (independent tablets) sharing only a
 * simulated Firestore liveLyrics document. No BC/localStorage cross-context. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const sender=fs.readFileSync(path.join(root,'host/js/lyricview-prompter-remote.js'),'utf8');
const receiver=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-remote-receiver.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const sourceCtx=await browser.newContext(),targetCtx=await browser.newContext();
  const host=await sourceCtx.newPage(),target=await targetCtx.newPage();
  const route=r=>r.fulfill({status:200,body:'<!doctype html><html><body></body></html>',contentType:'text/html'});
  await sourceCtx.route('http://remote-device.test/**',route);
  await targetCtx.route('http://remote-device.test/**',route);
  await host.goto('http://remote-device.test/ls26try/host/lyricview.html');
  await target.goto('http://remote-device.test/ls26try/oldadmin/host/lyrics/song.html');
  await host.setContent('<input type="checkbox" id="ls26ShowKaraoke" checked>');
  await target.setContent('<button id="scrollToggleBtn">▶</button><span id="scrollSpeedDisplay">0.80x</span><button id="prompterScrollUp"></button><button id="prompterScrollDown"></button>');
  await target.evaluate(()=>{
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
    window.changeScrollSpeed=d=>{
      const el=document.getElementById('scrollSpeedDisplay');
      el.textContent=(Math.round((parseFloat(el.textContent)+d)*100)/100).toFixed(2)+'x';
      window.__actions.push(d>0?'faster':'slower');
    };
    for(const direction of ['Up','Down'])
      document.getElementById('prompterScroll'+direction).onclick=()=>window.__actions.push(direction.toLowerCase());
    window.db={collection(name){
      if(name!=='karaokeControl')throw Error(name);
      return{doc(id){
        if(id!=='liveLyrics')throw Error(id);
        return{onSnapshot(fn){
          window.__deliverRemote=p=>fn({exists:true,data:()=>({prompterRemoteCommand:p})});
          fn({exists:false}); // baseline, not a fresh command
          return()=>{window.__deliverRemote=null};
        }};
      }};
    }};
  });
  const writes=[];let deny=false;
  await host.exposeFunction('__testRemoteWrite',async (packet,merge)=>{
    if(deny)throw Error('permission-denied');
    assert.equal(merge,true);
    assert.ok(['song','instrumental','toggle','slower','faster','up','down'].includes(packet.action));
    writes.push(packet);
    await target.evaluate(p=>window.__deliverRemote(p),packet);
  });
  await host.evaluate(()=>{
    window.db={collection(name){
      if(name!=='karaokeControl')throw Error(name);
      return{doc(id){
        if(id!=='liveLyrics')throw Error(id);
        return{set:(fields,opts)=>window.__testRemoteWrite(fields.prompterRemoteCommand,opts?.merge===true)};
      }};
    }};
  });
  await target.addScriptTag({content:receiver});
  await host.addScriptTag({content:sender});
  await target.evaluate(()=>window.dispatchEvent(new CustomEvent('ls26:prompter-song-changed',{
    detail:{songId:'demo',cue:true,title:'Demo Song',artist:'Demo Artist',year:2001}
  })));
  assert.equal(writes.length,0,'Initial ready check must not write to Firestore');
  assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶');
  const expected=['song','toggle','faster','slower','up','down','toggle'];
  const executed=['toggle','faster','slower','up','down','toggle'];
  for(let i=0;i<expected.length;i++){
    await host.locator('[data-remote="'+expected[i]+'"]').click();
    if(i===0){
      await target.waitForFunction(()=>document.body.dataset.ls26SingerStage==='running');
      assert.equal(await target.locator('#scrollToggleBtn').textContent(),'▶','START SONG does not start scrolling on another tablet');
      assert.equal(await target.evaluate(()=>window.autoScrollActive),false);
      assert.equal(await target.evaluate(()=>window.__actions.length),0,'No implicit remote Play on START SONG');
      assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶');
    }else{
      await target.waitForFunction(n=>window.__actions.length===n,i);
    }
    if(i===1)assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'■');
    if(i===2)assert.equal(await target.locator('#scrollSpeedDisplay').textContent(),'0.90x','Remote + must advance by 0.10x');
    if(i===3)assert.equal(await target.locator('#scrollSpeedDisplay').textContent(),'0.80x','Remote - must decrease by 0.10x');
    if(i===6)assert.equal(await host.locator('#ls26PrompterRemotePlay').textContent(),'▶');
  }
  assert.deepEqual(await target.evaluate(()=>window.__actions),executed);
  assert.deepEqual(writes.map(p=>p.action),expected,'One merged write per press');
  await target.evaluate(p=>window.__deliverRemote(p),writes.at(-1));
  assert.equal((await target.evaluate(()=>window.__actions)).length,executed.length,'No duplicate execution');
  assert.equal(await host.locator('#ls26PrompterRemoteStatus').textContent(),'Sent via Firestore','Do not claim device acknowledgement');
  deny=true;
  await host.locator('[data-remote="faster"]').click();
  await host.waitForFunction(()=>document.getElementById('ls26PrompterRemoteStatus').textContent.includes('Sync failed'));
  assert.equal((await target.evaluate(()=>window.__actions)).length,executed.length);
  console.log('PASS: separate-tablet buttons, ordered writes, dedupe, first-snapshot guard, failure feedback');
  await sourceCtx.close();await targetCtx.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
