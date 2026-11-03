const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const api=require('../../signup/signup.js'),root=path.resolve(__dirname,'../..');
test('ES5 syntax for every kiosk script and inline alias',()=>{
 const acorn=require(require.resolve('acorn',{paths:[process.env.LS26_KIOSK_TEST_MODULES||process.cwd()]}));
 for(const file of ['signup/signup.js','signup/kiosk-policy.js'])acorn.parse(fs.readFileSync(path.join(root,file),'utf8'),{ecmaVersion:5});
 const alias=fs.readFileSync(path.join(root,'signup/index.html'),'utf8');acorn.parse(alias.match(/<script>([\s\S]*?)<\/script>/)[1],{ecmaVersion:5});
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');assert.doesNotMatch(html,/firebasejs|type="module"|framework|ls26try/);
});
test('disabled rollout blocks requests even with a valid kiosk token',()=>{
 const nodes={},document={getElementById(id){return nodes[id]||(nodes[id]={value:'',hidden:true,disabled:false,textContent:'',style:{},setAttribute(){}});},addEventListener(){}};
 const window={document,LKSignupPolicy:{rulesVerified:false,projectId:'demo-ls26-kiosk'},location:{search:'?k='+'a'.repeat(64)},addEventListener(){}};
 const context={window,document,location:window.location,clearTimeout(){},setTimeout(){},XMLHttpRequest(){throw Error('Disabled kiosk must not contact Firestore');}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'signup/signup.js'),'utf8'),context);
 assert.equal(nodes.send.disabled,true);
 assert.ok(Object.values(nodes).some(n=>/HOST SETUP REQUIRED/.test(n.textContent)));
});
test('token parsing does not depend on URLSearchParams',()=>{assert.equal(api.param('k','?k=abc%20def'),'abc def');assert.equal(api.param('k','?k=%xx'),'');assert.equal(api.param('k','?other=x'),'');assert.ok(api.tokenValid('a'.repeat(64)));assert.ok(!api.tokenValid('ABCD'));});
const songs=[{id:'one',title:'Wonderwall',artist:'Oasis'},{id:'two',title:'Zombie',artist:'The Cranberries'}];
test('search is local, case insensitive, title and artist',()=>{assert.deepEqual(api.filterSongs(songs,'WONDER'),[songs[0]]);assert.deepEqual(api.filterSongs(songs,'cranb'),[songs[1]]);assert.equal(api.filterSongs(songs,'missing').length,0);});
test('required name/song, optional bounded note',()=>{assert.ok(api.validForm('Alex',songs[0],''));assert.ok(!api.validForm('Al',songs[0],''));assert.ok(!api.validForm(' ',songs[0],''));assert.ok(!api.validForm('Alex',null,''));assert.ok(!api.validForm('a'.repeat(81),songs[0],''));assert.ok(!api.validForm('Alex',songs[0],'x'.repeat(301)));});
test('only the existing queue request and private proof are written; all server timestamps; create-only',()=>{
 const view={sessionId:'s1',setlistId:'set1',setlistName:'Tonight',revision:'r1',venue:'Test'};
 const body=api.commitBody('demo-ls26-kiosk','kiosk_'+'1'.repeat(32),'a'.repeat(64),view,songs[0],'  Alex  ','');
 assert.equal(body.writes.length,2);const q=body.writes[0];assert.ok(q.update.name.includes('/publicSongRequests/'));assert.equal(q.currentDocument.exists,false);assert.equal(q.update.fields.singerName.stringValue,'Alex');assert.equal(q.update.fields.source.stringValue,'signup-kiosk');assert.ok(!q.update.fields.token);assert.equal(q.updateTransforms[0].setToServerValue,'REQUEST_TIME');assert.ok(body.writes[1].update.name.includes('/signupKioskReceipts/'));
});
test('Firestore decoder retains literal prototype-like song IDs safely',()=>{const d=api.decode({mapValue:{fields:JSON.parse('{"__proto__":{"mapValue":{"fields":{"title":{"stringValue":"Safe"},"artist":{"stringValue":"Artist"}}}}}')}});assert.equal(api.songsFrom({songs:d})[0].id,'__proto__');assert.equal({}.title,undefined);});
test('same request ID immutable across retries; no automatic retry or customer storage',()=>{const source=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage|onSnapshot|setInterval|fetch\(/);assert.match(source,/currentDocument: \{exists: false\}/);assert.match(source,/uncertain = true/);});
test('scope: queue integration retains session filter and acceptance',()=>{const source=fs.readFileSync(path.join(root,'ls26try/admin-new/js/requests.js'),'utf8');assert.match(source,/\.where\("sessionId", "==", sessionId\)/);assert.match(source,/SIGN-UP KIOSK/);assert.match(source,/requesterNote: req.note/);});

