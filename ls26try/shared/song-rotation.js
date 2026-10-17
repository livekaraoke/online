/* Copyright © 2026 LiveSuite. Pure history index/scorer; no IO. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.LS26Rotation=f();})(typeof window==='object'?window:this,()=>{
'use strict';
const DEFAULTS={freshAfter:5,readyAfter:3,weights:{freshness:55,requests:20,flow:20,global:5},sameArtistPenalty:18,lastGigPenalty:15};
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' '),array=v=>Array.isArray(v)?v:[],id=s=>String(s?.firebaseId||s?.id||'');
function ms(v){if(v?.toMillis)return v.toMillis();if(v?.toDate)return +v.toDate();if(v&&typeof v==='object'&&Number.isFinite(v.seconds))return v.seconds*1000;const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?n:0;}
const start=s=>ms(s.actualStartedAt||s.startedAt||s.createdAt),played=r=>ms(r.playedAt||r.startedAt||r.playingAtMs||r.createdAt);
const empty=()=>({count:0,lastDate:0,gigsAgo:null,requests:0,completedRequests:0,abandonedRequests:0});
function buildIndex(songs,sessions,sessionId=''){
 const byId=new Map(songs.map(s=>[id(s),s])),byName=new Map();
 songs.forEach(s=>{const k=norm(s.title)+'|'+norm(s.artist);byName.set(k,byName.has(k)?null:id(s));});
 const resolve=r=>byId.has(String(r.songId||''))?String(r.songId):byName.get(norm(r.songTitle||r.title)+'|'+norm(r.songArtist||r.artist))||'';
 const history=array(sessions).filter(s=>s.id!==sessionId&&(s.status==='ended'||s.endedAt||s.actualEndedAt)&&start(s)).sort((a,b)=>start(b)-start(a)||String(a.id).localeCompare(String(b.id)));
 const venues=new Map(),global=new Map();
 for(const s of history){
  const name=norm(s.venue||s.eventSnapshot?.venue);if(!name)continue;
  if(!venues.has(name))venues.set(name,{name:s.venue||s.eventSnapshot.venue,gigs:[],songs:new Map(),incomplete:0});
  const venue=venues.get(name),gig=venue.gigs.length+1;venue.gigs.push(s.id);
  const records=[],seen=new Set();
  for(const r of [...array(s.playedSongsSnapshot),...array(s.performanceLogSnapshot)]){const sid=resolve(r);if(!sid)continue;const k=[sid,r.requestId||'',played(r)].join('|');if(seen.has(k))continue;seen.add(k);records.push({...r,songId:sid});}
  for(const r of array(s.runOrderSnapshot)){const sid=resolve(r);if(!sid||!['played','completed'].includes(norm(r.status))||records.some(p=>p.songId===sid))continue;records.push({...r,songId:sid});}
  if(!Array.isArray(s.playedSongsSnapshot)||!Array.isArray(s.performanceLogSnapshot))venue.incomplete++;
  for(const r of records){const sid=r.songId,date=played(r)||start(s),stat=venue.songs.get(sid)||empty();stat.count++;stat.lastDate=Math.max(stat.lastDate,date);stat.gigsAgo=stat.gigsAgo===null?gig:Math.min(stat.gigsAgo,gig);venue.songs.set(sid,stat);const g=global.get(sid)||{count:0,lastDate:0};g.count++;g.lastDate=Math.max(g.lastDate,date);global.set(sid,g);}
  for(const r of array(s.requestSnapshot)){const sid=resolve(r);if(!sid)continue;const stat=venue.songs.get(sid)||empty();if(!['deleted','rejected','cancelled','canceled'].includes(norm(r.status)))stat.requests++;if(['completed','played'].includes(norm(r.status)))stat.completedRequests++;if(norm(r.status)==='abandoned')stat.abandonedRequests++;venue.songs.set(sid,stat);}
 }
 return {venues,global,resolve,historyCount:history.length};
}
function rank(songs,index,context={},options={}){
 const cfg={...DEFAULTS,...options,weights:{...DEFAULTS.weights,...options.weights}};cfg.freshAfter=Math.max(3,Number(cfg.freshAfter)||5);cfg.readyAfter=Math.min(cfg.freshAfter,Math.max(2,Number(cfg.readyAfter)||3));
 const venue=index.venues.get(norm(context.venue)),known=!!norm(context.venue)&&context.historyReady!==false;
 const tonight=new Set(array(context.performed).map(index.resolve).filter(Boolean)),order=array(context.runOrder);
 for(const r of order)if(['playing','played','completed'].includes(norm(r.status))||r.playingAtMs||r.playedAtMs)tonight.add(index.resolve(r));
 const previousId=context.currentSongId||index.resolve([...order].reverse().find(r=>['playing','played','completed'].includes(norm(r.status)))||{}),previous=songs.find(s=>id(s)===previousId),previousBpm=Number(previous?.userBpm||previous?.originalBpm||previous?.bpm)||0,now=context.now||Date.now();
 return songs.map(song=>{
  const sid=id(song),stat=venue?.songs.get(sid)||empty(),global=index.global.get(sid)||{count:0,lastDate:0},isTonight=tonight.has(sid),unseen=known&&!stat.count;
  const badge=isTonight?'TONIGHT':!known?'UNKNOWN':unseen?'FRESH':stat.gigsAgo===1?'TOO SOON':stat.gigsAgo<cfg.readyAfter?'RECENT':stat.gigsAgo>=cfg.freshAfter?'FRESH':'READY';
  const reasons=[isTonight?'Playing / played this session':!known?'Venue history unavailable':unseen?(venue?.incomplete?'No play found · incomplete history':'Never played here in recorded history'):`Played here ${stat.gigsAgo} venue gig${stat.gigsAgo===1?'':'s'} ago`],components={};
  if(known)components.freshness=unseen?1:Math.min(1,Math.max(0,(stat.gigsAgo-1)/(cfg.freshAfter-1)));
  components.requests=stat.requests?Math.min(1,.5+Math.min(stat.requests,5)*.05+Math.min(stat.completedRequests,5)*.05-Math.min(stat.abandonedRequests,3)*.1):.5;
  if(stat.completedRequests)reasons.push(`${stat.completedRequests} completed request${stat.completedRequests===1?'':'s'} here`);
  const artist=norm(song.artist),prevArtist=norm(previous?.artist),sameArtist=!!artist&&artist!=='unknown artist'&&artist===prevArtist,bpm=Number(song.userBpm||song.originalBpm||song.bpm)||0;
  let flow=.5;if(previous){flow=sameArtist?.2:.8;if(artist&&prevArtist&&!sameArtist)reasons.push('Different artist');}
  if(bpm&&previousBpm){const delta=bpm-previousBpm;let tempo=Math.abs(delta)<=20?1:.4;if(context.intent==='tempo-up')tempo=delta>0&&delta<=30?1:delta>30?.6:0;if(context.intent==='tempo-down')tempo=delta<0&&delta>=-30?1:delta< -30?.6:0;if(context.intent==='tempo-keep')tempo=Math.max(0,1-Math.abs(delta)/25);flow=(flow+tempo)/2;reasons.push(delta>5?'Tempo ↑':delta< -5?'Tempo ↓':'Similar tempo');}
  components.flow=flow;components.global=global.lastDate?Math.min(1,Math.max(0,(now-global.lastDate)/(90*86400000))):.5;
  let sum=0,weight=0;for(const [key,value]of Object.entries(components)){sum+=value*cfg.weights[key];weight+=cfg.weights[key];}let score=weight?100*sum/weight:50;if(sameArtist){score-=cfg.sameArtistPenalty;reasons.push('Same artist penalty');}if(stat.gigsAgo===1)score-=cfg.lastGigPenalty;
  const isNote=!/^\p{L}/u.test(String(song.title||'').trim()),eligible=!isTonight&&sid!==context.currentSongId&&!isNote&&!!sid;
  return {song,id:sid,score:eligible?Math.max(0,Math.min(100,Math.round(score))):0,badge,reasons,eligible,isNote,unseen,stat,global,components,partial:!!venue?.incomplete};
 }).sort((a,b)=>b.score-a.score||String(a.song.title).localeCompare(String(b.song.title))||a.id.localeCompare(b.id));
}
return {DEFAULTS,norm,ms,buildIndex,rank};
});
