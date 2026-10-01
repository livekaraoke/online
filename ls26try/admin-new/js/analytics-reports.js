(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const db = window.LK?.db || window.db || (window.firebase?.firestore ? firebase.firestore() : null);
  const auth = window.LK?.auth || window.auth || (window.firebase?.auth ? firebase.auth() : null);

  const CACHE_KEY = "livesuite.analytics.performanceSessions.v1";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const state = {
    sessions: [],
    filteredSessions: [],
    aggregates: null,
    loadedAt: 0,
    fromCache: false
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalise(value) {
    return String(value || "").trim().toLowerCase();
  }

  function tsDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === "function") return value.toDate();
    if (Number.isFinite(value.__ts)) return new Date(value.__ts);
    if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6);
    if (Number.isFinite(value._seconds)) return new Date(value._seconds * 1000 + Number(value._nanoseconds || 0) / 1e6);
    if (Number.isFinite(value)) return new Date(value);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function serialise(value) {
    if (value == null) return value;
    if (value instanceof Date) return { __ts: value.getTime() };
    if (typeof value?.toDate === "function") return { __ts: value.toDate().getTime() };
    if (Array.isArray(value)) return value.map(serialise);
    if (typeof value === "object") {
      const out = {};
      Object.entries(value).forEach(([key, val]) => {
        if (typeof val !== "function" && val !== undefined) out[key] = serialise(val);
      });
      return out;
    }
    return value;
  }

  function formatDate(date, compact = false) {
    const d = tsDate(date);
    if (!d) return "—";
    return d.toLocaleDateString(undefined, compact
      ? { day: "2-digit", month: "short" }
      : { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(date) {
    const d = tsDate(date);
    if (!d) return "—";
    return `${formatDate(d)} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }

  function formatHours(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }

  function formatNumber(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function percent(numerator, denominator, digits = 0) {
    if (!denominator) return "—";
    return `${formatNumber((numerator / denominator) * 100, digits)}%`;
  }

  function sessionDate(session) {
    return tsDate(
      session.scheduledStartAt ||
      session.actualStartedAt ||
      session.startedAt ||
      session.createdAt ||
      session.updatedAt
    );
  }

  function actualStart(session) {
    return tsDate(session.actualStartedAt || session.startedAt);
  }

  function actualEnd(session) {
    return tsDate(session.actualEndedAt || session.endedAt);
  }

  function breakMs(session) {
    const now = new Date();
    return (Array.isArray(session.breaks) ? session.breaks : []).reduce((sum, br) => {
      const start = tsDate(br.startedAt || br.start);
      const end = tsDate(br.endedAt || br.end) || now;
      return sum + (start && end && end >= start ? end - start : 0);
    }, 0);
  }

  function durationMs(session) {
    const start = actualStart(session);
    const end = actualEnd(session);
    if (!start || !end || end < start) return null;
    return Math.max(0, end - start - breakMs(session));
  }

  function requestSnapshot(session) {
    return Array.isArray(session.requestSnapshot) ? session.requestSnapshot : [];
  }

  function requestBucket(status) {
    const value = normalise(status);
    if (["completed", "played"].includes(value)) return "completed";
    if (["abandoned", "singerleft", "singer_left"].includes(value)) return "abandoned";
    if (["deletedbyhost", "deleted", "declined"].includes(value)) return "deleted";
    if (["cancelled", "canceled", "cancelledbyrequester", "cancelled_by_requester"].includes(value)) return "cancelled";
    return "left";
  }

  function requestSummary(session) {
    const requests = requestSnapshot(session);
    const summary = {
      total: requests.length,
      completed: 0,
      left: 0,
      abandoned: 0,
      deleted: 0,
      cancelled: 0
    };

    if (requests.length) {
      requests.forEach(req => { summary[requestBucket(req.status)] += 1; });
      return summary;
    }

    if (session.requestSummary && typeof session.requestSummary === "object") {
      summary.total = Number(session.requestSummary.total || 0);
      summary.completed = Number(session.requestSummary.completed || 0);
      summary.left = Number(session.requestSummary.left || 0);
      summary.abandoned = Number(session.requestSummary.abandoned || 0);
      summary.deleted = Number(session.requestSummary.deleted || 0);
      summary.cancelled = Number(session.requestSummary.cancelled || 0);
    }

    return summary;
  }

  function playedSnapshot(session) {
    const performed = Array.isArray(session.playedSongsSnapshot) ? session.playedSongsSnapshot : [];
    const logs = Array.isArray(session.performanceLogSnapshot) ? session.performanceLogSnapshot : [];
    const seen = new Set();
    const merged = [];

    [...performed, ...logs].forEach(item => {
      const playedAt = tsDate(item.playedAt || item.startedAt || item.playingAt || item.createdAt);
      const key = [
        item.requestId || "",
        item.songId || normalise(item.songTitle || item.title),
        normalise(item.singerName || item.requesterName || item.name),
        playedAt ? Math.round(playedAt.getTime() / 15000) : ""
      ].join("|");

      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });

    return merged;
  }

  function songTitle(item) {
    return String(item?.songTitle || item?.title || item?.songName || item?.songId || "Untitled Song").trim();
  }

  function songArtist(item) {
    return String(item?.songArtist || item?.artist || item?.artistName || "").trim();
  }

  function songKey(item) {
    const title = normalise(songTitle(item));
    const artist = normalise(songArtist(item));
    return `${title}|||${artist}`;
  }

  function requesterName(item) {
    return String(
      item?.requesterName ||
      item?.singerName ||
      item?.name ||
      item?.displayName ||
      item?.userName ||
      item?.requester ||
      "Unknown"
    ).trim() || "Unknown";
  }

  function requesterKey(item) {
    const id = String(item?.requesterId || item?.userId || item?.uid || "").trim();
    if (id) return `id:${id}`;
    return `name:${normalise(requesterName(item))}`;
  }

  function sessionType(session) {
    return String(session.sessionType || session.type || session.eventSnapshot?.type || "Unspecified").trim() || "Unspecified";
  }

  function venueName(session) {
    return String(session.venue || session.eventSnapshot?.venue || "Unknown venue").trim() || "Unknown venue";
  }

  function isTestSession(session) {
    const status = normalise(session.status);
    const type = normalise(sessionType(session));
    const venue = normalise(venueName(session));
    const title = normalise(session.title);
    return status === "test" || type.includes("test") || venue === "test" || title.includes("test session");
  }

  function sessionSearchBlob(session) {
    const req = requestSnapshot(session);
    const played = playedSnapshot(session);
    return [
      session.title,
      venueName(session),
      sessionType(session),
      session.notes,
      session.eventSnapshot?.name,
      ...req.flatMap(item => [songTitle(item), songArtist(item), requesterName(item)]),
      ...played.flatMap(item => [songTitle(item), songArtist(item), requesterName(item)])
    ].join(" ").toLowerCase();
  }

  function showToast(message) {
    const box = $("toastBox");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => box.classList.add("hidden"), 2600);
  }

  function setStatus(kind, label, meta = "") {
    const dot = $("dataStatusDot");
    if (dot) dot.className = `status-dot ${kind}`;
    if ($("dataStatusLabel")) $("dataStatusLabel").textContent = label;
    if ($("dataStatusMeta")) $("dataStatusMeta").textContent = meta;
  }

  function bindAnalyticsSidebarUi(root) {
    if (!root) return;

    const setBrandOpen = key => {
      root.querySelectorAll("[data-sidebar-brand]").forEach(section => {
        const button = section.querySelector("[data-sidebar-brand-toggle]");
        const panel = section.querySelector(".suite-collapsible-panel");
        const chevron = button?.querySelector(".suite-section-chevron");
        const open = (section.dataset.sidebarBrand || "") === key;
        if (button) {
          button.setAttribute("aria-expanded", open ? "true" : "false");
          button.classList.toggle("is-open", open);
        }
        if (panel) panel.hidden = !open;
        if (chevron) chevron.textContent = open ? "▾" : "›";
      });
    };

    root.querySelectorAll("[data-sidebar-brand-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.sidebarBrandToggle || "";
        if (key) setBrandOpen(key);
      });
    });
    setBrandOpen("live-karaoke");

    const advanced = root.querySelector("[data-sidebar-advanced-toggle]");
    const advancedPanel = root.querySelector("#sidebarAdvancedPanel");
    const advancedChevron = root.querySelector("[data-sidebar-advanced-chevron]");
    const setAdvanced = open => {
      if (!advanced || !advancedPanel) return;
      advanced.setAttribute("aria-expanded", open ? "true" : "false");
      advancedPanel.hidden = !open;
      if (advancedChevron) advancedChevron.textContent = open ? "▾" : "›";
    };
    advanced?.addEventListener("click", () => setAdvanced(advanced.getAttribute("aria-expanded") !== "true"));
    setAdvanced(false);

    const year = root.querySelector("[data-sidebar-current-year]");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  async function loadSidebar() {
    if (window.LK?.sidebar?.loadSidebar) {
      await LK.sidebar.loadSidebar();
      return;
    }

    const target = $("sidebarContainer");
    if (!target) return;
    try {
      const response = await fetch("includes/sidebar.html", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sidebar request failed: ${response.status}`);
      target.innerHTML = await response.text();
      bindAnalyticsSidebarUi(target);

      const current = target.querySelector('a[href="analytics-reports.html"]');
      current?.classList.add("active");

      const user = auth?.currentUser;
      if (user) {
        const name = $("adminUserName");
        const role = $("adminUserRole");
        const img = $("sidebarProfileImg");
        const fallback = $("sidebarProfileFallback");
        if (name) name.textContent = user.displayName || user.email || "Admin";
        if (role) role.textContent = "Admin";
        if (img && fallback) {
          if (user.photoURL) {
            img.src = user.photoURL;
            img.style.display = "block";
            fallback.style.display = "none";
          } else {
            img.style.display = "none";
            fallback.style.display = "grid";
          }
        }
      }
    } catch (error) {
      console.warn("Could not load analytics sidebar:", error);
    }
  }

  window.scrollToAdminSection = id => {
    window.location.href = `admin.html#${encodeURIComponent(id)}`;
  };

  window.openProfileModal = () => {
    window.location.href = "admin.html";
  };

  window.adminLogout = async () => {
    try { await auth?.signOut(); } catch (error) { console.warn(error); }
  };

  function readCache() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!parsed || !Array.isArray(parsed.sessions) || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeCache(sessions) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        sessions: serialise(sessions)
      }));
    } catch (error) {
      console.info("Analytics session cache skipped:", error?.message || error);
    }
  }

  async function loadSessions(force = false) {
    if (!db) throw new Error("Firestore is unavailable.");

    if (!force) {
      const cached = readCache();
      if (cached) {
        state.sessions = cached.sessions;
        state.loadedAt = cached.savedAt;
        state.fromCache = true;
        setStatus("ready", `Loaded ${state.sessions.length} archived sessions`, `cached ${formatDateTime(cached.savedAt)}`);
        populateFilters();
        applyFilters();
        return;
      }
    }

    setStatus("loading", "Reading archived sessions…", "one-time Firestore read");
    const snapshot = await db.collection("performanceSessions").get();
    state.sessions = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
    state.loadedAt = Date.now();
    state.fromCache = false;
    writeCache(state.sessions);
    setStatus("ready", `Loaded ${state.sessions.length} archived sessions`, `refreshed ${formatDateTime(state.loadedAt)}`);
    populateFilters();
    applyFilters();
  }

  function populateFilters() {
    const venueSelect = $("venueFilter");
    const typeSelect = $("typeFilter");
    const currentVenue = venueSelect?.value || "all";
    const currentType = typeSelect?.value || "all";

    const venues = [...new Set(state.sessions.map(venueName).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    const types = [...new Set(state.sessions.map(sessionType).filter(Boolean))].sort((a,b) => a.localeCompare(b));

    if (venueSelect) {
      venueSelect.innerHTML = `<option value="all">All venues</option>` +
        venues.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      venueSelect.value = venues.includes(currentVenue) ? currentVenue : "all";
    }

    if (typeSelect) {
      typeSelect.innerHTML = `<option value="all">All session types</option>` +
        types.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      typeSelect.value = types.includes(currentType) ? currentType : "all";
    }
  }

  function localDateKey(date) {
    const d = tsDate(date);
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function clearPresetActive() {
    document.querySelectorAll("#periodPresets button").forEach(btn => btn.classList.remove("active"));
  }

  function applyPeriodPreset(value) {
    clearPresetActive();
    document.querySelector(`#periodPresets button[data-period="${value}"]`)?.classList.add("active");
    const to = $("dateToInput");
    const from = $("dateFromInput");

    if (value === "all") {
      from.value = "";
      to.value = "";
      applyFilters();
      return;
    }

    const latest = state.sessions.map(sessionDate).filter(Boolean).sort((a,b)=>b-a)[0] || new Date();
    const start = new Date(latest.getTime() - (Number(value) - 1) * DAY_MS);
    to.value = localDateKey(latest);
    from.value = localDateKey(start);
    applyFilters();
  }

  function applyFilters() {
    const from = $("dateFromInput")?.value || "";
    const to = $("dateToInput")?.value || "";
    const venue = $("venueFilter")?.value || "all";
    const type = $("typeFilter")?.value || "all";
    const includeTest = !!$("includeTestInput")?.checked;
    const search = normalise($("searchInput")?.value);

    state.filteredSessions = state.sessions.filter(session => {
      const key = localDateKey(sessionDate(session));
      if (from && (!key || key < from)) return false;
      if (to && (!key || key > to)) return false;
      if (venue !== "all" && venueName(session) !== venue) return false;
      if (type !== "all" && sessionType(session) !== type) return false;
      if (!includeTest && isTestSession(session)) return false;
      if (search && !sessionSearchBlob(session).includes(search)) return false;
      return true;
    });

    state.aggregates = buildAggregates(state.filteredSessions);
    renderAll();
  }

  function buildAggregates(sessions) {
    const out = {
      sessions,
      requestTotals: { total:0, completed:0, left:0, abandoned:0, deleted:0, cancelled:0 },
      songs: new Map(),
      artists: new Map(),
      requesters: new Map(),
      venues: new Map(),
      playedRecords: [],
      rawRequests: [],
      sessionRows: [],
      activeMs: 0,
      dayCounts: Array(7).fill(0),
      hourCounts: Array(24).fill(0),
      quality: {
        sessions: sessions.length,
        requestSnapshots: 0,
        playedSnapshots: 0,
        runOrderSnapshots: 0,
        summaryOnly: 0
      }
    };

    sessions.forEach(session => {
      const requests = requestSnapshot(session);
      const performed = playedSnapshot(session);
      const summary = requestSummary(session);
      const duration = durationMs(session);
      const sessionId = session.id || "";
      const date = sessionDate(session);
      const venue = venueName(session);
      const type = sessionType(session);

      Object.keys(out.requestTotals).forEach(key => {
        out.requestTotals[key] += Number(summary[key] || 0);
      });

      if (requests.length) out.quality.requestSnapshots += 1;
      else if (summary.total) out.quality.summaryOnly += 1;
      if ((Array.isArray(session.playedSongsSnapshot) && session.playedSongsSnapshot.length) ||
          (Array.isArray(session.performanceLogSnapshot) && session.performanceLogSnapshot.length)) {
        out.quality.playedSnapshots += 1;
      }
      if (Array.isArray(session.runOrderSnapshot) && session.runOrderSnapshot.length) out.quality.runOrderSnapshots += 1;

      if (Number.isFinite(duration)) out.activeMs += duration;

      const sessionRequesterKeys = new Set();
      const sessionSongKeys = new Set();

      requests.forEach(req => {
        const sKey = songKey(req);
        const rKey = requesterKey(req);
        const title = songTitle(req);
        const artist = songArtist(req);
        const bucket = requestBucket(req.status);
        const reqDate = tsDate(req.createdAt || req.requestedAt || req.submittedAt) || date;

        sessionRequesterKeys.add(rKey);
        sessionSongKeys.add(sKey);
        out.rawRequests.push({ ...req, __sessionId:sessionId, __sessionTitle:session.title || "", __venue:venue, __sessionDate:date });

        if (!out.songs.has(sKey)) {
          out.songs.set(sKey, {
            key:sKey, title, artist, requests:0, performed:0, requestPlayed:0,
            requesters:new Set(), sessions:new Set(), lastSeen:null
          });
        }
        const song = out.songs.get(sKey);
        song.requests += 1;
        if (bucket === "completed") song.requestPlayed += 1;
        song.requesters.add(rKey);
        song.sessions.add(sessionId);
        if (!song.lastSeen || (reqDate && reqDate > song.lastSeen)) song.lastSeen = reqDate;

        const artistKey = normalise(artist || "Unknown artist");
        if (!out.artists.has(artistKey)) {
          out.artists.set(artistKey, { artist: artist || "Unknown artist", requests:0, performed:0, songs:new Set(), requesters:new Set() });
        }
        const artistAgg = out.artists.get(artistKey);
        artistAgg.requests += 1;
        artistAgg.songs.add(sKey);
        artistAgg.requesters.add(rKey);

        if (!out.requesters.has(rKey)) {
          out.requesters.set(rKey, {
            key:rKey, name:requesterName(req), requests:0, played:0, sessions:new Set(), songs:new Set(), lastSeen:null
          });
        }
        const requester = out.requesters.get(rKey);
        requester.requests += 1;
        if (bucket === "completed") requester.played += 1;
        requester.sessions.add(sessionId);
        requester.songs.add(sKey);
        if (!requester.lastSeen || (reqDate && reqDate > requester.lastSeen)) requester.lastSeen = reqDate;
      });

      performed.forEach(item => {
        const sKey = songKey(item);
        const rKey = requesterKey(item);
        const title = songTitle(item);
        const artist = songArtist(item);
        const playedAt = tsDate(item.playedAt || item.startedAt || item.playingAt || item.createdAt) || date;

        out.playedRecords.push({ ...item, __sessionId:sessionId, __venue:venue, __sessionDate:date });
        sessionSongKeys.add(sKey);

        if (!out.songs.has(sKey)) {
          out.songs.set(sKey, {
            key:sKey, title, artist, requests:0, performed:0, requestPlayed:0,
            requesters:new Set(), sessions:new Set(), lastSeen:null
          });
        }
        const song = out.songs.get(sKey);
        song.performed += 1;
        song.sessions.add(sessionId);
        if (rKey !== "name:unknown") song.requesters.add(rKey);
        if (!song.lastSeen || (playedAt && playedAt > song.lastSeen)) song.lastSeen = playedAt;

        const artistKey = normalise(artist || "Unknown artist");
        if (!out.artists.has(artistKey)) {
          out.artists.set(artistKey, { artist: artist || "Unknown artist", requests:0, performed:0, songs:new Set(), requesters:new Set() });
        }
        const artistAgg = out.artists.get(artistKey);
        artistAgg.performed += 1;
        artistAgg.songs.add(sKey);
        if (rKey !== "name:unknown") artistAgg.requesters.add(rKey);

        if (playedAt) {
          out.dayCounts[playedAt.getDay()] += 1;
          out.hourCounts[playedAt.getHours()] += 1;
        }
      });

      const sessionPlayed = performed.length;
      const venueKey = normalise(venue);
      if (!out.venues.has(venueKey)) {
        out.venues.set(venueKey, {
          venue, sessions:0, activeMs:0, requests:0, completed:0, performed:0,
          requesters:new Set(), lastSession:null
        });
      }
      const venueAgg = out.venues.get(venueKey);
      venueAgg.sessions += 1;
      venueAgg.activeMs += Number.isFinite(duration) ? duration : 0;
      venueAgg.requests += summary.total;
      venueAgg.completed += summary.completed;
      venueAgg.performed += sessionPlayed;
      sessionRequesterKeys.forEach(key => venueAgg.requesters.add(key));
      if (!venueAgg.lastSession || (date && date > venueAgg.lastSession)) venueAgg.lastSession = date;

      out.sessionRows.push({
        id:sessionId,
        title:session.title || session.eventSnapshot?.name || "Untitled session",
        venue,
        type,
        date,
        duration,
        breaks:Array.isArray(session.breaks) ? session.breaks.length : 0,
        requests:summary.total,
        completed:summary.completed,
        performed:sessionPlayed,
        people:sessionRequesterKeys.size,
        uniqueSongs:sessionSongKeys.size,
        archiveComplete:requests.length > 0 && (
          (Array.isArray(session.playedSongsSnapshot) && session.playedSongsSnapshot.length > 0) ||
          (Array.isArray(session.performanceLogSnapshot) && session.performanceLogSnapshot.length > 0) ||
          sessionPlayed === 0
        ),
        hasRequests:requests.length > 0,
        hasPlayed:sessionPlayed > 0
      });
    });

    return out;
  }

  function renderAll() {
    renderPeriodLabel();
    renderKpis();
    renderInsights();
    renderLifecycle();
    renderTrend();
    renderTimeProfile();
    renderSongs();
    renderRequesters();
    renderVenues();
    renderSessions();
    renderQuality();
  }

  function renderPeriodLabel() {
    const dates = state.filteredSessions.map(sessionDate).filter(Boolean).sort((a,b)=>a-b);
    const text = dates.length
      ? `${formatDate(dates[0])} → ${formatDate(dates[dates.length-1])}`
      : "No sessions in current filter";
    if ($("periodLabel")) $("periodLabel").textContent = text;
  }

  function renderKpis() {
    const a = state.aggregates;
    const sessions = a.sessions.length;
    const requests = a.requestTotals.total;
    const completed = a.requestTotals.completed;
    const performed = a.playedRecords.length;
    const uniqueSongs = [...a.songs.values()].filter(song => song.performed > 0).length;
    const knownRequesters = [...a.requesters.values()].filter(r => normalise(r.name) !== "unknown").length;
    const songsPerHour = a.activeMs ? performed / (a.activeMs / 3600000) : null;
    const eligibleArchive = state.sessions.filter(s => $("includeTestInput")?.checked || !isTestSession(s)).length;

    const cards = [
      ["▦","Sessions",sessions,`${eligibleArchive ? percent(sessions,eligibleArchive) : "—"} of loaded archive`],
      ["☷","Requests",requests,`${formatNumber(sessions ? requests/sessions : 0,1)} avg / session`],
      ["✓","Played requests",completed,`${percent(completed,requests)} request completion`],
      ["♪","Songs performed",performed,`${formatNumber(sessions ? performed/sessions : 0,1)} avg / session`],
      ["◆","Unique songs",uniqueSongs,`${percent(uniqueSongs,performed)} repertoire breadth`],
      ["👤","Unique requesters",knownRequesters,`${formatNumber(sessions ? knownRequesters/sessions : 0,1)} unique / session`],
      ["◷","Active time",formatHours(a.activeMs),`${formatNumber(a.activeMs/3600000,1)} total hours`],
      ["↗","Songs / hour",songsPerHour == null ? "—" : formatNumber(songsPerHour,1),"performance pace"]
    ];

    $("kpiGrid").innerHTML = cards.map(([icon,label,value,sub]) => `
      <article class="kpi-card">
        <div class="kpi-icon">${icon}</div>
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <small>${esc(sub)}</small>
      </article>
    `).join("");
  }

  function renderInsights() {
    const a = state.aggregates;
    const songs = [...a.songs.values()];
    const requesters = [...a.requesters.values()].filter(r => normalise(r.name) !== "unknown");
    const venues = [...a.venues.values()];
    const topSong = songs.filter(s=>s.performed).sort((x,y)=>y.performed-x.performed || y.requests-x.requests)[0];
    const demandGap = songs.filter(s=>s.requests>s.requestPlayed).sort((x,y)=>(y.requests-y.requestPlayed)-(x.requests-x.requestPlayed) || y.requests-x.requests)[0];
    const topRequester = requesters.sort((x,y)=>y.requests-x.requests)[0];
    const busiestVenue = venues.sort((x,y)=>y.requests-x.requests)[0];
    const busiestHourCount = Math.max(...a.hourCounts,0);
    const busiestHour = busiestHourCount ? a.hourCounts.indexOf(busiestHourCount) : -1;

    const insights = [];
    if (topSong) insights.push(["♪","Most performed song",`${topSong.title}${topSong.artist ? ` — ${topSong.artist}` : ""} was performed ${topSong.performed} time${topSong.performed===1?"":"s"}.`]);
    if (demandGap) insights.push(["↗","Unserved demand",`${demandGap.title}${demandGap.artist ? ` — ${demandGap.artist}` : ""} has ${demandGap.requests} request${demandGap.requests===1?"":"s"} and ${demandGap.requestPlayed} marked played.`]);
    if (topRequester) insights.push(["👤","Most active requester",`${topRequester.name} made ${topRequester.requests} requests across ${topRequester.sessions.size} session${topRequester.sessions.size===1?"":"s"}.`]);
    if (busiestVenue) insights.push(["⌖","Highest request volume venue",`${busiestVenue.venue} recorded ${busiestVenue.requests} requests across ${busiestVenue.sessions} session${busiestVenue.sessions===1?"":"s"}.`]);
    if (busiestHour >= 0) insights.push(["◷","Busiest performance hour",`${String(busiestHour).padStart(2,"0")}:00–${String((busiestHour+1)%24).padStart(2,"0")}:00 contains the most timestamped performances (${busiestHourCount}).`]);

    if (!insights.length) {
      $("insightList").innerHTML = `<div class="empty-state">No detailed archived data is available for this filter yet.</div>`;
      return;
    }

    $("insightList").innerHTML = insights.slice(0,5).map(([icon,title,copy]) => `
      <div class="insight-row">
        <div class="insight-icon">${icon}</div>
        <div><strong>${esc(title)}</strong><p>${esc(copy)}</p></div>
      </div>
    `).join("");
  }

  function renderLifecycle() {
    const totals = state.aggregates.requestTotals;
    const total = totals.total;
    $("requestLifecycleTotal").textContent = `${formatNumber(total)} requests`;

    const rows = [
      ["completed","Played / completed",totals.completed],
      ["left","Left / not played",totals.left],
      ["abandoned","Singer left",totals.abandoned],
      ["deleted","Deleted / declined",totals.deleted],
      ["cancelled","Cancelled",totals.cancelled]
    ];

    $("requestLifecycle").innerHTML = rows.map(([key,label,value]) => `
      <div class="lifecycle-row">
        <strong>${esc(label)}</strong>
        <div class="progress-track"><div class="progress-fill ${key}" style="width:${total ? Math.max(1,(value/total)*100) : 0}%"></div></div>
        <span>${formatNumber(value)} · ${percent(value,total)}</span>
      </div>
    `).join("");
  }

  function trendGranularity(sessions) {
    const dates = sessions.map(sessionDate).filter(Boolean).sort((a,b)=>a-b);
    if (dates.length < 2) return "day";
    const spanDays = (dates[dates.length-1] - dates[0]) / DAY_MS;
    if (spanDays > 550) return "month";
    if (spanDays > 120) return "week";
    return "day";
  }

  function periodBucket(date, granularity) {
    const d = tsDate(date);
    if (!d) return null;
    if (granularity === "month") {
      return {
        key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
        label:d.toLocaleDateString(undefined,{month:"short",year:"2-digit"}),
        order:new Date(d.getFullYear(),d.getMonth(),1).getTime()
      };
    }
    if (granularity === "week") {
      const start = new Date(d);
      const day = (start.getDay()+6)%7;
      start.setHours(0,0,0,0);
      start.setDate(start.getDate()-day);
      return {
        key:localDateKey(start),
        label:formatDate(start,true),
        order:start.getTime()
      };
    }
    const day = new Date(d.getFullYear(),d.getMonth(),d.getDate());
    return { key:localDateKey(day), label:formatDate(day,true), order:day.getTime() };
  }

  function buildTrend() {
    const granularity = trendGranularity(state.filteredSessions);
    const map = new Map();

    function ensure(date) {
      const bucket = periodBucket(date, granularity);
      if (!bucket) return null;
      if (!map.has(bucket.key)) map.set(bucket.key,{...bucket,sessions:0,requests:0,played:0});
      return map.get(bucket.key);
    }

    state.filteredSessions.forEach(session => {
      const bucket = ensure(sessionDate(session));
      if (!bucket) return;
      bucket.sessions += 1;
      bucket.requests += requestSummary(session).total;
      bucket.played += playedSnapshot(session).length;
    });

    return { granularity, points:[...map.values()].sort((a,b)=>a.order-b.order) };
  }

  function renderTrend() {
    const { granularity, points } = buildTrend();
    $("trendGranularityLabel").textContent = `${granularity} buckets`;
    const canvas = $("trendCanvas");
    const empty = $("trendEmpty");
    if (!canvas) return;

    if (!points.length) {
      canvas.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    canvas.classList.remove("hidden");
    empty.classList.add("hidden");

    requestAnimationFrame(() => drawTrendCanvas(canvas, points));
  }

  function drawTrendCanvas(canvas, points) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.floor(300 * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr,dpr);

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const pad = { l:34, r:12, t:16, b:33 };
    const plotW = width-pad.l-pad.r;
    const plotH = height-pad.t-pad.b;
    const max = Math.max(1,...points.flatMap(p=>[p.sessions,p.requests,p.played]));
    const colors = { sessions:"#9a77ed", requests:"#4cb9e5", played:"#49cf7e" };

    ctx.clearRect(0,0,width,height);
    ctx.font = "11px Arial, Helvetica, sans-serif";
    ctx.textBaseline = "middle";

    for (let i=0;i<=4;i++) {
      const y = pad.t + (plotH/4)*i;
      const value = Math.round(max * (1-i/4));
      ctx.strokeStyle = "#1b272e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l,y);
      ctx.lineTo(width-pad.r,y);
      ctx.stroke();
      ctx.fillStyle = "#53636c";
      ctx.textAlign = "right";
      ctx.fillText(String(value),pad.l-7,y);
    }

    ["sessions","requests","played"].forEach(metric => {
      ctx.strokeStyle = colors[metric];
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point,index) => {
        const x = pad.l + (points.length===1 ? plotW/2 : (index/(points.length-1))*plotW);
        const y = pad.t + plotH - (point[metric]/max)*plotH;
        if (index===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      points.forEach((point,index) => {
        const x = pad.l + (points.length===1 ? plotW/2 : (index/(points.length-1))*plotW);
        const y = pad.t + plotH - (point[metric]/max)*plotH;
        ctx.fillStyle = colors[metric];
        ctx.beginPath();
        ctx.arc(x,y,2.4,0,Math.PI*2);
        ctx.fill();
      });
    });

    const labelEvery = Math.max(1,Math.ceil(points.length/7));
    points.forEach((point,index) => {
      if (index % labelEvery && index !== points.length-1) return;
      const x = pad.l + (points.length===1 ? plotW/2 : (index/(points.length-1))*plotW);
      ctx.fillStyle = "#5d6e77";
      ctx.textAlign = index===0 ? "left" : index===points.length-1 ? "right" : "center";
      ctx.fillText(point.label,x,height-13);
    });
  }

  function renderTimeProfile() {
    const a = state.aggregates;
    const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const maxDay = Math.max(...a.dayCounts,1);
    $("dayProfile").innerHTML = dayLabels.map((label,index) => {
      const count = a.dayCounts[index];
      const alpha = 0.08 + (count/maxDay)*0.28;
      return `<div class="day-cell" style="background:rgba(38,132,166,${alpha.toFixed(3)})"><span>${label}</span><strong>${count}</strong></div>`;
    }).join("");

    const relevantHours = a.hourCounts
      .map((count,hour)=>({hour,count}))
      .filter(row=>row.count>0)
      .sort((x,y)=>y.count-x.count)
      .slice(0,8);
    const maxHour = Math.max(...relevantHours.map(r=>r.count),1);

    $("hourProfile").innerHTML = relevantHours.length ? relevantHours.map(row => `
      <div class="hour-row">
        <strong>${String(row.hour).padStart(2,"0")}:00</strong>
        <div class="progress-track"><div class="progress-fill" style="width:${(row.count/maxHour)*100}%"></div></div>
        <span>${row.count}</span>
      </div>
    `).join("") : `<div class="empty-state">No played-song timestamps available.</div>`;
  }

  function renderSongs() {
    const a = state.aggregates;
    const songs = [...a.songs.values()];
    const performedSongs = songs.filter(s=>s.performed>0);
    const totalPerformed = a.playedRecords.length;
    const repeatedPerformances = performedSongs.reduce((sum,s)=>sum+Math.max(0,s.performed-1),0);
    const sort = $("songSortSelect")?.value || "performed";

    songs.sort((x,y) => {
      if (sort === "requested") return y.requests-x.requests || y.performed-x.performed;
      if (sort === "gap") return (y.requests-y.requestPlayed)-(x.requests-x.requestPlayed) || y.requests-x.requests;
      if (sort === "requesters") return y.requesters.size-x.requesters.size || y.requests-x.requests;
      return y.performed-x.performed || y.requests-x.requests;
    });

    const gap = songs.filter(s=>s.requests>s.requestPlayed).sort((x,y)=>(y.requests-y.requestPlayed)-(x.requests-x.requestPlayed))[0];
    $("repeatRateMetric").textContent = percent(repeatedPerformances,totalPerformed);
    $("demandGapMetric").textContent = gap ? gap.title : "—";
    $("demandGapSub").textContent = gap ? `${gap.requests-gap.requestPlayed} request${gap.requests-gap.requestPlayed===1?"":"s"} not marked played (${gap.requests} total requests).` : "No request gap found.";
    $("repertoireBreadthMetric").textContent = percent(performedSongs.length,totalPerformed);
    $("songMetaLabel").textContent = `${songs.length} songs seen • ${performedSongs.length} performed`;

    const top = songs.slice(0,30);
    $("songsTableBody").innerHTML = top.length ? top.map((song,index)=>`
      <tr>
        <td>${index+1}</td>
        <td><strong>${esc(song.title)}</strong><small>${esc(song.artist || "Unknown artist")}</small></td>
        <td>${song.requests}</td>
        <td>${song.performed}</td>
        <td>${song.requestPlayed} <small>${percent(song.requestPlayed,song.requests)}</small></td>
        <td>${song.requesters.size}</td>
        <td>${formatDate(song.lastSeen,true)}</td>
      </tr>
    `).join("") : `<tr><td colspan="7" class="empty-state">No song data in this filter.</td></tr>`;

    const artists = [...a.artists.values()]
      .sort((x,y)=>(y.performed+y.requests)-(x.performed+x.requests))
      .slice(0,15);
    const max = Math.max(...artists.map(x=>x.performed+x.requests),1);
    $("artistBars").innerHTML = artists.length ? artists.map((artist,index)=>`
      <div class="rank-bar">
        <span class="rank-number">${index+1}</span>
        <div class="rank-content">
          <div class="rank-label"><strong>${esc(artist.artist)}</strong><span>${artist.songs.size} songs</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${((artist.performed+artist.requests)/max)*100}%"></div></div>
        </div>
        <span class="rank-value">${artist.requests} req<br>${artist.performed} played</span>
      </div>
    `).join("") : `<div class="empty-state">No artist data in this filter.</div>`;
  }

  function renderRequesters() {
    const a = state.aggregates;
    const sort = $("requesterSortSelect")?.value || "requests";
    const requesters = [...a.requesters.values()].filter(r=>normalise(r.name)!=="unknown");

    requesters.sort((x,y) => {
      if (sort==="played") return y.played-x.played || y.requests-x.requests;
      if (sort==="sessions") return y.sessions.size-x.sessions.size || y.requests-x.requests;
      if (sort==="uniqueSongs") return y.songs.size-x.songs.size || y.requests-x.requests;
      return y.requests-x.requests || y.played-x.played;
    });

    $("requesterMetaLabel").textContent = `${requesters.length} named requesters`;

    $("requestersTableBody").innerHTML = requesters.length ? requesters.slice(0,40).map((r,index)=>`
      <tr>
        <td>${index+1}</td>
        <td><strong>${esc(r.name)}</strong></td>
        <td>${r.requests}</td>
        <td>${r.played}</td>
        <td class="${r.requests && r.played/r.requests>=.7 ? "metric-good" : ""}">${percent(r.played,r.requests)}</td>
        <td>${r.sessions.size}</td>
        <td>${r.songs.size}</td>
        <td>${formatDate(r.lastSeen,true)}</td>
      </tr>
    `).join("") : `<tr><td colspan="8" class="empty-state">No named requester data in this filter.</td></tr>`;

    const repeatRequesters = requesters.filter(r=>r.sessions.size>1).length;
    const multiRequesters = requesters.filter(r=>r.requests>1).length;
    const totalNamedRequests = requesters.reduce((sum,r)=>sum+r.requests,0);
    const avgRequests = requesters.length ? totalNamedRequests/requesters.length : 0;
    const top10Requests = requesters.slice(0,10).reduce((sum,r)=>sum+r.requests,0);
    const concentration = totalNamedRequests ? top10Requests/totalNamedRequests : 0;

    const cards = [
      ["Repeat visitors",repeatRequesters,`${percent(repeatRequesters,requesters.length)} appeared in more than one session`],
      ["Multi-request singers",multiRequesters,`${percent(multiRequesters,requesters.length)} requested more than once`],
      ["Avg requests / person",formatNumber(avgRequests,1),"among named requesters"],
      ["Top-10 request share",percent(top10Requests,totalNamedRequests),`${formatNumber(concentration*100,0)}% of named request volume`],
      ["Known-name coverage",percent(totalNamedRequests,a.requestTotals.total),`${totalNamedRequests} of ${a.requestTotals.total} requests tied to a usable name`],
      ["Played request rate",percent(a.requestTotals.completed,a.requestTotals.total),"based on archived request status"]
    ];

    $("audienceMetrics").innerHTML = cards.map(([label,value,copy])=>`
      <div class="audience-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(copy)}</small></div>
    `).join("");
  }

  function renderVenues() {
    const venues = [...state.aggregates.venues.values()]
      .sort((x,y)=>y.sessions-x.sessions || y.requests-x.requests);
    $("venueMetaLabel").textContent = `${venues.length} venues`;

    $("venuesTableBody").innerHTML = venues.length ? venues.map(v=>{
      const pace = v.activeMs ? v.performed/(v.activeMs/3600000) : null;
      return `
        <tr>
          <td><strong>${esc(v.venue)}</strong></td>
          <td>${v.sessions}</td>
          <td>${formatNumber(v.activeMs/3600000,1)}</td>
          <td>${v.requests}</td>
          <td>${v.completed}</td>
          <td>${percent(v.completed,v.requests)}</td>
          <td>${v.performed}</td>
          <td>${pace==null?"—":formatNumber(pace,1)}</td>
          <td>${v.requesters.size}</td>
          <td>${formatDate(v.lastSession,true)}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="10" class="empty-state">No venue data in this filter.</td></tr>`;
  }

  function renderSessions() {
    const a = state.aggregates;
    const sort = $("sessionSortSelect")?.value || "newest";
    const rowsValue = $("sessionRowsSelect")?.value || "20";
    const rows = a.sessionRows.slice();

    const pace = row => row.duration ? row.performed/(row.duration/3600000) : 0;
    const rate = row => row.requests ? row.completed/row.requests : 0;

    rows.sort((x,y) => {
      if (sort==="requests") return y.requests-x.requests;
      if (sort==="performed") return y.performed-x.performed;
      if (sort==="rate") return rate(y)-rate(x) || y.requests-x.requests;
      if (sort==="pace") return pace(y)-pace(x);
      if (sort==="duration") return (y.duration||0)-(x.duration||0);
      return (tsDate(y.date)?.getTime() || 0) - (tsDate(x.date)?.getTime() || 0);
    });

    const visible = rowsValue==="all" ? rows : rows.slice(0,Number(rowsValue)||20);
    $("sessionMetaLabel").textContent = `${rows.length} sessions in current filter`;

    $("sessionsReportBody").innerHTML = visible.length ? visible.map(row=>`
      <tr>
        <td>${formatDate(row.date,true)}</td>
        <td><strong>${esc(row.title)}</strong><small>${esc(row.type)}</small></td>
        <td>${esc(row.venue)}</td>
        <td>${formatHours(row.duration)}</td>
        <td>${row.requests}</td>
        <td>${row.completed}</td>
        <td>${percent(row.completed,row.requests)}</td>
        <td>${row.performed}</td>
        <td>${row.people}</td>
        <td>${row.duration ? formatNumber(row.performed/(row.duration/3600000),1) : "—"}</td>
        <td>${row.breaks}</td>
        <td><span class="archive-chip ${row.archiveComplete ? "" : "partial"}">${row.archiveComplete ? "FULL" : "PARTIAL"}</span></td>
      </tr>
    `).join("") : `<tr><td colspan="12" class="empty-state">No sessions in this filter.</td></tr>`;
  }

  function renderQuality() {
    const q = state.aggregates.quality;
    const total = q.sessions;
    const cards = [
      ["Request snapshots",`${q.requestSnapshots}/${total}`,`${percent(q.requestSnapshots,total)} of selected sessions have raw archived requests.`],
      ["Played snapshots",`${q.playedSnapshots}/${total}`,`${percent(q.playedSnapshots,total)} have played-song or performance-log snapshots.`],
      ["Run-order snapshots",`${q.runOrderSnapshots}/${total}`,`${percent(q.runOrderSnapshots,total)} preserve a run-order snapshot.`],
      ["Summary-only sessions",q.summaryOnly,`${q.summaryOnly} sessions have request totals but no raw requestSnapshot, limiting requester/song detail.`]
    ];

    $("qualityGrid").innerHTML = cards.map(([label,value,copy])=>`
      <div class="quality-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(copy)}</small></div>
    `).join("");
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g,'""')}"`;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map(row=>row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  window.exportAnalyticsCsv = function exportAnalyticsCsv() {
    const type = $("exportType")?.value || "sessions";
    const a = state.aggregates;
    const stamp = new Date().toISOString().slice(0,10);

    if (type === "songs") {
      const rows = [["Song","Artist","Requests","Performed","Requests Marked Played","Unique People","Sessions","Last Seen"]];
      [...a.songs.values()].sort((x,y)=>y.performed-x.performed || y.requests-x.requests).forEach(s => rows.push([
        s.title,s.artist,s.requests,s.performed,s.requestPlayed,s.requesters.size,s.sessions.size,tsDate(s.lastSeen)?.toISOString() || ""
      ]));
      downloadCsv(`livesuite-song-report-${stamp}.csv`,rows);
      return;
    }

    if (type === "requesters") {
      const rows = [["Requester","Requests","Played Requests","Completion Rate","Sessions","Unique Songs","Last Seen"]];
      [...a.requesters.values()].filter(r=>normalise(r.name)!=="unknown").sort((x,y)=>y.requests-x.requests).forEach(r => rows.push([
        r.name,r.requests,r.played,r.requests ? r.played/r.requests : "",r.sessions.size,r.songs.size,tsDate(r.lastSeen)?.toISOString() || ""
      ]));
      downloadCsv(`livesuite-requester-report-${stamp}.csv`,rows);
      return;
    }

    if (type === "requests") {
      const rows = [["Session ID","Session","Session Date","Venue","Requester","Song","Artist","Status","Requested At","Request ID"]];
      a.rawRequests.forEach(r => rows.push([
        r.__sessionId,r.__sessionTitle,tsDate(r.__sessionDate)?.toISOString() || "",r.__venue,requesterName(r),songTitle(r),songArtist(r),r.status || "",
        tsDate(r.createdAt || r.requestedAt || r.submittedAt)?.toISOString() || "",r.id || ""
      ]));
      downloadCsv(`livesuite-request-archive-${stamp}.csv`,rows);
      return;
    }

    const rows = [["Session ID","Date","Session","Venue","Type","Duration Hours","Requests","Played Requests","Completion Rate","Performed","Unique People","Breaks","Archive Complete"]];
    a.sessionRows.forEach(r => rows.push([
      r.id,tsDate(r.date)?.toISOString() || "",r.title,r.venue,r.type,Number.isFinite(r.duration)?r.duration/3600000:"",
      r.requests,r.completed,r.requests?r.completed/r.requests:"",r.performed,r.people,r.breaks,r.archiveComplete ? "yes":"partial"
    ]));
    downloadCsv(`livesuite-session-report-${stamp}.csv`,rows);
  };

  window.copyAnalyticsSummary = async function copyAnalyticsSummary() {
    const a = state.aggregates;
    const topSong = [...a.songs.values()].filter(s=>s.performed).sort((x,y)=>y.performed-x.performed)[0];
    const text = [
      "LiveSuite Analytics Snapshot",
      `Sessions: ${a.sessions.length}`,
      `Requests: ${a.requestTotals.total}`,
      `Played requests: ${a.requestTotals.completed} (${percent(a.requestTotals.completed,a.requestTotals.total)})`,
      `Songs performed: ${a.playedRecords.length}`,
      `Unique performed songs: ${[...a.songs.values()].filter(s=>s.performed).length}`,
      `Unique named requesters: ${[...a.requesters.values()].filter(r=>normalise(r.name)!=="unknown").length}`,
      `Active performance time: ${formatHours(a.activeMs)}`,
      topSong ? `Most performed: ${topSong.title}${topSong.artist?` — ${topSong.artist}`:""} (${topSong.performed})` : ""
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      showToast("Analytics summary copied.");
    } catch (_) {
      showToast("Could not copy summary in this browser.");
    }
  };

  window.refreshAnalytics = async function refreshAnalytics() {
    const btn = $("refreshBtn");
    if (btn) btn.disabled = true;
    try {
      sessionStorage.removeItem(CACHE_KEY);
      await loadSessions(true);
      showToast("Analytics refreshed from Firestore.");
    } catch (error) {
      console.error(error);
      setStatus("error","Could not load archived sessions",error?.message || "");
      showToast(error?.message || "Refresh failed.");
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.adminLogin = async function adminLogin() {
    if (!auth) return;
    $("passwordError").textContent = "";
    try {
      await auth.signInWithEmailAndPassword(
        $("emailInput").value.trim(),
        $("passwordInput").value
      );
    } catch (error) {
      $("passwordError").textContent = error?.message || "Login failed.";
    }
  };

  function bindControls() {
    document.querySelectorAll("#periodPresets button").forEach(btn => {
      btn.addEventListener("click",()=>applyPeriodPreset(btn.dataset.period));
    });

    ["dateFromInput","dateToInput"].forEach(id => {
      $(id)?.addEventListener("change",() => { clearPresetActive(); applyFilters(); });
    });

    ["venueFilter","typeFilter","includeTestInput"].forEach(id => {
      $(id)?.addEventListener("change",applyFilters);
    });

    $("searchInput")?.addEventListener("input",applyFilters);
    $("songSortSelect")?.addEventListener("change",renderSongs);
    $("requesterSortSelect")?.addEventListener("change",renderRequesters);
    $("sessionSortSelect")?.addEventListener("change",renderSessions);
    $("sessionRowsSelect")?.addEventListener("change",renderSessions);

    let resizeTimer = null;
    window.addEventListener("resize",()=>{
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderTrend,120);
    });
  }

  async function showApp() {
    $("passwordGate").classList.add("hidden");
    $("appShell").style.display = "";
    await loadSidebar();
    try {
      await loadSessions(false);
    } catch (error) {
      console.error(error);
      setStatus("error","Could not load archived sessions",error?.message || "");
      showToast(error?.message || "Could not load analytics.");
    }
  }

  function init() {
    bindControls();

    if (!db || !auth) {
      $("passwordError").textContent = "Firebase is unavailable.";
      return;
    }

    auth.onAuthStateChanged(user => {
      if (user) {
        showApp();
      } else {
        $("passwordGate").classList.remove("hidden");
        $("appShell").style.display = "none";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
