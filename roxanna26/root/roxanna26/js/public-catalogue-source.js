/* Reads exactly one allowlisted projection; permission/network failures never
 * fall back to private lyrics. Activation follows verified host publication. */
(() => {
  'use strict';
  const pending=new Map();
  async function load(db,act){
    if(!['live-karaoke','billy-lee','roxanna'].includes(act))throw Error('Unknown repertoire.');
    const key=act;
    if(pending.has(key))return pending.get(key);
    const work=(async()=>{
      const snap=await db.collection('publicSites').doc(act).collection('views').doc('catalogue').get();
      const value=snap.exists?snap.data():null;
      if(value?.schemaVersion!==1||value.act!==act||!Array.isArray(value.songs)||!value.setlist?.id)throw Error('The public repertoire is not published yet.');
      return {songs:value.songs,setlist:value.setlist,diagnostics:{source:'sanitised public projection',setlistId:value.setlist.id,loadedSongs:value.songs.length}};
    })();
    pending.set(key,work);
    try{return await work;}finally{pending.delete(key);}
  }
  window.LKPublicCatalogue=Object.freeze({load});
})();
