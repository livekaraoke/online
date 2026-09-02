(() => {
  "use strict";

  const COLLECTION = "upcomingEvents";
  const VENUES_COLLECTION = "venues";
  const DEFAULT_TYPE_OPTIONS = [
    "Live Karaoke",
    "Roxanna",
    "Solo",
    "Texanna",
    "Other"
  ];

  const DEFAULT_TYPE_COLORS = {
    "Live Karaoke": "#36a9e1",
    "Roxanna": "#d96ce0",
    "Solo": "#53c985",
    "Texanna": "#f08a45",
    "Other": "#a5adb3"
  };

  let typeOptions = [...DEFAULT_TYPE_OPTIONS];
  let typeColors = { ...DEFAULT_TYPE_COLORS };
  const STATUS_OPTIONS = ["Confirmed", "Tentative", "Cancelled"];

  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  const EVENT_TYPES_DOC = db ? db.collection("karaokeControl").doc("eventTypes") : null;

  let events = [];
  let venues = [];
  let unsubscribeEvents = null;
  let eventNameManuallyEdited = false;
  let lastAutoEventName = "";
  let unsubscribeVenues = null;
  let pendingDeleteId = "";

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugClass(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function eventSortValue(event) {
    return `${event.date || "9999-12-31"}T${event.startTime || "23:59"}`;
  }

  function isPast(event) {
    if (!event.date) return false;
    const now = new Date();
    const endTime = event.endTime || event.startTime || "23:59";
    const end = new Date(`${event.date}T${endTime}:00`);
    return end.getTime() < now.getTime();
  }


  function eventStillUpcoming(event) {
    // Scheduled time passing does NOT remove an event from Upcoming.
    // It remains until an associated Performance Session is ended.
    if (!event) return false;
    if (event.status === "Cancelled") return false;
    if (event.sessionStatus === "ended") return false;
    if (event.completedAt) return false;
    return true;
  }

  function eventIsCompleted(event) {
    return !!event && (
      event.sessionStatus === "ended" ||
      !!event.completedAt
    );
  }

  function formatDate(dateString) {
    if (!dateString) return { day: "—", month: "NO DATE", full: "No date" };

    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return { day: "—", month: dateString, full: dateString };
    }

    return {
      day: String(date.getDate()).padStart(2, "0"),
      month: date.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase(),
      full: date.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    };
  }

  function formatTimeRange(event) {
    const start = event.startTime || "";
    const end = event.endTime || "";
    if (!start && !end) return "Time TBC";
    if (start && end) return `${start} – ${end}`;
    return start || end;
  }


  function formatEventLength(event) {
    if (!event.startTime || !event.endTime) return "Length TBC";

    const [sh, sm] = event.startTime.split(":").map(Number);
    const [eh, em] = event.endTime.split(":").map(Number);
    if (![sh,sm,eh,em].every(Number.isFinite)) return "Length TBC";

    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60;

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
  }

  function getFilteredEvents() {
    const search = String($("eventsSearch")?.value || "").trim().toLowerCase();
    const type = $("eventsTypeFilter")?.value || "";
    const status = $("eventsStatusFilter")?.value || "";
    const range = $("eventsRangeFilter")?.value || "upcoming";

    return events
      .filter(event => {
        if (type && event.type !== type) return false;
        if (status && event.status !== status) return false;

        const upcoming = eventStillUpcoming(event);
        const completed = eventIsCompleted(event);

        if (range === "upcoming" && !upcoming) return false;
        if (range === "past" && !completed) return false;

        if (search) {
          const haystack = [
            event.name,
            event.venue,
            event.address,
            event.type,
            event.status,
            event.contactName,
            event.contact,
            event.notes
          ].join(" ").toLowerCase();

          if (!haystack.includes(search)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const av = eventSortValue(a);
        const bv = eventSortValue(b);

        return range === "past"
          ? bv.localeCompare(av)
          : av.localeCompare(bv);
      });
  }

  function typeColor(type) {
    return typeColors[type] || DEFAULT_TYPE_COLORS[type] || "#8ea3ad";
  }

  function hexToRgba(hex, alpha = 0.14) {
    const clean = String(hex || "").replace("#","");
    if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(142,163,173,${alpha})`;
    const r = parseInt(clean.slice(0,2),16);
    const g = parseInt(clean.slice(2,4),16);
    const b = parseInt(clean.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function renderTypeSummaryCards(upcomingEvents) {
    const container = $("eventTypeSummaryCards");
    if (!container) return;

    const configuredTypes = Array.isArray(typeOptions) && typeOptions.length
      ? typeOptions
      : DEFAULT_TYPE_OPTIONS;

    container.innerHTML = configuredTypes.map(type => {
      const count = upcomingEvents.filter(event => event.type === type).length;
      const cssType = slugClass(type);

      return `
        <article
          class="events-summary-card event-type-summary-card type-card-${escapeHTML(cssType)}"
          data-summary-type="${escapeHTML(type)}"
          style="--event-type-color:${escapeHTML(typeColor(type))};--event-type-bg:${escapeHTML(hexToRgba(typeColor(type), .12))}"
          title="Show ${escapeHTML(type)} events">
          <span>${escapeHTML(String(type).toUpperCase())}</span>
          <strong>${count}</strong>
          <small>Upcoming booking${count === 1 ? "" : "s"}</small>
        </article>
      `;
    }).join("");
  }

  function renderSummary() {
    const now = new Date();
    const today = localDateKey(now);
    const monthPrefix = today.slice(0, 7);

    const upcoming = events
      .filter(eventStillUpcoming)
      .sort((a, b) => eventSortValue(a).localeCompare(eventSortValue(b)));

    const next = upcoming[0] || null;

    $("upcomingCount").textContent = String(upcoming.length);
    $("thisMonthCount").textContent = String(
      events.filter(event => String(event.date || "").startsWith(monthPrefix)).length
    );
    // Build one card for every configured event/session type.
    // This automatically includes Live Karaoke, Roxanna, Solo, Texanna,
    // Other, and any future types added through the ⚙ TYPES manager.
    renderTypeSummaryCards(upcoming);

    if (next) {
      const date = formatDate(next.date);
      $("nextGigDate").textContent = `${date.day} ${date.month.split(" ")[0]}`;
      $("nextGigName").textContent = `${next.name || "Untitled Event"}${next.venue ? " • " + next.venue : ""}`;
    } else {
      $("nextGigDate").textContent = "—";
      $("nextGigName").textContent = "Nothing scheduled";
    }
  }

  function renderEvents() {
    const list = $("eventsList");
    if (!list) return;

    const filtered = getFilteredEvents();
    $("eventsResultCount").textContent = `${filtered.length} event${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
      list.innerHTML = `
        <div class="events-empty">
          No events match the current filters.
        </div>
      `;
      renderSummary();
      return;
    }

    list.innerHTML = filtered.map(event => {
      const date = formatDate(event.date);
      const typeClass = `type-${slugClass(event.type)}`;
      const statusClass = `status-${slugClass(event.status)}`;
      const notesPreview = event.notes
        ? escapeHTML(event.notes)
        : "No notes";

      return `
        <article class="event-row" data-event-id="${escapeHTML(event.id)}">
          <div class="event-date-block" title="${escapeHTML(date.full)}">
            <strong>${escapeHTML(date.day)}</strong>
            <span>${escapeHTML(date.month)}</span>
          </div>

          <div class="event-main">
            <strong>${escapeHTML(event.name || "Untitled Event")}</strong>

            <div class="event-schedule-meta">
              <span><b>Venue:</b> ${escapeHTML(event.venue || "TBC")}</span>
              <span><b>Start:</b> ${escapeHTML(event.startTime || "TBC")}</span>
              <span><b>Length:</b> ${escapeHTML(formatEventLength(event))}</span>
            </div>

            <span class="event-notes-preview">${notesPreview}</span>
          </div>

          <div class="event-venue">
            <strong>${escapeHTML(event.venue || "Venue TBC")}</strong>
            <span>${escapeHTML(event.address || "No address")}</span>
          </div>

          <div class="event-time">
            <strong>${escapeHTML(formatTimeRange(event))}</strong>
            <span>${event.arrivalTime ? `Setup ${escapeHTML(event.arrivalTime)}` : "No setup time"}</span>
          </div>

          <div>
            <span
              class="event-type-badge ${typeClass}"
              style="--event-type-color:${escapeHTML(typeColor(event.type || "Live Karaoke"))};--event-type-bg:${escapeHTML(hexToRgba(typeColor(event.type || "Live Karaoke"), .13))}"
            >${escapeHTML(event.type || "Live Karaoke")}</span>
            <span class="event-status-badge ${statusClass}" style="margin-top:5px">${escapeHTML(event.status || "Confirmed")}</span>
          </div>

          <div class="event-actions">
            <button class="event-action-btn" type="button" data-edit-event="${escapeHTML(event.id)}" title="Edit event">✎</button>
            <button class="event-action-btn delete" type="button" data-delete-event="${escapeHTML(event.id)}" title="Delete event">🗑</button>
          </div>
        </article>
      `;
    }).join("");

    renderSummary();
  }

  function venueCombinedContact(venue) {
    const phone = String(venue?.contactPhone || "").trim();
    const email = String(venue?.contactEmail || "").trim();
    return [phone, email].filter(Boolean).join(" • ");
  }

  function populateVenueSelect(preferredVenueId = "") {
    const select = $("eventVenueInput");
    if (!select) return;

    const current = preferredVenueId || select.value || "";

    select.innerHTML =
      `<option value="">Choose a saved venue...</option>` +
      venues
        .slice()
        .sort((a,b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
        )
        .map(venue =>
          `<option value="${escapeHTML(venue.id)}">${escapeHTML(venue.name || "Untitled Venue")}</option>`
        )
        .join("");

    if (current && venues.some(venue => venue.id === current)) {
      select.value = current;
    } else {
      select.value = "";
    }
  }

  function getSelectedVenue() {
    const id = $("eventVenueInput")?.value || "";
    return venues.find(venue => venue.id === id) || null;
  }

  function applyVenueToEventForm(venue, { fillArrival = true } = {}) {
    const address = $("eventAddressInput");
    const contactName = $("eventContactNameInput");
    const contact = $("eventContactInput");

    address.value = venue?.address || "";
    contactName.value = venue?.contactName || "";
    contact.value = venueCombinedContact(venue);

    [address, contactName, contact].forEach(input => {
      input.classList.toggle("venue-autofilled", !!input.value);
    });

    if (
      fillArrival &&
      venue?.defaultArrivalTime &&
      !$("eventArrivalTimeInput").value
    ) {
      $("eventArrivalTimeInput").value = venue.defaultArrivalTime;
    }
  }

  function handleVenueSelection() {
    applyVenueToEventForm(getSelectedVenue());
    updateAutomaticEventName();
  }

  function startVenueListener() {
    if (!db) return;
    if (unsubscribeVenues) unsubscribeVenues();

    unsubscribeVenues = db.collection(VENUES_COLLECTION).onSnapshot(snapshot => {
      const selected = $("eventVenueInput")?.value || "";

      venues = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() || {})
      }));

      populateVenueSelect(selected);

      if ($("eventVenueInput")?.value) {
        applyVenueToEventForm(getSelectedVenue(), { fillArrival: false });
        updateAutomaticEventName();
      }
    }, error => {
      console.error("Could not load saved venues:", error);
      const select = $("eventVenueInput");
      if (select) {
        select.innerHTML = `<option value="">Could not load venues</option>`;
      }
    });
  }

  function populateTypeControls(preferredType = "") {
    const eventSelect = $("eventTypeInput");
    const filterSelect = $("eventsTypeFilter");

    if (eventSelect) {
      const current = preferredType || eventSelect.value || typeOptions[0] || "";
      eventSelect.innerHTML = typeOptions
        .map(type => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`)
        .join("");

      eventSelect.value = typeOptions.includes(current)
        ? current
        : (typeOptions[0] || "");
    }

    if (filterSelect) {
      const current = filterSelect.value || "";
      filterSelect.innerHTML =
        `<option value="">All Types</option>` +
        typeOptions.map(type =>
          `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`
        ).join("");

      filterSelect.value = typeOptions.includes(current) ? current : "";
    }
  }

  function renderEventTypeManager() {
    const list = $("eventTypesList");
    if (!list) return;

    list.innerHTML = typeOptions.map(type => `
      <div class="event-type-manager-row">
        <span
          class="event-type-manager-swatch"
          style="background:${escapeHTML(typeColor(type))}"
          aria-hidden="true"></span>
        <strong>${escapeHTML(type)}</strong>
        <label class="event-type-color-control">
          <span>Colour</span>
          <input
            type="color"
            value="${escapeHTML(typeColor(type))}"
            data-event-type-color="${escapeHTML(type)}"
            aria-label="Colour for ${escapeHTML(type)}">
        </label>
        <button type="button" data-remove-event-type="${escapeHTML(type)}" title="Remove ${escapeHTML(type)}">×</button>
      </div>
    `).join("");
  }

  async function saveEventTypes(nextOptions, nextColors = typeColors) {
    if (!EVENT_TYPES_DOC) return;

    const clean = [...new Set(
      nextOptions
        .map(value => String(value || "").trim())
        .filter(Boolean)
    )];

    if (!clean.length) {
      $("eventTypesMessage").textContent = "Keep at least one type.";
      return;
    }

    const cleanColors = {};
    clean.forEach(type => {
      cleanColors[type] =
        nextColors[type] ||
        typeColors[type] ||
        DEFAULT_TYPE_COLORS[type] ||
        "#8ea3ad";
    });

    try {
      await EVENT_TYPES_DOC.set({
        options: clean,
        colors: cleanColors,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      $("eventTypesMessage").textContent = "";
    } catch (error) {
      console.error("Could not save event types:", error);
      $("eventTypesMessage").textContent = error.message || "Could not save types.";
    }
  }

  async function addEventType() {
    const input = $("newEventTypeInput");
    const value = String(input?.value || "").trim();

    if (!value) return;
    if (typeOptions.some(type => type.toLowerCase() === value.toLowerCase())) {
      $("eventTypesMessage").textContent = "That type already exists.";
      return;
    }

    const selectedColor = $("newEventTypeColorInput")?.value || "#8ea3ad";
    await saveEventTypes(
      [...typeOptions, value],
      { ...typeColors, [value]: selectedColor }
    );
    input.value = "";
    if ($("newEventTypeColorInput")) $("newEventTypeColorInput").value = "#8ea3ad";
  }

  async function removeEventType(value) {
    if (typeOptions.length <= 1) {
      $("eventTypesMessage").textContent = "Keep at least one type.";
      return;
    }

    const nextColors = { ...typeColors };
    delete nextColors[value];
    await saveEventTypes(
      typeOptions.filter(type => type !== value),
      nextColors
    );
  }

  function openEventTypesModal() {
    renderEventTypeManager();
    $("eventTypesMessage").textContent = "";
    $("newEventTypeInput").value = "";
    $("eventTypesModal").classList.remove("hidden");
  }

  function closeEventTypesModal() {
    $("eventTypesModal").classList.add("hidden");
  }

  async function startEventTypesListener() {
    if (!EVENT_TYPES_DOC) return;

    try {
      const initial = await EVENT_TYPES_DOC.get();
      const initialOptions = initial.exists && Array.isArray(initial.data()?.options)
        ? initial.data().options.map(v => String(v || "").trim()).filter(Boolean)
        : [];

      if (!initialOptions.length) {
        await EVENT_TYPES_DOC.set({
          options: DEFAULT_TYPE_OPTIONS,
          colors: DEFAULT_TYPE_COLORS,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
      }
    } catch (error) {
      console.warn("Could not initialise event types:", error);
    }

    EVENT_TYPES_DOC.onSnapshot(doc => {
      const options = doc.exists && Array.isArray(doc.data()?.options)
        ? doc.data().options.map(v => String(v || "").trim()).filter(Boolean)
        : [];

      typeOptions = options.length
        ? [...new Set(options)]
        : [...DEFAULT_TYPE_OPTIONS];

      const colors =
        doc.exists &&
        doc.data()?.colors &&
        typeof doc.data().colors === "object"
          ? doc.data().colors
          : {};

      typeColors = {
        ...DEFAULT_TYPE_COLORS,
        ...colors
      };

      populateTypeControls();
      renderEventTypeManager();
      renderEvents();
    }, error => {
      console.warn("Event types listener unavailable:", error);
      typeOptions = [...DEFAULT_TYPE_OPTIONS];
      populateTypeControls();
    });
  }

  function formatEventNameDate(dateString) {
    if (!dateString) return "";
    const parts = String(dateString).split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}/${parts[1]}`;
  }

  function buildAutomaticEventName() {
    const type = $("eventTypeInput")?.value || "";
    const venue = getSelectedVenue();
    const date = formatEventNameDate($("eventDateInput")?.value || "");

    if (!type || !venue?.name || !date) return "";
    return `${type} @ ${venue.name} ${date}`;
  }

  function updateAutomaticEventName(force = false) {
    const input = $("eventNameInput");
    if (!input) return;

    const next = buildAutomaticEventName();
    if (!next) return;

    if (
      force ||
      !eventNameManuallyEdited ||
      !input.value.trim() ||
      input.value === lastAutoEventName
    ) {
      input.value = next;
      lastAutoEventName = next;
      eventNameManuallyEdited = false;
    }
  }

  function resetForm() {
    eventNameManuallyEdited = false;
    lastAutoEventName = "";
    $("eventIdInput").value = "";
    $("eventNameInput").value = "";
    populateVenueSelect("");
    $("eventVenueInput").value = "";
    populateTypeControls("Live Karaoke");
    $("eventStatusInput").value = "Confirmed";
    $("eventDateInput").value = "";
    $("eventStartTimeInput").value = "";
    $("eventEndTimeInput").value = "";
    $("eventArrivalTimeInput").value = "";
    $("eventAddressInput").value = "";
    $("eventContactNameInput").value = "";
    $("eventContactInput").value = "";
    $("eventNotesInput").value = "";
    $("eventFormMessage").textContent = "";
  }

  function openCreateModal() {
    resetForm();
    $("eventModalMode").textContent = "NEW EVENT";
    $("eventModalTitle").textContent = "Create Event";
    $("eventSaveBtn").textContent = "SAVE EVENT";
    $("eventModal").classList.remove("hidden");

    setTimeout(() => $("eventNameInput").focus(), 30);
  }

  function openEditModal(id) {
    eventNameManuallyEdited = true;
    lastAutoEventName = "";
    const event = events.find(item => item.id === id);
    if (!event) return;

    resetForm();

    $("eventIdInput").value = event.id;
    $("eventNameInput").value = event.name || "";
    populateVenueSelect(event.venueId || "");
    $("eventVenueInput").value = event.venueId || "";

    if (event.venueId && venues.some(venue => venue.id === event.venueId)) {
      applyVenueToEventForm(getSelectedVenue(), { fillArrival: false });
    } else {
      // Backward compatibility for events created before the Venues page.
      $("eventAddressInput").value = event.address || "";
      $("eventContactNameInput").value = event.contactName || "";
      $("eventContactInput").value = event.contact || "";
      [$("eventAddressInput"), $("eventContactNameInput"), $("eventContactInput")]
        .forEach(input => input.classList.toggle("venue-autofilled", !!input.value));
    }
    populateTypeControls(typeOptions.includes(event.type) ? event.type : (typeOptions[0] || ""));
    $("eventStatusInput").value = STATUS_OPTIONS.includes(event.status) ? event.status : "Confirmed";
    $("eventDateInput").value = event.date || "";
    $("eventStartTimeInput").value = event.startTime || "";
    $("eventEndTimeInput").value = event.endTime || "";
    $("eventArrivalTimeInput").value = event.arrivalTime || "";
    $("eventNotesInput").value = event.notes || "";

    $("eventModalMode").textContent = "EDIT EVENT";
    $("eventModalTitle").textContent = event.name || "Edit Event";
    $("eventSaveBtn").textContent = "SAVE CHANGES";
    $("eventModal").classList.remove("hidden");
  }

  function closeEventModal() {
    $("eventModal").classList.add("hidden");
  }

  function validateForm() {
    if (!$("eventNameInput").value.trim()) return "Enter an event / gig name.";
    if (!$("eventVenueInput").value) return "Choose a saved venue.";
    if (!$("eventDateInput").value) return "Choose the event date.";
    if (!$("eventStartTimeInput").value) return "Choose the scheduled start time.";
    if (!$("eventEndTimeInput").value) return "Choose the scheduled end time.";
    if (!typeOptions.includes($("eventTypeInput").value)) return "Choose a valid event type.";
    return "";
  }

  function buildScheduledTimes(dateString, startTime, endTime) {
    if (!dateString || !startTime || !endTime) {
      return {
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduledDurationMs: null
      };
    }

    const startDate = new Date(`${dateString}T${startTime}:00`);
    let endDate = new Date(`${dateString}T${endTime}:00`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return {
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduledDurationMs: null
      };
    }

    // Overnight performance, e.g. 22:00 -> 01:00.
    if (endDate <= startDate) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    return {
      scheduledStartAt: firebase.firestore.Timestamp.fromDate(startDate),
      scheduledEndAt: firebase.firestore.Timestamp.fromDate(endDate),
      scheduledDurationMs: endDate.getTime() - startDate.getTime()
    };
  }

  async function saveEvent() {
    const validation = validateForm();
    if (validation) {
      $("eventFormMessage").textContent = validation;
      return;
    }

    const id = $("eventIdInput").value.trim();
    const saveBtn = $("eventSaveBtn");
    saveBtn.disabled = true;
    $("eventFormMessage").textContent = "Saving…";

    const selectedVenue = getSelectedVenue();

    const schedule = buildScheduledTimes(
      $("eventDateInput").value,
      $("eventStartTimeInput").value,
      $("eventEndTimeInput").value
    );

    const payload = {
      name: $("eventNameInput").value.trim(),

      // Save both the Venue document link and a snapshot of its display data.
      // This keeps old event records readable even if the Venue is edited later.
      venueId: selectedVenue?.id || "",
      venue: selectedVenue?.name || "",
      type: $("eventTypeInput").value,
      status: $("eventStatusInput").value,
      date: $("eventDateInput").value,
      startTime: $("eventStartTimeInput").value,
      endTime: $("eventEndTimeInput").value,

      // Canonical schedule fields used by Performance Sessions and Top Status Bar.
      scheduledStartAt: schedule.scheduledStartAt,
      scheduledEndAt: schedule.scheduledEndAt,
      scheduledDurationMs: schedule.scheduledDurationMs,

      arrivalTime: $("eventArrivalTimeInput").value,
      address: selectedVenue?.address || "",
      contactName: selectedVenue?.contactName || "",
      contact: venueCombinedContact(selectedVenue),
      venueLocality: selectedVenue?.locality || "",
      venueContactPhone: selectedVenue?.contactPhone || "",
      venueContactEmail: selectedVenue?.contactEmail || "",
      notes: $("eventNotesInput").value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.email || ""
    };

    try {
      if (id) {
        await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        payload.createdBy = firebase.auth().currentUser?.email || "";
        await db.collection(COLLECTION).add(payload);
      }

      closeEventModal();
    } catch (error) {
      console.error("Could not save event:", error);
      $("eventFormMessage").textContent = error.message || "Could not save event.";
    } finally {
      saveBtn.disabled = false;
    }
  }

  function askDelete(id) {
    const event = events.find(item => item.id === id);
    if (!event) return;

    pendingDeleteId = id;
    $("deleteEventMessage").textContent =
      `Remove "${event.name || "this event"}"${event.date ? ` on ${formatDate(event.date).full}` : ""}? This cannot be undone.`;

    $("deleteEventModal").classList.remove("hidden");
  }

  function closeDeleteModal() {
    pendingDeleteId = "";
    $("deleteEventModal").classList.add("hidden");
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;

    const id = pendingDeleteId;
    const button = $("deleteEventConfirmBtn");
    button.disabled = true;

    try {
      await db.collection(COLLECTION).doc(id).delete();
      closeDeleteModal();
    } catch (error) {
      console.error("Could not delete event:", error);
      $("deleteEventMessage").textContent = error.message || "Could not delete event.";
    } finally {
      button.disabled = false;
    }
  }

  function startEventListener() {
    if (unsubscribeEvents) unsubscribeEvents();

    unsubscribeEvents = db.collection(COLLECTION)
      .onSnapshot(snapshot => {
        events = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() || {})
        }));

        renderEvents();
      }, error => {
        console.error("Could not load upcoming events:", error);
        $("eventsList").innerHTML = `
          <div class="events-empty">
            Could not load events.<br>
            <small>${escapeHTML(error.message || "Firestore error")}</small>
          </div>
        `;
      });
  }

  async function loadSidebarFallback() {
    const container = $("sidebarContainer");
    if (!container || container.children.length) return;

    try {
      const response = await fetch("includes/sidebar.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sidebar request failed ${response.status}`);
      container.innerHTML = await response.text();

      const eventsLink = container.querySelector('[data-page="events"]');
      eventsLink?.classList.add("active");
    } catch (error) {
      console.warn("Could not load Admin sidebar:", error);
    }
  }

  function markEventsSidebarLink() {
    setTimeout(() => {
      document.querySelector('[data-page="events"]')?.classList.add("active");
    }, 150);
  }

  function bindUI() {
    $("newEventBtn").onclick = openCreateModal;
    $("eventsBackBtn").onclick = () => { window.location.href = "admin.html"; };
    $("refreshEventsBtn").onclick = renderEvents;

    $("manageEventTypesBtn").onclick = openEventTypesModal;
    $("eventTypesCloseBtn").onclick = closeEventTypesModal;
    $("eventTypesDoneBtn").onclick = closeEventTypesModal;
    $("addEventTypeBtn").onclick = addEventType;
    $("newEventTypeInput").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addEventType();
      }
    });

    $("eventModalCloseBtn").onclick = closeEventModal;
    $("eventCancelBtn").onclick = closeEventModal;
    $("eventSaveBtn").onclick = saveEvent;
    $("eventVenueInput").addEventListener("change", handleVenueSelection);
    $("eventTypeInput").addEventListener("change", () => updateAutomaticEventName());
    $("eventDateInput").addEventListener("change", () => updateAutomaticEventName());

    $("eventNameInput").addEventListener("input", () => {
      const value = $("eventNameInput").value;
      eventNameManuallyEdited = value !== lastAutoEventName;
    });

    $("deleteEventCancelBtn").onclick = closeDeleteModal;
    $("deleteEventConfirmBtn").onclick = confirmDelete;

    ["eventsSearch", "eventsTypeFilter", "eventsStatusFilter", "eventsRangeFilter"]
      .forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener(el.tagName === "INPUT" ? "input" : "change", renderEvents);
      });

    document.addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-event]");
      if (edit) {
        openEditModal(edit.dataset.editEvent);
        return;
      }

      const summaryType = event.target.closest("[data-summary-type]");
      if (summaryType) {
        const type = summaryType.dataset.summaryType || "";
        if ($("eventsTypeFilter")) {
          $("eventsTypeFilter").value = type;
          renderEvents();
          $("eventsList")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      const remove = event.target.closest("[data-delete-event]");
      if (remove) {
        askDelete(remove.dataset.deleteEvent);
        return;
      }

      const removeType = event.target.closest("[data-remove-event-type]");
      if (removeType) {
        removeEventType(removeType.dataset.removeEventType);
      }
    });

    $("eventTypesList")?.addEventListener("change", event => {
      const input = event.target.closest("[data-event-type-color]");
      if (!input) return;

      const type = input.dataset.eventTypeColor || "";
      const color = input.value || "#8ea3ad";
      if (!type) return;

      saveEventTypes(
        typeOptions,
        { ...typeColors, [type]: color }
      );
    });

    $("eventModal").addEventListener("click", event => {
      if (event.target === $("eventModal")) closeEventModal();
    });

    $("deleteEventModal").addEventListener("click", event => {
      if (event.target === $("deleteEventModal")) closeDeleteModal();
    });

    $("eventTypesModal").addEventListener("click", event => {
      if (event.target === $("eventTypesModal")) closeEventTypesModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeEventModal();
        closeDeleteModal();
        closeEventTypesModal();
      }
    });
  }

  function showApp() {
    $("eventsAuthGate").classList.add("hidden");
    $("eventsApp").hidden = false;

    loadSidebarFallback();
    markEventsSidebarLink();
    startEventTypesListener();
    startVenueListener();
    startEventListener();
  }

  function init() {
    bindUI();

    // Reuse the existing Firebase Admin auth session. No second login page.
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        // The Admin dashboard owns authentication. Send the user there if the
        // previous session has actually expired.
        window.location.replace("admin.html");
        return;
      }

      showApp();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
