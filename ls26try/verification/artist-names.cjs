/* Artist aliases + actual website/Library/LyricView functions, no network or database. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ArtistNames=require('../shared/artist-names.js');
const root=path.join(__dirname,'../..');
for(const [raw,expected] of [['Calling, The','The Calling'],['Beatles,The','The Beatles'],['  Cure, the  ','The Cure'],['The The','The The'],['Tribe Called Quest, A','A Tribe Called Quest'],['Earth, Wind & Fire','Earth, Wind & Fire'],['Therapy?','Therapy?'],['The Calling','The Calling'],[null,'']]){
  assert.equal(ArtistNames.display(raw),expected);
  assert.equal(ArtistNames.display(ArtistNames.display(raw)),expected);
}
for(const artist of ['Calling, The','The Calling']){
  const song={title:'Wherever You Will Go',artist,year:2001};
  for(const term of ['the calling','Calling, The','CALLING,THE','calling',' the   calling ','Wherever You Will Go The Calling','Wherever You Will Go Calling, The','2001'])assert.ok(ArtistNames.matchesSong(song,term),`${artist}: ${term}`);
  assert.equal(ArtistNames.matchesSong(song,'The Beatles'),false);
}
assert.equal(ArtistNames.matchesSong({title:'The Man Who Sold the World',artist:'David Bowie'},'David Bowie'),true);
assert.equal(ArtistNames.display('The Man Who Sold the World'),'The Man Who Sold the World');

// Extract complete named declarations from the existing controllers, with their real bodies.
function declarations(file,names){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  return names.map(name=>{
    const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0,name);
    const tail=source.slice(start),end=tail.search(/\n  (?:async )?function /);
    assert.ok(end>0,name+' boundary');return tail.slice(0,end);
  }).join('\n');
}
const elements={};const el=id=>elements[id]||(elements[id]={value:'',innerHTML:'',textContent:'',checked:false});
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={console,ArtistNames,$:el,escapeHTML,esc:escapeHTML,songs:[],runOrder:[],selectedRequestSongId:'',window:{},document:{getElementById:el},URLSearchParams,location:{search:''},localStorage:{getItem:()=>null}};
ctx.window.addEventListener=()=>{};vm.createContext(ctx);
vm.runInContext(declarations('billylee26/js/app.js',['normaliseSongIdentity','sameSong','songSessionState','renderSongResults']),ctx);
ctx.songs=[{id:'calling',title:'Wherever You Will Go',artist:'Calling, The'},{id:'beatles',title:'Hey Jude',artist:'The Beatles'},{id:'html',title:'A title',artist:'<Band>, The'}];
for(const term of ['the calling','Calling, The','calling']){
  el('songSearch').value=term;ctx.renderSongResults();
  assert.match(el('songResults').innerHTML,/<small>The Calling<\/small>/);
  assert.ok(!el('songResults').innerHTML.includes('Calling, The'));
  assert.ok(!el('songResults').innerHTML.includes('Hey Jude'));
}
el('songSearch').value='Beatles, The';ctx.renderSongResults();assert.match(el('songResults').innerHTML,/<small>The Beatles<\/small>/);
ctx.runOrder=[{songTitle:'Wherever You Will Go',artist:'The Calling',status:'played'}];el('songSearch').value='the calling';ctx.renderSongResults();assert.match(el('songResults').innerHTML,/ALREADY PLAYED/);
assert.equal(ctx.sameSong({songTitle:'Wherever You Will Go',artist:'Another Band'},ctx.songs[0]),false);
el('songSearch').value='band';ctx.renderSongResults();assert.match(el('songResults').innerHTML,/The &lt;Band&gt;/);

vm.runInContext(fs.readFileSync(path.join(root,'ls26try/host/js/lyrics-common.js'),'utf8'),ctx);
ctx.LyricsCommon=ctx.window.LyricsCommon;
const raw={title:'Wherever You Will Go',artist:'Calling, The',sections:[],year:'2001',key:'A'};
const normalized=ctx.LyricsCommon.normalizeSong(raw,'calling');assert.equal(normalized.artist,'The Calling');assert.equal(raw.artist,'Calling, The','formatting must not mutate source data');assert.equal(normalized.firebaseId,'calling');
const library=fs.readFileSync(path.join(root,'ls26try/host/js/lyricsviewer.js'),'utf8');
vm.runInContext(library.slice(0,library.indexOf('  function syncSidebarButton()'))+'window.artistTest={set:rows=>songs=rows,result:filteredSongs};})();',ctx);
ctx.window.artistTest.set([normalized]);
for(const term of ['the calling','calling, the','wherever you will go']){el('searchInput').value=term;assert.equal(ctx.window.artistTest.result().length,1);}
el('artistFilter').value='The Calling';assert.equal(ctx.window.artistTest.result().length,1);
el('artistFilter').value='The Beatles';assert.equal(ctx.window.artistTest.result().length,0);
vm.runInContext(declarations('ls26try/host/js/lyricview.js',['setTopTitle']),ctx);ctx.setTopTitle(raw);
assert.match(el('topbarSongTitle').innerHTML,/The Calling/);assert.equal(el('infoSongTitle').textContent,'Wherever You Will Go — The Calling');
console.log('PASS: both artist formats, partial/mixed title searches, unchanged ordinary names, website rendering/escaping, played-song matching, Library filters, LyricView headings and source-data preservation.');
