const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const chords=require('../shared/chord-foundation.js');
const {document}=parseHTML('<html><body></body></html>');
const extract=html=>chords.extractSections([{type:'lyrics',title:'VERSE',html}],document);
const requested=['A','Am','A7','Am7','Amaj7','Asus2','Asus4','Aadd9','A5','A#','Bb','F#m','C/G','Bbmaj7/D'];
test('all requested chords, extended suffixes and legacy accepted tokens',()=>{
 for(const token of [...requested,'C7(b9)','F#dim7','Bø7','CΔ7','A6/9','G(no3)','Dsus2add9','A/','A///'])assert.ok(chords.isChord(token),token);
 const old=/^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|\d|\(|\)|\+|\-|\/|#|b)*$/i;
 for(const root of ['A','Bb','F#','c'])for(const a of ['','m','maj','min','dim','aug','sus','add','7','(','+','-','/','#','b'])for(const b of ['','9',')','/']){
  const token=root+a+b;if(old.test(token))assert.ok(chords.isChord(token),'legacy '+token);
 }
 for(const value of ['Hello','Carry','Guitar','Chorus','Verse','A lyric','N.C.','REST','H7','<b>A</b>'])assert.equal(chords.isChord(value),false,value);
});
test('transpose spelling, slash bass, whitespace, zero/octave and reset',()=>{
 assert.equal(chords.transpose('C/G',2),'D/A');assert.equal(chords.transpose('Bbmaj7/D',2),'Cmaj7/E');
 assert.equal(chords.transpose('Bb/Db',2),'C/Eb');assert.equal(chords.transpose('Bb',-1),'A');
 assert.equal(chords.transpose('  F#m7  ',2),'  G#m7  ');assert.equal(chords.transpose('G7(b9)',2),'A7(b9)');
 for(const token of requested)for(const n of [0,12,-12,24])assert.equal(chords.transpose(token,n),token);
 assert.equal(chords.transpose('N.C.',2),'N.C.');assert.equal(chords.transpose('Hello',2),'Hello');
});
test('extract formatted, nested and plain chord-only lines without changing source HTML',()=>{
 const html='<p><strong class="inserted-chord">C/<em>G</em></strong> lyric words</p><p>G   D   G   C</p><p>A lyric sentence</p><div class="tab-block">A C</div>';
 const sections=[{type:'lyrics',html,title:'V'},{type:'tab',html:'G D'},{type:'hostNote',html:'A'}],before=JSON.stringify(sections);
 const result=chords.extractSections(sections,document);
 assert.deepEqual(result.candidates.map(e=>e.symbol),['C/G','G','D','G','C']);assert.equal(JSON.stringify(sections),before);
 assert.equal(result.candidates[0].anchor.start,0);assert.equal(result.candidates[0].anchor.end,3);
 const raw=document.createElement('div');raw.innerHTML=html;assert.equal(raw.querySelectorAll('[data-chord-id]').length,0);
 assert.deepEqual(extract('<span class="inserted-chord">FutureCustomNotation</span>').candidates,[]);
});
test('repeated identical chords get independent IDs; refreshing unchanged source preserves them',()=>{
 const model=chords.createModel(),first=model.update(extract('G   D   G   C'));
 assert.equal(new Set(first.events.map(e=>e.id)).size,4);assert.notEqual(first.events[0].id,first.events[2].id);
 assert.deepEqual(model.update(extract('G   D   G   C')).events.map(e=>e.id),first.events.map(e=>e.id));
 first.events[0].symbol='CORRUPT';assert.equal(model.snapshot().events[0].symbol,'G');
});
test('lyric edits on another line and style changes retain repeated chord identities',()=>{
 const model=chords.createModel(),first=model.update(extract('<p>G D G C</p><p>Old lyric words</p>'));
 const next=model.update(extract('<p><b>G</b> D G C</p><p>New lyric words</p>'));
 assert.deepEqual(next.events.map(e=>e.id),first.events.map(e=>e.id));assert.equal(next.needsReview,false);
});
test('insert/delete in repeated chord line is conservative and never transfers timing by position',()=>{
 const old=chords.reconcile(null,extract('G D G C'));old.events[0].durationBeats=4;old.events[2].durationBeats=1.5;
 const next=chords.reconcile(old,extract('G D C'));
 assert.equal(next.needsReview,true);assert.ok(next.events.every(e=>e.durationBeats===undefined));
 assert.equal(next.unresolved.filter(x=>x.event.symbol==='G').length,2);
 const refresh=chords.reconcile(next,extract('G D C'));assert.equal(refresh.needsReview,true);
 assert.equal(refresh.unresolved.length,next.unresolved.length);
 const inserted=chords.reconcile(old,extract('G D G G C'));assert.equal(new Set(inserted.events.map(e=>e.id)).size,5);
 assert.ok(inserted.events.every(e=>e.durationBeats===undefined));
});
test('unique chord text alone is not evidence of identity after a changed line',()=>{
 const old=chords.reconcile(null,extract('<b>C</b> previous words'));old.events[0].durationBeats=4;
 const next=chords.reconcile(old,extract('new words <b>C</b>'));
 assert.notEqual(next.events[0].id,old.events[0].id);assert.equal(next.needsReview,true);assert.equal(next.events[0].durationBeats,undefined);
});
test('explicit one-to-one operation hook can retain identity during a known move',()=>{
 const old=chords.reconcile(null,extract('G D G C'));old.events[2].durationBeats=1.5;
 const next=chords.reconcile(old,extract('G G D C'),{matches:[{id:old.events[2].id,candidateIndex:0}]});
 assert.equal(next.events[0].id,old.events[2].id);assert.equal(next.events[0].durationBeats,1.5);
 assert.throws(()=>chords.reconcile(old,extract('G G D C'),{matches:[{id:old.events[0].id,candidateIndex:0},{id:old.events[0].id,candidateIndex:1}]}),/correspondence/);
 assert.throws(()=>chords.reconcile(old,extract('G G D C'),{matches:[{id:old.events[0].id,candidateIndex:2}]}),/correspondence/);
});
test('unique whole sections can move; indistinguishable copied sections require review',()=>{
 const sections=[{title:'V',html:'G D G C'},{title:'C',html:'Am F C G'}];
 const old=chords.reconcile(null,chords.extractSections(sections,document));
 const next=chords.reconcile(old,chords.extractSections([...sections].reverse(),document));
 assert.deepEqual(next.events.slice(4).map(e=>e.id),old.events.slice(0,4).map(e=>e.id));assert.equal(next.needsReview,false);
 const duplicated=chords.reconcile(old,chords.extractSections([sections[0],sections[0],sections[1]],document));
 assert.equal(new Set(duplicated.events.map(e=>e.id)).size,12);assert.equal(duplicated.needsReview,true);
});
