/* LyricView Chord Follow polish + dynamic time-signature map. */
(() => {
  'use strict';
  if(!/\/host\/lyricview\.html$/i.test(String(location.pathname||'')))return;

  const $=id=>document.getElementById(id);
  const q=selector=>document.querySelector(selector);
  const qa=selector=>[...document.querySelectorAll(selector)];
  let improvCountdown={active:false,orangeFromBeat:null,releaseBeat:null};
  let rawTimedView=null,wrappedTimedView=null,baseMeter=null;
  let segments=[];

  const style=document.createElement('style');
  style.id='ls26FollowPolishStyle';
  style.textContent=`
    #chordFollowFloatCard{background:rgba(2,18,27,.88)!important;backdrop-filter:blur(10px)!important}
    #chordFollowFloatCard #closeChordFollowControls{color:#ff5865!important;border-color:rgba(255,88,101,.7)!important;background:rgba(255,49,67,.10)!important;box-shadow:0 0 12px rgba(255,49,67,.08)!important}
    #chordFollowFloatCard #closeChordFollowControls:hover,#chordFollowFloatCard #closeChordFollowControls:focus-visible{color:#fff!important;border-color:#ff3143!important;background:rgba(255,49,67,.24)!important}
    #chordFollowFloatCard .ls26-follow-status-wrap{display:grid!important;grid-template-columns:minmax(0,1fr) 30px!important;gap:7px!important;align-items:end!important;margin-top:6px!important}
    #chordFollowFloatCard .ls26-follow-status-copy{min-width:0!important}
    #chordFollowFloatCard .ls26-follow-status-summary{font-size:12.5px!important;font-weight:950!important;line-height:1.05!important;letter-spacing:.02em!important;color:var(--ls-accent)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #chordFollowFloatCard .ls26-follow-status-summary[data-state="paused"],#chordFollowFloatCard .ls26-follow-status-summary[data-state="manual"],#chordFollowFloatCard .ls26-follow-status-summary[data-state="countin"]{color:#ffd05a!important}
    #chordFollowFloatCard .ls26-follow-status-summary[data-state="improv"]{color:var(--ls26-improv-countdown-color,#ff8a24)!important}
    #chordFollowFloatCard .ls26-follow-status-summary[data-state="unavailable"]{color:#ff5865!important}
    #chordFollowFloatCard .ls26-follow-status-summary[data-state="complete"]{color:#41e37a!important}
    #chordFollowFloatCard .ls26-follow-status-summary[data-state="off"],#chordFollowFloatCard .ls26-follow-status-summary[data-state="idle"]{color:var(--ls-muted)!important}
    #chordFollowFloatCard #chordFollowStatus{margin:3px 0 0!important;max-height:38px!important;font-size:8.5px!important;line-height:1.2!important}
    #chordFollowFloatCard .ls26-follow-beat{display:grid!important;place-items:center!important;width:30px!important;height:30px!important;border:1px solid color-mix(in srgb,var(--ls-accent) 52%,var(--ls-border))!important;border-radius:50%!important;background:rgba(0,202,250,.08)!important;color:var(--ls-accent)!important;font-size:12px!important;font-weight:950!important;line-height:1!important;box-shadow:0 0 10px rgba(0,202,250,.08)!important}
    #chordFollowFloatCard .ls26-follow-beat.is-orange{border-color:var(--ls26-improv-countdown-color,#ff8a24)!important;color:var(--ls26-improv-countdown-color,#ff8a24)!important;background:color-mix(in srgb,var(--ls26-improv-countdown-color,#ff8a24) 9%,transparent)!important}
    .song-info-card.lv-metronome .ls26-moved-nav-bpm{display:flex!important;align-items:center!important;gap:9px!important;margin:0!important;padding:8px 0!important;color:var(--ls-text)!important;font-size:13px!important;font-weight:700!important}
    .host-section-body .ls26-time-signature-change,.host-section-body .ls26-inline-performance-note{display:inline-block!important;vertical-align:middle!important;margin:3px 6px!important;padding:5px 9px!important;border-radius:8px!important;font-size:11px!important;font-weight:950!important;line-height:1.1!important;white-space:nowrap!important}
    .host-section-body .ls26-time-signature-change{border:1px solid rgba(255,178,64,.65)!important;background:rgba(255,178,64,.10)!important;color:#ffc86a!important}
    .host-section-body .ls26-time-signature-change::before{content:'TIME ' attr(data-time-signature)!important}
    .host-section-body .ls26-inline-performance-note{border:1px solid rgba(65,227,122,.58)!important;background:rgba(65,227,122,.10)!important;color:#75f2a0!important}
    .host-section-body .ls26-inline-performance-note::before{content:'PERFORMANCE NOTE · ' attr(data-performance-note)!important}
  `;
  (document.head||document.documentElement).append(style);

  function parseSig(value){
    const m=String(value||'').trim().match(/^(\d{1,2})\s*\/\s*(1|2|4|8|16)$/);if(!m)return null;
    const beats=Number(m[1]),beatUnit=Number(m[2]);if(beats<1||beats>32)return null;return {beatsPerBar:beats,beatUnit};
  }
  function currentDriverBeat(){
    try{
      const driver=window.LS26Click?.driver?.(),snap=driver?.snapshot?.();
      const selected=Number(rawTimedView?.startBeat?.())||0;
      if(!snap)return selected;
      if(snap.state==='stopped'&&selected>0)return selected;
      return Number.isFinite(Number(snap.beat))?Number(snap.beat):selected;
    }catch(_){return Number(rawTimedView?.startBeat?.())||0;}
  }
  function normaliseBase(value){
    const beats=Math.max(1,Number(value?.beatsPerBar)||4),beatUnit=Math.max(1,Number(value?.beatUnit)||4);return {startBeat:0,beatsPerBar:beats,beatUnit};
  }
  function rebuildMeterMap(){
    if(rawTimedView){const meter=rawTimedView.meter?.();if(meter)baseMeter=normaliseBase(meter);}
    if(!baseMeter)baseMeter={startBeat:0,beatsPerBar:4,beatUnit:4};
    const timed=qa('.ls26-timed-chord[data-ls26-start-beat]').filter(node=>Number.isFinite(Number(node.dataset.ls26StartBeat)));
    const changes=[];
    for(const marker of qa('.ls26-time-signature-change[data-time-signature]')){
      const sig=parseSig(marker.dataset.timeSignature);if(!sig)continue;
      let next=null;
      for(const chord of timed){if(marker.compareDocumentPosition(chord)&Node.DOCUMENT_POSITION_FOLLOWING){next=chord;break;}}
      if(!next&&timed.length&&marker.compareDocumentPosition(timed[0])&Node.DOCUMENT_POSITION_FOLLOWING)next=timed[0];
      if(!next)continue;
      const startBeat=Number(next.dataset.ls26StartBeat);if(!Number.isFinite(startBeat))continue;
      changes.push({startBeat,...sig});
    }
    const byBeat=new Map([[0,{...baseMeter,startBeat:0}]]);
    changes.sort((a,b)=>a.startBeat-b.startBeat).forEach(change=>byBeat.set(change.startBeat,change));
    segments=[...byBeat.values()].sort((a,b)=>a.startBeat-b.startBeat);
    window.dispatchEvent(new CustomEvent('ls26:meter-map-changed',{detail:{segments:segments.map(item=>({...item}))}}));
  }
  function meterAt(beat){
    const value=Number(beat),target=Number.isFinite(value)?value:0;let found=segments[0]||baseMeter||{startBeat:0,beatsPerBar:4,beatUnit:4};
    for(const segment of segments){if(segment.startBeat<=target+1e-9)found=segment;else break;}return {...found};
  }
  function nextAfter(startBeat){const start=Number(startBeat)||0;return segments.find(segment=>segment.startBeat>start+1e-9)||null;}
  window.LS26MeterMap={current:meterAt,nextAfter,segments:()=>segments.map(item=>({...item})),rebuild:rebuildMeterMap};

  function wrapTimedView(){
    const current=window.LS26TimedView;if(!current)return false;
    if(current===wrappedTimedView)return true;
    if(current.__ls26DynamicMeterWrapper){wrappedTimedView=current;return true;}
    rawTimedView=current;baseMeter=normaliseBase(current.meter?.()||baseMeter);rebuildMeterMap();
    const wrapper={...current,meter:()=>meterAt(currentDriverBeat())};
    Object.defineProperty(wrapper,'__ls26DynamicMeterWrapper',{value:true,enumerable:false});
    Object.defineProperty(wrapper,'__ls26DynamicMeterSource',{value:current,enumerable:false});
    wrappedTimedView=Object.freeze(wrapper);window.LS26TimedView=wrappedTimedView;return true;
  }

  function patchTransportClock(){
    const engine=window.LS26Metronome;if(!engine||engine.__ls26DynamicMeterClock)return false;
    class MeterAwareTransportClock{
      constructor(transport,getSettings,emit){this.transport=transport;this.getSettings=getSettings;this.emit=emit;this.step=null;this.key='';}
      reset(){this.step=null;this.key='';}
      effectiveSegment(beat,settings){
        const selected=Math.max(0,Number(window.LS26TimedView?.startBeat?.())||0),target=Number(beat)||0;
        let segment=window.LS26MeterMap?.current?.(target)||{startBeat:0,beatsPerBar:settings.beats||4,beatUnit:settings.beatUnit||4};
        const next=window.LS26MeterMap?.nextAfter?.(segment.startBeat);
        if(selected>segment.startBeat&&(!next||selected<next.startBeat-1e-9)&&target>=selected-64&&target<(next?.startBeat??Infinity))segment={...segment,startBeat:selected};
        if(target<selected-1e-9){const atStart=window.LS26MeterMap?.current?.(selected)||segment;segment={...atStart,startBeat:selected};}
        return segment;
      }
      merged(settings,segment){return {...settings,beats:Math.max(1,Number(segment.beatsPerBar)||Number(settings.beats)||4),beatUnit:Math.max(1,Number(segment.beatUnit)||Number(settings.beatUnit)||4)};}
      position(step,s,segment){const whole=Math.floor(step/s.division),sub=((step%s.division)+s.division)%s.division,frac=s.division===2&&sub?s.swing/100:sub/s.division;return segment.startBeat+(whole+frac)*4/(s.beatUnit||4);}
      stepAt(beat,s,segment){let step=Math.floor((Number(beat)-segment.startBeat)/(4/(s.beatUnit||4))*s.division)-2;for(let guard=0;guard<24&&this.position(step,s,segment)<Number(beat)-1e-7;guard++)step++;return step;}
      schedule(now){
        if(this.transport.snapshot().state!=='playing')return;
        const realBeat=this.transport.getBeat();let base=this.getSettings(),segment=this.effectiveSegment(realBeat,base),s=this.merged(base,segment),key=[segment.startBeat,s.beats,s.beatUnit,s.division,s.swing].join(':');
        if(this.step===null||this.key!==key){this.step=this.stepAt(realBeat,s,segment);this.key=key;}
        for(let guard=0;guard<240;guard++){
          base=this.getSettings();s=this.merged(base,segment);let position=this.position(this.step,s,segment);
          const next=window.LS26MeterMap?.nextAfter?.(segment.startBeat);
          if(next&&position>=next.startBeat-1e-7){segment={...next};s=this.merged(base,segment);this.step=this.stepAt(Math.max(realBeat,next.startBeat),s,segment);this.key=[segment.startBeat,s.beats,s.beatUnit,s.division,s.swing].join(':');continue;}
          const time=this.transport.timeAtBeat(position);if(time===null||time>=now+.1)break;
          const whole=Math.floor(this.step/s.division),index=((whole%s.beats)+s.beats)%s.beats,sub=((this.step%s.division)+s.division)%s.division;
          if(time>=now-.005){const accents=Array.isArray(base.accents)?base.accents:[],accent=accents[index]??(index===0?(accents[0]??2):1),selected=Number(window.LS26TimedView?.startBeat?.())||0;this.emit({time,position,beat:index,sub,bar:Math.floor(whole/s.beats)+1,countIn:position<selected-1e-7,accent,settings:{...s,accents:Array.from({length:s.beats},(_,i)=>accents[i]??(i===0?(accents[0]??2):1))}});}
          this.step++;
        }
      }
    }
    engine.TransportClock=MeterAwareTransportClock;engine.__ls26DynamicMeterClock=true;return true;
  }

  function summariseStatus(text){
    const t=String(text||'').trim();if(!t)return {text:'READY',state:'idle'};
    let m=t.match(/^(.+?)\s*·\s*chord\s+(\d+)\s+of\s+(\d+)(?:\s*·\s*(paused))?/i);
    if(m)return {text:`${m[1]} · ${m[2]}/${m[3]}${m[4]?' · PAUSED':''}`,state:m[4]?'paused':'following'};
    if(/IMPROV EXIT QUEUED/i.test(t))return {text:'IMPROV EXIT QUEUED',state:'improv'};
    if(/IMPROV HOLD/i.test(t))return {text:'IMPROV HOLD',state:'improv'};
    if(/POSITIONING PAUSED/i.test(t))return {text:'POSITIONING PAUSED',state:'manual'};
    if(/MANUAL VIEW/i.test(t))return {text:'MANUAL VIEW',state:'manual'};
    if(/COUNT-IN/i.test(t))return {text:t.split(/\n|\./)[0].replace(/Count-in/i,'COUNT-IN'),state:'countin'};
    if(/UNAVAILABLE/i.test(t))return {text:'FOLLOW UNAVAILABLE',state:'unavailable'};
    if(/COMPLETE/i.test(t))return {text:'SONG COMPLETE',state:'complete'};
    if(/NORMAL AUTO-SCROLL|FOLLOW OFF/i.test(t))return {text:'FOLLOW OFF',state:'off'};
    if(/CONTINUING/i.test(t))return {text:'CONTINUING',state:'following'};
    return {text:t.length>34?t.slice(0,31)+'…':t,state:'following'};
  }

  function installCardPolish(){
    const card=$('chordFollowFloatCard'),status=$('chordFollowStatus');if(!card||!status)return false;
    if(card.dataset.ls26Polished==='1')return true;card.dataset.ls26Polished='1';
    const options=card.querySelector('.chord-follow-card-options');
    const wrap=document.createElement('div'),copy=document.createElement('div'),summary=document.createElement('div'),beat=document.createElement('span');
    wrap.className='ls26-follow-status-wrap';copy.className='ls26-follow-status-copy';summary.className='ls26-follow-status-summary';beat.className='ls26-follow-beat';beat.textContent='–';beat.setAttribute('aria-label','Current metronome beat');
    copy.append(summary,status);wrap.append(copy,beat);(options||card.querySelector('.chord-follow-card-head')).insertAdjacentElement('afterend',wrap);
    const update=()=>{const s=summariseStatus(status.textContent);summary.textContent=s.text;summary.dataset.state=s.state;};update();
    new MutationObserver(update).observe(status,{subtree:true,childList:true,characterData:true,attributes:true});
    window.addEventListener('ls26:metronome-beat',event=>{
      const d=event.detail||{},number=Number(d.beat);if(Number.isFinite(number))beat.textContent=String(number);
      const orange=improvCountdown.active&&Number.isFinite(Number(d.position))&&Number(d.position)>=Number(improvCountdown.orangeFromBeat)-1e-7&&Number(d.position)<Number(improvCountdown.releaseBeat)-1e-7;
      beat.classList.toggle('is-orange',orange);
      const accent=$('lvMetroAccent');
      if(number===1&&accent&&!accent.checked&&!orange){const layer=$('lvMetroScreenBeat'),settings=window.LS26Settings?.get?.()||{};if(layer)layer.style.color=settings.metronomeBeat2Color||'#00cafa';}
    });
    window.addEventListener('ls26:transport-state',event=>{if(event.detail?.state==='stopped'){beat.textContent='–';beat.classList.remove('is-orange');}});
    return true;
  }

  function moveNavBpmSetting(){
    const input=$('ls26ShowNavBpm'),metro=q('.song-info-card.lv-metronome');if(!input||!metro)return false;
    const label=input.closest('label');if(!label||metro.contains(label))return true;
    label.className='lv-metro-check ls26-moved-nav-bpm';label.textContent='';label.append(input,document.createTextNode(' Show current BPM between navigation arrows'));
    const controls=$('lvMetroShowChordFollowControls')?.closest('label');if(controls)metro.insertBefore(label,controls);else metro.append(label);return true;
  }

  window.addEventListener('ls26:improv-release-countdown',event=>{improvCountdown={active:event.detail?.active===true,orangeFromBeat:Number(event.detail?.orangeFromBeat),releaseBeat:Number(event.detail?.releaseBeat)};});
  window.addEventListener('ls26:song-ready',()=>setTimeout(()=>{wrapTimedView();rebuildMeterMap();installCardPolish();moveNavBpmSetting();},0));
  window.addEventListener('ls26:chord-highlight-visibility',()=>rebuildMeterMap());

  const observer=new MutationObserver(()=>{installCardPolish();moveNavBpmSetting();wrapTimedView();rebuildMeterMap();});
  const start=()=>{
    observer.observe(document.body,{subtree:true,childList:true});
    let attempts=0;const timer=setInterval(()=>{attempts++;patchTransportClock();wrapTimedView();installCardPolish();moveNavBpmSetting();if(attempts>100||window.LS26Metronome?.__ls26DynamicMeterClock)clearInterval(timer);},50);
    setTimeout(rebuildMeterMap,0);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