test('pending queue handles missing/date/string timestamps without a render loop',()=>{
 const source=fs.readFileSync(path.join(root,'ls26try/admin-new/js/top-statusbar-session-tools.js'),'utf8');
 const dates=source.slice(source.indexOf('  function tsDate('),source.indexOf('  function formatClock('));
 const pending=source.slice(source.indexOf('  function pendingRequestTime('),source.indexOf('  function renderPending('));
 const ctx={Date};vm.createContext(ctx);vm.runInContext(dates+pending,ctx);
 assert.equal(ctx.pendingRequestTime({}),0);assert.equal(ctx.pendingRequestTime({createdAt:'2026-01-01T00:00:00Z'}),Date.parse('2026-01-01T00:00:00Z'));
 assert.equal(ctx.pendingRequestTime({createdAt:{toMillis:()=>123}}),123);
});

test('two-step full-list page keeps Safari 9-compatible layout and separate submit',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.match(html,/apple-mobile-web-app-capable" content="yes"/);
 assert.match(html,/id="nameStep"/);
 assert.match(html,/id="songStep"/);
 assert.match(html,/id="next"/);
 assert.doesNotMatch(html,/id="back"/);
 assert.match(html,/id="cancel"/);
 assert.doesNotMatch(html,/id="moreSongs"/);
 assert.match(script,/for \(i = 0; i < songs.length; i \+= 1\)/);
 assert.match(script,/row\.button\.className = 'song' \+/);
 assert.match(css,/\.song\.selected \{ background: #155c36/);
 assert.match(css,/height: 100vh/);
 assert.match(script,/el\('next'\)\.onclick/);
 assert.match(script,/el\('send'\)\.disabled/);
});

test('name screen typography and footer placement stay isolated to first step',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 const header=html.slice(html.indexOf('<header>'),html.indexOf('</header>')+9);
 const name=html.slice(html.indexOf('<section id="nameStep"'),html.indexOf('</section>',html.indexOf('<section id="nameStep"')));
 const song=html.slice(html.indexOf('<section id="songStep"'),html.indexOf('<div class="song-top">'));
 assert.doesNotMatch(header,/ENTER YOUR NAME|listTitle/);
 assert.doesNotMatch(html,/id="listTitle"/);
 assert.ok(name.indexOf('ENTER YOUR NAME')<name.indexOf('Who is singing?'));
 assert.ok(name.indexOf('name-screen-footer')>name.indexOf("Enter your name, then choose"));
 assert.match(song,/CHOOSE YOUR SONG/);
 assert.match(css,/\.brand \{[^}]*font-size: 23px/);
 assert.match(css,/\.name-step-title \{[^}]*font-size: 40px/);
 assert.match(css,/\.help \{[^}]*font-size: 20px/);
 assert.match(css,/\.name-screen-footer \{[^}]*margin: 100px 0 0/);
 assert.doesNotMatch(html,/id="songFooter"/);
 assert.match(script,/layoutSongScreen\(\)/);
 assert.doesNotMatch(script,/el\('listTitle'\)/);
 assert.doesNotMatch(script,/el\('stepTitle'\)/);
});

test('iPad 2 scroll pane reserves request panel and allows complete list scroll',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.match(html,/id="songBottom"/);
 assert.doesNotMatch(html,/id="songFooter"/);
 assert.match(css,/\.songs \{ position: fixed;[^}]*overflow-y: scroll/);
 assert.match(css,/\.song-bottom \{ position: absolute;[^}]*bottom: 0/);
 assert.match(script,/list\.style\.height = 'auto'/);
 assert.match(script,/list\.style\.bottom = Math\.ceil\(bottom\.offsetHeight \+ bottomInset \+ 8\)/);
 assert.match(script,/root\.navigator\.standalone === true/);
 assert.match(script,/bottom\.getBoundingClientRect\(\)\.top/);
 assert.match(css,/\.song-bottom \{[^}]*position: fixed; bottom: 8px/);
 assert.match(script,/root\.addEventListener\('orientationchange', settleSongLayout\)/);
 assert.match(css,/#nameStep \{[^}]*padding: 11% 16px 0/);
 assert.match(css,/\.instruction \{[^}]*margin: 8px 0 44px/);
});

test('explicit public setlist is authoritative for kiosk publisher; no secret song fields',()=>{
 const host=fs.readFileSync(path.join(root,'ls26try/shared/signup-kiosk.js'),'utf8');
 const publicList=fs.readFileSync(path.join(root,'ls26try/list/js/songlist.js'),'utf8');
 assert.match(publicList,/Individual publicSongListVisible flags do not hide songs/);
 assert.doesNotMatch(host,/value\.publicSongListVisible===false/);
 assert.match(host,/selectedSongCount:ids\.length,publishedSongCount:Object\.keys\(songs\)\.length/);
 assert.match(host,/value:\{title,artist\}/);
 assert.match(host,/Kiosk published: /);
 const page=fs.readFileSync(path.join(root,'ls26try/requests.html'),'utf8');
 assert.match(page,/id="kioskCount"/);
 assert.match(page,/signup-kiosk\.js\?v=20261103-full-setlist/);
});
test('confirmation box has a bounded height, larger messages and vertical centering',()=>{
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 assert.match(css,/\.success \{[^}]*-webkit-flex: 0 0 auto/);
 assert.match(css,/\.success \{[^}]*-webkit-justify-content: center/);
 assert.match(css,/\.success \{[^}]*max-height: 60vh/);
 assert.match(css,/\.success p \{[^}]*font-size: 25px/);
 assert.match(css,/\.success p \+ p \{[^}]*margin-top: 30px/);
});

test('publisher projects all 169 explicitly selected songs, even if global visibility is false',()=>{
 const source=fs.readFileSync(path.join(root,'ls26try/shared/signup-kiosk.js'),'utf8');
 const window={LKSignupPolicy:{},LS26SignupKiosk:null};
 const document={readyState:'loading',currentScript:{src:'https://livesuite.livekaraoke.eu/ls26try/shared/signup-kiosk.js'},addEventListener(){}};
 const context={window,document,URL,ArtistNames:{display:value=>String(value||'')},LS26:{escape:value=>String(value)}};
 vm.runInNewContext(source,context);
 const documents=Array.from({length:169},(_,i)=>({
   id:'song'+i,
   data:()=>({title:'Song '+i,artist:'Artist',publicSongListVisible:i<98?false:true,
     lyrics:'PRIVATE LYRICS',hostNote:'PRIVATE NOTE'})
 }));
 const projected=window.LS26SignupKiosk.projectSongs(documents);
 assert.equal(Object.keys(projected).length,169);
 assert.equal(projected.song0.title,'Song 0');
 assert.equal(projected.song168.title,'Song 168');
 assert.deepEqual(Object.keys(projected.song0).sort(),['artist','title']);
 assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
 assert.throws(()=>window.LS26SignupKiosk.projectSongs([{id:'missing',data:()=>({artist:'Artist'})}]),/title/);
});

test('semi-transparent touch-size refresh control works on all screens without silently dropping a request',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.match(html,/id="pageRefresh"[^>]*aria-label="Refresh signup page"/);
 assert.match(css,/\.page-refresh \{[^}]*width: 52px; height: 52px;/);
 assert.match(css,/\.page-refresh \{[^}]*opacity: \.24;/);
 assert.match(script,/el\('pageRefresh'\)\.onclick = function/);
 assert.match(script,/root\.location\.reload\(\)/);
 assert.match(script,/Refreshing will clear the name and song/);
 assert.match(script,/Check with the host before clearing this form/);
 assert.match(script,/el\('pageRefresh'\)\.disabled = busy/);
});

