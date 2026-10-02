/* One audio context/transport per performance. No database, UI loop or storage. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./musical-transport.js'),require('./metronome-engine.js'));
 else root.LS26SongAudio=factory(root.LS26MusicalTransport,root.LS26Metronome);
})(typeof window==='object'?window:globalThis,function(transports,engine){
 'use strict';
 function create({window,getSettings,onClick=()=>{},onState=()=>{}}){
  let context,master,transport,clock,timer,version=0,pending=false,nodes=new Set();
  const settings=()=>{const raw=getSettings();return {...engine.normalize(raw),bpm:Number(raw.bpm)||96,beats:Number(raw.beats)||4,beatUnit:Number(raw.beatUnit)||4};};
  const snapshot=()=>transport?transport.snapshot():{state:'stopped',beat:0,bpm:settings().bpm,beatUnit:'quarter'};
  function cancel(){window.clearInterval(timer);timer=null;for(const node of nodes){try{node.stop();}catch(_){} }nodes.clear();}
  function emit(event){
   onClick(event);if(!event.settings.volume)return;
   const osc=context.createOscillator(),gain=context.createGain(),t=event.time;
   osc.type='sine';osc.frequency.setValueAtTime(event.sub?700:event.accent===2?1600:1000,t);
   gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime((event.sub?.14:event.accent===2?.5:.3)*event.settings.volume/100,t+.002);gain.gain.exponentialRampToValueAtTime(.0001,t+.045);
   osc.connect(gain);gain.connect(master);nodes.add(osc);osc.onended=()=>{nodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+.055);
  }
  function schedule(){if(transport?.snapshot().state==='playing')clock.schedule(context.currentTime);}
  function reschedule(){cancel();clock=new engine.TransportClock(transport,settings,emit);schedule();timer=window.setInterval(schedule,25);}
  async function activate(resume,options={}){
   const request=++version;pending=true;
   try{
    if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio is unavailable in this browser.');context=new Audio();master=context.createGain();master.connect(context.destination);transport=transports.fromAudioContext(context,{bpm:settings().bpm});context.onstatechange=()=>{if(context.state!=='running'&&transport.snapshot().state==='playing')pause();};}
    // Audio unlock happens immediately in the touch gesture, before awaiting.
    await context.resume();if(request!==version)return false;if(context.state!=='running')throw Error('Tap Play to enable audio.');
    transport.setBpm(settings().bpm);
    if(resume&&transport.snapshot().state==='paused')transport.resume();else transport.start({...options,delaySeconds:.05});
    pending=false;reschedule();onState(snapshot());return true;
   }catch(error){if(request===version){pending=false;pause();}throw error;}
  }
  function pause(){version++;pending=false;cancel();transport?.pause();onState(snapshot());return snapshot();}
  function stop(){version++;pending=false;cancel();transport?.stop();onState(snapshot());return snapshot();}
  function setBpm(value){if(transport){transport.setBpm(Number(value));if(snapshot().state==='playing')reschedule();}return snapshot();}
  window.addEventListener?.('pagehide',stop);
  window.document?.addEventListener('visibilitychange',()=>{if(window.document.hidden)pause();});
  return Object.freeze({start:options=>activate(false,options),resume:()=>activate(true),pause,stop,setBpm,
   seek:beat=>{transport?.seek(beat);if(transport&&snapshot().state==='playing')reschedule();return snapshot();},
   refresh:()=>{if(transport&&snapshot().state==='playing')reschedule();},snapshot,getBeat:()=>snapshot().beat,
   get pending(){return pending;},get context(){return context;},get transport(){return transport;}});
 }
 return Object.freeze({create});
});
