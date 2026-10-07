const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(relativeConfigPath){
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

  const rawDb={
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

  const firebase={
    apps:[],
    initializeApp(){firebase.apps.push({});},
    firestore(){return rawDb;}
  };
  firebase.firestore.FieldValue={serverTimestamp:()=>({__serverTimestamp:true})};

  const context={
    console,
    Uint8Array,
    Array,
    String,
    Proxy,
    Promise,
    window:{
      SITE_FIREBASE_CONFIG:{projectId:'test'},
      firebase,
      crypto:{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(i+17)&255;return bytes;}},
      localStorage:{
        getItem(key){return storage.has(key)?storage.get(key):null;},
        setItem(key,value){storage.set(key,String(value));},
        removeItem(key){storage.delete(key);}
      }
    }
  };
  context.firebase=firebase;
  context.localStorage=context.window.localStorage;
  vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'..','..',relativeConfigPath),'utf8');
  vm.runInContext(source,context,{filename:relativeConfigPath});
  return {window:context.window,writes,directSets,storage};
}

for(const configPath of ['billylee26/js/firebase-config.js','livekaraoke26/js/firebase-config.js']){
  test(`${configPath}: new public request creates a private capability atomically`,async()=>{
    const f=fixture(configPath);
    const ref=await f.window.BillyLeeDB.collection('publicSongRequests').add({sessionId:'s1',source:'test'});
    assert.equal(ref.id,'auto-1');
    assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].length,2);
    assert.equal(f.writes[0][0].path,'publicSongRequests/auto-1');
    assert.equal(f.writes[0][1].path,'publicSongRequestOwners/auto-1');
    assert.match(f.writes[0][1].data.token,/^[a-f0-9]{64}$/);
    assert.equal(f.storage.get('ls26.publicRequestCapability.auto-1'),f.writes[0][1].data.token);
    assert.equal(f.directSets.length,0);
  });

  test(`${configPath}: requester edit refreshes proof with stored capability`,async()=>{
    const f=fixture(configPath);
    const ref=await f.window.BillyLeeDB.collection('publicSongRequests').add({sessionId:'s1',source:'test'});
    f.writes.length=0;
    await f.window.BillyLeeDB.collection('publicSongRequests').doc(ref.id).set({note:'new',updatedAt:{__serverTimestamp:true}},{merge:true});
    assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].length,2);
    assert.deepEqual(f.writes[0][0].options,{merge:true});
    assert.equal(f.writes[0][0].path,`publicSongRequests/${ref.id}`);
    assert.equal(f.writes[0][1].path,`publicSongRequestOwners/${ref.id}`);
    assert.equal(f.writes[0][1].data.token,f.storage.get(`ls26.publicRequestCapability.${ref.id}`));
    assert.deepEqual(f.writes[0][1].options,{merge:true});
  });

  test(`${configPath}: pre-cutover request keeps direct server-rule fallback`,async()=>{
    const f=fixture(configPath);
    await f.window.BillyLeeDB.collection('publicSongRequests').doc('old-request').set({status:'cancelled'},{merge:true});
    assert.equal(f.writes.length,0);
    assert.equal(f.directSets.length,1);
    assert.equal(f.directSets[0].path,'publicSongRequests/old-request');
    assert.deepEqual(f.directSets[0].options,{merge:true});
  });

  test(`${configPath}: unrelated collections are not wrapped`,async()=>{
    const f=fixture(configPath);
    await f.window.BillyLeeDB.collection('websiteReviews').doc('r1').set({rating:5},{merge:true});
    assert.equal(f.writes.length,0);
    assert.equal(f.directSets.length,1);
    assert.equal(f.directSets[0].path,'websiteReviews/r1');
  });
}
