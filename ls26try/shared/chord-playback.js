/* Validated local timeline and conservative rendered correspondence. No storage. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./timing-model.js'),require('./chord-foundation.js'));else root.LS26ChordPlayback=factory(root.LS26Timing,root.LS26Chords);})(typeof window==='object'?window:globalThis,function(model,chords){
 'use strict';
 function timeline(timing){
  if(!timing||!['VALID','RECONCILED'].includes(model.status(timing)))return null;
  let total=0;const events=timing.events.map(event=>{const start=total;total+=event.durationBeats;return {...event,startBeat:start,endBeat:total};});
  return Object.freeze({events,totalBeats:total,at(beat){if(!Number.isFinite(beat)||beat<0)return null;let low=0,high=events.length;while(low<high){const mid=(low+high)>>1;if(events[mid].endBeat<=beat+1e-9)low=mid+1;else high=mid;}return low<events.length?{event:events[low],index:low,progress:Math.max(0,(beat-events[low].startBeat)/events[low].durationBeats)}:null;}});
 }
 function bind(events,bodies,document){
  const result=new Map(),plans=[];
  for(const event of events){
   const a=event.sourceAnchor,body=bodies.get(a.sectionIndex);if(!body)throw Error('A timed section is unavailable.');
   const line=chords.logicalLines(body,{locations:true,original:true})[a.lineIndex];
   if(!line||line.text.slice(a.start,a.end)!==event.chord)throw Error('Rendered chords do not match saved source anchors.');
   const segments=line.segments.filter(s=>s.start<a.end&&s.end>a.start);
   let target=segments.length===1?segments[0].element:null;
   if(!target&&segments.length){
    let parent=segments[0].node?.parentElement;
    while(parent&&parent!==body){if(parent.matches('span,b,strong')&&parent.textContent.trim()===event.chord&&segments.every(s=>parent.contains(s.node)))target=parent;parent=parent.parentElement;}
   }
   if(target){plans.push({event,target});continue;}
   if(segments.length!==1||!segments[0].node)throw Error('A chord cannot be highlighted safely.');
   const segment=segments[0];plans.push({event,node:segment.node,start:segment.offset+a.start-segment.start,end:segment.offset+a.end-segment.start});
  }
  // Wrap only after every correspondence validates. Work backwards in each
  // text node, retaining all source whitespace and formatting around tokens.
  for(const plan of plans.filter(p=>p.target)){plan.target.classList.add('ls26-timed-chord');result.set(plan.event.id,plan.target);}
  for(const plan of plans.filter(p=>p.node).reverse()){
   const text=plan.node.nodeValue,span=document.createElement('span');span.className='ls26-timed-chord';span.textContent=text.slice(plan.start,plan.end);
   const after=document.createTextNode(text.slice(plan.end));plan.node.nodeValue=text.slice(0,plan.start);plan.node.parentNode.insertBefore(span,plan.node.nextSibling);span.parentNode.insertBefore(after,span.nextSibling);result.set(plan.event.id,span);
  }
  return result;
 }
 return Object.freeze({timeline,bind});
});
