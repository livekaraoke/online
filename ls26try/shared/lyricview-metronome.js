/* Compact performance click, sharing the advanced metronome's audio-clock engine. */
(() => {
  'use strict';
  function mount(container){
    const $=id=>document.getElementById(id),engine=window.LS26Metronome;
    const key='ls26:lyricviewMetronomeV1';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(_){}
    let options=engine.normalize(saved),follow=saved.follow===true,visual=saved.visual===true,taps=[];
    let context,master,clock,timer,frame,running=false,starting=false,version=0,queue=[],nodes=new Set();
    container.innerHTML=`<h3>METRONOME</h3><p class="lv-metro-tempo">Uses Current BPM · <strong id="lvMetroBpm">—</strong></p>
      <div class="lv-metro-actions"><button id="lvMetroStart" type="button" aria-pressed="false">Start click</button><button id="lvMetroTap" type="button">Tap tempo</button></div>
      <label class="lv-metro-check"><input id="lvMetroFollow" type="checkbox"> Follow bottom Play / Pause</label>
      <label class="lv-metro-check"><input id="lvMetroVisual" type="checkbox"> Visual beat flash around screen</label>
      <div class="lv-metro-settings"><label>Beats per bar<select id="lvMetroBeats">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></label>
      <label>Clicks per beat<select id="lvMetroDivision"><option value="1">1 · beat</option><option value="2">2 · eighths</option><option value="3">3 · triplets</option><option value="4">4 · sixteenths</option></select></label></div>
      <label class="lv-metro-check"><input id="lvMetroAccent" type="checkbox"> Accent first beat</label>
      <label class="lv-metro-volume">Volume <output id="lvMetroVolumeLabel"></output><input id="lvMetroVolume" type="range" min="0" max="100" step="1"></label>
      <p id="lvMetroStatus" role="status">Stopped</p><span id="lvMetroBeat" class="lv-metro-beat" aria-hidden="true">●</span>`;
    const visualDefaults={
      metronomeBeat1Color:'#ffd05a',metronomeBeat2Color:'#00cafa',metronomeBeat3Color:'#00cafa',metronomeBeat4Color:'#00cafa',
      metronomeFlashBrightness:72,metronomeEdgeThickness:8,metronomeFlashDuration:120,
      metronomeShowBeatNumber:true,metronomeNumberSize:220,metronomeNumberOpacity:42,metronomeNumberVerticalPosition:31
    };
    function getVisualSettings(){return {...visualDefaults,...(window.LS26Settings?.get?.()||{})};}
    function ensureVisualStyles(){
      if(document.getElementById('lvMetroVisualStyles'))return;
      const style=document.createElement('style');style.id='lvMetroVisualStyles';
      style.textContent=`
        #lvMetroScreenBeat{position:fixed;inset:0;z-index:50000;pointer-events:none;color:var(--ls26-metro-beat-2-color,#00cafa)}
        #lvMetroScreenBeat .lv-metro-screen-edge{position:absolute;background:currentColor;opacity:0;transition:opacity 45ms linear;box-shadow:0 0 26px currentColor,0 0 62px currentColor}
        #lvMetroScreenBeat .lv-metro-screen-edge.left,#lvMetroScreenBeat .lv-metro-screen-edge.right{top:0;bottom:0;width:var(--ls26-metro-edge-thickness,8px)}
        #lvMetroScreenBeat .lv-metro-screen-edge.left{left:0}#lvMetroScreenBeat .lv-metro-screen-edge.right{right:0}
        #lvMetroScreenBeat .lv-metro-screen-edge.top,#lvMetroScreenBeat .lv-metro-screen-edge.bottom{left:0;right:0;height:var(--ls26-metro-edge-thickness,8px)}
        #lvMetroScreenBeat .lv-metro-screen-edge.top{top:0}#lvMetroScreenBeat .lv-metro-screen-edge.bottom{bottom:0}
        #lvMetroScreenBeat.pulse .lv-metro-screen-edge.left,#lvMetroScreenBeat.pulse .lv-metro-screen-edge.right{opacity:var(--ls26-metro-flash-opacity,.72)}
        #lvMetroScreenBeat.pulse.beat-one .lv-metro-screen-edge.top,#lvMetroScreenBeat.pulse.beat-one .lv-metro-screen-edge.bottom{opacity:var(--ls26-metro-flash-opacity,.72)}
        #lvMetroScreenBeat:not(.beat-one) .lv-metro-screen-edge.top,#lvMetroScreenBeat:not(.beat-one) .lv-metro-screen-edge.bottom{opacity:0!important}
        #lvMetroScreenBeat .lv-metro-screen-number{position:absolute;right:clamp(18px,4vw,54px);top:var(--ls26-metro-number-top,31%);transform:translateY(-50%);display:grid;place-items:center;width:var(--ls26-metro-number-size,220px);height:var(--ls26-metro-number-size,220px);box-sizing:border-box;border:4px solid currentColor;border-radius:50%;background:rgba(0,10,18,.08);box-shadow:0 0 30px currentColor;color:#fff;font-size:var(--ls26-metro-number-font-size,99px);font-weight:950;line-height:1;opacity:0;transition:opacity 45ms linear}
        #lvMetroScreenBeat.pulse .lv-metro-screen-number{opacity:var(--ls26-metro-number-opacity,.42)}
        html.ls26-hide-metro-number #lvMetroScreenBeat .lv-metro-screen-number{display:none}
        #lvMetroScreenBeat.accented .lv-metro-screen-edge{box-shadow:0 0 34px currentColor,0 0 82px currentColor}
        #lvMetroScreenBeat.accented .lv-metro-screen-number{border-width:6px;box-shadow:0 0 38px currentColor,0 0 82px currentColor}
      `;
      document.head.appendChild(style);
    }
    function ensureVisualLayer(){
      ensureVisualStyles();let layer=document.getElementById('lvMetroScreenBeat');if(layer)return layer;
      layer=document.createElement('div');layer.id='lvMetroScreenBeat';layer.setAttribute('aria-hidden','true');
      layer.innerHTML='<span class="lv-metro-screen-edge top"></span><span class="lv-metro-screen-edge right"></span><span class="lv-metro-screen-edge bottom"></span><span class="lv-metro-screen-edge left"></span><span class="lv-metro-screen-number"></span>';
      document.body.appendChild(layer);return layer;
    }
    function applyVisualSettings(){
      const s=getVisualSettings(),root=document.documentElement;
      root.style.setProperty('--ls26-metro-flash-opacity',String(Number(s.metronomeFlashBrightness||72)/100));
      root.style.setProperty('--ls26-metro-edge-thickness',Number(s.metronomeEdgeThickness||8)+'px');
      root.style.setProperty('--ls26-metro-number-size',Number(s.metronomeNumberSize||220)+'px');
      root.style.setProperty('--ls26-metro-number-font-size',Math.round(Number(s.metronomeNumberSize||220)*.45)+'px');
      root.style.setProperty('--ls26-metro-number-opacity',String(Number(s.metronomeNumberOpacity||42)/100));
      root.style.setProperty('--ls26-metro-number-top',Number(s.metronomeNumberVerticalPosition||31)+'%');
      root.classList.toggle('ls26-hide-metro-number',s.metronomeShowBeatNumber===false);
      return s;
    }
    let visualTimer;
    function clearVisual(){
      clearTimeout(visualTimer);const layer=document.getElementById('lvMetroScreenBeat');if(layer){layer.classList.remove('pulse','accented','beat-one');}
    }
    function flashVisual(event){
      if(!visual||event.sub!==0)return;
      const s=applyVisualSettings(),layer=ensureVisualLayer(),beat=event.beat+1,colourIndex=(event.beat%4)+1,accented=event.beat===0&&event.accent===2;
      layer.style.color=s['metronomeBeat'+colourIndex+'Color']||visualDefaults['metronomeBeat'+colourIndex+'Color'];
      layer.querySelector('.lv-metro-screen-number').textContent=String(beat);
      layer.classList.toggle('beat-one',event.beat===0);
      layer.classList.toggle('accented',accented);
      layer.classList.add('pulse');
      clearTimeout(visualTimer);
      const duration=Number(s.metronomeFlashDuration||120);
      visualTimer=setTimeout(()=>layer.classList.remove('pulse'),Math.round(duration*(accented?1.3:1)));
    }
    const current=()=>window.LS26Performance?.getBpm?.()||96;
    const settings=()=>({...options,bpm:current(),countIn:0,accents:Array.from({length:options.beats},(_,i)=>i===0&&$('lvMetroAccent').checked?2:1)});
    function persist(){try{localStorage.setItem(key,JSON.stringify({...options,follow,visual,accent:$('lvMetroAccent').checked}));}catch(_) {}}
    function sync(){ $('lvMetroBpm').textContent=current();$('lvMetroStart').textContent=running?'Stop click':'Start click';$('lvMetroStart').setAttribute('aria-pressed',String(running)); }
    function cancel(){clearInterval(timer);cancelAnimationFrame(frame);clearVisual();queue=[];for(const node of nodes){try{node.stop();}catch(_){}}nodes.clear();$('lvMetroBeat').classList.remove('active');}
    function stop(message='Stopped'){version++;running=false;starting=false;cancel();if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);}$('lvMetroStart').disabled=false;$('lvMetroStatus').textContent=message;sync();}
    function emit(event){
      queue.push(event);if(!event.settings.volume)return;
      const osc=context.createOscillator(),gain=context.createGain(),time=event.time;
      osc.type='sine';osc.frequency.setValueAtTime(event.sub?700:event.accent===2?1600:1000,time);
      gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(event.sub ? .14 : event.accent===2 ? .5 : .3,time+.002);gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
      osc.connect(gain);gain.connect(master);nodes.add(osc);osc.onended=()=>{nodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(time);osc.stop(time+.055);
    }
    let lastBeatAt=-1;
    function draw(){
      if(!running)return;
      let event;while(queue.length&&queue[0].time<=context.currentTime)event=queue.shift();
      if(event){lastBeatAt=event.time;$('lvMetroBeat').textContent=String(event.beat+1);flashVisual(event);}
      $('lvMetroBeat').classList.toggle('active',context.currentTime-lastBeatAt<.09);frame=requestAnimationFrame(draw);
    }
    async function start(){
      if(running||starting||!window.LS26Performance?.song())return;
      const token=++version;starting=true;$('lvMetroStart').disabled=true;
      try{
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio is unavailable in this browser.');
        if(!context){context=new Audio();master=context.createGain();master.connect(context.destination);context.onstatechange=()=>{if(running&&context.state!=='running')stop('Audio paused. Tap Start click to resume.');};}
        // Called directly during the Play/tap gesture, before any database awaits.
        await context.resume();if(token!==version)return;
        if(context.state!=='running')throw Error('Tap Start click to enable audio.');
        master.gain.setValueAtTime(options.volume/100,context.currentTime);running=true;starting=false;
        clock=new engine.Clock(settings,emit);clock.start(context.currentTime+.05);clock.schedule(context.currentTime);
        timer=setInterval(()=>clock.schedule(context.currentTime),25);draw();sync();$('lvMetroStatus').textContent='Playing';
      }catch(error){if(token===version)stop(error.message);}
      finally{if(token===version){starting=false;$('lvMetroStart').disabled=false;}}
    }
    $('lvMetroFollow').checked=follow;$('lvMetroVisual').checked=visual;$('lvMetroAccent').checked=saved.accent!==false;
    $('lvMetroBeats').value=options.beats;$('lvMetroDivision').value=options.division;$('lvMetroVolume').value=options.volume;$('lvMetroVolumeLabel').textContent=options.volume+'%';
    $('lvMetroStart').onclick=()=>running||starting?stop():start();
    $('lvMetroTap').onclick=()=>{const tap=engine.tapTempo(taps,performance.now());taps=tap.times;if(tap.bpm){window.LS26Performance?.setBpm(tap.bpm);sync();}$('lvMetroStatus').textContent=tap.bpm?`${tap.bpm} BPM · ${taps.length} taps`:'Tap again to measure tempo';};
    $('lvMetroFollow').onchange=e=>{follow=e.target.checked;persist();if(follow){if(window.LS26Performance?.isScrolling())start();else stop();}};
    $('lvMetroVisual').onchange=e=>{visual=e.target.checked;persist();if(!visual)clearVisual();};
    $('lvMetroAccent').onchange=persist;
    for(const [id,name] of [['lvMetroBeats','beats'],['lvMetroDivision','division']])$(id).onchange=e=>{options=engine.normalize({...options,[name]:e.target.value});persist();if(running){cancel();clock=new engine.Clock(settings,emit);clock.start(context.currentTime+.05);timer=setInterval(()=>clock.schedule(context.currentTime),25);draw();}};
    $('lvMetroVolume').oninput=e=>{options.volume=Number(e.target.value);$('lvMetroVolumeLabel').textContent=options.volume+'%';persist();if(running)master.gain.setTargetAtTime(options.volume/100,context.currentTime,.01);};
    window.addEventListener('ls26:tempo-changed',sync);
    window.addEventListener('ls26:settings-applied',applyVisualSettings);
    window.addEventListener('ls26:scroll-state',e=>{if(follow){if(e.detail.playing)start();else stop();}});
    window.addEventListener('ls26:song-ready',()=>{stop();taps=[];sync();});
    window.addEventListener('ls26:song-finished',()=>stop());
    window.addEventListener('pagehide',()=>stop());
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting))stop('Paused while hidden. Tap Start click to resume.');});
    applyVisualSettings();sync();return {stop};
  }
  window.LS26LyricMetronome={mount};
})();
