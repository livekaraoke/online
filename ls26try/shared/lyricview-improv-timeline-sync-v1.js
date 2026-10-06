/* Keep the metronome/meter timeline aligned with Chord Follow after an IMPROV hold.
 * Chord Follow already shifts its logical chord clock on release; this helper applies
 * the same absolute shift to dynamic meter changes and re-anchors the release on beat 1.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const EPS = 1e-7;
  const IMPROV_SELECTOR = 'a.lyrics-song-link[data-improv-link]';
  let baseMap = null;
  let mapWrapper = null;
  let baseTimedView = null;
  let timedWrapper = null;
  let timelineOffset = 0;
  let heldMeter = null;
  let pendingReleaseBeat = null;
  let pendingResumeBeat = null;
  let resumeAnchor = null;

  function physicalBeat() {
    try {
      const beat = Number(window.LS26Click?.driver?.()?.snapshot?.()?.beat);
      if (Number.isFinite(beat)) return beat;
    } catch (_) {}
    return Number(window.LS26TimedView?.startBeat?.()) || 0;
  }

  function sourceSegments() {
    let list = [];
    try { list = baseMap?.segments?.() || []; } catch (_) {}
    list = list
      .map(item => ({
        startBeat: Number(item?.startBeat) || 0,
        beatsPerBar: Math.max(1, Number(item?.beatsPerBar) || 4),
        beatUnit: Math.max(1, Number(item?.beatUnit) || 4)
      }))
      .sort((a, b) => a.startBeat - b.startBeat);
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

  function nextTimedChordAfter(gate) {
    if (!gate) return null;
    for (const node of document.querySelectorAll('.ls26-timed-chord[data-ls26-start-beat]')) {
      if (gate.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) return node;
    }
    return null;
  }

  function resumeLogicalBeat() {
    const gate = document.querySelector(`${IMPROV_SELECTOR}.ls26-improv-active`);
    const next = nextTimedChordAfter(gate);
    const beat = Number(next?.dataset?.ls26StartBeat);
    return Number.isFinite(beat) ? beat : null;
  }

  function currentLogicalBeat() {
    return physicalBeat() - timelineOffset;
  }

  function transportSegmentAt(transportBeat) {
    if (heldMeter) return { ...heldMeter };
    const logical = Number(transportBeat) - timelineOffset;
    const source = segmentAtLogical(logical);
    const next = nextLogicalSegment(source);
    let startBeat = source.startBeat + timelineOffset;

    if (
      resumeAnchor &&
      Math.abs(source.startBeat - resumeAnchor.segmentStartBeat) < EPS &&
      logical >= resumeAnchor.logicalBeat - EPS &&
      (!next || logical < next.startBeat - EPS)
    ) {
      // Resume the next chord on a fresh beat 1, then preserve all saved chord durations.
      startBeat = resumeAnchor.transportBeat;
    }
    return { ...source, startBeat };
  }

  function nextTransportSegment(startBeat) {
    if (heldMeter) return null;
    let source;
    if (resumeAnchor && Math.abs(Number(startBeat) - resumeAnchor.transportBeat) < 0.001) {
      source = segmentAtLogical(resumeAnchor.logicalBeat);
    } else {
      source = segmentAtLogical(Number(startBeat) - timelineOffset + EPS);
    }
    const next = nextLogicalSegment(source);
    return next ? { ...next, startBeat: next.startBeat + timelineOffset } : null;
  }

  function installMapWrapper() {
    const current = window.LS26MeterMap;
    if (!current) return false;
    if (current === mapWrapper || current.__ls26ImprovTimelineSync) return true;
    baseMap = current;
    mapWrapper = {
      current: transportSegmentAt,
      nextAfter: nextTransportSegment,
      segments() {
        return sourceSegments().map(segment => ({ ...segment, startBeat: segment.startBeat + timelineOffset }));
      },
      rebuild() {
        return baseMap?.rebuild?.();
      },
      __ls26ImprovTimelineSync: true,
      // Prevent the earlier refinement layer from wrapping this corrected map again.
      __ls26ImprovMeterLock: true
    };
    window.LS26MeterMap = mapWrapper;
    return true;
  }

  function installTimedViewWrapper() {
    const current = window.LS26TimedView;
    if (!current) return false;
    if (current === timedWrapper || current.__ls26ImprovTimelineSyncView) return true;
    baseTimedView = current;
    timedWrapper = {
      ...current,
      meter() {
        installMapWrapper();
        return mapWrapper?.current?.(physicalBeat()) || baseTimedView?.meter?.();
      }
    };
    Object.defineProperty(timedWrapper, '__ls26ImprovTimelineSyncView', { value:true, enumerable:false });
    Object.defineProperty(timedWrapper, '__ls26ImprovMeterView', { value:true, enumerable:false });
    if (current.__ls26DynamicMeterWrapper) {
      Object.defineProperty(timedWrapper, '__ls26DynamicMeterWrapper', { value:true, enumerable:false });
    }
    timedWrapper = Object.freeze(timedWrapper);
    window.LS26TimedView = timedWrapper;
    return true;
  }

  function lockCurrentMeter() {
    installMapWrapper();
    if (heldMeter) return;
    const resume = resumeLogicalBeat();
    // Use the meter immediately before the next chord so a future TIME SIG marker
    // cannot take over while the improvisation is still running.
    const logical = Number.isFinite(resume) ? Math.max(0, resume - 0.0001) : currentLogicalBeat();
    const source = segmentAtLogical(logical);
    heldMeter = { ...source, startBeat: source.startBeat + timelineOffset };
  }

  function releaseToSongTimeline(releaseBeat, resumeBeat) {
    if (!Number.isFinite(releaseBeat) || !Number.isFinite(resumeBeat)) return;
    timelineOffset = releaseBeat - resumeBeat;
    const segment = segmentAtLogical(resumeBeat);
    resumeAnchor = {
      logicalBeat: resumeBeat,
      transportBeat: releaseBeat,
      segmentStartBeat: segment.startBeat
    };
    heldMeter = null;
    window.dispatchEvent(new CustomEvent('ls26:improv-timeline-synced', {
      detail: { releaseBeat, resumeBeat, timingOffset: timelineOffset }
    }));
  }

  function syncHoldFromStatus() {
    const status = String(document.getElementById('chordFollowStatus')?.textContent || '');
    if (/IMPROV HOLD|IMPROV EXIT QUEUED/i.test(status)) lockCurrentMeter();
    else if (!document.querySelector(`${IMPROV_SELECTOR}.ls26-improv-active`) && !Number.isFinite(pendingReleaseBeat)) heldMeter = null;
  }

  function observeStatus() {
    const status = document.getElementById('chordFollowStatus');
    if (!status || status.dataset.ls26TimelineSyncObserved === '1') return false;
    status.dataset.ls26TimelineSyncObserved = '1';
    new MutationObserver(syncHoldFromStatus).observe(status, {
      subtree:true, childList:true, characterData:true, attributes:true
    });
    syncHoldFromStatus();
    return true;
  }

  window.addEventListener('ls26:improv-release-countdown', event => {
    const detail = event.detail || {};
    if (detail.active === true) {
      lockCurrentMeter();
      const release = Number(detail.releaseBeat);
      const resume = resumeLogicalBeat();
      pendingReleaseBeat = Number.isFinite(release) ? release : null;
      pendingResumeBeat = Number.isFinite(resume) ? resume : null;
      return;
    }
    if (Number.isFinite(pendingReleaseBeat) && Number.isFinite(pendingResumeBeat)) {
      releaseToSongTimeline(pendingReleaseBeat, pendingResumeBeat);
    }
    pendingReleaseBeat = null;
    pendingResumeBeat = null;
    if (!resumeAnchor) heldMeter = null;
  });

  window.addEventListener('ls26:song-ready', () => {
    timelineOffset = 0;
    heldMeter = null;
    pendingReleaseBeat = null;
    pendingResumeBeat = null;
    resumeAnchor = null;
    setTimeout(installAll, 0);
  });

  function installAll() {
    installMapWrapper();
    installTimedViewWrapper();
    observeStatus();
  }

  const start = () => {
    installAll();
    new MutationObserver(installAll).observe(document.body, { subtree:true, childList:true });
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installAll();
      if (attempts > 120 && mapWrapper && timedWrapper && document.getElementById('chordFollowStatus')) clearInterval(timer);
    }, 100);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();