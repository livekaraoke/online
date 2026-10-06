/* Copyright © 2026 LiveSuite. All rights reserved.
 * Focused presentation fixes for archived Session History request rows.
 */
(() => {
  'use strict';

  function injectStyles() {
    if (document.getElementById('ls26SessionHistoryFixStyles')) return;

    const style = document.createElement('style');
    style.id = 'ls26SessionHistoryFixStyles';
    style.textContent = `
      .session-modal .detail-request-row > .status-chip{
        justify-self:end;
        align-self:start;
        max-width:100%;
        white-space:nowrap;
      }

      .session-modal .status-chip.cancelled{
        border-color:#7055a5!important;
        color:#d8c6ff!important;
        background:rgba(82,54,135,.13)!important;
      }

      .session-modal .request-history-host-note.is-manual-request{
        border-color:#24627a!important;
        color:#bcecff!important;
        background:rgba(0,153,204,.08)!important;
      }

      @media(max-width:600px){
        .session-modal .detail-request-row > .status-chip{
          justify-self:start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function apply() {
    injectStyles();

    document.querySelectorAll('.session-modal .status-chip.cancelled').forEach(chip => {
      if (chip.textContent.trim().toUpperCase() !== 'CANCELLED') {
        chip.textContent = 'CANCELLED';
      }
      chip.title = 'Cancelled by requester';
      chip.setAttribute('aria-label', 'Cancelled by requester');
    });

    document.querySelectorAll('.session-modal .request-history-host-note').forEach(note => {
      const value = note.textContent || '';
      if (!/manual request added by host/i.test(value)) return;
      note.classList.add('is-manual-request');
      note.innerHTML = '<b>Manual request</b> Added by host';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
