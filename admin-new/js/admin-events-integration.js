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

  function sortedUpcoming() {
    return upcomingEvents
      .filter(event => !isPast(event) && event.status !== "Cancelled")
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
      renderAllEventSurfaces();
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
      const target = event.target.closest("[data-prefill-session]");
      if (target) {
        prefillSessionFromEvent(target.dataset.prefillSession);
      }
    });

    $("clearSessionEventSuggestionBtn")?.addEventListener("click", () => {
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
    startListeners();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
