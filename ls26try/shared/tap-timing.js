/* Local capture only. Durations are rounded to nearest half quarter-note beat. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LS26TapTiming=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const quantize=beats=>{if(!Number.isFinite(beats)||beats<=0)throw Error('Tap after the chord begins.');return Math.max(.5,Math.round(beats*2)/2);};
 function create({clock,events,getDuration,onDuration,onSelect=()=>{}}){
  let index=0,startBeat=0,active=false,complete=false,history=[],raw=[];
  function begin(at=0){if(!events[at])throw Error('Select a chord first.');index=at;startBeat=0;active=true;complete=false;history=[];raw=[];onSelect(index);}
  function capture(){
   const state=clock.snapshot(),beat=state.beat;if(!active||complete||state.state!=='playing'||beat<0||beat<=startBeat)return false;
   const event=events[index],elapsed=beat-startBeat,duration=quantize(elapsed);
   history.push({index,startBeat,old:getDuration(event.id),complete});raw.push({id:event.id,elapsed});onDuration(event.id,duration);
   if(index===events.length-1)complete=true;else{index++;startBeat=beat;onSelect(index);}return {duration,complete};
  }
  function undo(){if(!history.length)return false;const old=history.pop();raw.pop();index=old.index;startBeat=old.startBeat;complete=old.complete;onDuration(events[index].id,old.old??null,{undo:true});onSelect(index);return true;}
  function end(){active=false;}
  return Object.freeze({begin,capture,undo,end,snapshot:()=>({active,complete,index,startBeat,undoCount:history.length,raw:raw.map(e=>({...e}))})});
 }
 return Object.freeze({create,quantize});
});
