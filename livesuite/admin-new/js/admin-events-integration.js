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

  const DEFAULT_EVENT_TYPE_COLORS = {
    "Live Karaoke": "#36a9e1",
    "Roxanna": "#d96ce0",
    "Solo": "#53c985",
    "Texanna": "#f08a45",
    "Other": "#a5adb3"
  };

  let venues = [];
  let upcomingEvents = [];
  let eventTypes = [...DEFAULT_EVENT_TYPES];
  let eventTypeColors = { ...DEFAULT_EVENT_TYPE_COLORS };

  let activeSessionControl = null;
  let activeSessionData = null;
  let activeSessionUnsubscribe = null;
  let statusCountdownTimer = null;
  let lastActiveSessionForCompletion = null;

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

  function typeColor(type) {
    return eventTypeColors[type] || DEFAULT_EVENT_TYPE_COLORS[type] || "#8ea3ad";
  }

  function hexToRgba(hex, alpha = 0.14) {
    const clean = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(142,163,173,${alpha})`;
    const r = parseInt(clean.slice(0,2),16);
    const g = parseInt(clean.slice(2,4),16);
    const b = parseInt(clean.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function selectedActiveEventId() {
    return (
      activeSessionData?.eventId ||
      activeSessionControl?.eventId ||
      ""
    );
  }

  function upcomingExcludingActive() {
    const activeId = selectedActiveEventId();
    return sortedUpcoming().filter(event => !activeId || event.id !== activeId);
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
    const eventStatus = String(event.status || "").toLowerCase();
    const sessionStatus = String(event.sessionStatus || "").toLowerCase();
    if (["cancelled","canceled","ended","completed","done"].includes(eventStatus)) return false;
    if (["ended","completed","done"].includes(sessionStatus)) return false;
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

  function lateDurationText(milliseconds) {
    const totalMinutes = Math.max(1, Math.floor(Math.abs(milliseconds) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (!hours) return `${totalMinutes}min${totalMinutes === 1 ? "" : "s"} late`;
    if (!minutes) return `${hours}hr${hours === 1 ? "" : "s"} late`;
    return `${hours}hr${hours === 1 ? "" : "s"} ${minutes}mins late`;
  }

  function countdownText(target) {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) {
      return { text:"Time TBC", late:false };
    }

    const diff = target.getTime() - Date.now();

    if (diff <= 0) {
      return {
        text: `Starting Now (${lateDurationText(diff)})`,
        late: true
      };
    }

    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return { text:`${days}d ${hours}h ${minutes}m`, late:false };
    if (hours > 0) return { text:`${hours}h ${minutes}m`, late:false };
    return { text:`${Math.max(1, minutes)}m`, late:false };
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

  function renderSystemSessionStatus() {
    const label = $("statusLiveLabel");
    const box = document.querySelector(".status-live-box");
    const meta = $("statusLiveSessionMeta");
    const venue = $("statusLiveVenue");
    const started = $("statusLiveStarted");

    const hasActiveSession =
      !!activeSessionControl?.active &&
      !!(activeSessionControl?.sessionId || activeSessionData?.id);

    if (!hasActiveSession) {
      meta?.classList.add("hidden");
      box?.classList.remove("session-forced-live");
      return;
    }

    const actualStart = getActiveSessionStartDate();

    if (label) {
      label.textContent = "● LIVE NOW!";
      label.className = "live-now-status";
    }

    if (venue) {
      venue.textContent =
        activeSessionData?.venue ||
        activeSessionControl?.venue ||
        "Unknown Venue";
    }

    if (started) {
      started.textContent = `Started: ${
        actualStart
          ? actualStart.toLocaleTimeString(undefined, {
              hour:"2-digit",
              minute:"2-digit",
              hour12:false
            })
          : "--:--"
      }`;
    }

    meta?.classList.remove("hidden");
    box?.classList.add("session-forced-live");
  }

  function renderVenueContextStatus() {
    const box = document.querySelector(".status-venue-context-box");
    const contextLabel = $("statusVenueContextLabel");
    const dateEl = $("statusVenueDate");
    const timeEl = $("statusVenueTime");
    const venueEl = $("statusVenueLabel");
    const typeEl = $("statusVenueType");
    const countdownEl = $("statusVenueCountdown");

    if (!dateEl || !timeEl || !venueEl || !typeEl || !countdownEl) return;

    renderSystemSessionStatus();

    // Once a session starts, its linked event stops being the "Upcoming Gig".
    // This box immediately advances to the next event.
    const next = upcomingExcludingActive()[0] || null;

    if (!next) {
      contextLabel && (contextLabel.textContent = "UPCOMING GIG:");
      dateEl.textContent = "-- ---";
      timeEl.textContent = "--:--";
      venueEl.textContent = "No upcoming gig";
      typeEl.textContent = "—";
      typeEl.removeAttribute("style");
      countdownEl.textContent = "No upcoming event";
      countdownEl.classList.remove("is-late");
      box?.classList.remove("session-active");
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

    contextLabel && (contextLabel.textContent = "UPCOMING GIG:");
    dateEl.textContent = parts.date;
    timeEl.textContent = next.startTime || parts.time;
    venueEl.textContent = next.venue || "Venue TBC";
    typeEl.textContent = next.type || "Other";

    const color = typeColor(next.type || "Other");
    typeEl.style.color = color;
    typeEl.style.borderColor = color;
    typeEl.style.background = hexToRgba(color, .12);

    const countdown = countdownText(start);
    countdownEl.textContent = countdown.text;
    countdownEl.classList.toggle("is-late", countdown.late);

    box?.classList.toggle(
      "session-active",
      !!activeSessionControl?.active
    );
  }

  function setSystemStatusLiveUi() {
    const label = $("statusLiveLabel");
    const box = document.querySelector(".status-live-box");
    const button = $("liveCircleBtn");

    if (label) {
      label.textContent = "● LIVE NOW!";
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

  function selectedUpcomingEventId() {
    const field = $("sessionEventIdInput")?.value || "";
    if (field) return field;
    try { return sessionStorage.getItem("lkSelectedUpcomingEventId") || ""; } catch { return ""; }
  }

  function selectedSessionEvent() {
    const id = selectedUpcomingEventId();
    return upcomingEvents.find(event => event.id === id) || null;
  }

  window.getSelectedSessionEvent = selectedSessionEvent;

  function eventSnapshotForSession(event) {
    if (!event) return null;
    return {
      id: event.id || "",
      name: event.name || "",
      title: event.name || "",
      type: event.type || "Other",
      venue: event.venue || "",
      address: event.address || "",
      date: event.date || "",
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      arrivalTime: event.arrivalTime || "",
      contactName: event.contactName || "",
      contact: event.contact || "",
      notes: event.notes || ""
    };
  }

  async function linkCurrentSessionToEvent(eventId) {
    if (!eventId) return;
    const event = upcomingEvents.find(item => item.id === eventId);
    if (!event) return;
    const controlSnap = await db.collection("karaokeControl").doc("currentSession").get();
    const control = controlSnap.exists ? (controlSnap.data() || {}) : {};
    const sessionId = control.sessionId || control.activeSessionId || "";
    if (!sessionId) return;
    const scheduledStartAt = eventStartDate(event);
    const scheduledEndAt = eventEndDate(event);
    const scheduledDurationMs = scheduledStartAt && scheduledEndAt ? Math.max(0, scheduledEndAt - scheduledStartAt) : null;
    const payload = {
      eventId,
      eventSnapshot: eventSnapshotForSession(event),
      sessionType: event.type || "Live Karaoke",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (scheduledStartAt) payload.scheduledStartAt = firebase.firestore.Timestamp.fromDate(scheduledStartAt);
    if (scheduledEndAt) payload.scheduledEndAt = firebase.firestore.Timestamp.fromDate(scheduledEndAt);
    if (scheduledDurationMs) payload.scheduledDurationMs = scheduledDurationMs;
    await db.collection("performanceSessions").doc(sessionId).set(payload, { merge:true });
    await db.collection("karaokeControl").doc("currentSession").set({
      ...payload,
      sessionId,
      active: true
    }, { merge:true });
    await db.collection("upcomingEvents").doc(eventId).set({
      sessionId,
      sessionStatus: "active",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  function resolveActiveEventId() {
    const explicit = activeSessionData?.eventId || activeSessionControl?.eventId || selectedUpcomingEventId();
    if (explicit) return explicit;
    const title = String(activeSessionData?.title || activeSessionControl?.title || "").trim().toLowerCase();
    const venue = String(activeSessionData?.venue || activeSessionControl?.venue || "").trim().toLowerCase();
    const matches = upcomingEvents.filter(event => {
      const eventTitle = String(event.name || "").trim().toLowerCase();
      const eventVenue = String(event.venue || "").trim().toLowerCase();
      return (title && eventTitle === title) || (venue && eventVenue === venue && title && eventTitle.includes(title));
    });
    return matches.length === 1 ? matches[0].id : "";
  }

  async function markEventCompleted(eventId, sessionId) {
    if (!eventId) return;
    await db.collection("upcomingEvents").doc(eventId).set({
      sessionStatus: "ended",
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedSessionId: sessionId || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
    try { sessionStorage.removeItem("lkSelectedUpcomingEventId"); } catch {}
    if ($("sessionEventIdInput")) $("sessionEventIdInput").value = "";
  }

  function wrapPerformanceLifecycle() {
    if (typeof window.startPerformance === "function" && !window.startPerformance.__eventLifecycleWrapped) {
      const originalStart = window.startPerformance;
      const wrappedStart = async function (...args) {
        const eventId = selectedUpcomingEventId();
        const result = await originalStart.apply(this, args);
        if (eventId) {
          try { await linkCurrentSessionToEvent(eventId); }
          catch (error) { console.warn("Could not link performance to upcoming event:", error); }
        }
        await forceSystemLiveForPerformance();
        return result;
      };
      wrappedStart.__eventLifecycleWrapped = true;
      window.startPerformance = wrappedStart;
    }

    if (typeof window.endPerformance === "function" && !window.endPerformance.__eventLifecycleWrapped) {
      const originalEnd = window.endPerformance;
      const wrappedEnd = async function (...args) {
        const sessionId = activeSessionData?.id || activeSessionControl?.sessionId || activeSessionControl?.activeSessionId || "";
        const eventId = resolveActiveEventId();
        const result = await originalEnd.apply(this, args);
        if (eventId) {
          try { await markEventCompleted(eventId, sessionId); }
          catch (error) { console.warn("Could not complete linked upcoming event:", error); }
        }
        return result;
      };
      wrappedEnd.__eventLifecycleWrapped = true;
      window.endPerformance = wrappedEnd;
    }
  }

  async function completeEventForEndedSession(sessionSnapshot) {
    if (!sessionSnapshot?.id) return;

    try {
      const fresh = await db.collection("performanceSessions")
        .doc(sessionSnapshot.id)
        .get();

      const data = fresh.exists
        ? { id:fresh.id, ...(fresh.data() || {}) }
        : sessionSnapshot;

      const status = String(data.status || "").toLowerCase();
      const ended =
        status === "ended" ||
        !!data.endedAt ||
        data.isActive === false;

      if (!ended) return;

      const eventId =
        data.eventId ||
        sessionSnapshot.eventId ||
        lastActiveSessionForCompletion?.eventId ||
        "";

      if (eventId) {
        await markEventCompleted(eventId, data.id);
        return;
      }

      const title = String(data.title || "").trim().toLowerCase();
      const venue = String(data.venue || "").trim().toLowerCase();

      const candidates = upcomingEvents.filter(event => {
        if (!eventStillUpcoming(event)) return false;
        const eventTitle = String(event.name || "").trim().toLowerCase();
        const eventVenue = String(event.venue || "").trim().toLowerCase();

        return (
          (title && eventTitle === title) ||
          (venue && eventVenue === venue && title && eventTitle.includes(title))
        );
      });

      if (candidates.length === 1) {
        await markEventCompleted(candidates[0].id, data.id);
      }
    } catch (error) {
      console.warn("Could not retire Upcoming Event after session ended:", error);
    }
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

            if (activeSessionData) {
              lastActiveSessionForCompletion = { ...activeSessionData };
            }

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

  function selectSessionEvent(eventId, { updateNotes = true } = {}) {
    const event = upcomingEvents.find(item => item.id === eventId);
    if (!event) return null;

    if ($("sessionEventIdInput")) {
      $("sessionEventIdInput").value = event.id || "";
    }

    if ($("sessionEventSelect")) {
      $("sessionEventSelect").value = event.id || "";
    }

    try {
      sessionStorage.setItem("lkSelectedUpcomingEventId", event.id || "");
    } catch {}

    if (updateNotes && $("sessionNotesInput")) {
      $("sessionNotesInput").value = buildSessionNotes(event);
      $("sessionNotesInput").dispatchEvent(new Event("input", { bubbles:true }));
    }

    renderSessionSuggestion(event);
    updateStartButtonForEvent();
    return event;
  }

  function prefillSessionFromEvent(eventId, { scroll = true } = {}) {
    const event = selectSessionEvent(eventId);
    if (!event) return;

    if (typeof window.logAdmin === "function") {
      window.logAdmin(`Performance linked to upcoming event: ${event.name || event.id}`);
    }

    if (scroll) {
      $("sessionPanel")?.scrollIntoView({ behavior:"smooth", block:"start" });
    }
  }

  window.prefillSessionFromEvent = prefillSessionFromEvent;

  function updateStartButtonForEvent() {
    const button = $("startPerformanceBtn");
    if (!button) return;

    // Do not override sessions.js while a session is active.
    if (activeSessionControl?.active) return;

    const hasEvent = !!selectedUpcomingEventId();
    button.disabled = !hasEvent;
    button.title = hasEvent
      ? "Start Performance linked to the selected Upcoming Event"
      : "Choose an Upcoming Event first";
  }

  function renderSessionEventSelect() {
    const select = $("sessionEventSelect");
    if (!select) return;

    const available = upcomingExcludingActive();
    let selectedId = selectedUpcomingEventId();

    if (selectedId && !available.some(event => event.id === selectedId)) {
      selectedId = "";
    }

    if (!selectedId && available.length) {
      selectedId = available[0].id;
    }

    select.innerHTML =
      (available.length
        ? ""
        : `<option value="">No upcoming events available</option>`) +
      available.map(event => `
        <option value="${esc(event.id)}">
          ${esc(formatDate(event.date))}${event.startTime ? ` ${esc(event.startTime)}` : ""}
          — ${esc(event.name || "Untitled Event")}
          ${event.venue ? ` — ${esc(event.venue)}` : ""}
        </option>
      `).join("");

    if (selectedId) {
      selectSessionEvent(selectedId, { updateNotes:false });
    } else {
      if ($("sessionEventIdInput")) $("sessionEventIdInput").value = "";
      try { sessionStorage.removeItem("lkSelectedUpcomingEventId"); } catch {}
      renderSessionSuggestion();
      updateStartButtonForEvent();
    }
  }

  function renderSessionSuggestion(event = null) {
    const panel = $("sessionEventSuggestion");
    const body = $("sessionEventSuggestionBody");
    if (!panel || !body) return;

    if (!event) {
      const next = upcomingExcludingActive()[0];

      if (!next) {
        panel.classList.remove("has-event");
        body.innerHTML = `<small>No upcoming events available.</small>`;
        return;
      }

      panel.classList.add("has-event");
      body.innerHTML = `
        <button type="button" data-prefill-session="${esc(next.id)}">
          <strong>Next gig selected: ${esc(next.name || "Untitled Event")}</strong>
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

    const next = upcomingExcludingActive().slice(0, 3);

    if (!next.length) {
      box.innerHTML = `
        <button type="button" class="status-next-gig-empty">No upcoming gigs</button>
        <button type="button" class="view-all-gigs-btn" data-view-all-gigs>VIEW ALL</button>
      `;
      return;
    }

    box.innerHTML =
      next.map(event => {
        const color = typeColor(event.type || "Other");
        return `
          <button
            type="button"
            class="status-next-gig-row"
            data-event-detail="${esc(event.id)}"
            title="View event details">
            <span class="status-next-gig-when">
              ${esc(formatDate(event.date))}
              ${event.startTime ? `<br>${esc(event.startTime)}` : ""}
            </span>
            <span class="status-next-gig-name">
              ${esc(event.name || "Untitled Event")}
              <small class="status-next-gig-venue">${esc(event.venue || "Venue TBC")}</small>
            </span>
          </button>
        `;
      }).join("") +
      `<button type="button" class="view-all-gigs-btn" data-view-all-gigs>VIEW ALL</button>`;
  }

  function renderDashboardEvents() {
    const list = $("dashboardUpcomingEventsList");
    if (!list) return;
    const next = sortedUpcoming().slice(0, 10);
    if ($("dashboardUpcomingEventCount")) $("dashboardUpcomingEventCount").textContent = `(${sortedUpcoming().length})`;
    if (!next.length) {
      list.innerHTML = `<div class="dashboard-event-empty">No upcoming gigs or events.</div>`;
      return;
    }
    list.innerHTML = next.map(event => `
      <article class="dashboard-event-row" data-event-detail="${esc(event.id)}" title="Click to view event details">
        <div class="dashboard-event-date">${esc(formatDate(event.date))}</div>
        <div class="dashboard-event-main">
          <strong>${esc(event.name || "Untitled Event")}</strong>
          <small>${esc(event.venue || "Venue TBC")}${event.startTime ? ` • ${esc(event.startTime)}` : ""} • ${esc(formatEventLength(event))}</small>
        </div>
        <div class="dashboard-event-venue">${esc(event.venue || "Venue TBC")}</div>
        <div class="dashboard-event-time">${esc(event.startTime || "Time TBC")}</div>
        <div><span
          class="dashboard-event-type"
          style="--event-type-color:${esc(typeColor(event.type || "Other"))};--event-type-bg:${esc(hexToRgba(typeColor(event.type || "Other"), .13))}"
        >${esc(event.type || "Other")}</span></div>
        <button type="button" class="dashboard-event-prefill-btn" data-prefill-session="${esc(event.id)}" title="Prefill Performance Session">＋</button>
      </article>
    `).join("");
  }

  function openUpcomingEventDetail(eventId) {
    const event = upcomingEvents.find(item => item.id === eventId);
    const modal = $("dashboardDetailModal");
    const content = $("dashboardDetailModalContent");
    if (!event || !modal || !content) return;
    const contact = [event.contactName, event.contact].filter(Boolean).join(" • ") || "—";
    content.innerHTML = `
      <div class="dashboard-detail-head">
        <span>UPCOMING GIG / EVENT</span>
        <h2>${esc(event.name || "Untitled Event")}</h2>
        <p>${esc(event.type || "Other")}</p>
      </div>
      <div class="dashboard-detail-grid">
        <div class="dashboard-detail-cell"><span>DATE</span><strong>${esc(formatDate(event.date))}</strong></div>
        <div class="dashboard-detail-cell"><span>TIME</span><strong>${esc(event.startTime || "TBC")}${event.endTime ? ` – ${esc(event.endTime)}` : ""}</strong></div>
        <div class="dashboard-detail-cell"><span>VENUE</span><strong>${esc(event.venue || "TBC")}</strong></div>
        <div class="dashboard-detail-cell"><span>LENGTH</span><strong>${esc(formatEventLength(event))}</strong></div>
        <div class="dashboard-detail-cell"><span>ARRIVAL / SETUP</span><strong>${esc(event.arrivalTime || "—")}</strong></div>
        <div class="dashboard-detail-cell"><span>CONTACT</span><strong>${esc(contact)}</strong></div>
        <div class="dashboard-detail-cell"><span>ADDRESS</span><strong>${esc(event.address || "—")}</strong></div>
        <div class="dashboard-detail-cell"><span>STATUS</span><strong>${esc(event.status || "Upcoming")}</strong></div>
      </div>
      <div class="dashboard-detail-section">
        <h3>NOTES</h3>
        <div class="dashboard-detail-copy">${esc(event.notes || "No notes.")}</div>
      </div>`;
    modal.classList.remove("hidden");
  }

  function closeUpcomingEventDetail() {
    $("dashboardDetailModal")?.classList.add("hidden");
  }

  function renderAllEventSurfaces() {
    renderNextGigsStatus();
    renderDashboardEvents();
    renderSessionEventSelect();
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
      const colors = doc.exists && doc.data()?.colors && typeof doc.data().colors === "object"
        ? doc.data().colors
        : {};
      eventTypeColors = {
        ...DEFAULT_EVENT_TYPE_COLORS,
        ...colors
      };
      populateSessionTypeSelect();
      renderAllEventSurfaces();
      renderVenueContextStatus();
    }, error => {
      console.warn("Event type options unavailable:", error);
      eventTypes = [...DEFAULT_EVENT_TYPES];
      populateSessionTypeSelect();
    });
  }

  function bindUI() {
    document.addEventListener("click", event => {
      const prefill = event.target.closest("[data-prefill-session]");
      if (prefill) {
        event.preventDefault();
        event.stopPropagation();
        prefillSessionFromEvent(prefill.dataset.prefillSession);
        return;
      }

      const detail = event.target.closest("[data-event-detail]");
      if (detail) {
        event.preventDefault();
        openUpcomingEventDetail(detail.dataset.eventDetail);
        return;
      }

      if (event.target.closest("[data-view-all-gigs]")) {
        event.preventDefault();
        $("upcomingEventsDashboardPanel")?.scrollIntoView({
          behavior:"smooth",
          block:"start"
        });
      }
    });

    $("dashboardDetailCloseBtn")?.addEventListener("click", closeUpcomingEventDetail);
    $("dashboardDetailModal")?.addEventListener("click", event => {
      if (event.target === $("dashboardDetailModal")) closeUpcomingEventDetail();
    });

    $("sessionEventSelect")?.addEventListener("change", event => {
      const eventId = event.target.value || "";
      if (eventId) selectSessionEvent(eventId);
    });

    $("clearSessionEventSuggestionBtn")?.addEventListener("click", () => {
      const next = upcomingExcludingActive()[0] || null;
      if (next) {
        selectSessionEvent(next.id);
      } else {
        if ($("sessionEventIdInput")) $("sessionEventIdInput").value = "";
        if ($("sessionEventSelect")) $("sessionEventSelect").value = "";
        try { sessionStorage.removeItem("lkSelectedUpcomingEventId"); } catch {}
        renderSessionSuggestion();
        updateStartButtonForEvent();
      }
    });
  }

  function classifyActiveRequestRows() {
    const box = $("activeRequestsList");
    if (!box) return;

    // Only add CSS classes. No wrapping, moving, cloning or replacing nodes.
    const nodes = [box, ...box.querySelectorAll("div,section,article")];
    nodes.forEach(node => {
      if (node === box) return;
      const direct = Array.from(node.children);
      const directText = direct.map(el => String(el.textContent || "").replace(/\s+/g," ").trim().toUpperCase());
      const allText = directText.join(" | ");
      const buttons = node.querySelectorAll("button");

      const looksLikeHeader =
        direct.length >= 5 &&
        allText.includes("SONG") &&
        allText.includes("REQUESTED BY") &&
        allText.includes("BPM") &&
        allText.includes("TIME") &&
        allText.includes("ACTIONS") &&
        !Array.from(node.children).some(child =>
          String(child.textContent || "").toUpperCase().includes("REQUESTED BY") &&
          child.children.length >= 5
        );

      if (looksLikeHeader) node.classList.add("lk-request-table-head");

      if (node.classList.contains("active-request-row") && node.querySelector(":scope > .request-main")) {
        node.classList.add("lk-request-old-row");
        return;
      }

      const directActionCell = direct.find(el => el.querySelectorAll?.("button").length >= 3);
      const directButtons = direct.filter(el => el.tagName === "BUTTON").length;
      if ((directActionCell || directButtons >= 3) && direct.length >= 5) {
        node.classList.add("lk-request-table-row");
      }
    });
  }

  function watchActiveRequestRows() {
    const box = $("activeRequestsList");
    if (!box || box.dataset.lkRowWatch === "1") return;
    box.dataset.lkRowWatch = "1";
    classifyActiveRequestRows();
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        classifyActiveRequestRows();
      });
    });
    // childList only: adding CSS classes cannot retrigger this observer.
    observer.observe(box, { childList:true, subtree:true });
  }

  async function init() {
    bindUI();
    await seedEventTypesIfNeeded();

    // admin-session-lifecycle.js is the single owner of start/end lifecycle.

    startListeners();
    listenForActiveSessionStatus();
    startVenueStatusCountdown();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }






  // ACTIVE SONG REQUESTS layout is fixed by admin.html CSS.
  // No request DOM mutation or renderer wrapping is used here.

})();
