/* Gesture-started Web Audio metronome. No recording, microphone access or database writes. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),engine=LS26Metronome;
  const storageKey='ls26:metronomeV1';
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch(_){}
  let settings=engine.normalize(saved.settings),presets=Array.isArray(saved.presets)?saved.presets.filter(p=>typeof p?.name==='string'&&p.name.trim()).slice(0,12).map(p=>({name:p.name.slice(0,60),settings:engine.normalize(p.settings)})):[];
  let context,master,running=false,starting=false,timer,frame,version=0,queue=[],nodes=new Set(),taps=[],startedAt=0,clock;
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify({settings,presets}));}catch(_){$('metroStatus').textContent='Settings could not be saved in this browser.';}}
  function drawControls(){
    for(const [id,key] of [['metroBpm','bpm'],['metroSlider','bpm'],['metroBeats','beats'],['metroDivision','division'],['metroSwing','swing'],['metroVolume','volume'],['metroSound','sound'],['metroCountIn','countIn']])$(id).value=settings[key];
    $('metroSwing').disabled=settings.division!==2;$('metroSwingValue').textContent=settings.swing+'%';$('metroVolumeValue').textContent=settings.volume+'%';
    const beats=$('metroBeatLights');beats.replaceChildren();
    settings.accents.forEach((accent,i)=>{const button=document.createElement('button');button.type='button';button.className='metro-beat';button.dataset.accent=String(accent);button.textContent=String(i+1);button.setAttribute('aria-label',`Beat ${i+1}: ${['muted','normal','accented'][accent]}. Tap to change.`);button.onclick=()=>{settings.accents[i]=(settings.accents[i]+1)%3;persist();drawControls();};beats.append(button);});
    $('metroStart').textContent=running?'Stop click':'Start click';$('metroStart').setAttribute('aria-pressed',String(running));
  }
  function cancelAudio(){clearInterval(timer);cancelAnimationFrame(frame);queue=[];for(const node of nodes){try{node.stop();}catch(_){}}nodes.clear();$('metroBeatLights').querySelectorAll('button').forEach(button=>button.classList.remove('playing'));}
  function stop(message='Stopped'){
    version++;running=false;starting=false;cancelAudio();master?.gain.cancelScheduledValues(context.currentTime);if(master)master.gain.setValueAtTime(0,context.currentTime);
    $('metroStart').disabled=false;$('metroStatus').textContent=message;drawControls();
  }
  function emit(event){
    queue.push(event);
    const {settings:s,beat,sub,accent,time}=event;
    if(!accent||!s.volume)return;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=s.sound==='wood'?'triangle':'sine';
    const frequency=sub?700:accent===2?1600:1000;
    oscillator.frequency.setValueAtTime(frequency,time);
    if(s.sound==='wood')oscillator.frequency.exponentialRampToValueAtTime(frequency*.45,time+.035);
    const level=sub ? .14 : accent===2 ? .5 : .3;
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(level,time+.002);gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
    oscillator.connect(gain);gain.connect(master);nodes.add(oscillator);
    oscillator.onended=()=>{nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    oscillator.start(time);oscillator.stop(time+.055);
  }
  function draw(){
    if(!running)return;
    let current;
    while(queue.length&&queue[0].time<=context.currentTime)current=queue.shift();
    if(current){
      $('metroBeatLights').querySelectorAll('button').forEach((button,i)=>button.classList.toggle('playing',i===current.beat));
      $('metroPosition').textContent=current.countIn?'Count-in':`Bar ${current.bar} · Beat ${current.beat+1}`;
    }
    const seconds=Math.max(0,Math.floor(context.currentTime-startedAt));$('metroElapsed').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    frame=requestAnimationFrame(draw);
  }
  async function start(){
    if(starting||running)return;const token=++version;starting=true;$('metroStart').disabled=true;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('This browser does not support Web Audio.');
      if(!context){context=new Audio();master=context.createGain();master.connect(context.destination);context.onstatechange=()=>{if(running&&context.state!=='running')stop('Audio paused. Tap Start to resume.');};}
      await context.resume();if(token!==version)return;
      if(context.state!=='running')throw Error('Audio is paused. Tap Start again.');
      master.gain.setValueAtTime(settings.volume/100,context.currentTime);running=true;starting=false;startedAt=context.currentTime;
      clock=new engine.Clock(()=>settings,emit);clock.start(context.currentTime+.05);clock.schedule(context.currentTime);
      timer=setInterval(()=>clock.schedule(context.currentTime),25);drawControls();draw();$('metroStatus').textContent='Playing';
    }catch(error){if(token===version)stop(error.message);}
    finally{if(token===version){starting=false;$('metroStart').disabled=false;}}
  }
  function applySettings(next,restart=false){
    settings=engine.normalize({...settings,...next});persist();
    if(master&&running)master.gain.setTargetAtTime(settings.volume/100,context.currentTime,.01);
    if(restart&&running){cancelAudio();clock=new engine.Clock(()=>settings,emit);clock.start(context.currentTime+.05);timer=setInterval(()=>clock.schedule(context.currentTime),25);draw();}
    drawControls();
  }
  function tap(){const result=engine.tapTempo(taps,performance.now());taps=result.times;if(result.bpm)applySettings({bpm:result.bpm});$('metroTapStatus').textContent=result.bpm?`${result.bpm} BPM · ${taps.length} taps averaged`:'Tap again to measure the tempo';}
  $('metroStart').onclick=()=>running?stop():start();$('metroTap').onclick=tap;
  $('metroTapReset').onclick=()=>{taps=[];$('metroTapStatus').textContent='Tap at least twice, or press T.';};
  $('metroBpm').onchange=event=>applySettings({bpm:event.target.value});$('metroSlider').oninput=event=>applySettings({bpm:event.target.value});
  document.querySelectorAll('[data-metro-delta]').forEach(button=>button.onclick=()=>applySettings({bpm:settings.bpm+Number(button.dataset.metroDelta)}));
  $('metroHalf').onclick=()=>applySettings({bpm:settings.bpm/2});$('metroDouble').onclick=()=>applySettings({bpm:settings.bpm*2});
  for(const [id,key,restart] of [['metroBeats','beats',true],['metroDivision','division',true],['metroSwing','swing',false],['metroVolume','volume',false],['metroSound','sound',false],['metroCountIn','countIn',false]])$(id).addEventListener(id==='metroVolume'||id==='metroSwing'?'input':'change',event=>applySettings({[key]:event.target.value},restart));
  function renderPresets(){const select=$('metroPreset');select.replaceChildren(new Option('Choose preset…',''));presets.forEach((preset,i)=>select.add(new Option(preset.name,String(i))));}
  $('metroSavePreset').onclick=()=>{
    const name=$('metroPresetName').value.trim();if(!name){$('metroPresetName').focus();$('metroStatus').textContent='Name this preset first.';return;}
    const existing=presets.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());if(existing<0&&presets.length>=12){$('metroStatus').textContent='Remove a preset first (12 maximum).';return;}
    const preset={name,settings:engine.normalize(settings)};if(existing>=0)presets[existing]=preset;else presets.push(preset);
    persist();renderPresets();$('metroPresetName').value='';$('metroStatus').textContent='Preset saved on this browser.';
  };
  $('metroPreset').onchange=event=>{if(event.target.value==='')return;const preset=presets[Number(event.target.value)];if(preset)applySettings(preset.settings,true);};
  $('metroDeletePreset').onclick=async()=>{const value=$('metroPreset').value;if(value==='')return;const index=Number(value),preset=presets[index];if(preset&&await LS26Dialogs.confirm(`Remove preset “${preset.name}”?`)){presets.splice(index,1);persist();renderPresets();}};
  document.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;if(event.code==='KeyT'){event.preventDefault();tap();}else if(event.code==='Space'&&!event.target.closest('button,a')){event.preventDefault();running?stop():start();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting))stop('Paused while this page is hidden. Tap Start to resume.');});
  window.addEventListener('pagehide',()=>stop());
  window.LK?.auth?.onAuthStateChanged(user=>{if(user)LK.sidebar?.loadSidebar?.();});
  drawControls();renderPresets();
})();
