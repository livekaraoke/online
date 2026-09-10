/* Copyright © 2026 LiveSuite. All rights reserved.
 * Session presentation and action adapters. Reuses session-tools snapshots.
 * Mirrors never open additional Firestore listeners. Transactions protect decisions.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), tools=()=>window.LK?.sessionTools;
  const db=()=>window.db||window.LK?.db;
  const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const date=x=>x?.toDate?.()||(x?new Date(x):null);
  const clock=x=>date(x)?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false})||'—';
  const esc=x=>LS26.escape(x);
  const pending=x=>!x.status||['active','pending','waiting'].includes(x.status.toLowerCase());
  function dialog(title,content){const d=document.createElement('dialog');d.className='ls26-dialog';d.innerHTML=`<h2>${esc(title)}</h2>${content}<div class="ls26-dialog-actions"><button type="button" data-close>Close</button></div>`;document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d;}
  function renderSession(){
    const pane=$('tsSessionStatusPane');if(!pane||!tools())return;
    const session=tools().getSession(),publicList=tools().getPublicList?.()||{};
    let grid=$('ls26SessionGrid');if(!grid){grid=document.createElement('div');grid.id='ls26SessionGrid';grid.className='ls26-session-grid';pane.prepend(grid);}
    if(!session){grid.innerHTML=`<p>No active session. <a href="${LS26.url('admin-new/admin.html')}">Start a session in Admin</a></p>`;return;}
    const start=date(session.scheduledStartAt),end=date(session.scheduledEndAt),duration=start&&end?Math.round((end-start)/60000):0;
    const requestsOpen=LK.topStatus?.getRequestsEnabled?.();
    const breaks=session.breaks||[],open=session.breakOpen||breaks.some(x=>(x.start||x.startedAt)&&!(x.end||x.endedAt));
    const total=breaks.reduce((sum,b)=>sum+Math.max(0,((date(b.end||b.endedAt)||new Date())-date(b.start||b.startedAt))/60000),0);
    grid.innerHTML=`<section class="ls26-session-card"><small class="ls26-eyebrow">PERFORMANCE SESSION</small><p>${esc((start||date(session.startedAt)||new Date()).toLocaleDateString())}</p><strong>${esc(session.venue||session.venueName||'Venue')}</strong><small>${esc(session.locality||session.location||'')}</small><div class="ls26-session-schedule"><div><small>SCHEDULED START</small><strong>${clock(start)}</strong></div><div><small>PROJECTED END</small><strong>${clock(end)} <button class="ls26-edit-end" data-session="times" aria-label="Edit projected end time">✎</button></strong></div></div><p class="ls26-muted">Planned duration · ${Math.floor(duration/60)}h ${duration%60}m</p></section><section class="ls26-session-card"><small class="ls26-eyebrow">PUBLIC SONG LIST</small><strong class="ls26-public-list-name">${esc(publicList.setlistName||'Not selected')}</strong><button data-session="list">☷ Change song list</button><p class="ls26-requests-state ${requestsOpen===false?'is-closed':''}">${requestsOpen==null?'Loading request status…':requestsOpen?'● Requests OPEN — guests can submit songs':'● Requests CLOSED — new submissions disabled'}</p><button data-session="requests" ${requestsOpen==null?'disabled':''}>${requestsOpen?'🔒 Close requests':'🔓 Open requests'}</button><div class="ls26-session-lifecycle"><button class="ls26-break-action" data-session="break" aria-label="${open?'Resume session':'Start break'}" title="${open?'Resume session':'Start break'}">${open?'▶':'☕'}</button><button class="danger" data-session="end" aria-label="End session">■ SESSION</button></div></section><section class="ls26-session-card ls26-break-card"><div class="ls26-break-heading"><strong>Break history</strong><span>${breaks.length} breaks · ${Math.floor(total)}m total</span></div><div class="ls26-breaks"><table><thead><tr><th>#</th><th>Start</th><th>End</th><th>Time</th></tr></thead><tbody>${breaks.map((b,i)=>`<tr><td>${i+1}</td><td>${clock(b.start||b.startedAt)}</td><td>${clock(b.end||b.endedAt)}</td><td>${Math.floor(Math.max(0,((date(b.end||b.endedAt)||new Date())-date(b.start||b.startedAt))/60000))}m</td></tr>`).join('')}</tbody></table></div><p class="ls26-muted">${breaks.length?"All breaks recorded for this session":"No breaks taken yet"}</p></section>`;
    grid.onclick=async e=>{const action=e.target.closest('[data-session]')?.dataset.session;if(!action)return;try{if(action==='break')return LK.topStatus.toggleBreak();if(action==='times')return editTimes(session);if(action==='list')return chooseList(session);if(action==='requests'){const enabled=!requestsOpen;if(await LS26Dialogs.confirm(`${enabled?'Open':'Close'} song requests? ${enabled?'Guests will be able to submit songs.':'Existing requests stay in the queue.'}`)){const button=e.target.closest('button');button.disabled=true;try{await db().collection('karaoke').doc('state').set({songsEnabled:enabled,updatedAt:stamp()},{merge:true});LS26.toast(enabled?'Song requests opened':'Song requests closed');}finally{button.disabled=false;}}}if(action==='end')await endSession(session);}catch(err){LS26.toast(err.message);}};
  }
  function editTimes(session){
    const local=x=>{const d=date(x);return d?new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
    const d=dialog('Edit projected end',`<form><p>Scheduled start: ${clock(session.scheduledStartAt)}</p><label>Projected end<input type="datetime-local" name="end" required value="${local(session.scheduledEndAt)}"></label><button class="primary">Save end time</button><p role="status"></p></form>`);
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,start=date(session.scheduledStartAt),end=new Date(form.elements.end.value);if(!start||!Number.isFinite(end.getTime())||end<=start){form.querySelector('[role=status]').textContent='End must be after start.';return;}try{if(tools().getSessionId()!==session.id)throw Error('The active session changed. Reopen the end-time editor.');const batch=db().batch(),fields={scheduledEndAt:firebase.firestore.Timestamp.fromDate(end),scheduledDurationMs:end-start,updatedAt:stamp()};batch.set(db().collection('performanceSessions').doc(session.id),fields,{merge:true});batch.set(db().collection('karaokeControl').doc('currentSession'),fields,{merge:true});await batch.commit();d.close();}catch(err){form.querySelector('[role=status]').textContent=err.message;}};
  }
  async function chooseList(session){
    const snap=await LS26Data.collection('lyricsSetlists'),rows=snap.docs.map(x=>({id:x.id,...x.data()}));
    const d=dialog('Public song list',`<form><label>Selected list<select name="list">${rows.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.id)}</option>`).join('')}</select></label><button class="primary">Save selection</button><p role="status"></p></form>`);
    d.querySelector('select').value=tools().getPublicList()?.setlistId||rows[0]?.id||'';
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const row=rows.find(x=>x.id===e.currentTarget.elements.list.value);if(!row)return;try{const batch=db().batch();batch.set(db().collection('karaokeControl').doc('publicSongList'),{setlistId:row.id,setlistName:row.name||'',songCount:row.songIds?.length||0,source:'lyricsSetlists',updatedAt:stamp()},{merge:true});batch.set(db().collection('karaoke').doc('state'),{publicSongListSetlistId:row.id,publicSongListSetlistName:row.name||'',updatedAt:stamp()},{merge:true});batch.set(db().collection('performanceSessions').doc(session.id),{publicSetlistId:row.id,updatedAt:stamp()},{merge:true});await batch.commit();d.close();}catch(err){d.querySelector('p').textContent=err.message;}};
  }
  async function endSession(session){
    // Reuse the original admin lifecycle (archive/event/request normalization).
    // Navigate with an explicit action; admin authentication remains authoritative.
    if(!await LS26Dialogs.confirm('End this session? The Admin dashboard will open to complete and archive it.'))return;
    location.href=LS26.url('admin-new/admin.html?endSession='+encodeURIComponent(session.id));
  }
  const detailCache=new Map();
  async function enrichDetail(request,item){
    let song=tools().getSongs?.().find(s=>s.id===(request?.songId||item?.songId))||{};
    const songId=request?.songId||item?.songId;
    if(songId&&!song.id){try{if(!detailCache.has(songId)){const snap=await db().collection('lyrics').doc(songId).get();detailCache.set(songId,snap.data()||{});}song=detailCache.get(songId);}catch(error){LS26.toast('Song metadata unavailable: '+error.message);}}
    const fields={'Song':request?.songTitle||item?.songTitle||song.title,'Artist':request?.songArtist||request?.artist||item?.artist||song.artist,'Requester':request?.singerName||request?.name||item?.singerName||'Host choice','Note':request?.note,'Locality':request?.location,'Rating':request?.rating,'Age range':request?.ageRange,'Key':song.key,'Year':song.year,'BPM':song.bpm||song.originalBpm||song.tempo,'Capo':song.capo};
    dialog('Song & requester details',Object.entries(fields).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>`<p><small class="ls26-muted">${esc(k)}</small><br><strong>${esc(v)}</strong></p>`).join(''));
  }
  function rejectDialog(requestId,itemId,mode){
    const options=mode==='abandoned'?['Requester has left','Requester withdrew','Singer not available']:['Not suitable for this session','Not enough time tonight','Song unavailable','Duplicate request'];
    const d=dialog(mode==='abandoned'?'Abandon request':'Reject request',`<p>Select the message to attach to this request.</p><div class="ls26-dialog-actions">${options.map(x=>`<button data-reason="${esc(x)}">${esc(x)}</button>`).join('')}</div><p role="status"></p>`);
    d.addEventListener('click',async e=>{const reason=e.target.closest('[data-reason]')?.dataset.reason;if(!reason)return;d.querySelectorAll('button:not(.ls26-modal-x)').forEach(b=>b.disabled=true);try{await db().runTransaction(async tx=>{const runRef=db().collection('karaokeControl').doc('runOrder');let run;if(itemId){const snap=await tx.get(runRef);run=snap.data()||{};if(run.sessionId!==tools().getSessionId())throw Error('Session changed. Please reopen this action.');}const fields={status:mode,reason,updatedAt:stamp()};if(requestId)tx.set(db().collection('publicSongRequests').doc(requestId),fields,{merge:true});if(run)tx.set(runRef,{items:(run.items||[]).map(x=>x.id===itemId?{...x,status:mode,reason}:x),updatedAt:stamp()},{merge:true});});d.close();}catch(err){d.querySelector('[role=status]').textContent=err.message;d.querySelectorAll('button').forEach(b=>b.disabled=false);}});
  }
  function mirror(){
    const end=$('endMarker');if(!end||!tools())return;
    for(const [kind,title,source] of [['run','RUN ORDER','tsRunOrderList'],['requests','PENDING REQUESTS','tsPendingRequestsList']]){
      let card=$('ls26End'+kind);if(!card){card=document.createElement('section');card.id='ls26End'+kind;card.className='ls26-mirror '+kind;card.innerHTML=`<h3>${title}</h3><div class="ls26-mirror-list"></div>`;if(kind==='run')end.after(card);else $('ls26Endrun').after(card);}
      const list=card.querySelector('.ls26-mirror-list'),original=$(source);if(!original)continue;const content=original.innerHTML;if(list.innerHTML!==content)list.innerHTML=content;
    }
  }
  async function openSongPicker(){
    const d=dialog('Add a song',`<p class="ls26-muted" id="ls26PickerListName">Loading session song list…</p><input class="ls26-picker-search" placeholder="Search songs or artists" aria-label="Search session songs"><div class="ls26-picker-list">Loading…</div><a class="ls26-button" href="${LS26.url('library.html')}">Open full Library</a>`);
    try{
      await tools().ensureSongs();const session=tools().getSession()||{},publicList=tools().getPublicList()||{};
      const snap=await LS26Data.collection('lyricsSetlists');const lists=snap.docs.map(x=>({id:x.id,...x.data()}));
      const chosen=lists.find(x=>x.id===(session.setlistId||session.publicSetlistId||publicList.setlistId));
      const ids=new Set(session.setlistSongIds||chosen?.songIds||[]),songs=tools().getSongs().filter(x=>ids.has(x.id)).sort((a,b)=>String(a.title).localeCompare(String(b.title)));
      d.querySelector('#ls26PickerListName').textContent=chosen?.name||session.setlistName||publicList.setlistName||'No session setlist selected';
      const render=()=>{const q=d.querySelector('input').value.toLowerCase();d.querySelector('.ls26-picker-list').innerHTML=songs.filter(x=>(x.title+' '+x.artist).toLowerCase().includes(q)).map(x=>`<button data-picker-song="${esc(x.id)}"><span><strong>${esc(x.title)}</strong><small>${esc(x.artist||'')}</small></span><span>＋ Add</span></button>`).join('')||'<p>No matching session songs. Choose a session setlist or open the Library.</p>';};
      d.querySelector('input').oninput=render;render();
      d.addEventListener('click',async e=>{const button=e.target.closest('[data-picker-song]');if(!button)return;button.disabled=true;try{const song=songs.find(x=>x.id===button.dataset.pickerSong);await tools().enqueueSong({...song,firebaseId:song.id});button.lastElementChild.textContent='✓ Added';}catch(error){LS26.toast(error.message);button.disabled=false;}});
    }catch(error){d.querySelector('.ls26-picker-list').textContent=error.message;}
  }
  function ready(){
    if(!$('topStatusBar'))return false;
    renderSession();mirror();
    if($("ls26AddSong"))$("ls26AddSong").onclick=openSongPicker;
    const observer=new MutationObserver(()=>mirror());for(const id of ['tsRunOrderList','tsPendingRequestsList'])if($(id))observer.observe($(id),{childList:true,subtree:true});
    if(document.body.classList.contains('ls26-requests-page')){LK.topStatus.expand();tools().setWorkflowTab('pending');}
    return true;
  }
  function init(){
    if(!ready()){const observer=new MutationObserver(()=>{if(ready())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
    window.addEventListener('lk:session-updated',renderSession);window.addEventListener('ls26:public-list',renderSession);window.addEventListener('ls26:requests-gate',renderSession);
    let nextTimer;window.addEventListener('lk:runorder-updated',()=>{const card=$('endNextSongDetailsCard');if(card&&!card.hidden){clearTimeout(nextTimer);nextTimer=setTimeout(()=>window.LS26Performance?.nextDetails(),150);}});
    // Capture phase intercepts only our extended request workflows. Legacy
    // handlers still own queue launch/reorder and accept on the primary panels.
    document.addEventListener('click',async e=>{
      const button=e.target.closest('button');
      if(button){if(button.disabled)return;const data=button.dataset;const requestId=data.tsAbandonRequest||data.tsDecline||data.tsDeleteRequest,itemId=data.tsAbandonRun||data.tsRemove;
        if(requestId||itemId){e.preventDefault();e.stopImmediatePropagation();const item=tools()?.getRunOrder().find(x=>x.id===itemId);rejectDialog(requestId||item?.requestId,itemId,data.tsAbandonRequest||data.tsAbandonRun?'abandoned':'declined');return;}
        const handled=data.tsAccept||data.tsPlay||data.tsUp||data.tsDown;if(handled){e.preventDefault();e.stopImmediatePropagation();button.disabled=true;try{const actions=tools().actions;if(data.tsAccept)await actions.acceptRequest(data.tsAccept);else if(data.tsPlay)await actions.openRunOrderSong(data.tsPlay);else {const result=await actions.moveRunOrder(data.tsUp||data.tsDown,data.tsUp?-1:1);if(!result)LS26.toast('This song is already at the queue boundary.');}}catch(err){LS26.toast(err.message);}finally{button.disabled=false;}return;}
      }
      if(button)return;
      const row=e.target.closest('[data-ls-request],[data-ts-run-details]');if(row){e.preventDefault();e.stopImmediatePropagation();const item=tools()?.getRunOrder().find(x=>x.id===row.dataset.tsRunDetails);const request=tools()?.getRequests().find(x=>x.id===(row.dataset.lsRequest||item?.requestId));enrichDetail(request,item);}
    },true);
    // Local clock/timing updates have zero network operations.
    setInterval(()=>{const el=$('ls26Clock'),value=clock(new Date());if(el&&el.textContent!==value)el.textContent=value;const session=tools()?.getSession(),live=$('tsLiveLabel');if(session&&live){const label=session.breakOpen?'BREAK':'LIVE';if(live.textContent!==label)live.textContent=label;}},1000);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
