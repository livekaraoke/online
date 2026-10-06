/* Keep dynamic meter and Chord Follow aligned across IMPROV holds.
 * The metronome continues physically; the song timeline is shifted by the exact
 * Chord Follow timingOffset after release. Future TIME SIG markers shift with it.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const EPS = 1e-7;
  let rawMap = null;
  let mapWrapper = null;
  let rawTimedView = null;
  let timedWrapper = null;
  let timelineOffset = 0;
  let heldMeter = null;
  let pendingReleaseBeat = null;
  let resumeAnchor = null;

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
    if (current === mapWrapper || current.__ls26ImprovTimelineSyncV2) return true;
    rawMap = current;
    mapWrapper = {
      current: currentTransportSegment,
      nextAfter: nextTransportSegment,
      segments() { return sourceSegments().map(item => ({ ...item, startBeat:item.startBeat + timelineOffset })); },
      rebuild() { return rawMap?.rebuild?.(); },
      __ls26ImprovTimelineSyncV2: true
    };
    window.LS26MeterMap = mapWrapper;
    return true;
  }

  function installTimedViewWrapper() {
    const current = window.LS26TimedView;
    if (!current) return false;
    if (current === timedWrapper || current.__ls26ImprovTimelineSyncV2View) return true;
    rawTimedView = current;
    timedWrapper = {
      ...current,
      meter() {
        installMapWrapper();
        return mapWrapper?.current?.(physicalBeat()) || rawTimedView?.meter?.();
      }
    };
    Object.defineProperty(timedWrapper,'__ls26ImprovTimelineSyncV2View',{value:true,enumerable:false});
    if (current.__ls26DynamicMeterWrapper) Object.defineProperty(timedWrapper,'__ls26DynamicMeterWrapper',{value:true,enumerable:false});
    timedWrapper = Object.freeze(timedWrapper);
    window.LS26TimedView = timedWrapper;
    return true;
  }

  function lockCurrentMeter() {
    installMapWrapper();
    if (heldMeter) return;
    const logical = physicalBeat() - timelineOffset;
    const source = segmentAtLogical(logical);
    const adjusted = adjustedSegment(source, logical);
    heldMeter = { ...adjusted };
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

  window.addEventListener('ls26:improv-release-countdown', event => {
    const detail = event.detail || {};
    if (detail.active === true) {
      lockCurrentMeter();
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
  }

  const start = () => {
    installAll();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installAll();
      if (attempts > 120 && mapWrapper && timedWrapper) clearInterval(timer);
    },100);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();