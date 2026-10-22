/* Explicit public allowlists. Never spread private event, session or request data. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./public-visibility.js'):root.LKPublicVisibility,
    typeof module==='object'&&module.exports?require('./public-event-time.js'):root.LKEventTime);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LKLiveProjection=api;
})(typeof window==='object'?window:globalThis,(policy,time)=>{
  'use strict';
  const acts=['live-karaoke','billy-lee','roxanna'];
  const types={'live-karaoke':'Live Karaoke','billy-lee':'Solo',roxanna:'Roxanna'};
  const text=(v,n=240)=>typeof v==='string'?v.slice(0,n):'';
  const id=v=>typeof v==='string'&&!v.includes('/')?v:'';
  const list=(v,max)=>(Array.isArray(v)?v:[]).slice(0,max);
  const started=d=>!!d.actualStartedAt;
  function event(d,act){
    if(!d||!id(d.id)||!policy.eventVisible(d,act))return null;
    const beginning=time.start(d),ending=time.end(d);
    return {id:id(d.id),type:types[act],name:text(d.name),venue:text(d.venue||d.venueName),
      address:text(d.address||d.venueLocation,400),status:text(d.status,40),publicVisibility:'public',
      publishUnconfirmed:d.publishUnconfirmed===true,date:text(d.date,10),startTime:text(d.startTime,8),
      endTime:text(d.endTime,8),endDate:text(d.endDate,10),
      scheduledStartAt:beginning?.toISOString()||null,scheduledEndAt:ending?.toISOString()||null,
      sessionStatus:text(d.sessionStatus,40),activeSessionId:id(d.activeSessionId),startedSessionId:id(d.startedSessionId)};
  }
  function events(records,act,now=Date.now()){
    if(!acts.includes(act))throw Error('Unknown public act.');
    const today=time.localDate(new Date(now));
    return {schemaVersion:1,act,events:list(records,100).map(d=>event(d,act)).filter(d=>{
      if(!d||d.activeSessionId||d.startedSessionId||['active','live','started','ended','completed','done'].includes(d.sessionStatus.toLowerCase()))return false;
      const start=time.start(d),end=time.end(d);
      return !!start&&(end?end.getTime()>now:time.localDate(start)>=today);
    }).sort(time.compare).slice(0,30)};
  }
  function settings(d={},act){
    if(!acts.includes(act))throw Error('Unknown public act.');
    return {schemaVersion:1,act,settings:{
      requestButtonText:text(d.requestButtonText,80),songListButtonText:text(d.songListButtonText,80),
      defaultBrowseSetlistId:id(d.defaultBrowseSetlistId),showCategoryCards:d.showCategoryCards!==false,
      showArtistSearchCard:d.showArtistSearchCard!==false,categoryCardSize:Math.max(60,Math.min(120,Number(d.categoryCardSize)||80)),
      categories:list(d.categories,30).map(c=>({id:text(c.id,80),label:text(c.label,24),subtitle:text(c.subtitle,40),
        enabled:c.enabled!==false,mode:text(c.mode,40),rule:text(c.rule,80),songIds:list(c.songIds,500).map(id).filter(Boolean)})),
      faqs:list(d.faqs,20).map(f=>({id:text(f.id,80),question:text(f.question,120),answer:text(f.answer,800)})),
      instagramUrl:text(d.instagramUrl,500),facebookUrl:text(d.facebookUrl,500),
      aboutShort:text(d.aboutShort,2000),aboutDetailed:text(d.aboutDetailed,12000)
    }};
  }
  function live(input,act){
    if(!acts.includes(act))throw Error('Unknown public act.');
    const {control={},session={},event:sourceEvent={},karaoke={},run={},requests=[]}=input;
    const active=policy.sessionVisible(control,session,sourceEvent,act);
    const pre=!control.active&&id(karaoke.preSessionRequestSessionId)&&sourceEvent.id===karaoke.preSessionRequestEventId&&policy.eventVisible(sourceEvent,act);
    const sessionId=active?id(control.sessionId||control.activeSessionId):pre?id(karaoke.preSessionRequestSessionId):'';
    const publicEvent=active||pre?event(sourceEvent,act):null;
    const requestStates=new Map(list(requests,500).filter(r=>r.sessionId===sessionId).map(r=>[r.id,String(r.status||'').toLowerCase()]));
    const eligible=active?policy.runItems(run,sessionId).filter(row=>!row.requestId||!policy.terminal.has(requestStates.get(row.requestId))):[];
    const items=eligible.slice(0,100).map(row=>({id:id(row.id),songId:id(row.songId),requestId:id(row.requestId),
      songTitle:text(row.songTitle||row.title),artist:text(row.artist||row.songArtist),status:text(row.status||'queued',40)}));
    const availability=[];
    // Public availability contains song/status only, never requester names, notes,
    // demographics, device IDs, email hashes, capability tokens or timing.
    if(sessionId)for(const row of list(requests,500)){
      if(row.sessionId!==sessionId||!id(row.songId))continue;
      const status=text(row.status||'active',40).toLowerCase();
      if(['active','pending','waiting','queued','accepted','playing','requested','played','completed','finished'].includes(status))availability.push({songId:id(row.songId),status});
    }
    if(active&&run.sessionId===sessionId)for(const row of list(run.items,500)){
      if(row.sessionId&&row.sessionId!==sessionId)continue;
      if(id(row.songId)&&['played','completed','finished'].includes(String(row.status).toLowerCase()))availability.push({songId:id(row.songId),status:'played'});
    }
    return {schemaVersion:1,act,sessionId,control:active?{active:true,sessionId,eventId:id(control.eventId),
      type:types[act],venue:text(control.venue||session.venue),publicVisibility:'public',actualStartedAt:started(control)}:{active:false},
      session:active?{id:sessionId,status:'active',isActive:true,publicVisibility:'public',breakOpen:session.breakOpen===true,
        actualStartedAt:started(session),venue:text(session.venue)}:{},event:publicEvent||{},
      karaoke:{songsEnabled:!!sessionId&&karaoke.songsEnabled===true,venueCodeRequired:!!karaoke.venueAccessCode,
        preSessionRequestSessionId:pre?sessionId:'',preSessionRequestEventId:pre?id(sourceEvent.id):''},
      run:{sessionId:active?sessionId:'',items},availability};
  }
  return Object.freeze({event,events,settings,live});
});
