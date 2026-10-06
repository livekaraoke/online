/* Transport-exact singer count-in synchronizer.
 * Complements lyricview-singer-bridge.js by reading the shared musical transport
 * directly, so singer count numbers stay aligned even when the audible/visual
 * metronome panel itself is not running.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerTransportSyncV3) return;
  window.__ls26SingerTransportSyncV3 = true;

  const songId = String(new URLSearchParams(location.search).get('id') || '').trim();
  if (!songId) return;
  const CHANNEL = 'ls26-singer-live-v3';
  let channel = null;
  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel(CHANNEL); } catch (_) {}
  let latest = null;
  let poll = 0;
  let lastBeat = -1;
  let playingSent = false;

  if (channel) channel.onmessage = event => {
    if (event.data?.type === 'state' && event.data.state?.songId === songId) latest = { ...event.data.state };
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function ref() { return window.db?.collection('karaokeControl')?.doc('liveLyrics'); }
  function followOn() { try { return Boolean(window.LS26TimedView?.enabled?.()); } catch (_) { return false; } }
  function bpm() {
    const song = window.LS26Performance?.song?.() || {};
    return clamp(Number(window.LS26Performance?.getBpm?.() || song.userBpm || song.originalBpm || 96) || 96, 20, 400);
  }
  function fallbackState() {
    const song = window.LS26Performance?.song?.() || {};
    return {
      version:3,
      songId,
      title:String(song.title || document.querySelector('#topbarSongTitle strong')?.textContent || 'Untitled').trim(),
      artist:String(song.artist || '').trim(),
      bpm:bpm(),
      phase:'countin',
      playing:false,
      countInBeat:0,
      countInBeatAtMs:0,
      sync:null,
      updatedAtMs:Date.now()
    };
  }
  function post(partial) {
    const state = { ...(latest || fallbackState()), ...partial, version:3, songId, bpm:bpm(), updatedAtMs:Date.now() };
    latest = state;
    try { channel?.postMessage({ type:'state', state, sentAtMs:Date.now() }); } catch (_) {}
    return state;
  }
  async function patchRemote(fields) {
    const target = ref();
    if (!target) return;
    const payload = {};
    for (const [key, value] of Object.entries(fields)) payload[`singerV3.${key}`] = value;
    try { await target.update(payload); }
    catch (_) {
      try { await target.set({ singerV3:{ ...(latest || fallbackState()), ...fields } }, { merge:true }); } catch (error) { console.warn('Singer transport sync update failed:', error); }
    }
  }

  async function disableLegacyFollower() {
    const target = ref();
    if (!target) return;
    try {
      await target.set({ singerSync:{ enabled:false, playing:false, songId, updatedAtMs:Date.now() } }, { merge:true });
    } catch (_) {}
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
          const at = Date.now();
          post({ phase:'countin', playing:false, countInBeat:number, countInBeatAtMs:at, sync:null });
          void patchRemote({ phase:'countin', playing:false, bpm:bpm(), countInBeat:number, countInBeatAtMs:at, updatedAtMs:at });
        }
        return;
      }

      if (!playingSent) {
        playingSent = true;
        post({ phase:'playing', playing:true, countInBeat:0, countInBeatAtMs:0 });
        void patchRemote({ phase:'playing', playing:true, bpm:bpm(), countInBeat:0, countInBeatAtMs:0, updatedAtMs:Date.now() });
      }
      stopPoll();
    }, 35);
  }

  function install() {
    void disableLegacyFollower();
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
    window.addEventListener('pagehide', () => { stopPoll(); try { channel?.close(); } catch (_) {} }, { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();