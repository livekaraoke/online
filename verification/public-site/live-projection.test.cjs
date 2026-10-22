const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const P=require('../../js/public-live-projection.js'),policy=require('../../js/public-visibility.js');
const source={control:{active:true,sessionId:'s',eventId:'e',type:'Live Karaoke',venue:'Whyte Harte',privateKey:'PRIVATE'},
  session:{id:'s',status:'active',actualStartedAt:1,hostNotes:'PRIVATE',breakOpen:false},
  event:{id:'e',type:'Live Karaoke',venue:'Whyte Harte',status:'Confirmed',date:'2026-10-28',startTime:'20:00',contactEmail:'PRIVATE'},
  karaoke:{songsEnabled:true,venueAccessCode:'PRIVATE'},
  run:{sessionId:'s',items:[{id:'1',songId:'one',status:'playing',songTitle:'One',singerName:'PRIVATE',timing:{secret:'PRIVATE'}},{id:'2',songId:'two',status:'queued',songTitle:'Two',note:'PRIVATE'},{songId:'old',status:'played'},{songId:'gone',status:'cancelled'}]},
  requests:[{id:'r',sessionId:'s',songId:'one',status:'active',singerName:'PRIVATE',requesterEmailHash:'PRIVATE',note:'PRIVATE'},{sessionId:'other',songId:'no',status:'active'}]};
test('live projection keeps public song identity while removing every private field',()=>{
  const value=P.live(source,'live-karaoke');assert.equal(JSON.stringify(value).includes('PRIVATE'),false);
  assert.deepEqual(value.run.items.map(x=>x.songId),['one','two']);
  assert.deepEqual(value.availability,[{songId:'one',status:'active'},{songId:'old',status:'played'}]);
  assert.equal(value.karaoke.venueCodeRequired,true);assert.equal(value.session.actualStartedAt,true);
  assert.deepEqual(Object.keys(value.session),['id','status','isActive','publicVisibility','breakOpen','actualStartedAt','venue']);
});
test('other acts, tests, mismatched sessions, ended sessions and stale queues cannot be published as live',()=>{
  for(const act of ['billy-lee','roxanna'])assert.equal(P.live(source,act).sessionId,'');
  for(const override of [{control:{...source.control,venue:'0 The Test Venue'}},{event:{...source.event,publicVisibility:'private'}},{session:{...source.session,endedAt:1}},{session:{...source.session,id:'old'}}]){
    const result=P.live({...source,...override},'live-karaoke');assert.equal(result.control.active,false);assert.equal(result.run.items.length,0);assert.equal(result.availability.length,0);
  }
  assert.equal(P.live({...source,run:{...source.run,sessionId:'old'}},'live-karaoke').run.items.length,0);
  assert.equal(P.live({...source,run:{sessionId:'s',items:[{songId:'one',requestId:'cancelled',status:'queued'}]},requests:[{id:'cancelled',sessionId:'s',songId:'one',status:'cancelled'}]},'live-karaoke').run.items.length,0,'a cancelled request cannot linger in Coming Up');
  assert.equal(P.live({...source,session:{...source.session,breakOpen:true}},'live-karaoke').session.breakOpen,true);
});
test('event/settings projection preserves Malta dates and explicitly approved fields only',()=>{
  const events=P.events([source.event,{...source.event,id:'private',publicVisibility:'private'},{...source.event,id:'old',date:'2025-01-01'},{...source.event,id:'cancelled',status:'Cancelled'},{...source.event,id:'other',type:'Roxanna'}],'live-karaoke',Date.parse('2026-10-22T04:00:00Z'));
  assert.equal(events.events.length,1);assert.equal(events.events[0].scheduledStartAt,'2026-10-28T19:00:00.000Z');assert.equal(JSON.stringify(events).includes('PRIVATE'),false);
  const settings=P.settings({categories:[{id:'rock',label:'Rock',songIds:['a'],hostNotes:'PRIVATE'}],venueAccessCode:'PRIVATE',enableLiveRequestTestMode:true},'live-karaoke');
  assert.equal(JSON.stringify(settings).includes('PRIVATE'),false);assert.equal(settings.settings.enableLiveRequestTestMode,undefined);
});
test('projected venue gate requires a QR code but leaves exact validation to private Firestore rules',()=>{
  const value={...P.live(source,'live-karaoke'),loaded:true,error:false};
  assert.equal(policy.gate(value).open,false);assert.equal(policy.gate(value,{vac:'from-QR'}).open,true);
  assert.equal(policy.gate(value,{vac:'from-QR',sessionId:'other'}).open,false);
});
test('projected store uses three shared view listeners, expires without polling and never falls back',()=>{
  const callbacks={},timers=new Map(),reads=[],events={};let nextTimer=0;
  function ref(path){return {collection:n=>ref(path+'/'+n),doc:n=>ref(path+'/'+n),onSnapshot(fn,error){reads.push(path);callbacks[path]={fn,error};return()=>{};}};}
  const context={window:{},Date,Set,Map,setTimeout:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),addEventListener:(n,fn)=>events[n]=fn};
  context.window=context;context.parent=context;context.LK_PUBLIC_LIVE_V1={'live-karaoke':true};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../js/public-live-store.js'),'utf8'),context);
  const db={collection:n=>ref(n)};context.LKPublicStore.start(db);context.LKPublicStore.start(db);
  assert.equal(reads.length,3);assert.ok(reads.every(p=>p.startsWith('publicSites/live-karaoke/views/')));
  const deliver=(view,value)=>callbacks['publicSites/live-karaoke/views/'+view].fn({exists:true,data:()=>value});
  deliver('live',{...P.live(source,'live-karaoke'),expiresAt:{seconds:(Date.now()+60000)/1000}});
  deliver('events',P.events([],'live-karaoke'));deliver('settings',P.settings({},'live-karaoke'));
  assert.equal(context.LKPublicStore.get().loaded,true);assert.equal(context.LKPublicStore.get().control.active,true);
  [...timers.values()][0]();assert.equal(context.LKPublicStore.get().control.active,false);assert.equal(context.LKPublicStore.get().error,true);
  deliver('live',{...P.live(source,'live-karaoke'),expiresAt:{seconds:(Date.now()+60000)/1000}});
  assert.equal(context.LKPublicStore.get().error,false,'fresh reconnection restores state');
  callbacks['publicSites/live-karaoke/views/live'].error(Error('permission-denied'));
  assert.equal(context.LKPublicStore.get().control.active,false);assert.equal(reads.length,3,'no private source fallback');
  events.pagehide();assert.equal(timers.size,0);
});
