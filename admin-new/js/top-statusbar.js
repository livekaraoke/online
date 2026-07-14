(function () {
  "use strict";

  const scriptElement = document.currentScript;

  let currentSession = null;
  let currentRequests = [];
  let notifications = [];

  let topStatusSessionUnsub = null;
  let topStatusRequestsUnsub = null;
  let topStatusActiveQueryUnsub = null;

  let requestsListenerInitialized = false;
  let knownActiveRequestIds = new Set();

  let breakActionRunning = false;
  let notesSaveTimer = null;
  let notesInputConnected = false;

  let lastSeenNotificationTime = Number(
    localStorage.getItem("lkTopStatusSeen") || 0
  );

  function $(id) {
    return document.getElementById(id);
  }

  function getDb() {
    if (window.LK && window.LK.db) {
      return window.LK.db;
    }

    if (window.db) {
      return window.db;
    }

    if (
      window.firebase &&
      Array.isArray(firebase.apps) &&
      firebase.apps.length
    ) {
      return firebase.firestore();
    }

    return null;
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function nowTimestamp() {
    return firebase.firestore.Timestamp.now();
  }

  /************************************************************
   * LOAD INCLUDE
   ************************************************************/

  async function loadTopStatusBar() {
    const target = $("topStatusContainer");

    if (!target) {
      return;
    }

    const includePath =
      scriptElement?.dataset.include ||
      "../../admin-new/includes/top-statusbar.html";

    try {
      const response = await fetch(includePath);

      if (!response.ok) {
        throw new Error(
          `Top status bar include not found: ${includePath}`
        );
      }

      target.innerHTML = await response.text();

      renderNotifications();
      renderSession();
      renderRequests();

      connectSessionNotesInput();
      listenStatus();
      listenCurrentSession();
      
    } catch (error) {
      console.error("Could not load top status bar:", error);

      target.innerHTML = `
        <div class="top-status-load-error">
          Could not load the performance status bar.
        </div>
      `;
    }
  }

  /************************************************************
   * EXPAND / COLLAPSE
   ************************************************************/

  function toggle() {
    const bar = $("topStatusBar");
    const button = $("tsToggleBtn");
    const strip = bar?.querySelector(".top-status-strip");

    if (!bar) {
      return;
    }

    const willExpand = !bar.classList.contains("expanded");

    bar.classList.toggle("expanded", willExpand);
    bar.classList.toggle("collapsed", !willExpand);

    if (button) {
      button.innerText = willExpand ? "▲" : "▼";
      button.setAttribute(
        "aria-label",
        willExpand
          ? "Collapse status dashboard"
          : "Expand status dashboard"
      );
    }

    if (strip) {
      strip.setAttribute(
        "aria-expanded",
        willExpand ? "true" : "false"
      );
    }

    if (willExpand) {
      markNotificationsSeen();
    }
  }

  /************************************************************
   * NOTIFICATIONS
   ************************************************************/

  function markNotificationsSeen() {
    lastSeenNotificationTime = Date.now();

    localStorage.setItem(
      "lkTopStatusSeen",
      String(lastSeenNotificationTime)
    );

    $("topStatusBar")?.classList.remove("has-new");

    renderNotifications();
  }

  function addNotification(text) {
    const item = {
      text: String(text || ""),
      time: Date.now()
    };

    notifications.unshift(item);
    notifications = notifications.slice(0, 30);

    renderNotifications();

    if (item.time > lastSeenNotificationTime) {
      $("topStatusBar")?.classList.add("has-new");
    }
  }

  function renderNotifications() {
    const label = $("tsNotificationLabel");
    const badge = $("tsNotificationBadge");
    const list = $("tsNotificationsList");

    const unseen = notifications.filter(
      item => item.time > lastSeenNotificationTime
    );

    if (label) {
      label.innerText = unseen.length
        ? `${unseen.length} new alert${unseen.length === 1 ? "" : "s"}`
        : "No new alerts";
    }

    if (badge) {
      badge.innerText = String(unseen.length);
      badge.classList.toggle("hidden", unseen.length === 0);
    }

    if (!list) {
      return;
    }

    if (!notifications.length) {
      list.innerHTML = `
        <div class="top-status-empty">
          No notifications yet.
        </div>
      `;

      return;
    }

    list.innerHTML = notifications
      .slice(0, 8)
      .map(item => {
        const time = new Date(item.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });

        return `
          <div class="top-status-notification">
            <span class="notification-state-dot"></span>

            <span class="notification-text">
              ${escapeHTML(item.text)}
            </span>

            <time>${escapeHTML(time)}</time>
          </div>
        `;
      })
      .join("");
  }

  /************************************************************
   * LIVE AND PUBLIC-LIST STATUS
   ************************************************************/

  function listenStatus() {
    const dbRef = getDb();

    if (!dbRef) {
      console.error("Top status bar: Firestore was not found.");
      return;
    }

    dbRef
      .collection("karaoke")
      .doc("state")
      .onSnapshot(
        snapshot => {
          const data = snapshot.data() || {};

          const isLive = data.isLive === true;
          const songsEnabled = data.songsEnabled === true;

          setText(
            "tsLiveLabel",
            isLive ? "LIVE NOW!" : "Offline"
          );

          setText(
            "tsDashSongs",
            songsEnabled ? "Unlocked" : "Locked"
          );

          const dot = $("tsLiveDot");

          if (dot) {
            dot.className = `dot ${isLive ? "green" : "blue"}`;
          }

          const songsLabel = $("tsDashSongs");

          if (songsLabel) {
            songsLabel.classList.toggle(
              "song-list-unlocked",
              songsEnabled
            );

            songsLabel.classList.toggle(
              "song-list-locked",
              !songsEnabled
            );
          }
        },
        error => {
          console.error(
            "Top status live-state listener failed:",
            error
          );
        }
      );
  }

  /************************************************************
   * CURRENT SESSION
   ************************************************************/

  function listenCurrentSession() {
    const dbRef = getDb();

    if (!dbRef) {
      console.error("Top status bar: Firestore was not found.");
      return;
    }

    dbRef
      .collection("karaokeControl")
      .doc("currentSession")
      .onSnapshot(
        pointerSnapshot => {
          const pointer = pointerSnapshot.exists
            ? pointerSnapshot.data()
            : {};

          const sessionId =
            pointer.activeSessionId ||
            pointer.sessionId ||
            null;

          if (pointer.active === true && sessionId) {
            stopActiveSessionFallback();
            listenSessionDoc(sessionId);
            return;
          }

          listenForFallbackActiveSession();
        },
        error => {
          console.error(
            "Top status session-pointer listener failed:",
            error
          );
        }
      );
  }

  function listenForFallbackActiveSession() {
    const dbRef = getDb();

    if (!dbRef) {
      return;
    }

    stopActiveSessionFallback();

    topStatusActiveQueryUnsub = dbRef
      .collection("performanceSessions")
      .where("isActive", "==", true)
      .limit(1)
      .onSnapshot(
        snapshot => {
          if (snapshot.empty) {
            stopSessionDocListener();

            currentSession = null;
            currentRequests = [];

            renderSession();
            renderRequests();

            stopRequestsListener();
            return;
          }

          listenSessionDoc(snapshot.docs[0].id);
        },
        error => {
          console.error(
            "Top status active-session fallback failed:",
            error
          );
        }
      );
  }

  function listenSessionDoc(sessionId) {
    const dbRef = getDb();

    if (!dbRef || !sessionId) {
      return;
    }

    stopSessionDocListener();

    topStatusSessionUnsub = dbRef
      .collection("performanceSessions")
      .doc(sessionId)
      .onSnapshot(
        snapshot => {
          currentSession = snapshot.exists
            ? {
                id: snapshot.id,
                ...snapshot.data()
              }
            : null;

          renderSession();
          listenRequests();
        },
        error => {
          console.error(
            "Top status session document listener failed:",
            error
          );
        }
      );
  }

  function stopSessionDocListener() {
    if (typeof topStatusSessionUnsub === "function") {
      topStatusSessionUnsub();
    }

    topStatusSessionUnsub = null;
  }

  function stopActiveSessionFallback() {
    if (typeof topStatusActiveQueryUnsub === "function") {
      topStatusActiveQueryUnsub();
    }

    topStatusActiveQueryUnsub = null;
  }

  /************************************************************
   * BREAKS
   ************************************************************/

  function getBreakInformation(session) {
    const breaks = Array.isArray(session?.breaks)
      ? session.breaks
      : [];

    let totalBreakMs = 0;
    let activeBreak = null;

    breaks.forEach(breakItem => {
      const start = toDate(breakItem?.start);

      if (!start) {
        return;
      }

      const end = toDate(breakItem?.end);

      if (end) {
        totalBreakMs += Math.max(
          0,
          end.getTime() - start.getTime()
        );
      } else {
        activeBreak = breakItem;

        totalBreakMs += Math.max(
          0,
          Date.now() - start.getTime()
        );
      }
    });

    return {
      breaks,
      activeBreak,
      totalBreakMs
    };
  }

  function renderBreakStatus() {
    const button = $("tsBreakActionBtn");
    const card = $("tsBreakCard");
    const panel = $("tsBreakPanel");
    const details = $("tsBreakDetails");
    const message = $("tsBreakActionMessage");

    if (!currentSession) {
      setText("tsBreakStatusLabel", "No active session");
      setText("tsBreakStarted", "-");
      setText("tsBreakDuration", "0 mins");
      setText("tsDashBreakTotal", "0 mins");

      details?.classList.add("hidden");
      panel?.classList.remove("active-break");
      card?.classList.remove("break-is-active");

      if (button) {
        button.disabled = true;
        button.className = "break-action-btn start";
        button.innerText = "☕ Start Break";
      }

      if (message) {
        message.innerText = "";
      }

      return;
    }

    const info = getBreakInformation(currentSession);
    const isOnBreak = !!info.activeBreak;

    setText(
      "tsDashBreakTotal",
      formatDuration(info.totalBreakMs)
    );

    panel?.classList.toggle("active-break", isOnBreak);
    card?.classList.toggle("break-is-active", isOnBreak);
    details?.classList.toggle("hidden", !isOnBreak);

    if (isOnBreak) {
      const breakStarted = toDate(info.activeBreak.start);
      const breakDuration = breakStarted
        ? Date.now() - breakStarted.getTime()
        : 0;

      setText("tsBreakStatusLabel", "BREAK ACTIVE");

      setText(
        "tsBreakStarted",
        formatClockTime(breakStarted)
      );

      setText(
        "tsBreakDuration",
        formatDuration(breakDuration)
      );

      if (button) {
        button.disabled = breakActionRunning;
        button.className = "break-action-btn end";
        button.innerText = breakActionRunning
          ? "ENDING BREAK..."
          : "■ End Break";
      }
    } else {
      setText("tsBreakStatusLabel", "Not on break");
      setText("tsBreakStarted", "-");
      setText("tsBreakDuration", "0 mins");

      if (button) {
        button.disabled = breakActionRunning;
        button.className = "break-action-btn start";
        button.innerText = breakActionRunning
          ? "STARTING BREAK..."
          : "☕ Start Break";
      }
    }
  }

  async function toggleBreak() {
    const dbRef = getDb();

    if (!dbRef || !currentSession?.id || breakActionRunning) {
      return;
    }

    breakActionRunning = true;
    renderBreakStatus();

    const message = $("tsBreakActionMessage");

    try {
      const breaks = Array.isArray(currentSession.breaks)
        ? currentSession.breaks.map(item => ({ ...item }))
        : [];

      const lastBreak = breaks[breaks.length - 1];
      const breakIsActive = !!(
        lastBreak &&
        lastBreak.start &&
        !lastBreak.end
      );

      if (breakIsActive) {
        lastBreak.end = nowTimestamp();

        await dbRef
          .collection("performanceSessions")
          .doc(currentSession.id)
          .set(
            {
              breaks,
              breakOpen: false,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );

        if (message) {
          message.innerText = "Break ended.";
        }

        addNotification("Performance break ended.");
      } else {
        breaks.push({
          start: nowTimestamp(),
          end: null
        });

        await dbRef
          .collection("performanceSessions")
          .doc(currentSession.id)
          .set(
            {
              breaks,
              breakOpen: true,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );

        if (message) {
          message.innerText = "Break started.";
        }

        addNotification("Performance break started.");
      }
    } catch (error) {
      console.error("Could not update break:", error);

      if (message) {
        message.innerText =
          "Could not update the break. Check your permissions.";
      }
    } finally {
      breakActionRunning = false;
      renderBreakStatus();
    }
  }

  /************************************************************
   * REQUESTS AND QUEUE
   ************************************************************/

  function listenRequests() {
    const dbRef = getDb();

    stopRequestsListener();

    if (!dbRef || !currentSession?.id) {
      currentRequests = [];
      renderRequests();
      return;
    }

    topStatusRequestsUnsub = dbRef
      .collection("publicSongRequests")
      .where("sessionId", "==", currentSession.id)
      .onSnapshot(
        snapshot => {
          const allRequests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          const activeRequests = allRequests
            .filter(isActiveRequest)
            .sort(sortRequestsOldestFirst);

          const currentActiveIds = new Set(
            activeRequests.map(request => request.id)
          );

          if (requestsListenerInitialized) {
            activeRequests.forEach(request => {
              if (!knownActiveRequestIds.has(request.id)) {
                const title =
                  request.songTitle ||
                  request.title ||
                  "New song";

                const singer =
                  request.singerName ||
                  request.name ||
                  "";

                addNotification(
                  singer
                    ? `${singer} requested ${title}.`
                    : `New request: ${title}.`
                );
              }
            });
          }

          knownActiveRequestIds = currentActiveIds;
          requestsListenerInitialized = true;

          currentRequests = allRequests;

          renderRequests();
        },
        error => {
          console.error(
            "Top status request listener failed:",
            error
          );
        }
      );
  }

  function stopRequestsListener() {
    if (typeof topStatusRequestsUnsub === "function") {
      topStatusRequestsUnsub();
    }

    topStatusRequestsUnsub = null;
    requestsListenerInitialized = false;
    knownActiveRequestIds = new Set();
  }

  function isActiveRequest(request) {
    const status = String(request?.status || "")
      .trim()
      .toLowerCase();

    return (
      !status ||
      status === "pending" ||
      status === "waiting" ||
      status === "active" ||
      status === "queued"
    );
  }

  function sortRequestsOldestFirst(a, b) {
    const aDate = toDate(
      a.createdAt ||
      a.requestedAt ||
      a.created
    );

    const bDate = toDate(
      b.createdAt ||
      b.requestedAt ||
      b.created
    );

    return (
      (aDate?.getTime() || 0) -
      (bDate?.getTime() || 0)
    );
  }

  function renderRequests() {
    const active = currentRequests
      .filter(isActiveRequest)
      .sort(sortRequestsOldestFirst);

    const completed = currentRequests.filter(request => {
      return String(request.status || "").toLowerCase() ===
        "completed";
    });

    setText(
      "tsRequestsLabel",
      `${active.length} request${active.length === 1 ? "" : "s"} left`
    );

    setText("tsQueueCount", `(${active.length})`);

    const queue = $("tsQueueList");

    if (!queue) {
      return;
    }

    if (!active.length) {
      queue.innerHTML = `
        <div class="top-status-queue-empty">
          No active song requests.
        </div>
      `;

      return;
    }

    queue.innerHTML = active
      .map((request, index) => {
        const songTitle =
          request.songTitle ||
          request.title ||
          "Untitled song";

        const artist =
          request.artist ||
          request.songArtist ||
          request.song?.artist ||
          "Unknown artist";

        const singer =
          request.singerName ||
          request.name ||
          request.requesterName ||
          "Unknown singer";

        const requestedAt = toDate(
          request.createdAt ||
          request.requestedAt
        );

        const positionLabel =
          index === 0
            ? "Up Next"
            : index === 1
              ? "2nd"
              : index === 2
                ? "3rd"
                : `${index + 1}th`;

        return `
          <article class="top-status-queue-row">
            <div class="queue-position">
              ${index + 1}
            </div>

            <div class="queue-song-icon">🎤</div>

            <div class="queue-song-details">
              <strong>${escapeHTML(songTitle)}</strong>
              <span>${escapeHTML(artist)}</span>
            </div>

            <div class="queue-singer-details">
              <strong>
                <span class="queue-person-icon">♟</span>
                ${escapeHTML(singer)}
              </strong>

              <span>
                Requested ${escapeHTML(formatClockTime(requestedAt))}
              </span>
            </div>

            <span class="queue-position-label ${index === 0 ? "up-next" : ""}">
              ${escapeHTML(positionLabel)}
            </span>
          </article>
        `;
      })
      .join("");

    // The completed count remains available to other scripts if needed.
    setText("tsDashCompleted", String(completed.length));
  }

  /************************************************************
   * SESSION NOTES
   ************************************************************/

  function connectSessionNotesInput() {
    const notesInput = $("tsSessionNotes");
  
    if (!notesInput || notesInputConnected) {
      return;
    }
  
    notesInput.addEventListener("click", event => {
      event.stopPropagation();
    });
  
    notesInput.addEventListener("keydown", event => {
      event.stopPropagation();
    });
  
    notesInput.addEventListener("input", saveSessionNotesDelayed);
  
    notesInputConnected = true;
  }
  
  function renderSessionNotes() {
    const notesInput = $("tsSessionNotes");
    const status = $("tsNotesSaveStatus");
  
    if (!notesInput) {
      return;
    }
  
    if (!currentSession?.id) {
      notesInput.disabled = true;
      notesInput.value = "";
  
      if (status) {
        status.innerText = "No active session";
      }
  
      return;
    }
  
    notesInput.disabled = false;
  
    /*
     * Do not overwrite the text while the user is actively typing.
     * Otherwise every Firestore update could move the cursor.
     */
    if (document.activeElement !== notesInput) {
      notesInput.value = currentSession.notes || "";
    }
  
    if (status && !status.dataset.saving) {
      status.innerText = "Changes save automatically";
    }
  }
  
  function saveSessionNotesDelayed() {
    const notesInput = $("tsSessionNotes");
    const status = $("tsNotesSaveStatus");
  
    if (!notesInput || !currentSession?.id) {
      return;
    }
  
    clearTimeout(notesSaveTimer);
  
    if (status) {
      status.dataset.saving = "true";
      status.innerText = "Typing...";
    }
  
    notesSaveTimer = setTimeout(saveSessionNotesNow, 700);
  }
  
  async function saveSessionNotesNow() {
    const dbRef = getDb();
    const notesInput = $("tsSessionNotes");
    const status = $("tsNotesSaveStatus");
  
    if (!dbRef || !notesInput || !currentSession?.id) {
      return;
    }
  
    const sessionIdAtSave = currentSession.id;
    const notes = notesInput.value;
  
    if (status) {
      status.dataset.saving = "true";
      status.innerText = "Saving...";
    }
  
    try {
      await dbRef
        .collection("performanceSessions")
        .doc(sessionIdAtSave)
        .set(
          {
            notes,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
  
      /*
       * Keep the local value in sync before Firestore returns its snapshot.
       */
      if (currentSession?.id === sessionIdAtSave) {
        currentSession.notes = notes;
      }
  
      if (status) {
        delete status.dataset.saving;
        status.innerText = "Saved";
      }
  
      setTimeout(() => {
        if (
          status &&
          !status.dataset.saving &&
          currentSession?.id === sessionIdAtSave
        ) {
          status.innerText = "Changes save automatically";
        }
      }, 1400);
    } catch (error) {
      console.error("Could not save session notes:", error);
  
      if (status) {
        delete status.dataset.saving;
        status.innerText = "Could not save notes";
      }
    }
  }

  /************************************************************
   * SESSION RENDERING
   ************************************************************/

  function renderSession() {
    if (!currentSession) {
      setText("tsSessionLabel", "No active session");
      setText("tsDashVenue", "-");
      setText("tsDashStarted", "-");
      setText("tsDashElapsed", "0 mins");
  
      renderBreakStatus();
      renderSessionNotes();
      return;
    }
  
    setText(
      "tsSessionLabel",
      currentSession.title || "Active session"
    );
  
    setText(
      "tsDashVenue",
      currentSession.venue || "-"
    );
  
    const started = toDate(currentSession.startedAt);
  
    setText(
      "tsDashStarted",
      formatClockTime(started)
    );
  
    setText(
      "tsDashElapsed",
      started
        ? formatDuration(Date.now() - started.getTime())
        : "0 mins"
    );
  
    renderBreakStatus();
    renderSessionNotes();
  }

  /************************************************************
   * HELPERS
   ************************************************************/

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.innerText = value;
    }
  }

  function toDate(value) {
    if (!value) {
      return null;
    }

    if (typeof value.toDate === "function") {
      return value.toDate();
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  function formatClockTime(date) {
    if (!date) {
      return "-";
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDuration(ms) {
    const mins = Math.max(
      0,
      Math.floor(Number(ms || 0) / 60000)
    );

    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;

    if (hrs === 0) {
      return `${mins} mins`;
    }

    if (rem === 0) {
      return `${hrs} hr`;
    }

    return `${hrs} hr ${rem} mins`;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  setInterval(() => {
    renderSession();
  }, 1000);

  window.LK = window.LK || {};

  window.LK.topStatus = {
    loadTopStatusBar,
    toggle,
    toggleBreak,
    addNotification,
    markNotificationsSeen
  };
})();
