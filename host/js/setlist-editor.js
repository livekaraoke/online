(() => {
  const $ = id => document.getElementById(id);
  let songs = [], setlists = [], current = null;
  let songOrder = [];
  function esc(v){return LyricsCommon.escapeHTML(v);}
  function load(){
    db.collection("lyrics").onSnapshot(s=>{songs=s.docs.map(d=>LyricsCommon.normalizeSong(d.data(),d.id)).sort((a,b)=>a.title.localeCompare(b.title)); renderEditor();});
    db.collection("lyricsSetlists").onSnapshot(s=>{setlists=s.docs.map(d=>({id:d.id,...d.data(),songIds:Array.isArray(d.data().songIds)?d.data().songIds:[]})).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))); if(current) current=setlists.find(x=>x.id===current.id)||null; renderList(); renderEditor();});
  }
  function renderList(){ $("setlistCount").textContent=setlists.length; $("setlistList").innerHTML=setlists.length?setlists.map(s=>`<button class="setlist-list-item ${current?.id===s.id?'active':''}" data-select="${s.id}"><strong>${esc(s.name||'Untitled Setlist')}</strong><span>${s.songIds.length} songs</span></button>`).join(""):'<div class="empty-state">No setlists yet.</div>'; }
  function renderEditor(){
    $("setlistEmpty").classList.toggle("hidden",!!current); $("setlistEditor").classList.toggle("hidden",!current); if(!current)return;
    if(!songOrder.length || songOrder.join("|")!==current.songIds.join("|")) songOrder=[...current.songIds];
    $("setlistNameInput").value=current.name||""; $("setlistNotesInput").value=current.notes||""; $("selectedSongCount").textContent=songOrder.length;
    $("selectedSongs").innerHTML=songOrder.map((id,index)=>{const s=songs.find(x=>x.firebaseId===id);return s?`<div class="setlist-song-row" draggable="true" data-id="${id}"><span class="drag">☰</span><div><strong>${esc(s.title)}</strong><small>${esc(s.artist)}</small></div><button data-up="${id}">↑</button><button data-down="${id}">↓</button><button data-remove="${id}">×</button></div>`:''}).join("")||'<div class="empty-state">No songs in this setlist.</div>';
    renderAvailable(); enableDrag();
  }
  function renderAvailable(){if(!current)return;const q=$("availableSearch").value.toLowerCase().trim(); const selected=new Set(songOrder); const available=songs.filter(s=>!selected.has(s.firebaseId)&&(!q||`${s.title} ${s.artist}`.toLowerCase().includes(q))); $("availableSongs").innerHTML=available.map(s=>`<div class="setlist-song-row"><div><strong>${esc(s.title)}</strong><small>${esc(s.artist)}</small></div><button data-add="${s.firebaseId}">＋</button></div>`).join("")||'<div class="empty-state">No available songs.</div>';}
  async function save(){if(!current)return;const name=$("setlistNameInput").value.trim();if(!name)return alert("Enter a setlist name.");await db.collection("lyricsSetlists").doc(current.id).set({name,notes:$("setlistNotesInput").value,songIds:songOrder,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}
  function enableDrag(){let dragged=null;document.querySelectorAll("#selectedSongs .setlist-song-row").forEach(row=>{row.addEventListener("dragstart",()=>{dragged=row;row.classList.add("dragging")});row.addEventListener("dragend",()=>{row.classList.remove("dragging");dragged=null;songOrder=[...document.querySelectorAll("#selectedSongs .setlist-song-row")].map(x=>x.dataset.id);renderEditor()});row.addEventListener("dragover",e=>{e.preventDefault();if(!dragged||dragged===row)return;const r=row.getBoundingClientRect();(e.clientY>r.top+r.height/2?row.after(dragged):row.before(dragged));});});}
  document.addEventListener("click",async e=>{const sel=e.target.closest("[data-select]");if(sel){current=setlists.find(s=>s.id===sel.dataset.select);songOrder=[...(current?.songIds||[])];renderList();renderEditor();return;}const add=e.target.closest("[data-add]");if(add){songOrder.push(add.dataset.add);renderEditor();return;}const rem=e.target.closest("[data-remove]");if(rem){songOrder=songOrder.filter(id=>id!==rem.dataset.remove);renderEditor();return;}const up=e.target.closest("[data-up]");const down=e.target.closest("[data-down]");const el=up||down;if(el){const i=songOrder.indexOf(el.dataset.up||el.dataset.down);const j=i+(up?-1:1);if(j>=0&&j<songOrder.length)[songOrder[i],songOrder[j]]=[songOrder[j],songOrder[i]];renderEditor();}});
  $("newSetlistBtn").onclick=async()=>{const ref=await db.collection("lyricsSetlists").add({name:"New Setlist",notes:"",songIds:[],createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});current={id:ref.id,name:"New Setlist",notes:"",songIds:[]};songOrder=[];renderEditor();};
  $("saveSetlistBtn").onclick=save; $("deleteSetlistBtn").onclick=async()=>{if(current&&confirm(`Delete ${current.name||'this setlist'}?`)){await db.collection("lyricsSetlists").doc(current.id).delete();current=null;songOrder=[];renderEditor();}}; $("availableSearch").oninput=renderAvailable;
  load();
})();