test('kiosk status reads are session scoped, field limited and do not fetch requester details',()=>{
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.match(script,/publicSites\/live-karaoke\/views\/live/);
 assert.match(script,/collectionId: 'publicSongRequests'/);
 assert.match(script,/fieldPath: 'songId'/);
 assert.match(script,/fieldPath: 'status'/);
 assert.match(script,/fieldPath: 'sessionId'/);
 const start=script.indexOf("xhr('POST', base + ':runQuery'");
 const end=script.indexOf("}, function (error, records)",start);
 const query=script.slice(start,end);
 assert.doesNotMatch(query,/singerName|requesterName|note|lyrics|hostNote/);
 assert.match(script,/function songUnavailable\(id\)/);
 assert.match(script,/row\.button\.disabled = !!reason/);
 assert.match(script,/localBlocked\[selected\.id\] = 'REQUESTED'/);
 assert.match(script,/value === 'played' \|\| value === 'completed'/);
 assert.doesNotMatch(script,/onSnapshot|setInterval/);
});
test('touch affordances, no browser confirm, viewport sizing and custom refresh dialog',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.match(html,/id="refreshDialog"/);
 assert.match(html,/id="singerDisplay"/);
 assert.doesNotMatch(html,/autofocus/);
 assert.match(css,/#signupForm\.song-active \{ position: absolute; top: 66px;/);
 assert.match(css,/#singerDisplay \{ font-size: 27px/);
 assert.match(css,/\.note-toggle \{[^}]*font-size: 20px/);
 assert.match(css,/\.selection \{[^}]*font-size: 22px/);
 assert.match(css,/\.primary:not\(:disabled\) \{ background: #156b3c/);
 assert.match(css,/\.send:not\(:disabled\) \{ background: #146b3b/);
 assert.match(script,/openRefreshDialog\('Refreshing/);
 assert.doesNotMatch(script,/root\.confirm\(|window\.confirm\(/);
});

test('artwork and session gate, eight-second return, no new data model',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const script=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.ok(fs.statSync(path.join(root,'signup/assets/click-to-sing.jpg')).size>100000);
 assert.ok(fs.statSync(path.join(root,'signup/assets/requests-closed.jpg')).size>100000);
 assert.match(html,/id="idleScreen" class="idle-screen is-closed"/);
 assert.match(css,/\.idle-screen\.is-open \{ background-image: url\("assets\/click-to-sing\.jpg"\)/);
 assert.match(css,/\.idle-screen\.is-closed \{ background-image: url\("assets\/requests-closed\.jpg"\)/);
 assert.match(css,/background-size: auto 92%/);
 assert.match(script,/resetTimer = setTimeout\(function \(\) \{[\s\S]*?\}, 8000\)/);
 assert.match(script,/songGate\.songsEnabled === true/);
 assert.match(script,/control\.active === true && actual === linked/);
 assert.match(script,/kiosk\.enabled === true/);
 assert.match(script,/check\('karaokeControl\/currentSession', 'control'\)/);
 assert.match(script,/check\('karaoke\/state', 'songGate'\)/);
 assert.match(script,/check\('karaokeControl\/signupKioskPublic', 'kiosk'\)/);
 assert.match(script,/focusName\(\); \/\/ Synchronous with the physical tap/);
 assert.doesNotMatch(script,/setInterval/);
});

test('cancel stays in the top-left header, returns to artwork and blurs the keyboard',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const js=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 const header=html.slice(html.indexOf('<header>'),html.indexOf('</header>'));
 const song=html.slice(html.indexOf('<section id="songStep"'),html.indexOf('</section>',html.indexOf('<section id="songStep"')));
 assert.match(header,/id="cancel"/);
 assert.doesNotMatch(header,/id="back"/);
 assert.doesNotMatch(song,/id="back"|id="cancel"/);
 assert.match(css,/header \.cancel-button \{[^}]*top: 0; left: 0/);
 assert.match(js,/el\('cancel'\)\.hidden = which !== 'song'/);
 assert.match(js,/el\('cancel'\)\.onclick = function \(\) \{[\s\S]*?showIdle\(gateOpen \? 'open' : 'closed'\);[\s\S]*?resetForm\(\)/);
 assert.match(js,/if \(el\('singerName'\)\.blur\) \{ el\('singerName'\)\.blur\(\); \}/);
 assert.match(js,/if \(el\('songSearch'\)\.blur\) \{ el\('songSearch'\)\.blur\(\); \}/);
 assert.match(js,/row\.status\.textContent = reason === 'PLAYED' \? 'ALREADY PLAYED'/);
 assert.match(js,/reason === 'REQUESTED' \? 'ALREADY REQUESTED'/);
 assert.match(css,/background-size: auto 92%; -webkit-background-size: auto 92%/);
 assert.match(css,/background-position: center center/);
});

test('landing and repeat-song changes keep the keyboard unfocused until a user tap',()=>{
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
 const js=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
 assert.doesNotMatch(html,/autofocus/);
 assert.match(html,/id="idleQueue"/);
 assert.match(html,/id="queueNowSong"/);
 assert.match(html,/id="queueNextSong3"/);
 assert.match(html,/id="anotherSong"/);
 assert.match(css,/\.idle-screen\.is-open \.idle-brand-art \{[^}]*height: 60%/);
 assert.match(css,/background-size: contain; -webkit-background-size: contain/);
 assert.match(css,/\.idle-screen\.is-open \.idle-queue \{[^}]*height: 40%/);
 assert.match(js,/el\('idleScreen'\)\.onclick = function/);
 assert.match(js,/focusName\(\); \/\/ Synchronous with the physical tap/);
 assert.doesNotMatch(js,/setTimeout\(focusName, 0\)/);
 assert.match(js,/el\('anotherSong'\)\.onclick = function/);
 assert.match(js,/repeatSinger = trim\(el\('singerName'\)\.value\)/);
 assert.match(js,/refreshLandingQueue\(linked\)/);
 assert.match(js,/publicSites\/live-karaoke\/views\/live/);
 assert.doesNotMatch(js,/karaokeControl\/runOrder/);
});
test('public stage projection only includes the visible current and next three stage names',()=>{
 const projection=require('../../js/public-live-projection.js');
 const rows=[
   {id:'a',songId:'a',songTitle:'On stage',singerName:'Alice',status:'playing',note:'SECRET'},
   {id:'b',songId:'b',songTitle:'First up',singerName:'Bob',status:'queued',note:'SECRET'},
   {id:'c',songId:'c',songTitle:'Second up',singerName:'Cara',status:'pending',note:'SECRET'},
   {id:'d',songId:'d',songTitle:'Third up',singerName:'Dan',status:'queued',note:'SECRET'},
   {id:'e',songId:'e',songTitle:'Fourth up',singerName:'Eve',status:'queued',note:'SECRET'},
   {id:'f',songId:'f',songTitle:'Already played',singerName:'Frank',status:'played',note:'SECRET'}
 ];
 const input={control:{active:true,sessionId:'public-session',act:'live-karaoke',publicVisibility:'public'},
   session:{id:'public-session',status:'active',publicVisibility:'public'},
   event:{},karaoke:{songsEnabled:true},
   run:{sessionId:'public-session',items:rows},requests:[]};
 const publicView=projection.live(input,'live-karaoke');
 assert.deepEqual(publicView.kioskQueue,{
   current:{songTitle:'On stage',singerName:'Alice'},
   next:[{songTitle:'First up',singerName:'Bob'},
     {songTitle:'Second up',singerName:'Cara'},
     {songTitle:'Third up',singerName:'Dan'}]
 });
 assert.ok(!JSON.stringify(publicView.kioskQueue).includes('Eve'));
 assert.ok(!JSON.stringify(publicView.kioskQueue).includes('SECRET'));
 assert.ok(!JSON.stringify(publicView.kioskQueue).includes('Frank'));
 assert.deepEqual(projection.live(input,'roxanna').kioskQueue,{current:null,next:[]});
 input.karaoke.songsEnabled=false;
 assert.deepEqual(projection.live(input,'live-karaoke').kioskQueue,{current:null,next:[]});
});

test('full artwork, large queue, visible Android SEND and readable note',()=>{
  const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'signup/signup.css'),'utf8');
  const js=fs.readFileSync(path.join(root,'signup/signup.js'),'utf8');
  assert.match(css,/\.idle-screen\.is-open \.idle-brand-art \{[^}]*height: 57%/);
  assert.match(css,/background-size: contain; -webkit-background-size: contain/);
  assert.match(css,/\.idle-screen\.is-open \.idle-queue \{ height: 43%/);
  assert.match(css,/\.idle-row-info strong \{ font-size: 25px/);
  assert.match(css,/\.idle-row-info span \{ font-size: 20px/);
  assert.match(css,/\.song-bottom \{[^}]*position: fixed; bottom: 8px/);
  assert.match(css,/#note \{[^}]*font-size: 24px/);
  assert.match(css,/\.note-toggle \{[^}]*min-height: 62px/);
  assert.match(css,/clip: rect\(0,0,0,0\)/);
  assert.match(html,/id="selection" class="selection" role="status" aria-live="polite"><\/span>/);
  assert.match(js,/root\.visualViewport\.addEventListener\('resize', layoutSongScreen\)/);
  assert.match(js,/bottomTop = bottom\.getBoundingClientRect\(\)\.top/);
  assert.match(js,/kiosk\.queueSessionId === linked && kiosk\.kioskQueue/);
  assert.match(js,/el\('anotherSong'\)\.onclick = function \(\) \{[\s\S]*?resetForm\(\);\s*focusName\(\)/);
  assert.doesNotMatch(js,/el\('singerName'\)\.value = sameSinger/);
});
test('kiosk Run Order publisher is session-gated and does not clone the private queue',()=>{
  const pub=fs.readFileSync(path.join(root,'ls26try/shared/public-live-publisher.js'),'utf8');
  const projection=require('../../js/public-live-projection.js');
  const input={run:{sessionId:'gig',items:[
    {songTitle:'Currently on',singerName:'Anna',status:'playing',requesterNote:'PRIVATE'},
    {songTitle:'Next',singerName:'Bob',status:'queued',hostNote:'PRIVATE'},
    {songTitle:'Later',singerName:'Cara',status:'queued'},
    {songTitle:'Fourth',singerName:'Dan',status:'queued'},
    {songTitle:'Fifth',singerName:'Eve',status:'queued'}
  ]},requests:[]};
  const queue=projection.stageQueue(input,'gig');
  assert.deepEqual(queue,{current:{songTitle:'Currently on',singerName:'Anna'},
    next:[{songTitle:'Next',singerName:'Bob'},
      {songTitle:'Later',singerName:'Cara'},
      {songTitle:'Fourth',singerName:'Dan'}]});
  assert.equal(JSON.stringify(queue).includes('PRIVATE'),false);
  assert.deepEqual(projection.stageQueue(input,'wrong'),{current:null,next:[]});
  assert.match(pub,/LKPublicVisibility\.act\(input\.control\)==='live-karaoke'/);
  assert.match(pub,/queueSessionId/);
  assert.match(pub,/tx\.update\(kioskRef,\{queueSessionId,kioskQueue:queue\}\)/);
  assert.doesNotMatch(pub,/collection\('lyrics'\)/);
});
