/* One publication policy, shared by the browser and public projection publisher. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LKPublicVisibility=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const terminal=new Set(['played','completed','finished','abandoned','left','deleted','deletedbyhost','declined','cancelled','canceled','rejected','removed','skipped']);
  const ended=new Set(['ended','completed','finished','cancelled','canceled','done','closed']);
  const lower=v=>String(v||'').trim().toLowerCase();
  function act(d={}){const v=lower(d.act||d.sessionType||d.type||d.performerType);return ['live karaoke','live-karaoke','livekaraoke'].includes(v)?'live-karaoke':['solo','billy lee','billylee26'].includes(v)?'billy-lee':v==='roxanna'?'roxanna':'';}
  function hidden(d={}){
    return d.isTest===true||d.isTestSession===true||d.testMode===true||d.requestTestMode===true||d.private===true||d.isPrivate===true||d.published===false||d.publicVisible===false||d.publishToWebsite===false||['private','test','internal','hidden','draft','unpublished'].includes(lower(d.publicVisibility||d.visibility))||
      /(?:^|[\s_\-])(test|testing|rehearsal|demo)(?:$|[\s_\-])/i.test([d.name,d.title,d.venue,d.venueName].filter(Boolean).join(' '));
  }
  function published(d={}){return !hidden(d)&&(lower(d.publicVisibility||d.visibility)==='public'||d.published===true||d.publicVisible===true||lower(d.status)==='confirmed');}
  function eventVisible(d={},expected='live-karaoke'){
    if(act(d)!==expected||!published(d)||ended.has(lower(d.status))||d.completedAt)return false;
    return !['tentative','pending','unconfirmed','provisional'].includes(lower(d.status))||d.publishUnconfirmed===true;
  }
  function sessionVisible(control={},session={},event={},expected='live-karaoke'){
    const id=String(control.sessionId||control.activeSessionId||'');
    if(!id||control.active!==true||act(control)!==expected||session.id!==id)return false;
    if([control,session,control.eventSnapshot||{},session.eventSnapshot||{},event].some(hidden))return false;
    if(ended.has(lower(session.status))||session.isActive===false||session.endedAt||session.closedAt)return false;
    if(control.eventId&&event.id!==control.eventId)return false; // Wait for the linked event; never flash an unverified session.
    if(control.eventId&&!eventVisible(event,expected))return false;
    return published(control)||published(session)||eventVisible(event,expected)||published(session.eventSnapshot||control.eventSnapshot||{});
  }
  function runItems(run={},sessionId=''){
    if(!sessionId||run.sessionId!==sessionId)return [];
    return (Array.isArray(run.items)?run.items:[]).filter(x=>x&&(!x.sessionId||x.sessionId===sessionId)&&!terminal.has(lower(x.status))&&x.removed!==true&&x.cancelled!==true&&x.deleted!==true);
  }
  function gate(state,params={}){
    const {control={},session={},event={},karaoke={},loaded=false,error=false}=state;
    if(!loaded||error)return {open:false,active:false,phase:'unavailable',sessionId:''};
    const active=sessionVisible(control,session,event);
    const reserved=String(karaoke.preSessionRequestSessionId||'');
    const pre=!control.active&&!!reserved&&eventVisible(event)&&event.id===karaoke.preSessionRequestEventId;
    const id=active?String(control.sessionId||control.activeSessionId):pre?reserved:'';
    const access=!karaoke.venueAccessCode||String(params.vac||'')===String(karaoke.venueAccessCode);
    const matching=!params.sessionId||params.sessionId===id;
    const open=!!id&&access&&matching&&karaoke.songsEnabled===true;
    const phase=active?(session.breakOpen?'break':(session.actualStartedAt||control.actualStartedAt?'live':'preparing')):pre?'starting-soon':'inactive';
    return {open,active,phase,sessionId:id,accessRequired:!!id&&!access,wrongSession:!!id&&!matching};
  }
  return Object.freeze({act,hidden,published,eventVisible,sessionVisible,runItems,gate,terminal,ended});
});
