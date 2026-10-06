/* One audio context/transport per performance. No database, UI loop or storage. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./musical-transport.js'),require('./metronome-engine.js'));
 else root.LS26SongAudio=factory(root.LS26MusicalTransport,root.LS26Metronome);
})(typeof window==='object'?window:globalThis,function(transports,engine){
 'use strict';
 function installLyricViewPolish(window){
  const document=window?.document;
  if(!document||window.__ls26LyricViewPolishInstalled)return;
  const install=()=>{
   if(window.__ls26LyricViewPolishInstalled||!document.body?.classList.contains('host-lyric-view-page'))return;
   window.__ls26LyricViewPolishInstalled=true;
   const style=document.createElement('style');style.id='ls26LyricViewPolish';style.textContent=`
.host-section.ls26-improv-visible-section{opacity:1!important;filter:none!important}
.host-section.ls26-improv-visible-section a.lyrics-song-link[data-improv-link].ls26-improv-active{position:relative!important;z-index:5!important;opacity:1!important;filter:none!important;color:#ffe36f!important;border-color:#ffd54a!important;background:rgba(255,193,7,.13)!important;box-shadow:0 0 0 3px rgba(255,213,74,.24),0 0 28px rgba(255,193,7,.34)!important}
`;(document.head||document.documentElement).append(style);
   const syncImprovVisibility=()=>{
    document.querySelectorAll('.host-section.ls26-improv-visible-section').forEach(section=>{
     if(!section.querySelector('a.lyrics-song-link[data-improv-link].ls26-improv-active'))section.classList.remove('ls26-improv-visible-section');
    });
    document.querySelectorAll('a.lyrics-song-link[data-improv-link].ls26-improv-active').forEach(gate=>gate.closest('.host-section')?.classList.add('ls26-improv-visible-section'));
   };
   if(window.MutationObserver){
    const observer=new window.MutationObserver(syncImprovVisibility);
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
   }
   document.addEventListener('click',event=>{
    if(!event.target.closest?.('#autoScrollBtn'))return;
    document.querySelectorAll('.ls26-start-here-selected').forEach(node=>node.classList.remove('ls26-start-here-selected'));
    document.querySelectorAll('#sectionProgress .ls26-start-section').forEach(node=>node.classList.remove('ls26-start-section'));
   },true);
   syncImprovVisibility();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
 }
 function create({window,getSettings,onClick=()=>{},onState=()=>{}}){
  installLyricViewPolish(window);
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
    if(resume&&transport.snapshot().state==='paused')transport.resume();
    else{
     const startOptions={...(options||{})};
     // LyricView can choose a deliberate timed start point. Keep this transport
     // concern local: callers that do not expose startBeat() continue at beat 0.
     if(startOptions.beat==null){
      const selected=Number(window.LS26TimedView?.startBeat?.());
      if(Number.isFinite(selected)&&selected>=0)startOptions.beat=selected;
     }
     transport.start({...startOptions,delaySeconds:.05});
    }
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
