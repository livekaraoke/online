/* Source-line mapping shared by LyricView and the Singer renderer.
 * Uses the SAME logical line boundaries as chord occurrence anchors. No timers,
 * storage, rendered coordinates, text-search guessing or source mutations. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./chord-foundation.js'));
 else root.LS26SingerLines=factory(root.LS26Chords);
})(typeof window==='object'?window:globalThis,function(chords){
 'use strict';
 const hidden='script,style,button,select,textarea,.tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.inserted-blank-tab,.host-only,.host-note,.my-note,.ls26-inline-host-note,[data-host-note],.chord-diagram,.chords-legend,.ls26-time-signature-change,.lyrics-song-link';
 const chordSelector='.inserted-chord,.chord-token,[data-chord],[data-original-chord]';
 const inline=new Set(['SPAN','B','STRONG','I','EM','U','S','MARK','SMALL','SUB','SUP']);
 const norm=value=>String(value||'').replace(/[\u200b\ufffc]/g,'').replace(/\s+/g,' ').trim();
 function chordOnly(text){const tokens=norm(text).split(/\s+/).filter(Boolean);return tokens.some(t=>chords.parse(t))&&tokens.every(t=>chords.parse(t)||/^[|:()xX0-9.\-+*]+$/.test(t));}
 function displayPerformanceNote(value){
  const text=String(value||'').trim();
  const tail=text.match(/\(([^()]*)\)\s*$/);
  return tail&&tail[1].trim()?tail[1].trim():text;
 }
 function performanceCues(source,rows,section){
  const title=String(section?.title||'').trim();
  const result=[];
  const cues=[...source.querySelectorAll('[data-performance-note]')].filter(n=>!n.closest('[data-host-note],.host-note'));
  for(const cue of cues){
   const text=displayPerformanceNote(cue.dataset.performanceNote);if(!text)continue;
   const index=rows.findIndex(row=>row.segments.some(s=>s.node&&(cue.compareDocumentPosition(s.node)&4)));
   const at=index<0?rows.length:index;
   result.push({sourceLineIndex:at,kind:'cue',performance:true,sectionTitle:title,text,size:Math.max(10,Math.min(40,Number(cue.dataset.performanceNoteSize)||18)),colour:/^#[0-9a-f]{6}$/i.test(cue.dataset.performanceNoteColor||'')?cue.dataset.performanceNoteColor:'#75F2A0'});
  }
  return result;
 }
 function section(section,document){
  const type=String(section?.type||'lyrics').toLowerCase();
  if(['hostnote','host-note','tab','separator'].includes(type))return [];
  if(['performancenote','performance-note'].includes(type))return [{kind:'cue',performance:true,sectionTitle:String(section.title||'').trim(),text:displayPerformanceNote(section.text||section.note||section.title||''),sourceLineIndex:-1,size:18,colour:'#75F2A0'}];
  const source=document.createElement('div');
  if(section.html)source.innerHTML=section.html;else source.textContent=section.text||'';
  const rows=chords.logicalLines(source,{locations:true});
  const cueRows=performanceCues(source,rows,section);
  // A hidden Singer Screen section still exposes its explicit PERFORMANCE NOTE.
  // This keeps stage directions visible without showing that section's lyrics.
  if(section?.visibleOnSingerScreen===false)return cueRows;
  const occurrences=chords.extractSections([section],document).candidates;
  const result=rows.map((row,sourceLineIndex)=>{
   const full=document.createElement('div'),lyrics=document.createElement('div');
   for(const segment of row.segments){
    const node=segment.node;if(!node||node.parentElement?.closest(hidden))continue;
    if(node.parentElement?.closest('[data-performance-note],.performance-cue,.performance-note-line'))continue;
    const value=node.nodeValue.slice(segment.offset,segment.offset+segment.end-segment.start);
    let copy=document.createTextNode(value),parent=node.parentElement,isChord=false;
    const excluded=Boolean(parent?.closest('[data-ls26-chord="exclude"]'));
    while(parent&&parent!==source){
     if(!excluded&&(parent.matches(chordSelector)||(parent.matches('span,b,strong')&&chords.parse(parent.textContent))))isChord=true;
     if(inline.has(parent.tagName)){
      const wrap=document.createElement(parent.tagName.toLowerCase());
      for(const property of ['color','font-weight','font-style','text-decoration','background-color']){
       const v=parent.style.getPropertyValue(property);if(v)wrap.style.setProperty(property,v);
      }
      wrap.append(copy);copy=wrap;
     }
     parent=parent.parentElement;
    }
    full.append(copy.cloneNode(true));
    if(!isChord){
     let lyricValue=value;
     const overlaps=occurrences.filter(c=>c.anchor.lineIndex===sourceLineIndex&&c.anchor.start<segment.end&&c.anchor.end>segment.start);
     for(const c of overlaps.reverse()){const a=Math.max(0,c.anchor.start-segment.start),b=Math.min(value.length,c.anchor.end-segment.start);lyricValue=lyricValue.slice(0,a)+lyricValue.slice(b);}
     let leaf=copy;while(leaf.firstChild)leaf=leaf.firstChild;leaf.nodeValue=lyricValue;lyrics.append(copy);
    }
   }
   const text=norm(lyrics.textContent),all=norm(full.textContent);
   const isChord=!row.excluded.length&&chordOnly(all);
   const cue=/^\[[^\]\n]{1,100}\]$/.test(text)||/^(?:(?:guitar|bass|drums?|piano)\s+)?(?:solo|riff|instrumental|interlude|break)(?:\s+(?:x|×)?\d+)?$/i.test(text);
   return {sourceLineIndex,kind:isChord?'chord':cue?'cue':'lyric',text:isChord?all:text,html:lyrics.innerHTML,guitarHtml:full.innerHTML};
  });
  result.push(...cueRows);
  return result.filter(row=>row.text).sort((a,b)=>a.sourceLineIndex-b.sourceLineIndex||(a.kind==='cue'?-1:1));
 }
 function target(rows,chordLineIndex){
  const index=Number(chordLineIndex);if(!Number.isInteger(index)||index<0)return null;
  return rows.find(row=>row.kind==='lyric'&&row.sourceLineIndex>=index)||null;
 }
 return Object.freeze({section,target,chordOnly});
});
