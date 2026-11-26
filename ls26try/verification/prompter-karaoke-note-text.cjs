/* Regression: modern Singer Prompter must display each complete Karaoke Note. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../shared/singer-lines.js'),'utf8');
const renderer=fs.readFileSync(path.join(__dirname,'../oldadmin/host/lyrics/song-compat.js'),'utf8');
const chords={logicalLines:()=>[],extractSections:()=>({candidates:[]})};
const singer=new Function('window',source+';return window.LS26SingerLines;')({LS26Chords:chords});
const opt={includeBlankLines:true,preservePerformanceNoteText:true};
const notes=['Intro - 4 bars (wait for signal)','Guitar solo (wait for signal)','Outro\nRepeat twice (wait for signal)'];
const document={createElement:()=>({innerHTML:'',textContent:'',querySelectorAll(sel){return sel==='[data-performance-note]'?notes.map(text=>({dataset:{performanceNote:text},closest:()=>null})):[];}})};
assert.deepEqual(notes.map(text=>singer.section({type:'performanceNote',title:'KARAOKE NOTE',text},document,opt)[0].text),notes);
assert.deepEqual(singer.section({type:'lyrics',html:'mock'},document,opt).map(row=>row.text),notes);
assert.equal(singer.section({type:'performanceNote',text:notes[0]},document)[0].text,'wait for signal');
assert.deepEqual(singer.section({type:'performanceNote',title:'KARAOKE NOTE',text:''},document,opt),[]);
assert.match(renderer,/preservePerformanceNoteText: true/);
assert.match(renderer,/line.textContent = row.text;/);
console.log('PASS: complete distinct Karaoke Notes, original order, inline cues, empty notes and compact renderer compatibility');
