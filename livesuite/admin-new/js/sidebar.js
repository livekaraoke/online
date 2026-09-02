(function () {
  let sidebarRequestsUnsub = null;
  let sidebarSessionUnsub = null;
  let sidebarRunOrderUnsub = null;

  function $(id) {
    return document.getElementById(id);
  }

  async function loadSidebar() {
    const target = $("sidebarContainer");
    if (!target) return;

    try {
      const response = await fetch("includes/sidebar.html", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Sidebar request failed: ${response.status}`);
      }

      target.innerHTML = await response.text();

      highlightCurrentPage();

      if (window.LK?.profile?.applyProfileToDashboard) {
        LK.profile.applyProfileToDashboard();
      }

      listenSidebarSongRequests();
      listenSidebarLiveSession();
      listenSidebarRunOrder();
    } catch (error) {
      console.error("Could not load admin sidebar:", error);
    }
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
      window.location.href = `admin.html#${encodeURIComponent(id)}`;
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

  function listenSidebarSongRequests() {
    const badge = $("sidebarRequestBadge");
    const box = $("sidebarSongRequests");

    if (!window.LK?.db) return;

    if (sidebarRequestsUnsub) {
      sidebarRequestsUnsub();
      sidebarRequestsUnsub = null;
    }

    sidebarRequestsUnsub = LK.db
      .collection("publicSongRequests")
      .where("status", "in", ["pending", "waiting", "active", "queued"])
      .onSnapshot(snapshot => {
        const count = snapshot.size;

        if (badge) {
          badge.textContent = String(count);
          badge.classList.toggle("hidden", count === 0);
        }

        // Preserve the old hidden request list so any existing code relying
        // on it still works, but keep it out of the visible navigation.
        if (box) {
          box.innerHTML = "";

          snapshot.docs.forEach(doc => {
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

              window.location.href =
                `../adm/host/lyricview.html?id=${encodeURIComponent(songId)}&requestId=${encodeURIComponent(req.id)}`;
            };

            box.appendChild(btn);
          });
        }
      }, error => {
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
        const isLive = data.active === true;

        if (badge) {
          badge.classList.toggle("hidden", !isLive);
        }
      }, error => {
        console.warn("Could not load sidebar live-session status:", error);
      });
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
        const data = doc.exists ? (doc.data() || {}) : {};
        const items = Array.isArray(data.items) ? data.items : [];

        const count = items.filter(item =>
          String(item.status || "").toLowerCase() !== "played"
        ).length;

        if (badge) {
          badge.textContent = String(count);
          badge.classList.toggle("hidden", count === 0);
        }
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
    listenSidebarLiveSession,
    listenSidebarRunOrder
  };

  window.scrollToAdminSection = scrollToAdminSection;
  window.toggleMembersPanel = toggleMembersPanel;
})();
