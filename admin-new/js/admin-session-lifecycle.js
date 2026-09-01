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
    }, console.warn);
  }

  function wrapStartPerformance() {
    if (typeof window.startPerformance !== "function") return;
    if (window.startPerformance.__eventLifecycleWrapped) return;

    const original = window.startPerformance;

    const wrapped = async function (...args) {
      const selectedEventId = $("sessionEventIdInput")?.value || "";
      const result = await original.apply(this,args);

      try {
        const current = await getCurrentSessionControl();
        const sessionId = current.sessionId || current.activeSessionId || "";

        if (sessionId) {
          await associateNewSession(sessionId, selectedEventId);
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
