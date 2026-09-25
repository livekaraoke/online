/* Copyright © 2026 LiveSuite. All rights reserved.
 * admin-new/js/sidebar.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(function () {
  const sidebarScriptUrl = document.currentScript?.src || "";
  const sidebarAdminBase = sidebarScriptUrl ? new URL("../", sidebarScriptUrl) : new URL("./", location.href);
  const sidebarIncludeUrl = new URL("includes/sidebar.html", sidebarAdminBase);
  window.__ls26SidebarAdminBase = sidebarAdminBase.href;
  const adminUrl = path => new URL(path, sidebarAdminBase).href;

  let sidebarRequestsUnsub = null;
  let sidebarActiveSessionId = "";
  let sidebarRequestsGeneration = 0;
  let sidebarSessionUnsub = null;
  let sidebarRunOrderUnsub = null;
  let sidebarRunOrderData = {};
  let sidebarEnquiriesUnsub = null;
  let sidebarProfileUnsub = null;

  function $(id) {
    return document.getElementById(id);
  }

  async function loadSidebar() {
    const target = $("sidebarContainer");
    if (!target) return;

    try {
      const response = await fetch(sidebarIncludeUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Sidebar request failed: ${response.status}`);
      }

      target.innerHTML = await response.text();
      target.querySelectorAll("a[href]").forEach(link => {
        const href = link.getAttribute("href") || "";
        if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
        link.href = new URL(href, sidebarAdminBase).href;
      });

      highlightCurrentPage();
      window.dispatchEvent(new CustomEvent('ls26:sidebar-ready'));
      bindSidebarProfile();

      if (window.LK?.profile?.applyProfileToDashboard) {
        LK.profile.applyProfileToDashboard();
      }

      // DB Logs intentionally avoids opening Firestore listeners of its own.
      // This keeps the monitoring page from generating extra database reads.
      if (!isDbLogsPage()) {
        listenSidebarSongRequests();
        listenSidebarEnquiries();
        listenSidebarLiveSession();
        listenSidebarRunOrder();
      }
    } catch (error) {
      console.error("Could not load admin sidebar:", error);
    }
  }

  function isDbLogsPage() {
    return (location.pathname.split("/").pop() || "").toLowerCase() === "db-logs.html";
  }

  function bindSidebarProfile() {
    const auth = window.LK?.auth || window.firebase?.auth?.();
    const db = window.LK?.db || window.firebase?.firestore?.();
    if (!auth || !db) return;

    const applyUser = user => {
      if (!user) return;

      // On DB Logs use only Firebase Auth profile fields so the monitoring
      // page itself does not perform a userProfiles Firestore read/listen.
      if (isDbLogsPage()) {
        const nameEl = $("adminUserName");
        const roleEl = $("adminUserRole");
        const img = $("sidebarProfileImg");
        const fallback = $("sidebarProfileFallback");
        const displayName = String(user.displayName || user.email || "Admin").trim() || "Admin";
        const photoURL = String(user.photoURL || "").trim();
        if (nameEl) nameEl.textContent = displayName;
        if (roleEl) roleEl.textContent = "Admin";
        if (img && fallback) {
          if (photoURL) {
            img.src = photoURL;
            img.style.display = "block";
            fallback.style.display = "none";
          } else {
            img.removeAttribute("src");
            img.style.display = "none";
            fallback.style.display = "grid";
          }
        }
        return;
      }

      if (sidebarProfileUnsub) {
        sidebarProfileUnsub();
        sidebarProfileUnsub = null;
      }

      const apply = profile => {
        const nameEl = $("adminUserName");
        const roleEl = $("adminUserRole");
        const img = $("sidebarProfileImg");
        const fallback = $("sidebarProfileFallback");
        const displayName = String(profile?.displayName || user.displayName || "Admin").trim() || "Admin";
        const photoURL = String(profile?.photoURL || user.photoURL || "").trim();

        if (nameEl) nameEl.textContent = displayName;
        if (roleEl) roleEl.textContent = profile?.role || "Admin";
        if (img && fallback) {
          img.onerror = () => {
            img.style.display = "none";
            fallback.style.display = "grid";
          };
          if (photoURL) {
            img.src = photoURL;
            img.style.display = "block";
            fallback.style.display = "none";
          } else {
            img.removeAttribute("src");
            img.style.display = "none";
            fallback.style.display = "grid";
          }
        }
      };

      apply({});
      sidebarProfileUnsub = db.collection("userProfiles").doc(user.uid).onSnapshot(snap => {
        apply(snap.exists ? (snap.data() || {}) : {});
      }, error => console.warn("Could not load sidebar profile:", error));
    };

    if (auth.currentUser) applyUser(auth.currentUser);
    else auth.onAuthStateChanged(applyUser);
  }

  function highlightCurrentPage() {
    const page = location.pathname.split("/").pop() || "admin.html";

    document.querySelectorAll(".suite-nav a, .suite-nav button").forEach(item => {
      item.classList.remove("active");
    });

    document.querySelectorAll(".suite-nav a").forEach(link => {
      const href = (link.getAttribute("href") || "")
        .split("?")[0]
        .split("#")[0]
        .split("/")
        .pop();

      if (href === page) {
        link.classList.add("active");
      }
    });

    if (page === "admin.html" || page === "") {
      const hash = location.hash || "";

      if (hash === "#sessionPanel") {
        setActiveAdminSection("sessionPanel");
      } else if (hash === "#requestsPanel") {
        setActiveAdminSection("requestsPanel");
      } else if (hash === "#runOrderPanel") {
        setActiveAdminSection("runOrderPanel");
      } else if (hash === "#membersPanel") {
        setActiveAdminSection("membersPanel");
      } else if (hash === "#consolePanel") {
        setActiveAdminSection("consolePanel");
      } else {
        document
          .querySelector('[data-sidebar-nav="dashboard"]')
          ?.classList.add("active");
      }
    }
  }

  function setActiveAdminSection(id) {
    document
      .querySelectorAll("[data-sidebar-admin-section]")
      .forEach(button => button.classList.remove("active"));

    document
      .querySelector(`[data-sidebar-admin-section="${id}"]`)
      ?.classList.add("active");
  }

  function scrollToAdminSection(id) {
    const el = document.getElementById(id);

    // If the user is on another admin page, route back to the dashboard first.
    if (!el) {
      window.location.href = adminUrl(`admin.html#${encodeURIComponent(id)}`);
      return;
    }

    setActiveAdminSection(id);

    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#${id}`
    );

    el.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function toggleMembersPanel() {
    const panel = $("membersPanel");
    const btn = $("membersToggleBtn");

    if (!panel || !btn) return;

    panel.classList.toggle("collapsed");

    btn.innerText = panel.classList.contains("collapsed")
      ? "▼ Expand"
      : "▲ Collapse";
  }

  function listenSidebarSongRequests(sessionId = sidebarActiveSessionId) {
    const badge = $("sidebarRequestBadge");
    const box = $("sidebarSongRequests");

    if (!window.LK?.db) return;

    if (sidebarRequestsUnsub) {
      sidebarRequestsUnsub();
      sidebarRequestsUnsub = null;
    }

    const generation = ++sidebarRequestsGeneration;
    if (badge) { badge.textContent = "0"; badge.classList.add("hidden"); }
    if (box) box.innerHTML = "";
    if (!sessionId) return;

    sidebarRequestsUnsub = LK.db
      .collection("publicSongRequests")
      .where("sessionId", "==", sessionId)
      .onSnapshot(snapshot => {
        if (generation !== sidebarRequestsGeneration) return;
        const pending = snapshot.docs.filter(doc => {
          const status = String(doc.data().status || "").toLowerCase();
          return !status || ["pending", "waiting", "active"].includes(status);
        });
        const count = pending.length;

        if (badge) {
          badge.textContent = String(count);
          badge.classList.toggle("hidden", count === 0);
        }

        // Preserve the old hidden request list so any existing code relying
        // on it still works, but keep it out of the visible navigation.
        if (box) {
          box.innerHTML = "";

          pending.forEach(doc => {
            const req = { id: doc.id, ...doc.data() };

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "sidebar-request-item";

            const title = req.songTitle || req.title || "Untitled";
            const artist = req.artist || req.songArtist || "";

            btn.innerHTML = `
              ${escapeHTML(title)}
              <span>${escapeHTML(artist)}</span>
            `;

            btn.onclick = () => {
              const songId = req.songId || req.lyricsId || "";
              if (!songId) return;

              window.location.href = adminUrl(
                `../host/lyricview.html?id=${encodeURIComponent(songId)}&requestId=${encodeURIComponent(req.id)}`
              );
            };

            box.appendChild(btn);
          });
        }
      }, error => {
        if (generation !== sidebarRequestsGeneration) return;
        if (badge) { badge.textContent = "0"; badge.classList.add("hidden"); }
        if (box) box.innerHTML = "";
        console.warn("Could not load sidebar request count:", error);
      });
  }

  function listenSidebarLiveSession() {
    const badge = $("sidebarLiveNowBadge");

    if (!window.LK?.db) return;

    if (sidebarSessionUnsub) {
      sidebarSessionUnsub();
      sidebarSessionUnsub = null;
    }

    sidebarSessionUnsub = LK.db
      .collection("karaokeControl")
      .doc("currentSession")
      .onSnapshot(doc => {
        const data = doc.exists ? (doc.data() || {}) : {};
        const sessionId = data.active === false ? "" : (data.sessionId || data.activeSessionId || "");
        const isLive = !!sessionId;
        if (sidebarActiveSessionId !== sessionId) {
          sidebarActiveSessionId = sessionId;
          listenSidebarSongRequests(sessionId);
          renderSidebarRunOrderCount();
        }

        if (badge) {
          badge.classList.toggle("hidden", !isLive);
        }
      }, error => {
        sidebarActiveSessionId = "";
        listenSidebarSongRequests("");
        renderSidebarRunOrderCount();
        if (badge) badge.classList.add("hidden");
        console.warn("Could not load sidebar live-session status:", error);
      });
  }

  function isPermissionDenied(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    return code.includes("permission-denied") || message.includes("missing or insufficient permissions");
  }

  function listenSidebarEnquiries() {
    const badge = $("sidebarEnquiryBadge");
    if (!window.LK?.db) return;

    if (sidebarEnquiriesUnsub) {
      sidebarEnquiriesUnsub();
      sidebarEnquiriesUnsub = null;
    }

    sidebarEnquiriesUnsub = LK.db
      .collection("bookingEnquiries")
      .where("status", "==", "pending")
      .onSnapshot(snapshot => {
        const count = snapshot.size;
        if (badge) {
          badge.textContent = String(count);
          badge.classList.toggle("hidden", count === 0);
        }
      }, error => {
        if (badge) {
          badge.textContent = "";
          badge.classList.add("hidden");
        }

        // bookingEnquiries was added after the legacy Firebase project.
        // A legacy ruleset may legitimately deny this optional badge.
        // Do not turn that into an uncaught/noisy admin-console error.
        if (isPermissionDenied(error)) {
          console.info("Sidebar enquiry badge unavailable on this Firebase ruleset.");
          return;
        }

        console.warn("Could not load enquiry count:", error);
      });
  }

  function renderSidebarRunOrderCount() {
    const badge = $("sidebarRunOrderBadge");
    if (!badge) return;
    const data = sidebarRunOrderData;
    const terminal = new Set(["played","completed","finished","abandoned","left","deleted","deletedbyhost","declined"]);
    const items = sidebarActiveSessionId && data.sessionId === sidebarActiveSessionId && Array.isArray(data.items) ? data.items : [];
    const count = items.filter(item => !terminal.has(String(item.status || "").toLowerCase())).length;
    badge.textContent = String(count);
    badge.classList.toggle("hidden", count === 0);
  }

  function listenSidebarRunOrder() {
    const badge = $("sidebarRunOrderBadge");

    if (!window.LK?.db) return;

    if (sidebarRunOrderUnsub) {
      sidebarRunOrderUnsub();
      sidebarRunOrderUnsub = null;
    }

    sidebarRunOrderUnsub = LK.db
      .collection("karaokeControl")
      .doc("runOrder")
      .onSnapshot(doc => {
        sidebarRunOrderData = doc.exists ? (doc.data() || {}) : {};
        renderSidebarRunOrderCount();
      }, error => {
        console.warn("Could not load sidebar Run Order count:", error);
      });
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  window.LK = window.LK || {};

  LK.sidebar = {
    loadSidebar,
    highlightCurrentPage,
    toggleMembersPanel,
    listenSidebarSongRequests,
    listenSidebarEnquiries,
    listenSidebarLiveSession,
    listenSidebarRunOrder,
    listenSidebarEnquiries
  };

  window.scrollToAdminSection = scrollToAdminSection;
  window.toggleMembersPanel = toggleMembersPanel;
})();
