/* A single set of subscriptions shared with the same-origin request iframe. */
(() => {
  'use strict';
  if(window.LKPublicStore)return;
  try{if(window.parent!==window&&window.parent.LKPublicStore){window.LKPublicStore=window.parent.LKPublicStore;return;}}catch(_){}
  const listeners=new Set(),unsubs=[];
  let db=null,sessionUnsub=null,eventUnsub=null,sessionId='',eventId='',started=false,projected=false,expiryTimer=0;
  let state={control:{},session:{},event:{},karaoke:{},run:{items:[]},settings:{},events:[],loaded:false,error:false};
  const ready=new Set(),errors=new Set();
  const snapshot=()=>({...state,projected,loaded:(projected?['live','events','settings']:['control','karaoke','run','settings']).every(k=>ready.has(k)),error:errors.size>0});
  function emit(){const value=snapshot();listeners.forEach(fn=>fn(value));}
  function receive(key,value){errors.delete(key);ready.add(key);state={...state,[key]:value};emit();}
  function fail(key){errors.add(key);state={...state,[key]:key==='events'?[]:{}};emit();}
  function linked(){
    const sid=state.control.active?String(state.control.sessionId||state.control.activeSessionId||''):'';
    const eid=String(state.control.active?state.control.eventId||'':state.karaoke.preSessionRequestEventId||'');
    if(sid!==sessionId){sessionUnsub?.();sessionId=sid;state.session={};errors.delete('session');if(sid)sessionUnsub=db.collection('performanceSessions').doc(sid).onSnapshot(s=>{if(sessionId===sid)receive('session',s.exists?{...s.data(),id:s.id}:{});},()=>fail('session'));}
    if(eid!==eventId){eventUnsub?.();eventId=eid;state.event={};errors.delete('event');if(eid)eventUnsub=db.collection('upcomingEvents').doc(eid).onSnapshot(s=>{if(eventId===eid)receive('event',s.exists?{...s.data(),id:s.id}:{});},()=>fail('event'));}
  }
  function startProjected(act){
    projected=true;
    for(const key of ['live','events','settings']){
      const ref=db.collection('publicSites').doc(act).collection('views').doc(key);
      unsubs.push(ref.onSnapshot(s=>{
        const value=s.exists?s.data():null;
        if(value?.schemaVersion!==1||value.act!==act){failProjected(key);return;}
        if(key==='live'){
          clearTimeout(expiryTimer);
          const expires=value.expiresAt?.toMillis?.()||(value.expiresAt?.seconds?value.expiresAt.seconds*1000:0);
          if(value.sessionId&&(!expires||expires<=Date.now())){failProjected(key);return;}
          state={...state,control:value.control||{},session:value.session||{},event:value.event||{},karaoke:value.karaoke||{},run:value.run||{items:[]},availability:Array.isArray(value.availability)?value.availability:[]};
          if(value.sessionId)expiryTimer=setTimeout(()=>failProjected('live'),Math.min(2147483647,expires-Date.now()));
        }else state={...state,[key]:value[key]};
        errors.delete(key);ready.add(key);emit();
      },()=>failProjected(key)));
    }
  }
  function failProjected(key){
    if(key==='live'){clearTimeout(expiryTimer);state={...state,control:{active:false},session:{},event:{},karaoke:{songsEnabled:false},run:{items:[]},availability:[]};}
    fail(key);
  }
  function start(database,act='live-karaoke'){
    if(started)return;started=true;db=database;
    if(window.LK_PUBLIC_LIVE_V1?.[act]===true){startProjected(act);return;}
    for(const [key,path] of Object.entries({control:'karaokeControl/currentSession',karaoke:'karaoke/state',run:'karaokeControl/runOrder',settings:'karaokeControl/liveKaraokeWebsiteSettings'})){
      const [c,d]=path.split('/');unsubs.push(db.collection(c).doc(d).onSnapshot(s=>{state={...state,[key]:s.exists?s.data():{}};if(key==='control'||key==='karaoke')linked();receive(key,state[key]);},()=>fail(key)));
    }
    // All currently-managed events have an ISO Malta calendar date. No full-collection listener.
    const since=new Date(Date.now()-86400000);const day=window.LKEventTime.localDate(since);
    unsubs.push(db.collection('upcomingEvents').where('date','>=',day).orderBy('date').limit(100).onSnapshot(s=>receive('events',s.docs.map(d=>({...d.data(),id:d.id}))),()=>fail('events')));
  }
  window.LKPublicStore={start,subscribe(fn){listeners.add(fn);fn(snapshot());return ()=>listeners.delete(fn);},get:snapshot};
  addEventListener('pagehide',()=>{clearTimeout(expiryTimer);unsubs.forEach(fn=>fn());sessionUnsub?.();eventUnsub?.();},{once:true});
  addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
