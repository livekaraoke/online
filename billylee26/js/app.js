(() => {
  "use strict";
  const db = window.BillyLeeDB;
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

  function escapeHTML(v){return String(v ?? "").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function dateFromEvent(e){
    if (e?.scheduledStartAt?.toDate) return e.scheduledStartAt.toDate();
    if (!e?.date) return null;
    const d = new Date(`${e.date}T${e.startTime || "00:00"}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function eventIsUpcoming(e){return e && e.status !== "Cancelled" && e.sessionStatus !== "ended" && !e.completedAt;}
  function eventSort(a,b){return (dateFromEvent(a)?.getTime() || 9e15) - (dateFromEvent(b)?.getTime() || 9e15);}
  function formatDateParts(e){
    const d = dateFromEvent(e);
    if (!d) return {dow:"",day:"—",month:""};
    return {dow:d.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase(),day:String(d.getDate()).padStart(2,"0"),month:d.toLocaleDateString("en-GB",{month:"short"}).toUpperCase()};
  }
  function formatTime(e){
    const raw=e?.startTime || ""; if(!raw) return "TBC";
    const [h,m]=raw.split(":").map(Number); if(!Number.isFinite(h)) return raw;
    return new Date(2000,0,1,h,m||0).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false});
  }
  function typeClass(type){return String(type||"Other").toLowerCase().replace(/[^a-z0-9]+/g,"-");}
  function eventCard(e, compact=false){
    const d=formatDateParts(e); const type=e.type||"Other"; const venue=e.venue||e.name||"Event"; const location=e.address||e.location||"";
    if(compact){
      return `<button class="hero-gig" data-event-id="${escapeHTML(e.id)}"><div class="date"><small>${d.dow}</small><strong>${d.day}</strong><small>${d.month}</small></div><div class="event-copy"><b>${escapeHTML(venue)}</b><span>${escapeHTML(location)}</span><em class="type-pill type-${escapeHTML(typeClass(type))}">${escapeHTML(type)}</em></div><div class="event-time">◷ ${escapeHTML(formatTime(e))}</div><span class="chev">›</span></button>`;
    }
    return `<button class="gig-row" data-event-id="${escapeHTML(e.id)}"><div class="gig-date"><small>${d.month}</small><strong>${d.day}</strong></div><div class="gig-copy"><b>${escapeHTML(venue)}</b><span>${escapeHTML(location)}</span><em class="type-pill type-${escapeHTML(typeClass(type))}">${escapeHTML(type)}</em></div><time>${escapeHTML(formatTime(e))}</time><span class="chev">›</span></button>`;
  }

  function renderEvents(){
    const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
    $("heroGigs").innerHTML = upcoming.slice(0,3).map(e=>eventCard(e,true)).join("") || `<div class="empty-inline">No upcoming gigs published.</div>`;
    $("nextGigs").innerHTML = upcoming.slice(0,5).map(e=>eventCard(e,false)).join("") || `<div class="empty-box">No upcoming gigs published.</div>`;
  }

  function listenEvents(){
    db.collection("upcomingEvents").onSnapshot(snap=>{
      latestEvents=snap.docs.map(doc=>({id:doc.id,...(doc.data()||{})})); renderEvents();
    }, err=>console.error("Upcoming events listener failed",err));
  }

  function queuedRequestCount(){
    return runOrder.filter(item=>item?.requestId && !terminalStatuses.has(String(item.status||"queued").toLowerCase()) && String(item.status||"").toLowerCase()!=="playing").length;
  }
  function playingItem(){return runOrder.find(item=>String(item.status||"").toLowerCase()==="playing")||null;}

  function renderLive(){
    const active=controlData.active===true && !!activeSessionId;
    const playing=playingItem(); const breakOpen=activeSession?.breakOpen===true;
    $("queueCount").textContent=String(active ? queuedRequestCount() : 0);
    $("requestSongBtn").disabled=!active;
    $("drawerRequest").disabled=!active;
    $("sessionVenue").textContent=active ? (controlData.venue || activeSession?.venue || controlData.eventSnapshot?.venue || "Live") : "—";
    $("sessionType").textContent=active ? (controlData.sessionType || controlData.type || activeSession?.sessionType || activeSession?.type || "Performance") : "—";
    $("progressBar").style.width="0%";
    if(!active){$("liveStateLabel").textContent="NOT LIVE";$("currentSongTitle").textContent="No active session";$("currentSongArtist").textContent="Check the upcoming gigs below.";$("stateIcon").textContent="♪";return;}
    if(breakOpen){$("liveStateLabel").textContent="ON BREAK";$("currentSongTitle").textContent="We’ll be back shortly";$("currentSongArtist").textContent="Requests remain open during the break.";$("stateIcon").textContent="☕";return;}
    if(playing){$("liveStateLabel").textContent="NOW PLAYING";$("currentSongTitle").textContent=playing.songTitle||playing.title||"Current song";$("currentSongArtist").textContent=playing.artist||playing.songArtist||"";$("stateIcon").textContent="Ⅱ";$("progressBar").style.width="38%";return;}
    $("liveStateLabel").textContent="LIVE NOW";$("currentSongTitle").textContent="Between songs";$("currentSongArtist").textContent="The next performance will start shortly.";$("stateIcon").textContent="♪";
  }

  function attachSessionDoc(id){
    if(sessionUnsub){sessionUnsub();sessionUnsub=null;} activeSession=null;
    if(!id){renderLive();return;}
    sessionUnsub=db.collection("performanceSessions").doc(id).onSnapshot(doc=>{activeSession=doc.exists?(doc.data()||{}):null;renderLive();},err=>console.error("Session listener failed",err));
  }
  function listenLiveState(){
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc=>{
      const d=doc.exists?(doc.data()||{}):{}; controlData=d; const next=d.active===true?String(d.sessionId||d.activeSessionId||""):"";
      if(next!==activeSessionId){activeSessionId=next;attachSessionDoc(next);} renderLive();
    },err=>console.error("Current session listener failed",err));
    db.collection("karaokeControl").doc("runOrder").onSnapshot(doc=>{
      const d=doc.exists?(doc.data()||{}):{}; runOrder=(activeSessionId && d.sessionId && d.sessionId!==activeSessionId)?[]:(Array.isArray(d.items)?d.items:[]); renderLive();
    },err=>console.error("Run order listener failed",err));
  }

  async function loadPublicSongs(){
    const cfgSnap=await db.collection("karaokeControl").doc("publicSongList").get(); const cfg=cfgSnap.exists?(cfgSnap.data()||{}):{};
    if(cfg.setlistId){
      const setSnap=await db.collection("lyricsSetlists").doc(cfg.setlistId).get();
      if(setSnap.exists){
        const set={id:setSnap.id,...setSnap.data()}; publicSetlist=set; $("requestListName").textContent=set.name||cfg.setlistName||"Public Song List";
        const ids=Array.isArray(set.songIds)?set.songIds:[]; const chunks=[]; for(let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
        const groups=await Promise.all(chunks.map(chunk=>db.collection("lyrics").where(firebase.firestore.FieldPath.documentId(),"in",chunk).get()));
        const map=new Map(); groups.forEach(s=>s.docs.forEach(d=>map.set(d.id,{id:d.id,...d.data()}))); songs=ids.map(id=>map.get(id)).filter(Boolean); return;
      }
    }
    const all=await db.collection("lyrics").get(); songs=all.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.title && s.publicSongListVisible!==false); publicSetlist=null; $("requestListName").textContent="Public Song List";
  }

  function renderSongResults(){
    const q=$("songSearch").value.trim().toLowerCase(); const list=(q?songs.filter(s=>`${s.title||""} ${s.artist||""}`.toLowerCase().includes(q)):songs).slice(0,80);
    $("songResults").innerHTML=list.map(s=>`<button class="song-row" data-song-id="${escapeHTML(s.id)}"><span><strong>${escapeHTML(s.title||"Untitled")}</strong><small>${escapeHTML(s.artist||"")}</small></span><b>＋</b></button>`).join("") || `<div class="empty-box">No songs found.</div>`;
  }

  async function openRequestDialog(){
    if(!(controlData.active===true && activeSessionId)){alert("Song requests are only available during an active session.");return;}
    $("requestNotice").textContent="Loading songs…"; $("requestDialog").showModal();
    try{await loadPublicSongs();renderSongResults();$("requestNotice").textContent="Choose a song and enter your name.";renderMyRequests();}catch(e){console.error(e);$("requestNotice").textContent="Could not load the public song list.";}
  }

  function trackedRequestIds(){try{return JSON.parse(localStorage.getItem("billylee26.requestIds")||"[]");}catch{return[];}}
  function saveTrackedRequestIds(ids){localStorage.setItem("billylee26.requestIds",JSON.stringify([...new Set(ids)].slice(-40)));}
  function clearRequestListeners(){requestListeners.forEach(fn=>{try{fn();}catch{}});requestListeners=[];}
  function statusLabel(status){const s=String(status||"active").toLowerCase(); if(s==="queued")return "ACCEPTED"; if(s==="playing")return "PLAYING"; if(["completed","played"].includes(s))return "PLAYED"; if(["declined","deleted","deletedbyhost"].includes(s))return "DECLINED"; if(s==="abandoned"||s==="left")return "REMOVED"; return "PENDING";}
  async function renderMyRequests(){
    clearRequestListeners(); const ids=trackedRequestIds(); const box=$("myRequests"); if(!ids.length){box.innerHTML=`<p class="muted">Requests you make on this device will appear here.</p>`;return;}
    const records=new Map();
    const paint=()=>{box.innerHTML=ids.map(id=>{const r=records.get(id); if(!r)return `<div class="my-request"><span>Loading…</span></div>`; return `<div class="my-request"><span><strong>${escapeHTML(r.songTitle||"Song")}</strong><small>${escapeHTML(r.songArtist||r.artist||"")}</small></span><em class="request-status status-${escapeHTML(String(r.status||"active").toLowerCase())}">${statusLabel(r.status)}</em></div>`;}).join("");}; paint();
    ids.forEach(id=>requestListeners.push(db.collection("publicSongRequests").doc(id).onSnapshot(doc=>{if(doc.exists)records.set(id,{id,...doc.data()});paint();}))); 
  }

  async function requestSong(songId){
    const name=$("singerName").value.trim(); if(!name){$("requestNotice").textContent="Please enter your name first.";$("singerName").focus();return;}
    const song=songs.find(s=>s.id===songId); if(!song||!activeSessionId)return;
    try{
      const ref=await db.collection("publicSongRequests").add({listId:publicSetlist?.id||"venue-main-public-song-list",publicSetlistId:publicSetlist?.id||"",publicSetlistName:publicSetlist?.name||"",sessionId:activeSessionId,isTestSession:false,status:"active",singerName:name,name,source:"billylee26",songId:song.id,songTitle:song.title||"",artist:song.artist||"",songArtist:song.artist||"",year:song.year||"",createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      const ids=trackedRequestIds();ids.push(ref.id);saveTrackedRequestIds(ids);$("requestNotice").textContent=`${song.title} requested. Waiting for host approval.`;renderMyRequests();
    }catch(e){console.error(e);$("requestNotice").textContent="Could not send request. Please try again.";}
  }

  function showEvent(id){const e=latestEvents.find(x=>x.id===id);if(!e)return;const d=dateFromEvent(e);$("eventDialogBody").innerHTML=`<span class="eyebrow">${escapeHTML(e.type||"EVENT")}</span><h2>${escapeHTML(e.name||e.venue||"Upcoming Gig")}</h2><p><strong>${escapeHTML(e.venue||"")}</strong></p><p>${escapeHTML(e.address||"")}</p><p>${d?escapeHTML(d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})):""} • ${escapeHTML(formatTime(e))}</p>${e.notes?`<p>${escapeHTML(e.notes)}</p>`:""}`;$("eventDialog").showModal();}

  document.addEventListener("click",e=>{
    const eventBtn=e.target.closest("[data-event-id]"); if(eventBtn)showEvent(eventBtn.dataset.eventId);
    const song=e.target.closest("[data-song-id]"); if(song)requestSong(song.dataset.songId);
    const close=e.target.closest("[data-close]"); if(close)$(close.dataset.close)?.close();
  });
  $("songSearch").addEventListener("input",renderSongResults);
  $("requestSongBtn").addEventListener("click",openRequestDialog); $("drawerRequest").addEventListener("click",openRequestDialog);
  $("shareBtn").addEventListener("click",async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);alert("Link copied.");}}catch{}});
  $("menuBtn").addEventListener("click",()=>{$("drawer").classList.add("open");$("scrim").classList.add("show");});
  const closeDrawer=()=>{$("drawer").classList.remove("open");$("scrim").classList.remove("show");}; $("drawerClose").addEventListener("click",closeDrawer); $("scrim").addEventListener("click",closeDrawer); $("drawer").querySelectorAll("a").forEach(a=>a.addEventListener("click",closeDrawer));

  listenEvents(); listenLiveState(); renderLive();
})();
