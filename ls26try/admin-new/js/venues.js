/* Copyright © 2026 LiveSuite. All rights reserved.
 * admin-new/js/venues.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
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
          venue.mapUrl,
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
      <article class="venue-row${venue.closedDown ? " closed-down" : ""}">
        <div class="venue-row-main">
          <div class="venue-name-line">
            <strong>${escapeHTML(venue.name || "Untitled Venue")}</strong>
            ${venue.closedDown ? '<span class="venue-closed-badge">CLOSED DOWN</span>' : ''}
          </div>
          <span>${escapeHTML(venue.locality || venue.notes || "No locality / notes")}</span>
        </div>

        <div class="venue-row-address">
          <strong>${escapeHTML(venue.address || "No address")}</strong>
          <span>${escapeHTML(venue.website || "No website URL")}</span>
          <span>${escapeHTML(venue.mapUrl || "No map URL")}</span>
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
          <button type="button" class="history" data-history-venue="${escapeHTML(venue.id)}" title="Bookings, payments and repertoire">HISTORY</button>
          <button type="button" class="edit" data-edit-venue="${escapeHTML(venue.id)}" title="Edit venue">✎ <span>EDIT</span></button>
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
    $("venueMapInput").value = "";
    $("venueClosedInput").checked = false;
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
    $("venueMapInput").value = venue.mapUrl || "";
    $("venueClosedInput").checked = venue.closedDown === true;
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

  const gigOps=window.LS26GigOps;
  const historyMoney=value=>"€"+gigOps.money(value).toFixed(2);
  async function verifyVenueUnique(id,payload){
    const snap=await db.collection(COLLECTION).get();
    const match=snap.docs.find(doc=>doc.id!==id&&gigOps.sameVenue(payload,doc.data()||{}));
    if(match)throw Error('This venue appears to already exist as "'+(match.data().name||match.id)+'". Open the existing venue instead. No record was changed.');
  }
  async function loadVenueReferences(venue){
    const id=venue.id,name=venue.name||"";
    const q=[db.collection("upcomingEvents").where("venueId","==",id).limit(1).get(),
      db.collection("performanceSessions").where("venueId","==",id).limit(1).get()];
    if(name){
      q.push(db.collection("upcomingEvents").where("venue","==",name).limit(15).get());
      q.push(db.collection("performanceSessions").where("venue","==",name).limit(15).get());
    }
    const results=await Promise.all(q);
    const actual=results.slice(0,2).some(s=>!s.empty);
    // Old records may contain only the venue's name; protect those too.
    const legacy=results.slice(2).some(s=>s.docs.some(doc=>!doc.data().venueId||doc.data().venueId===id));
    return {blocked:actual||legacy,events:results[0].size,sessions:results[1].size};
  }
  function closeVenueHistory(){$("venueHistoryModal").classList.add("hidden");}
  const dateValue=x=>{if(!x)return "";if(typeof x.toDate==="function")return x.toDate().toLocaleDateString("en-GB");return String(x).slice(0,10);};
  async function openVenueHistory(id){
    const venue=venues.find(v=>v.id===id);
    if(!venue)return;
    $("venueHistoryTitle").textContent=venue.name||"Venue History";
    $("venueHistoryContent").textContent="Loading bookings and performance history…";
    $("venueHistoryModal").classList.remove("hidden");
    try{
      const query=[db.collection("upcomingEvents").where("venueId","==",id).limit(250).get(),
        db.collection("performanceSessions").where("venueId","==",id).limit(250).get(),
        db.collection("gigFinances").where("venueId","==",id).limit(250).get(),
        db.collection("upcomingEvents").where("venue","==",venue.name||"").limit(100).get(),
        db.collection("performanceSessions").where("venue","==",venue.name||"").limit(100).get()];
      const results=await Promise.allSettled(query);
      if(results[0].status==="rejected"||results[1].status==="rejected")throw Error("Venue history unavailable: "+(results.find(x=>x.status==="rejected")?.reason?.message||"Firestore permission failure"));
      const read=(index)=>results[index].status==="fulfilled"?results[index].value.docs:[];
      const collect=(primary,legacy)=>[...new Map([...read(primary),...read(legacy)].filter(doc=>{
        const value=doc.data()||{};return !value.venueId||value.venueId===id;
      }).map(doc=>[doc.id,{id:doc.id,...(doc.data()||{})}])).values()];
      const gigs=collect(0,3),sessions=collect(1,4);
      const moneyData=read(2).map(doc=>doc.data()||{});
      const financeTotals=moneyData.reduce((a,f)=>{a.agreed+=gigOps.money(f.agreedFee);a.received+=gigOps.money(f.amountReceived);a.outstanding+=gigOps.financeSummary(f).outstanding;a.net+=gigOps.financeSummary(f).personalNet;return a;},{agreed:0,received:0,outstanding:0,net:0});
      const songs=new Map();let plays=0;
      sessions.forEach(session=>{
        const performed=Array.isArray(session.playedSongsSnapshot)?session.playedSongsSnapshot:[];
        const logs=Array.isArray(session.performanceLogSnapshot)?session.performanceLogSnapshot:[];
        const seen=new Set();
        [...performed,...logs].forEach(item=>{
          const key=item.performanceId||[item.songId||item.songTitle,item.playedAtMs||item.playedAt?.seconds||item.startedAtMs||""].join(":");
          if(seen.has(key))return;seen.add(key);
          const song=item.songTitle||item.title||item.songId||"Unknown song";
          songs.set(song,(songs.get(song)||0)+1);plays++;
        });
      });
      const latest=[...gigs].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,15);
      const favourites=[...songs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
      const financeWarning=results[2].status==="rejected"?"<p class='venue-history-note'>Finance access unavailable: deploy owner-only gigFinances rules to show payments. Performance history is still available.</p>":"";
      $("venueHistoryContent").innerHTML=
        '<p class="venue-history-note">Read-only · Existing venue, gig and session IDs preserved. Showing at most 250 linked records per collection.</p>'+
        '<div class="venue-history-stats">'+
        [['Bookings',gigs.length],['Sessions',sessions.length],['Songs logged',plays],
          ['Agreed total',historyMoney(financeTotals.agreed)],['Collected',historyMoney(financeTotals.received)],
          ['Outstanding',historyMoney(financeTotals.outstanding)],['My net earnings',historyMoney(financeTotals.net)]]
          .map(([name,value])=>'<div><strong>'+escapeHTML(value)+'</strong><small>'+escapeHTML(name)+'</small></div>').join('')+'</div>'+
        financeWarning+
        '<section class="venue-history-section"><h3>Recent gigs & bookings</h3>'+
        (latest.length?latest.map(e=>'<div class="venue-history-row"><strong>'+escapeHTML(e.name||e.type||"Gig")+'</strong><span>'+escapeHTML(e.date||"")+' · '+escapeHTML(e.type||"")+' · '+escapeHTML(e.status||"")+'</span></div>').join(''):'<p>No linked bookings recorded.</p>')+
        '</section><section class="venue-history-section"><h3>Most performed songs</h3>'+
        (favourites.length?favourites.map(([name,count])=>'<div class="venue-history-row"><strong>'+escapeHTML(name)+'</strong><span>'+count+' plays</span></div>').join(''):'<p>No archived performed-song records for this venue.</p>')+'</section>';
    }catch(error){console.error("Venue history:",error);$("venueHistoryContent").textContent=error.message||"Could not load venue history.";}
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
      mapUrl: $("venueMapInput").value.trim(),
      closedDown: $("venueClosedInput").checked === true,
      closedDownAt: $("venueClosedInput").checked === true
        ? (firebase.firestore.FieldValue.serverTimestamp())
        : null,
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
      await verifyVenueUnique(id,payload);
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
      const venue=venues.find(item=>item.id===pendingDeleteId);
      if(!venue)throw Error("Venue not found. Refresh the directory.");
      const links=await loadVenueReferences(venue);
      if(links.blocked){
        $("deleteVenueMessage").textContent="Deletion blocked. Existing gigs or historical sessions reference this venue. Preserve its ID; mark it closed instead.";
        return;
      }
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
    if (window.LK?.sidebar?.loadSidebar) {
      await LK.sidebar.loadSidebar();
      return;
    }
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
    $("venueHistoryCloseBtn").onclick=closeVenueHistory;
    $("venueHistoryDoneBtn").onclick=closeVenueHistory;
    $("deleteVenueConfirmBtn").onclick = confirmDeleteVenue;

    document.addEventListener("click", event => {
      const history=event.target.closest("[data-history-venue]");
      if(history){openVenueHistory(history.dataset.historyVenue);return;}
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
        closeDeleteVenue();closeVenueHistory();
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
