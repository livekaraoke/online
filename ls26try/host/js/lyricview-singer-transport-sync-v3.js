/* Transport-exact singer count-in synchronizer.
 * Reads the shared musical transport directly and emits one authoritative
 * local event. lyricview-singer-bridge owns BroadcastChannel/Firestore output.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerTransportSyncV3) return;
  window.__ls26SingerTransportSyncV3 = true;

  const songId = String(new URLSearchParams(location.search).get('id') || '').trim();
  if (!songId) return;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let poll = 0;
  let lastBeat = -1;
  let playingSent = false;

  function followOn() { try { return Boolean(window.LS26TimedView?.enabled?.()); } catch (_) { return false; } }
  function emit(detail) {
    window.dispatchEvent(new CustomEvent('ls26:singer-transport-sync', { detail:{ ...detail, atMs:Date.now() } }));
  }
  function stopPoll() {
    clearInterval(poll);
    poll = 0;
    lastBeat = -1;
    playingSent = false;
  }
  function startPoll() {
    stopPoll();
    if (!followOn()) return;
    poll = setInterval(() => {
      const driver = window.LS26Click?.driver?.();
      const snap = driver?.snapshot?.();
      if (!snap || snap.state !== 'playing') return;

      const targetBeat = Number(window.LS26TimedView?.startBeat?.()) || 0;
      const meter = window.LS26TimedView?.meter?.() || { beatsPerBar:4, beatUnit:4 };
      const beatsPerBar = clamp(Number(meter.beatsPerBar) || 4, 1, 32);
      const beatUnit = clamp(Number(meter.beatUnit) || 4, 1, 32);
      const beatLength = 4 / beatUnit;
      const countInQuarterBeats = beatsPerBar * beatLength;
      const physical = Number(snap.beat);
      if (!Number.isFinite(physical)) return;

      if (physical < targetBeat - 1e-5) {
        const countStart = targetBeat - countInQuarterBeats;
        const number = clamp(Math.floor((physical - countStart + 1e-5) / beatLength) + 1, 1, beatsPerBar);
        if (number !== lastBeat) {
          lastBeat = number;
          playingSent = false;
          emit({ phase:'countin', beat:number, beatsPerBar, physicalBeat:physical, targetBeat });
        }
        return;
      }

      if (!playingSent) {
        playingSent = true;
        emit({ phase:'playing', beat:0, beatsPerBar, physicalBeat:physical, targetBeat });
      }
      stopPoll();
    }, 20);
  }

  function install() {
    window.addEventListener('click', event => {
      if (!event.target?.closest?.('#autoScrollBtn')) return;
      if (!window.LS26Performance?.isScrolling?.() && followOn()) setTimeout(startPoll, 0);
      else if (window.LS26Performance?.isScrolling?.()) stopPoll();
    }, true);
    window.addEventListener('ls26:transport-state', event => {
      if (!followOn()) return;
      if (event.detail?.state === 'playing') startPoll();
      if (event.detail?.state === 'paused' || event.detail?.state === 'stopped') stopPoll();
    });
    window.addEventListener('pagehide', stopPoll, { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
