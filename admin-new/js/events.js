(() => {
  "use strict";

  const COLLECTION = "venues";
  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  let venues = [];
  let unsubscribeVenues = null;
  let pendingDeleteId = "";

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function combinedContact(venue) {
    const phone = String(venue.contactPhone || "").trim();
    const email = String(venue.contactEmail || "").trim();
    return [phone, email].filter(Boolean).join(" • ");
  }

  function filteredVenues() {
    const search = String($("venueSearchInput")?.value || "").trim().toLowerCase();

    return venues
      .filter(venue => {
        if (!search) return true;

        const haystack = [
          venue.name,
          venue.address,
          venue.locality,
          venue.contactName,
          venue.contactPhone,
          venue.contactEmail,
          venue.website,
          venue.loadIn,
          venue.technical,
          venue.notes
        ].join(" ").toLowerCase();

        return haystack.includes(search);
      })
      .sort((a,b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
  }

  function renderSummary() {
    $("venueCount").textContent = String(venues.length);
    $("venueContactCount").textContent = String(
      venues.filter(v => v.contactName || v.contactPhone || v.contactEmail).length
    );
    $("venueAddressCount").textContent = String(
      venues.filter(v => v.address).length
    );
  }

  function renderVenues() {
    const list = $("venuesList");
    if (!list) return;

    const data = filteredVenues();
    $("venuesResultCount").textContent = `${data.length} venue${data.length === 1 ? "" : "s"}`;

    if (!data.length) {
      list.innerHTML = `<div class="venues-empty">No venues match the current search.</div>`;
      renderSummary();
      return;
    }

    list.innerHTML = data.map(venue => `
      <article class="venue-row">
        <div class="venue-row-main">
          <strong>${escapeHTML(venue.name || "Untitled Venue")}</strong>
          <span>${escapeHTML(venue.locality || venue.notes || "No locality / notes")}</span>
        </div>

        <div class="venue-row-address">
          <strong>${escapeHTML(venue.address || "No address")}</strong>
          <span>${escapeHTML(venue.website || "No website / map URL")}</span>
        </div>

        <div class="venue-row-contact">
          <strong>${escapeHTML(venue.contactName || "No contact")}</strong>
          <span>${escapeHTML(combinedContact(venue) || "No phone / email")}</span>
        </div>

        <div class="venue-capacity">
          <strong>${escapeHTML(venue.capacity || "—")}</strong>
          <span>CAPACITY</span>
        </div>

        <div class="venue-row-actions">
          <button type="button" data-edit-venue="${escapeHTML(venue.id)}" title="Edit venue">✎</button>
          <button type="button" class="delete" data-delete-venue="${escapeHTML(venue.id)}" title="Delete venue">🗑</button>
        </div>
      </article>
    `).join("");

    renderSummary();
  }

  function resetForm() {
    $("venueIdInput").value = "";
    $("venueNameInput").value = "";
    $("venueAddressInput").value = "";
    $("venueLocalityInput").value = "";
    $("venueWebsiteInput").value = "";
    $("venueContactNameInput").value = "";
    $("venueContactPhoneInput").value = "";
    $("venueContactEmailInput").value = "";
    $("venueDefaultArrivalInput").value = "";
    $("venueCapacityInput").value = "";
    $("venueLoadInInput").value = "";
    $("venueTechnicalInput").value = "";
    $("venueNotesInput").value = "";
    $("venueFormMessage").textContent = "";
  }

  function openNewVenue() {
    resetForm();
    $("venueModalMode").textContent = "NEW VENUE";
    $("venueModalTitle").textContent = "Create Venue";
    $("venueSaveBtn").textContent = "SAVE VENUE";
    $("venueModal").classList.remove("hidden");
    setTimeout(() => $("venueNameInput").focus(), 30);
  }

  function openEditVenue(id) {
    const venue = venues.find(item => item.id === id);
    if (!venue) return;

    resetForm();

    $("venueIdInput").value = venue.id;
    $("venueNameInput").value = venue.name || "";
    $("venueAddressInput").value = venue.address || "";
    $("venueLocalityInput").value = venue.locality || "";
    $("venueWebsiteInput").value = venue.website || "";
    $("venueContactNameInput").value = venue.contactName || "";
    $("venueContactPhoneInput").value = venue.contactPhone || "";
    $("venueContactEmailInput").value = venue.contactEmail || "";
    $("venueDefaultArrivalInput").value = venue.defaultArrivalTime || "";
    $("venueCapacityInput").value = venue.capacity || "";
    $("venueLoadInInput").value = venue.loadIn || "";
    $("venueTechnicalInput").value = venue.technical || "";
    $("venueNotesInput").value = venue.notes || "";

    $("venueModalMode").textContent = "EDIT VENUE";
    $("venueModalTitle").textContent = venue.name || "Edit Venue";
    $("venueSaveBtn").textContent = "SAVE CHANGES";
    $("venueModal").classList.remove("hidden");
  }

  function closeVenueModal() {
    $("venueModal").classList.add("hidden");
  }

  async function saveVenue() {
    const name = $("venueNameInput").value.trim();
    if (!name) {
      $("venueFormMessage").textContent = "Enter a venue name.";
      return;
    }

    if (!db) {
      $("venueFormMessage").textContent = "Firestore is not available.";
      return;
    }

    const id = $("venueIdInput").value.trim();
    const button = $("venueSaveBtn");
    button.disabled = true;
    $("venueFormMessage").textContent = "Saving…";

    const payload = {
      name,
      address: $("venueAddressInput").value.trim(),
      locality: $("venueLocalityInput").value.trim(),
      website: $("venueWebsiteInput").value.trim(),
      contactName: $("venueContactNameInput").value.trim(),
      contactPhone: $("venueContactPhoneInput").value.trim(),
      contactEmail: $("venueContactEmailInput").value.trim(),
      defaultArrivalTime: $("venueDefaultArrivalInput").value,
      capacity: $("venueCapacityInput").value ? Number($("venueCapacityInput").value) : null,
      loadIn: $("venueLoadInInput").value.trim(),
      technical: $("venueTechnicalInput").value.trim(),
      notes: $("venueNotesInput").value.trim(),
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

      closeVenueModal();
    } catch (error) {
      console.error("Could not save venue:", error);
      $("venueFormMessage").textContent = error.message || "Could not save venue.";
    } finally {
      button.disabled = false;
    }
  }

  function askDeleteVenue(id) {
    const venue = venues.find(item => item.id === id);
    if (!venue) return;

    pendingDeleteId = id;
    $("deleteVenueMessage").textContent =
      `Remove "${venue.name || "this venue"}"? This cannot be undone.`;
    $("deleteVenueModal").classList.remove("hidden");
  }

  function closeDeleteVenue() {
    pendingDeleteId = "";
    $("deleteVenueModal").classList.add("hidden");
  }

  async function confirmDeleteVenue() {
    if (!pendingDeleteId || !db) return;

    const button = $("deleteVenueConfirmBtn");
    button.disabled = true;

    try {
      await db.collection(COLLECTION).doc(pendingDeleteId).delete();
      closeDeleteVenue();
    } catch (error) {
      console.error("Could not delete venue:", error);
      $("deleteVenueMessage").textContent = error.message || "Could not delete venue.";
    } finally {
      button.disabled = false;
    }
  }

  function startVenueListener() {
    if (!db) {
      $("venuesList").innerHTML = `<div class="venues-empty">Firestore is not available.</div>`;
      return;
    }

    if (unsubscribeVenues) unsubscribeVenues();

    unsubscribeVenues = db.collection(COLLECTION).onSnapshot(snapshot => {
      venues = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      renderVenues();
    }, error => {
      console.error("Could not load venues:", error);
      $("venuesList").innerHTML =
        `<div class="venues-empty">Could not load venues.<br><small>${escapeHTML(error.message || "")}</small></div>`;
    });
  }

  async function loadSidebar() {
    const container = $("sidebarContainer");
    if (!container) return;

    try {
      const response = await fetch("includes/sidebar.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sidebar request failed ${response.status}`);
      container.innerHTML = await response.text();
      container.querySelector('[data-page="venues"]')?.classList.add("active");
    } catch (error) {
      console.warn("Could not load Admin sidebar:", error);
    }
  }

  function bindUI() {
    $("venuesBackBtn").onclick = () => { window.location.href = "admin.html"; };
    $("newVenueBtn").onclick = openNewVenue;
    $("refreshVenuesBtn").onclick = renderVenues;
    $("venueSearchInput").addEventListener("input", renderVenues);

    $("venueModalCloseBtn").onclick = closeVenueModal;
    $("venueCancelBtn").onclick = closeVenueModal;
    $("venueSaveBtn").onclick = saveVenue;

    $("deleteVenueCancelBtn").onclick = closeDeleteVenue;
    $("deleteVenueConfirmBtn").onclick = confirmDeleteVenue;

    document.addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-venue]");
      if (edit) {
        openEditVenue(edit.dataset.editVenue);
        return;
      }

      const remove = event.target.closest("[data-delete-venue]");
      if (remove) {
        askDeleteVenue(remove.dataset.deleteVenue);
      }
    });

    $("venueModal").addEventListener("click", event => {
      if (event.target === $("venueModal")) closeVenueModal();
    });

    $("deleteVenueModal").addEventListener("click", event => {
      if (event.target === $("deleteVenueModal")) closeDeleteVenue();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeVenueModal();
        closeDeleteVenue();
      }
    });
  }

  function showApp() {
    $("venuesAuthGate").classList.add("hidden");
    $("venuesApp").hidden = false;
    loadSidebar();
    startVenueListener();
  }

  function init() {
    bindUI();

    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
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
