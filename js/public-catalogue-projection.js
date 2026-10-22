/* Derived public metadata only. Never spread a private lyrics/setlist record. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LKCatalogueProjection=factory();
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const text=(v,n=220)=>typeof v==='string'?v.slice(0,n):'';
  const tags=v=>(Array.isArray(v)?v:[]).filter(x=>typeof x==='string').slice(0,24).map(x=>text(x,80));
  function song(id,d={}){
    const year=Number(d.year);
    return {id,title:text(d.title),artist:text(d.artist||d.songArtist),
      year:Number.isInteger(year)&&year>=1000&&year<=2100?year:null,
      genre:text(d.genre,100),genres:tags(d.genres),tags:tags(d.tags)};
  }
  function catalogue(act,setlist,records){
    if(!['live-karaoke','billy-lee','roxanna'].includes(act))throw Error('Unknown public act.');
    if(!setlist?.id)throw Error('Choose an authoritative public setlist.');
    const ids=[...new Set((setlist.songIds||[]).filter(x=>typeof x==='string'&&x&&!x.includes('/')))];
    if(ids.length>500)throw Error('The selected public setlist exceeds the 500-song publication limit.');
    const byId=new Map(records.map(x=>[x.id,x]));
    const missing=ids.filter(id=>!byId.has(id));
    if(missing.length)throw Error(`${missing.length} selected song(s) are missing. Fix the source setlist before publishing.`);
    return {schemaVersion:1,act,setlist:{id:setlist.id,name:text(setlist.name),songIds:ids},
      songs:ids.map(id=>song(id,byId.get(id)))};
  }
  return Object.freeze({song,catalogue});
});
