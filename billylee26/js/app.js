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
  let sessionRequests = [];
  let sessionRequestsUnsub = null;
  let watchedRequestSessionId = "";
  let latestEvents = [];
  let selectedRequestSongId = "";
  let elapsedTimer = null;
  const ARTIST_BROWSE_CATEGORY = "__artist__";
  const DEFAULT_REQUEST_CATEGORIES = [
    {id:"80s",label:"80s",subtitle:"1980–1989",enabled:true,mode:"rule",rule:"80s",songIds:[]},
    {id:"90s",label:"90s",subtitle:"1990–1999",enabled:true,mode:"rule",rule:"90s",songIds:[]},
    {id:"rock",label:"ROCK",subtitle:"Rock songs",enabled:true,mode:"rule",rule:"rock",songIds:[]},
    {id:"pop",label:"POP",subtitle:"Pop songs",enabled:true,mode:"rule",rule:"pop",songIds:[]}
  ];
  const DEFAULT_REQUEST_FAQS = [
    {id:"how-request",question:"How do I request a song?",answer:"Open SONG LIST, search or browse a category, tap + on a song, add an optional note, then press SEND REQUEST."},
    {id:"after-send",question:"What happens after I send it?",answer:"Your request starts as pending. When accepted it appears in LiveSuite Run Order and MY REQUESTS shows your live queue position."},
    {id:"change-request",question:"Can I change my request?",answer:"You can edit your note while the request is still waiting or queued. You can also cancel your own request before it starts playing."},
    {id:"rejected",question:"Why was my request rejected?",answer:"If the host rejects or removes a request, MY REQUESTS shows REJECTED together with the reason supplied by the host."},
    {id:"queue",question:"Queue position",answer:"Queue positions follow LiveSuite Run Order and may change when the host reorders the performance."},
    {id:"tips",question:"Tips",answer:"Add a note if you need a different key, want to sing with someone, or want the host to know something before your turn."}
  ];
  const DEFAULT_WEBSITE_CONTENT = {
    categoryCardSize:82,
    instagramUrl:"https://www.instagram.com/billylee.mt",
    facebookUrl:"https://www.facebook.com/billylee.mt",
    aboutShort:"Billy Lee is a Malta-based singer, guitarist and live performer with over 20 years of experience on stage. His solo performances combine guitar, vocals and live looping to build arrangements in real time, ranging from stripped-back acoustic songs to a fuller, layered sound.\n\nHaving performed at venues, concerts and festivals in Malta and the UK, Billy brings a broad repertoire and an adaptable approach to every show. Alongside his solo work, he is the frontman and guitarist of hard rock band Roxanna and also provides Live Karaoke, an interactive live music experience built around audience song requests and live performance.",
    aboutDetailed:"Billy Lee is a singer, guitarist and live performer based in Malta, with more than two decades of experience performing at venues, concerts, festivals and private events in Malta and the UK.\n\nHis solo setup is centred around guitar, vocals and live looping. Using a loop station, parts are recorded and layered live — rhythm guitar, lead parts, percussion and vocal harmonies can all be built into an arrangement in real time. This allows a solo performance to develop naturally from a simple acoustic foundation into a much fuller sound, without relying on a fixed backing arrangement.\n\nThe repertoire covers a wide range of material, with a strong foundation in rock alongside acoustic and contemporary favourites. Rather than reproducing every song in exactly the same way, arrangements can be adapted to the setting, the audience and the pace of the night. Requests and spontaneous changes are part of that approach, keeping the performance flexible and genuinely live.\n\nBilly is also behind Live Karaoke, an interactive live music experience that puts the audience at the centre of the performance. Guests choose and request songs to sing live, backed by Billy on guitar and vocals. It combines the accessibility of karaoke with the spontaneity and interaction of a live musician, allowing each performance to adapt to the singer and the room.\n\nBilly has also worked extensively in band settings. He currently fronts Roxanna, a Malta-based hard rock band formed in 2023, performing as lead vocalist and guitarist alongside Billy B on bass and backing vocals and Salvo on drums. The band draws from classic and modern hard rock, with elements of grunge and alternative rock, and also performs acoustic material in more intimate settings.\n\nWhether performing solo, hosting Live Karaoke or playing with Roxanna, the focus remains on musicianship, strong arrangements and audience connection - adapting each show to the setting and the people in the room."
  };
  let websiteRequestSettings = {
    enableLiveRequestTestMode:false,
    requestTestSessionId:"",
    showCategoryCards:true,
    showArtistSearchCard:true,
    categoryCardSize:DEFAULT_WEBSITE_CONTENT.categoryCardSize,
    categories:DEFAULT_REQUEST_CATEGORIES.map(item=>({...item})),
    faqs:DEFAULT_REQUEST_FAQS.map(item=>({...item})),
    instagramUrl:DEFAULT_WEBSITE_CONTENT.instagramUrl,
    facebookUrl:DEFAULT_WEBSITE_CONTENT.facebookUrl,
    aboutShort:DEFAULT_WEBSITE_CONTENT.aboutShort,
    aboutDetailed:DEFAULT_WEBSITE_CONTENT.aboutDetailed
  };
  let editingRequestNoteId = "";
  const DEFAULT_TYPE_COLORS = {"Live Karaoke":"#36a9e1","Roxanna":"#d96ce0","Solo":"#53c985","Texanna":"#f08a45","Other":"#a5adb3"};
  let eventTypeColors = {...DEFAULT_TYPE_COLORS};

  function escapeHTML(v){return String(v ?? "").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function dateFromEvent(e){
    if (e?.scheduledStartAt?.toDate) return e.scheduledStartAt.toDate();
    if (!e?.date) return null;
    const d = new Date(`${e.date}T${e.startTime || "00:00"}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function eventIsUpcoming(e){
    if(!e || e.status === "Cancelled" || e.completedAt) return false;
    const ss=String(e.sessionStatus||"").toLowerCase();
    if(ss === "active" || ss === "ended") return false;
    if(activeSessionId && (e.linkedSessionId===activeSessionId || e.id===controlData.eventId)) return false;
    return true;
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
    const active=controlData.active===true && !!activeSessionId;
    const hero=$('heroGigs');
    const watch=$('watchLiveBtn');
    if(!active&&liveRequestTestMode()){
      const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
      hero.innerHTML = upcoming.length ? eventCard(upcoming[0],true) : `<div class="empty-inline">No upcoming gig published.</div>`;
      watch.innerHTML='<span class="button-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></span><span>TEST REQUESTS →</span>';
      watch.classList.add('is-live','is-test-mode');
      watch.setAttribute('href','#requestSongSection');
      return;
    }
    watch.classList.remove('is-test-mode');
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
    watch.textContent='WATCH LIVE →';
    watch.classList.remove('is-live');
    watch.setAttribute('href','#gigs');
  }

  function renderEvents(){
    const upcoming=latestEvents.filter(eventIsUpcoming).sort(eventSort);
    renderHeroGig();
    $("nextGigs").innerHTML = upcoming.slice(0,3).map(e=>eventCard(e,false)).join("") || `<div class="empty-box">No upcoming gigs published.</div>`;
  }

  function listenEvents(){
    db.collection("upcomingEvents").onSnapshot(snap=>{
      latestEvents=snap.docs.map(doc=>({id:doc.id,...(doc.data()||{})})); renderEvents();
    }, err=>console.error("Upcoming events listener failed",err));
  }

  function listenEventTypes(){
    db.collection("karaokeControl").doc("eventTypes").onSnapshot(doc=>{
      const data=doc.exists?(doc.data()||{}):{};
      const colors=(data.colors && typeof data.colors==="object")?data.colors:{};
      eventTypeColors={...DEFAULT_TYPE_COLORS,...colors};
      renderEvents();
    },err=>console.warn("Event type colours listener failed",err));
  }

  function normaliseRequestCategories(raw){
    if(!Array.isArray(raw)||!raw.length)return DEFAULT_REQUEST_CATEGORIES.map(item=>({...item}));
    return raw.slice(0,8).map((item,index)=>{
      const fallback=DEFAULT_REQUEST_CATEGORIES[index]||{};
      return {
        id:String(item?.id||fallback.id||`category-${index+1}`).replace(/[^a-z0-9_-]+/gi,"-").toLowerCase(),
        label:String(item?.label||fallback.label||`CATEGORY ${index+1}`).trim().slice(0,24),
        subtitle:String(item?.subtitle||fallback.subtitle||"").trim().slice(0,40),
        enabled:item?.enabled!==false,
        mode:String(item?.mode||fallback.mode||"custom"),
        rule:String(item?.rule||fallback.rule||""),
        songIds:Array.isArray(item?.songIds)?[...new Set(item.songIds.map(String).filter(Boolean))]:[]
      };
    });
  }

  function normaliseRequestFaqs(raw){
    if(!Array.isArray(raw)||!raw.length)return DEFAULT_REQUEST_FAQS.map(item=>({...item}));
    return raw.slice(0,20).map((item,index)=>({
      id:String(item?.id||`faq-${index+1}`),
      question:String(item?.question||"Question").trim().slice(0,120),
      answer:String(item?.answer||"").trim().slice(0,800)
    })).filter(item=>item.question&&item.answer);
  }

  function renderRequestInfo(){
    const list=$("requestInfoList");
    if(!list)return;
    list.innerHTML=websiteRequestSettings.faqs.map((item,index)=>`
      <details ${index===0?"open":""}>
        <summary>${escapeHTML(item.question)}</summary>
        <p>${escapeHTML(item.answer)}</p>
      </details>
    `).join("") || '<p class="muted">No information has been added yet.</p>';
  }

  function renderPlainParagraphs(target,text){
    if(!target)return;
    const parts=String(text||"").split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean);
    target.innerHTML=parts.map(part=>`<p>${escapeHTML(part).replace(/\n/g,"<br>")}</p>`).join("");
  }

  function safeWebsiteUrl(value,fallback){
    const raw=String(value||"").trim();
    if(!raw)return fallback;
    try{
      const url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
      return /^https?:$/.test(url.protocol)?url.href:fallback;
    }catch{return fallback;}
  }

  function applyWebsiteContent(){
    const instagram=safeWebsiteUrl(websiteRequestSettings.instagramUrl,DEFAULT_WEBSITE_CONTENT.instagramUrl);
    const facebook=safeWebsiteUrl(websiteRequestSettings.facebookUrl,DEFAULT_WEBSITE_CONTENT.facebookUrl);
    if($("footerInstagramLink"))$("footerInstagramLink").href=instagram;
    if($("footerFacebookLink"))$("footerFacebookLink").href=facebook;
    renderPlainParagraphs($("aboutShortText"),websiteRequestSettings.aboutShort||DEFAULT_WEBSITE_CONTENT.aboutShort);
    renderPlainParagraphs($("aboutDetailedText"),websiteRequestSettings.aboutDetailed||DEFAULT_WEBSITE_CONTENT.aboutDetailed);
  }

  function applyWebsiteRequestSettings(data={}){
    websiteRequestSettings={
      enableLiveRequestTestMode:data.enableLiveRequestTestMode===true,
      requestTestSessionId:String(data.requestTestSessionId||""),
      showCategoryCards:data.showCategoryCards!==false,
      showArtistSearchCard:data.showArtistSearchCard!==false,
      categoryCardSize:Math.max(60,Math.min(120,Number(data.categoryCardSize)||DEFAULT_WEBSITE_CONTENT.categoryCardSize)),
      categories:normaliseRequestCategories(data.categories),
      faqs:normaliseRequestFaqs(data.faqs),
      instagramUrl:String(data.instagramUrl||DEFAULT_WEBSITE_CONTENT.instagramUrl),
      facebookUrl:String(data.facebookUrl||DEFAULT_WEBSITE_CONTENT.facebookUrl),
      aboutShort:String(data.aboutShort||DEFAULT_WEBSITE_CONTENT.aboutShort),
      aboutDetailed:String(data.aboutDetailed||DEFAULT_WEBSITE_CONTENT.aboutDetailed)
    };
    renderRequestCategoryCards();
    applyWebsiteContent();
    renderRequestInfo();
    if(requestCategory!=="all"){
      const artistModeValid=
        requestCategory===ARTIST_BROWSE_CATEGORY &&
        websiteRequestSettings.showCategoryCards!==false &&
        websiteRequestSettings.showArtistSearchCard!==false;
      const categoryValid=websiteRequestSettings.categories.some(category=>category.id===requestCategory&&category.enabled);
      if(!artistModeValid&&!categoryValid){
        requestCategory="all";
        if($("clearSongCategoryBtn"))$("clearSongCategoryBtn").hidden=true;
      }
    }
    syncSessionRequestsWatcher();
    renderLive();
    if($("requestDialog")?.open&&$("requestBrowser")&&!$("requestBrowser").hidden)renderSongResults();
  }

  function listenWebsiteRequestSettings(){
    db.collection("karaokeControl").doc("billyLeeWebsiteSettings").onSnapshot(doc=>{
      applyWebsiteRequestSettings(doc.exists?(doc.data()||{}):{});
    },error=>{
      console.warn("Billy Lee website settings unavailable; using defaults.",error);
      applyWebsiteRequestSettings({});
    });
  }

  function hasRealLiveSession(){
    return controlData.active===true && !!activeSessionId;
  }

  function liveRequestTestMode(){
    return websiteRequestSettings.enableLiveRequestTestMode===true && !hasRealLiveSession();
  }

  function requestSessionId(){
    if(hasRealLiveSession())return activeSessionId;
    if(!liveRequestTestMode())return "";
    return String(websiteRequestSettings.requestTestSessionId||"billylee-test-preview");
  }

  function syncSessionRequestsWatcher(){
    const next=requestSessionId();
    if(next===watchedRequestSessionId)return;
    watchedRequestSessionId=next;
    attachSessionRequests(next);
    if($("requestDialog")?.open)void renderMyRequests();
  }

  function testRequestQueueCount(){
    const activeStatuses=new Set(["active","pending","waiting","queued","accepted","requested"]);
    return sessionRequests.filter(request=>activeStatuses.has(String(request.status||"active").toLowerCase())).length;
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
    const active=hasRealLiveSession();
    const testMode=liveRequestTestMode();
    renderHeroGig();
    const playing=active?playingItem():null;
    const breakOpen=active&&activeSession?.breakOpen===true;
    const livePanel=$("livePanel");
    livePanel?.classList.toggle("is-test-mode",testMode);
    $("queueCount").textContent=String(active?queuedRequestCount():(testMode?testRequestQueueCount():0));
    $("requestSongBtn").disabled=!(active||testMode);
    $("sessionVenue").textContent=active
      ? (controlData.venue || activeSession?.venue || controlData.eventSnapshot?.venue || "Live")
      : (testMode?"Billy Lee Website":"—");
    $("sessionType").textContent=active
      ? (controlData.sessionType || controlData.type || activeSession?.sessionType || activeSession?.type || "Performance")
      : (testMode?"TEST MODE":"—");
    $("progressBar").style.width="0%";
    startElapsed(playing);
    const label=$("liveStateLabel");
    const title=$("currentSongTitle");
    label.classList.remove("is-playing","is-test-mode");
    title.classList.remove("between-songs-title");
    if(testMode){
      label.textContent="TEST MODE";
      label.classList.add("is-test-mode");
      title.textContent="- LIVE REQUEST PLAYER TEST -";
      title.classList.add("between-songs-title");
      $("currentSongArtist").textContent="Request A Song is enabled for website testing.";
      $("stateIcon").textContent="⚙";
      return;
    }
    if(!active){
      label.textContent="NOT LIVE";
      title.textContent="No active session";
      $("currentSongArtist").textContent="Check the upcoming gigs below.";
      $("stateIcon").textContent="♪";
      return;
    }
    if(breakOpen){
      label.textContent="ON BREAK";
      title.textContent="- WE'LL BE BACK SHORTLY -";
      title.classList.add("between-songs-title");
      $("currentSongArtist").textContent="Requests remain open during the break.";
      $("stateIcon").textContent="☕";
      return;
    }
    if(playing){
      label.textContent="NOW PLAYING";
      label.classList.add("is-playing");
      title.textContent=playing.songTitle||playing.title||"Current song";
      $("currentSongArtist").textContent=ArtistNames.display(playing.artist||playing.songArtist||"");
      $("stateIcon").innerHTML='<span class="pause-bars"><i></i><i></i></span>';
      return;
    }
    label.textContent="LIVE NOW";
    title.textContent="- BETWEEN SONGS -";
    title.classList.add("between-songs-title");
    $("currentSongArtist").textContent="The next song will start shortly.";
    $("stateIcon").textContent="♪";
  }

  function attachSessionDoc(id){
    if(sessionUnsub){sessionUnsub();sessionUnsub=null;} activeSession=null;
    if(!id){renderLive();return;}
    sessionUnsub=db.collection("performanceSessions").doc(id).onSnapshot(doc=>{activeSession=doc.exists?(doc.data()||{}):null;renderLive();},err=>console.error("Session listener failed",err));
  }

  function attachSessionRequests(id){
    if(sessionRequestsUnsub){try{sessionRequestsUnsub();}catch{} sessionRequestsUnsub=null;}
    watchedRequestSessionId=String(id||"");
    sessionRequests=[];
    if(!id){
      if($("requestDialog")?.open && !$("requestBrowser")?.hidden)renderSongResults();
      return;
    }
    sessionRequestsUnsub=db.collection("publicSongRequests")
      .where("sessionId","==",id)
      .onSnapshot(snapshot=>{
        sessionRequests=snapshot.docs.map(doc=>({id:doc.id,...(doc.data()||{})}));
        renderLive();
        if($("requestDialog")?.open && !$("requestBrowser")?.hidden)renderSongResults();
      },error=>{
        console.warn("Could not watch session request availability:",error);
        sessionRequests=[];
      });
  }

  function listenLiveState(){
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc=>{
      const d=doc.exists?(doc.data()||{}):{}; controlData=d; const next=d.active===true?String(d.sessionId||d.activeSessionId||""):"";
      if(next!==activeSessionId){
        activeSessionId=next;
        attachSessionDoc(next);
        syncSessionRequestsWatcher();
        if($("requestDialog")?.open) renderMyRequests();
      }
      syncSessionRequestsWatcher();
      renderLive();
    },err=>console.error("Current session listener failed",err));
    db.collection("karaokeControl").doc("runOrder").onSnapshot(doc=>{
      const d=doc.exists?(doc.data()||{}):{};
      runOrder=(activeSessionId && d.sessionId && d.sessionId!==activeSessionId)?[]:(Array.isArray(d.items)?d.items:[]);
      renderLive();
      if($("requestDialog")?.open && !$("requestSongStep").hidden){
        if(!$("requestBrowser").hidden) renderSongResults();
        renderMyRequests();
      }
    },err=>console.error("Run order listener failed",err));
  }

  async function loadPublicSongs(){
    const cfgSnap=await db.collection("karaokeControl").doc("publicSongList").get();
    const cfg=cfgSnap.exists?(cfgSnap.data()||{}):{};
    if(cfg.setlistId){
      const setSnap=await db.collection("lyricsSetlists").doc(cfg.setlistId).get();
      if(setSnap.exists){
        const set={id:setSnap.id,...setSnap.data()};
        publicSetlist=set;
        const ids=Array.isArray(set.songIds)?set.songIds:[];
        const chunks=[]; for(let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
        const groups=await Promise.all(chunks.map(chunk=>db.collection("lyrics").where(firebase.firestore.FieldPath.documentId(),"in",chunk).get()));
        const map=new Map();
        groups.forEach(group=>group.docs.forEach(doc=>map.set(doc.id,{id:doc.id,...doc.data()})));
        songs=ids.map(id=>map.get(id)).filter(Boolean);
        return;
      }
    }
    const all=await db.collection("lyrics").get();
    songs=all.docs.map(d=>({id:d.id,...d.data()})).filter(song=>song.title && song.publicSongListVisible!==false);
    publicSetlist=null;
  }

  function normaliseSongIdentity(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();}
  function sameSong(item,song){
    if(!item||!song)return false;
    if(item.songId && item.songId===song.id)return true;
    const a=normaliseSongIdentity(item.songTitle||item.title);
    const b=normaliseSongIdentity(song.title);
    if(!a||a!==b)return false;
    const ia=normaliseSongIdentity(ArtistNames.display(item.artist||item.songArtist));
    const sa=normaliseSongIdentity(ArtistNames.display(song.artist));
    return !ia||!sa||ia===sa;
  }
  function songSessionState(song){
    const releasedStatuses=new Set(["cancelled","declined","deleted","deletedbyhost","abandoned","left","rejected"]);
    const playedStatuses=new Set(["played","completed","finished"]);
    const activeRequestStatuses=new Set(["active","pending","waiting","queued","accepted","playing","requested"]);

    const requestMatches=sessionRequests.filter(request=>sameSong(request,song));
    if(requestMatches.some(request=>playedStatuses.has(String(request.status||"").toLowerCase())))return "played";

    const runMatches=runOrder.filter(item=>sameSong(item,song));
    if(runMatches.some(item=>playedStatuses.has(String(item.status||"").toLowerCase())))return "played";
    if(runMatches.some(item=>String(item.status||"").toLowerCase()==="playing"))return "playing";

    if(requestMatches.some(request=>{
      const status=String(request.status||"active").toLowerCase();
      return activeRequestStatuses.has(status)&&!releasedStatuses.has(status);
    }))return "requested";

    const requestById=new Map(sessionRequests.map(request=>[String(request.id||""),request]));
    const activeRunMatch=runMatches.some(item=>{
      const status=String(item.status||"queued").toLowerCase();
      if(playedStatuses.has(status)||status==="playing")return false;
      if(["cancelled","declined","deleted","deletedbyhost","abandoned","left"].includes(status))return false;
      if(item.requestId){
        const request=requestById.get(String(item.requestId));
        const requestStatus=String(request?.status||"").toLowerCase();
        if(request&&releasedStatuses.has(requestStatus))return false;
      }
      return true;
    });
    return activeRunMatch?"requested":"available";
  }
  function runOrderStatusForRequest(requestId){
    const item=runOrder.find(row=>row?.requestId===requestId);
    return item?String(item.status||"").toLowerCase():"";
  }

  const REQUEST_PROFILE_KEY="billylee26.requestProfile.v1";
  const REQUEST_REVIEW_ID_KEY="billylee26.reviewId";
  const REQUEST_DEVICE_ID_KEY="billylee26.requestDeviceId.v1";
  const REQUEST_FAVOURITES_KEY="billylee26.favouriteSongIds.v1";
  let requestCategory="all";
  let currentHistoryRecords=[];
  let currentHistorySessions=new Map();

  function requestDeviceId(){
    let id=String(localStorage.getItem(REQUEST_DEVICE_ID_KEY)||"").trim();
    if(id)return id;
    id=globalThis.crypto?.randomUUID?.()||("dev-"+Date.now()+"-"+Math.random().toString(36).slice(2,12));
    localStorage.setItem(REQUEST_DEVICE_ID_KEY,id);
    return id;
  }


  async function requestEmailHash(email){
    const normalized=String(email||"").trim().toLowerCase();
    if(!normalized)return "";
    if(globalThis.crypto?.subtle&&globalThis.TextEncoder){
      const bytes=new TextEncoder().encode(normalized);
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
    }
    let hash=2166136261;
    for(let i=0;i<normalized.length;i++){
      hash^=normalized.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return "legacy-"+(hash>>>0).toString(16);
  }

  function favouriteSongIds(){
    try{
      const ids=JSON.parse(localStorage.getItem(REQUEST_FAVOURITES_KEY)||"[]");
      return Array.isArray(ids)?[...new Set(ids.map(String))]:[];
    }catch{return[];}
  }

  function saveFavouriteSongIds(ids){
    localStorage.setItem(REQUEST_FAVOURITES_KEY,JSON.stringify([...new Set((ids||[]).map(String))].slice(0,500)));
  }

  function isFavouriteSong(songId){
    return favouriteSongIds().includes(String(songId||""));
  }

  async function syncRecoveryProfile(profile=requestProfile()){
    if(!profile.email)return false;
    const emailHash=await requestEmailHash(profile.email);
    if(!emailHash)return false;
    const data={
      source:"billylee26",
      name:profile.name||"",
      country:profile.country||"",
      ageRange:profile.ageRange||"",
      gender:profile.gender||"",
      rating:profile.rating?Number(profile.rating):null,
      review:profile.review||"",
      reviewPrivate:profile.reviewPrivate===true,
      favouriteSongIds:favouriteSongIds(),
      requesterDeviceId:requestDeviceId(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection("websiteRequesterProfiles").doc(emailHash).set(data,{merge:true});
    return true;
  }

  async function recoverRequestProfile(){
    const status=$("requestProfileStatus");
    const email=String($("requestProfileEmail")?.value||"").trim();
    if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      if(status)status.textContent="Enter the email address used with your profile.";
      $("requestProfileEmail")?.focus();
      return;
    }

    const button=$("recoverRequestProfileBtn");
    if(button)button.disabled=true;
    if(status)status.textContent="Looking for your saved profile…";

    try{
      const emailHash=await requestEmailHash(email);
      let cloudProfile=null;
      try{
        const profileSnap=await db.collection("websiteRequesterProfiles").doc(emailHash).get();
        if(profileSnap.exists)cloudProfile=profileSnap.data()||{};
      }catch(error){
        console.info("Recovery profile document unavailable:",error?.code||error);
      }

      let requestDocs=[];
      try{
        const requestSnap=await db.collection("publicSongRequests")
          .where("requesterEmailHash","==",emailHash)
          .limit(250)
          .get();
        requestDocs=requestSnap.docs.map(doc=>({id:doc.id,...(doc.data()||{})}));
      }catch(error){
        console.info("Email-linked request lookup unavailable:",error?.code||error);
      }

      if(!cloudProfile&&!requestDocs.length){
        if(status)status.textContent="No saved profile or request history was found for that email yet.";
        return;
      }

      const latest=requestDocs.slice().sort((a,b)=>
        requestTimestampMs(b.createdAt||b.requestedAt)-requestTimestampMs(a.createdAt||a.requestedAt)
      )[0]||{};

      const recovered={
        name:String(cloudProfile?.name||latest.singerName||latest.name||"").trim(),
        email,
        country:String(cloudProfile?.country||latest.requesterCountry||"").trim(),
        ageRange:String(cloudProfile?.ageRange||latest.requesterAgeRange||""),
        gender:String(cloudProfile?.gender||latest.requesterGender||""),
        rating:cloudProfile?.rating!=null?String(cloudProfile.rating):"",
        review:String(cloudProfile?.review||""),
        reviewPrivate:cloudProfile?.reviewPrivate===true
      };

      localStorage.setItem(REQUEST_PROFILE_KEY,JSON.stringify(recovered));
      if(recovered.name)localStorage.setItem("billylee26.requestName",recovered.name);
      if(requestDocs.length)saveTrackedRequestIds([...trackedRequestIds(),...requestDocs.map(record=>record.id)]);
      const recoveredFavourites=Array.isArray(cloudProfile?.favouriteSongIds)
        ? cloudProfile.favouriteSongIds
        : (Array.isArray(latest.requesterFavouriteSongIds)?latest.requesterFavouriteSongIds:[]);
      if(recoveredFavourites.length)saveFavouriteSongIds(recoveredFavourites);
      populateProfileForm();
      if(status){
        status.textContent="Recovered "+requestDocs.length+" request"+(requestDocs.length===1?"":"s")+(recovered.name?" for "+recovered.name:"")+".";
      }
    }catch(error){
      console.error("Could not recover request profile:",error);
      if(status)status.textContent="Could not recover the profile right now. Please try again.";
    }finally{
      if(button)button.disabled=false;
    }
  }

  function requestProfile(){
    let stored={};
    try{stored=JSON.parse(localStorage.getItem(REQUEST_PROFILE_KEY)||"{}")||{};}catch(_){}
    const legacyName=String(localStorage.getItem("billylee26.requestName")||"").trim();
    return {
      name:String(stored.name||legacyName||"").trim(),
      email:String(stored.email||"").trim(),
      country:String(stored.country||"").trim(),
      ageRange:String(stored.ageRange||""),
      gender:String(stored.gender||""),
      rating:String(stored.rating||""),
      review:String(stored.review||""),
      reviewPrivate:stored.reviewPrivate===true
    };
  }

  function syncRequesterUi(){
    const profile=requestProfile();
    if($("requesterNameLabel"))$("requesterNameLabel").textContent=profile.name||"Set profile";
    if($("requestConfirmName"))$("requestConfirmName").textContent=profile.name||"Guest";
  }

  function paintReviewStars(){
    const rating=Number($("requestReviewRating")?.value||0);
    document.querySelectorAll("[data-review-rating]").forEach(button=>{
      const value=Number(button.dataset.reviewRating||0);
      button.classList.toggle("active",value>0&&value<=rating);
      button.setAttribute("aria-pressed",String(value===rating));
    });
  }

  function setReviewRating(value){
    if($("requestReviewRating"))$("requestReviewRating").value=value?String(value):"";
    paintReviewStars();
  }

  function populateProfileForm(){
    const profile=requestProfile();
    if($("singerName"))$("singerName").value=profile.name;
    if($("requestProfileEmail"))$("requestProfileEmail").value=profile.email;
    if($("requestProfileCountry"))$("requestProfileCountry").value=profile.country;
    if($("requestProfileAge"))$("requestProfileAge").value=profile.ageRange;
    if($("requestProfileGender"))$("requestProfileGender").value=profile.gender;
    if($("requestReviewRating"))$("requestReviewRating").value=profile.rating;
    if($("requestReviewText"))$("requestReviewText").value=profile.review;
    if($("requestReviewPrivate"))$("requestReviewPrivate").checked=profile.reviewPrivate;
    if($("requestProfileStatus"))$("requestProfileStatus").textContent="";
    paintReviewStars();
    syncRequesterUi();
  }

  let requestActionConfirmResolve=null;

  function showRequestActionConfirm({title="CONFIRM",message="",confirmLabel="CONFIRM",cancelLabel="KEEP",danger=true}={}){
    const dialog=$("requestActionConfirmDialog");
    if(!dialog)return Promise.resolve(false);
    if(requestActionConfirmResolve){
      requestActionConfirmResolve(false);
      requestActionConfirmResolve=null;
    }
    $("requestActionConfirmTitle").textContent=title;
    $("requestActionConfirmMessage").textContent=message;
    $("requestActionConfirmOkBtn").textContent=confirmLabel;
    $("requestActionConfirmCancelBtn").textContent=cancelLabel;
    $("requestActionConfirmOkBtn").classList.toggle("danger",danger);
    if(!dialog.open)dialog.showModal();
    return new Promise(resolve=>{requestActionConfirmResolve=resolve;});
  }

  function finishRequestActionConfirm(result){
    if($("requestActionConfirmDialog")?.open)$("requestActionConfirmDialog").close();
    const resolve=requestActionConfirmResolve;
    requestActionConfirmResolve=null;
    if(resolve)resolve(!!result);
  }

  async function forgetRequestProfile(){
    const name=requestProfile().name||"this user";
    const confirmed=await showRequestActionConfirm({
      title:"FORGET USER?",
      message:`Forget ${name} on this device? This clears the saved profile and this device's My Requests history.`,
      confirmLabel:"FORGET USER",
      cancelLabel:"KEEP USER",
      danger:true
    });
    if(!confirmed)return;
    clearRequestListeners();
    localStorage.removeItem(REQUEST_PROFILE_KEY);
    localStorage.removeItem("billylee26.requestName");
    localStorage.removeItem("billylee26.requestIds");
    localStorage.removeItem(REQUEST_REVIEW_ID_KEY);
    localStorage.removeItem(REQUEST_DEVICE_ID_KEY);
    localStorage.removeItem(REQUEST_FAVOURITES_KEY);
    selectedRequestSongId="";
    populateProfileForm();
    if($("myRequests"))$("myRequests").innerHTML='<p class="muted">Requests you make in this session will appear here.</p>';
    if($("requestProfileStatus"))$("requestProfileStatus").textContent="Saved user forgotten on this device.";
    $("singerName")?.focus();
  }

  async function saveRequestProfile({goToSongs=true}={}){
    const name=String($("singerName")?.value||"").trim();
    if(!name){
      $("requestProfileStatus").textContent="Enter your name first.";
      $("singerName")?.focus();
      return false;
    }

    const email=String($("requestProfileEmail")?.value||"").trim();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      $("requestProfileStatus").textContent="Enter a valid email address or leave it blank.";
      $("requestProfileEmail")?.focus();
      return false;
    }

    const profile={
      name,
      email,
      country:String($("requestProfileCountry")?.value||"").trim(),
      ageRange:String($("requestProfileAge")?.value||""),
      gender:String($("requestProfileGender")?.value||""),
      rating:String($("requestReviewRating")?.value||""),
      review:String($("requestReviewText")?.value||"").trim(),
      reviewPrivate:$("requestReviewPrivate")?.checked===true
    };

    localStorage.setItem(REQUEST_PROFILE_KEY,JSON.stringify(profile));
    localStorage.setItem("billylee26.requestName",name);
    syncRequesterUi();

    const status=$("requestProfileStatus");
    if(status)status.textContent="Profile saved on this device.";

    if(profile.rating || profile.review){
      try{
        const data={
          source:"billylee26",
          name:profile.name,
          requesterEmailHash:profile.email?await requestEmailHash(profile.email):"",
          country:profile.country,
          ageRange:profile.ageRange,
          gender:profile.gender,
          rating:profile.rating?Number(profile.rating):null,
          review:profile.review,
          displayOptIn:!profile.reviewPrivate,
          sessionId:requestSessionId()||"",
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        };
        const existingId=localStorage.getItem(REQUEST_REVIEW_ID_KEY)||"";
        if(existingId){
          await db.collection("websiteReviews").doc(existingId).set(data,{merge:true});
        }else{
          const ref=await db.collection("websiteReviews").add({
            ...data,
            createdAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          localStorage.setItem(REQUEST_REVIEW_ID_KEY,ref.id);
        }
        if(status)status.textContent=profile.reviewPrivate
          ?"Profile and private review saved."
          :"Profile and review saved.";
      }catch(error){
        console.warn("Could not save website review:",error);
        if(status)status.textContent="Profile saved. Review could not be submitted right now.";
      }
    }

    if(profile.email){
      try{await syncRecoveryProfile(profile);}catch(error){console.info("Recovery profile sync unavailable:",error?.code||error);}
    }

    if(goToSongs) switchRequestTab("songs");
    return true;
  }

  function switchRequestTab(tab){
    const valid=new Set(["profile","songs","requests","data","info"]);
    const target=valid.has(tab)?tab:"songs";

    if($("requestNameGate"))$("requestNameGate").hidden=true;
    const bottomTabs=document.querySelector(".request-bottom-tabs");
    if(bottomTabs)bottomTabs.hidden=false;
    document.querySelectorAll("[data-request-panel]").forEach(panel=>{
      panel.hidden=panel.dataset.requestPanel!==target;
    });
    if($("requestConfirmPanel"))$("requestConfirmPanel").hidden=true;
    if($("requestSuccess"))$("requestSuccess").hidden=true;

    document.querySelectorAll("[data-request-tab]").forEach(button=>{
      const active=button.dataset.requestTab===target;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });

    if(target==="profile")populateProfileForm();
    if(target==="songs"){
      renderRequestCategoryCards();
      const selected=requestCategoryById(requestCategory);
      if($("requestNotice")){
        if(requestCategory==="all")$("requestNotice").textContent="Choose a song. Tap + to continue.";
        else if(requestCategory===ARTIST_BROWSE_CATEGORY)$("requestNotice").textContent="Browse by artist. Use the letters or search bar to jump through the list.";
        else $("requestNotice").textContent=`${selected?.label||"Category"} · tap + to continue.`;
      }
      renderSongResults();
    }
    if(target==="requests")void renderMyRequests();
    if(target==="data")void openRequestHistory();
  }

  function songGenres(song){
    const values=[];
    if(song?.genre)values.push(song.genre);
    if(Array.isArray(song?.genres))values.push(...song.genres);
    if(Array.isArray(song?.tags))values.push(...song.tags);
    return values.map(value=>String(value||"").toLowerCase());
  }

  function requestCategoryById(id){
    return websiteRequestSettings.categories.find(category=>category.id===id)||null;
  }

  function songMatchesCategory(song,categoryId){
    if(categoryId==="all"||categoryId===ARTIST_BROWSE_CATEGORY)return true;
    const category=requestCategoryById(categoryId);
    if(!category||category.enabled===false)return false;

    // Admin-managed categories are explicit, including intentionally empty ones.
    if(String(category.mode||"").toLowerCase()==="custom"){
      return Array.isArray(category.songIds)&&category.songIds.includes(String(song.id));
    }
    if(Array.isArray(category.songIds)&&category.songIds.length){
      return category.songIds.includes(String(song.id));
    }

    const rule=String(category.rule||category.id||"").toLowerCase();
    const year=Number(song?.year);
    if(rule==="80s")return Number.isFinite(year)&&year>=1980&&year<=1989;
    if(rule==="90s")return Number.isFinite(year)&&year>=1990&&year<=1999;
    const genres=songGenres(song).join(" ");
    if(rule==="rock")return /rock|grunge|metal|alternative/.test(genres);
    if(rule==="pop")return /pop/.test(genres);
    return false;
  }


  function renderRequestCategoryCards(){
    const grid=$("requestCategoryGrid");
    if(!grid)return;
    const categories=websiteRequestSettings.categories.filter(category=>category.enabled!==false);
    const showArtistCard=websiteRequestSettings.showArtistSearchCard!==false;
    const size=Math.max(60,Math.min(120,Number(websiteRequestSettings.categoryCardSize)||82));
    grid.style.setProperty("--request-category-size",size+"px");
    const hasCards=categories.length>0||showArtistCard;
    grid.hidden=websiteRequestSettings.showCategoryCards===false||!hasCards;
    if(grid.hidden){
      grid.innerHTML="";
      return;
    }
    const categoryCards=categories.map(category=>`
      <button type="button" data-song-category="${escapeHTML(category.id)}" class="${requestCategory===category.id?"active":""}">
        <strong>${escapeHTML(category.label)}</strong>
        ${category.subtitle?`<span>${escapeHTML(category.subtitle)}</span>`:""}
      </button>
    `).join("");
    const artistLabel=requestCategory===ARTIST_BROWSE_CATEGORY?"SEARCH BY SONG":"SEARCH BY ARTIST";
    const artistCard=showArtistCard?`
      <button type="button" data-song-category="${ARTIST_BROWSE_CATEGORY}" class="artist-search-card ${requestCategory===ARTIST_BROWSE_CATEGORY?"active":""}">
        <strong>${artistLabel}</strong>
      </button>
    `:"";
    grid.innerHTML=categoryCards+artistCard;
  }

  function alphabetKey(value){
    const text=String(value||"").trim();
    if(!text)return "#";
    const first=text.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first)?first:"#";
  }

  function renderAlphabetJump(containerId,list,{artistMode=false,attribute="data-alpha",scrollTargetId="songResults"}={}){
    const row=$(containerId);
    if(!row)return;
    const present=new Set();
    list.forEach(song=>{
      const value=artistMode?artistBrowseDisplayName(ArtistNames.display(song.artist||"")):(song.title||"");
      present.add(alphabetKey(value));
    });
    const letters=["#","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
    row.innerHTML=letters.map(letter=>`
      <button type="button" data-alpha-jump="${letter}" data-alpha-target="${scrollTargetId}" data-alpha-attribute="${attribute}" ${present.has(letter)?"":"disabled"}>${letter}</button>
    `).join("");
  }

  function jumpToAlphabet(containerId,attribute,letter){
    const container=$(containerId);
    if(!container)return;
    const target=[...container.querySelectorAll("["+attribute+"]")].find(node=>node.getAttribute(attribute)===letter);
    if(!target)return;
    const containerRect=container.getBoundingClientRect();
    const targetRect=target.getBoundingClientRect();
    const top=container.scrollTop+(targetRect.top-containerRect.top);
    container.scrollTo({top:Math.max(0,top-3),behavior:"smooth"});
  }

  function jumpToArtistAlphabet(letter){
    const container=$("songResults");
    if(!container)return;
    const target=[...container.querySelectorAll(".artist-song-group[data-artist-alpha]")]
      .find(group=>group.dataset.artistAlpha===letter);
    if(!target)return;

    let top=0;
    let node=target;
    let reachedContainer=false;
    while(node&&node!==container){
      top+=Number(node.offsetTop)||0;
      node=node.offsetParent;
    }
    reachedContainer=node===container;

    if(!reachedContainer){
      const containerRect=container.getBoundingClientRect();
      const targetRect=target.getBoundingClientRect();
      top=container.scrollTop+(targetRect.top-containerRect.top);
    }

    container.scrollTo({top:Math.max(0,top-2),behavior:"smooth"});
  }

  function setSongCategory(category){
    let next=String(category||"all").toLowerCase();
    if(next===ARTIST_BROWSE_CATEGORY&&requestCategory===ARTIST_BROWSE_CATEGORY)next="all";
    requestCategory=next;
    renderRequestCategoryCards();
    if($("clearSongCategoryBtn"))$("clearSongCategoryBtn").hidden=requestCategory==="all";
    const selected=requestCategoryById(requestCategory);
    if($("requestNotice")){
      if(requestCategory==="all"){
        $("requestNotice").textContent="Choose a song. Tap + to continue.";
      }else if(requestCategory===ARTIST_BROWSE_CATEGORY){
        $("requestNotice").textContent="Browse by artist. Use the letters or search bar to jump through the list.";
      }else{
        $("requestNotice").textContent=`${selected?.label||"Category"} · tap + to continue.`;
      }
    }
    renderSongResults();
  }

  function renderSongResultRow(song,{artistGrouped=false}={}){
    const state=songSessionState(song);
    let action="＋",disabled="",stateClass="";
    if(state==="playing"){action="NOW PLAYING";disabled=" disabled";stateClass=" is-playing";}
    else if(state==="played"){action="ALREADY PLAYED";disabled=" disabled";stateClass=" is-played";}
    else if(state==="requested"){action="ALREADY REQUESTED";disabled=" disabled";stateClass=" is-requested";}
    const artist=ArtistNames.display(song.artist||"");
    const year=String(song.year||"").trim();
    const meta=artistGrouped?[year].filter(Boolean).join(" • "):[artist,year].filter(Boolean).join(" • ");
    const alpha=alphabetKey(song.title||"");
    const favourite=isFavouriteSong(song.id);
    return `<div class="song-row${stateClass}" data-song-row-id="${escapeHTML(song.id)}" data-alpha="${alpha}">
      <span><strong>${escapeHTML(song.title||"Untitled")}</strong>${meta?`<small>${escapeHTML(meta)}</small>`:""}</span>
      <div class="song-row-actions">
        <button type="button" class="request-favourite-btn ${favourite?"is-favourite":""}" data-toggle-favourite="${escapeHTML(song.id)}" aria-label="${favourite?"Remove from":"Add to"} favourites">${favourite?"♥":"♡"}</button>
        <button class="song-action" type="button" data-song-id="${escapeHTML(song.id)}"${disabled} aria-label="Choose ${escapeHTML(song.title||"song")}">${escapeHTML(action)}</button>
      </div>
    </div>`;
  }

  function artistBrowseDisplayName(value){
    const name=String(value||"").trim()||"Unknown Artist";
    const match=name.match(/^the\s+(.+)$/i);
    return match?`${match[1]}, The`:name;
  }

  function renderArtistGroupedResults(list){
    const groups=new Map();
    list.forEach(song=>{
      const artist=ArtistNames.display(song.artist||"").trim()||"Unknown Artist";
      if(!groups.has(artist))groups.set(artist,[]);
      groups.get(artist).push(song);
    });
    const artists=[...groups.keys()].sort((a,b)=>
      artistBrowseDisplayName(a).localeCompare(artistBrowseDisplayName(b),undefined,{sensitivity:"base"})
    );
    return artists.map(artist=>{
      const displayArtist=artistBrowseDisplayName(artist);
      const artistSongs=groups.get(artist).slice().sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base"}));
      return `
        <section class="artist-song-group" data-artist-alpha="${alphabetKey(displayArtist)}">
          <div class="artist-song-group-heading">
            <strong>${escapeHTML(displayArtist)}</strong>
            <span>${artistSongs.length} song${artistSongs.length===1?"":"s"}</span>
          </div>
          <div class="artist-song-group-list">
            ${artistSongs.map(song=>renderSongResultRow(song,{artistGrouped:true})).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderSongResults(){
    const q=String($("songSearch")?.value||"").trim().toLowerCase();
    const list=songs.filter(song=>
      songMatchesCategory(song,requestCategory)&&(!q||ArtistNames.matchesSong(song,q))
    );
    const artistMode=requestCategory===ARTIST_BROWSE_CATEGORY;
    renderAlphabetJump("requestAlphabetRow",list,{
      artistMode,
      attribute:artistMode?"data-artist-alpha":"data-alpha",
      scrollTargetId:"songResults"
    });

    if(artistMode){
      $("songResults").classList.add("artist-browse-results");
      $("songResults").innerHTML=renderArtistGroupedResults(list)||`<div class="empty-box">No matching artists or songs.</div>`;
      return;
    }

    $("songResults").classList.remove("artist-browse-results");
    const sorted=list.slice().sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base"}));
    $("songResults").innerHTML=sorted.map(song=>renderSongResultRow(song)).join("")||`<div class="empty-box">No songs found in this category.</div>`;
  }

  function showRequestBrowser(){
    selectedRequestSongId="";
    requestCategory="all";
    if($("songSearch"))$("songSearch").value="";
    document.querySelectorAll("[data-song-category]").forEach(button=>button.classList.remove("active"));
    if($("clearSongCategoryBtn"))$("clearSongCategoryBtn").hidden=true;
    switchRequestTab("songs");
  }

  function showRequestConfirmation(song){
    if(!song)return;
    syncRequesterUi();
    document.querySelectorAll("[data-request-panel]").forEach(panel=>panel.hidden=true);
    document.querySelectorAll("[data-request-tab]").forEach(button=>button.classList.remove("active"));
    $("requestConfirmPanel").hidden=false;
    $("requestSuccess").hidden=true;
    $("requestConfirmSongTitle").textContent=song.title||"Song";
    $("requestConfirmSongArtist").textContent=ArtistNames.display(song.artist||"");
    $("requestConfirmName").textContent=requestProfile().name||"Guest";
    $("requestNote").value="";
    setTimeout(()=>$("requestNote")?.focus(),30);
  }

  async function enterSongRequestStep(name){
    const profile=requestProfile();
    profile.name=String(name||profile.name||"").trim();
    localStorage.setItem(REQUEST_PROFILE_KEY,JSON.stringify(profile));
    localStorage.setItem("billylee26.requestName",profile.name);
    syncRequesterUi();
    try{
      if(!songs.length)await loadPublicSongs();
      await renderMyRequests();
      switchRequestTab("songs");
    }catch(error){
      console.error(error);
      $("requestNotice").textContent="Could not load the public song list.";
    }
  }

  function showRequestNameGate(){
    document.querySelectorAll("[data-request-panel]").forEach(panel=>panel.hidden=true);
    if($("requestConfirmPanel"))$("requestConfirmPanel").hidden=true;
    if($("requestSuccess"))$("requestSuccess").hidden=true;
    document.querySelectorAll("[data-request-tab]").forEach(button=>button.classList.remove("active"));
    const gate=$("requestNameGate");
    if(gate)gate.hidden=false;
    const bottomTabs=document.querySelector(".request-bottom-tabs");
    if(bottomTabs)bottomTabs.hidden=true;
    const name=requestProfile().name||"";
    if($("requestStartName"))$("requestStartName").value=name;
    setTimeout(()=>$("requestStartName")?.focus(),30);
  }

  function continueFromRequestName(){
    const name=String($("requestStartName")?.value||"").trim();
    if(!name){
      $("requestStartName")?.focus();
      return;
    }
    const profile=requestProfile();
    profile.name=name;
    localStorage.setItem(REQUEST_PROFILE_KEY,JSON.stringify(profile));
    localStorage.setItem("billylee26.requestName",name);
    syncRequesterUi();
    switchRequestTab("songs");
  }

  async function openRequestDialog(){
    if(!requestSessionId()){
      alert("Song requests are only available during an active session.");
      return;
    }

    selectedRequestSongId="";
    requestCategory="all";
    $("requestDialog").showModal();
    populateProfileForm();

    try{
      if(!songs.length)await loadPublicSongs();
      await renderMyRequests();
    }catch(error){
      console.error(error);
    }

    renderRequestCategoryCards();
    renderRequestInfo();
    if(requestProfile().name){
      switchRequestTab("songs");
    }else{
      showRequestNameGate();
    }
  }

  async function continueToSongs(){
    await saveRequestProfile({goToSongs:true});
  }

  function trackedRequestIds(){
    try{return JSON.parse(localStorage.getItem("billylee26.requestIds")||"[]");}
    catch{return[];}
  }
  function saveTrackedRequestIds(ids){
    localStorage.setItem("billylee26.requestIds",JSON.stringify([...new Set(ids)].slice(-250)));
  }
  function clearRequestListeners(){
    requestListeners.forEach(fn=>{try{fn();}catch{}});
    requestListeners=[];
  }

  function statusLabel(status){
    const s=String(status||"active").toLowerCase();
    if(s==="queued")return "ACCEPTED";
    if(s==="playing")return "NOW PLAYING";
    if(["completed","played","finished"].includes(s))return "PLAYED";
    if(["declined","deleted","deletedbyhost","abandoned","left"].includes(s))return "REJECTED";
    if(s==="cancelled")return "CANCELLED";
    return "PENDING";
  }

  function runOrderItemForRequest(requestId){
    return runOrder.find(row=>String(row?.requestId||"")===String(requestId||""))||null;
  }

  function queuePositionForRequest(requestId){
    const item=runOrderItemForRequest(requestId);
    if(!item)return 0;
    const status=String(item.status||"").toLowerCase();
    if(status==="playing")return -1;
    const active=runOrder.filter(row=>{
      const s=String(row?.status||"").toLowerCase();
      return !terminalStatuses.has(s)&&s!=="playing";
    });
    const index=active.findIndex(row=>String(row?.requestId||"")===String(requestId||""));
    return index>=0?index+1:0;
  }

  function requestReason(record,runItem){
    return String(
      record?.reason ||
      runItem?.reason ||
      runItem?.abandonReason ||
      ""
    ).trim();
  }

  function requestCanCancel(status){
    return ["active","pending","queued"].includes(String(status||"").toLowerCase());
  }

  async function renderMyRequests(){
    clearRequestListeners();
    const ids=trackedRequestIds();
    const box=$("myRequests");
    if(!box)return;
    const currentRequestSessionId=requestSessionId();
    if(!currentRequestSessionId){
      box.innerHTML=`<p class="muted">Requests from previous sessions are hidden.</p>`;
      return;
    }
    if(!ids.length){
      box.innerHTML=`<p class="muted">Requests you make in this session will appear here.</p>`;
      return;
    }

    const records=new Map();
    const paint=()=>{
      const current=ids.slice().reverse()
        .map(id=>records.get(id))
        .filter(record=>record&&String(record.sessionId||"")===String(currentRequestSessionId));

      if(!current.length){
        box.innerHTML=`<p class="muted">Requests you make in this session will appear here.</p>`;
        return;
      }

      box.innerHTML=current.map(record=>{
        const id=record.id;
        const runItem=runOrderItemForRequest(id);
        const runStatus=runItem?String(runItem.status||"").toLowerCase():"";
        const effectiveStatus=runStatus||String(record.status||"active").toLowerCase();
        const playing=effectiveStatus==="playing";
        const position=queuePositionForRequest(id);
        const reason=requestReason(record,runItem);
        const note=String(record.note||record.comment||"").trim();
        const queueText=position===-1
          ?"NOW PLAYING"
          :(position>0?`QUEUE #${position}`:(effectiveStatus==="active"?"AWAITING APPROVAL":""));
        const canCancel=requestCanCancel(effectiveStatus);

        return `<article class="my-request${playing?" is-playing":""}" data-my-request-id="${escapeHTML(id)}">
          <div class="my-request-song">
            <strong>${escapeHTML(record.songTitle||"Song")}</strong>
            <small>${escapeHTML(ArtistNames.display(record.songArtist||record.artist||""))}</small>
          </div>
          <div class="my-request-detail">
            ${queueText?`<b>${escapeHTML(queueText)}</b>`:""}
            ${reason?`<span class="request-reason">${escapeHTML(reason)}</span>`:""}
            ${note?`<span class="request-user-note">Note: ${escapeHTML(note)}</span>`:""}
          </div>
          <div class="my-request-state">
            <em class="request-status status-${escapeHTML(effectiveStatus)}">${statusLabel(effectiveStatus)}</em>
            <div class="my-request-actions">
              <button type="button" data-edit-request-note="${escapeHTML(id)}">NOTE</button>
              ${canCancel?`<button type="button" class="cancel-request" data-cancel-request="${escapeHTML(id)}">CANCEL</button>`:""}
            </div>
          </div>
        </article>`;
      }).join("");
    };

    paint();
    ids.forEach(id=>{
      const unsub=db.collection("publicSongRequests").doc(id).onSnapshot(doc=>{
        if(doc.exists)records.set(id,{id,...doc.data()});
        paint();
      },error=>console.warn("Could not watch request",id,error));
      requestListeners.push(unsub);
    });
  }


  function requestTimestampMs(value){
    if(value?.toMillis)return value.toMillis();
    if(value?.toDate)return value.toDate().getTime();
    const n=Number(value);
    if(Number.isFinite(n)&&n>0)return n;
    const parsed=Date.parse(String(value||""));
    return Number.isFinite(parsed)?parsed:0;
  }

  function requestDateLabel(record,withTime=true){
    const ms=requestTimestampMs(record?.createdAt)||requestTimestampMs(record?.requestedAt)||requestTimestampMs(record?.updatedAt);
    if(!ms)return "Date unavailable";
    const options=withTime
      ? {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}
      : {day:"2-digit",month:"short",year:"numeric"};
    return new Date(ms).toLocaleString("en-GB",options);
  }

  function analyticsStatusClass(status){
    const value=String(status||"active").toLowerCase();
    if(["played","completed","finished"].includes(value))return "played";
    if(["declined","deleted","deletedbyhost","abandoned","left","rejected"].includes(value))return "rejected";
    if(value==="cancelled")return "cancelled";
    if(["queued","accepted"].includes(value))return "accepted";
    if(value==="playing")return "playing";
    return "pending";
  }

  function countBy(records,keyFn){
    const counts=new Map();
    records.forEach(record=>{
      const key=String(keyFn(record)||"").trim();
      if(!key)return;
      counts.set(key,(counts.get(key)||0)+1);
    });
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],undefined,{sensitivity:"base"}));
  }

  async function loadRequestHistoryRecords(){
    const ids=trackedRequestIds().slice(-250);
    const records=new Map();
    const chunks=[];
    for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));

    await Promise.all(chunks.map(async chunk=>{
      if(!chunk.length)return;
      try{
        const snap=await db.collection("publicSongRequests")
          .where(firebase.firestore.FieldPath.documentId(),"in",chunk)
          .get();
        snap.docs.forEach(doc=>records.set(doc.id,{id:doc.id,...(doc.data()||{})}));
      }catch(error){
        console.warn("Could not load a request-history batch:",error);
        await Promise.all(chunk.map(async id=>{
          try{
            const doc=await db.collection("publicSongRequests").doc(id).get();
            if(doc.exists)records.set(id,{id,...(doc.data()||{})});
          }catch(_){}
        }));
      }
    }));

    const deviceId=String(localStorage.getItem(REQUEST_DEVICE_ID_KEY)||"").trim();
    if(deviceId){
      try{
        const snap=await db.collection("publicSongRequests")
          .where("requesterDeviceId","==",deviceId)
          .limit(250)
          .get();
        snap.docs.forEach(doc=>records.set(doc.id,{id:doc.id,...(doc.data()||{})}));
      }catch(error){
        console.info("Device-linked history query unavailable; using locally tracked requests.",error?.code||error);
      }
    }

    return [...records.values()].sort((a,b)=>
      requestTimestampMs(b.createdAt||b.requestedAt)-requestTimestampMs(a.createdAt||a.requestedAt)
    );
  }

  async function loadRequestHistorySessions(records){
    const ids=[...new Set(records.map(record=>String(record.sessionId||"").trim()).filter(Boolean))]
      .filter(id=>!id.startsWith("billylee-test-"))
      .slice(0,60);
    const sessions=new Map();
    await Promise.all(ids.map(async id=>{
      try{
        const snap=await db.collection("performanceSessions").doc(id).get();
        if(snap.exists)sessions.set(id,{id,...(snap.data()||{})});
      }catch(_){}
    }));
    return sessions;
  }

  function sessionAnalyticsLabel(id,records,sessions){
    const session=sessions.get(id)||{};
    const name=String(session.name||session.sessionName||session.eventName||session.venue||"").trim();
    if(name)return name;
    if(String(id).startsWith("billylee-test-"))return "Website Test Session";
    const first=records.slice().sort((a,b)=>requestTimestampMs(a.createdAt)-requestTimestampMs(b.createdAt))[0];
    return first?"Session · "+requestDateLabel(first,false):"Session";
  }


  function personalFavouriteSongs(){
    const ids=new Set(favouriteSongIds());
    return songs.filter(song=>ids.has(String(song.id))).slice().sort((a,b)=>
      String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base"})
    );
  }

  function personalFavouritesAnalyticsCard(){
    const favourites=personalFavouriteSongs();
    return '<section class="personal-favourites-card">'+
      '<div class="request-history-section-title"><span>♥</span><strong>MY FAVOURITES</strong></div>'+
      (favourites.length
        ? '<div class="personal-favourite-list">'+favourites.map(song=>
            '<div><span><strong>'+escapeHTML(song.title||"Untitled")+'</strong><small>'+escapeHTML(ArtistNames.display(song.artist||""))+'</small></span><button type="button" data-toggle-favourite="'+escapeHTML(song.id)+'" class="is-favourite" aria-label="Remove '+escapeHTML(song.title||"song")+' from favourites">♥</button></div>'
          ).join("")+'</div>'
        : '<p class="personal-favourites-empty">Mark songs with ♥ in the SONG LIST tab and they will appear here.</p>')+
    '</section>';
  }

  async function toggleFavouriteSong(songId){
    const id=String(songId||"");
    if(!id)return;
    const ids=new Set(favouriteSongIds());
    if(ids.has(id))ids.delete(id);else ids.add(id);
    saveFavouriteSongIds([...ids]);
    renderSongResults();
    renderRequestHistoryAnalytics(currentHistoryRecords,currentHistorySessions);
    const profile=requestProfile();
    if(profile.email){
      try{await syncRecoveryProfile(profile);}catch(error){console.info("Favourite sync unavailable:",error?.code||error);}
    }
  }

  function renderRequestHistoryAnalytics(records,sessions){
    const overview=$("requestHistoryOverview");
    const history=$("requestHistoryHistory");
    const favourites=$("requestHistoryFavourites");
    const sessionsPanel=$("requestHistorySessions");
    if(!overview||!history||!favourites||!sessionsPanel)return;

    if(!records.length){
      const empty='<div class="request-history-empty"><strong>No saved request history yet.</strong><span>Requests made from this device will build your stats here.</span></div>';
      overview.innerHTML=empty;
      history.innerHTML=empty;
      favourites.innerHTML=personalFavouritesAnalyticsCard()+empty;
      sessionsPanel.innerHTML=empty;
      return;
    }

    const played=records.filter(record=>analyticsStatusClass(record.status)==="played").length;
    const cancelled=records.filter(record=>analyticsStatusClass(record.status)==="cancelled").length;
    const rejected=records.filter(record=>analyticsStatusClass(record.status)==="rejected").length;
    const uniqueSongs=new Set(records.map(record=>normaliseSongIdentity(record.songTitle||record.title)).filter(Boolean)).size;
    const uniqueSessions=new Set(records.map(record=>String(record.sessionId||"")).filter(Boolean)).size;
    const songCounts=countBy(records,record=>record.songTitle||record.title||"Untitled");
    const artistCounts=countBy(records,record=>ArtistNames.display(record.songArtist||record.artist||""));
    const latest=records[0];
    const earliest=records[records.length-1];

    overview.innerHTML=
      '<div class="request-history-stat-grid">'+
        '<article><span>TOTAL REQUESTS</span><strong>'+records.length+'</strong></article>'+
        '<article><span>PLAYED</span><strong>'+played+'</strong></article>'+
        '<article><span>UNIQUE SONGS</span><strong>'+uniqueSongs+'</strong></article>'+
        '<article><span>SESSIONS</span><strong>'+uniqueSessions+'</strong></article>'+
      '</div>'+
      '<div class="request-history-highlight-grid">'+
        '<article><span>MOST REQUESTED SONG</span><strong>'+escapeHTML(songCounts[0]?.[0]||"—")+'</strong><small>'+
          (songCounts[0]?(songCounts[0][1]+' request'+(songCounts[0][1]===1?'':'s')):'No requests yet')+
        '</small></article>'+
        '<article><span>MOST REQUESTED ARTIST</span><strong>'+escapeHTML(artistCounts[0]?.[0]||"—")+'</strong><small>'+
          (artistCounts[0]?(artistCounts[0][1]+' request'+(artistCounts[0][1]===1?'':'s')):'No requests yet')+
        '</small></article>'+
      '</div>'+
      '<div class="request-history-summary">'+
        '<div><span>First request</span><strong>'+escapeHTML(requestDateLabel(earliest))+'</strong></div>'+
        '<div><span>Latest request</span><strong>'+escapeHTML(requestDateLabel(latest))+'</strong></div>'+
        '<div><span>Cancelled</span><strong>'+cancelled+'</strong></div>'+
        '<div><span>Rejected / left</span><strong>'+rejected+'</strong></div>'+
      '</div>';

    history.innerHTML=
      '<div class="request-history-list">'+
      records.map(record=>{
        const statusClass=analyticsStatusClass(record.status);
        const note=String(record.note||record.comment||"").trim();
        return '<article class="request-history-row">'+
          '<div class="request-history-row-main">'+
            '<strong>'+escapeHTML(record.songTitle||record.title||"Untitled")+'</strong>'+
            '<span>'+escapeHTML(ArtistNames.display(record.songArtist||record.artist||""))+'</span>'+
            '<small>'+escapeHTML(requestDateLabel(record))+'</small>'+
            (note?'<em>“'+escapeHTML(note)+'”</em>':'')+
          '</div>'+
          '<span class="request-history-status status-'+statusClass+'">'+escapeHTML(statusLabel(record.status))+'</span>'+
        '</article>';
      }).join("")+
      '</div>';

    favourites.innerHTML=
      personalFavouritesAnalyticsCard()+
      '<div class="request-history-favourites-grid">'+
        '<section>'+
          '<div class="request-history-section-title"><span>♫</span><strong>TOP SONGS</strong></div>'+
          '<div class="request-ranking-list">'+
            songCounts.slice(0,12).map(([name,count],index)=>
              '<div><b>'+(index+1)+'</b><span>'+escapeHTML(name)+'</span><strong>'+count+'×</strong></div>'
            ).join("")+
          '</div>'+
        '</section>'+
        '<section>'+
          '<div class="request-history-section-title"><span>♬</span><strong>TOP ARTISTS</strong></div>'+
          '<div class="request-ranking-list">'+
            artistCounts.slice(0,10).map(([name,count],index)=>
              '<div><b>'+(index+1)+'</b><span>'+escapeHTML(name)+'</span><strong>'+count+'×</strong></div>'
            ).join("")+
          '</div>'+
        '</section>'+
      '</div>'+
      '<div class="request-history-fun-stat"><span>REPEAT FAVOURITES</span><strong>'+
        songCounts.filter(([,count])=>count>1).length+
      '</strong><small>songs you have requested more than once</small></div>';

    const bySession=new Map();
    records.forEach(record=>{
      const id=String(record.sessionId||"unknown");
      if(!bySession.has(id))bySession.set(id,[]);
      bySession.get(id).push(record);
    });

    const sessionRows=[...bySession.entries()].sort((a,b)=>{
      const aMs=Math.max(...a[1].map(record=>requestTimestampMs(record.createdAt)||0));
      const bMs=Math.max(...b[1].map(record=>requestTimestampMs(record.createdAt)||0));
      return bMs-aMs;
    });

    sessionsPanel.innerHTML=
      '<div class="request-session-history">'+
      sessionRows.map(([id,list])=>{
        const playedCount=list.filter(record=>analyticsStatusClass(record.status)==="played").length;
        const top=countBy(list,record=>record.songTitle||record.title||"")[0];
        const newest=list.slice().sort((a,b)=>requestTimestampMs(b.createdAt)-requestTimestampMs(a.createdAt))[0];
        return '<article>'+
          '<div><strong>'+escapeHTML(sessionAnalyticsLabel(id,list,sessions))+'</strong><span>'+escapeHTML(requestDateLabel(newest,false))+'</span></div>'+
          '<div class="request-session-numbers"><span><b>'+list.length+'</b> requests</span><span><b>'+playedCount+'</b> played</span></div>'+
          (top?'<small>Most requested here: '+escapeHTML(top[0])+(top[1]>1?' · '+top[1]+'×':'')+'</small>':'')+
        '</article>';
      }).join("")+
      '</div>';
  }

  function switchRequestHistoryTab(tab){
    const target=["overview","history","favourites","sessions"].includes(tab)?tab:"overview";
    document.querySelectorAll("[data-request-history-tab]").forEach(button=>{
      const active=button.dataset.requestHistoryTab===target;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });
    document.querySelectorAll("[data-request-history-panel]").forEach(panel=>{
      panel.hidden=panel.dataset.requestHistoryPanel!==target;
    });
    if(target==="favourites"){
      renderRequestHistoryAnalytics(currentHistoryRecords,currentHistorySessions);
    }
  }

  async function openRequestHistory(){
    const loading=$("requestHistoryLoading");
    if(!loading)return;
    loading.hidden=false;
    loading.textContent="Loading your request history…";
    document.querySelectorAll("[data-request-history-panel]").forEach(panel=>{
      panel.hidden=true;
      panel.innerHTML="";
    });

    try{
      if(!songs.length)await loadPublicSongs();
      const records=await loadRequestHistoryRecords();
      const sessions=await loadRequestHistorySessions(records);
      currentHistoryRecords=records;
      currentHistorySessions=sessions;
      renderRequestHistoryAnalytics(records,sessions);
      loading.hidden=true;
      switchRequestHistoryTab("overview");
    }catch(error){
      console.error("Could not load request history:",error);
      loading.hidden=false;
      loading.textContent="Could not load your request history right now.";
    }
  }

  async function cancelMyRequest(requestId){
    if(!requestId||!trackedRequestIds().includes(requestId))return;
    const confirmed=await showRequestActionConfirm({
      title:"CANCEL REQUEST?",
      message:"Cancel this song request? The host will see that you cancelled it.",
      confirmLabel:"CANCEL REQUEST",
      cancelLabel:"KEEP REQUEST",
      danger:true
    });
    if(!confirmed)return;

    try{
      const requestRef=db.collection("publicSongRequests").doc(requestId);
      await requestRef.set({
        status:"cancelled",
        reason:"Cancelled by requester",
        cancelledAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});

      // If public rules allow it, update the Run Order immediately. Host pages
      // also reconcile cancelled request records, so cancellation remains safe
      // when direct queue writes are intentionally blocked.
      try{
        const runRef=db.collection("karaokeControl").doc("runOrder");
        await db.runTransaction(async tx=>{
          const snap=await tx.get(runRef);
          if(!snap.exists)return;
          const data=snap.data()||{};
          if(String(data.sessionId||"")!==String(activeSessionId||""))return;
          const items=Array.isArray(data.items)?data.items:[];
          if(!items.some(item=>item.requestId===requestId))return;
          tx.set(runRef,{
            items:items.map(item=>item.requestId===requestId
              ? {...item,status:"cancelled",reason:"Cancelled by requester"}
              : item),
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          },{merge:true});
        });
      }catch(error){
        console.info("Run Order cancellation will be reconciled by the host.",error?.code||error);
      }
    }catch(error){
      console.error("Could not cancel request:",error);
      alert("Could not cancel this request. Please try again.");
    }
  }

  async function editMyRequestNote(requestId){
    if(!requestId||!trackedRequestIds().includes(requestId))return;
    const dialog=$("requestNoteDialog");
    const input=$("requestNoteDialogInput");
    const status=$("requestNoteDialogStatus");
    try{
      const snap=await db.collection("publicSongRequests").doc(requestId).get();
      if(!snap.exists)return;
      const current=snap.data()||{};
      editingRequestNoteId=requestId;
      if(input)input.value=String(current.note||current.comment||"");
      if(status)status.textContent="";
      if($("requestNoteDialogSong"))$("requestNoteDialogSong").textContent=`${current.songTitle||"Song"}${current.songArtist||current.artist?` · ${ArtistNames.display(current.songArtist||current.artist||"")}`:""}`;
      if(dialog&&!dialog.open)dialog.showModal();
      setTimeout(()=>input?.focus(),25);
    }catch(error){
      console.error(error);
      alert("Could not open the note editor. Please try again.");
    }
  }

  async function saveMyRequestNote(){
    if(!editingRequestNoteId||!trackedRequestIds().includes(editingRequestNoteId))return;
    const button=$("requestNoteDialogSaveBtn");
    const status=$("requestNoteDialogStatus");
    const note=String($("requestNoteDialogInput")?.value||"").trim().slice(0,240);
    if(button)button.disabled=true;
    if(status)status.textContent="Saving…";
    try{
      await db.collection("publicSongRequests").doc(editingRequestNoteId).set({
        note,
        comment:note,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      if(status)status.textContent="Note saved.";
      setTimeout(()=>{
        if($("requestNoteDialog")?.open)$("requestNoteDialog").close();
        editingRequestNoteId="";
      },220);
    }catch(error){
      console.error(error);
      if(status)status.textContent="Could not save the note. Please try again.";
    }finally{
      if(button)button.disabled=false;
    }
  }

  function closeMyRequestNoteEditor(){
    editingRequestNoteId="";
    if($("requestNoteDialog")?.open)$("requestNoteDialog").close();
  }

  function selectRequestSong(songId){
    const song=songs.find(item=>item.id===songId);
    if(!song)return;
    if(songSessionState(song)!=="available")return;
    if(!requestProfile().name){
      switchRequestTab("profile");
      $("requestProfileStatus").textContent="Save your name before sending a request.";
      return;
    }
    selectedRequestSongId=songId;
    showRequestConfirmation(song);
  }

  async function sendSelectedRequest(){
    const profile=requestProfile();
    const name=profile.name;
    const song=songs.find(item=>item.id===selectedRequestSongId);
    const currentRequestSessionId=requestSessionId();
    if(!name||!song||!currentRequestSessionId)return;

    if(songSessionState(song)!=="available"){
      switchRequestTab("songs");
      $("requestNotice").textContent="That song is already requested, playing, or has already been played in this session.";
      selectedRequestSongId="";
      renderSongResults();
      return;
    }

    const button=$("sendRequestBtn");
    if(button)button.disabled=true;

    try{
      const note=String($("requestNote")?.value||"").trim();
      const requesterEmailHash=profile.email?await requestEmailHash(profile.email):"";
      const ref=await db.collection("publicSongRequests").add({
        listId:publicSetlist?.id||"venue-main-public-song-list",
        publicSetlistId:publicSetlist?.id||"",
        publicSetlistName:publicSetlist?.name||"",
        sessionId:currentRequestSessionId,
        isTestSession:liveRequestTestMode(),
        requestTestMode:liveRequestTestMode(),
        status:"active",
        singerName:name,
        name,
        requesterCountry:profile.country,
        requesterAgeRange:profile.ageRange,
        requesterGender:profile.gender,
        requesterDeviceId:requestDeviceId(),
        requesterEmailHash,
        requesterFavouriteSongIds:favouriteSongIds(),
        note,
        comment:note,
        source:"billylee26",
        songId:song.id,
        songTitle:song.title||"",
        artist:song.artist||"",
        songArtist:song.artist||"",
        year:song.year||"",
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });

      const ids=trackedRequestIds();
      ids.push(ref.id);
      saveTrackedRequestIds(ids);
      selectedRequestSongId="";
      $("requestConfirmPanel").hidden=true;
      document.querySelectorAll("[data-request-panel]").forEach(panel=>panel.hidden=true);
      $("requestSuccess").hidden=false;
      $("requestSuccessText").textContent=`Thank you ${name}! ${song.title||"Your song"} has been sent and is awaiting approval.`;
      await renderMyRequests();
    }catch(error){
      console.error(error);
      alert("Could not send request. Please try again.");
    }finally{
      if(button)button.disabled=false;
    }
  }

  function beginEditRequesterName(){
    switchRequestTab("profile");
    $("singerName")?.focus();
  }

  async function saveRequesterName(){
    await saveRequestProfile({goToSongs:true});
  }

  async function showEventDetails(eventData, options={}){
    const e=eventData||{};
    let venueDoc={};
    if(e.venueId){
      try{
        const snap=await db.collection("venues").doc(e.venueId).get();
        if(snap.exists) venueDoc=snap.data()||{};
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
    if(controlData.active===true && activeSessionId) return showCurrentEvent(options);
  }

  async function showCurrentEvent(options={}){
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
      notes: snapshot.notes || controlData.notes || activeSession?.notes || "",
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
        source:"Billy Lee Website",
        sourceKey:"billylee26",
        type:"Solo",
        performerType:"Solo",
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


  const youtubeVideos=(Array.isArray(window.BILLY_LEE_YOUTUBE_VIDEOS)?window.BILLY_LEE_YOUTUBE_VIDEOS:[])
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
      frame?.contentWindow?.postMessage(JSON.stringify({event:"command",func,args:[]}),"*");
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


  const galleryPhotos=[
    {src:"assets/photos/gallery-billy-01.jpg",alt:"Billy Lee performing live on stage"},
    {src:"assets/photos/gallery-billy-02.jpg",alt:"Billy Lee singing live"},
    {src:"assets/photos/gallery-billy-03.jpg",alt:"Billy Lee live performance"}
  ];
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
    const tab=e.target.closest("[data-request-tab]"); if(tab)switchRequestTab(tab.dataset.requestTab);
    const historyTab=e.target.closest("[data-request-history-tab]"); if(historyTab)switchRequestHistoryTab(historyTab.dataset.requestHistoryTab);
    const category=e.target.closest("[data-song-category]"); if(category)setSongCategory(category.dataset.songCategory);
    const alphaJump=e.target.closest("[data-alpha-jump]");
    if(alphaJump){
      const letter=alphaJump.dataset.alphaJump;
      if(requestCategory===ARTIST_BROWSE_CATEGORY && alphaJump.dataset.alphaTarget==="songResults"){
        jumpToArtistAlphabet(letter);
      }else{
        jumpToAlphabet(alphaJump.dataset.alphaTarget,alphaJump.dataset.alphaAttribute||"data-alpha",letter);
      }
    }
    const favourite=e.target.closest("[data-toggle-favourite]"); if(favourite)void toggleFavouriteSong(favourite.dataset.toggleFavourite);
    const rating=e.target.closest("[data-review-rating]"); if(rating)setReviewRating(Number(rating.dataset.reviewRating||0));
    const cancelRequest=e.target.closest("[data-cancel-request]"); if(cancelRequest)void cancelMyRequest(cancelRequest.dataset.cancelRequest);
    const editRequestNote=e.target.closest("[data-edit-request-note]"); if(editRequestNote)void editMyRequestNote(editRequestNote.dataset.editRequestNote);
    const close=e.target.closest("[data-close]");
    if(close){
      const dialogId=close.dataset.close;
      $(dialogId)?.close();
      if(dialogId==="videoPlayerDialog") closeVideoPlayer();
      if(dialogId==="requestNoteDialog") editingRequestNoteId="";
    }
  });
  $("songSearch").addEventListener("input",renderSongResults);
  $("requestStartContinueBtn").addEventListener("click",continueFromRequestName);
  $("requestStartName").addEventListener("keydown",e=>{if(e.key==="Enter")continueFromRequestName();});
  $("requestNoteDialogSaveBtn").addEventListener("click",saveMyRequestNote);
  $("requestNoteDialogCancelBtn").addEventListener("click",closeMyRequestNoteEditor);
  $("requestActionConfirmOkBtn").addEventListener("click",()=>finishRequestActionConfirm(true));
  $("requestActionConfirmCancelBtn").addEventListener("click",()=>finishRequestActionConfirm(false));
  $("requestActionConfirmDialog").addEventListener("cancel",event=>{event.preventDefault();finishRequestActionConfirm(false);});
  $("requestActionConfirmDialog").addEventListener("close",()=>{if(requestActionConfirmResolve)finishRequestActionConfirm(false);});
  $("requestNoteDialogInput").addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter")saveMyRequestNote();});
  $("continueRequestBtn").addEventListener("click",continueToSongs);
  $("singerName").addEventListener("keydown",e=>{if(e.key==="Enter")continueToSongs();});
  $("editRequesterNameBtn").addEventListener("click",beginEditRequesterName);
  $("forgetRequestProfileBtn").addEventListener("click",forgetRequestProfile);
  $("clearReviewRatingBtn").addEventListener("click",()=>setReviewRating(""));
  $("clearSongCategoryBtn").addEventListener("click",()=>setSongCategory("all"));
  $("backToSongListBtn").addEventListener("click",()=>switchRequestTab("songs"));
  $("sendRequestBtn").addEventListener("click",sendSelectedRequest);
  $("requestAnotherBtn").addEventListener("click",showRequestBrowser);
  $("viewMyRequestsBtn").addEventListener("click",()=>switchRequestTab("requests"));
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
  populateProfileForm();
  syncRequesterUi();
  $("shareBtn").addEventListener("click",async()=>{try{if(navigator.share)await navigator.share({title:document.title,url:location.href});else{await navigator.clipboard.writeText(location.href);alert("Link copied.");}}catch{}});

  window.addEventListener("pagehide",()=>{try{sessionRequestsUnsub?.();}catch{}});
  listenEventTypes(); listenEvents(); listenLiveState(); listenWebsiteRequestSettings(); renderRequestCategoryCards(); renderRequestInfo(); renderLive();
})();
