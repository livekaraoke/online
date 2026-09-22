const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
function addon(){
 const listeners={},select={value:'',options:[],disabled:false,addEventListener(n,f){this[n]=f;},set innerHTML(v){this.options=[...v.matchAll(/value="([^"]*)"/g)].map(m=>({value:m[1]}));this.value='';}},status={style:{}};
 const refs=name=>({onSnapshot(f){listeners[name]=f;},doc(id){return refs(name+'/'+id)},async set(){throw Error('Idle selections must not write');}});
 const c={document:{readyState:'complete',getElementById:id=>id==='publicSetlistSelect'?select:id==='publicSetlistSaveStatus'?status:null},db:{collection:refs},console,setTimeout(){}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'admin-new/js/public-setlist-session-addon.js'),'utf8'),c);
 const snapshot=data=>({exists:true,data:()=>data});
 return {c,select,status,lists:()=>listeners.lyricsSetlists({docs:[{id:'a',data:()=>({name:'List A',songIds:['song']})}]}),control:data=>listeners['karaokeControl/currentSession'](snapshot(data)),published:()=>listeners['karaokeControl/publicSongList'](snapshot({setlistId:'a',setlistName:'List A'}))};
}
test('old published list never prefills idle session, regardless of snapshot order',()=>{
 for(const order of [['published','control','lists'],['lists','control','published'],['control','published','lists']]){
 const f=addon();for(const name of order)name==='control'?f.control({active:false}):f[name]();assert.equal(f.select.value,'');assert.equal(f.c.LS26PublicList.selectionForStart(),null);
 }
});
test('explicit idle choice survives updates but resets after an active session ends',async()=>{
 const f=addon();f.lists();f.control({active:false});f.published();f.select.value='a';await f.select.change();assert.equal(f.c.LS26PublicList.selectionForStart().id,'a');f.published();f.lists();f.control({active:false});assert.equal(f.select.value,'a');
 f.control({active:true,sessionId:'session'});assert.equal(f.select.value,'a');assert.equal(f.c.LS26PublicList.selectionForStart(),null);f.control({active:false,sessionId:null});assert.equal(f.select.value,'');assert.equal(f.c.LS26PublicList.selectionForStart(),null);
});
function lifecycle({choice=null,active=false,deleted=false,fail=false}={}){
 const writes=[],messages=[];let commits=0;
 const ref=(collection,id)=>({collection,id});
 const db={collection:name=>({doc:id=>ref(name,id||'new-session')}),async runTransaction(fn){const pending=[];await fn({get:async r=>r.collection==='lyricsSetlists'?{exists:!deleted,data:()=>({name:'Fresh List',songIds:['one','two']})}:{data:()=>({active})},set:(r,data)=>pending.push({r,data})});if(fail)throw Error('Permission denied');writes.push(...pending);commits++;}};
 const c={window:{LS26PublicList:{selectionForStart:()=>choice},getSelectedSessionEvent:()=>({id:'gig',name:'Gig'})},LK:{db,state:{}},$:()=>({focus(){}}),setSessionStatus:m=>messages.push(m),nowTimestamp:()=>123,serverNow:()=>456,updateSessionUi(){},console};
 vm.createContext(c);const source=fs.readFileSync(path.join(root,'admin-new/js/sessions.js'),'utf8');vm.runInContext(source.slice(source.indexOf('  let startingPerformance'),source.indexOf('  async function endPerformance()')),c);
 return {c,writes,messages,commits:()=>commits};
}
test('start without explicit choice performs no writes',async()=>{const f=lifecycle();await f.c.startPerformance();assert.equal(f.writes.length,0);assert.match(f.messages[0],/Choose a public song list/);});
test('start atomically publishes selected list and session',async()=>{const f=lifecycle({choice:{id:'a',name:'List A'}});await f.c.startPerformance();assert.equal(f.commits(),1);assert.equal(f.writes.length,4);assert.equal(f.writes.find(x=>x.r.id==='publicSongList').data.songCount,2);assert.equal(f.writes.find(x=>x.r.collection==='performanceSessions').data.publicSetlistId,'a');});
test('active session, deleted list or failed transaction cannot partially start a session',async()=>{
 for(const opts of [{active:true},{deleted:true},{fail:true}]){const f=lifecycle({...opts,choice:{id:'a',name:'List A'}});await f.c.startPerformance();assert.equal(f.writes.length,0);assert.equal(f.c.LK.state.currentSessionId,undefined);assert.ok(f.messages.length);}
});
test('double start is guarded while the first request is pending',async()=>{const f=lifecycle({choice:{id:'a',name:'List A'}});await Promise.all([f.c.startPerformance(),f.c.startPerformance()]);assert.equal(f.commits(),1);});
