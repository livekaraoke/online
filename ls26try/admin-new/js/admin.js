/* Copyright © 2026 LiveSuite. All rights reserved.
 * admin-new/js/admin.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
document.addEventListener("DOMContentLoaded", async () => {
  await LK.sidebar.loadSidebar();
  LK.authModule.initAuth();
  LK.dashboard.initDashboard();
  LK.dashboard.logAdmin("System loaded");
});
