/* Separate devices: phone, LyricView and singer each have independent browser
 * storage. Firestore liveLyrics is the ONLY cross-device transport.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(require.resolve("playwright",{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,".."),load=p=>fs.readFileSync(path.join(root,p),"utf8");
const sender=load("host/js/lyricview-prompter-remote.js");
const receiver=load("oldadmin/host/lyrics/prompter-remote-receiver.js");
const phoneController=load("admin-new/js/prompter-remote-phone.js");
const phoneCss=load("host/css/lyricview-prompter-remote.css")+"\n"+load("admin-new/css/prompter-remote-phone.css");
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync("/usr/bin/chromium")?{executablePath:"/usr/bin/chromium"}:{}),args:["--no-sandbox"]});
 try{
  const hostCtx=await browser.newContext(),phoneCtx=await browser.newContext(),singerCtx=await browser.newContext();
  const host=await hostCtx.newPage(),phone=await phoneCtx.newPage(),singer=await singerCtx.newPage();
  const clients=[host,phone,singer];let documentData={},writes=[];
  for(const ctx of [hostCtx,phoneCtx,singerCtx])
   await ctx.route("http://remote-state.test/**",r=>r.fulfill({status:200,body:"<!doctype html><html><body></body></html>",contentType:"text/html"}));
  await host.goto("http://remote-state.test/ls26try/host/lyricview.html");
  await phone.goto("http://remote-state.test/ls26try/admin-new/prompter-remote.html");
  await singer.goto("http://remote-state.test/ls26try/oldadmin/host/lyrics/song.html");
  await host.setContent('<input id="ls26ShowPrompterRemote" type="checkbox" checked>');
  await phone.setViewportSize({width:390,height:820});
  await phone.setContent([
   '<body class="phone-remote-page"><button id="phoneMenuBackdrop" hidden></button><button id="phoneMenuToggle"></button>',
   '<div id="sidebarContainer"></div><section id="phoneRemoteController" hidden>',
   '<strong id="phoneRemoteSongTitle"></strong><p id="phoneRemoteSongArtist"></p><small id="phoneRemoteSongStage"></small>',
   '<div id="phonePrompterRemoteMount"></div></section><div id="phoneRemoteLogin"></div>',
   '<input id="ls26ShowPrompterRemote" type="checkbox" hidden>'
  ].join(""));
  await phone.addStyleTag({content:phoneCss});
  await singer.setContent('<div id="songTitle"></div><div id="autoScrollControls"><button id="scrollToggleBtn">▶</button><div id="scrollSpeedDisplay">0.80x</div></div><button id="prompterScrollUp"></button><button id="prompterScrollDown"></button>');
  await singer.evaluate(()=>{
   window.autoScrollActive=false;window.__actions=[];
   window.stopAutoScroll=()=>{window.autoScrollActive=false;document.getElementById("scrollToggleBtn").textContent="▶";};
   window.toggleAutoScroll=()=>{
    window.autoScrollActive=!window.autoScrollActive;
    document.getElementById("scrollToggleBtn").textContent=window.autoScrollActive?"⏸":"▶";
    window.__actions.push("toggle");
   };
   window.changeScrollSpeed=d=>{
    const el=document.getElementById("scrollSpeedDisplay");
    el.textContent=(Math.round((parseFloat(el.textContent)+d)*100)/100).toFixed(2)+"x";
   };
   document.getElementById("scrollToggleBtn").onclick=window.toggleAutoScroll;
   for(const direction of ["Up","Down"])
    document.getElementById("prompterScroll"+direction).onclick=()=>window.__actions.push(direction.toLowerCase());
   window.firebase={auth:()=>({currentUser:{uid:"owner"}})};
  });
  for(const page of clients){
   await page.exposeFunction("__dbWrite",async changes=>{
    writes.push({...changes});
    documentData={...documentData,...changes};
    for(const target of clients)
     await target.evaluate(data=>window.__dbDeliver?.(data),documentData);
   });
   await page.evaluate(()=>{
    const ref={
     set:(data,options)=>{
      if(options?.merge!==true)throw Error("Live remote must use merge writes");
      return window.__dbWrite(data);
     },
     onSnapshot(fn){
      window.__dbDeliver=data=>fn({exists:true,data:()=>data});
      fn({exists:false,data:()=>({})});
      return ()=>{window.__dbDeliver=null;};
     }
    };
    window.db={collection(name){if(name!=="karaokeControl")throw Error(name);return{doc(id){
     if(id!=="liveLyrics")throw Error(id);return ref;
    }};}};
    window.LK={...(window.LK||{}),db:window.db};
   });
  }
  await phone.evaluate(()=>{
   window.isOwner=()=>true;
   window.LK.auth={onAuthStateChanged(fn){window.__phoneAuth=fn;fn({uid:"owner"});}};
  });
  await singer.addScriptTag({content:receiver});
  await host.addScriptTag({content:sender});
  await phone.addScriptTag({content:sender});
  await phone.addScriptTag({content:phoneController});
  const status=async(page,value)=>page.waitForFunction(x=>document.querySelector("#ls26PrompterSongCue")?.textContent===x,value);
  const play=async(page,value)=>page.waitForFunction(x=>document.querySelector("#ls26PrompterRemotePlay")?.textContent===x,value);
  async function cue(id,title,artist,token){
   await host.evaluate(async song=>window.db.collection("karaokeControl").doc("liveLyrics").set({
    prompterLyricsSource:"modern",prompterSongId:song.id,prompterSongTitle:song.title,
    prompterSongArtist:song.artist,prompterRequestToken:song.token,
    prompterRemoteState:{v:1,kind:"state",origin:"host-cue",id:"cue-"+song.token,
      mode:"waiting",playing:false,at:Date.now(),songId:song.id,title:song.title,artist:song.artist}
   },{merge:true}),{id,title,artist,token});
   await singer.evaluate(song=>window.dispatchEvent(new CustomEvent("ls26:prompter-song-changed",{
    detail:{songId:song.id,title:song.title,artist:song.artist,cue:true}
   })),{id,title,artist});
   await status(host,"START SONG");await status(phone,"START SONG");
   await phone.waitForFunction(x=>document.getElementById("phoneRemoteSongTitle")?.textContent===x,title);
  }
  const action=async(page,type)=>page.locator('#ls26PrompterRemote [data-remote="'+type+'"]').click();
  await cue("song-1","All the Small Things","Blink-182","cue-one");
  assert.equal(await phone.locator("#phoneRemoteSongArtist").textContent(),"Blink-182");
  await action(phone,"song");await status(host,"END SONG");
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="running");
  assert.equal(await singer.locator("#scrollToggleBtn").textContent(),"▶","START SONG does not autoscroll");
  await action(host,"toggle");await play(phone,"■");
  await singer.waitForFunction(()=>document.getElementById("scrollToggleBtn").textContent==="⏸");
  await action(phone,"instrumental");await status(host,"END SONG");
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="instrumental");
  await play(host,"▶");await play(phone,"▶");
  await action(host,"instrumental");
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="running");
  await play(phone,"■");
  await action(phone,"song");await status(host,"START AGAIN");await status(phone,"START AGAIN");
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="ended");
  await play(host,"▶");await play(phone,"▶");
  await singer.evaluate(()=>window.dispatchEvent(new CustomEvent("ls26:prompter-feedback-complete")));
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="idle");
  await host.waitForFunction(()=>document.getElementById("ls26PrompterSongCue").disabled===true);
  await phone.waitForFunction(()=>document.getElementById("ls26PrompterSongCue").disabled===true);
  await cue("song-2","Wonderwall","Oasis","cue-two");
  await phone.waitForFunction(()=>document.getElementById("phoneRemoteSongStage").textContent==="Ready to start");
  await action(host,"song");await status(phone,"END SONG");
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="running");
  await singer.locator("#scrollToggleBtn").click();
  await play(host,"■");await play(phone,"■");
  assert.equal(await phone.locator("#phoneRemoteSongTitle").textContent(),"Wonderwall");
  assert.equal(await phone.locator("#phoneRemoteSongArtist").textContent(),"Oasis");
  assert.ok(writes.filter(v=>v.prompterRemoteState).length>=7);
  assert.ok(writes.every(v=>!v.prompterRemoteCommand || v.prompterRemoteCommand.v===1));
  console.log("PASS: three-device shared END/START, PLAY, HOLD/RESUME, manual singer scrolling, feedback reset and current song");
  await hostCtx.close();await phoneCtx.close();await singerCtx.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
