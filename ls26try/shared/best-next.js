/* Copyright © 2026 LiveSuite. Existing session/Run Order adapter and tablet UI.
 * One cached archive read per active-session context, one current performedSongs
 * listener. Ranking, filtering, venue changes and panel opens perform no reads.
 */
(()=>{
'use strict';
const R=window.LS26Rotation,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={songs:[],history:[],performed:[],rows:[],map:new Map(),ready:false,liveReady:false,error:'',sessionId:null,uid:'',venue:'',intent:'best',freshAfter:5,filter:'all',index:null};
let panelInvoker=null;
let stopPerformed=null,generation=0,inflight=null,currentSongId=new URLSearchParams(location.search).get('id')||new URLSearchParams(location.search).get('firebaseId')||'',session=null;
const tools=()=>window.LK?.sessionTools;
const scope=()=>`${firebase.app().options.projectId}:${state.uid}`;
const cacheKey=()=>`ls26:rotationHistory:v1:${scope()}`;
const settingsKey=()=>`ls26:rotationSettings:v1:${scope()}`;
function context(){session=tools()?.getSession?.();return {venue:session?.venue||tools()?.getControl?.()?.venue||state.venue,currentSongId,runOrder:tools()?.getRunOrder?.()||[],performed:state.performed,historyReady:state.ready,intent:state.intent};}
function recalculate(){state.index=R.buildIndex(state.songs,state.history,state.sessionId||'');state.rows=R.rank(state.songs,state.index,context(),{freshAfter:state.freshAfter});if(state.sessionId&&!state.liveReady)state.rows.forEach(r=>{r.eligible=false;});state.map=new Map(state.rows.map(r=>[r.id,r]));render();window.dispatchEvent(new Event('ls26:rotation-updated'));}
// Keep only fields required by the index; names/notes/contact data of requesters
// are never written to this cache.
function compact(s){const record=r=>({songId:r.songId||'',songTitle:r.songTitle||r.title||'',artist:r.songArtist||r.artist||'',requestId:r.requestId||'',playedAt:R.ms(r.playedAt||r.startedAt||r.playingAtMs||r.createdAt),status:r.status||''});const row={id:s.id,venue:s.venue||s.eventSnapshot?.venue||'',status:s.status||'',startedAt:R.ms(s.actualStartedAt||s.startedAt||s.createdAt),endedAt:R.ms(s.actualEndedAt||s.endedAt)};for(const key of ['playedSongsSnapshot','performanceLogSnapshot','runOrderSnapshot','requestSnapshot'])if(Array.isArray(s[key]))row[key]=s[key].map(record);return row;}
async function loadHistory(force=false){
 if(inflight)return inflight;
 const token=generation,sid=state.sessionId,key=cacheKey();state.error='';
 inflight=Promise.resolve().then(async()=>{try{
  if(!force){try{const cached=JSON.parse(sessionStorage.getItem(key)||'null');if(cached&&cached.sessionId===sid&&Date.now()-cached.at<6*3600000){state.history=cached.rows;state.ready=true;return;}}catch(_){}}
  const snap=await (window.db||LK.db).collection('performanceSessions').get();if(token!==generation)return;
  state.history=snap.docs.map(d=>compact({...(d.data()||{}),id:d.id}));state.ready=true;
  try{sessionStorage.setItem(key,JSON.stringify({at:Date.now(),sessionId:sid,rows:state.history}));}catch(_){/* memory cache remains usable */}
 }catch(error){if(token===generation){state.ready=false;state.error='History unavailable. Check host sign-in/access, then Retry history.';console.warn('Best Next history:',error);}}
 finally{if(token===generation){inflight=null;recalculate();}}
 });return inflight;
}
function syncSession(){
 if(!state.uid||!tools()?.getControl?.())return;
 const sid=tools()?.getSessionId?.()||'';
 if(sid!==state.sessionId){generation++;state.sessionId=sid;state.performed=[];state.liveReady=!sid;state.ready=false;state.history=[];inflight=null;stopPerformed?.();stopPerformed=null;
  const token=generation;
  if(sid)stopPerformed=(window.db||LK.db).collection('performanceSessions').doc(sid).collection('performedSongs').onSnapshot(snap=>{if(token!==generation)return;state.liveReady=true;state.performed=snap.docs.map(d=>d.data());recalculate();},error=>{if(token!==generation)return;state.liveReady=false;state.error='Live play history unavailable. Recommendations paused; reload LiveSuite to retry.';console.warn(error);recalculate();});
  loadHistory();
 }
 recalculate();
}
function rowMarkup(r){return `<article class="best-next-row"><div class="best-next-row-head"><strong>${esc(r.song.title)}</strong><b>${r.score}</b></div><span class="rotation-badge" data-rotation="${r.badge}">${r.badge}</span><p>${r.reasons.slice(0,3).map(esc).join(' · ')}</p><button type="button" data-use-next="${esc(r.id)}">USE NEXT</button></article>`;}
function render(){
 const ctx=context(),top=state.rows.filter(r=>r.eligible).slice(0,5),first=top[0],button=document.getElementById('bestNextOpen');
 if(button){button.innerHTML=first?`<strong>BEST NEXT</strong><span class="best-next-title">${esc(first.song.title)}</span><b>${first.score}</b><small>${first.badge}${first.partial?' · partial history':''}</small>`:'BEST NEXT';button.title=first?`${first.badge} — ${first.reasons.join(' · ')}`:'Choose a fresh song';}
 const label=document.getElementById('bestNextVenue');if(label)label.textContent=ctx.venue||'Select a venue / start a session';
 const status=document.getElementById('bestNextStatus');if(status)status.textContent=state.error||(!state.uid?'Sign in as host to load history.':!state.ready?'Loading venue history…':`${state.index?.venues.get(R.norm(ctx.venue))?.gigs.length||0} recorded venue gigs · ${state.index?.venues.get(R.norm(ctx.venue))?.incomplete||0} incomplete archives. Scores are suggestions, not crowd ratings.`);
 const rows=document.getElementById('bestNextRows');if(rows)rows.innerHTML=top.length?top.map(rowMarkup).join(''):'<p>No eligible songs. Change filters or check the song library.</p>';

 const venueSelect=document.getElementById('bestNextVenueSelect');if(venueSelect){const venues=[...state.index.venues.values()].map(v=>v.name).sort();venueSelect.innerHTML='<option value="">Choose recorded venue</option>'+venues.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');venueSelect.value=state.venue;venueSelect.disabled=!!session?.venue;venueSelect.title=session?.venue?'Venue follows the active session':'Choose a venue for planning';}
 const history=document.getElementById('bestNextSongHistory'),r=state.map.get(currentSongId);
 if(history)history.innerHTML=`<h3>VENUE HISTORY — ${esc(ctx.venue||'No venue')}</h3>`+(r?`<p><span class="rotation-badge" data-rotation="${r.badge}">${r.badge}</span></p><p>${esc(r.reasons[0])}</p><p>Recorded plays here: ${r.stat.count}<br>Last date: ${r.stat.lastDate?esc(new Date(r.stat.lastDate).toLocaleDateString()):'—'}<br>Requests: ${r.stat.requests}<br>Completed requests: ${r.stat.completedRequests}<br>Abandoned requests: ${r.stat.abandonedRequests}<br>Global recorded plays: ${r.global.count}<br>Global last date: ${r.global.lastDate?esc(new Date(r.global.lastDate).toLocaleDateString()):'—'}</p><small>Historical archives only. ${r.partial?'Some venue archives are incomplete.':''}</small>`:'<p>History not loaded.</p>');
}
function open(invoker){panelInvoker=invoker||document.activeElement;const panel=document.getElementById('bestNextPanel');panel.hidden=false;document.getElementById('bestNextOpen')?.setAttribute('aria-expanded','true');document.getElementById('bestNextClose').focus();}
function close(){document.getElementById('bestNextPanel').hidden=true;document.getElementById('bestNextOpen')?.setAttribute('aria-expanded','false');panelInvoker?.focus();}
function mount(){
 if(document.getElementById('bestNextPanel'))return;
 const target=document.getElementById('libraryRecommendationTools');
 if(target){const button=document.createElement('button');button.id='bestNextOpen';button.type='button';button.textContent='BEST NEXT';button.setAttribute('aria-controls','bestNextPanel');button.setAttribute('aria-expanded','false');button.onclick=()=>open(button);target.prepend(button);}
 const panel=document.createElement('aside');panel.id='bestNextPanel';panel.hidden=true;panel.setAttribute('aria-label','Best Next recommendations');panel.innerHTML=`<header><strong>BEST NEXT</strong><button id="bestNextClose" type="button" aria-label="Close recommendations">✕</button></header><h3 id="bestNextVenue"></h3><p id="bestNextStatus" role="status"></p><div class="best-next-settings"><label>Planning venue<select id="bestNextVenueSelect"></select></label><label>Intent<select id="bestNextIntent"><option value="best">BEST NEXT</option><option value="tempo-up">TEMPO ↑</option><option value="tempo-keep">KEEP TEMPO</option><option value="tempo-down">TEMPO ↓</option></select></label><label>Fresh after<select id="bestNextFresh"><option value="3">3 venue gigs</option><option value="5" selected>5 venue gigs</option><option value="8">8 venue gigs</option></select></label></div><small>Tempo uses BPM; it does not infer energy or singalong suitability.</small><div id="bestNextRows"></div><button id="bestNextRefresh" type="button">REFRESH / RETRY HISTORY</button>`;document.body.append(panel);
 document.getElementById('bestNextClose').onclick=close;panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.getElementById('bestNextVenueSelect').onchange=e=>{state.venue=e.target.value;recalculate();};
 document.getElementById('bestNextIntent').onchange=e=>{state.intent=e.target.value;recalculate();};
 document.getElementById('bestNextFresh').onchange=e=>{state.freshAfter=Number(e.target.value);try{localStorage.setItem(settingsKey(),JSON.stringify({freshAfter:state.freshAfter}));}catch(_){}recalculate();};
 document.getElementById('bestNextRefresh').onclick=()=>{if(state.uid)loadHistory(true);};
 const info=document.querySelector('#songInfoDrawer .song-info-scroll');if(info){const section=document.createElement('section');section.id='bestNextSongHistory';section.className='song-info-card';info.append(section);}

 document.addEventListener('click',async e=>{const show=e.target.closest('[data-show-best]');if(show)open(show);const use=e.target.closest('[data-use-next]');if(!use)return;const r=state.map.get(use.dataset.useNext);if(!r?.eligible)return;use.disabled=true;try{await tools().enqueueSong(r.song,{next:true});window.LS26?.toast?.(`${r.song.title} is next in Run Order`);close();}catch(error){window.LS26?.toast?.(error.message);document.getElementById('bestNextStatus').textContent=error.message;}finally{use.disabled=false;}});
 firebase.auth().onAuthStateChanged(async user=>{generation++;stopPerformed?.();stopPerformed=null;state.uid=user?.uid||'';state.sessionId=null;state.history=[];state.performed=[];state.ready=false;inflight=null;if(!user){state.songs=[];recalculate();return;}try{state.freshAfter=Number(JSON.parse(localStorage.getItem(settingsKey())||'{}').freshAfter)||5;}catch(_){}document.getElementById('bestNextFresh').value=String(state.freshAfter);const uid=state.uid;const songs=await tools()?.ensureSongs?.();if(uid!==state.uid)return;if(songs?.length)state.songs=songs;syncSession();});
}
window.LS26BestNext={renderRunOrder(card){const first=state.rows.find(r=>r.eligible);card.innerHTML=`<small>BEST NEXT</small>`+(first?`<div class="ts-best-next-heading"><strong>${esc(first.song.title)}</strong><b>${first.score}</b></div><p><span class="rotation-badge" data-rotation="${first.badge}">${first.badge}</span> ${esc(first.reasons[0]||'')}</p><div class="ts-best-next-actions"><button type="button" data-use-next="${esc(first.id)}">USE NEXT</button><button type="button" data-show-best aria-controls="bestNextPanel">SHOW 5</button></div>`:`<p>${esc(state.error||(!state.uid?'Sign in to load recommendations.':!state.ready?'Loading recommendations…':'No eligible songs available.'))}</p><button type="button" data-show-best aria-controls="bestNextPanel">SHOW 5</button>`);},setSongs(songs){state.songs=songs;recalculate();},get:id=>state.map.get(String(id)),filter(value){state.filter=value;},matches(song){const r=state.map.get(String(song.firebaseId||song.id));if(state.filter==='all')return true;if(!r||r.isNote)return false;return state.filter==='best'?r.eligible:state.filter==='fresh'?r.badge==='FRESH':state.filter==='recent'?['RECENT','TOO SOON'].includes(r.badge):r.unseen;},compare:(a,b)=>(state.map.get(String(b.firebaseId||b.id))?.score||0)-(state.map.get(String(a.firebaseId||a.id))?.score||0),badge(song){const r=state.map.get(String(song.firebaseId||song.id));return r?`<span class="rotation-badge" data-rotation="${r.badge}" title="${esc(r.reasons[0])}">${r.badge}${r.eligible?' · '+r.score:''}</span>`:'';}};
window.addEventListener('lk:session-updated',syncSession);window.addEventListener('lk:runorder-updated',()=>recalculate());window.addEventListener('ls26:current-song',e=>{currentSongId=e.detail.songId;recalculate();});window.addEventListener('pagehide',()=>stopPerformed?.());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
