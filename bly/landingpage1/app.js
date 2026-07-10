/*
  Local edition. Firebase is deliberately disabled so index.html can be opened
  directly in Chrome from disk.

  Future Firebase connection (keep commented while using file://):
  ------------------------------------------------------------------
  // import { initializeApp } from "...firebase-app.js";
  // import { getDatabase, ref, push, set } from "...firebase-database.js";
  // const app = initializeApp(firebaseConfig);
  // const database = getDatabase(app);
  ------------------------------------------------------------------
*/

const songs = [
  ["Sweet Home Alabama","Lynyrd Skynyrd"],
  ["Wonderwall","Oasis"],
  ["Fix You","Coldplay"],
  ["Hallelujah","Leonard Cohen"],
  ["I'm Yours","Jason Mraz"],
  ["Save Tonight","Eagle-Eye Cherry"],
  ["Wish You Were Here","Pink Floyd"],
  ["Losing My Religion","R.E.M."],
  ["Wherever You Will Go","The Calling"],
  ["Summer of '69","Bryan Adams"],
  ["Valerie","The Zutons"],
  ["Paint It Black","The Rolling Stones"],
  ["Sex on Fire","Kings of Leon"],
  ["Rebel Rebel","David Bowie"],
  ["One","U2"]
];

const schedule = [
  {day:"Wednesday",title:"Live Karaoke",venue:"Whyte Harte",location:"Bugibba",time:"9:00 PM – 12:00 AM"},
  {day:"Thursday",title:"Live Music",venue:"Smökehouse",location:"Gżira",time:"8:30 PM – 11:30 PM"},
  {day:"Saturday",title:"Live Music",venue:"Black Gold Saloon",location:"The Strand, Sliema",time:"11:00 PM – 2:00 AM"}
];

const stage = document.querySelector("#design-stage");
const designImage = document.querySelector("#design-image");
const modalLayer = document.querySelector("#modal-layer");
const modalContent = document.querySelector("#modal-content");
const toast = document.querySelector("#toast");

// Always start on the main landing-page artwork.
designImage.src = "assets/mock-main.png";
stage.classList.remove("gigs-open");

function esc(value){
  return String(value || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}

function notify(message){
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2800);
}

function showExactGigs(){
  designImage.src = "assets/mock-gigs.png";
  stage.classList.add("gigs-open");
  window.scrollTo({top:0,behavior:"smooth"});
}

function closeExactGigs(){
  designImage.src = "assets/mock-main.png";
  stage.classList.remove("gigs-open");
}

function openModal(type, options = {}){
  modalContent.innerHTML = template(type, options);
  modalLayer.hidden = false;
  document.body.style.overflow = "hidden";
  modalLayer.querySelector(".modal-close").focus();
}

function closeModal(){
  modalLayer.hidden = true;
  modalContent.innerHTML = "";
  document.body.style.overflow = "";
}

function template(type, options){
  if(type === "request"){
    return `
      <header class="modal-header">
        <p class="eyebrow">Live request</p>
        <h2 id="modal-title">Request a song</h2>
        <p>Choose your song, add an optional dedication, then tip digitally or at the jar.</p>
      </header>
      <form id="request-form" class="form-stack">
        <label>Song
          <input name="songTitle" required maxlength="120" value="${esc(options.song || "")}" placeholder="Enter a song title">
        </label>
        <label>Your name
          <input name="requesterName" maxlength="80" placeholder="Optional">
        </label>
        <label>Dedication or message
          <textarea name="message" rows="3" maxlength="300" placeholder="Optional"></textarea>
        </label>
        <button class="primary" type="submit">Save request locally</button>
        <button class="secondary" type="button" data-open="tips">Digital tip</button>
        <p class="form-note">Local preview mode: requests are stored only in this browser. Firebase remains commented out.</p>
      </form>`;
  }

  if(type === "songs"){
    return `
      <header class="modal-header">
        <p class="eyebrow">Choose your favourite</p>
        <h2 id="modal-title">Full song list</h2>
        <p>Search by song or artist, then select a title to request it.</p>
      </header>
      <label class="search-label">Search
        <input id="song-search" type="search" placeholder="Song or artist">
      </label>
      <div id="full-song-list" class="song-list">${songRows(songs)}</div>`;
  }

  if(type === "tips"){
    return `
      <header class="modal-header">
        <p class="eyebrow">Thank you</p>
        <h2 id="modal-title">Digital tips</h2>
        <p>Your support keeps the live show going.</p>
      </header>
      <div class="amount-grid">
        <button class="amount" data-tip="5">€5</button>
        <button class="amount" data-tip="10">€10</button>
        <button class="amount" data-tip="15">€15</button>
        <button class="amount" data-tip="20">€20</button>
      </div>
      <button class="primary" data-tip="custom">Choose another amount</button>
      <p class="form-note">Replace these actions with your Revolut, PayPal or Stripe links when the site is hosted.</p>`;
  }

  if(type === "connect"){
    return `
      <header class="modal-header">
        <p class="eyebrow">Stay in touch</p>
        <h2 id="modal-title">Follow & connect</h2>
        <p>Gig updates, new videos and behind-the-scenes moments.</p>
      </header>
      <div class="link-list">
        <a href="#">Instagram <span>↗</span></a>
        <a href="#">Facebook <span>↗</span></a>
        <a href="#">TikTok <span>↗</span></a>
        <a href="#">YouTube <span>↗</span></a>
        <a href="mailto:bookings@billylee.mt">Bookings <span>↗</span></a>
      </div>`;
  }

  if(type === "media"){
    return `
      <header class="modal-header">
        <p class="eyebrow">Watch & listen</p>
        <h2 id="modal-title">Live loops and videos</h2>
        <p>Real instruments, layered live.</p>
      </header>
      <div class="media-box">▶</div>
      <p class="form-note">Add your YouTube or Vimeo embed when the site is hosted.</p>`;
  }

  return `
    <header class="modal-header">
      <p class="eyebrow">Navigation</p>
      <h2 id="modal-title">Explore</h2>
    </header>
    <div class="link-list">
      <button data-open="request">Request a song</button>
      <button data-open="songs">Full song list</button>
      <button data-open="gigs">Upcoming gigs</button>
      <button data-open="tips">Digital tips</button>
      <a href="https://roxanna.mt" target="_blank">Roxanna <span>↗</span></a>
    </div>`;
}

