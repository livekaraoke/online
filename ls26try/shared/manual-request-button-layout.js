/* Copyright © 2026 LiveSuite. All rights reserved.
 * Keeps the Run Order ADD SONG / ADD REQUEST controls visually identical.
 */
(() => {
  'use strict';

  const BUTTON_PROPERTIES = {
    flex:'1 1 0',
    width:'100%',
    minWidth:'0',
    minHeight:'50px',
    margin:'0',
    padding:'10px 20px',
    color:'var(--ls-success)',
    border:'1px solid var(--ls-success)',
    borderRadius:'7px',
    background:'#003123',
    fontSize:'19px',
    fontWeight:'bold',
    letterSpacing:'normal',
    boxShadow:'none',
    opacity:'1'
  };

  function important(el, property, value) {
    el.style.setProperty(property, value, 'important');
  }

  function styleButton(button) {
    if (!button) return;
    Object.entries(BUTTON_PROPERTIES).forEach(([property,value]) => {
      const cssName = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      important(button, cssName, value);
    });
    important(button, 'cursor', button.disabled ? 'not-allowed' : 'pointer');
  }

  function apply() {
    const addSong = document.getElementById('ls26AddSong');
    const addRequest = document.getElementById('ls26AddRequest');
    if (!addSong || !addRequest) return false;

    const wrapper = addSong.closest('.ls26-run-add-actions') || addSong.parentElement;
    if (wrapper) {
      important(wrapper, 'display', 'flex');
      important(wrapper, 'align-items', 'stretch');
      important(wrapper, 'gap', '10px');
      important(wrapper, 'margin', '10px 0');
      important(wrapper, 'width', '100%');
    }

    styleButton(addSong);
    styleButton(addRequest);

    // Keep ADD REQUEST visually identical even while it is unavailable before
    // a session starts. Its disabled state remains functional and accessible.
    addRequest.style.setProperty('opacity', '1', 'important');
    return true;
  }

  function start() {
    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.documentElement, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['disabled','class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
