const test = require('node:test');
const assert = require('node:assert/strict');
const capability = require('../shared/public-request-capability.js');

function fixture(){
  const writes=[];
  const directSets=[];
  const storage=new Map();
  let nextId=0;

  function doc(collectionName,id){
    return {
      id,
      path:`${collectionName}/${id}`,
      set(data,options){directSets.push({path:this.path,data,options});return Promise.resolve();}
    };
  }

  const db={
    collection(name){
      return {
        name,
        doc(id){return doc(name,id===undefined?`auto-${++nextId}`:id);},
        add(data){const ref=doc(name,`legacy-${++nextId}`);directSets.push({path:ref.path,data,add:true});return Promise.resolve(ref);},
        where(){return {get(){return Promise.resolve({docs:[]});}};}
      };
    },
    batch(){
      const staged=[];
      return {
        set(ref,data,options){staged.push({path:ref.path,data,options});return this;},
        async commit(){writes.push(staged.slice());}
      };
    }
  };

  const firebase={firestore:{FieldValue:{serverTimestamp:()=>({__serverTimestamp:true})}}};
  const localStorage={
    getItem(key){return storage.has(key)?storage.get(key):null;},
    setItem(key,value){storage.set(key,String(value));},
    removeItem(key){storage.delete(key);}
  };
  const cryptoApi={getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(i+17)&255;return bytes;}};
  const wrapped=capability.wrap({db,firebase,storage:localStorage,cryptoApi});
  return {wrapped,writes,directSets,storage};
}

test('new public request creates request and private capability atomically',async()=>{
  const f=fixture();
  const ref=await f.wrapped.collection('publicSongRequests').add({sessionId:'s1',source:'test'});
  assert.equal(ref.id,'auto-1');
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].length,2);
  assert.equal(f.writes[0][0].path,'publicSongRequests/auto-1');
  assert.equal(f.writes[0][1].path,'publicSongRequestOwners/auto-1');
  assert.match(f.writes[0][1].data.token,/^[a-f0-9]{64}$/);
  assert.equal(f.storage.get('ls26.publicRequestCapability.auto-1'),f.writes[0][1].data.token);
  assert.equal(f.directSets.length,0);
});

test('requester edit refreshes proof with the stored capability',async()=>{
  const f=fixture();
  const ref=await f.wrapped.collection('publicSongRequests').add({sessionId:'s1',source:'test'});
  f.writes.length=0;
  await f.wrapped.collection('publicSongRequests').doc(ref.id).set({note:'new',updatedAt:{__serverTimestamp:true}},{merge:true});
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].length,2);
  assert.equal(f.writes[0][0].options?.merge,true);
  assert.equal(f.writes[0][0].path,`publicSongRequests/${ref.id}`);
  assert.equal(f.writes[0][1].path,`publicSongRequestOwners/${ref.id}`);
  assert.equal(f.writes[0][1].data.token,f.storage.get(`ls26.publicRequestCapability.${ref.id}`));
  assert.equal(f.writes[0][1].options?.merge,true);
});

test('pre-cutover request without a capability keeps direct server-rule fallback',async()=>{
  const f=fixture();
  await f.wrapped.collection('publicSongRequests').doc('old-request').set({status:'cancelled'},{merge:true});
  assert.equal(f.writes.length,0);
  assert.equal(f.directSets.length,1);
  assert.equal(f.directSets[0].path,'publicSongRequests/old-request');
  assert.equal(f.directSets[0].options?.merge,true);
});

test('unrelated collections are not wrapped',async()=>{
  const f=fixture();
  await f.wrapped.collection('websiteReviews').doc('r1').set({rating:5},{merge:true});
  assert.equal(f.writes.length,0);
  assert.equal(f.directSets.length,1);
  assert.equal(f.directSets[0].path,'websiteReviews/r1');
});

test('capability token is 256-bit hex and key is request scoped',()=>{
  const cryptoApi={getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}};
  const token=capability.createToken(cryptoApi);
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(token.length,64);
  assert.equal(capability.capabilityKey('abc'),'ls26.publicRequestCapability.abc');
});
