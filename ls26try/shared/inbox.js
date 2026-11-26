/* Copyright © 2026 LiveSuite. All rights reserved.
 * Song Inbox: idempotent quick capture, public-suggestion approval, per-song counters,
 * local retry drafts, paged management and Lyrics Creator handoff.
 */
(() => {
  'use strict';
  const db=()=>window.db||window.LK?.db;
  const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const project=()=>firebase.app().options.projectId;
  const draftKey=()=>`ls26:inboxDrafts:${project()}`;
  const readDrafts=()=>{try{return JSON.parse(localStorage.getItem(draftKey())||'[]');}catch(_){return[];}};

  async function digest(value){
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))]
      .map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  async function commit(entry){
    const id=await digest(normal(entry.title)+'|'+normal(entry.artist));
    const ref=db().collection('songInbox').doc(id);
    await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),old=snap.data()||{};
      const recent=old.recentCaptureIds||[];
      if(recent.includes(entry.captureId))return;
      const stamp=firebase.firestore.FieldValue.serverTimestamp();
      const cleanNote=String(entry.note||'').trim().slice(0,500);
      const occurrence={at:entry.at,requester:entry.requester,sessionId:entry.sessionId,venue:entry.venue};
      if(cleanNote)occurrence.note=cleanNote;
      tx.set(ref,{
        title:entry.title,
        artist:entry.artist,
        titleKey:normal(entry.title),
        artistKey:normal(entry.artist),
        status:old.status||'New',
        requestCount:(old.requestCount||0)+1,
        firstRequestedAt:old.firstRequestedAt||stamp,
        lastRequestedAt:stamp,
        lastRequester:entry.requester,
        lastSessionId:entry.sessionId,
        lastVenue:entry.venue,
        lastNote:cleanNote||old.lastNote||'',
        recentCaptureIds:[...recent,entry.captureId].slice(-40),
        recentOccurrences:[...(old.recentOccurrences||[]),occurrence].slice(-20)
      },{merge:true});
    });
    localStorage.setItem(draftKey(),JSON.stringify(readDrafts().filter(x=>x.captureId!==entry.captureId)));
    window.dispatchEvent(new Event('ls26:inbox-updated'));
  }

  async function capture(input){
    if(!input.title?.trim())throw Error('Enter a song title.');
    const session=window.LK?.sessionTools?.getSession?.();
    const entry={
      captureId:crypto.randomUUID(),
      title:input.title.trim(),
      artist:input.artist?.trim()||'',
      note:input.note?.trim()||'',
      requester:input.requester?.trim()||'',
      at:new Date().toISOString(),
      sessionId:session?.id||window.LK?.sessionTools?.getSessionId?.()||'',
      venue:session?.venueName||session?.venue||''
    };
    localStorage.setItem(draftKey(),JSON.stringify([...readDrafts(),entry]));
    if(!navigator.onLine)throw Error('Saved on this device. Use Retry saved captures in Song Inbox when online.');
    try{await commit(entry);}
    catch(e){throw Error('Saved on this device; cloud save failed. Retry from Song Inbox. '+e.message);}
  }

  window.LS26Inbox={capture,normal,commit,readDrafts};

  async function manage(){
    const list=document.getElementById('inboxRows');
    if(!list)return;

    let cursor=null,rows=[],loading=false,pending=[];
    const esc=LS26.escape;
    const pendingRoot=document.getElementById('pendingSuggestionRows');
    const pendingCount=document.getElementById('pendingSuggestionCount');

    function renderPending(){
      if(pendingCount)pendingCount.textContent=String(pending.length);
      if(!pendingRoot)return;
      pendingRoot.innerHTML=pending.map(x=>{
        const artist=x.artist
          ? '<small>'+esc(ArtistNames.display(x.artist))+'</small>'
          : '<small>Artist not specified</small>';
        const note=x.note?'<p class="website-suggestion-note">“'+esc(x.note)+'”</p>':'';
        const date=x.createdAt?.toDate?.().toLocaleDateString?.()||'';
        return '<article class="website-suggestion-row" data-suggestion="'+esc(x.id)+'">'+
          '<div><strong>'+esc(x.title)+'</strong>'+artist+'<small>'+esc(date)+'</small>'+note+'</div>'+
          '<div class="website-suggestion-actions">'+
            '<button class="website-suggestion-approve" type="button" data-suggestion-action="approve">APPROVE</button>'+
            '<button class="website-suggestion-decline" type="button" data-suggestion-action="decline">DECLINE</button>'+
          '</div></article>';
      }).join('')||'<p class="ls26-muted">No pending website suggestions.</p>';
    }

    async function loadPending(){
      if(!pendingRoot)return;
      try{
        const snap=await db().collection('websiteSongSuggestions')
          .where('status','==','pending')
          .limit(100)
          .get();
        pending=snap.docs.map(d=>({id:d.id,...d.data()}))
          .sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
        renderPending();
      }catch(error){
        pendingRoot.textContent='Could not load pending website suggestions: '+error.message;
        if(pendingCount)pendingCount.textContent='!';
      }
    }

    function render(){
      const term=normal(document.getElementById('inboxSearch').value);
      const status=document.getElementById('inboxStatus').value;
      list.innerHTML=rows
        .filter(x=>(!status||x.status===status)&&(!term||normal(ArtistNames.searchText(x)).includes(term)))
        .map(x=>
          '<article class="ls26-inbox-row"><div><strong>'+esc(x.title)+'</strong>'+
          '<small>'+esc(ArtistNames.display(x.artist||'Artist not specified'))+'</small>'+
          '<small>'+esc(x.lastRequester||'')+' · '+esc(x.lastVenue||'')+' · '+esc(x.lastRequestedAt?.toDate?.().toLocaleDateString()||'')+'</small>'+
          (x.lastNote?'<small><em>'+esc(x.lastNote)+'</em></small>':'')+
          '</div><strong>'+(x.requestCount||1)+'×</strong>'+
          '<select data-status="'+esc(x.id)+'" aria-label="Status for '+esc(x.title)+'">'+
          ['New','To Learn','Added','Skip'].map(s=>'<option '+(x.status===s?'selected':'')+'>'+s+'</option>').join('')+
          '</select><a class="ls26-button" href="'+LS26.url('host/lyricscreator.html')+
          '?inboxTitle='+encodeURIComponent(x.title)+'&inboxArtist='+encodeURIComponent(x.artist||'')+'">Open Creator</a></article>'
        ).join('')||'<p>No matching entries in the loaded results.</p>';
      document.getElementById('inboxDrafts').textContent=
        readDrafts().length+' captures saved on this device awaiting sync';
    }

    async function load(reset=false){
      if(loading)return;
      loading=true;
      try{
        if(reset){cursor=null;rows=[];}
        let query=db().collection('songInbox').orderBy('requestCount','desc').limit(50);
        if(cursor)query=query.startAfter(cursor);
        const snap=await query.get();
        rows.push(...snap.docs.map(d=>({id:d.id,...d.data()})));
        cursor=snap.docs.at(-1)||cursor;
        document.getElementById('inboxMore').disabled=snap.size<50;
        render();
        if(reset||!pending.length)await loadPending();
      }catch(e){
        list.textContent='Could not load Song Inbox: '+e.message;
      }finally{
        loading=false;
      }
    }

    document.getElementById('inboxSearch').oninput=render;
    document.getElementById('inboxStatus').onchange=render;
    document.getElementById('inboxMore').onclick=()=>load();
    document.getElementById('inboxRefresh').onclick=()=>load(true);
    document.getElementById('inboxCapture').onclick=()=>LS26.openInbox();

    document.getElementById('inboxRetry').onclick=async()=>{
      try{
        for(const entry of readDrafts())await commit(entry);
        await load(true);
      }catch(e){LS26.toast(e.message);}
      render();
    };

    list.onchange=async e=>{
      const id=e.target.dataset.status;
      if(!id)return;
      const entry=rows.find(x=>x.id===id),old=entry.status;
      try{
        e.target.disabled=true;
        await db().collection('songInbox').doc(id).update({
          status:e.target.value,
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        });
        entry.status=e.target.value;
      }catch(err){
        e.target.value=old;
        LS26.toast(err.message);
      }finally{
        e.target.disabled=false;
      }
    };

    if(pendingRoot)pendingRoot.onclick=async event=>{
      const button=event.target.closest('[data-suggestion-action]');
      if(!button)return;
      const row=button.closest('[data-suggestion]');
      const item=pending.find(x=>x.id===row?.dataset.suggestion);
      if(!item)return;

      row.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        const ref=db().collection('websiteSongSuggestions').doc(item.id);
        if(button.dataset.suggestionAction==='approve'){
          await commit({
            captureId:'website-'+item.id,
            title:String(item.title||'').trim(),
            artist:String(item.artist||'').trim(),
            note:String(item.note||'').trim(),
            requester:'Website suggestion',
            at:item.createdAt?.toDate?.().toISOString?.()||new Date().toISOString(),
            sessionId:'',
            venue:'livekaraoke.eu'
          });
          await ref.update({
            status:'approved',
            approvedAt:firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          LS26.toast('Suggestion approved and added to Song Inbox.');
        }else{
          await ref.update({
            status:'declined',
            declinedAt:firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          LS26.toast('Suggestion declined.');
        }
        pending=pending.filter(x=>x.id!==item.id);
        renderPending();
        await load(true);
      }catch(error){
        LS26.toast(error.message);
        row.querySelectorAll('button').forEach(b=>b.disabled=false);
      }
    };

    window.addEventListener('ls26:inbox-updated',()=>load(true));
    await load();
  }

  document.addEventListener('DOMContentLoaded',manage);
})();