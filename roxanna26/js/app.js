/* Copyright © 2026 Roxanna. Public UI adapted from billylee26; data restricted by policy.js. */
(() => {
  "use strict";
  const db = window.ROXANNA_DB;
  // Storage is a convenience; blocked browser storage must not turn a sent request into an error.
  const memory=new Map(),storage={getItem(key){try{return localStorage.getItem(key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},setItem(key,value){memory.set(key,value);try{localStorage.setItem(key,value);}catch{}}};
  const policy=window.RoxannaPolicy, cfg=window.ROXANNA_CONFIG;
  let gateOpen=false,runData={},runUnsub=null,sending=false;
  const unsubs=[],requestRecords=new Map(),venueCache=new Map();
  let requestKey='',songsPromise=null,songsLoaded=false;
  const isLive=()=>policy.live(controlData,activeSession,activeSessionId);
  const canRequest=()=>isLive()&&gateOpen;
  function toast(message){const el=document.getElementById('toast');el.textContent=message;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,5000);}
  const $ = id => document.getElementById(id);
  const terminalStatuses = new Set(["played","completed","abandoned","left","deleted","deletedbyhost","declined","cancelled"]);
  let activeSessionId = "";
  let activeSession = null;
  let controlData = {};
  let runOrder = [];
  let sessionUnsub = null;
  let songs = [];
  let publicSetlist = null;
  let requestListeners = [];
  let latestEvents = [];
  let selectedRequestSongId = "";
  let elapsedTimer = null;
  const DEFAULT_TYPE_COLORS = {Roxanna:"#c7a16b"};
  let eventTypeColors = {...DEFAULT_TYPE_COLORS};

  function escapeHTML(v){return String(v ?? "").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function dateFromEvent(e){
    if (e?.scheduledStartAt?.toDate) return e.scheduledStartAt.toDate();
    if (!e?.date) return null;
    const d = new Date(`${e.date}T${e.startTime || "00:00"}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function eventIsUpcoming(e){
    if(!e || !policy.isRoxanna(e) || ["cancelled","canceled"].includes(policy.norm(e.status)) || e.completedAt) return false;
    const ss=String(e.sessionStatus||"").toLowerCase();
    if(ss === "active" || ss === "ended") return false;
    if(activeSessionId && (e.linkedSessionId===activeSessionId || e.id===controlData.eventId)) return false;
    const date=dateFromEvent(e);return !!date&&date.getTime()>=new Date(new Date().setHours(0,0,0,0)).getTime();
  }
  function eventSort(a,b){return (dateFromEvent(a)?.getTime() || 9e15) - (dateFromEvent(b)?.getTime() || 9e15);}
  function formatDateParts(e){
    const d = dateFromEvent(e);
    if (!d) return {dow:"",day:"—",month:""};
    return {dow:d.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase(),day:String(d.getDate()).padStart(2,"0"),month:["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()]};
  }
  function formatTime(e){
    const raw=e?.startTime || ""; if(!raw) return "TBC";
    const [h,m]=raw.split(":").map(Number); if(!Number.isFinite(h)) return raw;
    return new Date(2000,0,1,h,m||0).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false});
  }
  function typeClass(type){return String(type||"Other").toLowerCase().replace(/[^a-z0-9]+/g,"-");}
  function typeColor(type){return eventTypeColors[type] || DEFAULT_TYPE_COLORS[type] || "#a5adb3";}
  function typePillStyle(type){const c=typeColor(type);return `--event-type-color:${escapeHTML(c)}`;}
  function eventLocality(e){
    return e?.venueLocality || e?.locality || e?.location || "";
  }
  function eventCard(e, compact=false){
    const d=formatDateParts(e);
    const type=e.type||"Other";
    const venue=e.venue||e.name||"Event";
    const locality=eventLocality(e);
    if(compact){
      return `<button class="hero-gig" data-event-id="${escapeHTML(e.id)}"><div class="date"><small>${d.dow}</small><strong>${d.day}</strong><small>${d.month}</small></div><div class="event-copy hero-event-copy"><b>${escapeHTML(venue)}</b>${locality?`<span class="hero-locality">${escapeHTML(locality)}</span>`:""}</div><div class="event-time"><span class="clock-icon" aria-hidden="true">◷</span>${escapeHTML(formatTime(e))}</div><span class="chev">›</span></button>`;
    }
    const time12 = (()=>{const raw=e?.startTime||"";if(!raw)return "TBC";const [h,m]=raw.split(":").map(Number);if(!Number.isFinite(h))return raw;return new Date(2000,0,1,h,m||0).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});})();
    return `<button class="gig-row" data-event-id="${escapeHTML(e.id)}"><div class="gig-date"><small>${d.dow}</small><strong>${d.day}</strong><small>${d.month}</small></div><div class="gig-copy"><b>${escapeHTML(venue)}</b>${locality?`<span>${escapeHTML(locality)}</span>`:""}<div class="gig-meta"><span class="gig-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.5 2"/></svg></span><time>${escapeHTML(time12)}</time></div>${type?`<em class="type-pill type-${escapeHTML(typeClass(type))}" style="${typePillStyle(type)}">${escapeHTML(type)}</em>`:""}</div></button>`;
  }

  function allGigsTableRow(e){
    const d=formatDateParts(e);
    const type=e.type||"Other";
    const venue=e.venue||e.name||"Event";
    const locality=eventLocality(e);
    const time12=(()=>{const raw=e?.startTime||"";if(!raw)return "TBC";const [h,m]=raw.split(":").map(Number);if(!Number.isFinite(h))return raw;return new Date(2000,0,1,h,m||0).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});})();
    return `<button class="all-gigs-row" data-event-id="${escapeHTML(e.id)}" data-from-all-gigs="1"><span class="all-gigs-date"><small>${d.dow}</small><strong>${d.day}</strong><small>${d.month}</small></span><span class="all-gigs-venue"><b>${escapeHTML(venue)}</b>${locality?`<small>${escapeHTML(locality)}</small>`:""}</span><span class="all-gigs-time"><b>${escapeHTML(time12)}</b>${type?`<small class="all-gigs-type type-${escapeHTML(typeClass(type))}" style="${typePillStyle(type)}">${escapeHTML(type)}</small>`:""}</span><span class="all-gigs-chev" aria-hidden="true">›</span></button>`;
  }

  function renderHeroGig(){
    const active=isLive();
    const hero=$('heroGigs');
    const watch=$('watchLiveBtn');
    if(active){
      const venue=controlData.venue || activeSession?.venue || controlData.eventSnapshot?.venue || 'Live Performance';
      const locality=controlData.venueLocality || controlData.locality || activeSession?.venueLocality || activeSession?.locality || controlData.eventSnapshot?.venueLocality || controlData.eventSnapshot?.locality || '';
      const activeEventId=String(controlData.eventId || controlData.upcomingEventId || controlData.linkedEventId || activeSession?.eventId || activeSession?.upcomingEventId || activeSession?.linkedEventId || "").trim();
      hero.innerHTML=`<button class="hero-gig live-now" type="button" ${activeEventId?`data-event-id="${escapeHTML(activeEventId)}"`:`data-current-event="1"`}><div class="live-label">LIVE NOW</div><div class="event-copy hero-event-copy"><b>${escapeHTML(venue)}</b>${locality?`<span class="hero-locality">${escapeHTML(locality)}</span>`:''}</div><span class="chev">›</span></button>`;
      watch.innerHTML='<span class="button-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></span><span>REQUEST A SONG →</span>';
      watch.classList.add('is-live');
      watch.setAttribute('href','#requestSongSection');
      return;
    }
    const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
    hero.innerHTML = upcoming.length ? eventCard(upcoming[0],true) : `<div class="empty-inline">No upcoming gig published.</div>`;
    watch.textContent='LIVE DATES →';
    watch.classList.remove('is-live');
    watch.setAttribute('href','#gigs');
  }

  function renderEvents(){
    const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
    renderHeroGig();
    $("nextGigs").innerHTML = upcoming.slice(0,3).map(e=>eventCard(e,false)).join("") || `<div class="empty-box">No upcoming gigs published.</div>`;
  }

  function listenEvents(){
    unsubs.push(db.collection('upcomingEvents').where('type','in',['Roxanna','ROXANNA','roxanna']).onSnapshot(snap=>{
      latestEvents=snap.docs.map(doc=>({...doc.data(),id:doc.id})).filter(policy.isRoxanna);renderEvents();
    },err=>{$('nextGigs').textContent='Gig dates could not be loaded. Please try again later.';console.error(err);}));
  }

  function queuedRequestCount(){
    return runOrder.filter(item=>item?.requestId && !terminalStatuses.has(String(item.status||"queued").toLowerCase()) && String(item.status||"").toLowerCase()!=="playing").length;
  }
  function playingItem(){return runOrder.find(item=>String(item.status||"").toLowerCase()==="playing")||null;}
  function playingStartedMs(item){
    const raw=item?.playingAtMs ?? item?.startedAtMs ?? item?.songStartedAtMs;
    if(Number.isFinite(Number(raw))) return Number(raw);
    const ts=item?.playingAt || item?.startedAt;
    if(ts?.toMillis) return ts.toMillis();
    if(ts?.toDate) return ts.toDate().getTime();
    return 0;
  }
  function formatElapsed(ms){const total=Math.max(0,Math.floor(ms/1000));const m=Math.floor(total/60);const sec=total%60;return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
  function startElapsed(item){
    clearInterval(elapsedTimer); elapsedTimer=null;
    const el=$("elapsedTime"); const started=playingStartedMs(item);
    if(!item || !started){el.textContent="00:00";return;}
    const tick=()=>{el.textContent=formatElapsed(Date.now()-started);}; tick(); elapsedTimer=setInterval(tick,1000);
  }

  function renderLive(){
    const active=isLive();
    renderHeroGig();
    const playing=active?playingItem():null; const breakOpen=activeSession?.breakOpen===true;
    $("queueCount").textContent=String(active ? queuedRequestCount() : 0);
    $("requestSongBtn").disabled=!canRequest();
    $('liveRequestStatus').textContent=!active?'Requests open during Roxanna performances.':gateOpen?'Song requests are open.':'Song requests are currently closed.';
    $("sessionVenue").textContent=active ? (controlData.venue || activeSession?.venue || controlData.eventSnapshot?.venue || "Live") : "—";
    $("sessionType").textContent=active ? (controlData.sessionType || controlData.type || activeSession?.sessionType || activeSession?.type || "Performance") : "—";
    $("progressBar").style.width="0%"; startElapsed(playing);
    const label=$("liveStateLabel"); const title=$("currentSongTitle");
    label.classList.remove("is-playing"); title.classList.remove("between-songs-title");
    if(!active){label.textContent="NOT LIVE";title.textContent="No active session";$("currentSongArtist").textContent="Check the upcoming gigs below.";$("stateIcon").textContent="♪";return;}
    if(breakOpen){label.textContent="ON BREAK";title.textContent="- WE\'LL BE BACK SHORTLY -";title.classList.add("between-songs-title");$("currentSongArtist").textContent=(gateOpen?'Requests remain open during the break.':'Requests are currently closed.');$("stateIcon").textContent="☕";return;}
    if(playing){label.textContent="NOW PLAYING";label.classList.add("is-playing");title.textContent=playing.songTitle||playing.title||"Current song";$("currentSongArtist").textContent=playing.artist||playing.songArtist||"";$("stateIcon").innerHTML='<span class="pause-bars"><i></i><i></i></span>';return;}
    label.textContent="LIVE NOW";title.textContent="- BETWEEN SONGS -";title.classList.add("between-songs-title");$("currentSongArtist").textContent="The next song will start shortly.";$("stateIcon").textContent="♪";
  }

  // Shared control is read only to identify the act. No other act is rendered.
  function syncLive(){
    const live=isLive();
    if(!live){if(runUnsub)runUnsub();runUnsub=null;runData={};runOrder=[];selectedRequestSongId='';clearRequestListeners();$('myRequests').textContent='No active Roxanna session.';}
    else if(!runUnsub){
      const id=activeSessionId;
      runUnsub=db.collection('karaokeControl').doc('runOrder').onSnapshot(doc=>{
        if(id!==activeSessionId)return;runData=doc.exists?doc.data():{};runOrder=policy.queue(controlData,activeSession,id,runData);renderLive();
        if($('requestDialog').open){renderSongResults();renderMyRequests();}
      },()=>{runOrder=[];renderLive();});
    }
    runOrder=policy.queue(controlData,activeSession,activeSessionId,runData);renderLive();renderEvents();
    if($('requestDialog').open){renderSongResults();renderMyRequests();}
  }
  function attachSessionDoc(id){
    if(sessionUnsub)sessionUnsub();sessionUnsub=null;activeSession=null;
    if(runUnsub)runUnsub();runUnsub=null;runData={};runOrder=[];clearRequestListeners();syncLive();
    if(!id)return;
    sessionUnsub=db.collection('performanceSessions').doc(id).onSnapshot(doc=>{
      if(id!==activeSessionId)return;activeSession=doc.exists?doc.data():null;syncLive();
    },()=>{activeSession=null;syncLive();});
  }
  function listenLiveState(){
    unsubs.push(db.collection('karaokeControl').doc('currentSession').onSnapshot(doc=>{
      const d=doc.exists?doc.data():{};controlData=d;
      const allowed=!policy.types(d).length||policy.isRoxanna(d);
      const next=d.active===true&&allowed?policy.sessionId(d):'';
      if(next!==activeSessionId){activeSessionId=next;attachSessionDoc(next);}else syncLive();
    },()=>{controlData={};activeSessionId='';attachSessionDoc('');}));
    unsubs.push(db.collection('karaoke').doc('state').onSnapshot(doc=>{
      gateOpen=doc.exists&&doc.data().songsEnabled===true;renderLive();if($('requestDialog').open)renderSongResults();
    },()=>{gateOpen=false;renderLive();if($('requestDialog').open)renderSongResults();}));
  }
  async function loadPublicSongs(){
    if(songsLoaded)return;if(songsPromise)return songsPromise;
    songsPromise=(async()=>{
      let set;
      if(cfg.repertoireSetlistId){const snap=await db.collection('lyricsSetlists').doc(cfg.repertoireSetlistId).get();if(snap.exists)set={...snap.data(),id:snap.id};}
      else{
        const name=cfg.repertoireSetlistName||'Roxanna';
        const variants=[...new Set([name,name.toUpperCase(),name.toLowerCase()])];
        const snap=await db.collection('lyricsSetlists').where('name','in',variants).limit(5).get();
        if(snap.docs.length>1)throw Error('More than one Roxanna repertoire is configured. Please contact the band.');
        if(snap.docs.length)set={...snap.docs[0].data(),id:snap.docs[0].id};
      }
      if(!set)throw Error('The Roxanna repertoire is not available yet.');
      if(policy.types(set).length&&!policy.isRoxanna(set))throw Error('The configured repertoire is not a Roxanna list.');
      const ids=[...new Set((set.songIds||[]).filter(x=>typeof x==='string'&&x))];
      const groups=[];for(let i=0;i<ids.length;i+=10)groups.push(ids.slice(i,i+10));
      const map=new Map();
      // Bounded sequential chunks avoid a burst of simultaneous requests.
      for(const chunk of groups){const snap=await db.collection('lyrics').where(firebase.firestore.FieldPath.documentId(),'in',chunk).get();snap.docs.forEach(d=>map.set(d.id,{...d.data(),id:d.id}));}
      songs=ids.map(id=>map.get(id)).filter(s=>s&&s.title&&s.publicSongListVisible!==false).sort((a,b)=>a.title.localeCompare(b.title));publicSetlist=set;songsLoaded=true;
    })();
    try{await songsPromise;}finally{songsPromise=null;}
  }

  function normaliseSongIdentity(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();}
  function sameSong(item,song){
    if(!item||!song)return false;
    if(item.songId && item.songId===song.id)return true;
    const a=normaliseSongIdentity(item.songTitle||item.title);
    const b=normaliseSongIdentity(song.title);
    if(!a||a!==b)return false;
    const ia=normaliseSongIdentity(item.artist||item.songArtist);
    const sa=normaliseSongIdentity(song.artist);
    return !ia||!sa||ia===sa;
  }
  function songSessionState(song){
    const matches=runOrder.filter(item=>sameSong(item,song));
    if(matches.some(item=>String(item.status||"").toLowerCase()==="playing")) return "playing";
    if(matches.some(item=>["played","completed"].includes(String(item.status||"").toLowerCase()))) return "played";
    return "available";
  }
  function runOrderStatusForRequest(requestId){
    const item=runOrder.find(row=>row?.requestId===requestId);
    return item?String(item.status||"").toLowerCase():"";
  }

  function renderSongResults(){
    const q=$("songSearch").value.trim().toLowerCase();
    const list=(q?songs.filter(song=>`${song.title||""} ${song.artist||""}`.toLowerCase().includes(q)):songs);
    if(!canRequest())$('requestNotice').textContent='Requests are closed. You can still browse the Roxanna repertoire.';
    $("songResults").innerHTML=list.map(song=>{
      const state=songSessionState(song);
      const selected=selectedRequestSongId===song.id;
      let action="＋", disabled="", stateClass="";
      if(!canRequest()){action="CLOSED";disabled=" disabled";}
      else if(state==="playing"){action="NOW PLAYING";disabled=" disabled";stateClass=" is-playing";}
      else if(state==="played"){action="ALREADY PLAYED";disabled=" disabled";stateClass=" is-played";}
      else if(selected){action="SEND REQUEST";stateClass=" selected";}
      return `<div class="song-row${stateClass}" data-song-row-id="${escapeHTML(song.id)}"><span><strong>${escapeHTML(song.title||"Untitled")}</strong><small>${escapeHTML(song.artist||"")}</small></span><button class="song-action" type="button" data-song-id="${escapeHTML(song.id)}"${disabled}>${escapeHTML(action)}</button></div>`;
    }).join("") || `<div class="empty-box">No songs found.</div>`;
  }

  function showRequestBrowser(){
    selectedRequestSongId="";
    $("requestSuccess").hidden=true;
    $("requestBrowser").hidden=false;
    $("requestNote").value="";
    $("songSearch").value="";
    $("requestNotice").textContent="Choose a song. Tap +, then tap SEND REQUEST on that song.";
    renderSongResults();
  }

  async function enterSongRequestStep(name){
    storage.setItem("roxanna26.requestName",name);
    $("requesterNameLabel").textContent=name;
    $("editSingerName").value=name;
    $("requestNameStep").hidden=true;
    $("requestSongStep").hidden=false;
    $("requestSuccess").hidden=true;
    $("requestBrowser").hidden=false;
    $("requestNotice").textContent="Loading songs…";
    try{
      await loadPublicSongs();
      await renderMyRequests();
      showRequestBrowser();
    }catch(error){
      console.error(error);
      $("requestNotice").textContent="Could not load the public song list.";
    }
  }

  async function openRequestDialog(){
    if(!canRequest()){toast('Requests are available only while Roxanna is live and requests are open.');return;}
    selectedRequestSongId="";
    const storedName=(storage.getItem("roxanna26.requestName")||"").trim();
    $("requestSuccess").hidden=true;
    $("requestBrowser").hidden=false;
    $("requestDialog").showModal();
    if(storedName){
      $("singerName").value=storedName;
      await enterSongRequestStep(storedName);
    }else{
      $("requestNameStep").hidden=false;
      $("requestSongStep").hidden=true;
      $("singerName").value="";
      setTimeout(()=>$("singerName").focus(),50);
    }
  }

  async function continueToSongs(){
    const name=$("singerName").value.trim();
    if(!name){$("singerName").focus();return;}
    await enterSongRequestStep(name);
  }

  function trackedRequestIds(){try{const ids=JSON.parse(storage.getItem("roxanna26.requestIds."+activeSessionId)||"[]");return Array.isArray(ids)?ids.filter(x=>typeof x==="string"&&!x.includes("/")).slice(-40):[];}catch{return[];}}
  function clearRequestListeners(){requestListeners.forEach(fn=>{try{fn();}catch{}});requestListeners=[];requestKey='';requestRecords.clear();}
  function statusLabel(status){
    const s=String(status||"active").toLowerCase();
    if(s==="queued")return "ACCEPTED";
    if(s==="playing")return "NOW PLAYING";
    if(["completed","played"].includes(s))return "PLAYED";
    if(["declined","deleted","deletedbyhost"].includes(s))return "DECLINED";
    if(s==="abandoned"||s==="left")return "REMOVED";
    return "PENDING";
  }
  async function renderMyRequests(){
    const ids=trackedRequestIds();
    const box=$("myRequests");
    if(!isLive()){clearRequestListeners();box.innerHTML=`<p class="muted">Requests from previous sessions are hidden.</p>`;return;}
    if(!ids.length){clearRequestListeners();box.innerHTML=`<p class="muted">Requests you make in this session will appear here.</p>`;return;}
    const key=activeSessionId+':'+ids.join(',');
    if(key!==requestKey){clearRequestListeners();requestKey=key;}
    const records=requestRecords,session=activeSessionId;
    const paint=()=>{
      const current=ids.slice().reverse().map(id=>records.get(id)).filter(r=>r && isLive() && activeSessionId===session && String(r.sessionId||"")===session && r.source==="roxanna26");
      if(!current.length){box.innerHTML=`<p class="muted">Requests you make in this session will appear here.</p>`;return;}
      box.innerHTML=current.map(r=>{
        const id=r.id;
        const runStatus=runOrderStatusForRequest(id);
        const effectiveStatus=runStatus||String(r.status||"active").toLowerCase();
        const playing=effectiveStatus==="playing";
        return `<div class="my-request${playing?" is-playing":""}"><span><strong>${escapeHTML(r.songTitle||"Song")}</strong><small>${escapeHTML(r.songArtist||r.artist||"")}</small></span><em class="request-status status-${escapeHTML(effectiveStatus)}">${statusLabel(effectiveStatus)}</em></div>`;
      }).join("");
    };
    paint();
    if(requestListeners.length)return;
    ids.forEach(id=>requestListeners.push(db.collection("publicSongRequests").doc(id).onSnapshot(doc=>{if(activeSessionId!==session||requestKey!==key)return;if(doc.exists)records.set(id,{...doc.data(),id});else records.delete(id);paint();})));
  }

  function selectRequestSong(songId){
    if(!canRequest())return;
    const song=songs.find(item=>item.id===songId);
    if(!song)return;
    const state=songSessionState(song);
    if(state!=="available")return;
    if(selectedRequestSongId===songId){
      sendSelectedRequest();
      return;
    }
    selectedRequestSongId=songId;
    $("requestNotice").textContent=`${song.title||"Song"} selected. Tap SEND REQUEST on that song to confirm.`;
    renderSongResults();
  }

  async function sendSelectedRequest(){
    const name=(storage.getItem("roxanna26.requestName")||"").trim();
    const song=songs.find(item=>item.id===selectedRequestSongId);
    if(sending||!name||!song||!publicSetlist||!canRequest())return;
    sending=true;const submittedSession=activeSessionId;
    if(songSessionState(song)!=="available"){
      $("requestNotice").textContent="That song is already playing or has already been played in this session.";
      selectedRequestSongId="";sending=false;
      renderSongResults();
      return;
    }
    const rowButton=document.querySelector(`.song-action[data-song-id="${CSS.escape(song.id)}"]`);
    if(rowButton)rowButton.disabled=true;
    try{
      const note=$("requestNote").value.trim();
      const ref=db.collection('publicSongRequests').doc();
      await db.runTransaction(async tx=>{
        const c=await tx.get(db.collection('karaokeControl').doc('currentSession'));
        const session=await tx.get(db.collection('performanceSessions').doc(submittedSession));
        const gate=await tx.get(db.collection('karaoke').doc('state'));
        const queue=await tx.get(db.collection('karaokeControl').doc('runOrder'));
        if(!policy.live(c.data(),session.data(),submittedSession)||gate.data()?.songsEnabled!==true)throw Error('Requests closed or the live session changed.');
        const items=policy.queue(c.data(),session.data(),submittedSession,queue.data());
        if(items.some(x=>sameSong(x,song)&&['playing','played','completed'].includes(policy.norm(x.status))))throw Error('This song is already playing or has been played.');
        tx.set(ref,{
        listId:publicSetlist.id,
        publicSetlistId:publicSetlist?.id||"",
        publicSetlistName:publicSetlist?.name||"",
        sessionId:submittedSession,
        type:"Roxanna",performerType:"Roxanna",project:"Roxanna",requestType:"band-song-request",
        isTestSession:false,
        status:"active",
        singerName:name,
        name,
        note,
        comment:note,
        source:"roxanna26",
        songId:song.id,
        songTitle:song.title||"",
        artist:song.artist||"",
        songArtist:song.artist||"",
        year:song.year||"",
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      });
      const key='roxanna26.requestIds.'+submittedSession;
      let ids=[];try{ids=JSON.parse(storage.getItem(key)||'[]');}catch{}
      storage.setItem(key,JSON.stringify([...new Set([...ids,ref.id])].slice(-40)));
      if(submittedSession!==activeSessionId||!isLive()){toast('Your request was sent to the Roxanna session that just ended.');return;}
      selectedRequestSongId="";
      $("requestNote").value="";
      $("requestBrowser").hidden=true;
      $("requestSuccess").hidden=false;
      $("requestSuccessText").textContent=`Thank you ${name}! ${song.title||"Your song"} has been sent and is awaiting approval.`;
      await renderMyRequests();
    }catch(error){
      console.error(error);
      $("requestNotice").textContent=error.message||"Could not send request. Please try again.";
      if(rowButton)rowButton.disabled=false;
    }finally{sending=false;}
  }

  function beginEditRequesterName(){
    $("editSingerName").value=storage.getItem("roxanna26.requestName")||$("requesterNameLabel").textContent||"";
    $("requesterNameEdit").hidden=false;
    setTimeout(()=>$("editSingerName").focus(),20);
  }
  function saveRequesterName(){
    const name=$("editSingerName").value.trim();
    if(!name){$("editSingerName").focus();return;}
    storage.setItem("roxanna26.requestName",name);
    $("singerName").value=name;
    $("requesterNameLabel").textContent=name;
    $("requesterNameEdit").hidden=true;
  }

  async function showEventDetails(eventData, options={}){
    const e=eventData||{};if(!policy.isRoxanna(e))return;
    let venueDoc={};
    if(e.venueId){
      try{
        if(!venueCache.has(e.venueId)){const snap=await db.collection('venues').doc(e.venueId).get();venueCache.set(e.venueId,snap.exists?snap.data():{});}venueDoc=venueCache.get(e.venueId);
      }catch(error){console.warn("Could not load venue details",error);}
    }
    const venueName=e.venue||venueDoc.name||e.name||"Live Gig";
    const type=e.type||e.sessionType||"";
    const address=e.address||venueDoc.address||"";
    const locality=e.venueLocality||e.locality||venueDoc.locality||"";
    const website=e.venueWebsite||e.website||venueDoc.website||"";
    const mapUrl=e.venueMapUrl||e.mapUrl||venueDoc.mapUrl||"";
    const d=dateFromEvent(e);
    const dateText=d?d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"";
    const timeText=(e.startTime||e.scheduledStartAt)?formatTime(e):"";
    const safeUrl=value=>{
      const raw=String(value||"").trim();
      if(!raw)return "";
      return /^https?:\/\//i.test(raw)?raw:`https://${raw}`;
    };
    const rows=[];
    if(address) rows.push(`<div><dt>ADDRESS</dt><dd>${escapeHTML(address)}</dd></div>`);
    if(locality) rows.push(`<div><dt>LOCALITY</dt><dd>${escapeHTML(locality)}</dd></div>`);
    if(dateText) rows.push(`<div><dt>DATE</dt><dd>${escapeHTML(dateText)}</dd></div>`);
    if(timeText) rows.push(`<div><dt>START TIME</dt><dd>${escapeHTML(timeText)}</dd></div>`);
    const notes=String(e.notes||"").trim();
    if(notes) rows.push(`<div><dt>GIG NOTES</dt><dd>${escapeHTML(notes)}</dd></div>`);
    const links=[];
    if(website){ const href=safeUrl(website); links.push(`<a class="event-detail-action event-detail-action-yellow" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">WEBSITE ↗</a>`); }
    if(mapUrl){ const href=safeUrl(mapUrl); links.push(`<a class="event-detail-action event-detail-action-yellow" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">LOCATION ↗</a>`); }
    const back=options.fromAllGigs?`<button type="button" class="event-back-all" id="eventBackAllBtn" aria-label="Back to all gigs"><span aria-hidden="true">←</span> BACK TO ALL GIGS</button>`:"";
    const typeBadge=type?`<span class="event-detail-type type-${escapeHTML(typeClass(type))}" style="${typePillStyle(type)}">${escapeHTML(type)}</span>`:"";
    $("eventDialogBody").innerHTML=`${back}<div class="event-detail-heading"><span class="eyebrow">GIG DETAILS</span><h2>${escapeHTML(venueName)}</h2>${typeBadge}</div><dl class="event-detail-list">${rows.join("")}</dl>${links.length?`<div class="event-detail-actions">${links.join("")}</div>`:""}`;
    $("eventDialog").showModal();
  }

  async function showEvent(id, options={}){
    const e=latestEvents.find(x=>x.id===id);
    if(e) return showEventDetails(e, options);
    if(isLive()) return showCurrentEvent(options);
  }

  async function showCurrentEvent(options={}){
    if(!isLive())return;
    const eventId=String(controlData.eventId || controlData.upcomingEventId || controlData.linkedEventId || activeSession?.eventId || activeSession?.upcomingEventId || activeSession?.linkedEventId || "").trim();
    const fromList=eventId?latestEvents.find(x=>x.id===eventId):latestEvents.find(x=>x.linkedSessionId===activeSessionId);
    if(fromList) return showEventDetails(fromList, options);
    const snapshot=controlData.eventSnapshot||activeSession?.eventSnapshot||{};
    const merged={
      ...snapshot,
      venueId: snapshot.venueId || controlData.venueId || activeSession?.venueId || "",
      venue: snapshot.venue || controlData.venue || activeSession?.venue || "",
      address: snapshot.address || controlData.address || activeSession?.address || "",
      venueLocality: snapshot.venueLocality || snapshot.locality || controlData.venueLocality || controlData.locality || activeSession?.venueLocality || activeSession?.locality || "",
      venueWebsite: snapshot.venueWebsite || snapshot.website || controlData.venueWebsite || controlData.website || activeSession?.venueWebsite || activeSession?.website || "",
      venueMapUrl: snapshot.venueMapUrl || snapshot.mapUrl || controlData.venueMapUrl || controlData.mapUrl || activeSession?.venueMapUrl || activeSession?.mapUrl || "",
      date: snapshot.date || controlData.date || activeSession?.date || "",
      startTime: snapshot.startTime || controlData.startTime || activeSession?.startTime || "",
      scheduledStartAt: snapshot.scheduledStartAt || controlData.scheduledStartAt || activeSession?.scheduledStartAt || null,
      notes: snapshot.notes || "",
      type: snapshot.type || snapshot.sessionType || controlData.sessionType || controlData.type || activeSession?.sessionType || activeSession?.type || ""
    };
    return showEventDetails(merged, options);
  }
  function showAllGigs(){
    const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
    $("allGigsList").innerHTML=upcoming.length?upcoming.map(allGigsTableRow).join(""):`<div class="empty-box">No upcoming gigs published.</div>`;
    $("allGigsDialog").showModal();
  }

  async function submitBookingEnquiry(event){
    event.preventDefault();
    const form=$("bookingForm");
    const status=$("bookingStatus");
    const button=$("bookingSubmitBtn");
    if(!form.reportValidity()) return;
    const name=$("enquiryName").value.trim();
    const email=$("enquiryEmail").value.trim();
    const phone=$("enquiryPhone").value.trim();
    const eventType=$("enquiryEventType").value.trim();
    const preferredDate=$("enquiryDate").value;
    const venueOrLocality=$("enquiryVenue").value.trim();
    const company=$("enquiryCompany").value.trim();
    const guestsRaw=$("enquiryGuests").value;
    const message=$("enquiryMessage").value.trim();
    button.disabled=true;
    status.className="booking-status";
    status.textContent="Sending enquiry…";
    try{
      await db.collection("bookingEnquiries").add({
        status:"pending",
        source:"Roxanna Website",
        sourceKey:"roxanna26",
        type:"Roxanna",
        performerType:"Roxanna",
        name,
        email,
        phone,
        eventType,
        preferredDate:preferredDate||"",
        venueOrLocality,
        company,
        estimatedGuests:guestsRaw?Number(guestsRaw):null,
        message,
        pageUrl:location.href,
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      form.reset();
      status.className="booking-status success";
      status.textContent="";
      form.hidden=true;
      $("bookingSuccessMessage").textContent=`Thanks ${name}! Your enquiry has been sent successfully.`;
      $("bookingSuccess").hidden=false;
    }catch(error){
      console.error("Could not send booking enquiry",error);
      status.className="booking-status error";
      status.textContent="Could not send the enquiry. Please try again.";
    }finally{
      button.disabled=false;
    }
  }


  const youtubeVideos=(Array.isArray(cfg.videos)?cfg.videos:[])
    .map((video,index)=>{
      const raw=String(video?.url||video?.id||"").trim();
      let id="";
      if(/^[A-Za-z0-9_-]{11}$/.test(raw)) id=raw;
      else {
        try{
          const u=new URL(raw);
          if(u.hostname.includes("youtu.be")) id=u.pathname.split("/").filter(Boolean)[0]||"";
          else if(u.pathname.startsWith("/shorts/")) id=u.pathname.split("/")[2]||"";
          else if(u.pathname.startsWith("/embed/")) id=u.pathname.split("/")[2]||"";
          else id=u.searchParams.get("v")||"";
        }catch{}
      }
      if(!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
      return {
        id,
        title:String(video?.title||`Video ${index+1}`),
        duration:String(video?.duration||""),
        thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    }).filter(Boolean);

  let currentVideoIndex=0;
  let videoPaused=false;

  function videoCardHTML(video,index,all=false){
    return `<button class="video-card${all?" all-video-card":""}" type="button" data-video-index="${index}" aria-label="Play ${escapeHTML(video.title)}">
      <div class="thumb youtube-thumb" style="background-image:linear-gradient(#00101733,#00101733),url('${video.thumbnail}')"><span>▶</span></div>
      <div><b>${escapeHTML(video.title)}</b>${video.duration?`<small>${escapeHTML(video.duration)}</small>`:""}</div>
    </button>`;
  }

  function renderVideos(){
    const preview=$("videoPreviewGrid");
    const all=$("allVideosGrid");
    if(preview){
      preview.innerHTML=youtubeVideos.length
        ? youtubeVideos.slice(0,3).map((v,i)=>videoCardHTML(v,i)).join("")
        : `<div class="video-empty">Videos coming soon.</div>`;
    }
    if(all){
      all.innerHTML=youtubeVideos.length
        ? youtubeVideos.map((v,i)=>videoCardHTML(v,i,true)).join("")
        : `<div class="video-empty">Videos coming soon.</div>`;
    }
    const more=$("viewMoreVideosBtn");
    if(more) more.hidden=youtubeVideos.length<=3;
  }

  function sendVideoCommand(func){
    const frame=$("youtubePlayerFrame");
    try{
      frame?.contentWindow?.postMessage(JSON.stringify({event:"command",func,args:[]}),"https://www.youtube-nocookie.com");
    }catch{}
  }

  function openVideo(index){
    const video=youtubeVideos[Number(index)];
    if(!video)return;
    currentVideoIndex=Number(index);
    videoPaused=false;
    $("videoPlayerTitle").textContent=video.title;
    const frame=$("youtubePlayerFrame");
    frame.src=`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;
    $("videoPlayPauseBtn").textContent="❚❚";
    $("videoPlayPauseBtn").setAttribute("aria-label","Pause video");
    if($("allVideosDialog")?.open) $("allVideosDialog").close();
    if(!$("videoPlayerDialog").open) $("videoPlayerDialog").showModal();
  }

  function closeVideoPlayer(){
    const frame=$("youtubePlayerFrame");
    if(frame) frame.src="";
  }


  const galleryPhotos=cfg.photos;
  let currentPhotoIndex=0;
  function renderAllPhotos(){
    const grid=$("allPhotosGrid");
    if(!grid)return;
    grid.innerHTML=galleryPhotos.map((photo,index)=>`<button class="all-photo-thumb" type="button" data-photo-index="${index}" aria-label="Open photo ${index+1}"><img src="${photo.src}" alt="${photo.alt}"></button>`).join("");
  }
  function openPhoto(index){
    currentPhotoIndex=(Number(index)+galleryPhotos.length)%galleryPhotos.length;
    const photo=galleryPhotos[currentPhotoIndex];
    $("lightboxPhoto").src=photo.src;
    $("lightboxPhoto").alt=photo.alt;
    $("lightboxCaption").textContent=`${currentPhotoIndex+1} / ${galleryPhotos.length}`;
    if($("allPhotosDialog")?.open)$("allPhotosDialog").close();
    if(!$("photoLightboxDialog").open)$("photoLightboxDialog").showModal();
  }
  function stepPhoto(delta){openPhoto(currentPhotoIndex+delta);}

  document.addEventListener("click",e=>{
    const eventBtn=e.target.closest("[data-event-id]");
    if(eventBtn){
      const fromAll=eventBtn.dataset.fromAllGigs==="1";
      if($("allGigsDialog")?.open) $("allGigsDialog").close();
      showEvent(eventBtn.dataset.eventId,{fromAllGigs:fromAll});
    }
    const currentEventBtn=e.target.closest("[data-current-event]");
    if(currentEventBtn) showCurrentEvent();
    const backAll=e.target.closest("#eventBackAllBtn");
    if(backAll){
      if($("eventDialog")?.open) $("eventDialog").close();
      showAllGigs();
    }
    const video=e.target.closest("[data-video-index]"); if(video)openVideo(Number(video.dataset.videoIndex));
    const photo=e.target.closest("[data-photo-index]"); if(photo)openPhoto(Number(photo.dataset.photoIndex));
    const song=e.target.closest("[data-song-id]"); if(song)selectRequestSong(song.dataset.songId);
    const close=e.target.closest("[data-close]");
    if(close){
      const dialogId=close.dataset.close;
      $(dialogId)?.close();
      if(dialogId==="videoPlayerDialog") closeVideoPlayer();
    }
  });
  $("songSearch").addEventListener("input",renderSongResults);
  $("continueRequestBtn").addEventListener("click",continueToSongs);
  $("singerName").addEventListener("keydown",e=>{if(e.key==="Enter")continueToSongs();});
  $("editRequesterNameBtn").addEventListener("click",beginEditRequesterName);
  $("saveRequesterNameBtn").addEventListener("click",saveRequesterName);
  $("cancelRequesterNameBtn").addEventListener("click",()=>{$("requesterNameEdit").hidden=true;});
  $("editSingerName").addEventListener("keydown",e=>{if(e.key==="Enter")saveRequesterName();});
  $("requestAnotherBtn").addEventListener("click",showRequestBrowser);
  $("viewAllGigsBtn").addEventListener("click",showAllGigs);
  $("requestSongBtn").addEventListener("click",openRequestDialog);
  $("openBookingDialogBtn").addEventListener("click",()=>{
    $("bookingStatus").className="booking-status";
    $("bookingStatus").textContent="";
    $("bookingForm").hidden=false;
    $("bookingSuccess").hidden=true;
    $("bookingDialog").showModal();
  });
  $("bookingForm").addEventListener("submit",submitBookingEnquiry);
  $("aboutReadMoreBtn").addEventListener("click",()=>$("aboutDialog").showModal());
  $("viewMoreVideosBtn").addEventListener("click",()=>{renderVideos();$("allVideosDialog").showModal();});
  $("videoPlayPauseBtn").addEventListener("click",()=>{
    videoPaused=!videoPaused;
    sendVideoCommand(videoPaused?"pauseVideo":"playVideo");
    $("videoPlayPauseBtn").textContent=videoPaused?"▶":"❚❚";
    $("videoPlayPauseBtn").setAttribute("aria-label",videoPaused?"Play video":"Pause video");
  });
  $("videoPlayerDialog").addEventListener("close",closeVideoPlayer);
  $("viewMorePhotosBtn").addEventListener("click",()=>{renderAllPhotos();$("allPhotosDialog").showModal();});
  $("photoPrevBtn").addEventListener("click",()=>stepPhoto(-1));
  $("photoNextBtn").addEventListener("click",()=>stepPhoto(1));
  document.addEventListener("keydown",e=>{if(!$("photoLightboxDialog")?.open)return;if(e.key==="ArrowLeft")stepPhoto(-1);if(e.key==="ArrowRight")stepPhoto(1);});
  renderVideos();
  renderAllPhotos();
  $("shareBtn").addEventListener("click",async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Link copied.");}}catch{}});

  $('requestDialog').addEventListener('close',clearRequestListeners);
  $('year').textContent=new Date().getFullYear();$('instagramLink').href=cfg.instagramUrl;$('facebookLink').href=cfg.facebookUrl;
  // Song documents load on demand when the request dialog opens.
  if(db){listenEvents();listenLiveState();renderLive();}
  else{$('liveRequestStatus').textContent='Live information is temporarily unavailable.';$('nextGigs').textContent='Gig dates are temporarily unavailable.';}
  window.addEventListener('pagehide',()=>{unsubs.forEach(fn=>fn());sessionUnsub?.();runUnsub?.();clearRequestListeners();clearInterval(elapsedTimer);});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
})();
