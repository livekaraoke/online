/* Real-browser layout regression for the LiveSuite Library header.
 * Uses the current HTML/CSS with a static BEST NEXT fixture; no Firebase access.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const document=parseHTML(read('library.html')).document;
const mount=document.querySelector('#libraryRecommendationTools');
assert.ok(mount,'recommendation tools missing');
const preview=document.createElement('button');
preview.id='bestNextOpen';
preview.innerHTML='<strong>BEST NEXT</strong><span class="best-next-title">Be Yourself</span><b>55</b><small>FRESH · partial history</small>';
mount.prepend(preview);
const html='<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>:root{--ls-bg:#00131e;--ls-panel:#052536;--ls-text:#eefaff;--ls-muted:#9db8c8;--ls-accent:#00cafa;--ls-success:#00e88a;--ls-border:#24536b;--ls-soft:#153042}'+
 read('shared/library.css')+'\n'+read('shared/best-next.css')+'</style></head>'+
 '<body class="library-page"><main class="library-shell">'+document.querySelector('.library-heading').outerHTML+
 document.querySelector('.library-browse-row').outerHTML+'</main></body></html>';
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
(async()=>{
 const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:['--no-sandbox']});
 try{
  for(const width of [760,800,1024,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   try{
    await page.setContent(html);
    const boxes=await page.evaluate(()=>{
     const names={title:'.library-heading-copy',search:'#searchInput',filters:'#sidebarToggleBtn',add:'.library-heading-actions .library-button',export:'#exportBtn',setlist:'#setlistFilter',best:'#bestNextOpen',rotation:'#rotationFilter'};
     const rect={};for(const [name,sel]of Object.entries(names)){const el=document.querySelector(sel);if(!el)throw Error('Missing '+sel);const b=el.getBoundingClientRect();rect[name]={left:b.left,right:b.right,top:b.top,width:b.width,height:b.height};}
     return {rect,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth};
    });
    const b=boxes.rect,aligned=(a,c)=>Math.abs(b[a].top-b[c].top)<3;
    assert.ok(aligned('title','search')&&aligned('search','filters')&&aligned('filters','add')&&aligned('add','export'),width+': heading controls stacked unexpectedly');
    assert.ok(aligned('setlist','best')&&aligned('best','rotation'),width+': recommendation row stacked unexpectedly');
    assert.ok(b.title.right<=b.search.left+2&&b.search.right<=b.filters.left+2&&b.filters.right<=b.add.left+2&&b.add.right<=b.export.left+2,width+': heading overlap');
    assert.ok(b.setlist.right<=b.best.left+2&&b.best.right<=b.rotation.left+2,width+': browse row overlap');
    assert.ok(b.search.width>=100&&b.setlist.width>=65&&b.best.width>=100,width+': touch layout too compressed');
    assert.ok(boxes.scrollWidth<=boxes.innerWidth+2,width+': unexpected horizontal overflow '+boxes.scrollWidth);
    console.log('PASS: Library heading and browsing controls align without overflow at '+width+' CSS px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
