/* Chromium regression: audience-rating help opens a modal with the full
 * guidance table, and never changes rating/Firestore state. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const pageHtml=fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8');
const appDialogs=fs.readFileSync(path.join(root,'shared/dialogs.js'),'utf8');
const ratingJs=fs.readFileSync(path.join(root,'host/js/lyricview-end-rating.js'),'utf8');
const appCss=fs.readFileSync(path.join(root,'shared/dialogs.css'),'utf8');
const ratingCss=fs.readFileSync(path.join(root,'host/css/lyricview-completion.css'),'utf8');
assert.match(pageHtml,/lyricview-end-rating\.js\?v=20261028-rating-guide-v1/);
assert.match(pageHtml,/lyricview-completion\.css\?v=20261028-rating-guide-v1/);
const rating=pageHtml.match(/<section id="endSongRating"[^]*?<\/section>/)?.[0];
const dialog=pageHtml.match(/<dialog id="endRatingGuideDialog"[^]*?<\/dialog>/)?.[0];
assert.ok(rating&&dialog,'Rating section and guidance modal are present');
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  await page.setContent('<!doctype html><html><head><style>'+appCss+'\n'+ratingCss+'</style></head><body class="host-lyric-view-page">'+rating+dialog+'</body></html>');
  await page.addScriptTag({content:appDialogs});
  await page.addScriptTag({content:ratingJs});
  const trigger=page.locator('#endRatingInfoBtn'),modal=page.locator('#endRatingGuideDialog');
  assert.equal(await trigger.textContent(),'i');
  assert.equal(await modal.isVisible(),false,'Dialog starts closed');
  assert.ok(await page.locator('.host-end-rating-choices button:disabled').count()===5,'Ratings are disabled without a completed performance');
  await trigger.click();
  assert.equal(await modal.isVisible(),true,'Info button opens custom dialog');
  assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  assert.equal(await modal.evaluate(el=>el.matches(':modal')),true,'Native modal isolates background interaction');
  const labels=await modal.locator('tbody tr th').allTextContents();
  assert.deepEqual(labels,['GREAT','GOOD','AVERAGE','WEAK','NOT RATED']);
  const descriptions=await modal.locator('tbody tr td').allTextContents();
  assert.ok(descriptions[0].includes('singing along')&&descriptions[3].includes('flat response')&&descriptions[4].includes("couldn't judge"));
  const close=modal.locator('.ls26-modal-x');
  await close.waitFor({state:'visible'});
  await close.click();
  await modal.waitFor({state:'hidden'});
  assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  assert.equal(await trigger.evaluate(el=>document.activeElement===el),true,'Close returns focus to help trigger');
  await trigger.click();
  await page.keyboard.press('Escape');
  await modal.waitFor({state:'hidden'});
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','Escape closes modal');
  await page.setViewportSize({width:375,height:667});
  await trigger.click();
  const box=await modal.boundingBox();
  assert.ok(box.width<=375-20&&box.height<=667-40,'Modal fits small tablets/phones');
  assert.equal(await modal.locator('tbody tr').count(),5);
  await page.evaluate(()=>document.getElementById('endRatingGuideDialog').click());
  await modal.waitFor({state:'hidden'});
  assert.ok(await page.locator('.host-end-rating-choices button:disabled').count()===5,'Help does not enable rating or change Firestore');
  console.log('PASS: info popup, five descriptions, close X, Escape, focus restore, small-screen fit and unchanged rating state');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
