const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function assertLoadOnly(href){const url=new URL(href,'https://example.org/ls26try/host/');assert.equal(url.searchParams.get('id'),'song');assert.equal(url.searchParams.get('requestId'),'request');assert.equal(url.searchParams.has('play'),false);}
test('Run Order loads the selected song and request without starting it',async()=>{
 const source=read('admin-new/js/top-statusbar-session-tools.js');const code=source.slice(source.indexOf('  async function openRunOrderSong('),source.indexOf('  function detailValue('));
 const c={queueItems:()=>[{id:'item',songId:'song',requestId:'request'}],runOrderPlayingItem:()=>null,findAuthoritativeSongForRunItem:()=>({id:'song'}),URLSearchParams,location:{},LS26:{url:x=>x}};vm.createContext(c);vm.runInContext(code,c);await c.openRunOrderSong('item');assertLoadOnly(c.location.href);
});
test('Next Song finalizes the old performance but only loads the next one',async()=>{
 const source=read('host/js/lyricview.js');const code=source.slice(source.indexOf('  async function goToNextRunOrderSong()'),source.indexOf('  function startAutoScroll()'));
 let finalized=0;const c={performanceRecordCreated:true,finalizeCurrentSongPlayed:async()=>finalized++,getActiveSessionContext:async()=>({sessionId:'session'}),getNextRunOrderItem:async()=>({songId:'song',requestId:'request'}),URLSearchParams,location:{}};vm.createContext(c);vm.runInContext(code,c);await c.goToNextRunOrderSong();assert.equal(finalized,1);assertLoadOnly(c.location.href);
});
test('Library next-in-run-order control also loads without an autoplay flag',()=>{
 const source=read('host/js/lyricsviewer.js');const code=source.slice(source.indexOf('  $("playSelectedBtn").onclick ='),source.indexOf('  $("openRunOrderBtn").onclick ='));
 const button={};const c={$:()=>button,nextRunOrderItem:{songId:'song',requestId:'request'},saveViewState(){},URLSearchParams,location:{},LS26:{url:x=>x}};vm.createContext(c);vm.runInContext(code,c);button.onclick();assertLoadOnly(c.location.href);
});
test('title metadata reflects user BPM and updates along with Song Info',()=>{
 const source=read('host/js/lyricview.js');const code=source.slice(source.indexOf('  function setInfo(song)'),source.indexOf('  function normaliseType('));
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{classList:{add(){},remove(){}}});return nodes.get(id);};
 const c={$:get,toNumber:value=>value==null?null:Number(value),esc:String};vm.createContext(c);vm.runInContext(code,c);
 c.setInfo({userBpm:147,originalBpm:149,key:'C',capo:0,timeSignature:'4/4'});assert.match(get('quickTempo').innerHTML,/147/);assert.equal(get('quickKey').textContent,'C');assert.equal(get('quickCapo').textContent,0);assert.equal(get('quickTime').textContent,'4/4');
 c.setInfo({userBpm:150,originalBpm:149});assert.match(get('quickTempo').innerHTML,/150/);assert.equal(get('quickTempo').innerHTML,get('infoTempo').innerHTML);
});
