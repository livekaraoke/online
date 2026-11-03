const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"../admin-new");
const night=require("../admin-new/js/session-night-flow.js");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("night flow uses real performed-song order, bpm and ratings",()=>{
 const starts=[1761768000000,1761768240000,1761768480000,1761768720000];
 const played=[
  {songTitle:"First",songArtist:"Artist A",performanceBpm:124,releaseYear:1988,crowdResponse:"weak",singerExperienceRating:"amazing",playingAtMs:starts[0]},
  {songTitle:"Second",songArtist:"Artist B",userBpm:138,songYear:2004,crowdResponse:"good",singerExperienceRating:"notGreat",playingAtMs:starts[1]},
  {songTitle:"Third",bpm:110,year:1975,crowdResponse:"average",singerExperienceRating:"okay",playingAtMs:starts[2]},
  {songTitle:"Fourth",originalBpm:96,releaseDate:"1992-05-01",crowdResponse:"great",singerExperienceRating:"good",playingAtMs:starts[3]}
 ];
 const model=night.buildModel(played,[{startedAt:new Date(starts[1]+5000),endedAt:new Date(starts[2]-5000)}]);
 assert.deepEqual(model.songs.map(x=>x.title),["First","Second","Third","Fourth"]);
 assert.deepEqual(model.songs.map(x=>x.metrics.bpm),[124,138,110,96]);
 assert.deepEqual(model.songs.map(x=>x.metrics.year),[1988,2004,1975,1992]);
 assert.deepEqual(model.songs.map(x=>x.metrics.host),[1,3,2,4]);
 assert.deepEqual(model.songs.map(x=>x.metrics.singer),[4,1,2,3]);
 assert.equal(model.markers[0].after,2);
 assert.equal(model.breakCount,1);
 assert.match(night.renderSvg(model,"bpm"),/data-flow-index="3"/);
 assert.match(night.renderSvg(model,"host"),/WEAK/);
 assert.match(night.renderSvg(model,"singer"),/NOT GREAT/);
 assert.match(night.renderSvg(model,"year"),/SONG ORDER/);
 assert.match(night.summary(model,"bpm"),/Avg 117 BPM/);
});
test("missing metrics stay unknown and do not become zero or implied audience ratings",()=>{
 const model=night.buildModel([
  {songTitle:"Untimed",performanceBpm:null},
  {songTitle:"Has BPM",performanceBpm:120,crowdResponse:"good"},
  {songTitle:"Unrated",performanceBpm:null,year:null}
 ],[]);
 assert.equal(model.breakCount,0);
 assert.equal(model.songs[0].metrics.bpm,null);
 assert.equal(model.songs[0].metrics.host,null);
 assert.equal(model.songs[1].metrics.host,3);
 assert.equal(model.songs[2].metrics.singer,null);
 assert.equal(night.renderSvg(model,"year"),"");
 assert.equal(night.renderSvg(model,"singer"),"");
 const svg=night.renderSvg(model,"bpm");
 assert.match(svg,/Not recorded/);
 assert.doesNotMatch(svg,/Recorded break/);
});
test("empty and old sessions render safely, and HTML titles are escaped",()=>{
 const empty=night.buildModel([],[]);
 assert.equal(night.renderSvg(empty,"bpm"),"");
 assert.match(night.card(),/id="nightFlow"/);
 const legacy=night.buildModel([{songTitle:'Bad <img src=x onerror="alert(1)">',crowdResponse:"great",singerExperienceRating:"amazing"}],[]);
 const svg=night.renderSvg(legacy,"host");
 assert.doesNotMatch(svg,/<img/);
 assert.match(svg,/&lt;img/);
 assert.equal(legacy.songs[0].metrics.year,null);
});
test("chart is mounted just above existing played-song list with responsive touch controls",()=>{
 const html=read("performance-sessions.html");
 const session=read("js/performance-sessions.js");
 const css=read("css/session-night-flow.css");
 const lib=read("js/session-night-flow.js");
 assert.match(html,/session-night-flow.js\?v=20261103-zoom-key-years/);
 assert.match(html,/session-night-flow.css\?v=20261103-zoom-key-years/);
 assert.ok(session.indexOf("LS26NightFlow?.card()")<session.indexOf("PLAYED SONGS &amp; BREAKS"));
 assert.match(session,/LS26NightFlow\?\.mount\(\$\("nightFlow"\), detail\.played, session\.breaks, formatTime\)/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(lib,/onSnapshot|runTransaction\(|db\.batch\(|transaction\.(?:set|update|delete)\(/i);
 assert.match(lib,/collection\("lyrics"\)\.where\(field,"in",ids\)\.get\(\)/);
});


test("KEY is categorical and uses recorded key before its library fallback",()=>{
 const songs=[
  {songTitle:"A",key:"C",libraryKey:"Am"},
  {songTitle:"B",performanceKey:"F#m",key:"G"},
  {songTitle:"C",libraryKey:"Bb"},
  {songTitle:"D",key:"Unknown",libraryKey:"Dm"},
  {songTitle:"E",libraryKey:null}
 ];
 const model=night.buildModel(songs,[]);
 assert.deepEqual(model.songs.map(s=>s.metrics.key),["C","F#m","Bb","Dm",null]);
 assert.match(night.summary(model,"key"),/4\/5 with keys/);
 const svg=night.renderSvg(model,"key",{width:700});
 assert.match(svg,/width="700"/);
 assert.match(svg,/>F#m<\/text>/);
 assert.match(svg,/>Dm<\/text>/);
 assert.match(svg,/data-flow-index="4"/);
 assert.doesNotMatch(svg,/NaN/);
});

test("FIT ALL draws every point within one chart width for 28 songs",()=>{
 const played=Array.from({length:28},(_,i)=>({songId:"song-"+i,songTitle:"Song "+i,performanceBpm:100+i}));
 const model=night.buildModel(played,[]);
 for(const width of [320,760,900]){
  const svg=night.renderSvg(model,"bpm",{width});
  assert.match(svg,new RegExp('viewBox="0 0 '+width+' 260"'));
  assert.equal((svg.match(/data-flow-index=/g)||[]).length,28);
  assert.doesNotMatch(svg,/NaN/);
 }
 const code=read("js/session-night-flow.js"),css=read("css/session-night-flow.css");
 for(const action of ["in","out","fit"])assert.ok(code.includes('data-flow-zoom="'+action+'"'));
 assert.match(code,/zoomLevels=\[1,1\.35,1\.8,2\.4,3\.2,4\.2\]/);
 assert.match(css,/night-flow-zoom/);
 assert.match(css,/min-height:44px/);
});


test("RELEASE YEAR reads saved song library by ID and preserves unavailable years",async()=>{
 const rows=[
  {songId:"a",songTitle:"First",performanceBpm:120},
  {songId:"a",songTitle:"Repeated"},
  {songId:"b",songTitle:"Second",releaseYear:1991,key:"C"},
  {songId:"c",songTitle:"Third"},
  {songId:"orphan",songTitle:"Missing",key:"Em"}
 ];
 const cache=new Map(),reads=[];
 const lookup=async ids=>{
  reads.push([...ids]);
  return {a:{year:"1989",key:"Am"},c:{year:2001,key:"Gm"}};
 };
 const enriched=await night.enrichPlayed(rows,lookup,cache);
 assert.deepEqual(reads,[["a","c","orphan"]]);
 assert.deepEqual(enriched.map(x=>night.valueOf(x,"year")),[1989,1989,1991,2001,null]);
 assert.deepEqual(enriched.map(x=>night.valueOf(x,"key")),["Am","Am","C","Gm","Em"]);
 assert.match(night.summary(night.buildModel(enriched,[]),"year"),/4\/5 dated · 1989–2001/);
 await night.enrichPlayed(rows,lookup,cache);
 assert.equal(reads.length,1,"cache prevents redundant Firestore reads");
 assert.equal(cache.get("orphan"),null,"unavailable metadata stays unknown");
 assert.equal(rows[0].year,undefined,"the session archive is never modified");
});

test("28 songs use batched indexed queries, not a whole-library read",async()=>{
 const rows=Array.from({length:28},(_,i)=>({songId:"id-"+i,songTitle:"Song "+i}));
 const groups=[];
 const updated=await night.enrichPlayed(rows,async ids=>{
  groups.push(ids);
  return Object.fromEntries(ids.map((id,i)=>[id,{year:1990+i,key:"A"}]));
 },new Map());
 assert.deepEqual(groups.map(g=>g.length),[10,10,8]);
 assert.equal(updated.length,28);
 assert.equal(updated.every(row=>row.libraryKey==="A"),true);
 const source=read("js/session-night-flow.js");
 assert.match(source,/collection\("lyrics"\)\.where\(field,"in",ids\)\.get\(\)/);
 assert.doesNotMatch(source,/collection\("lyrics"\)\.get\(\)/);
});
