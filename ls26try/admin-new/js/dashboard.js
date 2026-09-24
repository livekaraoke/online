/* Copyright © 2026 LiveSuite. All rights reserved.
 * admin-new/js/dashboard.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(function () {
  function getDateFromTimestamp(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    return new Date(value);
  }

  function formatTime(date) {
    return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
  }

  function formatDate(date) {
    return date ? date.toLocaleDateString("en-GB") : "-";
  }

  function formatDuration(ms) {
    const mins = Math.max(0, Math.floor(Number(ms || 0) / 60000));
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hrs === 0) return `${mins} mins`;
    if (rem === 0) return `${hrs} hr`;
    return `${hrs} hr ${rem} mins`;
  }

  function minutesAgo(ts) {
    const d = getDateFromTimestamp(ts);
    return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000)) : "-";
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function logAdmin(message) {
    const time = new Date().toLocaleTimeString();
    LK.state.logHistory.push(`[${time}] ${message}`);
    if (LK.state.logHistory.length > 100) LK.state.logHistory.shift();
    renderConsole();
  }

  function renderConsole() {
    const box = $("adminConsole");
    if (!box) return;
    box.innerHTML = LK.state.logHistory
      .slice(-40)
      .map(line => `<div class="console-line">${escapeHTML(line)}</div>`)
      .join("");
    box.scrollTop = box.scrollHeight;
  }

  function clearConsole() {
    LK.state.logHistory = [];
    renderConsole();
  }

  function exportLog() {
    const blob = new Blob([LK.state.logHistory.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `karaoke-admin-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function scrollToConsole() {
    $("consolePanel")?.scrollIntoView({ behavior: "smooth" });
  }

  function updateClock() {
    const now = new Date();
    const day = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    if ($("dayLabel")) $("dayLabel").innerText = day;
    if ($("todayLabel")) $("todayLabel").innerText = formatDate(now);
    if ($("clockLabel")) $("clockLabel").innerText = formatTime(now);
  }

  function getCurrentEvent(event) {
    if (!event || !event.start || !event.end) return null;
    let start = new Date(event.start);
    let end = new Date(event.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const now = new Date();
    if (event.repeatWeekly) {
      while (end < now) {
        start.setDate(start.getDate() + 7);
        end.setDate(end.getDate() + 7);
      }
    }
    return { start, end };
  }

  function getIsLive(data) {
    if (!data) return false;
    if (data.manualOverride) return data.isLive === true;
    const ev = getCurrentEvent(data.nextEvent);
    const now = new Date();
    return !!(ev && now >= ev.start && now <= ev.end);
  }

  function getSongsAvailable(data, live) {
    return data?.songsOverride ? data.songsEnabled === true : live;
  }

  function statusCircleIcon(kind) {
    if (kind === "stop") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
    if (kind === "lock") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    if (kind === "unlock") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-2"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>';
  }

  window.LS26StatusCircleIcon = statusCircleIcon;

  function updateAdminButtons(data) {
    const live = getIsLive(data);
    const songs = getSongsAvailable(data, live);
    const liveBtn = $("liveCircleBtn");
    const songsBtn = $("songsCircleBtn");

    if (liveBtn) {
      liveBtn.className = `circle-status-btn ${live ? "stop" : "go"} status-indicator`;
      liveBtn.innerHTML = statusCircleIcon(live ? "stop" : "play");
      liveBtn.disabled = true;
      liveBtn.title = live ? "System is live" : "System is offline";
      liveBtn.setAttribute("aria-label", liveBtn.title);
    }

    if (songsBtn) {
      songsBtn.className = songs ? "circle-status-btn stop" : "circle-status-btn go";
      songsBtn.innerHTML = statusCircleIcon(songs ? "lock" : "unlock");
      songsBtn.title = songs ? "Lock public song list" : "Unlock public song list";
    }
  }

  function updateStatusStrip() {
    const currentState = LK.state.currentState;
    const live = getIsLive(currentState);
    const songs = getSongsAvailable(currentState, live);
    const ev = getCurrentEvent(currentState?.nextEvent);
    const end = ev?.end || null;
    const remainingMs = end ? Math.max(0, end - new Date()) : 0;

    const liveLabel = $("statusLiveLabel");
    const songsLabel = $("statusSongsLabel");

    if (liveLabel) {
      liveLabel.className = live ? "live-now-status" : "offline-status";
      liveLabel.innerText = live ? "LIVE NOW!" : "● Offline";
    }

    if (songsLabel) {
      songsLabel.className = songs ? "songs-unlocked" : "songs-locked";
      songsLabel.innerText = songs ? "UNLOCKED" : "LOCKED";
    }

    // Upcoming-event venue/date/type/countdown are owned by
    // admin-events-integration.js. Do not overwrite them from legacy nextEvent.
    if ($("statusUpdatedLabel")) $("statusUpdatedLabel").innerText = new Date().toLocaleTimeString();
  }

  function listenKaraokeState() {
    LK.db.collection("karaoke").doc("state").onSnapshot(doc => {
      LK.state.currentState = doc.data() || {};
      updateAdminButtons(LK.state.currentState);
      updateStatusStrip();
    });
  }

  function toggleLive() {
    const live = getIsLive(LK.state.currentState);
    LK.db.collection("karaoke").doc("state").set({ manualOverride: true, isLive: !live }, { merge: true });
    logAdmin(!live ? "GO LIVE activated" : "LIVE ended manually");
  }

  function toggleSongsAuto() {
    const live = getIsLive(LK.state.currentState);
    if (!live) {
      LK.db.collection("karaoke").doc("state").set({ songsOverride: true, songsEnabled: false }, { merge: true });
      logAdmin("Cannot unlock songs: event is not live");
      return;
    }
    const songs = getSongsAvailable(LK.state.currentState, live);
    LK.db.collection("karaoke").doc("state").set({ songsOverride: !songs, songsEnabled: !songs }, { merge: true });
    logAdmin(songs ? "Public Song List LOCKED" : "Public Song List UNLOCKED");
  }

  function showConfirm(title, message) {
    $("confirmModalTitle").innerText = title;
    $("confirmModalMessage").innerText = message;
    $("confirmModal").classList.remove("hidden");
    return new Promise(resolve => {
      LK.state.confirmResolver = resolve;
      $("confirmModalOk").onclick = () => closeConfirmModal(true);
    });
  }

  function closeConfirmModal(value) {
    $("confirmModal")?.classList.add("hidden");
    if (LK.state.confirmResolver) LK.state.confirmResolver(value);
    LK.state.confirmResolver = null;
  }

  function initDashboard() {
    listenKaraokeState();
    updateClock();
    setInterval(() => {
      updateClock();
      LK.sessions.updateDashboard(LK.state.currentSessionData || null);
    }, 1000);
  }

  LK.dashboard = { getDateFromTimestamp, formatTime, formatDate, formatDuration, minutesAgo, escapeHTML, logAdmin, renderConsole, updateClock, getIsLive, updateStatusStrip, showConfirm, initDashboard };
  window.clearConsole = clearConsole;
  window.exportLog = exportLog;
  window.scrollToConsole = scrollToConsole;
  window.toggleLive = toggleLive;
  window.toggleSongsAuto = toggleSongsAuto;
  window.closeConfirmModal = closeConfirmModal;
})();
