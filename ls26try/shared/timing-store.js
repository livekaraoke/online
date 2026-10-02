/* Stage 3 Firestore compat adapter. Construction/loading scripts do no I/O.
 * Explicit load: one get. Explicit save: parent + timing transaction reads,
 * one timing-document write. Never attaches to transport or realtime listeners. */
(function (root,factory) {
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./timing-model.js'));
  else root.LS26TimingStore=factory(root.LS26Timing);
})(typeof window==='object'?window:globalThis,function(model){
  'use strict';
  const token=timing=>timing?{generation:timing.generation,revision:timing.revision}:null;
  function issue(code,message){const error=new Error(message);error.code=code;throw error;}
  function pathFor(songId){
    if(typeof songId!=='string'||!songId||songId.includes('/')||songId==='.'||songId==='..')issue('INVALID_SONG_ID','A single song document ID is required');
    return 'lyrics/'+songId+'/musicalTiming/v1';
  }
  function failure(error){
    const code=error.code||'UNKNOWN';
    const status=['TIMING_CHANGED','SOURCE_CHANGED','SONG_MISSING'].includes(code)?'CONFLICT':
      code.startsWith('UNSUPPORTED_')?'UNSUPPORTED':code.startsWith('INVALID_')?'INVALID':'UNAVAILABLE';
    return {status,code,message:error.message};
  }
  function create({db,document}){
    if(!db?.doc||!db?.runTransaction)throw new TypeError('A Firestore compat adapter is required');
    return Object.freeze({
      async load(songId,song){
        try{
          const ref=db.doc(pathFor(songId)),source=await model.buildSource(song,document);
          // Server-only read: a denied/offline read must never masquerade as
          // an absent document and authorize an accidental replacement.
          const snapshot=await ref.get({source:'server'});
          if(!snapshot.exists)return {status:'UNTIMED',timing:null,base:null,source};
          const timing=snapshot.data();await model.validate(timing,{persisted:true});
          return {...await model.reconcile(timing,source),base:token(timing),source,sourceChanged:timing.source.fingerprint!==source.fingerprint};
        }catch(error){return failure(error);}
      },
      async save(songId,{timing,base}={}){
        try{
          const timingRef=db.doc(pathFor(songId)),songRef=db.doc('lyrics/'+songId);
          // Detach the caller's mutable draft before any asynchronous work.
          if(!timing||typeof timing!=='object')issue('INVALID_TIMING','A timing draft is required');
          const draft=model.clone(timing);
          if(base===undefined||base!==null&&(!Number.isSafeInteger(base.revision)||base.revision<1||typeof base.generation!=='string'))issue('INVALID_BASE','Save requires the token returned by load/save, or explicit null for creation');
          const expected=base===null?null:{...base};
          await model.validate(draft);
          const saved=await db.runTransaction(async tx=>{
            const songSnapshot=await tx.get(songRef),timingSnapshot=await tx.get(timingRef);
            if(!songSnapshot.exists)issue('SONG_MISSING','The parent song no longer exists');
            const current=timingSnapshot.exists?timingSnapshot.data():null;
            if(current)await model.validate(current,{persisted:true});
            if((current===null)!==(expected===null)||current&&(current.generation!==expected.generation||current.revision!==expected.revision))issue('TIMING_CHANGED','Timing changed; reload before saving');
            if(current&&(draft.generation!==current.generation||draft.revision!==current.revision)||!current&&draft.revision!==0)issue('INVALID_BASE','Draft does not belong to this timing revision');
            const source=await model.buildSource(songSnapshot.data(),document);
            if(source.fingerprint!==draft.source.fingerprint)issue('SOURCE_CHANGED','Song source changed or lyrics are not saved; reload/reconcile before saving timing');
            const next={...draft,revision:(current?.revision||0)+1};await model.validate(next,{persisted:true});
            tx.set(timingRef,next);return next;
          });
          return {status:'SAVED',timing:saved,base:token(saved)};
        }catch(error){return failure(error);}
      }
    });
  }
  return Object.freeze({create,pathFor});
});
