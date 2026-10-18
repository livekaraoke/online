/* Pure local performance calculations. No listeners, reads or writes. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.LS26Intelligence=f();})(typeof window==='object'?window:this,()=>{
'use strict';
const norm=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const ms=v=>{if(v?.toMillis)return v.toMillis();if(v?.toDate)return +v.toDate();if(v?.seconds)return v.seconds*1000;const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?n:0;};
const act=s=>norm(s?.act||s?.sessionType||s?.type||s?.eventSnapshot?.type)||'unknown';
const venue=s=>s?.venueId||s?.eventSnapshot?.venueId?'id:'+String(s.venueId||s.eventSnapshot.venueId):norm(s?.venue||s?.venueName||s?.eventSnapshot?.venue);
const values=v=>Array.isArray(v)?v.map(norm):String(v||'').split(',').map(norm).filter(Boolean);
const energy=s=>({low:1,chill:1,medium:2,high:3,'high energy':3,'medium energy':2}[norm(s?.energy)]||([1,2,3].includes(Number(s?.energy))?Number(s.energy):null));
const terminal=s=>['played','completed','finished','abandoned','left','declined','deleted','deletedbyhost','cancelled'].includes(norm(s));
const actualStart=s=>ms(s?.actualStartedAt)||(s?.timingVersion===2?0:ms(s?.startedAt));
function breakMs(breaks,from=0,to=Date.now()){
 const intervals=(breaks||[]).map(b=>[Math.max(from,ms(b.start||b.startedAt)),Math.min(to,ms(b.end||b.endedAt)||to)]).filter(([a,b])=>a&&b>a).sort((a,b)=>a[0]-b[0]);let total=0,end=0;
 for(const [a,b]of intervals){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;
}
function duration(song={},records=[],fallback=240){
 const saved=Number(song.durationSeconds||song.savedDurationSeconds);if(saved>=15&&saved<=3600)return {seconds:saved,source:'saved duration'};
 const samples=records.filter(r=>r.songId===(song.firebaseId||song.id)&&['completed','played'].includes(norm(r.status))).map(r=>Number(r.durationMs)||ms(r.endedAt)-ms(r.startedAt||r.playedAt)).filter(x=>x>=15000&&x<=3600000).sort((a,b)=>a-b);
 if(samples.length)return {seconds:samples[Math.floor(samples.length/2)]/1000,source:`recorded median (${samples.length})`};return {seconds:fallback,source:'estimated average'};
}
function timing(session={},queue=[],songs=[],records=[],options={}){
 const now=options.now||Date.now(),fallback=Math.max(60,Number(options.averageSeconds)||240),gap=Math.max(0,Number(options.gapSeconds)||20),start=actualStart(session),end=ms(session.projectedEndAt||session.scheduledEndAt),stop=ms(session.actualEndedAt||session.endedAt)||now;
 const active=queue.filter(r=>!terminal(r.status)),map=new Map(songs.map(s=>[s.firebaseId||s.id,s]));
 let queueSeconds=0,estimated=false;for(const r of active){const d=duration(map.get(r.songId)||{id:r.songId},records,fallback);let left=d.seconds;if(norm(r.status)==='playing'&&ms(r.playingAtMs||r.playingAt))left=Math.max(0,left-(now-ms(r.playingAtMs||r.playingAt)-breakMs(session.breaks,ms(r.playingAtMs||r.playingAt),now))/1000);queueSeconds+=left+gap;estimated||=d.source==='estimated average';}
 const ds=songs.map(s=>duration(s,records,fallback).seconds),avg=ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:fallback,remaining=Math.max(0,end-now),breaks=breakMs(session.breaks,0,ms(session.closedAt||session.endedAt)||stop),elapsed=start?Math.max(0,stop-start):0;
 return {start,opened:ms(session.openedAt||session.startedAt),end,elapsed,breaks,performance:Math.max(0,elapsed-breakMs(session.breaks,start||now,stop)),remaining,queueFinish:now+queueSeconds*1000,overrun:end?now+queueSeconds*1000-end:0,estimated,range:[Math.floor(remaining/1000/(avg*1.2+gap)),Math.floor(remaining/1000/(avg*.8+gap))],awaiting:!start,breakOpen:(session.breaks||[]).some(b=>ms(b.start||b.startedAt)&&!ms(b.end||b.endedAt))};
}
function missing(song={}){
 const result=[],sections=song.sections||[],text=sections.map(s=>s.content||s.html||s.text||'').join(' ');
 if(song.lyricsApplicable!==false&&!sections.some(s=>!['tab','separator','hostNote'].includes(s.type)&&String(s.content||s.html||s.text||'').replace(/<[^>]*>/g,'').trim()))result.push('lyrics');
 if(song.chordsRequired===true&&!/data-chord|chord-token|class=["'][^"']*chord|\[[A-G][#b]?(?:m|maj|sus|dim|aug|\d)*\]/i.test(text))result.push('chords');
 if(song.timingRequired===true&&!song.timingVerified)result.push('timing-check');
 if(!song.key)result.push('key');if(!(Number(song.originalBpm)>0))result.push('bpm');if(song.looping&&!(Number(song.userBpm)>0))result.push('user-bpm');
 if(!values(song.genre||song.genres).length)result.push('genre');if(!energy(song)||!values(song.crowdFunction).length)result.push('tags');return result;
}
function flow(queue,songs){const map=new Map(songs.map(s=>[s.id||s.firebaseId,s])),rows=queue.filter(r=>!terminal(r.status)).map(r=>({...r,energy:energy(map.get(r.songId))})),warnings=[];let low=0;rows.forEach((r,i)=>{low=r.energy===1?low+1:0;if(low===3)warnings.push('Three low-energy songs together');if(i&&r.energy&&rows[i-1].energy&&Math.abs(r.energy-rows[i-1].energy)===2)warnings.push('Abrupt low/high energy change');});if(rows.length>=3&&!values(map.get(rows.at(-1).songId)?.setPosition).some(x=>['closer','big finish'].includes(x)))warnings.push('No tagged closer at the end');return {rows,warnings:[...new Set(warnings)]};}
function singerKey(r){const stable=r.requesterId||r.singerId||r.profileId||r.userId;const name=norm(r.singerName||r.name),device=r.requesterDeviceId||r.deviceId;return stable?'id:'+stable:device?'device:'+device+'|'+name:'name:'+name;}
function singers(requests,queue,now=Date.now()){
 const turns=new Map(),committed=new Set();for(const r of queue){const request=requests.find(x=>x.id===r.requestId),p={...request,...r},key=singerKey(p);if(['playing','played','completed'].includes(norm(r.status))){const old=turns.get(key)||{count:0,last:0};old.count++;old.last=Math.max(old.last,ms(r.playingAtMs||r.playedAtMs));turns.set(key,old);}if(!terminal(r.status))committed.add(key);}
 const groups=new Map();for(const r of requests){if(!['','pending','active','waiting'].includes(norm(r.status))||!r.songId)continue;const key=singerKey(r);if(key==='name:'||committed.has(key))continue;const old=groups.get(key);if(!old||ms(r.requestedAt||r.createdAt)<ms(old.requestedAt||old.createdAt))groups.set(key,r);}
 return [...groups].map(([key,r])=>({request:r,key,turns:turns.get(key)?.count||0,last:turns.get(key)?.last||0,waitingMs:ms(r.requestedAt||r.createdAt)?Math.max(0,now-ms(r.requestedAt||r.createdAt)):null,identityKnown:key.startsWith('id:')})).sort((a,b)=>a.turns-b.turns||a.last-b.last||(b.waitingMs||0)-(a.waitingMs||0));
}
function summary(session={},songs=[]){const records=session.playedSongsSnapshot||[],req=session.requestSnapshot||[],t=timing(session,[],songs,records),completed=records.filter(r=>['completed','played'].includes(norm(r.status))),rated=records.filter(r=>['great','good','average','weak'].includes(r.crowdResponse));return {...t,played:records.length,completed:completed.length,requestsFulfilled:req.filter(r=>['completed','played'].includes(norm(r.status))).length,unfulfilled:req.filter(r=>!['completed','played','deleted','rejected','declined','cancelled'].includes(norm(r.status))).length,rated:rated.length,favourites:rated.filter(r=>['great','good'].includes(r.crowdResponse)),unknownEnds:records.filter(r=>!ms(r.endedAt)).length};}
return {norm,ms,act,venue,energy,values,terminal,actualStart,breakMs,duration,timing,missing,flow,singers,summary};
});
