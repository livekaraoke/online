document.addEventListener("DOMContentLoaded", async () => {
  await LK.sidebar.loadSidebar();
  LK.authModule.initAuth();
  LK.dashboard.initDashboard();
  LK.dashboard.logAdmin("System loaded");
});
