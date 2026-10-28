/* Chromium regression of real title-colour handlers and DOM sync.
   No Firebase writes, no modified song data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('host/js/lyricscreator.js'), view=read('host/js/lyricview.js');
const html=read('host/lyricscreator.html'),css=read('host/css/lyricscreator-fixes.css'),legacy=read('host/css/lyrics-suite.css');
const slice=(a,b,from=0)=>{
 const i=code.indexOf(a,from),j=code.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'Missing production function '+a);
 return code.slice(i,j);
};
const defs=slice('  function defaultStyle(type = "lyrics") {','  function normaliseSectionTitleKey(');
const colorMethods=slice('  function renderTitleColourOptions(selected) {','  function unwrapDashSpans(');
const sync=slice('  function syncSectionsFromDOM() {','  function showConfirm(');
const input=slice('  document.addEventListener("input", event => {','  document.addEventListener("change", event => {',code.lastIndexOf('  document.addEventListener("input", event => {'));
const change=slice('  document.addEventListener("change", event => {','  document.addEventListener("click", async event => {',code.lastIndexOf('  document.addEventListener("change", event => {'));
assert.match(html,/lyricscreator\.js\?v=20261028-title-colour-fix-v1/);
assert.match(html,/lyricscreator-fixes\.css\?v=20261028-title-colour-fix-v1/);
assert.match(view,/section\.style\?\.titleColor \|\| getSystemSectionTitleColour\(section\.title\)/);
assert.match(view,/titleEl\.style\.setProperty\("color", titleColour, "important"\)/);
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  await page.setContent('<!doctype html><html><head><style>'+legacy+'\n'+css+'</style></head><body class="creator-page"><article class="creator-section-card"><div class="creator-section-head"><input class="section-title-input" data-title="0" value="OUTRO" style="--ls26-section-title-colour:#ffffff"><label class="section-title-colour-control">TITLE <select data-title-colour="0"></select><input type="color" data-title-custom="0" value="#ffffff"></label></div></article></body></html>');
  const setup=['(()=>{',
    'let sections=[{title:"OUTRO",type:"lyrics",style:{titleColor:""}}];',
    'const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(\'"\',"&quot;");',
    'const getSystemSectionTitleColour=()=>"#ffffff";',
    'const markDirty=()=>{};const refreshChordOccurrences=()=>{};',
    defs,colorMethods,sync,input,change,
    'document.querySelector("[data-title-colour]").innerHTML=renderTitleColourOptions("");',
    'window.__test={state:()=>JSON.parse(JSON.stringify(sections)),sync:()=>syncSectionsFromDOM(),reload:saved=>{',
    'sections=JSON.parse(JSON.stringify(saved));',
    'document.querySelector("[data-title-colour]").innerHTML=renderTitleColourOptions(sections[0].style.titleColor);',
    'document.querySelector("[data-title-custom]").value=sections[0].style.titleColor||"#ffffff";',
    'document.querySelector("[data-title]").style.setProperty("--ls26-section-title-colour",sections[0].style.titleColor||"#ffffff");',
    '}};',
    '})();'].join('\n');
  await page.addScriptTag({content:setup});
  const title=page.locator('[data-title]'),select=page.locator('[data-title-colour]'),picker=page.locator('[data-title-custom]');
  const titleColour=()=>title.evaluate(el=>getComputedStyle(el).color);
  assert.equal(await titleColour(),'rgb(255, 255, 255)');
  await picker.evaluate(el=>{
    el.value='#fede27';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  assert.equal(await titleColour(),'rgb(254, 222, 39)','Custom colour must preview immediately');
  assert.equal(await select.inputValue(),'#fede27');
  assert.ok((await select.evaluate(el=>el.selectedIndex))>=0);
  let saved=await page.evaluate(()=>{window.__test.sync();return window.__test.state()});
  assert.equal(saved[0].style.titleColor,'#fede27','Save must preserve custom hex');
  await page.evaluate(data=>window.__test.reload(data),saved);
  assert.equal(await titleColour(),'rgb(254, 222, 39)','Reopening must show saved colour');
  assert.equal(await select.inputValue(),'#fede27');
  assert.equal(await select.locator('[data-custom-title-colour]').count(),1);
  await select.selectOption('#ff4f5e');
  assert.equal(await titleColour(),'rgb(255, 79, 94)','Preset colour must preview');
  saved=await page.evaluate(()=>{window.__test.sync();return window.__test.state()});
  assert.equal(saved[0].style.titleColor,'#ff4f5e');
  await select.selectOption('');
  assert.equal(await titleColour(),'rgb(255, 255, 255)');
  saved=await page.evaluate(()=>{window.__test.sync();return window.__test.state()});
  assert.equal(saved[0].style.titleColor,'','Default resets override');
  await picker.evaluate(el=>{el.value='#123abc'});
  await select.evaluate(el=>{el.selectedIndex=-1});
  saved=await page.evaluate(()=>{window.__test.sync();return window.__test.state()});
  assert.equal(saved[0].style.titleColor,'#123abc','Legacy no-selection still retains custom');
  assert.equal(saved[0].type,'lyrics');
  // LyricView has a stronger legacy rule for the currently active section.
  // The persisted titleColor must override that rule, not render pale blue.
  const viewerCss=read('host/css/lyricview-fixes.css');
  await page.addStyleTag({content:viewerCss});
  await page.evaluate(()=>{
    const host=document.createElement('div');
    host.className='host-lyric-view-page';
    host.innerHTML='<section class="host-section current-section"><button class="host-section-header"><strong>OUTRO</strong></button></section>';
    document.body.append(host);
    host.querySelector('strong').style.setProperty('color','#fede27','important');
  });
  const hostColor=await page.locator('.host-lyric-view-page .current-section .host-section-header strong')
    .evaluate(el=>getComputedStyle(el).color);
  assert.equal(hostColor,'rgb(254, 222, 39)','Active LyricView section must use the saved title colour');
  console.log('PASS: TITLE swatch instant display, custom/preset/default, save/reload, legacy custom fallback, LyricView active-section override');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
