/* Pure, local progression planning. Suggestions are never saved or applied implicitly. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./chord-foundation.js'));else root.LS26TimingAutofill=factory(root.LS26Chords);})(typeof window==='object'?window:globalThis,function(chords){
 'use strict';
 const valid=n=>Number.isFinite(n)&&n>=.5&&Number.isInteger(n*2);
 const bar=m=>m.beatsPerBar*4/m.beatUnit;
 function distribute(weights,total){
  const units=Math.round(total*2),count=weights.length;
  if(!valid(total)||!Number.isSafeInteger(units)||units<count)return [];
  const sum=weights.reduce((a,b)=>a+b,0)||count,remaining=units-count;
  const raw=weights.map(w=>remaining*w/sum),out=raw.map(v=>1+Math.floor(v));
  const order=raw.map((v,i)=>({i,remainder:v-Math.floor(v)})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  const extra=units-out.reduce((a,b)=>a+b,0);for(let i=0;i<extra;i++)out[order[i].i]++;
  return out.map(n=>n/2);
 }
 function plan(song,timing,document,bars=2){
  const extracted=chords.extractSections(song.sections||[],document),byLine=new Map(),groups=new Map();
  let meter={...timing.meter};
  (song.sections||[]).forEach((section,si)=>{
   const holder=document.createElement('div');holder.innerHTML=section.html||'';
   const rows=chords.logicalLines(holder,{locations:true});
   const markers=[...holder.querySelectorAll('[data-time-signature]')];let mi=0;
   const events=timing.events.filter(e=>e.sourceAnchor.sectionIndex===si);
   for(const event of events){
    const a=event.sourceAnchor,segments=rows[a.lineIndex]?.segments||[],node=segments.find(s=>s.end>a.start)?.node;
    while(mi<markers.length&&node&&(markers[mi].compareDocumentPosition(node)&4)){
     const match=markers[mi++].dataset.timeSignature.match(/^(\d+)\/(\d+)$/);
     if(match&&Number(match[1])>0&&[1,2,4,8,16,32,64].includes(Number(match[2])))meter={...meter,beatsPerBar:Number(match[1]),beatUnit:Number(match[2])};
    }
    const key=si+':'+a.lineIndex;
    if(!byLine.has(key))byLine.set(key,{sectionIndex:si,lineIndex:a.lineIndex,title:section.title||'Section '+(si+1),events:[],meters:[],text:extracted.sections[si].lines[a.lineIndex]});
    byLine.get(key).events.push(event);byLine.get(key).meters.push({...meter});
   }
   // Markers after the last chord also establish the following section's meter.
   for(;mi<markers.length;mi++){const m=markers[mi].dataset.timeSignature.match(/^(\d+)\/(\d+)$/);if(m&&+m[1]>0&&[1,2,4,8,16,32,64].includes(+m[2]))meter={...meter,beatsPerBar:+m[1],beatUnit:+m[2]};}
  });
  for(const line of byLine.values()){
   const meter=line.meters[0],mixed=line.meters.some(m=>bar(m)!==bar(meter)||m.beatsPerBar!==meter.beatsPerBar||m.beatUnit!==meter.beatUnit);
   const progression=line.events.map(e=>chords.canonical(e.chord)),key=JSON.stringify([progression,meter.beatsPerBar,meter.beatUnit,mixed?line.sectionIndex+':'+line.lineIndex:'']);
   if(!groups.has(key))groups.set(key,{key,progression,meter,bars,lines:[],skip:mixed,replace:false,mixed});groups.get(key).lines.push(line);
  }
  for(const group of groups.values())suggest(group);
  return [...groups.values()];
 }
 function suggest(group){
  const total=group.bars*bar(group.meter),n=group.progression.length;
  const full=group.lines.find(l=>l.events.every(e=>valid(e.durationBeats))&&l.events.reduce((a,e)=>a+e.durationBeats,0)===total);
  if(full){group.values=full.events.map(e=>e.durationBeats);group.evidence='Existing complete progression';return group;}
  const existing=Array.from({length:n},(_,i)=>group.lines.map(l=>l.events[i].durationBeats).find(valid));
  if(existing.some(valid)){
   const known=existing.reduce((s,n)=>s+(n||0),0),missing=existing.filter(n=>n===undefined).length;
   if(missing&&total-known>=missing*.5){const rest=distribute(Array(missing).fill(1),total-known);group.values=existing.map(v=>v??rest.shift());group.evidence='Existing durations; remaining beats shared';return group;}
  }
  const line=group.lines[0],starts=line.events.map(e=>e.sourceAnchor.start);
  const gaps=starts.slice(1).map((v,i)=>v-starts[i]);
  const tail=gaps.length?gaps.slice().sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:1;
  group.values=distribute([...gaps,tail],total);group.evidence=gaps.length?'Source spacing suggestion; last chord uses median gap':'Equal division';return group;
 }
 function validate(groups){return groups.every(g=>g.skip||Number.isFinite(g.bars)&&g.bars>0&&g.values.length===g.progression.length&&g.values.every(valid)&&Math.abs(g.values.reduce((a,b)=>a+b,0)-g.bars*bar(g.meter))<1e-9);}
 function apply(timing,groups){
  if(!validate(groups))throw Error('Every progression must total its chosen bars, or be skipped.');
  const next=JSON.parse(JSON.stringify(timing)),byId=new Map(next.events.map(e=>[e.id,e]));
  for(const group of groups)if(!group.skip)for(const line of group.lines)line.events.forEach((old,i)=>{const event=byId.get(old.id);if(!event)throw Error('The song changed. Reopen Auto Fill.');if(group.replace||event.durationBeats===undefined)event.durationBeats=group.values[i];});
  return next;
 }
 function warnings(timing,groups){
  const sections=new Map();
  for(const g of groups)for(const l of g.lines){if(!sections.has(l.sectionIndex))sections.set(l.sectionIndex,{title:l.title,events:[],meters:new Set(),mixed:false});const s=sections.get(l.sectionIndex);s.events.push(...l.events.map(e=>timing.events.find(n=>n.id===e.id)));s.meters.add(bar(g.meter));s.mixed||=g.mixed;}
  const result=[];
  for(const g of groups)if(!g.skip)for(const l of g.lines){
   const values=l.events.map(e=>timing.events.find(n=>n.id===e.id)?.durationBeats);
   if(values.every(valid)){const total=values.reduce((a,b)=>a+b,0),expected=g.bars*bar(g.meter);if(Math.abs(total-expected)>1e-8)result.push(`${l.title}, line ${l.lineIndex+1}: retained timings total ${total}, template expects ${expected} beats. Keep this exception or go back and choose Replace.`);}
  }
  for(const s of sections.values()){
   if(s.events.some(e=>e?.durationBeats===undefined)){result.push(s.title+': incomplete timing remains; verify manually.');continue;}
   if(s.mixed||s.meters.size!==1){result.push(s.title+': meter changes; check bar boundaries manually.');continue;}
   const total=s.events.reduce((a,e)=>a+e.durationBeats,0),beats=[...s.meters][0],remainder=total%beats;
   if(remainder>1e-8)result.push(`${s.title}: ${total} quarter-note beats; ends ${remainder} beats into a ${beats}-beat bar.`);
  }
  if(timing.unresolved.length)result.push(`${timing.unresolved.length} older entries still need review. Auto Fill does not resolve them.`);
  return result;
 }
 return Object.freeze({plan,suggest,validate,apply,warnings,distribute,bar});
});
