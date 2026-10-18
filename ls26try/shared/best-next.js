/* Copyright © 2026 LiveSuite. Existing session/Run Order adapter and tablet UI.
 * One cached archive read per active-session context, one current performedSongs
 * listener. Ranking, filtering, venue changes and panel opens perform no reads.
 */
(()=>{
'use strict';
const R=window.LS26Rotation,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={songs:[],history:[],performed:[],rows:[],map:new Map(),ready:false,liveReady:false,error:'',sessionId:null,uid:'',venue:'',venueOverride:false,source:'auto',lists:[],actScope:'session',preset:'balanced',historyTruncated:false,intent:'best',freshAfter:5,filter:'all',index:null};
let panelInvoker=null;
let stopPerformed=null,generation=0,inflight=null,currentSongId=new URLSearchParams(location.search).get('id')||new URLSearchParams(location.search).get('firebaseId')||'',session=null;
const tools=()=>window.LK?.sessionTools;
const scope=()=>`${firebase.app().options.projectId}:${state.uid}`;
const cacheKey=()=>`ls26:rotationHistory:v2:${scope()}`;
const settingsKey=()=>`ls26:rotationSettings:v1:${scope()}`;
const contextKey=()=>`ls26:recommendationContext:v1:${scope()}:${state.sessionId||'planning'}`;
function saveContext(){try{sessionStorage.setItem(contextKey(),JSON.stringify(Object.fromEntries(['venue','venueOverride','source','actScope','preset','intent'].map(k=>[k,state[k]]))));}catch(_){}}
function restoreContext(){Object.assign(state,{venue:'',venueOverride:false,source:'auto',actScope:'session',preset:'balanced',intent:'best'});try{const saved=JSON.parse(sessionStorage.getItem(contextKey())||'{}');for(const k of ['venue','venueOverride','source','actScope','preset','intent'])if(saved[k]!==undefined)state[k]=saved[k];}catch(_){}}
function context(){
 session=tools()?.getSession?.();const control=tools()?.getControl?.()||{};
 const automatic=session||control,autoKey=R.venueKey(automatic),key=state.venueOverride?state.venue:autoKey||state.venue;
 const known=state.history.find(s=>R.venueKey(s)===key),venue=state.venueOverride?(known?.venue||state.index?.venues.get(key)?.name||key):automatic.venue||known?.venue||'';
 const active=!!tools()?.getSessionId?.(),sessionList=session?.setlistId||session?.publicSetlistId||tools()?.getPublicList?.()?.setlistId;
 let working=document.getElementById('setlistFilter')?.value;try{working=working||JSON.parse(localStorage.getItem('lyricsViewerUiStateV2')||'{}').setlist;}catch(_){}
 const selected=state.source==='auto'?(active?sessionList:working):state.source==='all'?'':state.source;
 const list=state.lists.find(l=>l.id===selected),ids=state.source==='auto'&&active?(session?.setlistSongIds||list?.songIds||[]):list?.songIds;
 return {venue,venueKey:key,act:state.actScope==='all'?'all':state.actScope==='session'?R.act(automatic):state.actScope,currentSongId,runOrder:tools()?.getRunOrder?.()||[],performed:state.performed,historyReady:state.ready,historyTruncated:state.historyTruncated,intent:state.intent,poolIds:state.source==='all'?null:ids?new Set(ids):state.source!=='auto'||active?new Set():null,sourceName:list?.name||(state.source!=='auto'&&state.source!=='all'?'Selected setlist unavailable':active&&state.source==='auto'?'Session setlist (not assigned)':'All songs')};
}
function recalculate(){
 const ctx=context();state.index=R.buildIndex(state.songs,state.history,state.sessionId||'',ctx);
 const weights={...R.DEFAULTS.weights};const boosts={freshness:'freshness',energy:'energy',requests:'requests',variety:'variety',reliable:'reliability'};if(boosts[state.preset])weights[boosts[state.preset]]+=25;
 state.rows=R.rank(state.songs,state.index,ctx,{freshAfter:state.freshAfter,weights});
 if(state.sessionId&&!state.liveReady)state.rows.forEach(r=>{r.eligible=false;});state.map=new Map(state.rows.map(r=>[r.id,r]));render();window.dispatchEvent(new Event('ls26:rotation-updated'));
}
// Keep only fields required by the index; names/notes/contact data of requesters
// are never written to this cache.
function compact(s){const record=r=>({songId:r.songId||'',songTitle:r.songTitle||r.title||'',artist:r.songArtist||r.artist||'',requestId:r.requestId||'',playedAt:R.ms(r.playedAt||r.startedAt||r.playingAtMs||r.createdAt),status:r.status||'',startedAt:R.ms(r.startedAt||r.playedAt),endedAt:R.ms(r.endedAt),durationMs:r.durationMs||0,crowdResponse:r.crowdResponse||''});const row={id:s.id,venue:s.venue||s.eventSnapshot?.venue||'',venueId:s.venueId||s.eventSnapshot?.venueId||'',act:R.act(s),status:s.status||'',startedAt:R.ms(s.actualStartedAt||s.startedAt||s.createdAt),endedAt:R.ms(s.actualEndedAt||s.endedAt)};for(const key of ['playedSongsSnapshot','performanceLogSnapshot','runOrderSnapshot','requestSnapshot'])if(Array.isArray(s[key]))row[key]=s[key].map(record);return row;}
async function loadHistory(force=false){
 if(inflight)return inflight;
 const token=generation,sid=state.sessionId,key=cacheKey();state.error='';
 inflight=Promise.resolve().then(async()=>{try{
  if(!force){try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached&&cached.sessionId===sid&&Date.now()-cached.at<6*3600000){state.history=cached.rows;state.historyTruncated=!!cached.truncated;state.ready=true;return;}}catch(_){}}
  const snap=await (window.db||LK.db).collection('performanceSessions').orderBy('startedAt','desc').limit(101).get();if(token!==generation)return;
  state.historyTruncated=snap.docs.length>100;state.history=snap.docs.slice(0,100).map(d=>compact({...(d.data()||{}),id:d.id}));state.ready=true;
  try{sessionStorage.setItem(key,JSON.stringify({at:Date.now(),sessionId:sid,rows:state.history,truncated:state.historyTruncated}));}catch(_){/* memory cache remains usable */}
 }catch(error){if(token===generation){state.ready=false;state.error='History unavailable. Check host sign-in/access, then Retry history.';console.warn('Best Next history:',error);}}
 finally{if(token===generation){inflight=null;recalculate();}}
 });return inflight;
}
function syncSession(){
 if(!state.uid||!tools()?.getControl?.())return;
 const sid=tools()?.getSessionId?.()||'';
 if(sid!==state.sessionId){generation++;state.sessionId=sid;state.venueOverride=false;state.source='auto';state.actScope='session';restoreContext();state.performed=[];state.liveReady=!sid;state.ready=false;state.history=[];inflight=null;stopPerformed?.();stopPerformed=null;
  const token=generation;
  if(sid)stopPerformed=(window.db||LK.db).collection('performanceSessions').doc(sid).collection('performedSongs').onSnapshot(snap=>{if(token!==generation)return;state.liveReady=true;state.performed=snap.docs.map(d=>d.data()).sort((a,b)=>R.ms(a.startedAt||a.playedAt)-R.ms(b.startedAt||b.playedAt));recalculate();},error=>{if(token!==generation)return;state.liveReady=false;state.error='Live play history unavailable. Recommendations paused; reload LiveSuite to retry.';console.warn(error);recalculate();});
  loadHistory();
 }
 recalculate();
}
function rowMarkup(r){return `<article class="best-next-row"><div class="best-next-row-head"><strong>${esc(r.song.title)}</strong><b>${r.score}</b></div><span class="rotation-badge" data-rotation="${r.badge}">${r.badge}</span><p>${r.reasons.slice(0,3).map(esc).join(' · ')}</p><button type="button" data-use-next="${esc(r.id)}">USE NEXT</button></article>`;}
function render(){
 const ctx=context(),top=state.rows.filter(r=>r.eligible).slice(0,5),first=top[0],button=document.getElementById('bestNextOpen');
 if(button){button.innerHTML=first?`<strong>BEST NEXT</strong><span class="best-next-title">${esc(first.song.title)}</span><b>${first.score}</b><small>${first.badge}${first.partial?' · partial history':''}</small>`:'BEST NEXT';button.title=first?`${first.badge} — ${first.reasons.join(' · ')}`:'Choose a fresh song';}
 const label=document.getElementById('bestNextVenue');if(label)label.textContent=(ctx.venue||'Select a venue')+(state.venueOverride?' · OVERRIDE':'')+' · '+ctx.sourceName+' · '+ctx.act;
 const status=document.getElementById('bestNextStatus');if(status)status.textContent=state.error||(!state.uid?'Sign in as host to load history.':!state.ready?'Loading venue history…':`${state.index?.venues.get(ctx.venueKey)?.gigs.length||0} recorded venue gigs · ${state.index?.venues.get(ctx.venueKey)?.incomplete||0} incomplete archives. Latest 100 timestamped sessions${state.historyTruncated?' (older history not loaded)':''}; ${state.index?.unknownActs||0} unknown-act archives. Scores rank suggestions, not crowd success.`);
 const rows=document.getElementById('bestNextRows');if(rows)rows.innerHTML=top.length?top.map(rowMarkup).join(''):'<p>No eligible songs. Change filters or check the song library.</p>';

 const venueSelect=document.getElementById('bestNextVenueSelect');
 if(venueSelect){const venues=new Map(state.history.filter(s=>s.venue||s.venueId).map(s=>[R.venueKey(s),s.venue]));if(ctx.venueKey)venues.set(ctx.venueKey,ctx.venue);venueSelect.innerHTML='<option value="">Choose recorded venue</option>'+[...venues].map(([k,v])=>`<option value="${esc(k)}">${esc(v)}${k.startsWith('id:')?' · '+esc(k.slice(3)):''}</option>`).join('');venueSelect.value=ctx.venueKey;venueSelect.disabled=false;}
 const source=document.getElementById('bestNextSource');if(source){source.innerHTML='<option value="auto">SESSION / WORKING SETLIST</option><option value="all">ALL SONGS</option>'+state.lists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');source.value=state.source;}
 const acts=document.getElementById('bestNextAct');if(acts){const known=[...new Set(state.history.map(R.act).concat([R.act(session||{})]))];acts.innerHTML='<option value="session">CURRENT SESSION ACT</option><option value="all">ALL ACTS</option>'+known.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');acts.value=state.actScope;}
 for(const [id,value]of [['bestNextIntent',state.intent],['bestNextPreset',state.preset]]){const select=document.getElementById(id);if(select)select.value=value;}
 const reset=document.getElementById('bestNextSessionVenue');if(reset)reset.disabled=!session?.venue;
 const history=document.getElementById('bestNextSongHistory'),r=state.map.get(currentSongId);
 if(history)history.innerHTML=`<h3>VENUE HISTORY — ${esc(ctx.venue||'No venue')}</h3>`+(r?`<p><span class="rotation-badge" data-rotation="${r.badge}">${r.badge}</span></p><p>${esc(r.reasons[0])}</p><p>Recorded plays here: ${r.stat.count}<br>Last date: ${r.stat.lastDate?esc(new Date(r.stat.lastDate).toLocaleDateString()):'—'}<br>Requests: ${r.stat.requests}<br>Completed requests: ${r.stat.completedRequests}<br>Abandoned requests: ${r.stat.abandonedRequests}<br>Global recorded plays: ${r.global.count}<br>Global last date: ${r.global.lastDate?esc(new Date(r.global.lastDate).toLocaleDateString()):'—'}</p><small>Historical archives only. ${r.partial?'Some venue archives are incomplete.':''}</small>`:'<p>History not loaded.</p>');
}
function open(invoker){panelInvoker=invoker||document.activeElement;const panel=document.getElementById('bestNextPanel');panel.hidden=false;document.getElementById('bestNextOpen')?.setAttribute('aria-expanded','true');document.getElementById('bestNextClose').focus();}
function close(){document.getElementById('bestNextPanel').hidden=true;document.getElementById('bestNextOpen')?.setAttribute('aria-expanded','false');panelInvoker?.focus();}
function mount(){
 if(document.getElementById('bestNextPanel'))return;
 const target=document.getElementById('libraryRecommendationTools');
 if(target){const button=document.createElement('button');button.id='bestNextOpen';button.type='button';button.textContent='BEST NEXT';button.setAttribute('aria-controls','bestNextPanel');button.setAttribute('aria-expanded','false');button.onclick=()=>open(button);target.prepend(button);}
 const panel=document.createElement('aside');panel.id='bestNextPanel';panel.hidden=true;panel.setAttribute('aria-label','Best Next recommendations');panel.innerHTML=`<header><strong>BEST NEXT</strong><button id="bestNextClose" type="button" aria-label="Close recommendations">✕</button></header><h3 id="bestNextVenue"></h3><p id="bestNextStatus" role="status"></p><div class="best-next-settings"><label>Recommendation venue<select id="bestNextVenueSelect"></select><button type="button" id="bestNextSessionVenue">USE SESSION VENUE</button></label><label>Song source<select id="bestNextSource"></select></label><label>Act history<select id="bestNextAct"></select></label><label>Priority<select id="bestNextPreset"><option value="balanced">Balanced</option><option value="freshness">Freshness</option><option value="energy">Energy</option><option value="requests">Requests</option><option value="variety">Variety</option><option value="reliable">Reliability</option></select></label><label>Intent<select id="bestNextIntent"><option value="best">BEST NEXT</option><option value="energy-up">BUILD ENERGY</option><option value="energy-keep">KEEP ENERGY</option><option value="chill">CHILL</option><option value="singalong">SINGALONG</option><option value="closer">BIG FINISH</option><option value="tempo-up">TEMPO ↑</option><option value="tempo-keep">KEEP TEMPO</option><option value="tempo-down">TEMPO ↓</option></select></label><label>Fresh after<select id="bestNextFresh"><option value="3">3 venue gigs</option><option value="5" selected>5 venue gigs</option><option value="8">8 venue gigs</option></select></label></div><small>Energy, singalong and reliability require explicit host tags. Missing metadata is neutral.</small><div id="bestNextRows"></div><button id="bestNextRefresh" type="button">REFRESH / RETRY HISTORY</button>`;document.body.append(panel);
 document.getElementById('bestNextClose').onclick=close;panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.getElementById('bestNextVenueSelect').onchange=e=>{state.venue=e.target.value;state.venueOverride=true;saveContext();recalculate();};
 document.getElementById('bestNextSessionVenue').onclick=()=>{state.venueOverride=false;saveContext();recalculate();};
 document.getElementById('bestNextSource').onchange=e=>{state.source=e.target.value;saveContext();recalculate();};
 document.getElementById('bestNextAct').onchange=e=>{state.actScope=e.target.value;saveContext();recalculate();};
 document.getElementById('bestNextPreset').onchange=e=>{state.preset=e.target.value;saveContext();recalculate();};
 document.getElementById('bestNextIntent').onchange=e=>{state.intent=e.target.value;saveContext();recalculate();};
 document.getElementById('bestNextFresh').onchange=e=>{state.freshAfter=Number(e.target.value);try{localStorage.setItem(settingsKey(),JSON.stringify({freshAfter:state.freshAfter}));}catch(_){}recalculate();};
 document.getElementById('bestNextRefresh').onclick=()=>{if(state.uid)loadHistory(true);};
 const info=document.querySelector('#songInfoDrawer .song-info-scroll');if(info){const section=document.createElement('section');section.id='bestNextSongHistory';section.className='song-info-card';info.append(section);}

 document.addEventListener('click',async e=>{const show=e.target.closest('[data-show-best]');if(show)open(show);const use=e.target.closest('[data-use-next]');if(!use)return;const r=state.map.get(use.dataset.useNext);if(!r?.eligible)return;use.disabled=true;try{await tools().enqueueSong(r.song,{next:true});window.LS26?.toast?.(`${r.song.title} is next in Run Order`);close();}catch(error){window.LS26?.toast?.(error.message);document.getElementById('bestNextStatus').textContent=error.message;}finally{use.disabled=false;}});
 firebase.auth().onAuthStateChanged(async user=>{generation++;stopPerformed?.();stopPerformed=null;state.uid=user?.uid||'';state.error='';state.sessionId=null;state.history=[];state.performed=[];state.ready=false;inflight=null;if(!user){state.songs=[];recalculate();return;}try{state.freshAfter=Number(JSON.parse(localStorage.getItem(settingsKey())||'{}').freshAfter)||5;}catch(_){}document.getElementById('bestNextFresh').value=String(state.freshAfter);const uid=state.uid;try{const snap=await window.LS26Data?.collection('lyricsSetlists');state.lists=snap?.docs.map(d=>({...d.data(),id:d.id}))||[];}catch(_){state.lists=[];}const songs=await tools()?.ensureSongs?.();if(uid!==state.uid)return;if(songs?.length)state.songs=songs;syncSession();});
}
window.LS26BestNext={snapshot:()=>({songs:state.songs,history:state.history,performed:state.performed,rows:state.rows,index:state.index,context:context(),truncated:state.historyTruncated}),renderRunOrder(card){const first=state.rows.find(r=>r.eligible);card.innerHTML=(first?`<div class="ts-best-next-heading"><small>BEST NEXT</small><strong>${esc(first.song.title)}</strong><b>${first.score}</b><span class="rotation-badge" data-rotation="${first.badge}">${first.badge}</span></div><p>${esc(context().venue||'No venue')}${state.venueOverride?' · OVERRIDE':''} · ${esc(context().sourceName)} · ${esc(first.reasons[0]||'')}</p><div class="ts-best-next-actions"><button type="button" data-use-next="${esc(first.id)}">USE NEXT</button><button type="button" data-show-best aria-controls="bestNextPanel">SHOW 5</button></div>`:`<p>${esc(state.error||(!state.uid?'Sign in to load recommendations.':!state.ready?'Loading recommendations…':'No eligible songs available.'))}</p><button type="button" data-show-best aria-controls="bestNextPanel">SHOW 5</button>`);},setSongs(songs){state.songs=songs;recalculate();},get:id=>state.map.get(String(id)),filter(value){state.filter=value;},matches(song){const r=state.map.get(String(song.firebaseId||song.id));if(state.filter==='all')return true;if(!r||r.isNote)return false;return state.filter==='best'?r.eligible:state.filter==='fresh'?r.badge==='FRESH':state.filter==='recent'?['RECENT','TOO SOON'].includes(r.badge):r.unseen;},compare:(a,b)=>(state.map.get(String(b.firebaseId||b.id))?.score||0)-(state.map.get(String(a.firebaseId||a.id))?.score||0),badge(song){const r=state.map.get(String(song.firebaseId||song.id));return r?`<span class="rotation-badge" data-rotation="${r.badge}" title="${esc(r.reasons[0])}">${r.badge}${r.eligible?' · '+r.score:''}</span>`:'';}};
window.addEventListener('ls26:working-setlist',()=>recalculate());window.addEventListener('lk:session-updated',syncSession);window.addEventListener('lk:runorder-updated',()=>recalculate());window.addEventListener('ls26:current-song',e=>{currentSongId=e.detail.songId;recalculate();});window.addEventListener('pagehide',()=>stopPerformed?.());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
