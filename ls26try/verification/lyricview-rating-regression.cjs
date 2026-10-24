/* Browser-free behavioural test: real end-rating controller, mocked DOM + Firestore. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'host/js/lyricview-end-rating.js'),'utf8');
const labels=['great','good','average','weak',''];
const buttons=labels.map(value=>({
 dataset:{crowdRating:value},disabled:true,pressed:'false',
 classList:{classes:new Set(),toggle(name,on){if(on)this.classes.add(name);else this.classes.delete(name);},contains(name){return this.classes.has(name)}},
 setAttribute(k,v){if(k==='aria-pressed')this.pressed=v;},
 closest(){return this}
}));
const status={textContent:'',classList:{classes:new Set(),toggle(name,on){if(on)this.classes.add(name);else this.classes.delete(name);},contains(name){return this.classes.has(name)}}};
const card={querySelectorAll:()=>buttons,contains:b=>buttons.includes(b)};
const elements={endSongRating:card,endRatingStatus:status};
const listeners={},windowListeners={};
const data={status:'completed',songId:'s42'};
const writes=[],deleted=Symbol('delete');
let fail=false;
const db={
 collection(name){assert.equal(name,'performanceSessions');return {doc(session){assert.equal(session,'gig123');return {collection(col){assert.equal(col,'performedSongs');return {doc(id){assert.equal(id,'perf789');return {id,session};}};}};}};},
 async runTransaction(fn){
  const tx={async get(ref){assert.equal(ref.id,'perf789');return {exists:true,data:()=>({...data})};},
    update(ref,patch){assert.equal(ref.id,'perf789');writes.push(patch);
      if(patch.crowdResponse===deleted)delete data.crowdResponse;else data.crowdResponse=patch.crowdResponse;}};
  if(fail)throw Error('network unavailable');
  return fn(tx);
 }
};
const context={window:{LK:{db},addEventListener:(name,cb)=>windowListeners[name]=cb},
  document:{readyState:'complete',getElementById:id=>elements[id],addEventListener:(name,cb)=>listeners[name]=cb},
  firebase:{firestore:{FieldValue:{delete:()=>deleted}}},console,Promise};
vm.createContext(context);vm.runInContext(source,context);
const signal={detail:{sessionId:'gig123',performanceId:'perf789',songId:'s42'}};
async function tap(value){
 const b=buttons.find(x=>x.dataset.crowdRating===value);
 await listeners.click({target:b});return b;
}
(async()=>{
 assert.ok(buttons.every(x=>x.disabled),'No ratings allowed before confirmed completion');
 assert.equal(writes.length,0);
 windowListeners['ls26:performance-completed'](signal);
 assert.ok(buttons.every(x=>!x.disabled),'Completed record enables rating choices');
 let selected=await tap('great');
 assert.equal(data.crowdResponse,'great');
 assert.equal(writes.length,1);
 assert.equal(selected.pressed,'true');
 assert.match(status.textContent,/Saved: Great response/);
 await tap('great');assert.equal(writes.length,1,'Same rating should not write twice');
 await tap('good');assert.equal(data.crowdResponse,'good');
 fail=true;await tap('average');
 assert.equal(data.crowdResponse,'good','Failed write cannot change persisted rating');
 assert.equal(buttons[1].pressed,'true','Failed write retains saved selection');
 assert.ok(status.classList.contains('is-error'),'Failed write must show error');
 fail=false;await tap('');
 assert.ok(!Object.hasOwn(data,'crowdResponse'),'Not rated clears the existing field');
 assert.equal(writes.at(-1).crowdResponse,deleted);
 assert.equal(writes.length,3);
 assert.ok(!source.includes("addEventListener('lk:runorder")&&!source.includes("onSnapshot"),'No new real-time listeners');
 console.log('PASS ratings after COMPLETE: save great/good, avoid duplicate writes, recover errors, clear Not rated without new collections');
})().catch(e=>{console.error(e);process.exitCode=1});
