(() => {
  "use strict";
  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const reduced=()=>matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const DEFAULTS={
    heroSupportingLine:"Choose a song. Grab the mic. Sing it live with guitar and looping.",getStartedText:"GET STARTED",getStartedColor:"#d92727",
    aboutTitle:"WHAT IS LIVE KARAOKE?",aboutLead:"A live music experience where YOU become the singer.",
    aboutBody1:"Choose from 150+ rock, pop, indie, classics and party anthems, grab the mic and perform with live guitar and looping — no backing tracks.",
    aboutBody2:"We provide the lyrics, up to two microphones and the live accompaniment. Whether you're a first-timer or a confident performer, it's spontaneous, social and designed to get the whole room involved.",
    aboutHighlight:"More than karaoke. A real live performance experience.",aboutBooking:"Perfect for bars, venues, private parties and events.",
    howTitle:"HOW IT WORKS",howSteps:[
      {title:"PICK A SONG",text:"Browse the song list and choose what you want to sing."},{title:"JOIN THE QUEUE",text:"Add yourself to the next singer rotation and wait for your turn."},
      {title:"GRAB THE MIC",text:"When your name is called, step up and take the microphone."},{title:"PERFORM LIVE!",text:"Sing with live guitar, looping and a real crowd."}],
    eventsTitle:"EVENTS",eventsSubtitle:"See where Live Karaoke is happening next and find your next chance to grab the mic and sing live.",
    songListTitle:"SONG LIST ACCESS",songListDescription:"Browse 150+ songs anytime. When Live Karaoke is live, request your song and join the next singer rotation.",songListButtonText:"BROWSE SONGS",
    bookingTitle:"BOOK / ENQUIRE",bookingIntro:"Bring Live Karaoke to your venue, wedding, private party, corporate event or festival — an interactive live-music experience that turns your guests into the singers.",bookingButtonText:"BOOK / ENQUIRE",bookingQuestionsTitle:"BOOKING QUESTIONS",
    bookingCards:[
      {title:"BARS & VENUES",text:"Interactive live music that gives customers a reason to stay longer, get involved, sing and come back."},
      {title:"CORPORATE EVENTS",text:"Break the ice and get the whole room involved with live music, audience participation and plenty of memorable moments."},
      {title:"WEDDINGS & PRIVATE PARTIES",text:"Turn your guests into part of the entertainment with live guitar, looping and song requests throughout the celebration."}]
  };
  const DEFAULT_FAQS=[
    ["What equipment do you provide?","Live Karaoke can provide the live guitar and looping setup, microphones and sound system needed for the performance. Tell us about your venue and existing equipment when enquiring and we’ll confirm the best setup."],
    ["How much space do you need?","The setup is flexible and can work in surprisingly compact spaces. We need a clear performance area, room for singers to step up to the microphones and access to power. Send us your venue details and we can advise on the ideal setup."],
    ["How long is a typical Live Karaoke performance?","The format can be adapted to the event. Tell us your preferred start and finish times and we’ll recommend a performance length, breaks and format that suits the occasion."],
    ["How do song requests and the singer rotation work?","Guests browse the song list and request what they’d like to sing. Rather than using a strict first-come, first-served queue, singers are added to the next available rotation. This gives everyone a fair turn and helps keep the show varied and flowing throughout the event."],
    ["Do singers need experience?","No. First-time singers are just as welcome as experienced performers. Lyrics are provided, the live accompaniment follows the singer, and the atmosphere is designed to be fun rather than intimidating."],
    ["Can guests take part without singing?","Absolutely. Live Karaoke still works as a live music show, so guests can enjoy the performance, support the singers and join in from the audience without ever taking the microphone."],
    ["Can Live Karaoke be booked for private events?","Yes. Live Karaoke works particularly well for private parties, weddings, corporate events, celebrations and other occasions where you want guests to become part of the entertainment."],
    ["How much does Live Karaoke cost?","Pricing depends on the date, location, performance length, event type and equipment required. Send us the details of your event and we’ll provide a clear quote based on the setup you need."],
    ["Can most songs be performed live?","The repertoire includes a wide range of rock, pop, indie, classics and party favourites that work well with live guitar and looping. Not every song suits the format, but there’s plenty to choose from, and special song requests can be discussed in advance."],
    ["Do you travel?","Yes. Live Karaoke is based in Malta and can travel for the right event. International bookings are welcome, with travel, accommodation and logistics included in the quote where required. If you’re planning an event abroad, send us the details and we’ll see what can be arranged."],
    ["How far in advance should we book?","As early as possible is best, particularly for weekends, weddings and larger events. Last-minute enquiries are also welcome whenever availability allows."]
  ].map((x,i)=>({id:`faq-${i+1}`,question:x[0],answer:x[1]}));

  let page=JSON.parse(JSON.stringify(DEFAULTS)),faqs=DEFAULT_FAQS,requested=false,scheduled=false;
  const text=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v};
  const validHex=v=>/^#[0-9a-f]{6}$/i.test(String(v||""))?String(v).toLowerCase():DEFAULTS.getStartedColor;
  function normalise(d={}){
    const s=d&&typeof d==="object"?d:{},steps=Array.isArray(s.howSteps)?s.howSteps:[],cards=Array.isArray(s.bookingCards)?s.bookingCards:[];
    const out={...DEFAULTS,...s,getStartedColor:validHex(s.getStartedColor)};
    out.howSteps=DEFAULTS.howSteps.map((f,i)=>({title:String(steps[i]?.title||f.title),text:String(steps[i]?.text||f.text)}));
    out.bookingCards=DEFAULTS.bookingCards.map((f,i)=>({title:String(cards[i]?.title||f.title),text:String(cards[i]?.text||f.text)}));
    return out;
  }
  function normaliseFaqs(raw){return Array.isArray(raw)&&raw.length?raw.slice(0,30).map((x,i)=>({id:String(x?.id||`faq-${i+1}`),question:String(x?.question||"").trim(),answer:String(x?.answer||"").trim()})).filter(x=>x.question&&x.answer):DEFAULT_FAQS;}

  function ensureInlineStyles(){
    if(document.getElementById("live-karaoke-cta-refinements"))return;
    const style=document.createElement("style");
    style.id="live-karaoke-cta-refinements";
    style.textContent=`
      .lk-inline-booking-cta{margin-top:24px!important;animation:none!important}
      #about .lk-inline-booking-cta{margin-bottom:0!important}
      .booking-faq .lk-booking-faq-cta{display:block;margin:26px auto 4px!important}
      .live-karaoke-event-time-note{margin:13px auto 0!important;color:#ff5b5b!important;font-size:.78rem!important;line-height:1.45!important;font-weight:500!important;letter-spacing:.02em!important;text-align:center!important}
      @media(max-width:760px){.lk-inline-booking-cta{margin-top:20px!important}.live-karaoke-event-time-note{font-size:.73rem!important}}
    `;
    document.head?.appendChild(style);
  }
  function favicons(){
    document.querySelectorAll('link[rel~="icon"][href="favicon.png"]').forEach(n=>n.remove());
    [{rel:"icon",type:"image/png",sizes:"16x16",href:"favicon-16x16.png"},{rel:"icon",type:"image/png",sizes:"32x32",href:"favicon-32x32.png"},{rel:"apple-touch-icon",sizes:"180x180",href:"apple-touch-icon.png"}].forEach(x=>{
      if(document.head?.querySelector(`link[href="${x.href}"]`))return;const n=document.createElement("link");Object.assign(n,x);document.head?.appendChild(n);
    });
  }
  function hero(){
    text(document.querySelector(".public-hero-copy"),page.heroSupportingLine);
    const b=document.querySelector('.hero-content>[data-live-karaoke-get-started="1"],.hero-content>.main-button:not(#heroRequestBtn)'),target=document.querySelector(".live-status-section");if(!b||!target)return;
    b.dataset.liveKaraokeGetStarted="1";b.classList.add("hero-get-started-custom");text(b,page.getStartedText);if(!target.id)target.id="live-karaoke-status";b.setAttribute("href","#live-karaoke-status");b.removeAttribute("onclick");
    b.style.borderColor=page.getStartedColor;b.style.background=`linear-gradient(180deg,${page.getStartedColor}55,${page.getStartedColor}22)`;b.style.boxShadow=`0 0 12px ${page.getStartedColor}55`;
    if(b.dataset.liveKaraokeScrollBound!=="1"){b.dataset.liveKaraokeScrollBound="1";b.addEventListener("click",e=>{e.preventDefault();target.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"});});}
  }
  function about(){const s=document.getElementById("about");if(!s)return;const sig=JSON.stringify([page.aboutTitle,page.aboutLead,page.aboutBody1,page.aboutBody2,page.aboutHighlight,page.aboutBooking]);if(s.dataset.lkSig===sig&&s.querySelector('[data-live-karaoke-booking-cta="about"]'))return;s.dataset.lkSig=sig;s.innerHTML=`<h2>${esc(page.aboutTitle)}</h2><p class="about-lead"><strong>${esc(page.aboutLead)}</strong></p><p>${esc(page.aboutBody1)}</p><p>${esc(page.aboutBody2)}</p><p class="about-highlight"><strong>${esc(page.aboutHighlight)}</strong></p><p class="about-booking">${esc(page.aboutBooking)}</p><button class="main-button lk-inline-booking-cta" type="button" data-live-karaoke-booking-cta="about">BOOK LIVE KARAOKE</button>`;}
  const icons=[`<svg viewBox="0 0 64 64"><path d="M18 12h30v36H18z"/><path d="M25 22h16M25 29h16M25 36h10"/><path d="M43 12v15"/><circle cx="39" cy="29" r="4"/></svg>`,`<svg viewBox="0 0 64 64"><circle cx="20" cy="23" r="7"/><circle cx="44" cy="23" r="7"/><path d="M8 47c1-9 6-14 12-14s11 5 12 14M32 47c1-9 6-14 12-14s11 5 12 14M27 16h10M32 11v10"/></svg>`,`<svg viewBox="0 0 64 64"><rect x="24" y="8" width="16" height="30" rx="8"/><path d="M18 29c0 8 6 14 14 14s14-6 14-14M32 43v10M23 54h18M28 14h8M28 20h8M28 26h8"/></svg>`,`<svg viewBox="0 0 64 64"><path d="M32 7l7.2 14.6L55 23.9 43.5 35l2.7 15.7L32 43.3l-14.2 7.4L20.5 35 9 23.9l15.8-2.3zM14 11l4 4M50 11l-4 4M8 37h6M50 37h6"/></svg>`];
  function how(){const s=document.getElementById("howitworks"),c=s?.querySelector(".instructions-container");text(s?.querySelector("h2"),page.howTitle);if(!c)return;const sig=JSON.stringify(page.howSteps);if(c.dataset.lkSig===sig)return;c.dataset.lkSig=sig;c.innerHTML=`<div class="how-it-works-grid" role="list" aria-label="${esc(page.howTitle)}">${page.howSteps.map((x,i)=>`<article class="how-step"><span class="how-step-number">${i+1}</span><div class="how-step-icon" aria-hidden="true">${icons[i]}</div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join("")}</div>`;}
  function events(){
    const list=document.getElementById("liveKaraokeEventsList"),s=list?.closest("section");
    text(s?.querySelector("h2"),page.eventsTitle);text(s?.querySelector(".events-intro"),page.eventsSubtitle);document.querySelectorAll(".event-subheading").forEach(n=>n.remove());
    document.querySelectorAll(".live-karaoke-event-card h5").forEach(n=>{const next=n.textContent.replace(/\s*\(Malta time\)/gi,"");if(n.textContent!==next)n.textContent=next;});
    if(list&&s){let note=s.querySelector(".live-karaoke-event-time-note");if(!note){note=document.createElement("p");note.className="live-karaoke-event-time-note";list.insertAdjacentElement("afterend",note);}text(note,"* All event times are shown in Malta local time (CET/CEST).");}
  }
  function songList(){const b=document.getElementById("songListBtn"),s=b?.closest("section"),m=document.getElementById("songListAccessMessage");text(s?.querySelector("h2"),page.songListTitle);text(m,page.songListDescription);if(b){b.classList.remove("disabled-button");b.classList.add("main-button","song-list-browse-btn");b.setAttribute("aria-disabled","false");text(b,page.songListButtonText);b.onclick=null;if(b.tagName==="A")b.setAttribute("href","#");}}
  function booking(){const s=document.getElementById("enquire");if(!s)return;text(s.querySelector(":scope>h2"),page.bookingTitle);text(s.querySelector(":scope>p"),page.bookingIntro);text(document.getElementById("liveKaraokeEnquiryOpen"),page.bookingButtonText);[...s.querySelectorAll(".booking-benefits article")].forEach((n,i)=>{if(!page.bookingCards[i])return;text(n.querySelector("h3"),page.bookingCards[i].title);text(n.querySelector("p"),page.bookingCards[i].text);});const box=s.querySelector(".booking-faq"),sig=JSON.stringify([page.bookingQuestionsTitle,faqs]);if(box&&(box.dataset.lkSig!==sig||!box.querySelector('[data-live-karaoke-booking-cta="faq"]'))){box.dataset.lkSig=sig;box.innerHTML=`<h3>${esc(page.bookingQuestionsTitle)}</h3>${faqs.map(x=>`<details><summary>${esc(x.question)}</summary><p>${esc(x.answer)}</p></details>`).join("")}<button class="main-button lk-inline-booking-cta lk-booking-faq-cta" type="button" data-live-karaoke-booking-cta="faq">BOOK NOW</button>`;}}
  function cleanup(){document.querySelectorAll('.social-icons a[href^="mailto:"]').forEach(n=>n.remove());const h=document.getElementById("heroRequestBtn");h?.classList.add("hero-request-green");}
  function popupTheme(){const d=document.getElementById("liveKaraokeRequestFrame")?.contentDocument;if(!d?.head)return;let s=d.getElementById("live-karaoke-icon-theme-fix");if(!s){s=d.createElement("style");s.id="live-karaoke-icon-theme-fix";d.head.appendChild(s);}s.textContent=`#requestDialog .request-history-section-title>span{color:#ff5b5b!important}#requestDialog .request-bottom-tabs button>span{filter:grayscale(1) saturate(0)!important}#requestDialog .song-row:not(.selected) .song-action:not(:disabled):not([data-live-karaoke-browse-only="1"]){color:#57ee84!important;border-color:rgba(57,224,111,.78)!important;background:rgba(9,69,29,.18)!important}`;}
  function openBooking(){const b=document.getElementById("liveKaraokeEnquiryOpen");if(b)b.click();}
  function apply(){ensureInlineStyles();favicons();hero();about();how();events();songList();booking();cleanup();}
  function remote(n=0){if(requested)return;if(!window.firebase?.firestore||!firebase.apps?.length){if(n<80)setTimeout(()=>remote(n+1),100);return;}requested=true;firebase.firestore().collection("karaokeControl").doc("liveKaraokeWebsiteSettings").get().then(doc=>{const d=doc.exists?(doc.data()||{}):{};page=normalise(d.publicPage||{});faqs=normaliseFaqs(d.bookingFaqs);apply();}).catch(e=>console.warn("Live Karaoke website settings unavailable",e));}

  document.addEventListener("pointerdown",e=>{if(e.target.closest?.("#songListBtn"))e.preventDefault();},true);
  document.addEventListener("click",e=>{
    if(e.target.closest?.("[data-live-karaoke-booking-cta]")){e.preventDefault();openBooking();return;}
    if(!e.target.closest?.("#songListBtn"))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();typeof openLiveKaraokeRequestPopup==="function"?openLiveKaraokeRequestPopup():window.__liveKaraokeRequestOpenPending=true;
  },true);
  addEventListener("message",e=>{if(e.origin===location.origin&&e.data?.type==="live-karaoke-request-ready"){popupTheme();requestAnimationFrame(popupTheme);}});
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{apply();remote();},{once:true});else{apply();remote();}
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class","aria-disabled","href"]});
})();
