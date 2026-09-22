const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
test('Song Info starts closed, contains BPM controls, resets BPM and closes on Play',()=>{
 const nodes=new Map(),events={},classes=()=>{const s=new Set();return {contains:x=>s.has(x),add:x=>s.add(x),remove:x=>s.delete(x),toggle(x,on){on?s.add(x):s.delete(x)}}};
 function element(id){const e={id,classList:classes(),setAttribute(k,v){this[k]=v},append(child){this.child=child},prepend(){},querySelector:()=>null,getBoundingClientRect:()=>({height:80,top:700}),click(){this.onclick?.()},set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))if(!nodes.has(m[1]))nodes.set(m[1],element(m[1]));}};return e;}
 for(const id of ['hostStickyStack','ls26StickyHeader','songInfoBtn','songInfoDrawer','closeSongInfoBtn','editSongBtn'])nodes.set(id,element(id));
 const title=element('title');nodes.get('hostStickyStack').querySelector=()=>title;nodes.get('songInfoDrawer').querySelector=()=>element('scroll');
 nodes.get('closeSongInfoBtn').onclick=()=>nodes.get('songInfoDrawer').classList.remove('open');
 const song={originalBpm:83,userBpm:90};let plays=0;
 const c={document:{getElementById:id=>nodes.get(id),createElement:()=>element(),documentElement:{style:{setProperty(){}}},querySelector:()=>null,addEventListener:(n,f)=>events[n]=f},location:{search:'',pathname:'/host/lyricview.html'},URLSearchParams,ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},innerHeight:900,cancelAnimationFrame(){},requestAnimationFrame:()=>1,LS26Performance:{song:()=>song,setBpm:n=>song.userBpm=Math.max(1,Math.min(400,Number(n))),play(){plays++;events['ls26:song-started']()}},addEventListener:(n,f)=>events[n]=f};c.window=c;
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared/performance.js'),'utf8'),c);events.DOMContentLoaded();
 assert.equal(nodes.get('ls26StickyHeader').child,title,'title is in sticky header');assert.equal(nodes.has('ls26Transpose'),false);assert.equal(nodes.get('songInfoDrawer').classList.contains('open'),false);
 events['ls26:song-ready']();assert.equal(nodes.get('songInfoDrawer').classList.contains('open'),false);
 nodes.get('ls26SongInfo').click();assert.equal(nodes.get('songInfoDrawer').classList.contains('open'),true);assert.equal(nodes.get('ls26CurrentBpm').value,90);
 nodes.get('ls26BpmPlus').click();assert.equal(song.userBpm,91);nodes.get('ls26BpmMinus').click();assert.equal(song.userBpm,90);nodes.get('ls26ResetBpm').click();assert.equal(song.userBpm,83);
 nodes.get('ls26PlaySong').click();assert.equal(plays,1);assert.equal(nodes.get('songInfoDrawer').classList.contains('open'),false);
});
