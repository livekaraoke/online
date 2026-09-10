/* Copyright © 2026 LiveSuite. All rights reserved.
 * Song Inbox: idempotent quick capture, per-song counters, local retry drafts,
 * paged management and Lyrics Creator handoff. No continuous cloud listener.
 */
(() => {
  'use strict';
  const db=()=>window.db||window.LK?.db;
  const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const project=()=>firebase.app().options.projectId;
  const draftKey=()=>`ls26:inboxDrafts:${project()}`;
  const readDrafts=()=>{try{return JSON.parse(localStorage.getItem(draftKey())||'[]');}catch(_){return[];}};
  async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function commit(entry){
    const id=await digest(normal(entry.title)+'|'+normal(entry.artist));
    const ref=db().collection('songInbox').doc(id);
    await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),old=snap.data()||{};
      const recent=old.recentCaptureIds||[];
      if(recent.includes(entry.captureId))return;
      const stamp=firebase.firestore.FieldValue.serverTimestamp();
      tx.set(ref,{title:entry.title,artist:entry.artist,titleKey:normal(entry.title),artistKey:normal(entry.artist),status:old.status||'New',requestCount:(old.requestCount||0)+1,firstRequestedAt:old.firstRequestedAt||stamp,lastRequestedAt:stamp,lastRequester:entry.requester,lastSessionId:entry.sessionId,lastVenue:entry.venue,recentCaptureIds:[...recent,entry.captureId].slice(-40),recentOccurrences:[...(old.recentOccurrences||[]),{at:entry.at,requester:entry.requester,sessionId:entry.sessionId,venue:entry.venue}].slice(-20)},{merge:true});
    });
    localStorage.setItem(draftKey(),JSON.stringify(readDrafts().filter(x=>x.captureId!==entry.captureId)));
    window.dispatchEvent(new Event('ls26:inbox-updated'));
  }
  async function capture(input){
    if(!input.title?.trim())throw Error('Enter a song title.');
    const session=window.LK?.sessionTools?.getSession?.();
    const entry={captureId:crypto.randomUUID(),title:input.title.trim(),artist:input.artist?.trim()||'',requester:input.requester?.trim()||'',at:new Date().toISOString(),sessionId:session?.id||window.LK?.sessionTools?.getSessionId?.()||'',venue:session?.venueName||session?.venue||''};
    // Persist before the network call, never discard a failed capture.
    localStorage.setItem(draftKey(),JSON.stringify([...readDrafts(),entry]));
    if(!navigator.onLine)throw Error('Saved on this device. Use Retry saved captures in Song Inbox when online.');
    try{await commit(entry);}catch(e){throw Error('Saved on this device; cloud save failed. Retry from Song Inbox. '+e.message);}
  }
  window.LS26Inbox={capture,normal,commit,readDrafts};
  async function manage(){
    const list=document.getElementById('inboxRows');if(!list)return;
    let cursor=null,rows=[],loading=false;
    const esc=LS26.escape;
    function render(){const term=normal(document.getElementById('inboxSearch').value),status=document.getElementById('inboxStatus').value;list.innerHTML=rows.filter(x=>(!status||x.status===status)&&(!term||normal(x.title+' '+x.artist).includes(term))).map(x=>`<article class="ls26-inbox-row"><div><strong>${esc(x.title)}</strong><small>${esc(x.artist||'Artist not specified')}</small><small>${esc(x.lastRequester||'')} · ${esc(x.lastVenue||'')} · ${esc(x.lastRequestedAt?.toDate?.().toLocaleDateString()||'')}</small></div><strong>${x.requestCount||1}×</strong><select data-status="${esc(x.id)}" aria-label="Status for ${esc(x.title)}">${['New','To Learn','Added','Skip'].map(s=>`<option ${x.status===s?'selected':''}>${s}</option>`).join('')}</select><a class="ls26-button" href="${LS26.url('host/lyricscreator.html')}?inboxTitle=${encodeURIComponent(x.title)}&inboxArtist=${encodeURIComponent(x.artist||'')}">Open Creator</a></article>`).join('')||'<p>No matching entries in the loaded results.</p>';document.getElementById('inboxDrafts').textContent=`${readDrafts().length} captures saved on this device awaiting sync`;}
    async function load(reset=false){if(loading)return;loading=true;try{if(reset){cursor=null;rows=[];}let query=db().collection('songInbox').orderBy('requestCount','desc').limit(50);if(cursor)query=query.startAfter(cursor);const snap=await query.get();rows.push(...snap.docs.map(d=>({id:d.id,...d.data()})));cursor=snap.docs.at(-1)||cursor;document.getElementById('inboxMore').disabled=snap.size<50;render();}catch(e){list.textContent='Could not load Song Inbox: '+e.message;}finally{loading=false;}}
    document.getElementById('inboxSearch').oninput=render;document.getElementById('inboxStatus').onchange=render;document.getElementById('inboxMore').onclick=()=>load();document.getElementById('inboxRefresh').onclick=()=>load(true);document.getElementById('inboxCapture').onclick=()=>LS26.openInbox();
    document.getElementById('inboxRetry').onclick=async()=>{try{for(const entry of readDrafts())await commit(entry);await load(true);}catch(e){LS26.toast(e.message);}render();};
    list.onchange=async e=>{const id=e.target.dataset.status;if(!id)return;const entry=rows.find(x=>x.id===id),old=entry.status;try{e.target.disabled=true;await db().collection('songInbox').doc(id).update({status:e.target.value,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});entry.status=e.target.value;}catch(err){e.target.value=old;LS26.toast(err.message);}finally{e.target.disabled=false;}};
    window.addEventListener('ls26:inbox-updated',()=>load(true));await load();
  }
  document.addEventListener('DOMContentLoaded',manage);
})();
