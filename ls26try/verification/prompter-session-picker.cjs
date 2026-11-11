const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const receiver=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-remote-receiver.js'),'utf8');
const picker=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-session-picker.js'),'utf8');
const compat=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/song-compat.js'),'utf8');
const css=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/prompter-end-rating.css'),'utf8');
const html=fs.readFileSync(path.join(root,'oldadmin/host/lyrics/song.html'),'utf8');
assert.match(html,/prompter-session-picker\.js\?v=20261111-session-picker-v1/);
assert.match(html,/song-compat\.js\?v=20261111-session-picker-v1/);
assert.match(compat,/window\.LS26PrompterSelectSong/);
assert.match(receiver,/picker===true/);
(async()=>{
  const browser=await chromium.launch({headless:true,
    ...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:960,height:1500}});
    await context.route('http://picker.test/**',route=>route.fulfill({status:200,body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
    const page=await context.newPage();
    await page.goto('http://picker.test/ls26try/oldadmin/host/lyrics/song.html?id=demo&slave=1');
    await page.setContent('<div id="songTitle"><div class="song-main-title">Demo</div></div><button id="scrollToggleBtn">▶</button><span id="scrollSpeedDisplay">0.80x</span>');
    await page.addStyleTag({content:css});
    await page.evaluate(()=>{
      window.songs=[{url:'lyrics/song.html?id=legacy-one',title:'Legacy One',artist:'Legacy Artist'}];
      window.__fixture={
        control:{active:true,sessionId:'session-1'},
        session:{setlistId:'set-1',setlistSongIds:['modern-1','legacy-one']},
        list:{name:'Tonight Setlist',songIds:['modern-1','legacy-one']},
        songs:{'modern-1':{title:'Modern Song',artist:'Modern Artist',sections:[{type:'verse',lines:[]}]}}
      };
      window.__reads=[];window.__chosen=[];
      window.firebase={firestore:{FieldPath:{documentId:()=> '__name__'}}};
      window.db={collection(name){
        return {
          doc(id){return{
            async get(){window.__reads.push(name+'/'+id);
              const data=name==='karaokeControl'?window.__fixture.control:
                name==='performanceSessions'?window.__fixture.session:
                name==='lyricsSetlists'?window.__fixture.list:null;
              return {exists:!!data,data:()=>data};
            },
            onSnapshot(){return()=>{};}
          }},
          where(field,operator,ids){
            assert;
            return{async get(){
              window.__reads.push('lyrics:batch:'+ids.length);
              return{docs:ids.filter(id=>window.__fixture.songs[id]).map(id=>({
                id,data:()=>window.__fixture.songs[id]
              }))};
            }};
          }
        };
      }};
      window.stopAutoScroll=()=>{document.getElementById('scrollToggleBtn').textContent='▶';};
      window.LS26PrompterSelectSong=async(id,format)=>{
        window.__chosen.push({id,format});
        history.replaceState(null,'','?id='+encodeURIComponent(id)+'&slave=1');
        dispatchEvent(new CustomEvent('ls26:prompter-song-changed',{
          detail:{songId:id,title:id,artist:'Test',source:format,cue:false,picker:true}
        }));
        return true;
      };
    });
    await page.addScriptTag({content:receiver});
    await page.addScriptTag({content:picker});
    const open=page.locator('#ls26SingerLibraryLink');
    assert.equal(await open.getAttribute('href'),null,'List icon opens a modal rather than navigating');
    await open.click();
    const modal=page.locator('#ls26SessionSongPicker');
    await modal.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelectorAll('.ls26-session-picker-song').length===2);
    assert.equal(await page.locator('#ls26PickerSetlistName').textContent(),'Tonight Setlist');
    assert.deepEqual(await page.locator('.ls26-session-picker-song strong').allTextContents(),['Legacy One','Modern Song']);
    assert.equal(await page.locator('#ls26PickerCount').textContent(),'2 / 2');
    assert.equal(await page.locator('#ls26PickerSearch').isVisible(),true);
    await page.locator('#ls26PickerSearch').fill('modern');
    assert.equal(await page.locator('.ls26-session-picker-song').count(),1);
    await page.locator('.ls26-session-picker-song').click();
    await page.waitForFunction(()=>document.body.dataset.ls26SingerStage==='running');
    assert.equal(await modal.isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>window.__chosen),[{id:'modern-1',format:'modern'}]);
    assert.equal(new URL(page.url()).searchParams.get('slave'),'1','Retain slave mode');
    assert.equal(await page.locator('#scrollToggleBtn').textContent(),'▶','Picker does not start autoscroll');
    const reads=await page.evaluate(()=>window.__reads);
    assert.deepEqual(reads,['karaokeControl/currentSession','performanceSessions/session-1','lyricsSetlists/set-1','lyrics:batch:2']);
    await page.evaluate(()=>document.body.dataset.ls26SingerStage='idle');
    await open.click();
    await page.waitForFunction(()=>document.querySelectorAll('.ls26-session-picker-song').length===2);
    await page.locator('.ls26-session-picker-song').first().click();
    assert.deepEqual(await page.evaluate(()=>window.__chosen).then(x=>x[1]),{id:'legacy-one',format:'legacy'});
    assert.equal(await page.locator('#scrollToggleBtn').textContent(),'▶');
    await page.evaluate(()=>document.body.dataset.ls26SingerStage='idle');
    await open.click();
    await page.locator('#ls26PickerClose').click();
    assert.equal(await modal.isVisible(),false,'Close button works');
    await page.evaluate(()=>{window.__fixture.control={active:false,sessionId:''};});
    await open.click();
    await page.waitForFunction(()=>document.getElementById('ls26PickerStatus').textContent.includes('No active performance session.'));
    assert.equal(await page.locator('.ls26-session-picker-song').count(),0,'No unrelated catalogue fallback');
    assert.equal(await modal.isVisible(),true);
    await browser.close();
    console.log('PASS: session picker, search, modern/legacy loading, no autoscroll, no fallback, close, and read-only metadata');
  }catch(error){await browser.close();throw error;}
})().catch(error=>{console.error(error);process.exitCode=1;});
