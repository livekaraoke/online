(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  if (!db) {
    console.error("admin-session-lifecycle.js: Firestore unavailable.");
    return;
  }

  let liveSyncCleanup = [];
  let lastWrappedStart = null;
  let lastWrappedEnd = null;
  const eventRepairInFlight = new Set();

  function tsFromLocal(dateString, timeString, addDayIfBefore = null) {
    if (!dateString || !timeString) return null;

    let date = new Date(`${dateString}T${timeString}:00`);
    if (Number.isNaN(date.getTime())) return null;

    if (addDayIfBefore instanceof Date && date < addDayIfBefore) {
      date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    }

    return firebase.firestore.Timestamp.fromDate(date);
  }

  function requestBucket(status) {
    const value = String(status || "").toLowerCase();

    if (["completed","played"].includes(value)) return "completed";
    if (["abandoned","singerleft","singer_left"].includes(value)) return "abandoned";
    if (["deletedbyhost","deleted","declined"].includes(value)) return "deleted";
    return "left";
  }

  function requestSummary(requests) {
    const summary = {
      total: requests.length,
      completed: 0,
      left: 0,
      abandoned: 0,
      deleted: 0
    };

    requests.forEach(request => {
      summary[requestBucket(request.status)]++;
    });

    return summary;
  }

  function cleanSnapshot(value) {
    if (value == null) return value;

    if (value && typeof value.toDate === "function") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(cleanSnapshot);
    }

    if (typeof value === "object") {
      const result = {};
      Object.entries(value).forEach(([key,val]) => {
        if (typeof val !== "function" && val !== undefined) {
          result[key] = cleanSnapshot(val);
        }
      });
      return result;
    }

    return value;
  }

  function normalise(value) {
    return String(value || "").trim().toLowerCase();
  }

  function eventStartDate(event) {
    if (!event) return null;

    if (event.scheduledStartAt?.toDate) {
      return event.scheduledStartAt.toDate();
    }

    if (!event.date || !event.startTime) return null;

    const d = new Date(`${event.date}T${event.startTime}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function titleDateToken(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}`;
  }

  async function resolveEventIdForSession(sessionId, currentData = {}) {
    if (!sessionId) return "";

    const sessionSnap = await db.collection("performanceSessions").doc(sessionId).get();
    const session = sessionSnap.exists ? (sessionSnap.data() || {}) : {};

    // 1. Already linked.
    if (session.eventId) return session.eventId;
    if (currentData.eventId) return currentData.eventId;

    // 2. Current form selection.
    const domEventId = $("sessionEventIdInput")?.value || "";
    if (domEventId) return domEventId;

    // 3. Persisted selection from the Upcoming Gig '+' / suggestion.
    try {
      const stored = sessionStorage.getItem("lkSelectedUpcomingEventId") || "";
      if (stored) return stored;
    } catch {}

    // 4. Recover from the event data itself. This is deliberately used for
    //    sessions like the one shown in Firestore where title/venue were copied
    //    but eventId was lost.
    const eventSnap = await db.collection("upcomingEvents").get();
    if (eventSnap.empty) return "";

    const sessionTitle = normalise(session.title || currentData.title);
    const sessionVenue = normalise(session.venue || currentData.venue);
    const sessionType = normalise(session.sessionType || session.type || currentData.sessionType || currentData.type);
    const actualStart =
      session.actualStartedAt?.toDate?.() ||
      session.startedAt?.toDate?.() ||
      currentData.startedAt?.toDate?.() ||
      new Date();

    let best = null;
    let bestScore = -1;

    eventSnap.docs.forEach(doc => {
      const event = { id:doc.id, ...(doc.data() || {}) };
      let score = 0;

      if (event.linkedSessionId === sessionId) score += 500;

      const eventTitle = normalise(event.name);
      const eventVenue = normalise(event.venue);
      const eventType = normalise(event.type);

      if (sessionTitle && eventTitle && sessionTitle === eventTitle) score += 180;
      else if (sessionTitle && eventTitle && sessionTitle.includes(eventTitle)) score += 100;

      if (sessionVenue && eventVenue && sessionVenue === eventVenue) score += 80;
      if (sessionType && eventType && sessionType === eventType) score += 35;

      const start = eventStartDate(event);
      if (start) {
        const token = titleDateToken(start);
        if (token && sessionTitle.includes(token.toLowerCase())) score += 90;

        const hoursApart = Math.abs(start.getTime() - actualStart.getTime()) / 3600000;
        if (hoursApart <= 6) score += 60;
        else if (hoursApart <= 24) score += 35;
        else if (hoursApart <= 48) score += 15;
      }

      const status = normalise(event.sessionStatus);
      if (status !== "ended") score += 10;

      if (score > bestScore) {
        bestScore = score;
        best = event;
      }
    });

    // Require meaningful evidence; venue alone plus proximity is enough,
    // but a random event must never be linked.
    return best && bestScore >= 90 ? best.id : "";
  }

  async function repairActiveSessionLink(sessionId, currentData = {}) {
    if (!sessionId || eventRepairInFlight.has(sessionId)) return;

    eventRepairInFlight.add(sessionId);

    try {
      const sessionRef = db.collection("performanceSessions").doc(sessionId);
      const sessionSnap = await sessionRef.get();
      const session = sessionSnap.exists ? (sessionSnap.data() || {}) : {};

      const alreadyComplete =
        !!session.eventId &&
        !!session.scheduledStartAt &&
        !!session.scheduledEndAt &&
        Number(session.scheduledDurationMs) > 0;

      const currentComplete =
        !!currentData.eventId &&
        !!currentData.scheduledStartAt &&
        !!currentData.scheduledEndAt &&
        Number(currentData.scheduledDurationMs) > 0;

      if (alreadyComplete && currentComplete) return;

      const eventId = await resolveEventIdForSession(sessionId, currentData);

      if (!eventId) {
        console.warn(
          "Active Performance Session has no linked Upcoming Event. " +
          "Could not safely auto-match one.",
          { sessionId, title:session.title, venue:session.venue }
        );
        return;
      }

      await associateNewSession(sessionId, eventId);

      try {
        sessionStorage.setItem("lkSelectedUpcomingEventId", eventId);
      } catch {}

      console.info("Repaired Performance Session ↔ Upcoming Event link:", {
        sessionId,
        eventId
      });
    } catch (error) {
      console.error("Could not repair Performance Session event link:", error);
    } finally {
      eventRepairInFlight.delete(sessionId);
    }
  }

  async function associateNewSession(sessionId, eventId) {
    if (!sessionId) return;

    const sessionRef = db.collection("performanceSessions").doc(sessionId);
    const currentRef = db.collection("karaokeControl").doc("currentSession");

    let event = null;
    let scheduledStartAt = null;
    let scheduledEndAt = null;
    let scheduledDurationMs = null;

    if (eventId) {
      const eventSnap = await db.collection("upcomingEvents").doc(eventId).get();
      if (eventSnap.exists) {
        event = { id:eventSnap.id, ...(eventSnap.data() || {}) };

        // New Upcoming Events save canonical Firestore timestamps directly.
        // Keep date/startTime/endTime as a fallback for older event documents.
        scheduledStartAt =
          event.scheduledStartAt ||
          tsFromLocal(event.date, event.startTime);

        const scheduledStartDate =
          scheduledStartAt?.toDate?.() ||
          null;

        scheduledEndAt =
          event.scheduledEndAt ||
          tsFromLocal(event.date, event.endTime, scheduledStartDate);

        if (Number.isFinite(Number(event.scheduledDurationMs)) && Number(event.scheduledDurationMs) > 0) {
          scheduledDurationMs = Number(event.scheduledDurationMs);
        } else if (scheduledStartAt && scheduledEndAt) {
          scheduledDurationMs =
            scheduledEndAt.toDate().getTime() -
            scheduledStartAt.toDate().getTime();
        }

        await db.collection("upcomingEvents").doc(eventId).set({
          linkedSessionId: sessionId,
          sessionStatus: "active",
          actualStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
      }
    }

    const sessionPatch = {
      eventId: eventId || "",
      eventSnapshot: event ? cleanSnapshot(event) : null,
      scheduledStartAt: scheduledStartAt || null,
      scheduledEndAt: scheduledEndAt || null,
      scheduledDurationMs: Number.isFinite(scheduledDurationMs) ? scheduledDurationMs : null,
      actualStartedAt: firebase.firestore.FieldValue.serverTimestamp(),
      sessionType:
        $("sessionTypeInput")?.value ||
        event?.type ||
        "Live Karaoke",
      type:
        $("sessionTypeInput")?.value ||
        event?.type ||
        "Live Karaoke",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await sessionRef.set(sessionPatch, { merge:true });

    await currentRef.set({
      eventId: eventId || "",
      eventSnapshot: event ? cleanSnapshot(event) : null,
      scheduledStartAt: scheduledStartAt || null,
      scheduledEndAt: scheduledEndAt || null,
      scheduledDurationMs: Number.isFinite(scheduledDurationMs) ? scheduledDurationMs : null,
      sessionType: sessionPatch.sessionType,
      type: sessionPatch.type,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });

    // Start a fresh Run Order for this session.
    await db.collection("karaokeControl").doc("runOrder").set({
      sessionId,
      items: [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function getCurrentSessionControl() {
    const snap = await db.collection("karaokeControl").doc("currentSession").get();
    return snap.exists ? (snap.data() || {}) : {};
  }

  async function snapshotSessionData(sessionId) {
    if (!sessionId) return;

    const sessionRef = db.collection("performanceSessions").doc(sessionId);

    const [requestSnap, logSnap, performedSnap, runOrderSnap] = await Promise.all([
      db.collection("publicSongRequests").where("sessionId","==",sessionId).get(),
      db.collection("performanceLogs").where("sessionId","==",sessionId).get(),
      sessionRef.collection("performedSongs").get(),
      db.collection("karaokeControl").doc("runOrder").get()
    ]);

    const requests = requestSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() || {})
    }));

    const logs = logSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() || {})
    }));

    const performedSongs = performedSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() || {})
    }));

    const runOrderData = runOrderSnap.exists ? (runOrderSnap.data() || {}) : {};
    const runOrderItems =
      runOrderData.sessionId === sessionId && Array.isArray(runOrderData.items)
        ? runOrderData.items
        : [];

    await sessionRef.set({
      requestSnapshot: cleanSnapshot(requests),
      requestSummary: requestSummary(requests),
      performanceLogSnapshot: cleanSnapshot(logs),
      playedSongsSnapshot: cleanSnapshot(performedSongs),
      runOrderSnapshot: cleanSnapshot(runOrderItems),
      dataSnapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  async function normaliseUnfinishedRequests(sessionId) {
    const snap = await db.collection("publicSongRequests")
      .where("sessionId","==",sessionId)
      .get();

    const batch = db.batch();
    let changed = 0;

    snap.docs.forEach(doc => {
      const data = doc.data() || {};
      const status = String(data.status || "").toLowerCase();

      if (
        !status ||
        ["active","pending","waiting","queued","accepted","removedfromrunorder"].includes(status)
      ) {
        batch.set(doc.ref, {
          status: "left",
          sessionEndedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
        changed++;
      }
    });

    if (changed) await batch.commit();
  }

  async function finishAssociatedEvent(sessionId, eventId) {
    if (!eventId) return;

    await db.collection("upcomingEvents").doc(eventId).set({
      linkedSessionId: sessionId,
      sessionStatus: "ended",
      actualEndedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  async function finalizeSession(sessionId, eventId) {
    if (!sessionId) return;

    await normaliseUnfinishedRequests(sessionId);
    await snapshotSessionData(sessionId);

    await db.collection("performanceSessions").doc(sessionId).set({
      actualEndedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });

    await finishAssociatedEvent(sessionId, eventId);
  }

  function clearLiveSync() {
    liveSyncCleanup.forEach(fn => {
      try { fn(); } catch {}
    });
    liveSyncCleanup = [];
  }

  function startLiveSessionSnapshots(sessionId) {
    clearLiveSync();
    if (!sessionId) return;

    const sessionRef = db.collection("performanceSessions").doc(sessionId);

    const updateRequests = snapshot => {
      const requests = snapshot.docs.map(doc => ({
        id:doc.id,
        ...(doc.data() || {})
      }));

      sessionRef.set({
        requestSnapshot: cleanSnapshot(requests),
        requestSummary: requestSummary(requests),
        dataSnapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }).catch(console.warn);
    };

    liveSyncCleanup.push(
      db.collection("publicSongRequests")
        .where("sessionId","==",sessionId)
        .onSnapshot(updateRequests, console.warn)
    );

    liveSyncCleanup.push(
      db.collection("performanceLogs")
        .where("sessionId","==",sessionId)
        .onSnapshot(snapshot => {
          const logs = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
          sessionRef.set({
            performanceLogSnapshot: cleanSnapshot(logs),
            dataSnapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge:true }).catch(console.warn);
        }, console.warn)
    );

    liveSyncCleanup.push(
      sessionRef.collection("performedSongs")
        .onSnapshot(snapshot => {
          const songs = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
          sessionRef.set({
            playedSongsSnapshot: cleanSnapshot(songs),
            dataSnapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge:true }).catch(console.warn);
        }, console.warn)
    );

    liveSyncCleanup.push(
      db.collection("karaokeControl").doc("runOrder")
        .onSnapshot(doc => {
          const data = doc.exists ? (doc.data() || {}) : {};
          const items =
            data.sessionId === sessionId && Array.isArray(data.items)
              ? data.items
              : [];

          sessionRef.set({
            runOrderSnapshot: cleanSnapshot(items),
            dataSnapshotUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge:true }).catch(console.warn);
        }, console.warn)
    );
  }

  function listenCurrentSessionForSnapshots() {
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      const sessionId =
        data.active === true
          ? (data.sessionId || data.activeSessionId || "")
          : "";

      startLiveSessionSnapshots(sessionId);

      // Important: this repairs sessions that were already started by the
      // older sessions.js path which created the title/venue but dropped
      // eventId and schedule metadata.
      if (sessionId) {
        repairActiveSessionLink(sessionId, data);
      }
    }, console.warn);
  }

  function wrapStartPerformance() {
    if (typeof window.startPerformance !== "function") return;
    if (window.startPerformance.__eventLifecycleWrapped) return;

    const original = window.startPerformance;

    const wrapped = async function (...args) {
      let selectedEventId = $("sessionEventIdInput")?.value || "";

      if (!selectedEventId) {
        try {
          selectedEventId = sessionStorage.getItem("lkSelectedUpcomingEventId") || "";
        } catch {}
      }

      const result = await original.apply(this,args);

      try {
        const current = await getCurrentSessionControl();
        const sessionId = current.sessionId || current.activeSessionId || "";

        if (sessionId) {
          if (!selectedEventId) {
            selectedEventId = await resolveEventIdForSession(sessionId, current);
          }

          if (selectedEventId) {
            await associateNewSession(sessionId, selectedEventId);
          } else {
            await repairActiveSessionLink(sessionId, current);
          }

          startLiveSessionSnapshots(sessionId);
        }
      } catch (error) {
        console.error("Session started but event/session metadata could not be attached:", error);
      }

      return result;
    };

    wrapped.__eventLifecycleWrapped = true;
    window.startPerformance = wrapped;
  }

  function wrapEndPerformance() {
    if (typeof window.endPerformance !== "function") return;
    if (window.endPerformance.__eventLifecycleWrapped) return;

    const original = window.endPerformance;

    const wrapped = async function (...args) {
      let before = {};

      try {
        before = await getCurrentSessionControl();
      } catch {}

      const sessionId = before.sessionId || before.activeSessionId || "";
      const eventId = before.eventId || "";

      const result = await original.apply(this,args);

      try {
        await finalizeSession(sessionId,eventId);
        clearLiveSync();
      } catch (error) {
        console.error("Session ended but session/event archive update failed:", error);
      }

      return result;
    };

    wrapped.__eventLifecycleWrapped = true;
    window.endPerformance = wrapped;
  }

  function bindWrappers() {
    wrapStartPerformance();
    wrapEndPerformance();

    // Other existing addons also wrap these functions, so retry after all
    // scripts have finished initialising.
    setTimeout(wrapStartPerformance,250);
    setTimeout(wrapEndPerformance,250);
    setTimeout(wrapStartPerformance,900);
    setTimeout(wrapEndPerformance,900);
  }

  function init() {
    bindWrappers();
    listenCurrentSessionForSnapshots();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
