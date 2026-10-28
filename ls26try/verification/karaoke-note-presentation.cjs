/* Targeted Chromium regression for Karaoke Note presentation.
 * The storage type remains performanceNote, and old labels are display aliases.
 * Sections with custom titles INTRO/SOLO must still be styled as Karaoke Notes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const creator=read('host/js/lyricscreator.js');
const viewer=read('host/js/lyricview.js');
const creatorHtml=read('host/lyricscreator.html');
const viewHtml=read('host/lyricview.html');
const creatorCss=read('host/css/lyricscreator-fixes.css');
const viewCss=read('host/css/lyricview-fixes.css');
const cue='Short instrumental (wait for signal)';
assert.ok(creatorHtml.includes('＋ KARAOKE NOTE</button>'));
assert.match(creatorHtml,/lyricscreator-fixes\.css\?v=20261028-title-colour-fix-v1/);
assert.match(creatorHtml,/lyricscreator\.js\?v=20261028-title-colour-fix-v1/);
assert.match(viewHtml,/lyricview-fixes\.css\?v=20261028-karaoke-note-v1/);
assert.match(viewHtml,/lyricview\.js\?v=20261028-karaoke-note-v1/);
assert.match(creator,/title: template\?\.title \|\| "KARAOKE NOTE"/);
assert.match(creator,/^.*\? "KARAOKE NOTE" : type === "hostNote"/m);
assert.match(viewer,/body\.textContent = section\.text/);
assert.ok(viewer.includes('const displayedTitle = /^performance-?note$/i.test'));
assert.match(viewer,/if \(sectionTypeClass\(section\) !== "is-performance-note"\)/);
assert.match(creator,/type === "performanceNote"/);
assert.match(viewer,/is-performance-note/);
// Execute the real section classifier, proving INTRO/SOLO stay note sections.
const typeFn=viewer.slice(viewer.indexOf('  function sectionTypeClass(section) {'),viewer.indexOf('  function cleanSectionHtml('));
assert.ok(typeFn.startsWith('  function')&&typeFn.includes('return "is-performance-note"'));
const context={};vm.createContext(context);
vm.runInContext(typeFn+';globalThis.classify=sectionTypeClass;',context);
for(const title of ['PERFORMANCE NOTE','KARAOKE NOTE','INTRO','SOLO','OUTRO']){
  assert.equal(context.classify({type:'performanceNote',title}),'is-performance-note',title);
}
assert.equal(context.classify({type:'lyrics',title:'INTRO'}),'is-instrumental');
const styleFn=creator.slice(creator.indexOf('  function defaultStyle(type = "lyrics") {'),creator.indexOf('  function normaliseSectionTitleKey('));
vm.runInContext(styleFn+';globalThis.defaultNoteStyle=defaultStyle;',context);
const defaults=context.defaultNoteStyle('performanceNote');
assert.equal(defaults.color,'#12d5b9');
assert.equal(defaults.textAlign,'center');
assert.equal(defaults.fontSize,28);
assert.equal(context.defaultNoteStyle('lyrics').color,'#ffffff');
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  await page.setContent('<!doctype html><html><head><style>'+creatorCss+'\n'+viewCss+'</style></head><body><div class="creator-page"><article class="creator-section-card type-performanceNote"><textarea class="performance-note-editor" style="text-align:left"></textarea></article></div><div class="host-lyric-view-page"><section class="host-section is-performance-note"><div class="host-section-body" style="color:white;text-align:left;font-size:23px"></div></section></div><div class="host-lyric-view-page"><section class="host-section is-instrumental"><div class="host-section-body" style="color:white;text-align:left;font-size:23px">Normal instrumental</div></section></div></body></html>');
  const result=await page.evaluate(cue=>{
    const editor=document.querySelector('.performance-note-editor');
    const note=document.querySelector('.host-section.is-performance-note .host-section-body');
    const other=document.querySelector('.host-section.is-instrumental .host-section-body');
    editor.value=cue;note.textContent=cue;
    const pick=el=>{const s=getComputedStyle(el);return{color:s.color,font:s.fontFamily,size:s.fontSize,weight:Number(s.fontWeight),align:s.textAlign,spacing:s.whiteSpace,text:el.value??el.textContent}};
    return{editor:pick(editor),note:pick(note),other:pick(other)};
  },cue);
  assert.equal(result.editor.color,'rgb(18, 213, 185)');
  assert.equal(result.note.color,result.editor.color);
  assert.equal(result.editor.font.split(',')[0],result.note.font.split(',')[0]);
  assert.equal(result.note.align,'center');
  assert.equal(result.editor.align,'center');
  assert.equal(result.note.size,'28px');
  assert.ok(result.note.weight>=800&&result.editor.weight>=800);
  assert.equal(result.note.text,cue);
  assert.equal(result.editor.text,cue);
  assert.notEqual(result.other.color,result.note.color,'Unrelated instrumental section is unchanged');
  console.log('PASS Karaoke Note type priority, generic label, original text, shared turquoise bold centred typography, unchanged lyrics sections');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
