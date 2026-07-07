(function () {
  function listenRequestsForSession(sessionId) {
    if (LK.state.requestsUnsubscribe) LK.state.requestsUnsubscribe();
    if (!sessionId) {
      LK.state.currentRequests = [];
      renderActiveRequests();
      return;
    }

    LK.state.requestsUnsubscribe = LK.db.collection("publicSongRequests")
      .where("sessionId", "==", sessionId)
      .onSnapshot(snap => {
        LK.state.currentRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderActiveRequests();
        LK.sessions.updateDashboard(LK.state.currentSessionData);
      }, err => {
        console.error(err);
        LK.dashboard.logAdmin("Request listener error: " + err.message);
      });
  }

  function renderActiveRequests() {
    const box = $("activeRequestsList");
    if (!box) return;

    const active = LK.state.currentRequests.filter(r => !r.status || r.status === "active" || r.status === "pending" || r.status === "waiting");
    const sort = $("requestSortSelect")?.value || "oldest";

    active.sort((a, b) => {
      if (sort === "song") return String(a.songTitle || a.title || "").localeCompare(String(b.songTitle || b.title || ""));
      const da = LK.dashboard.getDateFromTimestamp(a.createdAt)?.getTime() || 0;
      const dbb = LK.dashboard.getDateFromTimestamp(b.createdAt)?.getTime() || 0;
      return sort === "newest" ? dbb - da : da - dbb;
    });

    if ($("activeRequestCount")) $("activeRequestCount").innerText = `(${active.length})`;

    if (!active.length) {
      box.innerHTML = `<div class="request-empty">No active song requests</div>`;
      return;
    }

    box.innerHTML = `<div class="request-header"><div>#</div><div>Song</div><div>Requested By</div><div>BPM</div><div>Time</div><div>Actions</div></div>`;

    active.forEach((req, i) => {
      const row = document.createElement("div");
      row.className = "active-request-row";
      const title = req.songTitle || req.title || "Untitled";
      const artist = req.songArtist || req.artist || "";
      const name = req.singerName || req.name || "Unknown";
      const locationAge = [req.location, req.ageRange].filter(Boolean).join(" · ");
      const bpm = req.userBpm || req.songUserBpm || req.bpm || "-";

      row.innerHTML = `
        <div class="request-number">${i + 1}</div>
        <div class="request-main"><strong>${LK.dashboard.escapeHTML(title)}</strong><span>${LK.dashboard.escapeHTML(artist)}</span></div>
        <div class="request-person"><strong>${LK.dashboard.escapeHTML(name)}</strong><span>${LK.dashboard.escapeHTML(locationAge)}</span></div>
        <div>${LK.dashboard.escapeHTML(bpm)}</div>
        <div>${LK.dashboard.minutesAgo(req.createdAt)} mins ago</div>
        <div class="request-actions">
          <button class="request-done" onclick="completeRequest('${req.id}')">★</button>
          <button class="request-abandoned" onclick="openReasonModal('${req.id}', 'abandoned')">🚶</button>
          <button class="request-delete" onclick="openReasonModal('${req.id}', 'deleted')">×</button>
        </div>`;
      box.appendChild(row);
    });
  }

  async function completeRequest(id) {
    await LK.db.collection("publicSongRequests").doc(id).set({ status: "completed", completedAt: serverNow(), updatedAt: serverNow() }, { merge: true });
    LK.sessions.setSessionStatus("Request completed.");
  }

  function openReasonModal(id, mode) {
    LK.state.reasonRequestId = id;
    LK.state.reasonMode = mode;
    $("reasonModalTitle").innerText = mode === "abandoned" ? "Mark Request Abandoned" : "Delete Request";
    $("reasonModalInput").value = "";
    $("reasonModal").classList.remove("hidden");
    $("reasonConfirmBtn").onclick = confirmRequestReason;
  }

  function closeReasonModal() {
    $("reasonModal").classList.add("hidden");
    LK.state.reasonRequestId = null;
  }

  async function confirmRequestReason() {
    if (!LK.state.reasonRequestId) return;
    const note = $("reasonModalInput").value || "";
    const patch = { status: LK.state.reasonMode, reason: note, updatedAt: serverNow() };
    if (LK.state.reasonMode === "abandoned") patch.abandonedAt = serverNow();
    else patch.deletedAt = serverNow();
    await LK.db.collection("publicSongRequests").doc(LK.state.reasonRequestId).set(patch, { merge: true });
    closeReasonModal();
    LK.sessions.setSessionStatus(LK.state.reasonMode === "abandoned" ? "Request abandoned." : "Request deleted.");
  }

  function initRequests() {
    renderActiveRequests();
  }

  LK.requests = { initRequests, listenRequestsForSession, renderActiveRequests };
  window.renderActiveRequests = renderActiveRequests;
  window.completeRequest = completeRequest;
  window.openReasonModal = openReasonModal;
  window.closeReasonModal = closeReasonModal;
  window.confirmRequestReason = confirmRequestReason;
})();
