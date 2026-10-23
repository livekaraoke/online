/* Run the real Setlist Editor controller against a mocked Firestore and Chromium DOM.
 * Assert A–Z display, append behavior, save persistence, no surprise writes, and ID safety.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const doc=parseHTML(read('host/setlist-editor.html')).document;
doc.querySelectorAll('script,link[rel="stylesheet"]').forEach(n=>n.remove());
const html='<!DOCTYPE html>'+doc.documentElement.outerHTML;
const js=read('host/js/setlist-editor.js');
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
(async()=>{
 const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:1000}});
  try{
   await page.setContent(html);
   await page.evaluate(()=>{
    const source=[
     ['z','Zombie','Cranberries'],
     ['w','Wonderwall','Oasis'],
     ['a','All the Small Things','Blink-182'],
     ['b','Baba O’Riley','The Who'],
     ['z2','Zombie','Different Artist']
    ];
    const docs=source.map(([id,title,artist])=>({id,data:()=>({title,artist,year:2000})}));
    const records=[{id:'test',data:()=>({name:'Billy Lee Solo',notes:'Original notes',songIds:['z','w','a','missing']})}];
    const writes=[];const callbacks={};
    window.__mock={writes,records,docs,callbacks};
    window.ArtistNames={display:v=>v||'',matchesSong:(song,q)=>(song.title+' '+song.artist).toLowerCase().includes(q)};
    window.auth={currentUser:{uid:'host',email:'host@example.com'},onAuthStateChanged:cb=>{cb(window.auth.currentUser);return()=>{}}};
    window.LS26Dialogs={confirm:async()=>true};
    window.firebase={firestore:{FieldValue:{serverTimestamp:()=>({seconds:1})}}};
    window.db={collection(name){
     return {
      onSnapshot(cb){callbacks[name]=cb;cb({docs:name==='lyrics'?docs:records});return()=>{}},
      doc(id){return {async set(fields,options){writes.push({id,fields,options});const previous=records[0].data();records[0]={id,data:()=>({...previous,...fields})}},async delete(){}}},
      async add(){throw Error('Creating setlist not expected in this regression')}
     };
    }};
   });
   await page.addScriptTag({content:js});
   const $=selector=>page.locator(selector);
   await $('[data-select="test"]').click();
   const titles=()=>page.locator('#selectedSongs .setlist-song-row strong').allTextContents();
   const expectTitles=async arr=>assert.deepEqual(await titles(),arr);
   await expectTitles(['All the Small Things','Wonderwall','Zombie']);
   assert.equal(await page.locator('#selectedSongs [data-up], #selectedSongs [data-down], #selectedSongs .drag').count(),0,'Conflicting manual order controls remain');
   assert.equal(await page.locator('#selectedSongs [draggable="true"]').count(),0,'Selected rows must not allow drag reordering');
   assert.equal(await page.evaluate(()=>window.__mock.writes.length),0,'Viewing the setlist wrote Firestore');
   await $('[data-add="b"]').click();
   await expectTitles(['All the Small Things','Baba O’Riley','Wonderwall','Zombie']);
   assert.equal(await page.evaluate(()=>window.__mock.writes.length),0,'Adding before Save wrote Firestore');
   await $('#saveSetlistBtn').click();
   const after=await page.evaluate(()=>window.__mock.writes);
   assert.equal(after.length,1,'Expected exactly one Save write');
   assert.equal(after[0].id,'test','Must preserve setlist document ID');
   assert.deepEqual(after[0].fields.songIds,['a','b','w','z','missing'],'Persist alphabetical IDs; preserve unresolvable legacy ID');
   assert.equal(after[0].fields.notes,'Original notes','Must preserve notes');
   await page.evaluate(()=>window.__mock.callbacks.lyricsSetlists({docs:window.__mock.records}));
   await expectTitles(['All the Small Things','Baba O’Riley','Wonderwall','Zombie']);
   await $('[data-remove="b"]').click();
   await expectTitles(['All the Small Things','Wonderwall','Zombie']);
   assert.equal(await page.evaluate(()=>window.__mock.writes.length),1,'Removing before Save wrote Firestore');
   await $('#saveSetlistBtn').click();
   const latest=await page.evaluate(()=>window.__mock.writes.at(-1).fields.songIds);
   assert.deepEqual(latest,['a','w','z','missing']);
   console.log('PASS A–Z on existing setlist, add, remove, reload and save; orphan ID retained; no writes before Save; reordering disabled');
  }finally{await page.close();}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
