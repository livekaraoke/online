(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  let setlistId="",setlistName="",order=[],newIds=new Set(),notes={},songs=new Map(),dirty=false;
  const db=()=>window.LK?.db||firebase.firestore();

  function setStatus(message,error=false){
    const el=$("repertoireStatus");
    if(!el)return;
    el.textContent=message||"";
    el.style.color=error?"#ff8d96":"#9eb1bd";
  }

  async function fetchSongs(ids){
    const map=new Map(),chunks=[];
    for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));
    const snaps=await Promise.all(chunks.map(chunk=>
      db().collection("lyrics")
        .where(firebase.firestore.FieldPath.documentId(),"in",chunk)
        .get()
    ));
    snaps.forEach(group=>group.docs.forEach(doc=>map.set(doc.id,{id:doc.id,...(doc.data()||{})})));
    return map;
  }

  function markDirty(){
    dirty=true;
    setStatus("Unsaved changes.");
  }

  function render(){
    $("repertoireSetlistName").textContent=setlistName||"Live Karaoke default setlist";
    $("repertoireCount").textContent=order.length+" songs · "+order.filter(id=>newIds.has(id)).length+" NEW";
    const root=$("repertoireRows");
    root.innerHTML="";

    order.forEach((id,index)=>{
      const song=songs.get(id)||{title:"Missing song record",artist:""};
      const isNew=newIds.has(id);
      const row=document.createElement("article");
      row.className="repertoire-row";
      row.dataset.songId=id;
      row.innerHTML=
        '<div class="repertoire-position">'+(index+1)+'</div>'+
        '<div class="repertoire-song"><strong>'+esc(song.title||"Untitled")+
          (isNew?' <span class="repertoire-new">NEW</span>':'')+
          '</strong><small>'+esc(song.artist||song.songArtist||"")+'</small></div>'+
        '<div class="repertoire-note-wrap'+(isNew?'':' is-disabled')+'">'+
          (isNew
            ? '<input class="repertoire-note" data-note="'+esc(id)+'" maxlength="200" placeholder="Homepage note (optional)" value="'+esc(notes[id]||"")+'">'
            : 'Note available when this song is marked NEW')+
        '</div>'+
        '<div class="repertoire-actions">'+
          '<button type="button" data-move="up" aria-label="Move '+esc(song.title||"song")+' up" '+(index===0?'disabled':'')+'>↑</button>'+
          '<button type="button" data-move="down" aria-label="Move '+esc(song.title||"song")+' down" '+(index===order.length-1?'disabled':'')+'>↓</button>'+
        '</div>';
      root.appendChild(row);
    });

    if(!order.length)root.innerHTML='<p>No songs are in the configured default setlist.</p>';
  }

  async function load(){
    setStatus("Loading…");
    const settings=await db().collection("karaokeControl").doc("liveKaraokeWebsiteSettings").get();
    setlistId=String(settings.data()?.defaultBrowseSetlistId||"").trim();

    if(!setlistId){
      const fallback=await db().collection("karaokeControl").doc("publicSongList").get();
      setlistId=String(fallback.data()?.setlistId||"").trim();
    }
    if(!setlistId)throw Error("Choose an Offline / default browse setlist in Live Karaoke Website Settings first.");

    const snap=await db().collection("lyricsSetlists").doc(setlistId).get();
    if(!snap.exists)throw Error("The configured default setlist no longer exists.");

    const data=snap.data()||{};
    setlistName=String(data.name||setlistId);
    order=(Array.isArray(data.songIds)?data.songIds:[]).map(String);
    newIds=new Set((Array.isArray(data.newSongIds)?data.newSongIds:[]).map(String).filter(id=>order.includes(id)));
    notes=data.newSongNotes&&typeof data.newSongNotes==="object"?{...data.newSongNotes}:{};
    songs=await fetchSongs(order);
    dirty=false;
    render();
    setStatus("");
  }

  $("repertoireRows").addEventListener("click",event=>{
    const button=event.target.closest("[data-move]");
    if(!button)return;
    const row=button.closest("[data-song-id]");
    const id=row?.dataset.songId;
    const index=order.indexOf(id);
    if(index<0)return;
    const target=button.dataset.move==="up"?index-1:index+1;
    if(target<0||target>=order.length)return;
    [order[index],order[target]]=[order[target],order[index]];
    markDirty();
    render();
  });

  $("repertoireRows").addEventListener("input",event=>{
    const input=event.target.closest("[data-note]");
    if(!input)return;
    notes[input.dataset.note]=input.value.slice(0,200);
    markDirty();
  });

  $("saveRepertoireBtn").addEventListener("click",async()=>{
    const button=$("saveRepertoireBtn");
    button.disabled=true;
    setStatus("Saving…");
    try{
      const cleanNotes={};
      order.forEach(id=>{
        if(!newIds.has(id))return;
        const note=String(notes[id]||"").trim().slice(0,200);
        if(note)cleanNotes[id]=note;
      });
      await db().collection("lyricsSetlists").doc(setlistId).update({
        songIds:order,
        newSongNotes:cleanNotes,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      notes=cleanNotes;
      dirty=false;
      setStatus("Saved. The homepage NEW SONGS list will use this order and these notes.");
    }catch(error){
      setStatus("Could not save: "+error.message,true);
    }finally{
      button.disabled=false;
    }
  });

  addEventListener("beforeunload",event=>{
    if(!dirty)return;
    event.preventDefault();
    event.returnValue="";
  });

  document.addEventListener("DOMContentLoaded",()=>{
    window.LK?.sidebar?.loadSidebar?.();
    const auth=window.LK?.auth||firebase.auth();
    auth.onAuthStateChanged(user=>{
      if(user)load().catch(error=>setStatus(error.message,true));
      else setStatus("Sign in through LiveSuite Admin to edit the repertoire.",true);
    });
  });
})();