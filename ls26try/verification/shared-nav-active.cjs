/* LiveSuite active-tab route regression: exercise shared shell and computed theme in Chromium.
 * No Firebase, live browser access or repository writes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sharedShell=read('shared/shell.js'),sharedTheme=read('shared/theme.css');
const setlist=read('host/setlist-editor.html'),setlistCss=read('host/css/setlist-editor-theme.css');
assert.ok(!setlist.includes('‹ LYRICS VIEWER'),'Redundant Lyrics Viewer button remains');
assert.ok(!setlist.includes('href="lyricsviewer.html"'),'Redundant Lyrics Viewer link remains');
for(const source of ['library.html','host/lyricsviewer.html','host/lyricview.html','host/setlist-editor.html']){
 assert.match(read(source),/shared\/shell\.js\?v=20261022-nav-route-v2/,'Navigation cache version mismatch in '+source);
}
const cases=[
 ['/ls26try/library','Library'],['/ls26try/library.html','Library'],['/ls26try/library/','Library'],
 ['/ls26try/host/lyricsviewer','Library'],['/ls26try/host/lyricsviewer.html','Library'],
 ['/ls26try/host/lyricview','LyricView'],['/ls26try/host/lyricview.html?id=test','LyricView'],
 ['/ls26try/host/lyricview/','LyricView'],
 ['/ls26try/host/setlist-editor','Setlists'],['/ls26try/host/setlist-editor.html','Setlists'],['/ls26try/host/setlist-editor/','Setlists'],
 ['/ls26try/requests','Requests'],['/ls26try/requests.html','Requests']
];
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+sharedTheme+'</style></head><body><div id="topStatusContainer"></div><script>window.LS26Data={invalidate(){}};window.ArtistNames={display:v=>v};</script><script src="/ls26try/shared/shell.js?v=20261022-nav-route-v2"></script></body></html>';
const browserExe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
(async()=>{
 const browser=await chromium.launch({headless:true,...(browserExe?{executablePath:browserExe}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:800}});
  await page.route('https://livesuite.test/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/ls26try/shared/shell.js')return route.fulfill({status:200,contentType:'text/javascript',body:sharedShell});
   if(pathname.startsWith('/ls26try/')&&!(pathname.endsWith('.js')||pathname.endsWith('.css')||pathname.endsWith('.png')))return route.fulfill({status:200,contentType:'text/html',body:html});
   return route.fulfill({status:200,contentType:'text/javascript',body:'/* synthetic test-only dependency */'});
  });
  for(const [url,label] of cases){
   await page.goto('https://livesuite.test'+url,{waitUntil:'domcontentloaded'});
   await page.waitForSelector('.ls26-nav');
   const nav=await page.evaluate(()=>{
    const all=[...document.querySelectorAll('.ls26-nav > a')];
    const active=all.filter(x=>x.getAttribute('aria-current')==='page');
    const current=active[0];return {count:active.length,label:current?.textContent.trim(),className:current?.className,background:current?getComputedStyle(current).backgroundColor:'',border:current?getComputedStyle(current).borderTopColor:'',othersActive:all.filter(x=>x.classList.contains('active')).length};
   });
   assert.equal(nav.count,1,url+': expected exactly one aria-current');
   assert.equal(nav.othersActive,1,url+': exactly one active class');
   assert.equal(nav.label.replace(/^.[ ]*/,''),label,url+': wrong active navigation item: '+nav.label);
   assert.equal(nav.border,'rgb(0, 202, 250)',url+': missing cyan border');
   assert.equal(nav.background,'rgb(7, 54, 74)',url+': missing navy/cyan highlight');
   console.log('PASS navigation '+url+' => '+label);
  }
  // Use actual Setlist Editor header CSS and markup to check the removed button did not leave an empty grid column.
  const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
  const doc=parseHTML(setlist).document;const header=doc.querySelector('.app-topbar');
  assert.ok(header);assert.equal(header.children.length,3,'Setlist header should contain title, signed-in state, New Setlist');
  const markup='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+sharedTheme+'\n'+read('host/css/lyrics-suite.css')+'\n'+setlistCss+'</style></head><body class="setlist-page">'+header.outerHTML+'</body></html>';
  for(const width of [390,760,960,1280]){
   await page.setViewportSize({width,height:850});
   await page.setContent(markup);
   const geom=await page.evaluate(()=>{
    const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    return {title:rect('.brand-block'),auth:rect('#setlistAuthState'),newBtn:rect('#newSetlistBtn'),scrollWidth:document.documentElement.scrollWidth};
   });
   assert.ok(geom.title.right<=geom.auth.left+2||width<=790,'Title/auth overlap at '+width);
   assert.ok(geom.auth.right<=geom.newBtn.left+2||width<=790,'Auth/New Setlist overlap at '+width);
   assert.ok(geom.scrollWidth<=width+2,'Setlist header horizontal overflow at '+width);
   console.log('PASS compact Setlist header '+width+'px');
  }
  await page.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
