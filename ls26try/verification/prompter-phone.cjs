/* Independent phone and singer tablet browser contexts, sharing only the
 * existing karaokeControl/liveLyrics command contract.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(require.resolve("playwright",{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,".."),load=p=>fs.readFileSync(path.join(root,p),"utf8");
const sender=load("host/js/lyricview-prompter-remote.js");
const receiver=load("oldadmin/host/lyrics/prompter-remote-receiver.js");
const controller=load("admin-new/js/prompter-remote-phone.js");
const css=load("host/css/lyricview-prompter-remote.css")+"\n"+load("admin-new/css/prompter-remote-phone.css");
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync("/usr/bin/chromium")?{executablePath:"/usr/bin/chromium"}:{}),args:["--no-sandbox"]});
 try{
  const sourceCtx=await browser.newContext(),targetCtx=await browser.newContext();
  const phone=await sourceCtx.newPage(),singer=await targetCtx.newPage();
  const route=r=>r.fulfill({status:200,body:"<!doctype html><html><body></body></html>",contentType:"text/html"});
  await sourceCtx.route("http://phone.remote.test/**",route);
  await targetCtx.route("http://phone.remote.test/**",route);
  await phone.goto("http://phone.remote.test/ls26try/admin-new/prompter-remote.html");
  await singer.goto("http://phone.remote.test/ls26try/oldadmin/host/lyrics/song.html");
  await phone.setViewportSize({width:390,height:800});
  await phone.setContent([
   '<body class="admin-body phone-remote-page">',
   '<button id="phoneMenuBackdrop" hidden></button>',
   '<button id="phoneMenuToggle" aria-expanded="false"></button>',
   '<div id="sidebarContainer"></div>',
   '<main class="phone-remote-main"><div id="phoneRemoteLogin"></div>',
   '<section id="phoneRemoteController" hidden><div id="phonePrompterRemoteMount"></div></section>',
   '<input type="checkbox" id="ls26ShowPrompterRemote" hidden></main>'
  ].join(""));
  await phone.addStyleTag({content:css});
  await singer.setContent('<button id="scrollToggleBtn">▶</button><span id="scrollSpeedDisplay">0.80x</span><button id="prompterScrollUp"></button><button id="prompterScrollDown"></button>');
  await singer.evaluate(()=>{
   window.__actions=[];window.autoScrollActive=false;
   window.stopAutoScroll=()=>{window.autoScrollActive=false;document.getElementById("scrollToggleBtn").textContent="▶";};
   window.toggleAutoScroll=()=>{
    const el=document.getElementById("scrollToggleBtn");
    el.textContent=el.textContent==="▶"?"⏸":"▶";
    window.autoScrollActive=el.textContent==="⏸";window.__actions.push("toggle");
   };
   window.changeScrollSpeed=d=>{
    const el=document.getElementById("scrollSpeedDisplay");
    el.textContent=(Math.round((parseFloat(el.textContent)+d)*100)/100).toFixed(2)+"x";
    window.__actions.push(d>0?"faster":"slower");
   };
   for(const direction of ["Up","Down"])document.getElementById("prompterScroll"+direction).onclick=()=>window.__actions.push(direction.toLowerCase());
   window.db={collection(name){
    if(name!=="karaokeControl")throw Error(name);
    return{doc(id){
     if(id!=="liveLyrics")throw Error(id);
     return{onSnapshot(fn){
      window.__deliverPhoneRemote=p=>fn({exists:true,data:()=>({prompterRemoteCommand:p})});
      fn({exists:false});return()=>{window.__deliverPhoneRemote=null;};
     }};
    }};
   }};
  });
  await singer.addScriptTag({content:receiver});
  const writes=[];
  await phone.exposeFunction("__submitPhoneRemote",async (packet,merge)=>{
   assert.equal(merge,true);writes.push(packet);
   await singer.evaluate(p=>window.__deliverPhoneRemote(p),packet);
  });
  await phone.evaluate(()=>{
   window.__isOwner=false;window.isOwner=()=>window.__isOwner;
   window.LK={
    auth:{onAuthStateChanged(fn){window.__phoneAuth=fn;fn(null);}},
    db:{collection(name){
     if(name!=="karaokeControl")throw Error(name);
     return{doc(id){
      if(id!=="liveLyrics")throw Error(id);
      return{set:(data,options)=>window.__submitPhoneRemote(data.prompterRemoteCommand,options?.merge===true)};
     }};
    }}
   };
  });
  await phone.addScriptTag({content:sender});
  await phone.addScriptTag({content:controller});
  assert.equal(await phone.locator("#ls26PrompterRemote").isVisible(),false,"signed-out user cannot operate remote");
  await phone.evaluate(()=>{window.__isOwner=true;window.__phoneAuth({email:"owner@example.com"});});
  await phone.waitForFunction(()=>document.getElementById("ls26PrompterRemote")?.hidden===false);
  assert.equal(await phone.locator("#ls26PrompterRemote").evaluate(el=>el.parentElement?.id),"phonePrompterRemoteMount");
  assert.equal(await phone.locator("#phoneRemoteController").isVisible(),true);
  assert.equal(await phone.locator("#ls26PrompterRemote .ls26-prompter-remote-controls button").count(),5);
  const bounds=await phone.locator("#ls26PrompterRemote").boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,"remote fits phone screen");
  const heights=await phone.locator("#ls26PrompterRemote button").evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
  assert.ok(heights.every(h=>h>=58),"all controls are large touch targets");
  await singer.evaluate(()=>window.dispatchEvent(new CustomEvent("ls26:prompter-song-changed",{
   detail:{songId:"demo-song",cue:true,title:"All the Small Things"}
  })));
  await singer.waitForFunction(()=>document.body.dataset.ls26SingerStage==="waiting");
  const press=async(action,predicate)=>{
   await phone.locator('#ls26PrompterRemote button[data-remote="'+action+'"]').click();
   await singer.waitForFunction(predicate);
  };
  await press("song",()=>document.body.dataset.ls26SingerStage==="running");
  assert.equal(await singer.locator("#scrollToggleBtn").textContent(),"▶","START SONG doesn't start scrolling");
  await press("toggle",()=>document.getElementById("scrollToggleBtn").textContent==="⏸");
  await press("faster",()=>document.getElementById("scrollSpeedDisplay").textContent==="0.90x");
  await press("slower",()=>document.getElementById("scrollSpeedDisplay").textContent==="0.80x");
  await press("up",()=>window.__actions.includes("up"));
  await press("down",()=>window.__actions.includes("down"));
  await press("instrumental",()=>document.body.dataset.ls26SingerStage==="instrumental");
  await press("instrumental",()=>document.body.dataset.ls26SingerStage==="running");
  await press("song",()=>document.body.dataset.ls26SingerStage==="ended");
  assert.deepEqual(writes.map(packet=>packet.action),["song","toggle","faster","slower","up","down","instrumental","instrumental","song"]);
  assert.equal(new Set(writes.map(packet=>packet.id)).size,writes.length,"each phone press sends one unique command");
  assert.deepEqual(await singer.evaluate(()=>window.__actions),["toggle","faster","slower","up","down","toggle"]);
  await phone.evaluate(()=>window.__phoneAuth(null));
  assert.equal(await phone.locator("#ls26PrompterRemote").isVisible(),false,"signing out hides remote");
  console.log("PASS: phone layout, owner sign-in, reuse, nine cross-tablet commands, stage and scroll controls");
  await sourceCtx.close();await targetCtx.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
