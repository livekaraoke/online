/* Copyright © 2026 LiveSuite. All rights reserved.
 * dashboard26.js — presentation-only admin enhancements: sidebar profile placement,
 * secondary panel disclosures and navigation reveal. No network or database access.
 */
(() => {
  'use strict';
  function reveal(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const disclosure = target.closest('details.d26-disclosure');
    if (disclosure) disclosure.open = true;
    if (id === 'membersPanel' && target.classList.contains('collapsed') && typeof window.toggleMembersPanel === 'function') {
      window.toggleMembersPanel();
    }
  }
  function mountSidebar() {
    const box = document.getElementById('sidebarContainer');
    if (!box) return;
    function decorate() {
      const profile = box.querySelector('.suite-user-copy');
      const heading = box.querySelector('.live-title');
      const badge = box.querySelector('#sidebarLiveNowBadge');
      if (!profile || !heading || !badge) return false;
      profile.append(badge); // Move, never clone: the original live listener retains its node.
      const label = heading.querySelector('span');
      if (label) label.textContent = 'OVERVIEW';
      return true;
    }
    if (!decorate()) {
      const observer = new MutationObserver(() => { if (decorate()) observer.disconnect(); });
      observer.observe(box, {childList:true});
    }
  }
  function mount() {
    mountSidebar();
    const panels = [
      ['upcomingEventsDashboardPanel', '▦  NEXT GIGS'],
      ['pastSessionsDashboardPanel', '◷  PAST SESSIONS'],
      ['consolePanel', '▣  CONTROL PANEL']
    ];
    for (const [id, title] of panels) {
      const panel = document.getElementById(id);
      if (!panel) continue;
      const details = document.createElement('details');
      details.className = 'd26-disclosure';
      const summary = document.createElement('summary');
      summary.textContent = title;
      details.append(summary);
      panel.before(details);
      details.append(panel); // Existing event handlers and IDs remain attached.
    }
    const quick = document.querySelector('.quick-grid');
    if (quick) {
      const details = document.createElement('details');
      details.className = 'd26-disclosure';
      const summary = document.createElement('summary');
      summary.textContent = '⋯  MORE TOOLS & WEBSITES';
      details.append(summary);
      quick.before(details);
      details.append(quick);
    }
    // Capture before original inline scrolling handlers; reveal without replacing them.
    document.addEventListener('click', event => {
      const control = event.target.closest('button,a');
      if (!control) return;
      const id = control.dataset.sidebarAdminSection;
      if (id) reveal(id);
      if ((control.getAttribute('onclick') || '').includes('scrollToConsole')) reveal('consolePanel');
      const href = control.getAttribute('href') || '';
      if (href.startsWith('#')) reveal(href.slice(1));
    }, true);
    const revealHash = () => reveal(location.hash.slice(1));
    window.addEventListener('hashchange', revealHash);
    revealHash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
