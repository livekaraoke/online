(() => {
  "use strict";

  function addWebsiteSettingsLink() {
    const nav = document.getElementById("sidebarBrandLiveKaraoke");
    if (!nav || nav.querySelector('[data-sidebar-nav="live-karaoke-website-settings"]')) return;

    const base = window.__ls26SidebarAdminBase || new URL("./", location.href).href;
    const link = document.createElement("a");
    link.href = new URL("live-karaoke-website-settings.html", base).href;
    link.dataset.sidebarNav = "live-karaoke-website-settings";
    link.innerHTML = '<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#lsi-settings"></use></svg></span><span class="suite-nav-label">Website Settings</span><span class="suite-nav-chevron">›</span>';

    if ((location.pathname.split("/").pop() || "").toLowerCase() === "live-karaoke-website-settings.html") {
      link.classList.add("active");
    }

    nav.prepend(link);
  }

  window.addEventListener("ls26:sidebar-ready", addWebsiteSettingsLink);
  if (document.getElementById("sidebarBrandLiveKaraoke")) addWebsiteSettingsLink();
})();
