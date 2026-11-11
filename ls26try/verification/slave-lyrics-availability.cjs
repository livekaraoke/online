/* Chromium regression for legacy lyrics availability in LyricView.
 * Isolate the production dropdown functions; do not boot Firebase or modify
 * the song/lyrics data engine. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'host/js/lyricview.js'),'utf8');
const css=fs.readFileSync(path.join(root,'host/css/lyricview-fixes.css'),'utf8');
const html=fs.readFileSync(path.join(root,'host/lyricview.html'),'utf8');
assert.match(html,/lyricview\.js\?v=20261111-prompter-on-load-v1/);
assert.match(html,/lyricview-fixes\.css\?v=20261103-tap-tempo-v1/);
const begin=src.indexOf('  function dVal(v) {');
const end=src.indexOf('  // Inline status confirms',begin);
assert.ok(begin>0&&end>begin,'Extract current legacy-lyrics dropdown implementation');
const funcs=src.slice(begin,end);
const sendBegin=src.indexOf('  const slaveLyricsFeedbackTimers = new WeakMap();',end);
const sendEnd=src.indexOf('  async function saveMyNotes()',sendBegin);
assert.ok(sendBegin>end&&sendEnd>sendBegin,'Extract production SEND LYRICS handler');
const sender=src.slice(sendBegin,sendEnd);
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
   const page=await browser.newPage({viewport:{width:1024,height:1536}});
   await page.setContent('<style>'+css+'</style><body class="host-lyric-view-page"><select id="quickSlaveLyricsSelect"><option value="">Choose lyrics to send…</option></select><select id="slaveLyricsSelect"><option value="">Choose lyrics to send…</option></select><button id="sendSlaveLyricsBtn">SEND LYRICS</button></body>');
   await page.addScriptTag({content:`(()=>{
     const $=id=>document.getElementById(id);
     const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
     const ArtistNames={display:v=>v};
     let currentSong=null,currentSongId='';
     const db={collection:()=>({doc:()=>({set:async payload=>window.__writes.push(payload)})})};
     const firebase={firestore:{FieldValue:{serverTimestamp:()=>null}}};
     window.__writes=[];
     ${funcs}
     ${sender}
     window.__test={
       load:(song,songs)=>{currentSong=song;currentSongId=song?.id||'';window.songs=songs;return loadSlaveLyricsOptions();},
       send:async(song,songs,id)=>{currentSong=song;currentSongId=song.id;window.songs=songs;
         await loadSlaveLyricsOptions();$('slaveLyricsSelect').value=id;
         await sendSlaveLyrics();return window.__writes.at(-1);},
       values:()=>['quickSlaveLyricsSelect','slaveLyricsSelect'].map(id=>{
         const el=$(id);
         return{value:el.value,label:el.selectedOptions[0]?.textContent,
           blank:el.querySelector('option[value=""]')?.textContent,
           red:el.classList.contains('ls26-slave-lyrics-unavailable'),
           background:getComputedStyle(el).backgroundColor,
           border:getComputedStyle(el).borderTopColor,options:el.options.length};
       })
     };
   })();`});
   const songs=[
     {title:'All Along the Watchtower',artist:'Jimi Hendrix',hasLyrics:true,url:'lyrics/song.html?id=allalongthewatchtower'},
     {title:'All Summer Long',artist:'Kid Rock',hasLyrics:true,url:'lyrics/song.html?id=allsummerlong'},
     {title:'Unpublished',artist:'Example',hasLyrics:false,url:'lyrics/song.html?id=unpublished'}
   ];
   const current={title:'All Along the Watchtower',karaokeLyrics:'No'};
   await page.evaluate(({current,songs})=>window.__test.load(current,songs),{current,songs});
   let values=await page.evaluate(()=>window.__test.values());
   assert.ok(values.every(v=>v.value==='allalongthewatchtower'&&!v.red&&v.options===3),'Matching current song retains normal selection');
   await page.evaluate(songs=>window.__test.load({title:'A song not in legacy lyrics'},songs),songs);
   values=await page.evaluate(()=>window.__test.values());
   assert.ok(values.every(v=>v.value===''&&v.blank==='Send to New UI'&&v.red&&v.options===3),'Unmatched song uses red New UI prompt, with list intact');
   assert.ok(values.every(v=>v.background==='rgb(100, 20, 33)'&&v.border==='rgb(255, 82, 103)'),'Red styling must override stage styles');
   await page.locator('#quickSlaveLyricsSelect').selectOption('allsummerlong');
   values=await page.evaluate(()=>window.__test.values());
   assert.equal(values[0].red,false,'Selecting an alternate legacy song removes red warning');
   assert.equal(values[1].red,true,'Other select remains independent');
   await page.locator('#quickSlaveLyricsSelect').selectOption('');
   assert.equal((await page.evaluate(()=>window.__test.values()))[0].red,true,'Reverting to blank restores warning');
   await page.evaluate(()=>window.__test.load({title:'Any song'},[]));
   assert.ok((await page.evaluate(()=>window.__test.values())).every(v=>v.blank==='Send to New UI'&&v.red),'Empty but loaded legacy list uses fallback');
   await page.evaluate(()=>window.__test.load({title:'Any song'},undefined));
   assert.ok((await page.evaluate(()=>window.__test.values())).every(v=>v.blank==='No karaoke lyric songs found'&&!v.red),'Missing legacy script reports loading failure, not false song mismatch');
   const catalog=[
     {title:'All the small things',artist:'Blink 182',year:1999,hasLyrics:true,url:'lyrics/song.html?id=allthesmallthings'},
     {title:'All Summer Long',artist:'Kid Rock',year:2007,hasLyrics:true,url:'lyrics/song.html?id=allsummerlong'}
   ];
   const modern={id:'firestore-song-id',title:'All the Small Things',artist:'Blink 182',year:1999,karaokeLyrics:'allthesmallthings'};
   const selected=await page.evaluate(({modern,catalog})=>window.__test.send(modern,catalog,'allthesmallthings'),{modern,catalog});
   assert.equal(selected.prompterSongTitle,'All the Small Things','Use exact stored title case, not legacy sentence case');
   assert.equal(selected.prompterSongArtist,'Blink 182');
   assert.equal(selected.prompterSongYear,1999);
   const other=await page.evaluate(({modern,catalog})=>window.__test.send(modern,catalog,'allsummerlong'),{modern,catalog});
   assert.equal(other.prompterSongTitle,'All Summer Long','Manual alternate selection keeps its own metadata');
   assert.equal(other.prompterSongArtist,'Kid Rock');
   console.log('PASS: matching songs retain exact Firestore capitalisation; alternates keep their own metadata');
   console.log('PASS: matched/unmatched songs, red UI, manual alternate selection, empty or missing legacy list');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
