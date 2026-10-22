const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../../js/public-catalogue-projection.js');
const privateSong={id:'original-id',title:'Song',artist:'Artist',year:'1995',genre:'Rock',tags:['90s'],lyrics:'PRIVATE',chords:'PRIVATE',sections:[{html:'PRIVATE'}],hostNote:'PRIVATE',transposition:4,timing:{private:true},resourceUrl:'PRIVATE'};
test('only explicit public metadata crosses the projection boundary; IDs and order survive',()=>{
 const d=P.catalogue('live-karaoke',{id:'original-list',name:'Public',songIds:['original-id','original-id'],hostNote:'PRIVATE'},[privateSong]);
 assert.deepEqual(d.setlist,{id:'original-list',name:'Public',songIds:['original-id']});assert.equal(d.songs[0].id,'original-id');assert.equal(d.songs[0].year,1995);assert.equal(JSON.stringify(d).includes('PRIVATE'),false);
 assert.deepEqual(Object.keys(d.songs[0]),['id','title','artist','year','genre','genres','tags']);
});
test('all three acts are isolated and missing source records fail publication',()=>{
 for(const act of ['live-karaoke','billy-lee','roxanna'])assert.equal(P.catalogue(act,{id:'list',name:'Selected',songIds:['original-id']},[privateSong]).act,act);
 assert.throws(()=>P.catalogue('other',{id:'list'},[]),/Unknown/);
 assert.throws(()=>P.catalogue('live-karaoke',{id:'list',songIds:['missing']},[]),/missing/);
 assert.throws(()=>P.catalogue('live-karaoke',{id:'list',songIds:Array.from({length:501},(_,i)=>String(i))},[]),/500/);
});
test('published client uses one document and never falls back to private records',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ctx={window:{},Map};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../js/public-catalogue-source.js'),'utf8'),ctx);
 const seen=[];
 const document={get:async()=>{throw Error('permission-denied')}};
 const views={doc(id){assert.equal(id,'catalogue');return document;}};
 const site={collection(name){assert.equal(name,'views');return views;}};
 const sites={doc(act){assert.equal(act,'live-karaoke');return site;}};
 const fail={collection(name){seen.push(name);assert.equal(name,'publicSites');return sites;}};
 await assert.rejects(ctx.window.LKPublicCatalogue.load(fail,'live-karaoke'),/permission-denied/);assert.deepEqual(seen,['publicSites']);
});
