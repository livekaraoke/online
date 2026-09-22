const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function node(){const tokens=new Set();return {dataset:{},children:[],classList:{toggle(k,on){on?tokens.add(k):tokens.delete(k)},contains:k=>tokens.has(k)},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},appendChild(n){this.children.push(n)},set innerHTML(v){this.html=v;this.children=[]},get innerHTML(){return this.html}};}
function libraryFixture(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const buttons=['all','favourites','session'].map(scope=>Object.assign(node(),{dataset:{scope}}));
 const songs=[{firebaseId:'one',title:'Alpha',artist:'A',userBpm:90,originalBpm:100,capo:0},{firebaseId:'two',title:'Zulu',artist:'B',originalBpm:120,capo:'0'},{firebaseId:'three',title:'Omega',capo:3}];
 const c={$:get,document:{createElement:node,querySelectorAll:()=>buttons},window:{},songs,visibleSongs:[],scope:'all',setlists:[{id:'set',name:'Set',songIds:['one','two']}],filters:{setlist:Object.assign(node(),{value:'set'})},favourites:new Set(),selectedId:null,selectedIndex:0,filteredSongs:()=>songs.slice(0,1),groupFor:s=>s[0],LyricsCommon:{escapeHTML:v=>String(v??'')},renderAlphabetNav(){},updateSelected(){},restoreScrollWhenReady(){}};
 vm.createContext(c);const source=read('host/js/lyricsviewer.js');vm.runInContext(source.slice(source.indexOf('  function render() {'),source.indexOf('  function terminalRunOrderStatus')),c);
 return {c,get,buttons,songs};
}
test('library separates tempos, shows zero capo as dash, and counts filtered matches',()=>{
 const {c,get,buttons,songs}=libraryFixture();c.render();
 assert.equal(get('libraryShowingCount').textContent,'Showing: 1');assert.equal(get('ls26SessionSetlistName').textContent,'Set · 2 songs');assert.equal(c.filters.setlist.classList.contains('active'),true);assert.equal(buttons[0]['aria-pressed'],'false');
 const row=get('songRows').children.find(x=>x.className.startsWith('song-table-row'));
 assert.match(row.innerHTML,/bpm-cell">\s*90/);assert.match(row.innerHTML,/original-bpm-cell">100/);assert.match(row.innerHTML,/capo-cell">-/);assert.match(row.innerHTML,/aria-label="Add to Run Order"/);assert.doesNotMatch(row.innerHTML,/＋ Q/);
 c.filteredSongs=()=>songs.slice(1);c.filters.setlist.value='';c.render();assert.equal(get('libraryShowingCount').textContent,'Showing: 2');assert.equal(buttons[0]['aria-pressed'],'true');assert.equal(c.filters.setlist.classList.contains('active'),false);
 const rows=get('songRows').children.filter(x=>x.className.startsWith('song-table-row'));
 assert.match(rows[0].innerHTML,/bpm-cell">\s*—/);assert.match(rows[0].innerHTML,/original-bpm-cell">120/);assert.match(rows[0].innerHTML,/capo-cell">-/);assert.match(rows[1].innerHTML,/capo-cell">3/);
 c.filteredSongs=()=>[];c.render();assert.equal(get('libraryShowingCount').textContent,'Showing: 0');assert.match(get('songRows').innerHTML,/No songs match/);
});
test('creator navigator follows renamed/reordered sections, escapes titles and marks scroll position',()=>{
 const nav=Object.assign(node(),{scrollLeft:50}),buttons=[node(),node()];buttons.forEach((n,i)=>n.dataset.jumpSection=String(i));
 const cards=[{getBoundingClientRect:()=>({top:-100})},{getBoundingClientRect:()=>({top:110})}];
 const c={sections:[{title:'VERSE',type:'lyrics'},{title:'<CHORUS>',type:'lyrics'}],$:()=>nav,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{getElementById:()=>({getBoundingClientRect:()=>({bottom:100})}),querySelectorAll:s=>s.includes('creator-section-card')?cards:buttons}};
 vm.createContext(c);const source=read('host/js/lyricscreator.js');vm.runInContext(source.slice(source.indexOf('  function renderSectionNavigator()'),source.indexOf('  let navigatorFrame')),c);
 c.renderSectionNavigator();assert.equal(nav.scrollLeft,50);assert.match(nav.innerHTML,/&lt;CHORUS&gt;/);assert.doesNotMatch(nav.innerHTML,/<CHORUS>/);assert.equal(buttons[1]['aria-current'],'step');
 c.sections.reverse();c.sections[0].title='BRIDGE';c.renderSectionNavigator();assert.match(nav.innerHTML,/data-jump-section="0"[^>]*BRIDGE/);
 c.sections.pop();c.renderSectionNavigator();assert.equal((nav.innerHTML.match(/data-jump-section/g)||[]).length,1);
 c.sections=[];c.renderSectionNavigator();assert.equal(nav.hidden,true);
});
test('creator navigation scrolls below sticky header and respects reduced motion',()=>{
 const source=read('host/js/lyricscreator.js');const code=source.slice(source.indexOf('  function revealSection('),source.indexOf('  $("addLyricsSectionBtn").onclick'));
 let scroll,reduced=false;const c={sections:[{}],document:{querySelector:()=>({getBoundingClientRect:()=>({top:500})}),getElementById:()=>({getBoundingClientRect:()=>({height:160})})},window:{scrollY:300,scrollTo:opts=>scroll=opts},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:reduced})};
 vm.createContext(c);vm.runInContext(code,c);c.revealSection(0);assert.equal(scroll.top,628);assert.equal(scroll.behavior,'smooth');reduced=true;c.revealSection(0);assert.equal(scroll.behavior,'instant');
});
test('navigation feedback cancels previous pulse and restores opacity and scale together',()=>{
 const source=read('host/js/lyricview.js'),start=source.indexOf('    document.querySelectorAll(".host-nav-btn")');
 let click,animation,cancelled=0,reduced=false;const button={addEventListener:(event,fn)=>click=fn,getAnimations:()=>[{cancel(){cancelled++}}],animate:(frames,options)=>animation={frames,options}};
 const c={document:{querySelectorAll:()=>[button]},matchMedia:()=>({matches:reduced})};vm.createContext(c);vm.runInContext(source.slice(start,source.indexOf('    $("navUpBtn").onclick',start)),c);click();assert.equal(cancelled,1);assert.equal(animation.options.duration,650);assert.equal(animation.frames[0].opacity,1);assert.equal(animation.frames[1].opacity,.72);assert.equal(animation.frames[0].scale,'1.12');assert.equal(animation.frames[1].scale,'1');reduced=true;click();assert.equal(cancelled,1);
});
