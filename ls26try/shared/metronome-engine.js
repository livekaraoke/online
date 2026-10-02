/* Pure tempo helpers and an audio-clock scheduler, also usable by isolated tests. */
(() => {
  'use strict';
  const clamp=(value,min,max,fallback)=>Math.min(max,Math.max(min,Number.isFinite(Number(value))?Number(value):fallback));
  function normalize(input={}) {
    if(!input || typeof input!=='object')input={};
    const beats=Math.round(clamp(input.beats,1,12,4));
    return {bpm:Math.round(clamp(input.bpm,30,300,100)),beats,division:[1,2,3,4].includes(Number(input.division))?Number(input.division):1,
      swing:clamp(input.swing,50,75,50),volume:clamp(input.volume,0,100,65),sound:input.sound==='wood'?'wood':'beep',countIn:[0,1,2].includes(Number(input.countIn))?Number(input.countIn):0,
      accents:Array.from({length:beats},(_,i)=>[0,1,2].includes(input.accents?.[i])?input.accents[i]:i===0?2:1)};
  }
  function tapTempo(times,now) {
    let taps=times.slice();
    if(taps.length&&now-taps.at(-1)<150)return {times:taps,bpm:null};
    if(taps.length&&now-taps.at(-1)>2500)taps=[];
    taps.push(now);taps=taps.slice(-9);
    if(taps.length<2)return {times:taps,bpm:null};
    const gaps=taps.slice(1).map((t,i)=>t-taps[i]).sort((a,b)=>a-b);
    const core=gaps.length>=5?gaps.slice(1,-1):gaps;
    return {times:taps,bpm:Math.round(clamp(60000/(core.reduce((a,b)=>a+b,0)/core.length),30,300,100))};
  }
  const stepDuration=(settings,step)=>60/settings.bpm*(settings.division===2?(step%2?1-settings.swing/100:settings.swing/100):1/settings.division);
  class Clock {
    constructor(getSettings,emit){this.getSettings=getSettings;this.emit=emit;}
    start(time){this.next=time;this.step=0;this.bar=1;this.countIn=this.getSettings().countIn;}
    schedule(now){
      // Resume after a stalled UI without a burst of overdue clicks.
      if(this.next<now-.15)this.next=now+.03;
      while(this.next<now+.1){
        const settings=this.getSettings(),beat=Math.floor(this.step/settings.division),sub=this.step%settings.division;
        this.emit({time:this.next,beat,sub,bar:this.bar,countIn:this.countIn>0,accent:settings.accents[beat],settings});
        this.next+=stepDuration(settings,this.step);this.step++;
        if(this.step>=settings.beats*settings.division){this.step=0;if(this.countIn>0)this.countIn--;else this.bar++;}
      }
    }
  }
  // Song timing uses absolute transport beats; a delayed scheduler skips
  // missed clicks without changing the musical position or accumulating drift.
  class TransportClock {
    constructor(transport,getSettings,emit){this.transport=transport;this.getSettings=getSettings;this.emit=emit;this.step=null;}
    reset(){this.step=null;}
    position(step,s){const whole=Math.floor(step/s.division),sub=((step%s.division)+s.division)%s.division;return (whole+(s.division===2&&sub?s.swing/100:sub/s.division))*4/(s.beatUnit||4);}
    schedule(now){
      if(this.transport.snapshot().state!=='playing')return;
      const s=this.getSettings(),beat=this.transport.getBeat(),unit=4/(s.beatUnit||4);
      if(this.step===null)this.step=Math.floor(beat/unit*s.division);
      this.step=Math.max(this.step,Math.floor(beat/unit*s.division));
      while(this.position(this.step,s)<beat-.000001)this.step++;
      for(let guard=0;guard<200;guard++){
        const position=this.position(this.step,s),time=this.transport.timeAtBeat(position);
        if(time===null||time>=now+.1)break;
        const whole=Math.floor(this.step/s.division),index=((whole%s.beats)+s.beats)%s.beats,sub=((this.step%s.division)+s.division)%s.division;
        if(time>=now-.005)this.emit({time,position,beat:index,sub,bar:Math.floor(whole/s.beats)+1,countIn:position<0,accent:s.accents[index],settings:s});
        this.step++;
      }
    }
  }
  const api={normalize,tapTempo,stepDuration,Clock,TransportClock};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else window.LS26Metronome=api;
})();
