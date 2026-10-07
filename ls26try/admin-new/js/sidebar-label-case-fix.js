/* Sidebar typography: section/brand headers uppercase; nested controls sentence case. */
(() => {
  'use strict';

  function install() {
    if (document.getElementById('ls26SidebarCaseFix')) return;
    const style = document.createElement('style');
    style.id = 'ls26SidebarCaseFix';
    style.textContent = `
      .suite-sidebar .suite-nav-section-title,
      .suite-sidebar .suite-collapsible-heading{
        text-transform:uppercase!important;
      }
      .suite-sidebar .lk-sidebar-group-toggle,
      .suite-sidebar .lk-sidebar-group-toggle .suite-nav-label,
      .suite-sidebar .lk-sidebar-group-panel .suite-nav-label{
        text-transform:none!important;
      }
      .suite-sidebar #sidebarLiveNowBadge{
        text-transform:uppercase!important;
      }
    `;
    document.head.appendChild(style);
  }

  install();
  window.addEventListener('ls26:sidebar-ready', install);
})();
