/* Live Karaoke-specific Website Settings additions. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const select = $("liveKaraokeDefaultSetlist");
  const status = $("liveKaraokeDefaultSetlistStatus");
  const contentStatus = $("liveKaraokePageContentStatus");
  const saveButton = $("saveBillyWebsiteSettingsBtn");
  const resetButton = $("resetWebsiteCategoriesBtn");
  const bookingFaqEditors = $("bookingFaqEditors");
  const addBookingFaqBtn = $("addBookingFaqBtn");
  if (!select || !window.LK?.db || !window.LK?.auth) return;

  const settingsRef = () => LK.db.collection("karaokeControl").doc("liveKaraokeWebsiteSettings");

  const DEFAULT_PUBLIC_PAGE = {
    heroSupportingLine:"Choose a song. Grab the mic. Sing it live with guitar and looping.",
    getStartedText:"GET STARTED",
    getStartedColor:"#d92727",
    aboutTitle:"WHAT IS LIVE KARAOKE?",
    aboutLead:"A live music experience where YOU become the singer.",
    aboutBody1:"Choose from 150+ rock, pop, indie, classics and party anthems, grab the mic and perform with live guitar and looping — no backing tracks.",
    aboutBody2:"We provide the lyrics, up to two microphones and the live accompaniment. Whether you're a first-timer or a confident performer, it's spontaneous, social and designed to get the whole room involved.",
    aboutHighlight:"More than karaoke. A real live performance experience.",
    aboutBooking:"Perfect for bars, venues, private parties and events.",
    howTitle:"HOW IT WORKS",
    howSteps:[
      {title:"PICK A SONG",text:"Browse the song list and choose what you want to sing."},
      {title:"JOIN THE QUEUE",text:"Add yourself to the next singer rotation and wait for your turn."},
      {title:"GRAB THE MIC",text:"When your name is called, step up and take the microphone."},
      {title:"PERFORM LIVE!",text:"Sing with live guitar, looping and a real crowd."}
    ],
    eventsTitle:"EVENTS",
    eventsSubtitle:"See where Live Karaoke is happening next and find your next chance to grab the mic and sing live.",
    songListTitle:"SONG LIST ACCESS",
    songListDescription:"Browse 150+ songs anytime. When Live Karaoke is live, request your song and join the next singer rotation.",
    songListButtonText:"BROWSE SONGS",
    bookingTitle:"BOOK / ENQUIRE",
    bookingIntro:"Bring Live Karaoke to your venue, wedding, private party, corporate event or festival — an interactive live-music experience that turns your guests into the singers.",
    bookingButtonText:"BOOK / ENQUIRE",
    bookingQuestionsTitle:"BOOKING QUESTIONS",
    bookingCards:[
      {title:"BARS & VENUES",text:"Interactive live music that gives customers a reason to stay longer, get involved, sing and come back."},
      {title:"CORPORATE EVENTS",text:"Break the ice and get the whole room involved with live music, audience participation and plenty of memorable moments."},
      {title:"WEDDINGS & PRIVATE PARTIES",text:"Turn your guests into part of the entertainment with live guitar, looping and song requests throughout the celebration."}
    ]
  };

  const DEFAULT_BOOKING_FAQS = [
    {id:"equipment",question:"What equipment do you provide?",answer:"Live Karaoke can provide the live guitar and looping setup, microphones and sound system needed for the performance. Tell us about your venue and existing equipment when enquiring and we’ll confirm the best setup."},
    {id:"space",question:"How much space do you need?",answer:"The setup is flexible and can work in surprisingly compact spaces. We need a clear performance area, room for singers to step up to the microphones and access to power. Send us your venue details and we can advise on the ideal setup."},
    {id:"duration",question:"How long is a typical Live Karaoke performance?",answer:"The format can be adapted to the event. Tell us your preferred start and finish times and we’ll recommend a performance length, breaks and format that suits the occasion."},
    {id:"rotation",question:"How do song requests and the singer rotation work?",answer:"Guests browse the song list and request what they’d like to sing. Rather than using a strict first-come, first-served queue, singers are added to the next available rotation. This gives everyone a fair turn and helps keep the show varied and flowing throughout the event."},
    {id:"experience",question:"Do singers need experience?",answer:"No. First-time singers are just as welcome as experienced performers. Lyrics are provided, the live accompaniment follows the singer, and the atmosphere is designed to be fun rather than intimidating."},
    {id:"nonsingers",question:"Can guests take part without singing?",answer:"Absolutely. Live Karaoke still works as a live music show, so guests can enjoy the performance, support the singers and join in from the audience without ever taking the microphone."},
    {id:"private-events",question:"Can Live Karaoke be booked for private events?",answer:"Yes. Live Karaoke works particularly well for private parties, weddings, corporate events, celebrations and other occasions where you want guests to become part of the entertainment."},
    {id:"cost",question:"How much does Live Karaoke cost?",answer:"Pricing depends on the date, location, performance length, event type and equipment required. Send us the details of your event and we’ll provide a clear quote based on the setup you need."},
    {id:"songs",question:"Can most songs be performed live?",answer:"The repertoire includes a wide range of rock, pop, indie, classics and party favourites that work well with live guitar and looping. Not every song suits the format, but there’s plenty to choose from, and special song requests can be discussed in advance."},
    {id:"travel",question:"Do you travel?",answer:"Yes. Live Karaoke is based in Malta and can travel for the right event. International bookings are welcome, with travel, accommodation and logistics included in the quote where required. If you’re planning an event abroad, send us the details and we’ll see what can be arranged."},
    {id:"advance",question:"How far in advance should we book?",answer:"As early as possible is best, particularly for weekends, weddings and larger events. Last-minute enquiries are also welcome whenever availability allows."}
  ];

  let setlists = [];
  let ready = false;
  let publicPage = structuredClone(DEFAULT_PUBLIC_PAGE);
  let bookingFaqs = DEFAULT_BOOKING_FAQS.map(item => ({...item}));

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  }

  function slug(value, fallback="item") {
    const cleaned = String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    return cleaned || fallback;
  }

  function setStatus(message, error=false) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", !!error);
  }

  function setContentStatus(message, error=false) {
    if (!contentStatus) return;
    contentStatus.textContent = message || "";
    contentStatus.classList.toggle("error", !!error);
  }

  function setlistName(item) {
    return String(item?.name || item?.title || item?.label || item?.id || "Untitled setlist").trim();
  }

  function normaliseHex(value, fallback="#d92727") {
    const v = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
  }

  function normalisePublicPage(data={}) {
    const source = data && typeof data === "object" ? data : {};
    const steps = Array.isArray(source.howSteps) ? source.howSteps : [];
    const cards = Array.isArray(source.bookingCards) ? source.bookingCards : [];
    return {
      heroSupportingLine:String(source.heroSupportingLine || DEFAULT_PUBLIC_PAGE.heroSupportingLine).slice(0,220),
      getStartedText:String(source.getStartedText || DEFAULT_PUBLIC_PAGE.getStartedText).slice(0,60),
      getStartedColor:normaliseHex(source.getStartedColor, DEFAULT_PUBLIC_PAGE.getStartedColor),
      aboutTitle:String(source.aboutTitle || DEFAULT_PUBLIC_PAGE.aboutTitle).slice(0,100),
      aboutLead:String(source.aboutLead || DEFAULT_PUBLIC_PAGE.aboutLead).slice(0,220),
      aboutBody1:String(source.aboutBody1 || DEFAULT_PUBLIC_PAGE.aboutBody1).slice(0,700),
      aboutBody2:String(source.aboutBody2 || DEFAULT_PUBLIC_PAGE.aboutBody2).slice(0,700),
      aboutHighlight:String(source.aboutHighlight || DEFAULT_PUBLIC_PAGE.aboutHighlight).slice(0,220),
      aboutBooking:String(source.aboutBooking || DEFAULT_PUBLIC_PAGE.aboutBooking).slice(0,220),
      howTitle:String(source.howTitle || DEFAULT_PUBLIC_PAGE.howTitle).slice(0,100),
      howSteps:DEFAULT_PUBLIC_PAGE.howSteps.map((fallback,index)=>({
        title:String(steps[index]?.title || fallback.title).slice(0,60),
        text:String(steps[index]?.text || fallback.text).slice(0,300)
      })),
      eventsTitle:String(source.eventsTitle || DEFAULT_PUBLIC_PAGE.eventsTitle).slice(0,100),
      eventsSubtitle:String(source.eventsSubtitle || DEFAULT_PUBLIC_PAGE.eventsSubtitle).slice(0,400),
      songListTitle:String(source.songListTitle || DEFAULT_PUBLIC_PAGE.songListTitle).slice(0,100),
      songListDescription:String(source.songListDescription || DEFAULT_PUBLIC_PAGE.songListDescription).slice(0,500),
      songListButtonText:String(source.songListButtonText || DEFAULT_PUBLIC_PAGE.songListButtonText).slice(0,60),
      bookingTitle:String(source.bookingTitle || DEFAULT_PUBLIC_PAGE.bookingTitle).slice(0,100),
      bookingIntro:String(source.bookingIntro || DEFAULT_PUBLIC_PAGE.bookingIntro).slice(0,600),
      bookingButtonText:String(source.bookingButtonText || DEFAULT_PUBLIC_PAGE.bookingButtonText).slice(0,60),
      bookingQuestionsTitle:String(source.bookingQuestionsTitle || DEFAULT_PUBLIC_PAGE.bookingQuestionsTitle).slice(0,100),
      bookingCards:DEFAULT_PUBLIC_PAGE.bookingCards.map((fallback,index)=>({
        title:String(cards[index]?.title || fallback.title).slice(0,80),
        text:String(cards[index]?.text || fallback.text).slice(0,400)
      }))
    };
  }

  function normaliseBookingFaq(item,index) {
    return {
      id:slug(item?.id || `booking-faq-${index+1}`, `booking-faq-${index+1}`),
      question:String(item?.question || "Question").trim().slice(0,120),
      answer:String(item?.answer || "").trim().slice(0,900)
    };
  }

  function value(id, fallback="") {
    return String($(id)?.value ?? fallback).trim();
  }

  function setValue(id, next) {
    const el = $(id);
    if (el) el.value = next ?? "";
  }

  function renderPublicPage() {
    setValue("lkHeroSupportingLine", publicPage.heroSupportingLine);
    setValue("lkGetStartedText", publicPage.getStartedText);
    setValue("lkGetStartedColor", publicPage.getStartedColor);
    setValue("lkGetStartedColorText", publicPage.getStartedColor);
    setValue("lkAboutTitle", publicPage.aboutTitle);
    setValue("lkAboutLead", publicPage.aboutLead);
    setValue("lkAboutBody1", publicPage.aboutBody1);
    setValue("lkAboutBody2", publicPage.aboutBody2);
    setValue("lkAboutHighlight", publicPage.aboutHighlight);
    setValue("lkAboutBooking", publicPage.aboutBooking);
    setValue("lkHowTitle", publicPage.howTitle);
    publicPage.howSteps.forEach((step,index)=>{
      setValue(`lkHowStep${index+1}Title`, step.title);
      setValue(`lkHowStep${index+1}Text`, step.text);
    });
    setValue("lkEventsTitle", publicPage.eventsTitle);
    setValue("lkEventsSubtitle", publicPage.eventsSubtitle);
    setValue("lkSongListTitle", publicPage.songListTitle);
    setValue("lkSongListDescription", publicPage.songListDescription);
    setValue("lkSongListButtonText", publicPage.songListButtonText);
    setValue("lkBookingTitle", publicPage.bookingTitle);
    setValue("lkBookingIntro", publicPage.bookingIntro);
    setValue("lkBookingButtonText", publicPage.bookingButtonText);
    setValue("lkBookingQuestionsTitle", publicPage.bookingQuestionsTitle);
    publicPage.bookingCards.forEach((card,index)=>{
      setValue(`lkBookingCard${index+1}Title`, card.title);
      setValue(`lkBookingCard${index+1}Text`, card.text);
    });
  }

  function collectPublicPage() {
    const color = normaliseHex(value("lkGetStartedColorText", value("lkGetStartedColor", DEFAULT_PUBLIC_PAGE.getStartedColor)), DEFAULT_PUBLIC_PAGE.getStartedColor);
    return normalisePublicPage({
      heroSupportingLine:value("lkHeroSupportingLine", DEFAULT_PUBLIC_PAGE.heroSupportingLine),
      getStartedText:value("lkGetStartedText", DEFAULT_PUBLIC_PAGE.getStartedText),
      getStartedColor:color,
      aboutTitle:value("lkAboutTitle", DEFAULT_PUBLIC_PAGE.aboutTitle),
      aboutLead:value("lkAboutLead", DEFAULT_PUBLIC_PAGE.aboutLead),
      aboutBody1:value("lkAboutBody1", DEFAULT_PUBLIC_PAGE.aboutBody1),
      aboutBody2:value("lkAboutBody2", DEFAULT_PUBLIC_PAGE.aboutBody2),
      aboutHighlight:value("lkAboutHighlight", DEFAULT_PUBLIC_PAGE.aboutHighlight),
      aboutBooking:value("lkAboutBooking", DEFAULT_PUBLIC_PAGE.aboutBooking),
      howTitle:value("lkHowTitle", DEFAULT_PUBLIC_PAGE.howTitle),
      howSteps:[1,2,3,4].map((n,index)=>({
        title:value(`lkHowStep${n}Title`, DEFAULT_PUBLIC_PAGE.howSteps[index].title),
        text:value(`lkHowStep${n}Text`, DEFAULT_PUBLIC_PAGE.howSteps[index].text)
      })),
      eventsTitle:value("lkEventsTitle", DEFAULT_PUBLIC_PAGE.eventsTitle),
      eventsSubtitle:value("lkEventsSubtitle", DEFAULT_PUBLIC_PAGE.eventsSubtitle),
      songListTitle:value("lkSongListTitle", DEFAULT_PUBLIC_PAGE.songListTitle),
      songListDescription:value("lkSongListDescription", DEFAULT_PUBLIC_PAGE.songListDescription),
      songListButtonText:value("lkSongListButtonText", DEFAULT_PUBLIC_PAGE.songListButtonText),
      bookingTitle:value("lkBookingTitle", DEFAULT_PUBLIC_PAGE.bookingTitle),
      bookingIntro:value("lkBookingIntro", DEFAULT_PUBLIC_PAGE.bookingIntro),
      bookingButtonText:value("lkBookingButtonText", DEFAULT_PUBLIC_PAGE.bookingButtonText),
      bookingQuestionsTitle:value("lkBookingQuestionsTitle", DEFAULT_PUBLIC_PAGE.bookingQuestionsTitle),
      bookingCards:[1,2,3].map((n,index)=>({
        title:value(`lkBookingCard${n}Title`, DEFAULT_PUBLIC_PAGE.bookingCards[index].title),
        text:value(`lkBookingCard${n}Text`, DEFAULT_PUBLIC_PAGE.bookingCards[index].text)
      }))
    });
  }

  function renderBookingFaqs() {
    if (!bookingFaqEditors) return;
    bookingFaqEditors.innerHTML = bookingFaqs.map((faq,index)=>`
      <article class="website-faq-editor" data-booking-faq-editor="${esc(faq.id)}">
        <div class="website-faq-fields">
          <label>Question<input type="text" maxlength="120" data-booking-faq-field="question" data-booking-faq-id="${esc(faq.id)}" value="${esc(faq.question)}"></label>
          <label>Answer<textarea maxlength="900" rows="3" data-booking-faq-field="answer" data-booking-faq-id="${esc(faq.id)}">${esc(faq.answer)}</textarea></label>
        </div>
        <div class="website-faq-actions">
          <button type="button" data-booking-faq-up="${esc(faq.id)}" ${index===0?"disabled":""}>↑ Move up</button>
          <button type="button" data-booking-faq-down="${esc(faq.id)}" ${index===bookingFaqs.length-1?"disabled":""}>↓ Move down</button>
          <button type="button" class="danger" data-booking-faq-delete="${esc(faq.id)}">Delete</button>
        </div>
      </article>
    `).join("") || '<p class="website-song-empty">No booking questions. Add one to begin.</p>';
  }

  function syncBookingFaqInputs() {
    bookingFaqEditors?.querySelectorAll("[data-booking-faq-field]").forEach(input=>{
      const faq = bookingFaqs.find(item => item.id === input.dataset.bookingFaqId);
      if (!faq) return;
      faq[input.dataset.bookingFaqField] = String(input.value || "").trim();
    });
  }

  async function load() {
    setStatus("Loading setlists…");
    setContentStatus("Loading public website content…");
    try {
      const [listSnap, settingsSnap] = await Promise.all([
        LK.db.collection("lyricsSetlists").get(),
        settingsRef().get()
      ]);

      setlists = listSnap.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }))
        .sort((a,b) => setlistName(a).localeCompare(setlistName(b), undefined, {sensitivity:"base"}));

      const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      const selectedId = String(settings.defaultBrowseSetlistId || "").trim();
      publicPage = normalisePublicPage(settings.publicPage || {});
      const rawBookingFaqs = Array.isArray(settings.bookingFaqs) && settings.bookingFaqs.length ? settings.bookingFaqs : DEFAULT_BOOKING_FAQS;
      bookingFaqs = rawBookingFaqs.slice(0,30).map(normaliseBookingFaq);

      select.innerHTML = '<option value="">Use current public song list</option>' + setlists.map(item =>
        `<option value="${esc(item.id)}">${esc(setlistName(item))}</option>`
      ).join("");
      select.value = selectedId;
      renderPublicPage();
      renderBookingFaqs();
      ready = true;
      setStatus(selectedId
        ? `Default browse setlist: ${setlistName(setlists.find(item => item.id === selectedId) || {id:selectedId})}`
        : "When no Live Karaoke session is active, the popup will use the current public song list unless you choose a setlist here.");
      setContentStatus(`${bookingFaqs.length} booking question${bookingFaqs.length===1?"":"s"} loaded · public page content ready.`);
    } catch (error) {
      console.error("Could not load Live Karaoke website settings", error);
      setStatus(error.message || "Could not load setlists.", true);
      setContentStatus(error.message || "Could not load public website content.", true);
    }
  }

  async function saveLiveKaraokeExtras() {
    if (!ready || !LK.auth.currentUser) return;
    syncBookingFaqInputs();
    publicPage = collectPublicPage();
    bookingFaqs = bookingFaqs.map(normaliseBookingFaq).filter(item => item.question && item.answer);
    const id = String(select.value || "").trim();
    const item = setlists.find(row => row.id === id) || null;
    try {
      await settingsRef().set({
        defaultBrowseSetlistId:id,
        defaultBrowseSetlistName:item ? setlistName(item) : "",
        publicPage,
        bookingFaqs,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:LK.auth.currentUser.uid
      }, {merge:true});
      setStatus(id
        ? `Default browse setlist saved: ${setlistName(item)}`
        : "Default browse setlist saved: current public song list.");
      setContentStatus(`Public website content saved · ${bookingFaqs.length} booking question${bookingFaqs.length===1?"":"s"}.`);
    } catch (error) {
      console.error("Could not save Live Karaoke website settings", error);
      setStatus(error.message || "Could not save the default songbook.", true);
      setContentStatus(error.message || "Could not save public website content.", true);
    }
  }

  function resetExtras() {
    select.value = "";
    publicPage = structuredClone(DEFAULT_PUBLIC_PAGE);
    bookingFaqs = DEFAULT_BOOKING_FAQS.map(item => ({...item}));
    renderPublicPage();
    renderBookingFaqs();
    setStatus("Default browse setlist reset locally. Press Save Website Settings to publish it.");
    setContentStatus("Public page content and Booking Questions reset to defaults locally. Press Save Website Settings to publish them.");
  }

  select.addEventListener("change", () => {
    const item = setlists.find(row => row.id === select.value) || null;
    setStatus(item
      ? `Will use ${setlistName(item)} for browsing when no Live Karaoke session is active. Press Save Website Settings.`
      : "Will use the current public song list when no Live Karaoke session is active. Press Save Website Settings.");
  });

  const colorPicker = $("lkGetStartedColor");
  const colorText = $("lkGetStartedColorText");
  colorPicker?.addEventListener("input", () => { if (colorText) colorText.value = colorPicker.value; });
  colorText?.addEventListener("change", () => {
    const next = normaliseHex(colorText.value, publicPage.getStartedColor || DEFAULT_PUBLIC_PAGE.getStartedColor);
    colorText.value = next;
    if (colorPicker) colorPicker.value = next;
  });

  addBookingFaqBtn?.addEventListener("click", () => {
    syncBookingFaqInputs();
    if (bookingFaqs.length >= 30) return;
    const id = `booking-faq-${Date.now()}`;
    bookingFaqs.push({id,question:"New question",answer:""});
    renderBookingFaqs();
    bookingFaqEditors?.querySelector(`[data-booking-faq-id="${CSS.escape(id)}"]`)?.focus();
  });

  bookingFaqEditors?.addEventListener("input", event => {
    const input = event.target.closest?.("[data-booking-faq-field]");
    if (!input) return;
    const faq = bookingFaqs.find(item => item.id === input.dataset.bookingFaqId);
    if (faq) faq[input.dataset.bookingFaqField] = String(input.value || "");
  });

  bookingFaqEditors?.addEventListener("click", event => {
    const deleteBtn = event.target.closest?.("[data-booking-faq-delete]");
    const upBtn = event.target.closest?.("[data-booking-faq-up]");
    const downBtn = event.target.closest?.("[data-booking-faq-down]");
    const id = deleteBtn?.dataset.bookingFaqDelete || upBtn?.dataset.bookingFaqUp || downBtn?.dataset.bookingFaqDown;
    if (!id) return;
    syncBookingFaqInputs();
    const index = bookingFaqs.findIndex(item => item.id === id);
    if (index < 0) return;
    if (deleteBtn) bookingFaqs.splice(index,1);
    else if (upBtn && index > 0) [bookingFaqs[index-1], bookingFaqs[index]] = [bookingFaqs[index], bookingFaqs[index-1]];
    else if (downBtn && index < bookingFaqs.length-1) [bookingFaqs[index+1], bookingFaqs[index]] = [bookingFaqs[index], bookingFaqs[index+1]];
    renderBookingFaqs();
  });

  saveButton?.addEventListener("click", () => {
    // The shared controller saves category/request-popup settings. This merge adds Live Karaoke-only fields.
    setTimeout(() => void saveLiveKaraokeExtras(), 0);
  });

  resetButton?.addEventListener("click", resetExtras);

  LK.auth.onAuthStateChanged(user => {
    if (user && !ready) void load();
  });
})();
