/* Keep dynamic meter and Chord Follow aligned across IMPROV holds.
 * The metronome continues physically, but while an IMPROV hold is active it must
 * repeat the meter/bar that was actually playing immediately BEFORE the hold.
 * Future TIME SIG markers must not advance until Chord Follow resumes.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const EPS = 1e-7;
  const IMPROV_SELECTOR = 'a.lyrics-song-link[data-improv-link]';
  let rawMap = null;
  let mapWrapper = null;
  let rawTimedView = null;
  let timedWrapper = null;
  let timelineOffset = 0;
  let heldMeter = null;
  let pendingReleaseBeat = null;
  let resumeAnchor = null;
  let statusObserver = null;

  function physicalBeat() {
    try {
      const beat = Number(window.LS26Click?.driver?.()?.snapshot?.()?.beat);
      if (Number.isFinite(beat)) return beat;
    } catch (_) {}
    try {
      const beat = Number(window.LS26TimedView?.snapshot?.()?.beat);
      if (Number.isFinite(beat)) return beat;
    } catch (_) {}
    return 0;
  }

  function coreTimingOffset() {
    try {
      const value = Number(window.LS26TimedView?.snapshot?.()?.timingOffset);
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch (_) { return null; }
  }

  function sourceSegments() {
    let list = [];
    try { list = rawMap?.segments?.() || []; } catch (_) {}
    list = list.map(item => ({
      startBeat: Number(item?.startBeat) || 0,
      beatsPerBar: Math.max(1, Number(item?.beatsPerBar) || 4),
      beatUnit: Math.max(1, Number(item?.beatUnit) || 4)
    })).sort((a,b) => a.startBeat - b.startBeat);
    if (!list.length) list = [{ startBeat:0, beatsPerBar:4, beatUnit:4 }];
    return list;
  }

  function segmentAtLogical(beat) {
    const target = Number.isFinite(Number(beat)) ? Number(beat) : 0;
    const list = sourceSegments();
    let found = list[0];
    for (const segment of list) {
      if (segment.startBeat <= target + EPS) found = segment;
      else break;
    }
    return { ...found };
  }

  function nextLogicalSegment(segment) {
    const start = Number(segment?.startBeat) || 0;
    return sourceSegments().find(item => item.startBeat > start + EPS) || null;
  }

  function adjustedSegment(source, logicalBeat) {
    const next = nextLogicalSegment(source);
    let startBeat = source.startBeat + timelineOffset;
    if (
      resumeAnchor &&
      Math.abs(source.startBeat - resumeAnchor.segmentStartBeat) < EPS &&
      Number(logicalBeat) >= resumeAnchor.logicalBeat - EPS &&
      (!next || Number(logicalBeat) < next.startBeat - EPS)
    ) startBeat = resumeAnchor.transportBeat;
    return { ...source, startBeat };
  }

  function currentTransportSegment(transportBeat) {
    if (heldMeter) return { ...heldMeter };
    const logical = Number(transportBeat) - timelineOffset;
    return adjustedSegment(segmentAtLogical(logical), logical);
  }

  function nextTransportSegment(startBeat) {
    /* While improvising there IS deliberately no next song-meter segment.
       The click keeps cycling the held meter until the performer resumes. */
    if (heldMeter) return null;
    const start = Number(startBeat);
    let source = null;

    if (resumeAnchor && Math.abs(start - resumeAnchor.transportBeat) < 0.001) {
      source = segmentAtLogical(resumeAnchor.logicalBeat);
    } else {
      for (const item of sourceSegments()) {
        const shifted = item.startBeat + timelineOffset;
        if (Math.abs(shifted - start) < 0.001) { source = item; break; }
      }
      if (!source) source = segmentAtLogical(start - timelineOffset + EPS);
    }

    const next = nextLogicalSegment(source);
    return next ? { ...next, startBeat: next.startBeat + timelineOffset } : null;
  }

  function installMapWrapper() {
    const current = window.LS26MeterMap;
    if (!current) return false;
    if (current === mapWrapper || current.__ls26ImprovTimelineSyncV3) return true;
    rawMap = current;
    mapWrapper = {
      current: currentTransportSegment,
      nextAfter: nextTransportSegment,
      segments() { return sourceSegments().map(item => ({ ...item, startBeat:item.startBeat + timelineOffset })); },
      rebuild() { return rawMap?.rebuild?.(); },
      __ls26ImprovTimelineSyncV3: true
    };
    window.LS26MeterMap = mapWrapper;
    return true;
  }

  function installTimedViewWrapper() {
    const current = window.LS26TimedView;
    if (!current) return false;
    if (current === timedWrapper || current.__ls26ImprovTimelineSyncV3View) return true;
    rawTimedView = current;
    timedWrapper = {
      ...current,
      meter() {
        installMapWrapper();
        return mapWrapper?.current?.(physicalBeat()) || rawTimedView?.meter?.();
      }
    };
    Object.defineProperty(timedWrapper,'__ls26ImprovTimelineSyncV3View',{value:true,enumerable:false});
    if (current.__ls26DynamicMeterWrapper) Object.defineProperty(timedWrapper,'__ls26DynamicMeterWrapper',{value:true,enumerable:false});
    timedWrapper = Object.freeze(timedWrapper);
    window.LS26TimedView = timedWrapper;
    return true;
  }

  function activeImprovGate() {
    return document.querySelector(`${IMPROV_SELECTOR}.ls26-improv-active`);
  }

  function logicalBeatImmediatelyBeforeHold() {
    const gate = activeImprovGate();

    /* Chord Follow deliberately leaves the previously-playing chord highlighted
       when it enters an IMPROV hold. That is the strongest source of truth. */
    const active = document.querySelector('.ls26-active-chord[data-ls26-start-beat]');
    if (active) {
      const end = Number(active.dataset.ls26EndBeat);
      if (Number.isFinite(end)) return Math.max(0, end - 0.0001);
      const start = Number(active.dataset.ls26StartBeat);
      if (Number.isFinite(start)) return Math.max(0, start);
    }

    /* Fallback: locate the final timed chord before the IMPROV card in DOM order.
       Using its end-minus-epsilon guarantees a TIME SIG after the card cannot leak
       backwards into the held improvisation meter. */
    if (gate) {
      let previous = null;
      for (const chord of document.querySelectorAll('.ls26-timed-chord[data-ls26-start-beat]')) {
        if (chord.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING) previous = chord;
        else if (gate.compareDocumentPosition(chord) & Node.DOCUMENT_POSITION_FOLLOWING) break;
      }
      if (previous) {
        const end = Number(previous.dataset.ls26EndBeat);
        if (Number.isFinite(end)) return Math.max(0, end - 0.0001);
        const start = Number(previous.dataset.ls26StartBeat);
        if (Number.isFinite(start)) return Math.max(0, start);
      }
    }

    /* Last resort only. Normally the active/previous chord path above is used. */
    return Math.max(0, physicalBeat() - timelineOffset);
  }

  function lockPreHoldMeter() {
    installMapWrapper();
    if (heldMeter) return;
    const logical = logicalBeatImmediatelyBeforeHold();
    const source = segmentAtLogical(logical);
    const adjusted = adjustedSegment(source, logical);
    heldMeter = { ...adjusted };
    window.dispatchEvent(new CustomEvent('ls26:improv-meter-held', {
      detail:{ logicalBeat:logical, beatsPerBar:heldMeter.beatsPerBar, beatUnit:heldMeter.beatUnit }
    }));
  }

  function applyRelease(releaseBeat) {
    const exactOffset = coreTimingOffset();
    if (!Number.isFinite(exactOffset) || !Number.isFinite(releaseBeat)) {
      heldMeter = null;
      return;
    }
    timelineOffset = exactOffset;
    const logicalResumeBeat = releaseBeat - exactOffset;
    const source = segmentAtLogical(logicalResumeBeat);
    resumeAnchor = {
      logicalBeat: logicalResumeBeat,
      transportBeat: releaseBeat,
      segmentStartBeat: source.startBeat
    };
    heldMeter = null;
    window.dispatchEvent(new CustomEvent('ls26:improv-timeline-synced', {
      detail:{ releaseBeat, logicalResumeBeat, timingOffset:timelineOffset }
    }));
  }

  function syncHoldFromStatus() {
    const status = String(document.getElementById('chordFollowStatus')?.textContent || '');
    /* Lock as soon as the hold begins — NOT when Continue is tapped. This is the
       key behaviour: future TIME SIG markers never advance while waiting. */
    if (/IMPROV HOLD/i.test(status) && !/IMPROV EXIT QUEUED/i.test(status)) lockPreHoldMeter();
  }

  function observeHoldStatus() {
    const status = document.getElementById('chordFollowStatus');
    if (!status) return false;
    if (status.dataset.ls26PreHoldMeterObserved === '1') return true;
    status.dataset.ls26PreHoldMeterObserved = '1';
    statusObserver = new MutationObserver(syncHoldFromStatus);
    statusObserver.observe(status,{subtree:true,childList:true,characterData:true,attributes:true});
    syncHoldFromStatus();
    return true;
  }

  window.addEventListener('ls26:improv-release-countdown', event => {
    const detail = event.detail || {};
    if (detail.active === true) {
      /* By this point the meter should already be locked from IMPROV HOLD. Keep
         the same held bar through the whole exit countdown. */
      lockPreHoldMeter();
      const release = Number(detail.releaseBeat);
      pendingReleaseBeat = Number.isFinite(release) ? release : null;
      return;
    }
    const release = Number.isFinite(pendingReleaseBeat) ? pendingReleaseBeat : physicalBeat();
    applyRelease(release);
    pendingReleaseBeat = null;
  });

  window.addEventListener('ls26:song-ready', () => {
    timelineOffset = 0;
    heldMeter = null;
    pendingReleaseBeat = null;
    resumeAnchor = null;
    setTimeout(installAll,0);
  });

  function installAll() {
    installMapWrapper();
    installTimedViewWrapper();
    observeHoldStatus();
  }

  const start = () => {
    installAll();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installAll();
      if (attempts > 120 && mapWrapper && timedWrapper && document.getElementById('chordFollowStatus')) clearInterval(timer);
    },100);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();