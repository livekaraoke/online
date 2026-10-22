/* Copyright © 2026 LiveSuite. Pure history index/scorer; no IO. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.LS26Rotation=f();})(typeof window==='object'?window:this,()=>{
'use strict';
const DEFAULTS={freshAfter:5,readyAfter:3,weights:{freshness:30,requests:15,flow:15,global:5,energy:10,reliability:10,variety:10,outcomes:5},sameArtistPenalty:18,lastGigPenalty:15};
const act=s=>norm(s.act||s.sessionType||s.type||s.eventSnapshot?.type)||'unknown';
const venueKey=s=>(s.venueId||s.eventSnapshot?.venueId)?'id:'+String(s.venueId||s.eventSnapshot.venueId):norm(s.venue||s.eventSnapshot?.venue);
const values=v=>Array.isArray(v)?v.map(norm):String(v||'').split(',').map(norm).filter(Boolean);
const energy=s=>({low:1,chill:1,medium:2,high:3}[norm(s?.energy)]||([1,2,3].includes(Number(s?.energy))?Number(s.energy):null));
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' '),array=v=>Array.isArray(v)?v:[],id=s=>String(s?.firebaseId||s?.id||'');
function ms(v){if(v?.toMillis)return v.toMillis();if(v?.toDate)return +v.toDate();if(v&&typeof v==='object'&&Number.isFinite(v.seconds))return v.seconds*1000;const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?n:0;}
const start=s=>ms(s.actualStartedAt||s.startedAt||s.createdAt),played=r=>ms(r.playedAt||r.startedAt||r.playingAtMs||r.createdAt);
const empty=()=>({count:0,lastDate:0,gigsAgo:null,requests:0,completedRequests:0,abandonedRequests:0,ratings:0,positive:0,durations:[]});
function buildIndex(songs,sessions,sessionId='',context={}){
 const byId=new Map(songs.map(s=>[id(s),s])),byName=new Map();
 songs.forEach(s=>{const k=norm(s.title)+'|'+norm(s.artist);byName.set(k,byName.has(k)?null:id(s));});
 const resolve=r=>byId.has(String(r.songId||''))?String(r.songId):byName.get(norm(r.songTitle||r.title)+'|'+norm(r.songArtist||r.artist))||'';
 const history=array(sessions).filter(s=>s.id!==sessionId&&(s.status==='ended'||s.endedAt||s.actualEndedAt)&&start(s)).sort((a,b)=>start(b)-start(a)||String(a.id).localeCompare(String(b.id)));
 const venues=new Map(),global=new Map();
 // ID-less archives join an ID only when this exact name maps to one ID.
 const nameIds=new Map();for(const h of history){const n=norm(h.venue||h.eventSnapshot?.venue),k=venueKey(h);if(k.startsWith('id:')){if(!nameIds.has(n))nameIds.set(n,new Set());nameIds.get(n).add(k);}}

 if(context.venueKey?.startsWith('id:')&&context.venue){const n=norm(context.venue);if(!nameIds.has(n))nameIds.set(n,new Set());nameIds.get(n).add(context.venueKey);}
 for(const s of history){
  let name=venueKey(s)||'__unknownVenue';const aliases=nameIds.get(name);if(!name.startsWith('id:')&&aliases?.size===1)name=[...aliases][0];
  const inAct=!context.act||context.act==='all'||act(s)===norm(context.act);
  if(!venues.has(name))venues.set(name,{key:name,name:s.venue||s.eventSnapshot?.venue||'Unknown venue',gigs:[],songs:new Map(),incomplete:0});
  const venue=venues.get(name),gig=venue.gigs.length+1;if(inAct)venue.gigs.push(s.id);
  const records=[],seen=new Set();
  for(const r of [...array(s.playedSongsSnapshot),...array(s.performanceLogSnapshot)]){const sid=resolve(r);if(!sid)continue;const k=[sid,r.requestId||'',played(r)].join('|');if(seen.has(k))continue;seen.add(k);records.push({...r,songId:sid});}
  for(const r of array(s.runOrderSnapshot)){const sid=resolve(r);if(!sid||!['played','completed'].includes(norm(r.status))||records.some(p=>p.songId===sid))continue;records.push({...r,songId:sid});}
  if(inAct&&(!Array.isArray(s.playedSongsSnapshot)||!Array.isArray(s.performanceLogSnapshot)))venue.incomplete++;
  for(const r of records){
   const sid=r.songId,date=played(r)||start(s),g=global.get(sid)||{count:0,lastDate:0};g.count++;g.lastDate=Math.max(g.lastDate,date);global.set(sid,g);
   if(!inAct)continue;const stat=venue.songs.get(sid)||empty();stat.count++;stat.lastDate=Math.max(stat.lastDate,date);stat.gigsAgo=stat.gigsAgo===null?gig:Math.min(stat.gigsAgo,gig);
   if(['great','good','average','weak'].includes(r.crowdResponse)){stat.ratings++;if(['great','good'].includes(r.crowdResponse))stat.positive++;}
   const duration=Number(r.durationMs)||ms(r.endedAt)-ms(r.startedAt||r.playedAt);if(duration>15000&&duration<3600000)stat.durations.push(duration);
   venue.songs.set(sid,stat);
  }
  if(inAct)for(const r of array(s.requestSnapshot)){const sid=resolve(r);if(!sid)continue;const stat=venue.songs.get(sid)||empty();if(!['deleted','rejected','cancelled','canceled'].includes(norm(r.status)))stat.requests++;if(['completed','played'].includes(norm(r.status)))stat.completedRequests++;if(norm(r.status)==='abandoned')stat.abandonedRequests++;venue.songs.set(sid,stat);}

 }
 return {venues,global,resolve,historyCount:history.length,unknownActs:history.filter(s=>act(s)==='unknown').length};
}
function rank(songs,index,context={},options={}){
 const cfg={...DEFAULTS,...options,weights:{...DEFAULTS.weights,...options.weights}};cfg.freshAfter=Math.max(3,Number(cfg.freshAfter)||5);cfg.readyAfter=Math.min(cfg.freshAfter,Math.max(2,Number(cfg.readyAfter)||3));
 const venue=index.venues.get(context.venueKey||norm(context.venue)),known=!!norm(context.venue)&&context.historyReady!==false,partial=!!venue?.incomplete||!!context.historyTruncated;
 const tonight=new Set(array(context.performed).map(index.resolve).filter(Boolean)),order=array(context.runOrder);
 for(const r of order)if(['playing','played','completed'].includes(norm(r.status))||r.playingAtMs||r.playedAtMs)tonight.add(index.resolve(r));
 const previousId=index.resolve(order.find(r=>norm(r.status)==='playing')||{})||context.currentSongId||index.resolve([...order].reverse().find(r=>['playing','played','completed'].includes(norm(r.status)))||{}),previous=songs.find(s=>id(s)===previousId),previousBpm=Number(previous?.userBpm||previous?.originalBpm||previous?.bpm)||0,now=context.now||Date.now();
 return songs.map(song=>{
  const sid=id(song),stat=venue?.songs.get(sid)||empty(),global=index.global.get(sid)||{count:0,lastDate:0},isTonight=tonight.has(sid),unseen=known&&!stat.count;
  const badge=isTonight?'TONIGHT':!known?'UNKNOWN':unseen?'FRESH':stat.gigsAgo===1?'TOO SOON':stat.gigsAgo<cfg.readyAfter?'RECENT':stat.gigsAgo>=cfg.freshAfter?'FRESH':'READY';
  const reasons=[isTonight?'Playing / played this session':!known?'Venue history unavailable':unseen?(partial?'No play found · incomplete venue history':'No play found in recorded venue history'):`Played here ${stat.gigsAgo} venue gig${stat.gigsAgo===1?'':'s'} ago`],components={};
  if(known)components.freshness=unseen?(partial?.5:1):Math.min(1,Math.max(0,(stat.gigsAgo-1)/(cfg.freshAfter-1)));
  components.requests=stat.requests?Math.min(1,.5+Math.min(stat.requests,5)*.05+Math.min(stat.completedRequests,5)*.05-Math.min(stat.abandonedRequests,3)*.1):.5;
  if(stat.completedRequests)reasons.push(`${stat.completedRequests} completed request${stat.completedRequests===1?'':'s'} here`);
  const artist=norm(song.artist),prevArtist=norm(previous?.artist),sameArtist=!!artist&&artist!=='unknown artist'&&artist===prevArtist,bpm=Number(song.userBpm||song.originalBpm||song.bpm)||0;
  let flow=.5;const knownArtists=artist&&prevArtist&&artist!=='unknown artist'&&prevArtist!=='unknown artist';if(previous&&knownArtists){flow=sameArtist?.2:.8;if(!sameArtist)reasons.push('Different artist');}
  if(bpm&&previousBpm){const delta=bpm-previousBpm;let tempo=Math.abs(delta)<=20?1:.4;if(context.intent==='tempo-up')tempo=delta>0&&delta<=30?1:delta>30?.6:0;if(context.intent==='tempo-down')tempo=delta<0&&delta>=-30?1:delta< -30?.6:0;if(context.intent==='tempo-keep')tempo=Math.max(0,1-Math.abs(delta)/25);flow=(flow+tempo)/2;reasons.push(delta>5?'Tempo ↑':delta< -5?'Tempo ↓':'Similar tempo');}
  components.flow=flow;components.global=global.lastDate?Math.min(1,Math.max(0,(now-global.lastDate)/(90*86400000))):.5;
  const e=energy(song),prevEnergy=energy(previous);components.energy=.5;
  if(e){components.energy=context.intent==='energy-up'?(prevEnergy?Math.min(1,.5+(e-prevEnergy)*.3):e/3):context.intent==='chill'?(4-e)/3:context.intent==='energy-keep'&&prevEnergy?1-Math.abs(e-prevEnergy)/3:.5;if(prevEnergy)reasons.push(e>prevEnergy?'Energy ↑':e<prevEnergy?'Energy ↓':'Energy matches');}
  const tags=values(song.crowdFunction),positions=values(song.setPosition),modes=values(song.performanceMode);const unsuitable=!!context.act&&context.act!=='all'&&modes.length&&!modes.includes(norm(context.act))&&!modes.includes('all');
  if(context.act&&context.act!=='all'&&modes.includes(norm(context.act)))reasons.push('Tagged for '+context.act);
  if(context.intent==='singalong'){components.energy=tags.includes('singalong')?1:.25;if(tags.includes('singalong'))reasons.push('Tagged singalong');}
  if(context.intent==='closer'){components.energy=positions.some(x=>['closer','big finish'].includes(x))?1:.25;if(components.energy===1)reasons.push('Tagged closer');}
  components.reliability=({high:1,medium:.6,low:.2,reliable:1}[norm(song.reliability)]??.5);if(components.reliability===1)reasons.push('High host-rated reliability');
  const recent=array(context.performed).slice(-3).map(r=>songs.find(s=>id(s)===index.resolve(r))),genres=values(song.genre||song.genres),repeated=genres.length&&recent.length>=2&&recent.every(s=>values(s?.genre||s?.genres).some(g=>genres.includes(g)));
  components.variety=repeated?.15:.5;if(repeated)reasons.push('Repeated genre/style');
  components.outcomes=stat.ratings?(stat.positive+1)/(stat.ratings+2):.5;if(stat.ratings)reasons.push(`${stat.positive}/${stat.ratings} positive host ratings here`);
  if(stat.lastDate)reasons.push(`${Math.floor((now-stat.lastDate)/86400000)} days since venue play`);
  const queued=order.some(r=>index.resolve(r)===sid&&!['played','completed','abandoned','left','declined','cancelled','canceled','deleted','deletedbyhost','rejected'].includes(norm(r.status)));if(queued)reasons.push('Already committed in Run Order');
  if(context.sourceName)reasons.push('Source: '+context.sourceName);
  let sum=0,weight=0;for(const [key,value]of Object.entries(components)){sum+=value*cfg.weights[key];weight+=cfg.weights[key];}let score=weight?100*sum/weight:50;if(sameArtist){score-=cfg.sameArtistPenalty;reasons.push('Same artist penalty');}if(stat.gigsAgo===1)score-=cfg.lastGigPenalty;if(!known)score=Math.min(score,60);else if(partial)score=Math.min(score,75);else if(!venue?.gigs.length)score=Math.min(score,65);
  const isNote=!/^\p{L}/u.test(String(song.title||'').trim()),eligible=!queued&&!isTonight&&sid!==context.currentSongId&&!isNote&&!!sid&&!unsuitable&&(!context.poolIds||context.poolIds.has(sid));
  return {song,id:sid,score:eligible?Math.max(0,Math.min(100,Math.round(score))):0,badge,reasons,eligible,isNote,unseen,stat,global,components,partial};
 }).sort((a,b)=>b.score-a.score||String(a.song.title).localeCompare(String(b.song.title))||a.id.localeCompare(b.id));
}
return {DEFAULTS,norm,ms,buildIndex,rank,venueKey,act};
});
