const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const catalogue = read('livekaraoke26/js/public-catalogue.js');
const app = read('livekaraoke26/js/app.js');
const lifecycle = read('js/public-request-lifecycle.js');
const snapshot = (id, value) => ({id, exists:!!value, data:()=>value});

function fixture({active=false, selected='public', browse='browse', fail=false}={}) {
  const records = {
    public:{name:'Public',songIds:['wonderwall','zombie']},
    browse:{name:'Browse',songIds:['wonderwall','brightside']}
  };
  const songs = {
    wonderwall:{title:'Wonderwall',artist:'Oasis',year:1995},
    zombie:{title:'Zombie',artist:'Cranberries, The',year:1994,publicSongListVisible:false},
    brightside:{title:'Mr Brightside',artist:'Killers, The',year:2004}
  };
  const controls = {publicSongList:{setlistId:selected},liveKaraokeWebsiteSettings:{defaultBrowseSetlistId:browse},currentSession:{active,sessionId:active?'real-session':''}};
  const db = {collection(name){
    assert.ok(['karaokeControl','lyricsSetlists','lyrics'].includes(name), `Unexpected source: ${name}`);
    return {
      doc(id){return {get:async()=>snapshot(id,(name==='karaokeControl'?controls:records)[id])};},
      where(field,op,ids){assert.equal(op,'in');return {get:async()=>{
        if(fail)throw new Error('permission-denied');
        return {docs:ids.filter(id=>songs[id]).map(id=>snapshot(id,songs[id]))};
      }};},
      get:async()=>({docs:Object.entries(songs).map(([id,song])=>snapshot(id,song))})
    };
  }};
  const context = {window:{},firebase:{firestore:{FieldPath:{documentId:()=> '__name__'}}},console};
  vm.runInNewContext(catalogue,context);
  return {load:()=>context.window.LiveKaraokeCatalogue.load(db)};
}

function gate({live=true,active=false,open=false,reserved='',test=false}={}) {
  const start=lifecycle.indexOf('  const gateHasExplicitValue');
  const end=lifecycle.indexOf('  function normaliseObserver');
  const context={isLiveKaraoke:live,gateState:{songsEnabled:open,preSessionRequestSessionId:reserved},currentSession:{active,sessionId:active?'real-session':''},rawWebsiteSettings:{enableLiveRequestTestMode:test},result:null};
  vm.runInNewContext(lifecycle.slice(start,end)+';result={canSubmit:canSubmit(),settings:syntheticSettingsSnapshot({exists:true,data:()=>({enableLiveRequestTestMode:false})}).data()};',context);
  return context.result;
}

(async()=>{
  // Every script needed by the public entry point must survive Pages exclusions.
  assert.match(app,/addEventListener\("DOMContentLoaded",openRequestDialog/);
  assert.doesNotMatch(read("livekaraoke26/js/youtube-videos.js"),/requestSongBtn.*click/);
  const html=read('livekaraoke26/request.html');
  const scripts=[...html.matchAll(/<script src="([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]).filter(s=>!s.startsWith('https:'));
  for(const src of scripts){
    const relative=path.posix.normalize(path.posix.join('livekaraoke26',src));
    assert.ok(!/^(ls26try|adm)\//.test(relative), `Unpublished dependency: ${relative}`);
    assert.ok(fs.existsSync(path.join(root,relative)), `Missing script: ${relative}`);
  }

  const offline=await fixture().load();
  assert.equal(offline.setlist.id,'browse');
  assert.equal(offline.songs.length,2);
  const active=await fixture({active:true}).load();
  assert.equal(active.setlist.id,'public');
  assert.equal(active.songs.length,2); // Explicit public setlist overrides per-song visibility.
  assert.equal((await fixture({selected:'',browse:''}).load()).songs.length,2);
  await assert.rejects(fixture({fail:true}).load(), /permission-denied/);
  await assert.rejects(fixture({browse:'missing'}).load(), /does not exist/);

  assert.equal(gate().canSubmit,false);
  assert.equal(gate({open:true}).canSubmit,false); // Never invent a preview session.
  assert.equal(gate({open:true,reserved:'upcoming'}).canSubmit,true);
  assert.equal(gate({open:true,reserved:'upcoming'}).settings.requestTestSessionId,'upcoming');
  assert.equal(gate({active:true,open:true}).canSubmit,true);
  assert.equal(gate({active:true,open:false}).canSubmit,false);
  assert.equal(gate({live:false,test:true}).canSubmit,true); // Billy test-mode contract preserved.

  // Exercise the actual row renderer and artist/search helper, where the live crash occurred.
  const context={window:{},songs:active.songs,escapeHTML:v=>String(v),songSessionState:()=> 'available',alphabetKey:v=>v[0],isFavouriteSong:()=>false};
  vm.createContext(context);
  vm.runInContext(read('livekaraoke26/js/artist-names.js'),context);
  context.ArtistNames=context.window.ArtistNames;
  vm.runInContext(app.slice(app.indexOf('  function renderSongResultRow'),app.indexOf('  function artistBrowseDisplayName'))+'; row=renderSongResultRow(songs[1]);',context);
  assert.match(context.row,/Zombie/);
  assert.match(context.row,/The Cranberries/);
  assert.equal(context.ArtistNames.matchesSong(active.songs[0],'wonderwall'),true);
  assert.equal(context.ArtistNames.matchesSong(active.songs[1],'the cranberries'),true);
  console.log('PASS: public assets, canonical repertoire, render/search, errors, four request states and Billy isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
