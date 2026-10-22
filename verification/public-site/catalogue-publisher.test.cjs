const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const projection=require('../../js/public-catalogue-projection.js');
const source=fs.readFileSync(path.join(__dirname,'../../ls26try/shared/public-catalogue-publisher.js'),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,220));
function fixture(email='leeborg23@gmail.com'){
 const records={'publicPublication/config':{cataloguesEnabled:false},'karaokeControl/currentSession':{active:false},'karaokeControl/publicSongList':{setlistId:'lk'},'karaokeControl/liveKaraokeWebsiteSettings':{defaultBrowseSetlistId:'lk'},'karaokeControl/billyLeeWebsiteSettings':{defaultBrowseSetlistId:'solo'},'karaokeControl/roxannaWebsiteSettings':{defaultBrowseSetlistId:'rox'},'lyricsSetlists/lk':{name:'Live Karaoke',songIds:['a']},'lyricsSetlists/solo':{name:'Solo',songIds:['b']},'lyricsSetlists/rox':{name:'Roxanna',songIds:['c']},'lyrics/a':{title:'Alpha',artist:'A',lyrics:'PRIVATE'},'lyrics/b':{title:'Bravo',artist:'B',hostNote:'PRIVATE'},'lyrics/c':{title:'Charlie',artist:'C',timing:'PRIVATE'}};
 const listeners=new Set(),writes=[],events={};
 const snap=p=>({id:p.split('/').pop(),exists:!!records[p],data:()=>records[p],metadata:{fromCache:false}});
 const read=(p,ids)=>ids?{docs:ids.map(id=>snap(p+'/'+id)).filter(x=>x.exists),metadata:{fromCache:false}}:snap(p);
 function update(p,d){records[p]=d;for(const l of [...listeners])if(l.p===p||(l.ids&&p.startsWith(l.p+'/')))l.fn(read(l.p,l.ids));}
 function ref(p,ids){return{path:p,id:p.split('/').pop(),collection:n=>ref(p+'/'+n),doc:n=>ref(p+'/'+n),where:(_f,_op,v)=>ref(p,v),get:async()=>read(p,ids),set:async(d,o)=>{writes.push(p);update(p,o?.merge?{...records[p],...d}:d);},onSnapshot(fn){const l={p,ids,fn};listeners.add(l);queueMicrotask(()=>fn(read(p,ids)));return()=>listeners.delete(l);}};}
 const db={collection:n=>ref(n),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,d)=>r.set(d)})};
 const user={email},auth={currentUser:user,onAuthStateChanged(fn){queueMicrotask(()=>fn(user));return()=>{};}};
 const firestore=()=>db;firestore.FieldPath={documentId:()=> '__name__'};
 const context={URL,Map,Set,Promise,JSON,Object,String,Array,Error,setTimeout,clearTimeout,navigator:{},LKCatalogueProjection:projection,
  document:{currentScript:{src:'https://example.test/ls26try/shared/public-catalogue-publisher.js'},readyState:'complete'},
  firebase:{auth:()=>auth,firestore,apps:[{}],app:()=>({options:{projectId:'demo-lk-public'}})},addEventListener:(name,fn)=>events[name]=fn};
 context.window=context;vm.runInNewContext(source,context);
 return{records,writes,update,publisher:context.LS26CataloguePublisher,close:()=>events.pagehide(),listeners};
}
test('owner publisher derives three isolated repertoires and follows source edits without private fields',async()=>{
 const f=fixture();try{
  await settle();assert.equal(f.writes.length,0,'disabled by default');await f.publisher.enable();await settle();
  for(const [act,id]of [['live-karaoke','a'],['billy-lee','b'],['roxanna','c']]){const v=f.records[`publicSites/${act}/views/catalogue`];assert.equal(v.songs[0].id,id);assert.equal(JSON.stringify(v).includes('PRIVATE'),false);}
  const before=f.writes.length;f.update('lyrics/a',{...f.records['lyrics/a'],title:'Alpha edited'});await settle();assert.equal(f.records['publicSites/live-karaoke/views/catalogue'].songs[0].title,'Alpha edited');assert.equal(f.writes.length,before+1);
  f.update('lyricsSetlists/lk',{name:'Live Karaoke',songIds:['b']});await settle();assert.equal(f.records['publicSites/live-karaoke/views/catalogue'].songs[0].id,'b');
  await f.publisher.disable();await settle();const count=f.writes.length;f.update('lyrics/b',{title:'Paused'});await settle();assert.equal(f.writes.length,count);
 }finally{f.close();}
});
test('a signed-in stranger cannot activate the publisher or subscribe to private sources',async()=>{const f=fixture('stranger@example.com');try{await settle();await assert.rejects(f.publisher.enable(),/owner/);assert.equal(f.listeners.size,0);}finally{f.close();}});
