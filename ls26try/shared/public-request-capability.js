/* Public request ownership capability wrapper.
 *
 * IMPORTANT: This module is intentionally NOT loaded by the public sites yet.
 * It must only be enabled after the matching Firestore rules have been merged,
 * emulator-tested and deployed. Until then the existing request clients remain
 * unchanged.
 *
 * The create path includes a narrow permission-denied fallback so the wrapper
 * can also be enabled just before a rules cut-over without breaking request
 * creation while the old rules still reject publicSongRequestOwners.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LS26PublicRequestCapability=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';

  const PREFIX='ls26.publicRequestCapability.';

  function capabilityKey(requestId){
    return PREFIX+String(requestId||'');
  }

  function createToken(cryptoApi){
    if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function'){
      throw new Error('Secure request capability generation is unavailable.');
    }
    const bytes=new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  }

  function readToken(storage,requestId){
    try{return String(storage?.getItem?.(capabilityKey(requestId))||'');}
    catch(_){return '';}
  }

  function rememberToken(storage,requestId,token){
    try{storage?.setItem?.(capabilityKey(requestId),token);}catch(_){}
  }

  function isPermissionDenied(error){
    const code=String(error?.code||'').toLowerCase();
    return code==='permission-denied'||code==='firestore/permission-denied';
  }

  function bound(target,prop){
    const value=target[prop];
    return typeof value==='function'?value.bind(target):value;
  }

  function wrap({db,firebase,storage,cryptoApi}){
    if(!db||typeof db.collection!=='function'||typeof db.batch!=='function'){
      throw new TypeError('A Firestore-compatible database is required.');
    }
    if(!firebase?.firestore?.FieldValue?.serverTimestamp){
      throw new TypeError('Firebase FieldValue.serverTimestamp is required.');
    }

    async function secureCreate(data){
      const requestRef=db.collection('publicSongRequests').doc();
      const proofRef=db.collection('publicSongRequestOwners').doc(requestRef.id);
      const token=createToken(cryptoApi);
      const stamp=firebase.firestore.FieldValue.serverTimestamp();
      const batch=db.batch();
      batch.set(requestRef,data||{});
      batch.set(proofRef,{token,createdAt:stamp,proofAt:stamp});

      try{
        await batch.commit();
        rememberToken(storage,requestRef.id,token);
        return requestRef;
      }catch(error){
        // Before the new rules are live, the private proof collection is denied.
        // Because the failed batch is atomic, no request was created. Fall back
        // only for a rules permission denial and preserve the current public
        // request-create behavior. Other failures still surface to the caller.
        if(!isPermissionDenied(error))throw error;
        return db.collection('publicSongRequests').add(data||{});
      }
    }

    function secureSet(ref,data,options,originalSet){
      const token=readToken(storage,ref.id);
      if(!/^[a-f0-9]{64}$/.test(token)){
        return options===undefined
          ? originalSet.call(ref,data)
          : originalSet.call(ref,data,options);
      }

      const proofRef=db.collection('publicSongRequestOwners').doc(ref.id);
      const batch=db.batch();
      if(options===undefined)batch.set(ref,data||{});
      else batch.set(ref,data||{},options);
      batch.set(proofRef,{
        token,
        proofAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      return batch.commit();
    }

    function wrapDocument(ref){
      return new Proxy(ref,{
        get(target,prop){
          if(prop==='set'){
            const originalSet=target.set;
            return (data,options)=>secureSet(target,data,options,originalSet);
          }
          return bound(target,prop);
        }
      });
    }

    function wrapCollection(ref,name){
      if(name!=='publicSongRequests')return ref;
      return new Proxy(ref,{
        get(target,prop){
          if(prop==='add')return data=>secureCreate(data);
          if(prop==='doc')return id=>wrapDocument(id===undefined?target.doc():target.doc(id));
          return bound(target,prop);
        }
      });
    }

    return new Proxy(db,{
      get(target,prop){
        if(prop==='collection')return name=>wrapCollection(target.collection(name),name);
        return bound(target,prop);
      }
    });
  }

  return Object.freeze({PREFIX,capabilityKey,createToken,readToken,isPermissionDenied,wrap});
});
