/* Stage 3: pure/local timing schema, source fingerprints and conservative identity.
 * No Firebase, storage, timers, playback or live DOM mutations. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chord-foundation.js'));
  else root.LS26Timing = factory(root.LS26Chords);
})(typeof window === 'object' ? window : globalThis, function (chords) {
  'use strict';
  const SCHEMA_VERSION = 1, MAX_BYTES = 256 * 1024;
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a,b) => stable(a) === stable(b);
  function stable(value) {
    if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function fail(code,message) {const error=new Error(message);error.code=code;throw error;}
  function requireThat(ok,message) {if(!ok)fail('INVALID_TIMING',message);}
  function keys(value,required,optional=[]) {
    requireThat(value && typeof value==='object' && !Array.isArray(value),'Expected an object');
    requireThat(required.every(k=>Object.hasOwn(value,k)) && Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),'Unexpected or missing fields');
  }
  const integer = n => Number.isSafeInteger(n) && n>=0;
  const digest = s => typeof s==='string' && /^sha256:[0-9a-f]{64}$/.test(s);
  const opaque = s => typeof s==='string' && /^[a-zA-Z0-9_-]{16,100}$/.test(s);
  function id() {
    if(!globalThis.crypto?.randomUUID)fail('CRYPTO_UNAVAILABLE','Secure UUID generation is required');
    return globalThis.crypto.randomUUID();
  }
  async function hash(value) {
    if(!globalThis.crypto?.subtle)fail('CRYPTO_UNAVAILABLE','SHA-256 requires Web Crypto in a secure context');
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));
    return 'sha256:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function meterFor(song) {
    const text=String(song.timeSignature || '').trim();
    const match=(text || '4/4').match(/^(\d+)\s*\/\s*(\d+)$/);
    if(!match)fail('INVALID_METER','Unsupported time signature; explicit review is required');
    const meter={beatsPerBar:Number(match[1]),beatUnit:Number(match[2]),transportBeatUnit:4,assumed:!text};
    validateMeter(meter);return meter;
  }
  function validateMeter(meter) {
    keys(meter,['beatsPerBar','beatUnit','transportBeatUnit','assumed']);
    requireThat(Number.isInteger(meter.beatsPerBar)&&meter.beatsPerBar>0&&meter.beatsPerBar<=64,'Invalid meter numerator');
    requireThat([1,2,4,8,16,32,64].includes(meter.beatUnit)&&meter.transportBeatUnit===4&&typeof meter.assumed==='boolean','Invalid beat semantics');
  }
  const musicalShape = sections => sections.map(s=>({type:s.type,title:s.title,lines:s.lines.map(l=>l.slots)}));
  const meterSemantics = meter => ({beatsPerBar:meter.beatsPerBar,beatUnit:meter.beatUnit,transportBeatUnit:meter.transportBeatUnit});
  async function fingerprints(source) {
    return {fingerprint:await hash({algorithm:source.algorithm,meter:meterSemantics(source.meter),sections:source.sections}),
      musicalFingerprint:await hash({algorithm:source.algorithm,meter:meterSemantics(source.meter),sections:musicalShape(source.sections)})};
  }
  async function buildSource(song,document) {
    const meter=meterFor(song);
    const extracted=chords.extractSections(song.sections || [],document);
    const sections=await Promise.all(extracted.sections.map(async(section,si)=>{
      const excluded=['tab','separator','hostnote','host-note','performancenote','performance-note'].includes(section.type);
      const lines=excluded?[]:await Promise.all(section.lines.map(async(text,li)=>{
        const tokens=extracted.candidates.filter(c=>c.anchor.sectionIndex===si&&c.anchor.lineIndex===li);
        const slots=tokens.map(c=>({chord:c.symbol,start:c.anchor.start,end:c.anchor.end}));
        let template='',at=0;
        for(const slot of slots){template+=text.slice(at,slot.start)+'\ufffc';at=slot.end;}
        template+=text.slice(at);
        return {textHash:await hash(text),templateHash:await hash(template),slots};
      }));
      return {type:section.type,title:section.title,lines};
    }));
    const source={algorithm:'ls26-source-v1-sha256',meter,sections};
    Object.assign(source,await fingerprints(source));return source;
  }
  function candidates(source) {
    const result=[];
    source.sections.forEach((section,sectionIndex)=>section.lines.forEach((line,lineIndex)=>line.slots.forEach((slot,slotIndex)=>{
      result.push({kind:'chord',chord:slot.chord,sourceAnchor:{sectionIndex,lineIndex,slotIndex,start:slot.start,end:slot.end}});
    })));
    return result;
  }
  async function validateSource(source) {
    keys(source,['algorithm','fingerprint','musicalFingerprint','meter','sections']);
    if(source.algorithm!=='ls26-source-v1-sha256')fail('UNSUPPORTED_SOURCE','Unsupported source fingerprint algorithm');
    validateMeter(source.meter);requireThat(Array.isArray(source.sections),'Missing source sections');
    for(const section of source.sections){
      keys(section,['type','title','lines']);requireThat(typeof section.type==='string'&&typeof section.title==='string'&&Array.isArray(section.lines),'Invalid section');
      for(const line of section.lines){
        keys(line,['textHash','templateHash','slots']);requireThat(digest(line.textHash)&&digest(line.templateHash)&&Array.isArray(line.slots),'Invalid source line');
        let end=0;
        for(const slot of line.slots){
          keys(slot,['chord','start','end']);requireThat(chords.isChord(slot.chord)&&integer(slot.start)&&integer(slot.end)&&slot.start>=end&&slot.end>slot.start&&slot.end-slot.start===slot.chord.length,'Invalid chord slot');end=slot.end;
        }
      }
    }
    const expected=await fingerprints(source);
    requireThat(source.fingerprint===expected.fingerprint&&source.musicalFingerprint===expected.musicalFingerprint,'Corrupt source fingerprint');
  }
  function validateEvent(event,seen) {
    keys(event,['id','kind','chord','sourceAnchor'],['durationBeats']);
    if(event.kind!=='chord')fail('UNSUPPORTED_EVENT','This client cannot edit this event kind');
    requireThat(opaque(event.id)&&!seen.has(event.id),'Missing or duplicate event ID');seen.add(event.id);
    requireThat(typeof event.chord==='string'&&chords.isChord(event.chord),'Invalid chord');
    keys(event.sourceAnchor,['sectionIndex','lineIndex','slotIndex','start','end']);
    requireThat(Object.values(event.sourceAnchor).every(integer)&&event.sourceAnchor.end>event.sourceAnchor.start,'Invalid source anchor');
    if(Object.hasOwn(event,'durationBeats'))requireThat(typeof event.durationBeats==='number'&&event.durationBeats>0&&Number.isSafeInteger(event.durationBeats*2),'Duration must be a positive numeric multiple of 0.5 transport beats');
  }
  async function validate(timing,{persisted=false}={}) {
    if(timing?.schemaVersion!==SCHEMA_VERSION)fail('UNSUPPORTED_SCHEMA','Timing schema is missing or unsupported; do not overwrite it');
    keys(timing,['schemaVersion','generation','revision','source','meter','events','unresolved','reviewReasons']);
    requireThat(opaque(timing.generation)&&integer(timing.revision)&&(!persisted||timing.revision>0),'Invalid revision token');
    requireThat(new TextEncoder().encode(JSON.stringify(timing)).length<=MAX_BYTES,'Timing document exceeds the conservative 256 KiB budget');
    await validateSource(timing.source);validateMeter(timing.meter);requireThat(equal(timing.meter,timing.source.meter),'Meter/source mismatch');
    requireThat(Array.isArray(timing.events)&&Array.isArray(timing.unresolved)&&Array.isArray(timing.reviewReasons),'Invalid event/review lists');
    requireThat(timing.reviewReasons.every(r=>['unresolved-events','meter-changed'].includes(r))&&new Set(timing.reviewReasons).size===timing.reviewReasons.length,'Invalid review reasons');
    const seen=new Set(),slots=candidates(timing.source);
    requireThat(slots.length===timing.events.length&&slots.length<=2000,'Events must cover every source chord in order');
    timing.events.forEach((event,i)=>{
      validateEvent(event,seen);requireThat(event.chord===slots[i].chord&&equal(event.sourceAnchor,slots[i].sourceAnchor),'Event/source order mismatch');
    });
    for(const item of timing.unresolved){
      keys(item,['event','sourceFingerprint','reason']);validateEvent(item.event,seen);
      requireThat(digest(item.sourceFingerprint)&&item.reason==='source-edit','Invalid unresolved event');
    }
    requireThat((timing.unresolved.length>0)===timing.reviewReasons.includes('unresolved-events'),'Review flag must reflect unresolved events');
    return timing;
  }
  async function createDraft(source) {
    source=clone(source);
    await validateSource(source);
    return {schemaVersion:SCHEMA_VERSION,generation:id(),revision:0,source:clone(source),meter:clone(source.meter),
      events:candidates(source).map(c=>({id:id(),...c})),unresolved:[],reviewReasons:[]};
  }
  function setDuration(timing,eventId,durationBeats) {
    const next=clone(timing),event=next.events.find(e=>e.id===eventId);
    requireThat(event,'Unknown current event ID');
    if(durationBeats===null)delete event.durationBeats;else event.durationBeats=durationBeats;
    validateEvent(event,new Set());return next;
  }
  function status(timing,changed=false) {
    if(!timing)return 'UNTIMED';
    if(timing.reviewReasons.length)return 'NEEDS_REVIEW';
    if(!timing.events.length||timing.events.some(e=>e.durationBeats===undefined))return 'PARTIAL';
    return changed?'RECONCILED':'VALID';
  }
  // Local UI diagnostics only; not part of the persisted document schema.
  function summary(timing,source) {
    const events=timing?.events||candidates(source||{sections:[]});
    const timed=events.filter(e=>typeof e.durationBeats==='number'&&e.durationBeats>0&&Number.isSafeInteger(e.durationBeats*2)).length;
    const unresolved=timing?.unresolved||[],meterNeedsReview=Boolean(timing?.reviewReasons.includes('meter-changed'));
    return {total:events.length,timed,untimed:events.length-timed,unresolved:unresolved.length,
      unresolvedTimed:unresolved.filter(x=>x.event.durationBeats!==undefined).length,meterNeedsReview,
      needsReview:Boolean(timing?.reviewReasons.length),ready:Boolean(timing&&events.length&&timed===events.length&&!timing.reviewReasons.length)};
  }
  const semanticKey=timing=>timing?stable(timing):'';
  function uniquePairs(oldRows,newRows,key) {
    const group=rows=>{const map=new Map();rows.forEach((r,i)=>{const k=key(r);map.set(k,[...(map.get(k)||[]),i]);});return map;};
    const a=group(oldRows),b=group(newRows),pairs=[];
    for(const [k,indices] of a)if(indices.length===1&&b.get(k)?.length===1)pairs.push([indices[0],b.get(k)[0]]);
    return pairs;
  }
  async function reconcile(timing,source,{matches=[],discardEventIds=[],expectedFingerprint,acceptMeter=false}={}) {
    source=clone(source);timing=timing?clone(timing):null;
    matches=clone(matches);discardEventIds=[...discardEventIds];
    await validateSource(source);
    if(!timing)return {status:'UNTIMED',timing:null};
    await validate(timing);
    if(matches.length||discardEventIds.length||acceptMeter)requireThat(expectedFingerprint===timing.source.fingerprint,'Resolution hints require the exact previous source fingerprint');
    const next=candidates(source),assigned=new Map(),used=new Set();
    const prior=new Map([...timing.events,...timing.unresolved.map(x=>x.event)].map(e=>[e.id,e]));
    const discarded=new Set(discardEventIds);
    requireThat(discarded.size===discardEventIds.length&&discardEventIds.every(x=>prior.has(x)),'Invalid discard IDs');
    function bind(event,index,allowSymbolChange=false) {
      requireThat(event&&next[index]&&!used.has(event.id)&&!assigned.has(index)&&!discarded.has(event.id),'Conflicting correspondence');
      requireThat(allowSymbolChange||event.chord===next[index].chord,'Symbol change requires structural proof or explicit confirmation');
      used.add(event.id);assigned.set(index,event);
    }
    for(const hint of matches)bind(prior.get(hint.eventId),hint.candidateIndex,hint.allowSymbolChange===true);
    const oldSections=timing.source.sections,newSections=source.sections;
    const target=new Map(next.map((c,i)=>[stable(c.sourceAnchor),i]));
    function bindLine(si,li,sj,lj,allowSymbolChange=false) {
      for(const event of timing.events.filter(e=>e.sourceAnchor.sectionIndex===si&&e.sourceAnchor.lineIndex===li)){
        if(used.has(event.id)||discarded.has(event.id))continue;
        const slotIndex=event.sourceAnchor.slotIndex,slot=newSections[sj].lines[lj].slots[slotIndex];
        if(!slot)continue;
        const index=target.get(stable({sectionIndex:sj,lineIndex:lj,slotIndex,start:slot.start,end:slot.end}));
        if(index!==undefined&&!assigned.has(index))bind(event,index,allowSymbolChange);
      }
    }
    if(source.fingerprint===timing.source.fingerprint){
      timing.events.forEach((event,i)=>{if(!used.has(event.id)&&!assigned.has(i)&&!discarded.has(event.id))bind(event,i);});
    }else{
      const sectionPairs=uniquePairs(oldSections,newSections,stable),oldUsed=new Set(sectionPairs.map(p=>p[0])),newUsed=new Set(sectionPairs.map(p=>p[1]));
      for(const [a,b] of uniquePairs(oldSections,newSections,s=>stable([s.type,s.title]))){
        if(!oldUsed.has(a)&&!newUsed.has(b)&&(oldSections[a].title||(oldSections.length===1&&newSections.length===1))){sectionPairs.push([a,b]);oldUsed.add(a);newUsed.add(b);}
      }
      for(const [si,sj] of sectionPairs){
        const a=oldSections[si].lines,b=newSections[sj].lines;
        if(equal(oldSections[si],newSections[sj])){a.forEach((_,li)=>bindLine(si,li,sj,li));continue;}
        const pairs=uniquePairs(a,b,stable),al=new Set(pairs.map(p=>p[0])),bl=new Set(pairs.map(p=>p[1]));
        pairs.forEach(([li,lj])=>bindLine(si,li,sj,lj));
        // Same-position unique chord layout permits lyric-only changes. A unique
        // unchanged non-chord template permits one chord-symbol correction.
        if(a.length===b.length)for(let li=0;li<a.length;li++){
          if(al.has(li)||bl.has(li)||!a[li].slots.length)continue;
          const sameSlots=equal(a[li].slots,b[li].slots);
          const uniqueLayout=uniquePairs(a,b,l=>stable(l.slots)).some(([x,y])=>x===li&&y===li);
          const sameTemplate=a[li].templateHash===b[li].templateHash&&a[li].slots.length===b[li].slots.length;
          const changedSymbols=sameTemplate?a[li].slots.filter((s,i)=>s.chord!==b[li].slots[i].chord).length:0;
          const uniqueTemplate=uniquePairs(a,b,l=>l.templateHash).some(([x,y])=>x===li&&y===li);
          if((sameSlots&&uniqueLayout)||(sameTemplate&&changedSymbols===1&&uniqueTemplate))bindLine(si,li,sj,li,changedSymbols===1);
        }
      }
    }
    const unresolved=timing.unresolved.filter(x=>!used.has(x.event.id)&&!discarded.has(x.event.id)).map(clone);
    for(const event of timing.events)if(!used.has(event.id)&&!discarded.has(event.id))unresolved.push({event:clone(event),sourceFingerprint:timing.source.fingerprint,reason:'source-edit'});
    const events=next.map((candidate,i)=>({...clone(assigned.get(i)||{id:id()}),...candidate}));
    const reviewReasons=[];
    if(unresolved.length)reviewReasons.push('unresolved-events');
    if(!acceptMeter&&(!equal(meterSemantics(timing.meter),meterSemantics(source.meter))||timing.reviewReasons.includes('meter-changed')))reviewReasons.push('meter-changed');
    const result={...clone(timing),source:clone(source),meter:clone(source.meter),events,unresolved,reviewReasons};
    await validate(result);
    return {status:status(result,source.fingerprint!==timing.source.fingerprint),timing:result};
  }
  return Object.freeze({SCHEMA_VERSION,MAX_BYTES,buildSource,validateSource,validate,createDraft,setDuration,reconcile,status,summary,semanticKey,clone});
});
