/* Atomic updates to existing session, performedSongs, Run Order and request records. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f(require('./performance-intelligence.js'));else root.LS26Lifecycle=f(root.LS26Intelligence);})(typeof window==='object'?window:this,I=>{
'use strict';
function create(db,stamp){
 const ref=p=>db.doc?db.doc(p):p.split('/').reduce((r,x,i)=>i%2?r.doc(x):r.collection(x),db);
 async function start({sessionId,song,requestId='',now=Date.now(),bpm=null}){
  if(!sessionId||!song?.id)throw Error('An active session and song are required.');
  return db.runTransaction(async tx=>{
   const sr=ref('performanceSessions/'+sessionId),qr=ref('karaokeControl/runOrder'),cr=ref('karaokeControl/currentSession');
   const ss=await tx.get(sr),qs=await tx.get(qr),cs=await tx.get(cr),s=ss.data()||{},q=qs.data()||{},c=cs.data()||{};
   if(s.status!=='active'||c.active===false||(c.sessionId||c.activeSessionId)!==sessionId||q.sessionId&&q.sessionId!==sessionId)throw Error('Session changed. Reload before playing.');
   if(s.breakOpen)throw Error('End the break before starting a song.');
   const items=q.items||[];let item=items.find(r=>!I.terminal(r.status)&&(requestId?r.requestId===requestId:r.songId===song.id));
   if(!item&&!requestId){const matches=items.filter(r=>!I.terminal(r.status)&&I.norm(r.songTitle||r.title)===I.norm(song.title)&&I.norm(r.artist||r.songArtist)===I.norm(song.artist));if(matches.length===1)item=matches[0];}
   if(items.some(r=>r.status==='playing'&&r!==item))throw Error('Finish the current song before starting another.');
   const started=I.ms(item?.playingAtMs||item?.playingAt)||now,pid=item?.performanceId||`${song.id}_${started}`,pr=ref(`performanceSessions/${sessionId}/performedSongs/${pid}`),ps=await tx.get(pr);
   if(ps.exists&&I.terminal(ps.data().status))throw Error('This performance is already finished.');
   const reqId=requestId||item?.requestId||'',rr=reqId?ref('publicSongRequests/'+reqId):null,rs=rr?await tx.get(rr):null,request=rs?.data()||{};
   if(rr&&(!rs.exists||request.sessionId!==sessionId))throw Error('Request belongs to another session.');
   const time=stamp(started);item={...item,id:item?.id||'lyricview_'+pid,songId:song.id,songTitle:song.title||'',artist:song.artist||'',requestId:reqId,singerName:item?.singerName||request.singerName||request.name||'',source:item?.source||'lyricview',status:'playing',performanceId:pid,playingAtMs:started,playingAt:time};
   const record=ps.exists?ps.data():{songId:song.id,songTitle:song.title||'',artist:song.artist||'',songArtist:song.artist||'',sessionId,venue:s.venue||'',venueId:s.venueId||s.eventSnapshot?.venueId||'',act:s.sessionType||s.type||'unknown',requestId:reqId,requesterId:request.requesterId||request.singerId||request.profileId||request.userId||'',requesterDeviceId:request.requesterDeviceId||'',singerName:item.singerName,runOrderId:item.id,genre:song.genre||song.genres||[],energy:song.energy||'',crowdFunction:song.crowdFunction||[],metadataMissing:I.missing(song),position:items.filter(r=>r.playingAtMs).length+1,startedAt:time,playedAt:time,playingAtMs:started,createdAt:time,status:'playing',userBpm:Number(song.userBpm)||null,originalBpm:Number(song.originalBpm)||null,startingBpm:bpm,performanceBpm:bpm};
   const next=items.some(r=>r.id===item.id)?items.map(r=>r.id===item.id?item:r):[...items,item];
   tx.set(qr,{...q,sessionId,items:next,updatedAt:stamp(now)},{merge:true});if(!ps.exists)tx.set(pr,record);
   if(rr)tx.set(rr,{status:'playing',playingAtMs:started,playingAt:time,updatedAt:stamp(now)},{merge:true});
   if(!s.actualStartedAt&&s.timingVersion===2){tx.set(sr,{actualStartedAt:time,actualStartSource:'first-song',updatedAt:stamp(now)},{merge:true});tx.set(cr,{actualStartedAt:time},{merge:true});}
   return {record,performanceId:pid,startedMs:started,ref:pr};
  },{maxAttempts:3});
 }
 async function finish({sessionId,itemId,now=Date.now(),outcome='',status='completed'}){
  if(!sessionId||!itemId)return {completed:false,next:null};
  return db.runTransaction(async tx=>{
   const qr=ref('karaokeControl/runOrder'),sr=ref('performanceSessions/'+sessionId),qs=await tx.get(qr),ss=await tx.get(sr),q=qs.data()||{},s=ss.data()||{};
   if(q.sessionId!==sessionId||s.status!=='active')throw Error('Session changed. No song was advanced.');
   const items=q.items||[],item=items.find(r=>r.id===itemId);if(!item||item.status!=='playing')return {completed:false,next:items.find(r=>!I.terminal(r.status)&&r.status!=='playing')||null};
   const start=I.ms(item.playingAtMs||item.playingAt),pid=item.performanceId||(start?`${item.songId}_${start}`:'');if(!pid)throw Error('Performance start is missing; cannot safely finish this song.');
   const pr=ref(`performanceSessions/${sessionId}/performedSongs/${pid}`),ps=await tx.get(pr),rr=item.requestId?ref('publicSongRequests/'+item.requestId):null,rs=rr?await tx.get(rr):null;
   if(rr&&(!rs.exists||rs.data().sessionId!==sessionId))throw Error('Request/session mismatch. No changes saved.');
   // Older started queue entries may lack a record: reconcile once at the same deterministic ID.
   const old=ps.data()||{songId:item.songId,songTitle:item.songTitle||'',artist:item.artist||'',sessionId,venue:s.venue||'',venueId:s.venueId||s.eventSnapshot?.venueId||'',act:s.sessionType||s.type||'unknown',requestId:item.requestId||'',singerName:item.singerName||'',startedAt:stamp(start),playedAt:stamp(start),playingAtMs:start,reconciledFromRunOrder:true};
   const end=I.ms(old.endedAt)||now,patch={...old,status,endedAt:stamp(end),durationMs:Math.max(0,end-start-I.breakMs(s.breaks,start,end)),elapsedMs:Math.max(0,end-start),...(outcome&&['great','good','average','weak'].includes(outcome)?{crowdResponse:outcome}:{})};
   tx.set(pr,patch,{merge:true});const updated=items.map(r=>r.id===itemId?{...r,status:status==='completed'?'played':status,playedAtMs:end,endedAt:stamp(end),performanceId:pid}:r);
   tx.set(qr,{items:updated,updatedAt:stamp(now)},{merge:true});tx.set(sr,{lastPerformanceEndedAt:stamp(end)},{merge:true});if(rr)tx.set(rr,{status,playedAt:stamp(end),updatedAt:stamp(now)},{merge:true});
   return {completed:true,item,items:updated,next:updated.find(r=>!I.terminal(r.status)&&r.status!=='playing')||null};
  },{maxAttempts:3});
 }
 async function setBreak(sessionId,open,now=Date.now()) {return db.runTransaction(async tx=>{const r=ref('performanceSessions/'+sessionId),snap=await tx.get(r),s=snap.data()||{};if(s.status!=='active')throw Error('No active session.');const breaks=(s.breaks||[]).map(b=>({...b})),active=breaks.find(b=>I.ms(b.start||b.startedAt)&&!I.ms(b.end||b.endedAt));if(open&&!active)breaks.push({start:stamp(now),end:null});if(!open)for(const b of breaks)if(I.ms(b.start||b.startedAt)&&!I.ms(b.end||b.endedAt))b.end=stamp(now);tx.set(r,{breaks,breakOpen:open,updatedAt:stamp(now)},{merge:true});return breaks;},{maxAttempts:3});}
 return {start,finish,setBreak};
}
return {create};
});
