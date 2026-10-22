/* A single set of subscriptions shared with the same-origin request iframe. */
(() => {
  'use strict';
  if(window.LKPublicStore)return;
  try{if(window.parent!==window&&window.parent.LKPublicStore){window.LKPublicStore=window.parent.LKPublicStore;return;}}catch(_){}
  const listeners=new Set(),unsubs=[];
  let db=null,sessionUnsub=null,eventUnsub=null,sessionId='',eventId='',started=false;
  let state={control:{},session:{},event:{},karaoke:{},run:{items:[]},settings:{},events:[],loaded:false,error:false};
  const ready=new Set(),errors=new Set();
  const snapshot=()=>({...state,loaded:['control','karaoke','run','settings'].every(k=>ready.has(k)),error:errors.size>0});
  function emit(){const value=snapshot();listeners.forEach(fn=>fn(value));}
  function receive(key,value){errors.delete(key);ready.add(key);state={...state,[key]:value};emit();}
  function fail(key){errors.add(key);state={...state,[key]:key==='events'?[]:{}};emit();}
  function linked(){
    const sid=state.control.active?String(state.control.sessionId||state.control.activeSessionId||''):'';
    const eid=String(state.control.active?state.control.eventId||'':state.karaoke.preSessionRequestEventId||'');
    if(sid!==sessionId){sessionUnsub?.();sessionId=sid;state.session={};errors.delete('session');if(sid)sessionUnsub=db.collection('performanceSessions').doc(sid).onSnapshot(s=>{if(sessionId===sid)receive('session',s.exists?{...s.data(),id:s.id}:{});},()=>fail('session'));}
    if(eid!==eventId){eventUnsub?.();eventId=eid;state.event={};errors.delete('event');if(eid)eventUnsub=db.collection('upcomingEvents').doc(eid).onSnapshot(s=>{if(eventId===eid)receive('event',s.exists?{...s.data(),id:s.id}:{});},()=>fail('event'));}
  }
  function start(database){
    if(started)return;started=true;db=database;
    for(const [key,path] of Object.entries({control:'karaokeControl/currentSession',karaoke:'karaoke/state',run:'karaokeControl/runOrder',settings:'karaokeControl/liveKaraokeWebsiteSettings'})){
      const [c,d]=path.split('/');unsubs.push(db.collection(c).doc(d).onSnapshot(s=>{state={...state,[key]:s.exists?s.data():{}};if(key==='control'||key==='karaoke')linked();receive(key,state[key]);},()=>fail(key)));
    }
    // All currently-managed events have an ISO Malta calendar date. No full-collection listener.
    const since=new Date(Date.now()-86400000);const day=window.LKEventTime.localDate(since);
    unsubs.push(db.collection('upcomingEvents').where('date','>=',day).orderBy('date').limit(100).onSnapshot(s=>receive('events',s.docs.map(d=>({...d.data(),id:d.id}))),()=>fail('events')));
  }
  window.LKPublicStore={start,subscribe(fn){listeners.add(fn);fn(snapshot());return ()=>listeners.delete(fn);},get:snapshot};
  addEventListener('pagehide',()=>{unsubs.forEach(fn=>fn());sessionUnsub?.();eventUnsub?.();},{once:true});
  addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
