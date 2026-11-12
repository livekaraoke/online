(() => {
  "use strict";
  const isPublicLiveKaraokeSite =
    /\/online\/(?:index\.html)?$/i.test(location.pathname) ||
    (/^(?:www\.)?livekaraoke\.eu$/i.test(location.hostname) && /^\/(?:index\.html)?$/i.test(location.pathname));
  if (!isPublicLiveKaraokeSite) return;

  const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const reduced=()=>matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const clamp=(value,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));
  const DEFAULTS={
    heroSupportingLine:"Choose a song. Grab the mic. Sing it live with guitar and looping.",
    heroTitleFontSize:29,
    heroSupportingFontSize:16,
    getStartedText:"GET STARTED",
    getStartedColor:"#d92727",
    showHero:true,
    showLiveStatus:true,
    showAbout:true,
    showHow:true,
    showEvents:true,
    showReviews:true,
    showSongList:true,
    showBooking:true,
    showCommunity:true,
    showFooter:true,
    aboutTitle:"WHAT IS LIVE KARAOKE?",
    aboutLead:"A live music experience where YOU become the singer.",
    aboutBody1:"Choose from rock, pop, indie, classics and party anthems, grab the mic and perform with live guitar and looping — no backing tracks.",
    aboutBody2:"We provide the lyrics, up to two microphones and the live accompaniment. Whether you're a first-timer or a confident performer, it's spontaneous, social and designed to get the whole room involved.",
    aboutHighlight:"More than karaoke. A real live performance experience.",
    aboutBooking:"",
    howTitle:"HOW IT WORKS",
    howSteps:[
      {title:"PICK A SONG",text:"Browse the song list and choose what you want to sing."},
      {title:"JOIN THE QUEUE",text:"Add yourself to the next singer rotation and wait for your turn."},
      {title:"GRAB THE MIC",text:"When your name is called, step up and take the microphone."},
      {title:"PERFORM LIVE!",text:"Sing with live guitar, looping and a real crowd."}
    ],
    eventsTitle:"EVENTS",
    eventsSubtitle:"See where Live Karaoke is happening next and find your next chance to grab the mic and sing live.",
    reviewsTitle:"REVIEWS",
    reviewsSubtitle:"What singers and guests say about Live Karaoke.",
    songListTitle:"SONG LIST ACCESS",
    songListDescription:"Browse the song list anytime. When Live Karaoke is live, request your song and join the next singer rotation.",
    songListButtonText:"BROWSE SONGS",
    bookingTitle:"BOOK / ENQUIRE",
    bookingIntro:"Bring Live Karaoke to your venue, wedding, private party, corporate event or festival — an interactive live-music experience that turns your guests into the singers.",
    bookingButtonText:"BOOK / ENQUIRE",
    bookingQuestionsTitle:"BOOKING QUESTIONS",
    bookingCards:[
      {title:"BARS & VENUES",text:"Interactive live music that gives customers a reason to stay longer, get involved, sing and come back."},
      {title:"CORPORATE EVENTS",text:"Break the ice and get the whole room involved with live music, audience participation and plenty of memorable moments."},
      {title:"WEDDINGS & PRIVATE PARTIES",text:"Turn your guests into part of the entertainment with live guitar, looping and song requests throughout the celebration."}
    ],
    communityTitle:"JOIN THE COMMUNITY",
    communityDescription:"Follow Live Karaoke for upcoming events, new songs and live-session updates.",
    communitySocialsTitle:"SOCIALS"
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

  let page=JSON.parse(JSON.stringify(DEFAULTS)),faqs=DEFAULT_FAQS,publicReviews=[],requested=false,scheduled=false;
  const text=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v};
  const bookingLine=v=>{const value=String(v??""),prefix="Perfect for ";return value.startsWith(prefix)?`${esc(prefix)}<strong>${esc(value.slice(prefix.length))}</strong>`:esc(value);};
  const validHex=v=>/^#[0-9a-f]{6}$/i.test(String(v||""))?String(v).toLowerCase():DEFAULTS.getStartedColor;
  const bool=(source,key)=>source[key]!==false;

  function normalise(d={}){
    const s=d&&typeof d==="object"?d:{},steps=Array.isArray(s.howSteps)?s.howSteps:[],cards=Array.isArray(s.bookingCards)?s.bookingCards:[];
    const out={...DEFAULTS,...s,getStartedColor:validHex(s.getStartedColor)};
    out.heroTitleFontSize=clamp(s.heroTitleFontSize,18,52,DEFAULTS.heroTitleFontSize);
    out.heroSupportingFontSize=clamp(s.heroSupportingFontSize,12,32,DEFAULTS.heroSupportingFontSize);
    ["showHero","showLiveStatus","showAbout","showHow","showEvents","showReviews","showSongList","showBooking","showCommunity","showFooter"].forEach(key=>out[key]=bool(s,key));
    out.howSteps=DEFAULTS.howSteps.map((f,i)=>({title:String(steps[i]?.title||f.title),text:String(steps[i]?.text||f.text)}));
    out.bookingCards=DEFAULTS.bookingCards.map((f,i)=>({title:String(cards[i]?.title||f.title),text:String(cards[i]?.text||f.text)}));
    out.reviewsTitle=String(s.reviewsTitle||DEFAULTS.reviewsTitle).slice(0,100);
    out.reviewsSubtitle=String(s.reviewsSubtitle||DEFAULTS.reviewsSubtitle).slice(0,400);
    for(const key of ["aboutBody1","songListDescription"])out[key]=String(out[key]||"").replace(/150\+ songs/g,"the song list").replace(/150\+ /g,"");
    return out;
  }
  function normaliseFaqs(raw){return Array.isArray(raw)&&raw.length?raw.slice(0,30).map((x,i)=>({id:String(x?.id||`faq-${i+1}`),question:String(x?.question||"").trim(),answer:String(x?.answer||"").trim()})).filter(x=>x.question&&x.answer):DEFAULT_FAQS;}
  function normaliseReviews(raw){
    if(!Array.isArray(raw))return [];
    return raw.slice(0,24).map((x,i)=>({id:String(x?.id||`review-${i+1}`),name:String(x?.name||"Live Karaoke guest").trim().slice(0,80),country:String(x?.country||"").trim().slice(0,80),rating:Math.max(0,Math.min(5,Number(x?.rating)||0)),review:String(x?.review||"").trim().slice(0,1200)})).filter(x=>x.review);
  }

  function favicons(){
    document.querySelectorAll('link[rel~="icon"][href="favicon.png"]').forEach(n=>n.remove());
    [{rel:"icon",type:"image/png",sizes:"16x16",href:"favicon-16x16.png"},{rel:"icon",type:"image/png",sizes:"32x32",href:"favicon-32x32.png"},{rel:"apple-touch-icon",sizes:"180x180",href:"apple-touch-icon.png"}].forEach(x=>{if(document.head?.querySelector(`link[href="${x.href}"]`))return;const n=document.createElement("link");Object.assign(n,x);document.head?.appendChild(n);});
  }

  function hero(){
    // The two hero actions and approved copy are now authored in index.html.
    // Do not replace either with legacy GET STARTED settings or gradient styles.
  }

  function about(){
    // Preserve approved short copy, and never reinsert the former venue line.
    document.getElementById("about")?.querySelector(".about-booking")?.remove();
  }

  const icons=[`<svg viewBox="0 0 64 64"><path d="M18 12h30v36H18z"/><path d="M25 22h16M25 29h16M25 36h10"/><path d="M43 12v15"/><circle cx="39" cy="29" r="4"/></svg>`,`<svg viewBox="0 0 64 64"><circle cx="20" cy="23" r="7"/><circle cx="44" cy="23" r="7"/><path d="M8 47c1-9 6-14 12-14s11 5 12 14M32 47c1-9 6-14 12-14s11 5 12 14M27 16h10M32 11v10"/></svg>`,`<svg viewBox="0 0 64 64"><rect x="24" y="8" width="16" height="30" rx="8"/><path d="M18 29c0 8 6 14 14 14s14-6 14-14M32 43v10M23 54h18M28 14h8M28 20h8M28 26h8"/></svg>`,`<svg viewBox="0 0 64 64"><path d="M32 7l7.2 14.6L55 23.9 43.5 35l2.7 15.7L32 43.3l-14.2 7.4L20.5 35 9 23.9l15.8-2.3zM14 11l4 4M50 11l-4 4M8 37h6M50 37h6"/></svg>`];
  const bookingIcons=[`<svg viewBox="0 0 64 64" focusable="false"><path d="M25 10a9 9 0 0 1 18 0v17a9 9 0 0 1-18 0z"/><path class="lk-booking-icon-secondary" d="M19 25v2a15 15 0 0 0 30 0v-2M34 42v10M25 53h18M14 16l-4-4M54 16l4-4"/></svg>`,`<svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="18" r="7"/><circle class="lk-booking-icon-secondary" cx="14" cy="25" r="6"/><circle class="lk-booking-icon-secondary" cx="50" cy="25" r="6"/><path d="M20 50c1-10 5-16 12-16s11 6 12 16"/><path class="lk-booking-icon-secondary" d="M4 50c1-9 4-14 10-14 3 0 6 2 8 5M60 50c-1-9-4-14-10-14-3 0-6 2-8 5M20 29l7-4M44 29l-7-4"/></svg>`,`<svg viewBox="0 0 64 64" focusable="false"><path d="m32 11 4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4-9.4-4.9-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5z"/><path class="lk-booking-icon-secondary" d="m12 11 3 3M52 11l-3 3M9 34h5M50 34h5M15 50l4-4M49 50l-4-4"/><circle class="lk-booking-icon-secondary" cx="10" cy="22" r="1.5"/><circle class="lk-booking-icon-secondary" cx="54" cy="22" r="1.5"/></svg>`];
  function how(){
    const section=document.getElementById("howitworks");
    const container=section?.querySelector(".instructions-container.how-it-works-grid");
    if(!container)return;
    text(section.querySelector("h2"),page.howTitle);
    const cards=[...container.children].filter(el=>el.classList.contains("how-step"));
    // Update the approved direct 2x2 cards in place. Never nest a second grid,
    // which previously broke the tablet layout and duplicated the structure.
    if(cards.length!==4)return;
    const sig=JSON.stringify(page.howSteps);
    if(container.dataset.lkSig===sig)return;
    cards.forEach((card,i)=>{
      text(card.querySelector("h3"),page.howSteps[i].title);
      text(card.querySelector("p"),page.howSteps[i].text);
    });
    container.dataset.lkSig=sig;
  }

  function events(){const list=document.getElementById("liveKaraokeEventsList"),s=list?.closest("section");text(s?.querySelector("h2"),page.eventsTitle);text(s?.querySelector(".events-intro"),page.eventsSubtitle);document.querySelectorAll(".event-subheading").forEach(n=>n.remove());document.querySelectorAll(".live-karaoke-event-card h5").forEach(n=>{const next=n.textContent.replace(/\s*\(Malta time\)/gi,"");if(n.textContent!==next)n.textContent=next;});if(list&&s){let note=s.querySelector(".live-karaoke-event-time-note");if(!note){note=document.createElement("p");note.className="live-karaoke-event-time-note";list.insertAdjacentElement("afterend",note);}text(note,"* All event times are shown in Malta local time (CET/CEST).");}}

  function reviews(){
    // Legacy reviews appeared in a second section after EVENTS and included
    // every comment. The modern approved-review display lives under Past Events
    // and owns the two-testimonial/four-rating layout.
    document.getElementById("liveKaraokeReviewsSection")?.remove();
  }

  function songList(){
    // Button text, availability and public request gate are authoritative in
    // public-home.js. Do not race that state with a legacy BROWSE SONGS label.
  }

  function booking(){
    const section=document.getElementById("enquire");
    if(!section)return;
    text(section.querySelector(":scope>h2"),page.bookingTitle);
    text(section.querySelector(":scope>p"),page.bookingIntro);
    text(document.getElementById("liveKaraokeEnquiryOpen"),page.bookingButtonText);
    [...section.querySelectorAll(".booking-benefits article")].forEach((node,i)=>{
      if(!page.bookingCards[i])return;
      let icon=node.querySelector(":scope>.lk-booking-card-icon");
      if(!icon){
        icon=document.createElement("div");
        icon.className="lk-booking-card-icon";
        icon.setAttribute("aria-hidden","true");
        icon.innerHTML=bookingIcons[i]||"";
        node.querySelector("h3")?.before(icon);
      }
      text(node.querySelector("h3"),page.bookingCards[i].title);
      text(node.querySelector("p"),page.bookingCards[i].text);
    });
    const box=section.querySelector(".booking-faq");
    const sig=JSON.stringify([page.bookingQuestionsTitle,faqs]);
    if(!box||box.dataset.lkSig===sig)return;
    const render=items=>items.map(item=>
      `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`
    ).join("");
    const first=faqs.slice(0,5),more=faqs.slice(5);
    box.dataset.lkSig=sig;
    box.innerHTML=`<h3>${esc(page.bookingQuestionsTitle)}</h3>${render(first)}
      ${more.length?`<details class="booking-more-questions"><summary>MORE QUESTIONS</summary><div class="booking-more-questions-content">${render(more)}</div></details>`:""}
      <button class="main-button lk-inline-booking-cta lk-booking-faq-cta" type="button" data-live-karaoke-booking-cta="faq">BOOK NOW</button>`;
  }

  function community(){const socialTitle=document.querySelector(".socials-title"),s=socialTitle?.closest("section");if(!s)return;text(s.querySelector(":scope>h2"),page.communityTitle);const intro=[...s.children].find(n=>n.tagName==="P");text(intro,page.communityDescription);text(socialTitle,page.communitySocialsTitle);}
  function setVisible(el,visible){if(el)el.dataset.lkHidden=visible?"false":"true";}
  function visibility(){setVisible(document.querySelector(".hero"),page.showHero);setVisible(document.querySelector(".live-status-section"),page.showLiveStatus);setVisible(document.getElementById("about"),page.showAbout);setVisible(document.getElementById("howitworks"),page.showHow);setVisible(document.getElementById("liveKaraokeEventsList")?.closest("section"),page.showEvents);setVisible(document.getElementById("publicReviewSection"),page.showReviews);setVisible(document.getElementById("songListBtn")?.closest("section"),page.showSongList);setVisible(document.getElementById("enquire"),page.showBooking);setVisible(document.querySelector(".socials-title")?.closest("section"),page.showCommunity);setVisible(document.querySelector("footer"),page.showFooter);}
  function cleanup(){document.querySelectorAll('.social-icons a[href^="mailto:"]').forEach(n=>n.remove());const h=document.getElementById("heroRequestBtn");h?.classList.add("hero-request-green");}

  function popupTheme(){
    // The modern request launcher applies the complete iframe theme itself;
    // duplicate legacy rating sync and popup click hooks were removed.
  }

  function openBooking(){const b=document.getElementById("liveKaraokeEnquiryOpen");if(b)b.click();}
  function scrollToBooking(){document.getElementById("enquire")?.scrollIntoView({behavior:reduced()?"auto":"smooth",block:"start"});}
  function apply(){favicons();hero();about();how();events();reviews();songList();booking();community();cleanup();visibility();}
  function remote(n=0){if(requested)return;if(!window.LKPublicStore){if(n<80)setTimeout(()=>remote(n+1),100);return;}requested=true;let signature="";LKPublicStore.subscribe(state=>{const d=state.settings||{};const next=JSON.stringify(d);if(next===signature)return;signature=next;page=normalise(d.publicPage||{});faqs=normaliseFaqs(d.bookingFaqs);publicReviews=normaliseReviews(d.publicReviews);apply();});}

  document.addEventListener("click",e=>{const c=e.target.closest?.("[data-live-karaoke-booking-cta]");if(c){e.preventDefault();c.dataset.liveKaraokeBookingCta==='about'?scrollToBooking():openBooking();}});
  // Request popup ready events are handled by live-karaoke-request-popup.js.
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{apply();remote();},{once:true});else{apply();remote();}

})();