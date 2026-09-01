(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  if (!db) {
    console.error("admin-events-integration.js: Firestore unavailable.");
    return;
  }

  const DEFAULT_EVENT_TYPES = [
    "Live Karaoke",
    "Roxanna",
    "Solo",
    "Texanna",
    "Other"
  ];

  let venues = [];
  let upcomingEvents = [];
  let eventTypes = [...DEFAULT_EVENT_TYPES];

  let activeSessionControl = null;
  let activeSessionData = null;
  let activeSessionUnsubscribe = null;
  let statusCountdownTimer = null;

  // upcomingEvents is the authoritative gig source.
  // karaoke/state.nextEvent is maintained ONLY as a compatibility mirror
  // for older admin code that still reads it.
  let legacyStateUnsubscribe = null;
  let legacyMirrorWriteInFlight = false;
  let lastMirroredNextEventKey = "";

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isPast(event) {
    if (!event?.date) return false;
    const time = event.endTime || event.startTime || "23:59";
    const date = new Date(`${event.date}T${time}:00`);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  function eventStillUpcoming(event) {
    // An event remains UPCOMING even after its scheduled clock time passes.
    // It is removed only when its associated Performance Session has ended.
    if (!event) return false;
    if (event.status === "Cancelled") return false;
    if (event.sessionStatus === "ended") return false;
    if (event.completedAt) return false;
    return true;
  }

  function sortedUpcoming() {
    return upcomingEvents
      .filter(eventStillUpcoming)
      .sort((a,b) =>
        `${a.date || "9999-12-31"}T${a.startTime || "23:59"}`
          .localeCompare(`${b.date || "9999-12-31"}T${b.startTime || "23:59"}`)
      );
  }

  function formatDate(dateString) {
    if (!dateString) return "TBC";
    const d = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }

  function formatEventLength(event) {
    if (!event.startTime || !event.endTime) return "Length TBC";

    const start = event.startTime.split(":").map(Number);
    const end = event.endTime.split(":").map(Number);
    if (start.length < 2 || end.length < 2) return "Length TBC";

    let mins = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    if (mins < 0) mins += 24 * 60;

    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;

    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
  }

  function datePartsFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return { date: "-- ---", time: "--:--" };
    }

    return {
      date: date
        .toLocaleDateString(undefined, { day: "2-digit", month: "short" })
        .replace(",", "")
        .toUpperCase(),
      time: date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      })
    };
  }

  function firestoreTimestampToDate(value) {
    if (!value) return null;

    if (typeof value.toDate === "function") {
      return value.toDate();
    }

    if (value instanceof Date) return value;

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  function eventStartDate(event) {
    const scheduled = firestoreTimestampToDate(event?.scheduledStartAt);
    if (scheduled) return scheduled;

    if (!event?.date) return null;

    const time = event.startTime || "00:00";
    const date = new Date(`${event.date}T${time}:00`);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function eventEndDate(event) {
    const scheduled = firestoreTimestampToDate(event?.scheduledEndAt);
    if (scheduled) return scheduled;

    if (!event?.date || !event?.endTime) return null;

    const start = eventStartDate(event);
    let end = new Date(`${event.date}T${event.endTime}:00`);

    if (Number.isNaN(end.getTime())) return null;

    // Overnight event.
    if (start && end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }

    return end;
  }

  function legacyNextEventFromUpcoming(event) {
    if (!event) return null;

    const start = eventStartDate(event);
    const end = eventEndDate(event);

    return {
      source: "upcomingEvents",
      eventId: event.id || "",
      title: event.name || "",
      type: event.type || "Other",
      venue: event.venue || "",
      venueLocation: event.address || "",
      start: start ? start.toISOString() : "",
      end: end ? end.toISOString() : "",
      repeatWeekly: false
    };
  }

  function legacyNextEventKey(value) {
    if (!value) return "";
    return [
      value.source || "",
      value.eventId || "",
      value.title || "",
      value.type || "",
      value.venue || "",
      value.venueLocation || "",
      value.start || "",
      value.end || "",
      String(value.repeatWeekly === true)
    ].join("|");
  }

  async function syncLegacyNextEventMirror(force = false) {
    if (legacyMirrorWriteInFlight) return;

    const next = sortedUpcoming()[0] || null;
    const mirror = legacyNextEventFromUpcoming(next);
    const key = legacyNextEventKey(mirror);

    if (!force && key === lastMirroredNextEventKey) return;

    legacyMirrorWriteInFlight = true;

    try {
      const stateRef = db.collection("karaoke").doc("state");

      if (mirror) {
        await stateRef.set({
          nextEvent: mirror,
          nextEventSource: "upcomingEvents",
          nextEventUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        await stateRef.set({
          nextEvent: firebase.firestore.FieldValue.delete(),
          nextEventSource: "upcomingEvents",
          nextEventUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      lastMirroredNextEventKey = key;
    } catch (error) {
      console.warn("Could not sync legacy karaoke/state.nextEvent mirror:", error);
    } finally {
      legacyMirrorWriteInFlight = false;
    }
  }

  function listenForLegacyNextEventDrift() {
    if (legacyStateUnsubscribe) {
      legacyStateUnsubscribe();
      legacyStateUnsubscribe = null;
    }

    legacyStateUnsubscribe = db
      .collection("karaoke")
      .doc("state")
      .onSnapshot(doc => {
        if (legacyMirrorWriteInFlight) return;

        const state = doc.exists ? (doc.data() || {}) : {};
        const expected = legacyNextEventFromUpcoming(sortedUpcoming()[0] || null);

        const actualKey = legacyNextEventKey(state.nextEvent || null);
        const expectedKey = legacyNextEventKey(expected);

        // If old code or old data changes nextEvent back to Whyte Harte (or any
        // other stale event), immediately restore the Upcoming Events version.
        if (
          actualKey !== expectedKey ||
          state.nextEventSource !== "upcomingEvents"
        ) {
          syncLegacyNextEventMirror(true);
        }
      }, error => {
        console.warn("Legacy nextEvent drift listener unavailable:", error);
      });
  }

  function countdownText(target) {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) {
      return "Time TBC";
    }

    const diff = target.getTime() - Date.now();

    if (diff <= 0) {
      return "Starting now";
    }

    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${Math.max(1, minutes)}m`;
  }

  function getActiveSessionStartDate() {
    return (
      firestoreTimestampToDate(activeSessionData?.startedAt) ||
      firestoreTimestampToDate(activeSessionControl?.startedAt) ||
      null
    );
  }

  function getCurrentSessionType() {
    return (
      activeSessionData?.sessionType ||
      activeSessionData?.type ||
      activeSessionControl?.sessionType ||
      activeSessionControl?.type ||
      "Live Karaoke"
    );
  }

  function renderVenueContextStatus() {
    const box = document.querySelector(".status-venue-context-box");
    const dateEl = $("statusVenueDate");
    const timeEl = $("statusVenueTime");
    const venueEl = $("statusVenueLabel");
    const typeEl = $("statusVenueType");
    const countdownEl = $("statusVenueCountdown");

    if (!dateEl || !timeEl || !venueEl || !typeEl || !countdownEl) return;

    const hasActiveSession =
      !!activeSessionControl?.active &&
      !!(activeSessionControl?.sessionId || activeSessionData?.id);

    if (hasActiveSession) {
      const started = getActiveSessionStartDate();
      const parts = datePartsFromDate(started || new Date());

      dateEl.textContent = parts.date;
      timeEl.textContent = parts.time;
      venueEl.textContent =
        activeSessionData?.venue ||
        activeSessionControl?.venue ||
        "Unknown Venue";
      typeEl.textContent = getCurrentSessionType();
      countdownEl.textContent = "● LIVE NOW";

      box?.classList.add("session-active");
      return;
    }

    box?.classList.remove("session-active");

    const next = sortedUpcoming()[0] || null;

    if (!next) {
      dateEl.textContent = "-- ---";
      timeEl.textContent = "--:--";
      venueEl.textContent = "No upcoming gig";
      typeEl.textContent = "—";
      countdownEl.textContent = "No upcoming event";
      return;
    }

    const start = eventStartDate(next);
    const parts = start
      ? datePartsFromDate(start)
      : {
          date: next.date
            ? formatDate(next.date).replace(/^[A-Za-z]{3},?\s*/, "").toUpperCase()
            : "-- ---",
          time: next.startTime || "--:--"
        };

    dateEl.textContent = parts.date;
    timeEl.textContent = next.startTime || parts.time;
    venueEl.textContent = next.venue || "Venue TBC";
    typeEl.textContent = next.type || "Other";
    countdownEl.textContent = countdownText(start);
  }

  function setSystemStatusLiveUi() {
    const label = $("statusLiveLabel");
    const box = document.querySelector(".status-live-box");
    const button = $("liveCircleBtn");

    if (label) {
      label.textContent = "● Live";
      label.classList.remove("offline-status");
      label.classList.add("live-status");
    }

    box?.classList.add("session-forced-live");

    if (button) {
      button.title = "End live";
      if (!button.textContent.trim() || button.textContent.trim() === "▶") {
        button.textContent = "■";
      }
    }
  }

  async function forceSystemLiveForPerformance() {
    try {
      await db.collection("karaoke").doc("state").set({
        isLive: true,
        manualOverride: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      setSystemStatusLiveUi();

      if (typeof window.logAdmin === "function") {
        window.logAdmin("System Status automatically set to LIVE for Performance Session");
      }
    } catch (error) {
      console.error("Performance started, but System Status could not be set LIVE:", error);
    }
  }

  function wrapStartPerformanceForLiveStatus() {
    if (typeof window.startPerformance !== "function") return;
    if (window.startPerformance.__autoLiveWrapped) return;

    const original = window.startPerformance;

    const wrapped = async function (...args) {
      const result = await original.apply(this, args);
      await forceSystemLiveForPerformance();
      return result;
    };

    wrapped.__autoLiveWrapped = true;
    window.startPerformance = wrapped;
  }

  function listenForActiveSessionStatus() {
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      activeSessionControl = doc.exists ? (doc.data() || {}) : null;

      if (activeSessionUnsubscribe) {
        activeSessionUnsubscribe();
        activeSessionUnsubscribe = null;
      }

      const sessionId =
        activeSessionControl?.sessionId ||
        activeSessionControl?.activeSessionId ||
        "";

      if (
        activeSessionControl?.active &&
        sessionId
      ) {
        activeSessionUnsubscribe = db
          .collection("performanceSessions")
          .doc(sessionId)
          .onSnapshot(sessionDoc => {
            activeSessionData = sessionDoc.exists
              ? { id: sessionDoc.id, ...(sessionDoc.data() || {}) }
              : null;

            renderVenueContextStatus();

            // A genuinely active Performance Session should always appear
            // LIVE in the Admin status strip.
            setSystemStatusLiveUi();
          }, error => {
            console.warn("Active Performance Session status unavailable:", error);
            activeSessionData = null;
            renderVenueContextStatus();
          });
      } else {
        activeSessionData = null;
        renderVenueContextStatus();
      }
    }, error => {
      console.warn("Current Session status unavailable:", error);
      activeSessionControl = null;
      activeSessionData = null;
      renderVenueContextStatus();
    });
  }

  function startVenueStatusCountdown() {
    clearInterval(statusCountdownTimer);

    renderVenueContextStatus();

    statusCountdownTimer = setInterval(() => {
      renderVenueContextStatus();
    }, 1000);
  }

  function populateVenueDatalist() {
    const datalist = $("venueOptions");
    if (!datalist) return;

    datalist.innerHTML = venues
      .slice()
      .sort((a,b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity:"base" })
      )
      .map(venue =>
        `<option value="${esc(venue.name || "")}"></option>`
      )
      .join("");
  }

  function populateSessionTypeSelect(preferred = "") {
    const select = $("sessionTypeInput");
    if (!select) return;

    const current = preferred || select.value || "Live Karaoke";

    select.innerHTML = eventTypes
      .map(type => `<option value="${esc(type)}">${esc(type)}</option>`)
      .join("");

    if (eventTypes.includes(current)) {
      select.value = current;
    } else if (eventTypes.includes("Other")) {
      select.value = "Other";
    } else if (eventTypes.length) {
      select.value = eventTypes[0];
    }
  }

  function findVenueByName(name) {
    const target = String(name || "").trim().toLowerCase();
    if (!target) return null;
    return venues.find(v => String(v.name || "").trim().toLowerCase() === target) || null;
  }

  function buildSessionNotes(event) {
    const lines = [];

    if (event.address) lines.push(`Address: ${event.address}`);
    if (event.contactName) lines.push(`Contact: ${event.contactName}${event.contact ? ` • ${event.contact}` : ""}`);
    if (event.startTime || event.endTime) {
      lines.push(`Event Time: ${event.startTime || "TBC"}${event.endTime ? ` – ${event.endTime}` : ""}`);
    }
    if (event.arrivalTime) lines.push(`Arrival / Setup: ${event.arrivalTime}`);
    if (event.notes) lines.push("", event.notes);

    return lines.join("\n");
  }

  function prefillSessionFromEvent(eventId, { scroll = true } = {}) {
    const event = upcomingEvents.find(item => item.id === eventId);
    if (!event) return;

    if ($("sessionEventIdInput")) {
      $("sessionEventIdInput").value = event.id || "";
    }

    // Keep the event link outside the form too. This survives DOM/UI changes
    // and gives the session lifecycle a reliable event ID when START PERFORMANCE
    // is pressed.
    try {
      sessionStorage.setItem("lkSelectedUpcomingEventId", event.id || "");
    } catch {}

    if ($("sessionTitleInput")) {
      $("sessionTitleInput").value =
        event.name ||
        `${event.type || "Performance"}${event.venue ? ` at ${event.venue}` : ""}`;
    }

    if ($("venueInput")) $("venueInput").value = event.venue || "";

    populateSessionTypeSelect(event.type || "");
    if ($("sessionTypeInput") && event.type && eventTypes.includes(event.type)) {
      $("sessionTypeInput").value = event.type;
    }

    if ($("sessionNotesInput")) {
      $("sessionNotesInput").value = buildSessionNotes(event);
      $("sessionNotesInput").dispatchEvent(new Event("input", { bubbles: true }));
    }

    renderSessionSuggestion(event);

    if (typeof window.logAdmin === "function") {
      window.logAdmin(`Session prefilled from upcoming event: ${event.name || event.id}`);
    }

    if (scroll) {
      $("sessionPanel")?.scrollIntoView({ behavior:"smooth", block:"start" });
    }
  }

  window.prefillSessionFromEvent = prefillSessionFromEvent;

  function renderSessionSuggestion(event = null) {
    const panel = $("sessionEventSuggestion");
    const body = $("sessionEventSuggestionBody");
    if (!panel || !body) return;

    if (!event) {
      const next = sortedUpcoming()[0];

      if (!next) {
        panel.classList.remove("has-event");
        body.innerHTML = `<small>No upcoming events available.</small>`;
        return;
      }

      panel.classList.add("has-event");
      body.innerHTML = `
        <button type="button" data-prefill-session="${esc(next.id)}">
          <strong>Use next gig: ${esc(next.name || "Untitled Event")}</strong>
          <span>
            ${esc(formatDate(next.date))}
            ${next.startTime ? ` • ${esc(next.startTime)}` : ""}
            ${next.venue ? ` • ${esc(next.venue)}` : ""}
            ${next.type ? ` • ${esc(next.type)}` : ""}
          </span>
        </button>
      `;
      return;
    }

    panel.classList.add("has-event");
    body.innerHTML = `
      <button type="button" data-prefill-session="${esc(event.id)}">
        <strong>Selected: ${esc(event.name || "Untitled Event")}</strong>
        <span>
          ${esc(formatDate(event.date))}
          ${event.startTime ? ` • ${esc(event.startTime)}` : ""}
          ${event.venue ? ` • ${esc(event.venue)}` : ""}
          ${event.type ? ` • ${esc(event.type)}` : ""}
        </span>
      </button>
    `;
  }

  function renderNextGigsStatus() {
    const box = $("statusNextGigs");
    if (!box) return;

    const next = sortedUpcoming().slice(0, 2);

    if (!next.length) {
      box.innerHTML = `<button type="button" class="status-next-gig-empty">No upcoming gigs</button>`;
      return;
    }

    box.innerHTML = next.map(event => `
      <button type="button" data-prefill-session="${esc(event.id)}"
        title="Prefill Performance Session from this event">
        ${esc(formatDate(event.date))}${event.startTime ? ` ${esc(event.startTime)}` : ""}
        • ${esc(event.name || "Untitled Event")}
      </button>
    `).join("");
  }

  function renderDashboardEvents() {
    const list = $("dashboardUpcomingEventsList");
    if (!list) return;

    const next = sortedUpcoming().slice(0, 6);
    if ($("dashboardUpcomingEventCount")) {
      $("dashboardUpcomingEventCount").textContent = `(${sortedUpcoming().length})`;
    }

    if (!next.length) {
      list.innerHTML = `<div class="dashboard-event-empty">No upcoming gigs or events.</div>`;
      return;
    }

    list.innerHTML = next.map(event => `
      <article class="dashboard-event-row" data-prefill-session="${esc(event.id)}"
        title="Click to use this event for the next Performance Session">
        <div class="dashboard-event-date">${esc(formatDate(event.date))}</div>

        <div class="dashboard-event-main">
          <strong>${esc(event.name || "Untitled Event")}</strong>
          <small>
            ${esc(event.venue || "Venue TBC")}
            ${event.startTime ? ` • ${esc(event.startTime)}` : ""}
            • ${esc(formatEventLength(event))}
          </small>
        </div>

        <div class="dashboard-event-venue">${esc(event.venue || "Venue TBC")}</div>
        <div class="dashboard-event-time">${esc(event.startTime || "Time TBC")}</div>
        <div><span class="dashboard-event-type">${esc(event.type || "Other")}</span></div>
      </article>
    `).join("");
  }

  function renderAllEventSurfaces() {
    renderNextGigsStatus();
    renderDashboardEvents();
    renderSessionSuggestion();
  }

  async function seedEventTypesIfNeeded() {
    const ref = db.collection("karaokeControl").doc("eventTypes");

    try {
      const snap = await ref.get();
      const options = snap.exists && Array.isArray(snap.data()?.options)
        ? snap.data().options.filter(Boolean)
        : [];

      if (!options.length) {
        await ref.set({
          options: DEFAULT_EVENT_TYPES,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.warn("Could not seed event types:", error);
    }
  }

  function startListeners() {
    db.collection("venues").onSnapshot(snapshot => {
      venues = snapshot.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }));
      populateVenueDatalist();
    }, error => {
      console.warn("Admin venue dropdown unavailable:", error);
    });

    db.collection("upcomingEvents").onSnapshot(snapshot => {
      upcomingEvents = snapshot.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }));

      // IMPORTANT:
      // All visible Upcoming Gig UI is rendered from upcomingEvents.
      // The old karaoke/state.nextEvent object is only kept in sync so legacy
      // code cannot overwrite the dashboard with a different/stale venue.
      renderAllEventSurfaces();
      renderVenueContextStatus();
      syncLegacyNextEventMirror();
    }, error => {
      console.warn("Admin upcoming-events dashboard unavailable:", error);
    });

    listenForLegacyNextEventDrift();

    db.collection("karaokeControl").doc("eventTypes").onSnapshot(doc => {
      const options = doc.exists && Array.isArray(doc.data()?.options)
        ? doc.data().options.map(v => String(v || "").trim()).filter(Boolean)
        : [];

      eventTypes = options.length ? [...new Set(options)] : [...DEFAULT_EVENT_TYPES];
      populateSessionTypeSelect();
    }, error => {
      console.warn("Event type options unavailable:", error);
      eventTypes = [...DEFAULT_EVENT_TYPES];
      populateSessionTypeSelect();
    });
  }

  function bindUI() {
    document.addEventListener("click", event => {
      const target = event.target.closest("[data-prefill-session]");
      if (target) {
        prefillSessionFromEvent(target.dataset.prefillSession);
      }
    });

    $("clearSessionEventSuggestionBtn")?.addEventListener("click", () => {
      if ($("sessionEventIdInput")) $("sessionEventIdInput").value = "";
      try { sessionStorage.removeItem("lkSelectedUpcomingEventId"); } catch {}
      if ($("sessionTitleInput")) $("sessionTitleInput").value = "";
      if ($("venueInput")) $("venueInput").value = "";
      if ($("sessionNotesInput")) $("sessionNotesInput").value = "";
      populateSessionTypeSelect("Live Karaoke");
      renderSessionSuggestion();
    });
  }

  async function init() {
    bindUI();
    await seedEventTypesIfNeeded();

    // Existing Admin session code is loaded before this addon.
    // Wrap it so START PERFORMANCE automatically makes System Status LIVE.
    wrapStartPerformanceForLiveStatus();
    setTimeout(wrapStartPerformanceForLiveStatus, 250);
    setTimeout(wrapStartPerformanceForLiveStatus, 1000);

    startListeners();
    listenForActiveSessionStatus();
    startVenueStatusCountdown();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function installActiveRequestsTabletStyles() {
    if (document.getElementById("lkActiveRequestsTabletStyles")) return;

    const style = document.createElement("style");
    style.id = "lkActiveRequestsTabletStyles";
    style.textContent = `
      /* Scoped ONLY to the Admin Active Song Requests card. */
      #requestsPanel {
        min-width: 0;
      }

      #requestsPanel .active-requests-list {
        width: 100%;
        min-width: 0;
        overflow-x: hidden;
      }

      #requestsPanel .active-request-row {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
      }

      /* Original/legacy request row:
         Song/Singer | BPM | Time | Complete | Abandon | Delete */
      #requestsPanel .active-request-row:not(:has(.request-number)):not(:has(.request-index)) {
        display: grid !important;
        grid-template-columns:
          minmax(180px, 1fr)
          58px
          78px
          38px
          38px
          38px !important;
        align-items: center !important;
        gap: 7px !important;
      }

      #requestsPanel .request-main {
        min-width: 0 !important;
      }

      #requestsPanel .request-main strong,
      #requestsPanel .request-main span {
        display: block !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #requestsPanel .request-main strong {
        font-size: 14px !important;
        line-height: 1.2 !important;
      }

      #requestsPanel .request-main span {
        margin-top: 3px !important;
        color: #9a9a9a !important;
        font-size: 10px !important;
      }

      #requestsPanel .request-bpm,
      #requestsPanel .request-time {
        min-width: 0 !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      #requestsPanel .active-request-row > button {
        width: 34px !important;
        min-width: 34px !important;
        height: 34px !important;
        padding: 0 !important;
      }

      /* Newer table/card request renderer, if present. */
      #requestsPanel .active-request-row:has(.request-number),
      #requestsPanel .active-request-row:has(.request-index) {
        display: grid !important;
        grid-template-columns:
          42px
          minmax(165px, 1.35fr)
          minmax(110px, .85fr)
          62px
          88px
          118px !important;
        align-items: center !important;
        gap: 8px !important;
      }

      #requestsPanel .request-number,
      #requestsPanel .request-index {
        justify-self: center !important;
      }

      #requestsPanel .request-actions {
        display: flex !important;
        justify-content: flex-end !important;
        gap: 6px !important;
        flex-wrap: nowrap !important;
      }

      /* Header must follow the same columns instead of wrapping vertically. */
      #requestsPanel .active-request-header,
      #requestsPanel .requests-table-header,
      #requestsPanel .request-list-header {
        display: grid !important;
        grid-template-columns:
          42px
          minmax(165px, 1.35fr)
          minmax(110px, .85fr)
          62px
          88px
          118px !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
      }

      #requestsPanel .active-request-header > *,
      #requestsPanel .requests-table-header > *,
      #requestsPanel .request-list-header > * {
        min-width: 0 !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }

      @media (min-width: 700px) and (max-width: 1180px) {
        #requestsPanel {
          padding-left: 14px !important;
          padding-right: 14px !important;
        }

        #requestsPanel .card-title-row.split {
          gap: 10px !important;
          align-items: center !important;
        }

        #requestsPanel .card-title-row h2 {
          min-width: 0 !important;
          font-size: clamp(20px, 2.4vw, 29px) !important;
          line-height: 1.05 !important;
        }

        #requestsPanel .request-toolbar {
          flex: 0 0 auto !important;
          display: flex !important;
          gap: 7px !important;
          flex-wrap: nowrap !important;
        }

        #requestsPanel .request-toolbar select {
          width: 145px !important;
          min-width: 0 !important;
        }

        #requestsPanel .active-request-row:has(.request-number),
        #requestsPanel .active-request-row:has(.request-index),
        #requestsPanel .active-request-header,
        #requestsPanel .requests-table-header,
        #requestsPanel .request-list-header {
          grid-template-columns:
            38px
            minmax(145px, 1.3fr)
            minmax(90px, .78fr)
            54px
            76px
            108px !important;
          gap: 6px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  installActiveRequestsTabletStyles();


  /* ============================================================
     ACTIVE SONG REQUESTS — RUNTIME TABLET GRID REPAIR
     The request renderer exists in requests.js and can use different class
     names across versions. Instead of guessing those names, identify the
     actual header and request rows after they are rendered, tag them, and
     apply one consistent six-column layout.
     ============================================================ */

  function installActiveRequestsRuntimeGridFix() {
    const panel = document.getElementById("requestsPanel");
    const box = document.getElementById("activeRequestsList");

    if (!panel || !box) return;

    if (!document.getElementById("lkActiveRequestRuntimeGridCss")) {
      const style = document.createElement("style");
      style.id = "lkActiveRequestRuntimeGridCss";
      style.textContent = `
        #requestsPanel {
          min-width: 0 !important;
        }

        #requestsPanel #activeRequestsList {
          width: 100% !important;
          min-width: 0 !important;
          overflow-x: hidden !important;
        }

        #requestsPanel .lk-request-grid-header,
        #requestsPanel .lk-request-grid-row {
          box-sizing: border-box !important;
          width: 100% !important;
          min-width: 0 !important;
          display: grid !important;
          grid-template-columns:
            46px
            minmax(170px, 1.35fr)
            minmax(120px, .82fr)
            62px
            98px
            126px !important;
          align-items: center !important;
          column-gap: 10px !important;
        }

        #requestsPanel .lk-request-grid-header {
          min-height: 48px !important;
          padding: 9px 12px !important;
        }

        #requestsPanel .lk-request-grid-row {
          min-height: 64px !important;
          padding: 9px 12px !important;
        }

        #requestsPanel .lk-request-grid-header > *,
        #requestsPanel .lk-request-grid-row > * {
          min-width: 0 !important;
          margin: 0 !important;
        }

        #requestsPanel .lk-request-grid-header > * {
          display: block !important;
          overflow: hidden !important;
          color: #a9a9a9 !important;
          font-size: 10px !important;
          font-weight: 900 !important;
          line-height: 1.15 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
        }

        #requestsPanel .lk-request-grid-row > *:not(.request-actions):not(.lk-request-actions) {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        #requestsPanel .lk-request-grid-row strong {
          overflow: hidden !important;
          font-size: 14px !important;
          line-height: 1.15 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
        }

        #requestsPanel .lk-request-grid-row span,
        #requestsPanel .lk-request-grid-row small {
          overflow: hidden !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
        }

        #requestsPanel .lk-request-actions {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 6px !important;
          flex-wrap: nowrap !important;
          overflow: visible !important;
        }

        #requestsPanel .lk-request-actions button {
          display: inline-grid !important;
          place-items: center !important;
          flex: 0 0 34px !important;
          width: 34px !important;
          min-width: 34px !important;
          height: 34px !important;
          min-height: 34px !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        @media (min-width: 700px) and (max-width: 1180px) {
          #requestsPanel .lk-request-grid-header,
          #requestsPanel .lk-request-grid-row {
            grid-template-columns:
              42px
              minmax(145px, 1.28fr)
              minmax(95px, .76fr)
              50px
              82px
              116px !important;
            column-gap: 7px !important;
          }

          #requestsPanel .lk-request-grid-header {
            min-height: 44px !important;
            padding: 8px 10px !important;
          }

          #requestsPanel .lk-request-grid-row {
            min-height: 60px !important;
            padding: 8px 10px !important;
          }

          #requestsPanel .lk-request-actions {
            gap: 5px !important;
          }

          #requestsPanel .lk-request-actions button {
            flex-basis: 32px !important;
            width: 32px !important;
            min-width: 32px !important;
            height: 32px !important;
            min-height: 32px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const cleanText = el =>
      String(el?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    const labels = ["#", "SONG", "REQUESTED BY", "BPM", "TIME", "ACTIONS"];

    function nearestCommonHeader() {
      const all = Array.from(box.querySelectorAll("*"));

      const labelNodes = labels.map(label =>
        all.find(el => cleanText(el) === label)
      );

      if (labelNodes.some(node => !node)) return null;

      let candidate = labelNodes[0];

      while (candidate && candidate !== box) {
        if (labelNodes.every(node => candidate.contains(node))) {
          // Prefer the smallest common ancestor that visually represents
          // the header rather than the entire list.
          const txt = cleanText(candidate);
          if (labels.every(label => txt.includes(label))) return candidate;
        }
        candidate = candidate.parentElement;
      }

      return null;
    }

    function tagRequestRowFromButton(button) {
      let row = button.parentElement;

      while (row && row !== box) {
        const buttons = row.querySelectorAll("button");
        const txt = cleanText(row);

        // A live request row contains the action controls and song/singer data.
        if (
          buttons.length >= 3 &&
          (
            txt.includes("★") ||
            txt.includes("ABANDON") ||
            Array.from(buttons).some(btn =>
              /complete|abandon|delete/i.test(
                `${btn.title || ""} ${btn.getAttribute("aria-label") || ""}`
              )
            )
          )
        ) {
          row.classList.add("lk-request-grid-row");

          // The button wrapper is the last logical grid cell.
          let actionCell = button.parentElement;
          if (actionCell !== row) {
            actionCell.classList.add("lk-request-actions");
          } else {
            // Older renderer places buttons directly in the row.
            // Wrap only the final action buttons so they occupy one grid cell.
            const actionButtons = Array.from(row.children).filter(child =>
              child.tagName === "BUTTON"
            );

            if (actionButtons.length >= 3) {
              const actionWrap = document.createElement("div");
              actionWrap.className = "lk-request-actions";

              actionButtons[0].before(actionWrap);
              actionButtons.forEach(btn => actionWrap.appendChild(btn));
            }
          }

          return row;
        }

        row = row.parentElement;
      }

      return null;
    }

    function normalise() {
      const header = nearestCommonHeader();

      if (header && header !== box) {
        header.classList.add("lk-request-grid-header");

        // If the six labels are inside one unnecessary wrapper per label,
        // leave those wrappers intact; CSS grids the header's direct cells.
      }

      const actionButtons = Array.from(
        box.querySelectorAll(
          'button[title*="Completed" i], button[title*="Abandoned" i], button[title*="Delete" i], ' +
          'button[aria-label*="complete" i], button[aria-label*="abandon" i], button[aria-label*="delete" i]'
        )
      );

      actionButtons.forEach(tagRequestRowFromButton);

      // Fallback for the current newer renderer: rows may have a three-button
      // action block but no titles on the buttons.
      Array.from(box.querySelectorAll("div")).forEach(el => {
        if (el.classList.contains("lk-request-grid-row")) return;

        const directButtons = Array.from(el.children).filter(child =>
          child.tagName === "BUTTON"
        );

        if (directButtons.length >= 3) {
          tagRequestRowFromButton(directButtons[0]);
        }
      });
    }

    normalise();

    if (box.dataset.lkRequestGridObserver !== "1") {
      box.dataset.lkRequestGridObserver = "1";

      const observer = new MutationObserver(() => {
        requestAnimationFrame(normalise);
      });

      observer.observe(box, {
        childList: true,
        subtree: true
      });
    }
  }

  // requests.js may render after this integration file, so run immediately,
  // again after the page settles, and keep the MutationObserver attached.
  installActiveRequestsRuntimeGridFix();
  setTimeout(installActiveRequestsRuntimeGridFix, 250);
  setTimeout(installActiveRequestsRuntimeGridFix, 1000);

})();