function songRows(list){
  return list.map(([title,artist]) => `
    <button class="song-button" data-song="${esc(title)}">
      <strong>${esc(title)}</strong>
      <span>${esc(artist)}</span>
      <i>›</i>
    </button>`).join("");
}

function saveRequest(data){
  const requests = JSON.parse(localStorage.getItem("billyLeeRequests") || "[]");
  requests.push({...data,id:Date.now(),createdAt:new Date().toISOString()});
  localStorage.setItem("billyLeeRequests",JSON.stringify(requests));
}

function downloadCalendar(){
  const codes={Wednesday:"WE",Thursday:"TH",Saturday:"SA"};
  const events=schedule.map((g,i)=>[
    "BEGIN:VEVENT",
    `UID:billylee-${i}@billylee.mt`,
    `SUMMARY:${g.title} — ${g.venue}`,
    `LOCATION:${g.location}`,
    `DESCRIPTION:${g.time}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${codes[g.day]}`,
    "END:VEVENT"
  ].join("\r\n")).join("\r\n");
  const content=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Billy Lee//Gigs//EN\r\n${events}\r\nEND:VCALENDAR`;
  const blob=new Blob([content],{type:"text/calendar"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="billy-lee-weekly-gigs.ics";
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", event => {
  const open=event.target.closest("[data-open]");
  if(open){
    const type=open.dataset.open;
    if(type==="gigs") showExactGigs();
    else openModal(type);
    return;
  }

  const song=event.target.closest("[data-song]");
  if(song){
    openModal("request",{song:song.dataset.song});
    return;
  }

  if(event.target.closest("[data-close]")){ closeModal(); return; }
  if(event.target.closest("[data-close-gigs]")){ closeExactGigs(); return; }
  if(event.target.closest("[data-calendar]")){ downloadCalendar(); return; }

  const tip=event.target.closest("[data-tip]");
  if(tip){ notify("Connect your preferred payment link here."); return; }

  if(event.target.closest("[data-share]")){
    if(navigator.share && !location.href.startsWith("file:")){
      navigator.share({title:"Billy Lee",url:location.href}).catch(()=>{});
    }else{
      notify("Sharing becomes active after the page is hosted.");
    }
  }
});

document.addEventListener("input", event => {
  if(event.target.id !== "song-search") return;
  const q=event.target.value.toLowerCase().trim();
  const filtered=songs.filter(([t,a])=>t.toLowerCase().includes(q)||a.toLowerCase().includes(q));
  document.querySelector("#full-song-list").innerHTML=songRows(filtered);
});

document.addEventListener("submit", event => {
  if(event.target.id !== "request-form") return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.target).entries());
  if(!String(data.songTitle||"").trim()){notify("Please enter a song.");return;}
  saveRequest(data);
  closeModal();
  notify("Request saved locally.");
});

document.addEventListener("keydown", event => {
  if(event.key==="Escape"){
    if(stage.classList.contains("gigs-open")) closeExactGigs();
    else if(!modalLayer.hidden) closeModal();
  }
});

window.addEventListener("pageshow", function () {
  closeExactGigs();
  if (!modalLayer.hidden) closeModal();
});
