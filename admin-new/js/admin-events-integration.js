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

    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"
    ];

    return {
      date: `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]}`,
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
    if (!event?.date) return null;

    const time = event.startTime || "00:00";
    const date = new Date(`${event.date}T${time}:00`);

    return Number.isNaN(date.getTime()) ? null : date;
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
    const contextLabelEl = $("statusVenueContextLabel");

    if (!dateEl || !timeEl || !venueEl || !typeEl || !countdownEl) return;

    const hasActiveSession =
      !!activeSessionControl?.active &&
      !!(activeSessionControl?.sessionId || activeSessionData?.id);

    if (hasActiveSession) {
      if (contextLabelEl) contextLabelEl.textContent = "CURRENT SESSION:";

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
    if (contextLabelEl) contextLabelEl.textContent = "UPCOMING GIG:";

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

    const next = sortedUpcoming().slice(0, 3);

    if (!next.length) {
      box.innerHTML = `
        <button type="button" class="status-next-gig-empty">No upcoming gigs</button>
        <button type="button" class="view-all-gigs-btn" data-scroll-upcoming-gigs>VIEW ALL GIGS</button>
      `;
      return;
    }

    box.innerHTML =
      next.map(event => {
        const start = eventStartDate(event);
        const parts = start
          ? datePartsFromDate(start)
          : { date: event.date || "TBC", time: event.startTime || "TBC" };

        return `
          <button type="button" class="status-next-gig-row"
            data-prefill-session="${esc(event.id)}"
            title="Prefill Performance Session from this event">
            <span class="status-next-gig-when">${esc(parts.date)}<br>${esc(event.startTime || parts.time)}</span>
            <span class="status-next-gig-name">${esc(event.name || "Untitled Event")}</span>
          </button>
        `;
      }).join("") +
      `<button type="button" class="view-all-gigs-btn" data-scroll-upcoming-gigs>VIEW ALL GIGS</button>`;
  }

  function renderDashboardEvents() {
    const list = $("dashboardUpcomingEventsList");
    if (!list) return;

    const allUpcoming = sortedUpcoming();
    const next = allUpcoming.slice(0, 10);

    if ($("dashboardUpcomingEventCount")) {
      $("dashboardUpcomingEventCount").textContent = `(${allUpcoming.length})`;
    }

    if (!next.length) {
      list.innerHTML = `<div class="dashboard-event-empty">No upcoming gigs or events.</div>`;
      return;
    }

    list.innerHTML = next.map(event => `
      <article
        class="dashboard-event-row"
        data-view-upcoming-event="${esc(event.id)}"
        title="Click to view event details">

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

        <button
          type="button"
          class="dashboard-event-prefill-btn"
          data-prefill-session="${esc(event.id)}"
          title="Use this event for Performance Session">＋</button>
      </article>
    `).join("");
  }

  window.LKAdminEvents = window.LKAdminEvents || {};
  window.LKAdminEvents.getUpcomingEvent = function (eventId) {
    return upcomingEvents.find(event => event.id === eventId) || null;
  };
  window.LKAdminEvents.getUpcomingEvents = function () {
    return sortedUpcoming().map(event => ({ ...event }));
  };

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
      renderAllEventSurfaces();
      renderVenueContextStatus();
    }, error => {
      console.warn("Admin upcoming-events dashboard unavailable:", error);
    });

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
      const scrollUpcoming = event.target.closest("[data-scroll-upcoming-gigs]");
      if (scrollUpcoming) {
        event.stopPropagation();
        $("upcomingEventsDashboardPanel")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
        return;
      }

      const target = event.target.closest("[data-prefill-session]");
      if (target) {
        event.stopPropagation();
        prefillSessionFromEvent(target.dataset.prefillSession);
      }
    });

    $("clearSessionEventSuggestionBtn")?.addEventListener("click", () => {
      if ($("sessionEventIdInput")) $("sessionEventIdInput").value = "";
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
})();
