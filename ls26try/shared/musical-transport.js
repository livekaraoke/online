/* Stage 2 local transport. Loading this file neither starts audio nor changes playback.
 * Use fromAudioContext(existingContext) to share the click scheduler's time domain.
 * No database, storage, intervals or animation-frame dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LS26MusicalTransport = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const finite = (value,name) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name+' must be a finite number');
    return value;
  };
  const tempo = value => {finite(value,'BPM');if (value<=0) throw new RangeError('BPM must be positive');return value;};
  function create({now=()=>performance.now()/1000,bpm=96,beatUnit='quarter'}={}) {
    if (typeof now!=='function') throw new TypeError('A monotonic clock in seconds is required');
    if (beatUnit!=='quarter') throw new RangeError('Only explicit quarter-note beats are supported in Stage 2');
    let currentBpm=tempo(bpm),state='stopped',anchorBeat=0,anchorTime=0,lastTime=-Infinity;
    function time() {
      const value=finite(now(),'Clock time');
      if (value<lastTime) throw new RangeError('Clock moved backwards; reset with a new transport for a new clock');
      lastTime=value;return value;
    }
    const position = at => state==='playing' ? anchorBeat+Math.max(0,at-anchorTime)*currentBpm/60 : anchorBeat;
    function snapshot() {return {state,bpm:currentBpm,beat:position(time()),beatUnit};}
    return Object.freeze({
      snapshot,
      getBeat:()=>position(time()),
      start({beat=0,countInBeats=0,delaySeconds=0}={}) {
        finite(beat,'Beat');finite(countInBeats,'Count-in');finite(delaySeconds,'Delay');
        if (countInBeats<0 || delaySeconds<0) throw new RangeError('Count-in and delay cannot be negative');
        anchorTime=time()+delaySeconds;anchorBeat=beat-countInBeats;state='playing';return snapshot();
      },
      pause() {const at=time();if(state==='playing'){anchorBeat=position(at);anchorTime=at;state='paused';}return snapshot();},
      resume() {if(state==='paused'){anchorTime=time();state='playing';}return snapshot();},
      stop() {anchorTime=time();anchorBeat=0;state='stopped';return snapshot();},
      reset(beat=0) {finite(beat,'Beat');anchorTime=time();anchorBeat=beat;state='stopped';return snapshot();},
      seek(beat) {finite(beat,'Beat');anchorTime=time();anchorBeat=beat;return snapshot();},
      setBpm(value) {
        tempo(value);const at=time();anchorBeat=position(at);anchorTime=Math.max(at,anchorTime);currentBpm=value;return snapshot();
      },
      // For a future scheduler in this same time domain. Tempo changes require
      // rescheduling any already-queued clicks; existing metronomes are not wired here.
      timeAtBeat(beat) {finite(beat,'Beat');return state==='playing' ? anchorTime+(beat-anchorBeat)*60/currentBpm : null;}
    });
  }
  function fromAudioContext(context,options={}) {
    if (!context || typeof context.currentTime!=='number') throw new TypeError('An AudioContext clock is required');
    return create({...options,now:()=>context.currentTime});
  }
  return Object.freeze({create,fromAudioContext});
});
