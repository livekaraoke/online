(() => {
  "use strict";

  const COLLECTION = "upcomingEvents";
  const VENUES_COLLECTION = "venues";
  const TYPE_OPTIONS = ["Live Karaoke", "Roxanna", "Solo"];
  const STATUS_OPTIONS = ["Confirmed", "Tentative", "Cancelled"];

  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  let events = [];
  let venues = [];
  let unsubscribeEvents = null;
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

  function getFilteredEvents() {
    const search = String($("eventsSearch")?.value || "").trim().toLowerCase();
    const type = $("eventsTypeFilter")?.value || "";
    const status = $("eventsStatusFilter")?.value || "";
    const range = $("eventsRangeFilter")?.value || "upcoming";

    return events
      .filter(event => {
        if (type && event.type !== type) return false;
        if (status && event.status !== status) return false;

        const past = isPast(event);
        if (range === "upcoming" && past) return false;
        if (range === "past" && !past) return false;

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

  function renderSummary() {
    const now = new Date();
    const today = localDateKey(now);
    const monthPrefix = today.slice(0, 7);

    const upcoming = events
      .filter(event => !isPast(event) && event.status !== "Cancelled")
      .sort((a, b) => eventSortValue(a).localeCompare(eventSortValue(b)));

    const next = upcoming[0] || null;

    $("upcomingCount").textContent = String(upcoming.length);
    $("thisMonthCount").textContent = String(
      events.filter(event => String(event.date || "").startsWith(monthPrefix)).length
    );
    $("karaokeCount").textContent = String(
      upcoming.filter(event => event.type === "Live Karaoke").length
    );

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
            <span>${notesPreview}</span>
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
            <span class="event-type-badge ${typeClass}">${escapeHTML(event.type || "Live Karaoke")}</span>
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
      }
    }, error => {
      console.error("Could not load saved venues:", error);
      const select = $("eventVenueInput");
      if (select) {
        select.innerHTML = `<option value="">Could not load venues</option>`;
      }
    });
  }

  function resetForm() {
    $("eventIdInput").value = "";
    $("eventNameInput").value = "";
    populateVenueSelect("");
    $("eventVenueInput").value = "";
    $("eventTypeInput").value = "Live Karaoke";
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
    $("eventTypeInput").value = TYPE_OPTIONS.includes(event.type) ? event.type : "Live Karaoke";
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
    if (!TYPE_OPTIONS.includes($("eventTypeInput").value)) return "Choose a valid event type.";
    return "";
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

    $("eventModalCloseBtn").onclick = closeEventModal;
    $("eventCancelBtn").onclick = closeEventModal;
    $("eventSaveBtn").onclick = saveEvent;
    $("eventVenueInput").addEventListener("change", handleVenueSelection);

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

      const remove = event.target.closest("[data-delete-event]");
      if (remove) {
        askDelete(remove.dataset.deleteEvent);
      }
    });

    $("eventModal").addEventListener("click", event => {
      if (event.target === $("eventModal")) closeEventModal();
    });

    $("deleteEventModal").addEventListener("click", event => {
      if (event.target === $("deleteEventModal")) closeDeleteModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeEventModal();
        closeDeleteModal();
      }
    });
  }

  function showApp() {
    $("eventsAuthGate").classList.add("hidden");
    $("eventsApp").hidden = false;

    loadSidebarFallback();
    markEventsSidebarLink();
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
