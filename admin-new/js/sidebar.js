(function () {
  async function loadSidebar() {
    const target = document.getElementById("sidebarContainer");
    if (!target) return;
    const response = await fetch("includes/sidebar.html");
    target.innerHTML = await response.text();
    highlightCurrentPage();
    if (LK.profile?.applyProfileToDashboard) LK.profile.applyProfileToDashboard();
  }

  function normalizePath(url) {
    const a = document.createElement("a");
    a.href = url;
    return a.pathname.split("/").pop() || "admin.html";
  }

  function highlightCurrentPage() {
    const currentFile = location.pathname.split("/").pop() || "admin.html";
    document.querySelectorAll(".side-nav a").forEach(link => {
      link.classList.remove("active");
      const match = link.dataset.match || normalizePath(link.getAttribute("href"));
      if (match === currentFile) link.classList.add("active");
      if (location.hash && link.getAttribute("href")?.endsWith(location.hash)) link.classList.add("active");
    });
  }

  function toggleMembersPanel() {
    const panel = $("membersPanel");
    const btn = $("membersToggleBtn");
    if (!panel || !btn) return;
    panel.classList.toggle("collapsed");
    btn.innerText = panel.classList.contains("collapsed") ? "▼ Expand" : "▲ Collapse";
  }

  LK.sidebar = { loadSidebar, highlightCurrentPage, toggleMembersPanel };
  window.toggleMembersPanel = toggleMembersPanel;
})();
