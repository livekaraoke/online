const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const chords=require('../shared/chord-foundation.js'),model=require('../shared/timing-model.js'),fill=require('../shared/timing-autofill.js');
const document=parseHTML('<html></html>').document;
const song=(html,timeSignature='4/4')=>({timeSignature,sections:[{type:'lyrics',title:'VERSE',html}]});
const extract=html=>chords.extractSections(song(html).sections,document).candidates.map(c=>c.symbol);
test('wrapped chords preserve spelling, conservative line recognition and slash transposition',()=>{
 for(const line of ['D C (G)','D C G','Am F C G','(G) (Am) (D7) [G] [Em7]'])assert.deepEqual(extract(line),line.split(' '));
 for(const line of ['A bright day comes','Dancing down the road','Good Bye','D C (Good)','Am I dreaming','SOLO: D C G x8 + x2'])assert.deepEqual(extract(line),[]);
 assert.deepEqual(extract('Hello <strong class="inserted-chord">(G)</strong> there'),['(G)']);
 assert.equal(chords.transpose('(C/G)',2),'(D/A)');assert.equal(chords.transpose('[Bbmaj7/D]',2),'[Cmaj7/E]');assert.equal(chords.canonical('(G)'),'G');
});
test('persistent exclusion wins over formatting and parent mark; source keeps text',async()=>{
 const html='<strong>D C <span data-ls26-chord="exclude">G</span></strong><br>Hello <strong data-ls26-chord="include" class="inserted-chord">(Am)</strong> there';
 assert.deepEqual(extract(html),['D','C','(Am)']);assert.deepEqual(extract(JSON.parse(JSON.stringify({html})).html),['D','C','(Am)']);
 const source=await model.buildSource(song(html),document),draft=await model.createDraft(source);await model.validate(draft);assert.equal(draft.schemaVersion,1);
});
test('unchanged schema-v1 timing identities survive metadata-only marking; exclusion remains conservative',async()=>{
 let draft=await model.createDraft(await model.buildSource(song('G D G C'),document));draft=model.setDuration(draft,draft.events[2].id,2.5);
 const marked=await model.reconcile(draft,await model.buildSource(song('G D <strong class="inserted-chord" data-ls26-chord="include">G</strong> C'),document));
 assert.deepEqual(marked.timing.events,draft.events);
 const excluded=await model.reconcile(draft,await model.buildSource(song('G D <span data-ls26-chord="exclude">G</span> C'),document));
 assert.equal(excluded.timing.events.length,3);assert.ok(excluded.timing.unresolved.some(x=>x.event.id===draft.events[2].id));
});
test('Auto Fill groups exact musical progressions, half-beat suggestions sum, skips and preserve/replace',async()=>{
 const input=song('<div>G    D    Em    C</div><div>(G) D Em C</div><div>D C G</div>');
 let draft=await model.createDraft(await model.buildSource(input,document));draft=model.setDuration(draft,draft.events[0].id,3.5);
 const before=JSON.stringify(draft),groups=fill.plan(input,draft,document,2);assert.equal(groups.length,2);assert.equal(groups[0].lines.length,2);
 for(const g of groups){assert.equal(g.values.reduce((a,b)=>a+b,0),8);assert.ok(g.values.every(n=>n>=.5&&Number.isInteger(n*2)));}
 const next=fill.apply(draft,groups);assert.equal(next.events[0].durationBeats,3.5);assert.equal(JSON.stringify(draft),before);assert.deepEqual(next.events.map(e=>e.id),draft.events.map(e=>e.id));
 groups[0].replace=true;groups[0].values=[2,2,2,2];groups[1].skip=true;const replaced=fill.apply(draft,groups);assert.deepEqual(replaced.events.slice(0,8).map(e=>e.durationBeats),Array(8).fill(2));assert.equal(replaced.events[8].durationBeats,undefined);
 groups[0].values=[0,2,2,4];assert.equal(fill.validate(groups),false);assert.throws(()=>fill.apply(draft,groups));
});
test('Auto Fill prefers matching existing timing and diagnoses incomplete bar exceptions',async()=>{
 const input=song('<div>G D C</div><div>G D C</div>');let draft=await model.createDraft(await model.buildSource(input,document));
 for(let i=0;i<3;i++)draft=model.setDuration(draft,draft.events[i].id,[4,2.5,1.5][i]);
 const groups=fill.plan(input,draft,document);assert.deepEqual(groups[0].values,[4,2.5,1.5]);assert.match(groups[0].evidence,/Existing complete/);
 const next=fill.apply(draft,groups);assert.equal(fill.warnings(next,groups).length,0);next.events[5].durationBeats=.5;assert.ok(fill.warnings(next,groups).some(w=>/15.*3 beats into/.test(w)));
});
test('Auto Fill uses quarter-note beat semantics, dynamic meter and manual skip within a line',async()=>{
 const input=song('<div>G D</div><div><span data-time-signature="3/4"></span>C G</div><div>Am <span data-time-signature="6/8"></span>F</div>','6/8');
 const draft=await model.createDraft(await model.buildSource(input,document)),groups=fill.plan(input,draft,document);
 assert.equal(groups[0].values.reduce((a,b)=>a+b,0),6);assert.equal(groups[1].meter.beatsPerBar,3);assert.equal(groups[1].meter.beatUnit,4);assert.equal(groups[2].mixed,true);assert.equal(groups[2].skip,true);
});
function settingsEnv(remote,shared){
 const local=new Map(),session=new Map(),calls=[];const store=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)});
 const ref={get:async()=>{calls.push('get');return{exists:!!shared.value,data:()=>structuredClone(shared.value)};}};
 const db={collection:()=>({doc:()=>ref}),runTransaction:async cb=>cb({get:ref.get,set:(r,v)=>{calls.push('set');shared.value=structuredClone(v);}})};
 const env={window:{db,dispatchEvent:()=>{},firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}}},localStorage:store(local),sessionStorage:store(session),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../shared/prompter-settings.js'),'utf8'),env);
 return{api:env.window.LS26PrompterSettings,calls,local};
}
test('global Prompter read once, no automatic writes, cross-device authoritative load and revision conflicts',async()=>{
 const shared={value:{schemaVersion:1,revision:2,values:{guidance:'guitaroke',chordAbove:12}}};
 const a=settingsEnv(null,shared);a.local.set('karaokeGuidanceMode','normal');await a.api.load();assert.equal(a.api.get().guidance,'guitaroke');assert.equal(a.api.get().chordAbove,12);await a.api.load();assert.deepEqual(a.calls,['get']);
 const b=settingsEnv(null,shared);await b.api.load();await a.api.save({...a.api.get(),chordBelow:17});assert.deepEqual(a.calls,['get','get','set']);
 await assert.rejects(()=>b.api.save({...b.api.get(),size:'large'}),/another device/);assert.equal(shared.value.values.chordBelow,17);
 await b.api.load(true);assert.equal(b.api.get().chordBelow,17);assert.equal(shared.value.schemaVersion,1);
});
test('no global defaults: zero writes until explicit save; settings are clamped',async()=>{const shared={value:null},a=settingsEnv(null,shared);await a.api.load();assert.deepEqual(a.calls,['get']);await a.api.save({chordAbove:100,mutedOpacity:-3});assert.equal(shared.value.values.chordAbove,40);assert.equal(shared.value.values.mutedOpacity,.2);assert.equal(shared.value.revision,1);});

test('missing global document preserves later local Singer adjustments on reload',async()=>{const shared={value:null},a=settingsEnv(null,shared);await a.api.load();a.local.set('karaokeGuidanceMode','guitaroke');await a.api.load();assert.equal(a.api.get().guidance,'guitaroke');assert.deepEqual(a.calls,['get']);});

test('Singer uses shared exclusion semantics and preserves wrapped Guitaroke spelling',()=>{const singer=require('../shared/singer-lines.js');const rows=singer.section({type:'lyrics',html:'<div><span data-ls26-chord="exclude">D</span> C (G)</div><div>Words below</div>'},document);assert.equal(rows[0].kind,'lyric');assert.equal(rows[0].text,'D');assert.match(rows[0].guitarHtml,/C \(G\)/);});
