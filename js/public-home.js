(() => {
      "use strict";

      const firebaseConfig = window.LKFirebaseProjects
        ? window.LKFirebaseProjects.getSelectedConfig()
        : window.LK_FIREBASE_CONFIG;

      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      const db = firebase.firestore();

      let upcomingEvents = [];
      let currentSessionControl = {};
      let currentPerformanceSession = {};
      let karaokeState = {};
      let runOrder = { items:[] };
      let publicState = {event:{},error:false};

      function esc(value) {
        return String(value || "")
          .replace(/&/g,"&amp;")
          .replace(/</g,"&lt;")
          .replace(/>/g,"&gt;");
      }

      function isLiveKaraokeType(type) {
        return String(type || "").trim().toLowerCase() === "live karaoke";
      }

      function currentSessionId() {
        return String(
          currentSessionControl.sessionId ||
          currentSessionControl.activeSessionId ||
          ""
        ).trim();
      }

      function activeLiveKaraoke() { return !publicState.error && LKPublicVisibility.sessionVisible(currentSessionControl,currentPerformanceSession,publicState.event); }
      function isOnBreak() { return activeLiveKaraoke() && currentPerformanceSession.breakOpen===true; }

      function eventStillUpcoming(event) {
        if(!LKPublicVisibility.eventVisible(event))return false;
        const eventStatus = String(event?.status || "").toLowerCase();
        const sessionStatus = String(event?.sessionStatus || "").toLowerCase();

        if (["cancelled","canceled","ended","completed","done"].includes(eventStatus)) return false;
        if (["active","live","started","ended","completed","done"].includes(sessionStatus)) return false;

        // An event associated with the currently-active session is already the
        // current gig, so do not show it as "next".
        if (
          event?.activeSessionId ||
          event?.startedSessionId ||
          event?.completedAt ||
          (currentSessionControl.eventId && event.id === currentSessionControl.eventId)
        ) {
          return false;
        }

        const start = LKEventTime.start(event);
        const end = LKEventTime.end(event);
        if (!start) return false;
        if (end && end.getTime() <= Date.now()) return false;
        if (!end && LKEventTime.localDate(start) < LKEventTime.localDate(new Date())) return false;
        return true;
      }

      function eventDate(event) {
        return LKEventTime.start(event);
      }

      // A published Wednesday gig at Whyte Harte is already represented by
      // the weekly residency card; don't repeat it among individual event cards.
      // Use Malta's weekday, not the visitor's browser timezone.
      const residencyWeekdayFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: LKEventTime.zone,
        weekday: "long"
      });
      function isCoveredByWeeklyResidency(event) {
        const venue = String(event?.venue || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
        if (!/^(?:the )?whyte harte(?: bar)?$/.test(venue)) return false;
        const date = LKEventTime.start(event);
        return !!date && residencyWeekdayFormatter.format(date) === "Wednesday";
      }

      function nextLiveKaraokeEvent() {
        return upcomingEvents
          .filter(event => isLiveKaraokeType(event.type))
          .filter(eventStillUpcoming)
          .sort(LKEventTime.compare)[0] || null;
      }

      function formatEvent(event) {
        const date = eventDate(event);
        if (!date) return "Date TBC";

        return `${LKEventTime.day(date)} · ${LKEventTime.hasStartTime(event) ? LKEventTime.time(date) + " (Malta time)" : "Time TBC"}`;
      }

      function countdown(event) {
        const date = eventDate(event);
        if (!date) return "";

        const diff = date.getTime() - Date.now();

        if (diff <= 0) return "Starting now";

        const totalMins = Math.floor(diff / 60000);
        const days = Math.floor(totalMins / 1440);
        const hours = Math.floor((totalMins % 1440) / 60);
        const mins = totalMins % 60;

        if (days) return `${days}d ${hours}h ${mins}m`;
        if (hours) return `${hours}h ${mins}m`;
        return `${Math.max(1,mins)}m`;
      }

      function activeRunItems() { return LKPublicVisibility.runItems(runOrder,activeLiveKaraoke()?currentSessionId():''); }

      function songArtist(item) {
        return String(item?.artist || item?.songArtist || "").trim();
      }

      function renderLivePanel() {
        const hero = document.getElementById("heroLiveNow");
        const venue = document.getElementById("heroLiveVenue");
        const current = document.getElementById("heroCurrentSong");
        const coming = document.getElementById("heroComingUp");

        if (!hero || !venue || !current || !coming) return;

        if (!activeLiveKaraoke()) {
          hero.classList.add("hidden");
          venue.textContent="";current.replaceChildren();coming.replaceChildren();
          return;
        }

        hero.classList.remove("hidden");
        venue.textContent =
          currentSessionControl.venue ||
          currentPerformanceSession.venue ||
          "Live Karaoke";

        const gate=LKPublicVisibility.gate(publicState,Object.fromEntries(new URLSearchParams(location.search)));
        document.getElementById('heroLiveLabel').textContent=isOnBreak()?'ON BREAK':gate.phase==='preparing'?'STARTING':'LIVE NOW';
        document.getElementById('liveNowRequestHint').textContent=gate.open?'':gate.accessRequired?'Use the venue QR code to request.':'Requests closed · browsing available';
        const items = activeRunItems();
        const playing = items.find(item =>
          String(item.status || "").toLowerCase() === "playing"
        ) || null;

        if (isOnBreak()) {
          current.innerHTML = `
            <span>LIVE PERFORMANCE</span>
            <strong class="hero-break-status">☕ CURRENTLY ON BREAK</strong>
            <small>The performance will continue shortly.</small>
          `;
        } else if (playing) {
          current.innerHTML = `
            <span>NOW PLAYING</span>
            <strong>${esc(playing.songTitle || playing.title || "Song")}</strong>
            <small>${esc(songArtist(playing))}</small>
          `;
        } else {
          current.innerHTML = `
            <span>LIVE PERFORMANCE</span>
            <strong>Waiting for the next song</strong>
          `;
        }

        const next = items
          .filter(item => item !== playing && String(item.status||"queued").toLowerCase() !== "playing")
          .slice(0,3);

        coming.innerHTML = next.length
          ? `<span class="coming-label">COMING UP</span>` +
            next.map((item,index) => `
              <div class="coming-song">
                <b>${index + 1}</b>
                <span>
                  <strong>${esc(item.songTitle || item.title || "Song")}</strong>
                  <small>${esc(songArtist(item))}</small>
                </span>
              </div>
            `).join("")
          : `<span class="coming-empty">More songs will appear here as they are added.</span>`;
      }

      function renderUpcomingLiveKaraokeEvents() {
        const container = document.getElementById("liveKaraokeEventsList");
        if (!container) return;

        const upcoming = upcomingEvents
          .filter(event => isLiveKaraokeType(event.type))
          .filter(eventStillUpcoming)
          .sort(LKEventTime.compare);
        // Retain all scheduled gigs for public event metadata and the separate
        // Next Event widget. Filter only the individual cards, before limiting
        // to four so special dates and other venues are not pushed out.
        const events = upcoming
          .filter(event => !isCoveredByWeeklyResidency(event))
          .slice(0,4);

        renderEventSchema(upcoming.slice(0,4));
        if (!events.length) {
          container.replaceChildren();
          container.hidden = true;
          return;
        }

        container.hidden = false;
        container.innerHTML = events.map(event => {
          const date = eventDate(event);
          const day = date ? LKEventTime.day(date).toUpperCase() : "DATE TBC";

          const venue = event.venue || "Venue TBC";
          const address =
            event.address ||
            event.venueLocation ||
            "";

          const mapsQuery = encodeURIComponent(
            [venue,address].filter(Boolean).join(", ")
          );

          return `
            <article class="event-card live-karaoke-event-card">
              <span class="live-event-type">LIVE KARAOKE</span>
              <h3>${esc(venue)}</h3>
              ${address ? `<h4>${esc(address)}</h4>` : ""}
              <p><b>${esc(day)}</b></p>
              <h5>&bull; ${esc(date && LKEventTime.hasStartTime(event) ? LKEventTime.time(date) + " (Malta time)" : "TIME TBC")} &bull;</h5>
              <span class="event-subheading">${esc(event.name || "Live Karaoke")}</span>

              ${
                mapsQuery
                  ? `<a
                      class="maps-btn"
                      target="_blank"
                      rel="noopener"
                      href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}">
                      📍 OPEN IN GOOGLE MAPS
                    </a>`
                  : ""
              }
            </article>
          `;
        }).join("");
      }

      function renderEventSchema(events) {
        let node = document.getElementById("public-event-schema");
        if (!node) {
          node = document.createElement("script");
          node.id = "public-event-schema";
          node.type = "application/ld+json";
          document.head.appendChild(node);
        }
        const url = document.querySelector('link[rel="canonical"]').href;
        const data = events.filter(event => eventDate(event) > new Date() && LKEventTime.hasStartTime(event) && event.venue).map(event => {
          const start = eventDate(event);
          const end = LKEventTime.end(event);
          const item = {
            "@type":"Event", "@id":`${url}#event-${encodeURIComponent(event.id)}`,
            name:event.name || `Live Karaoke at ${event.venue}`,
            startDate:start.toISOString(),
            location:{"@type":"Place",name:event.venue},
            eventStatus:String(event.status || "").toLowerCase() === "postponed" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
            eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode",
            url, image:`${url}img/banner.png`,
            description:"Live Karaoke with real live guitar and looping accompaniment.",
            organizer:{"@id":`${url}#brand`}
          };
          const address = event.address || event.venueLocation;
          if (address) item.location.address = address;
          if (end && end > start) item.endDate = end.toISOString();
          return item;
        });
        node.textContent = JSON.stringify({"@context":"https://schema.org","@graph":data});
      }

      function renderSongAccess() {
        const button = document.getElementById("songListBtn");
        const description = document.getElementById("songListAccessMessage");
        if (!button || !description) return;
        const gate = LKPublicVisibility.gate(publicState,Object.fromEntries(new URLSearchParams(location.search)));
        if (gate.active) {
          button.classList.remove("disabled-button");
          button.classList.add("main-button");
          button.removeAttribute("aria-disabled");
          button.textContent = gate.open ? "REQUEST A SONG" : "BROWSE SONG LIST";
          description.textContent = gate.open
            ? "Requests are open. Browse the song list and choose what you would like to sing."
            : "Browse available songs. Requests may be closed or require the venue QR code.";
        } else {
          button.classList.remove("main-button");
          button.classList.add("disabled-button");
          button.setAttribute("aria-disabled","true");
          button.textContent = "SONG LIST LOCKED";
          description.textContent = "Song access becomes available during an active Live Karaoke session.";
        }
      }

      function renderPublicStatus() {
        const container = document.getElementById("liveStatus");
        if (!container) return;

        const live = activeLiveKaraoke();
        // One public status surface: the full player while live; the existing
        // next-event countdown otherwise. Never show the redundant live strip.
        document.querySelector(".live-status-section")?.classList.toggle("has-live-player",live);
        container.classList.toggle("hidden",live);

        if (live) {
          container.replaceChildren();
        } else {
          const event = nextLiveKaraokeEvent();

          container.innerHTML = event
            ? `
              <div class="live-box next-live-karaoke-box">
                <span class="next-live-label">NEXT LIVE KARAOKE EVENT</span>
                <strong>${esc(event.venue || event.name || "Venue TBC")}</strong>
                <span>${esc(formatEvent(event))}</span>
                <b>${esc(countdown(event))}</b>
              </div>
            `
            : `
              <div class="live-box countdown-line">
                NEXT LIVE KARAOKE EVENT:
                <span>To be announced</span>
              </div>
            `;
        }

        renderLivePanel();
        renderSongAccess();

      }

      LKPublicStore.subscribe(state=>{
        publicState=state;upcomingEvents=state.events;currentSessionControl=state.control;
        currentPerformanceSession=state.session;karaokeState=state.karaoke;runOrder=state.run;
        renderUpcomingLiveKaraokeEvents();renderPublicStatus();
        if(state.error){document.getElementById('liveStatus').textContent='Live updates are temporarily unavailable. You can still browse songs.';}
      });
      LKPublicStore.start(db);

      setInterval(() => {
        renderPublicStatus();
        renderUpcomingLiveKaraokeEvents();
      }, 30000);
    })();
