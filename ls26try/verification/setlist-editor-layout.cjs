/* Static, no-Firebase browser fixture for Setlist Editor layout.
 * Exercises the real page markup and CSS at tablet/mobile widths. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const doc=parseHTML(read('host/setlist-editor.html')).document;
doc.querySelectorAll('script,link[rel="stylesheet"]').forEach(e=>e.remove());
doc.getElementById('setlistLoadingGate').remove();
doc.getElementById('setlistEmpty').remove();
doc.getElementById('setlistEditor').classList.remove('hidden');
doc.getElementById('setlistAuthState').textContent='● signed-in@example.com';
doc.getElementById('newSetlistBtn').disabled=false;
doc.getElementById('setlistNameInput').value='Roxanna';
const names=['Billy Lee Solo','Billy Originals','In Progress','Live Karaoke','New Karaoke Additions','New Solo Show 26','Roxanna'];
doc.getElementById('setlistList').innerHTML=names.map((name,i)=>'<button class="setlist-list-item '+(i===6?'active':'')+'"><strong>'+name+'</strong><span>'+String(i*12+3)+' songs</span></button>').join('');
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const songs=['Ain’t no sunshine','All the Small Things','Another Brick in the Wall (pt. 2)','Bohemian like you','Born to be Wild','Boulevard of Broken Dreams','Breakfast at Tiffany’s','Have You Ever Seen The Rain'];
doc.getElementById('selectedSongCount').textContent='78';
doc.getElementById('selectedSongs').innerHTML=Array.from({length:78},(_,i)=>'<div class="setlist-song-row" draggable="true" data-id="song'+i+'"><span class="drag">☰</span><div><strong>'+esc(songs[i%songs.length])+'</strong><small>Artist &amp; collaborators · 1999</small></div><button data-up="'+i+'">↑</button><button data-down="'+i+'">↓</button><button data-remove="'+i+'">×</button></div>').join('');
doc.getElementById('availableSongs').innerHTML=Array.from({length:110},(_,i)=>'<div class="setlist-song-row"><div><strong>'+esc('0 - 0.'+i+' '+songs[i%songs.length]+' Extended title')+'</strong><small>Artist · 1999</small></div><button data-add="'+i+'">＋</button></div>').join('');
const style=doc.createElement('style');
style.textContent=read('host/css/lyrics-suite.css')+'\n'+read('shared/theme.css')+'\n'+read('host/css/setlist-editor-theme.css');
doc.head.appendChild(style);
const html='<!DOCTYPE html>'+doc.documentElement.outerHTML;
const executable=['setlistNameInput','setlistNotesInput','saveSetlistBtn','deleteSetlistBtn','availableSearch','availableSongs','selectedSongs','setlistList','newSetlistBtn'];
for(const id of executable)assert.ok(doc.getElementById(id),'Missing control '+id);
(async()=>{
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{}),args:['--no-sandbox']});
 try{
  for(const width of [1440,1024,960,800,760,600,390]){
   const page=await browser.newPage({viewport:{width,height:Math.max(850,Math.round(width*1.2))}});
   try{
    await page.setContent(html);
    const data=await page.evaluate(()=>{
     const sels={top:'.app-topbar',shell:'.setlist-shell',sidebar:'.setlist-list-panel',panel:'.setlist-editor-panel',fields:'.setlist-header-fields',name:'#setlistNameInput',notes:'#setlistNotesInput',actions:'.setlist-header-actions',columns:'.setlist-columns',selected:'#selectedSongs',available:'#availableSongs',firstSelected:'#selectedSongs .setlist-song-row',firstAvailable:'#availableSongs .setlist-song-row',availableSearch:'#availableSearch',add:'#availableSongs [data-add]',remove:'#selectedSongs [data-remove]',setlistItems:'#setlistList'};
     const r={},details={};for(const [key,selector]of Object.entries(sels)){const el=document.querySelector(selector);const b=el.getBoundingClientRect();r[key]={left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};details[key]={scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};}
     return {rect:r,details,viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,bg:getComputedStyle(document.querySelector('.setlist-list-panel')).backgroundImage,activeBg:getComputedStyle(document.querySelector('.setlist-list-item.active')).backgroundImage};
    });
    const r=data.rect;
    const within=(inner,outer)=>inner.left>=outer.left-3&&inner.right<=outer.right+3;
    assert.ok(data.scrollWidth<=data.viewport+2,'Horizontal page overflow at '+width+': '+data.scrollWidth);
    for(const id of ['sidebar','panel'])assert.ok(within(r[id],r.shell),'Panel overflow at '+width+': '+id);
    for(const id of ['name','notes','actions','columns','availableSearch','selected','available'])assert.ok(within(r[id],r.panel),'Editor overflow at '+width+': '+id);
    assert.ok(within(r.remove,r.firstSelected),'Reorder/remove actions overflow at '+width);
    assert.ok(within(r.add,r.firstAvailable),'Available Song add action overflows at '+width);
    assert.ok(data.details.selected.scrollHeight>data.details.selected.clientHeight,'Selected song list must scroll internally at '+width);
    assert.ok(data.details.available.scrollHeight>data.details.available.clientHeight,'Available song list must scroll internally at '+width);
    assert.ok(data.bg.includes('linear-gradient')||data.bg.includes('rgb(5, 25, 37)'),'Setlist panel not themed at '+width+': '+data.bg);
    if(width>=791){
      assert.ok(r.sidebar.right<r.panel.left,'Sidebar should sit beside editor at '+width);
      assert.ok(r.selected.right<=r.available.left+3,'Song columns overlap at '+width);
    }
    if(width<791)assert.ok(r.sidebar.bottom<=r.panel.top+3,'Mobile setlists should precede editor at '+width);
    if(width<=600)assert.ok(r.selected.bottom<=r.available.top+3,'Mobile song lists should stack at '+width);
    console.log('PASS Setlist Editor '+width+'px: navy theme, no overflow, accessible actions, internal list scroll');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
