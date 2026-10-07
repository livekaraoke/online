const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const api=require('../../signup/signup.js'),root=path.resolve(__dirname,'../..');
test('ES5 syntax for every kiosk script and inline alias',()=>{
 const acorn=require(require.resolve('acorn',{paths:[process.env.LS26_KIOSK_TEST_MODULES||process.cwd()]}));
 for(const file of ['signup/signup.js','signup/kiosk-policy.js'])acorn.parse(fs.readFileSync(path.join(root,file),'utf8'),{ecmaVersion:5});
 const alias=fs.readFileSync(path.join(root,'signup/index.html'),'utf8');acorn.parse(alias.match(/<script>([\s\S]*?)<\/script>/)[1],{ecmaVersion:5});
 const html=fs.readFileSync(path.join(root,'signup/sign up.html'),'utf8');assert.doesNotMatch(html,/firebasejs|type="module"|framework|ls26try/);
});
test('rollout defaults closed until deployed security rules are verified',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'signup/kiosk-policy.js'),'utf8'),context);assert.equal(context.window.LKSignupPolicy.rulesVerified,false);
});
test('token parsing does not depend on URLSearchParams',()=>{assert.equal(api.param('k','?k=abc%20def'),'abc def');assert.equal(api.param('k','?k=%xx'),'');assert.equal(api.param('k','?other=x'),'');assert.ok(api.tokenValid('a'.repeat(64)));assert.ok(!api.tokenValid('ABCD'));});
const songs=[{id:'one',title:'Wonderwall',artist:'Oasis'},{id:'two',title:'Zombie',artist:'The Cranberries'}];
test('search is local, case insensitive, title and artist',()=>{assert.deepEqual(api.filterSongs(songs,'WONDER'),[songs[0]]);assert.deepEqual(api.filterSongs(songs,'cranb'),[songs[1]]);assert.equal(api.filterSongs(songs,'missing').length,0);});
test('required name/song, optional bounded note',()=>{assert.ok(api.validForm('Alex',songs[0],''));assert.ok(!api.validForm(' ',songs[0],''));assert.ok(!api.validForm('Alex',null,''));assert.ok(!api.validForm('a'.repeat(81),songs[0],''));assert.ok(!api.validForm('Alex',songs[0],'x'.repeat(301)));});
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
