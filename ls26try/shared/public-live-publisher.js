/* Invoked by the existing owner publisher and its single browser leader lock. */
(() => {
  'use strict';
  const acts=['live-karaoke','billy-lee','roxanna'];
  const settingsId={'live-karaoke':'liveKaraokeWebsiteSettings','billy-lee':'billyLeeWebsiteSettings',roxanna:'roxannaWebsiteSettings'};
  window.LS26CreateLivePublisher=({db,watch,report})=>{
    const input={control:{},session:{},event:{},karaoke:{},run:{},requests:[]},unsubs=[];
    const ready=new Set(),errors=new Set(),settings={},published=new Map();
    let closed=false,revision=0,timer=0,writing=false,pending=false,sessionId='',eventId='',requestId='';
    let sessionOff=null,eventOff=null,requestOff=null,events=[];
    function fail(key,error){errors.add(key);published.clear();report(String(error?.message||error));}
    function schedule(){revision++;clearTimeout(timer);timer=setTimeout(()=>void publish(),150);}
    function linked(){
      const sid=input.control.active?String(input.control.sessionId||input.control.activeSessionId||''):'';
      const eid=String(input.control.active?input.control.eventId||'':input.karaoke.preSessionRequestEventId||'');
      const rid=sid||String(!input.control.active?input.karaoke.preSessionRequestSessionId||'':'');
      if(sid!==sessionId){sessionOff?.();sessionId=sid;input.session={};ready.delete('session');errors.delete('session');
        if(sid)sessionOff=watch('performanceSessions/'+sid,(d,exists)=>{if(sessionId===sid)receive('session',exists?{...d,id:sid}:{});},e=>fail('session',e));}
      if(eid!==eventId){eventOff?.();eventId=eid;input.event={};ready.delete('event');errors.delete('event');
        if(eid)eventOff=watch('upcomingEvents/'+eid,(d,exists)=>{if(eventId===eid)receive('event',exists?{...d,id:eid}:{});},e=>fail('event',e));}
      if(rid!==requestId){requestOff?.();requestId=rid;input.requests=[];ready.delete('requests');errors.delete('requests');
        if(rid)requestOff=db.collection('publicSongRequests').where('sessionId','==',rid).limit(501).onSnapshot({includeMetadataChanges:true},s=>{
          if(closed||requestId!==rid)return;
          if(s.metadata?.fromCache||s.metadata?.hasPendingWrites){fail('requests',Error('Waiting for the request connection.'));return;}
          if(s.docs.length>500){fail('requests',Error('Session request publication exceeds 500 records.'));return;}
          receive('requests',s.docs.map(d=>({...d.data(),id:d.id})));
        },e=>fail('requests',e));}
    }
    function receive(key,value){if(closed)return;input[key]=value;errors.delete(key);ready.add(key);if(key==='control'||key==='karaoke')linked();schedule();}
    async function publish(){
      if(closed)return;
      if(writing){pending=true;return;}
      const required=['control','karaoke','run','events',...acts];
      if(sessionId)required.push('session');if(eventId)required.push('event');if(requestId)required.push('requests');
      if(errors.size||required.some(k=>!ready.has(k)))return;
      writing=true;pending=false;const version=revision;
      try{
        const candidates=[];
        for(const act of acts){
          candidates.push([act,'live',LKLiveProjection.live(input,act)]);
          candidates.push([act,'events',LKLiveProjection.events(events,act)]);
          candidates.push([act,'settings',LKLiveProjection.settings(settings[act],act)]);
        }
        const values=candidates.filter(([act,view,value])=>{
          const prior=published.get(act+'/'+view);
          return !prior||!LKCatalogueProjection.equal(prior.value,value)||(view==='live'&&value.sessionId&&prior.expiry<Date.now()+120000);
        });
        if(!values.length){report('');return;}
        let committed=[];
        await db.runTransaction(async tx=>{
          const rows=await Promise.all(values.map(async([act,view,value])=>{
            const ref=db.collection('publicSites').doc(act).collection('views').doc(view);
            return {key:act+'/'+view,ref,value,view,snap:await tx.get(ref)};
          }));
          if(closed||revision!==version)throw Error('Source changed; waiting for the latest public view.');
          committed=[];
          for(const {key,ref,value,view,snap} of rows){
            const previous=snap.exists?snap.data():{},prior={...previous};delete prior.expiresAt;
            let expiry=previous.expiresAt?.toMillis?.()||0;
            const leased=view==='live'&&!!value.sessionId;
            if(!LKCatalogueProjection.equal(prior,value)||(leased&&expiry<Date.now()+120000)){
              expiry=leased?Date.now()+180000:0;
              tx.set(ref,view==='live'?{...value,expiresAt:leased?firebase.firestore.Timestamp.fromMillis(expiry):null}:value);
            }
            committed.push([key,{value,expiry}]);
          }
        });
        for(const [key,value]of committed)published.set(key,value);
        report('');
      }catch(error){report(error.message);}finally{writing=false;if(pending||version!==revision)schedule();}
    }
    for(const [key,path]of Object.entries({control:'karaokeControl/currentSession',karaoke:'karaoke/state',run:'karaokeControl/runOrder'}))unsubs.push(watch(path,d=>receive(key,d),e=>fail(key,e)));
    for(const act of acts)unsubs.push(watch('karaokeControl/'+settingsId[act],d=>{settings[act]=d;ready.add(act);errors.delete(act);schedule();},e=>fail(act,e)));
    // Query rolls over at Malta midnight without polling the collection.
    let eventsOff=null,midnightTimer=0;
    function watchEvents(){
      const day=LKEventTime.localDate(new Date(Date.now()-86400000));eventsOff?.();ready.delete('events');
      eventsOff=db.collection('upcomingEvents').where('date','>=',day).orderBy('date').limit(101).onSnapshot({includeMetadataChanges:true},s=>{
        if(closed)return;
        if(s.metadata?.fromCache||s.metadata?.hasPendingWrites){fail('events',Error('Waiting for the event connection.'));return;}
        if(s.docs.length>100){fail('events',Error('More than 100 upcoming source events; publication requires a narrower query.'));return;}
        events=s.docs.map(d=>({...d.data(),id:d.id}));ready.add('events');errors.delete('events');schedule();
      },e=>fail('events',e));
      const tomorrow=new Date(LKEventTime.localDate(new Date())+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
      midnightTimer=setTimeout(watchEvents,Math.max(1000,LKEventTime.localInstant(tomorrow.toISOString().slice(0,10)).getTime()-Date.now()+1000));
    }
    watchEvents();
    // A bounded lease heartbeat is necessary to clear stale LIVE displays when
    // the owner browser disappears. It performs no collection polling.
    const heartbeat=setInterval(()=>{if(requestId)schedule();},60000);
    return ()=>{closed=true;clearTimeout(timer);clearTimeout(midnightTimer);clearInterval(heartbeat);unsubs.forEach(fn=>fn());sessionOff?.();eventOff?.();requestOff?.();eventsOff?.();};
  };
})();
