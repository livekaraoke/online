/* Local chord interpretation and occurrence identity. No storage, DOM writes or timers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LS26Chords = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const notes = {C:0,'B#':0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,Fb:4,F:5,'E#':5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,Cb:11};
  const sharp = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const flat = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  // Superset of the active viewer's suffix vocabulary. Keep its permissive
  // legacy forms; explicit chord markup is never rejected/deleted by the editor.
  const suffix = /^(?:maj|min|dim|aug|sus|add|omit|no|alt|dom|m|\d|[()#+b\-Δø°])*$/i;
  const legacy = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|\d|\(|\)|\+|\-|\/|#|b)*$/i;
  function part(value) {
    const m = value.match(/^([A-G])([#b]?)(.*)$/i);
    return m && suffix.test(m[3]) ? {root:m[1].toUpperCase()+m[2].toLowerCase(), suffix:m[3]} : null;
  }
  function parse(value) {
    const symbol = String(value ?? '').trim();
    const normalized = symbol.replace(/♯/g, '#').replace(/♭/g, 'b');
    const pieces = normalized.split('/');
    const main = part(pieces[0]);
    const bass = pieces.length === 2 && pieces[1] ? part(pieces[1]) : null;
    if (main && (pieces.length === 1 || (pieces.length === 2 && bass))) {
      return {symbol, ...main, bass, legacy:false};
    }
    // Preserve every spelling accepted by the previous recognition regex,
    // including incomplete legacy suffixes, without inferring a bass note.
    if (legacy.test(normalized)) {
      const m = normalized.match(/^([A-G])([#b]?)(.*)$/i);
      return {symbol, root:m[1].toUpperCase()+m[2].toLowerCase(), suffix:m[3], bass:null, legacy:true};
    }
    return null;
  }
  function transpose(value, amount) {
    const shift = Number(amount);
    if (!Number.isFinite(shift) || !Number.isInteger(shift)) return value;
    const step = ((shift % 12) + 12) % 12;
    if (!step) return value; // Exact original spelling and whitespace on reset.
    const chord = parse(value);
    if (!chord) return value;
    const move = p => (p.root.includes('b') ? flat : sharp)[(notes[p.root]+step)%12]+p.suffix;
    const text = move(chord)+(chord.bass ? '/'+move(chord.bass) : '');
    const raw = String(value), at = raw.indexOf(chord.symbol);
    return raw.slice(0,at)+text+raw.slice(at+chord.symbol.length);
  }
  const skip = 'script,style,button,select,textarea,.tab-block,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.inserted-blank-tab,.lyrics-song-link';
  const explicit = '.inserted-chord,.chord-token,[data-chord]';
  const blocks = new Set(['DIV','P','PRE','LI','UL','OL','BLOCKQUOTE']);
  function logicalLines(element) {
    const lines = [{text:'', marked:[]}];
    const line = () => lines[lines.length-1];
    const newline = () => lines.push({text:'', marked:[]});
    function visit(node, marked=false) {
      if (node.nodeType === 3) {
        const text = String(node.nodeValue || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
        text.split('\n').forEach((piece,i) => {
          if (i) newline();
          const start = line().text.length;
          line().text += piece;
          if (marked && piece) line().marked.push([start,start+piece.length]);
        });
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.matches(skip)) {
        // Keep a boundary: skipping markup must never join two chord fragments.
        line().text += '\ufffc';
        return;
      }
      if (node.tagName === 'BR') { newline(); return; }
      const block = blocks.has(node.tagName);
      if (block && line().text) newline();
      const chordMarkup = node.matches(explicit) ||
        (node.matches('span,b,strong') && Boolean(parse(node.textContent)));
      for (const child of node.childNodes) visit(child, marked || chordMarkup);
      if (block && line().text) newline();
    }
    for (const node of element.childNodes) visit(node);
    if (lines.length > 1 && !line().text) lines.pop();
    return lines;
  }
  function extractSections(sections, document) {
    if (!document?.createElement) throw new TypeError('A document is required to read source HTML');
    const source = [], candidates = [];
    (sections || []).forEach((section, sectionIndex) => {
      const type = String(section.type || 'lyrics').toLowerCase();
      const title = String(section.title || '');
      const holder = document.createElement('div');
      if (section.html) holder.innerHTML = section.html;
      else holder.textContent = section.text || '';
      const lines = logicalLines(holder);
      source.push({type,title,lines:lines.map(l=>l.text)});
      if (['tab','separator','hostnote','host-note','performancenote','performance-note'].includes(type)) return;
      lines.forEach((line,lineIndex) => {
        const tokens = [...line.text.matchAll(/\S+/g)];
        const chordLine = tokens.some(t=>parse(t[0])) && tokens.every(t=>parse(t[0]) || /^[|:()x0-9.\-]+$/.test(t[0]));
        for (const token of tokens) {
          const symbol = token[0], chord = parse(symbol);
          if (!chord) continue;
          const start = token.index, end = start+symbol.length;
          let covered = start;
          for (const [a,b] of line.marked) if (a <= covered && b > covered) covered = b;
          if (!chordLine && covered < end) continue;
          candidates.push({kind:'chord',symbol,recognition:covered >= end ? 'formatted' : 'chord-line',
            anchor:{sectionIndex,lineIndex,start,end}, lineText:line.text, sectionType:type, sectionTitle:title});
        }
      });
    });
    return {version:1,source:JSON.stringify(source),sections:source,candidates};
  }
  let sequence = 0;
  const session = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  const nextId = () => 'chord-'+session+'-'+(++sequence);
  const copy = value => JSON.parse(JSON.stringify(value));
  const anchorKey = value => JSON.stringify(value.anchor);
  function groups(rows, key) {
    const map = new Map();
    rows.forEach((row,i) => {const k=key(row); if (!map.has(k)) map.set(k,[]); map.get(k).push(i);});
    return map;
  }
  function reconcile(previous, extracted, {matches=[]}={}) {
    const old = previous?.events || [], next = extracted.candidates;
    const assigned = new Map(), used = new Set();
    const prior = new Map([...old,...(previous?.unresolved || []).map(x=>x.event)].map(e=>[e.id,e]));
    function bind(event, index) {
      if (!event || !next[index] || used.has(event.id) || assigned.has(index) || event.symbol !== next[index].symbol) {
        throw new Error('Invalid or conflicting occurrence correspondence');
      }
      used.add(event.id); assigned.set(index,event);
    }
    // Future editor operations may supply explicit, one-to-one correspondence.
    // No positional guess is accepted as an operation hint automatically.
    for (const match of matches) bind(prior.get(match.id),match.candidateIndex);
    if (previous?.source === extracted.source) {
      const byAnchor = new Map(old.map(event=>[anchorKey(event),event]));
      next.forEach((candidate,i) => {
        const event = byAnchor.get(anchorKey(candidate));
        if (!assigned.has(i) && event && !used.has(event.id) && event.symbol === candidate.symbol) bind(event,i);
      });
    } else {
      // Unchanged unique sections can move as a unit. Identical repeated sections
      // deliberately remain ambiguous when the source changes.
      const oldSections = previous?.sections || [];
      const oldGroups = groups(oldSections,JSON.stringify), newGroups = groups(extracted.sections,JSON.stringify);
      const sectionPairs = new Map();
      for (const [key,indices] of oldGroups) if (indices.length===1 && newGroups.get(key)?.length===1) sectionPairs.set(indices[0],newGroups.get(key)[0]);
      const oldLines = [], newLines = [];
      const collect = (sections,rows) => sections.forEach((s,si)=>s.lines.forEach((text,li)=>rows.push({si,li,key:JSON.stringify([s.type,s.title,text])})));
      collect(oldSections,oldLines); collect(extracted.sections,newLines);
      const og=groups(oldLines,l=>l.key), ng=groups(newLines,l=>l.key), linePairs=new Map();
      for (const [key,indices] of og) if (indices.length===1 && ng.get(key)?.length===1) {
        const a=oldLines[indices[0]],b=newLines[ng.get(key)[0]];linePairs.set(a.si+':'+a.li,[b.si,b.li]);
      }
      const nextByAnchor = new Map(next.map((c,i)=>[anchorKey(c),i]));
      for (const event of old) {
        if (used.has(event.id)) continue;
        const a=event.anchor;
        const pair=sectionPairs.has(a.sectionIndex) ? [sectionPairs.get(a.sectionIndex),a.lineIndex] : linePairs.get(a.sectionIndex+':'+a.lineIndex);
        if (!pair) continue;
        const index=nextByAnchor.get(JSON.stringify({...a,sectionIndex:pair[0],lineIndex:pair[1]}));
        if (index!==undefined && !assigned.has(index) && next[index].symbol===event.symbol) bind(event,index);
      }
      // Changed lines require explicit edit correspondence. Even a globally
      // unique chord symbol could be a deletion followed by a new insertion;
      // symbol equality alone must never transfer future timing.

    }
    const unresolved = new Map((previous?.unresolved || []).filter(x=>!used.has(x.event.id)).map(x=>[x.event.id,copy(x)]));
    for (const event of old) if (!used.has(event.id)) unresolved.set(event.id,{event:copy(event),reason:'source-edit-needs-review'});
    const oldSymbols = new Set([...prior.values()].map(e=>e.symbol));
    const events = next.map((candidate,i) => {
      const event=assigned.get(i);
      return {...(event ? copy(event) : {}),...copy(candidate),id:event?.id || nextId(),
        status:event?.status === 'needs-review' && !matches.some(m=>m.id===event.id) ? 'needs-review' : event ? 'matched' : oldSymbols.has(candidate.symbol) ? 'needs-review' : 'new'};
    });
    return {version:1,source:extracted.source,sections:copy(extracted.sections),events,
      unresolved:[...unresolved.values()],needsReview:unresolved.size>0 || events.some(e=>e.status==='needs-review')};
  }
  function createModel() {
    let current = null;
    return Object.freeze({update(extracted,options){current=reconcile(current,extracted,options);return copy(current);},
      snapshot(){return current ? copy(current) : {version:1,events:[],unresolved:[],needsReview:false};}});
  }
  return Object.freeze({parse,isChord:value=>Boolean(parse(value)),transpose,extractSections,reconcile,createModel});
});
