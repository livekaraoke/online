/* Private Prompter song selector: on-demand reads of the ACTIVE session's
 * existing setlist and song metadata. No duplicated listeners or Firestore writes.
 */
(() => {
  'use strict';
  const trigger=document.getElementById('ls26SingerLibraryLink');
  if(!trigger)return;
  const dialog=document.createElement('dialog');
  dialog.id='ls26SessionSongPicker';
  dialog.setAttribute('aria-label','Current session songs');
  dialog.innerHTML=`
    <div class="ls26-session-picker-header">
      <div><small>LIVE KARAOKE</small><h2>SESSION SONGS</h2><p id="ls26PickerSetlistName">Current session setlist</p></div>
      <button type="button" id="ls26PickerClose" aria-label="Close song list" title="Close">×</button>
    </div>
    <div class="ls26-session-picker-search">
      <input id="ls26PickerSearch" type="search" placeholder="Search songs or artists..." aria-label="Search session songs" autocomplete="off">
      <span id="ls26PickerCount"></span>
    </div>
    <div id="ls26PickerRows" class="ls26-session-picker-rows" role="list"></div>
    <p id="ls26PickerStatus" role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog);
  const rowsEl=dialog.querySelector('#ls26PickerRows');
  const search=dialog.querySelector('#ls26PickerSearch');
  const status=dialog.querySelector('#ls26PickerStatus');
  const count=dialog.querySelector('#ls26PickerCount');
  const heading=dialog.querySelector('#ls26PickerSetlistName');
  const close=()=>dialog.close();
  dialog.querySelector('#ls26PickerClose').addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  let requestVersion=0,rows=[],sessionKey='',metadataCache=new Map(),loading=false;
  dialog.addEventListener('close',()=>{requestVersion++;loading=false;});
  const db=()=>window.db||(window.firebase?.firestore?firebase.firestore():null);
  const legacy=(()=>{
    const map=new Map();
    for(const song of Array.isArray(window.songs)?window.songs:[]){
      const match=String(song.url||'').match(/[?&]id=([^&#]+)/);
      let id=match?.[1]||song.id||'';
      try{id=decodeURIComponent(id);}catch(_){}
      if(id)map.set(String(id),{title:String(song.title||''),artist:String(song.artist||''),year:song.year});
    }
    return map;
  })();
  function message(value){status.textContent=value||'';}
  function render(){
    const query=search.value.trim().toLocaleLowerCase();
    const matches=rows.filter(item=>(item.title+' '+item.artist).toLocaleLowerCase().includes(query));
    count.textContent=matches.length+' / '+rows.length;
    rowsEl.replaceChildren();
    if(!matches.length){
      const p=document.createElement('p');p.className='ls26-session-picker-empty';
      p.textContent=rows.length?'No matching songs.':loading?'Loading session songs...':'No songs in this session setlist.';
      rowsEl.appendChild(p);return;
    }
    const fragment=document.createDocumentFragment();
    for(const item of matches){
      const button=document.createElement('button');
      button.type='button';button.className='ls26-session-picker-song';
      button.dataset.songId=item.id;
      button.disabled=!item.format;
      const title=document.createElement('strong');title.textContent=item.title;
      const artist=document.createElement('span');artist.textContent=item.artist||'Unknown artist';
      button.append(title,artist);
      if(!item.format){
        const missing=document.createElement('small');missing.textContent='Lyrics unavailable';button.appendChild(missing);
      }
      fragment.appendChild(button);
    }
    rowsEl.appendChild(fragment);
  }
  async function fetchMetadata(firestore,ids){
    const missing=ids.filter(id=>!metadataCache.has(id));
    // Firestore document-ID IN queries only read songs from this setlist,
    // rather than downloading every full lyrics document in the library.
    for(let i=0;i<missing.length;i+=30){
      const group=missing.slice(i,i+30);
      const field=window.firebase?.firestore?.FieldPath?.documentId?.();
      if(!field)throw Error('Song metadata is unavailable.');
      const snapshot=await firestore.collection('lyrics').where(field,'in',group).get();
      for(const id of group)metadataCache.set(id,null);
      snapshot.docs.forEach(doc=>metadataCache.set(doc.id,doc.data()||{}));
    }
  }
  async function load(){
    const generation=++requestVersion;
    rows=[];loading=true;search.value='';heading.textContent='Current session setlist';
    message('');render();
    try{
      const firestore=db();
      if(!firestore)throw Error('Song library connection unavailable.');
      const current=await firestore.collection('karaokeControl').doc('currentSession').get();
      if(generation!==requestVersion)return;
      const control=current.exists?(current.data()||{}):{};
      const sessionId=String(control.sessionId||control.activeSessionId||'').trim();
      if(control.active!==true||!sessionId)throw Error('No active performance session.');
      const sessionDoc=await firestore.collection('performanceSessions').doc(sessionId).get();
      if(generation!==requestVersion)return;
      if(!sessionDoc.exists)throw Error('The active session could not be found.');
      const session=sessionDoc.data()||{};
      const listId=String(session.publicSetlistId||session.setlistId||'').trim();
      if(!listId&&!Array.isArray(session.setlistSongIds))
        throw Error('No setlist is assigned to the current session.');
      let list={};
      if(listId){
        const snap=await firestore.collection('lyricsSetlists').doc(listId).get();
        if(generation!==requestVersion)return;
        if(!snap.exists&&listId!==session.setlistId)
          throw Error('The active session setlist could not be found.');
        list=snap.exists?(snap.data()||{}):{};
      }
      const ids=[...new Set((Array.isArray(list.songIds)?list.songIds:
        listId===session.setlistId&&Array.isArray(session.setlistSongIds)?session.setlistSongIds:[])
        .map(id=>String(id||'').trim()).filter(Boolean))];
      heading.textContent=String(list.name||session.publicSetlistName||session.setlistName||'Current session setlist');
      if(!ids.length){rows=[];message('This session setlist has no songs.');return;}
      await fetchMetadata(firestore,ids);
      if(generation!==requestVersion)return;
      rows=ids.map(id=>{
        const data=metadataCache.get(id)||{},fallback=legacy.get(id)||{};
        const title=String(data.title||fallback.title||id);
        const artist=String(data.artist||fallback.artist||'');
        const format=Array.isArray(data.sections)?'modern':legacy.has(id)?'legacy':'';
        return {id,title,artist,format};
      }).sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'})||
        a.artist.localeCompare(b.artist,undefined,{sensitivity:'base'}));
      message('');
    }catch(error){
      if(generation===requestVersion){rows=[];message(error?.message||'Unable to load the current session setlist.');}
    }finally{
      if(generation===requestVersion){loading=false;render();}
    }
  }
  trigger.addEventListener('click',event=>{
    event.stopPropagation();
    if(dialog.open)return;
    dialog.showModal();
    void load();
  });
  search.addEventListener('input',render);
  rowsEl.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-song-id]');
    if(!button||button.disabled)return;
    const song=rows.find(item=>item.id===button.dataset.songId);
    if(!song?.format)return;
    button.disabled=true;message('Opening '+song.title+'...');
    try{
      if(typeof window.LS26PrompterSelectSong!=='function')
        throw Error('The lyrics loader is unavailable.');
      const success=await window.LS26PrompterSelectSong(song.id,song.format);
      if(!success)throw Error('The selected lyrics could not be loaded.');
      close();
    }catch(error){message(error?.message||'Could not open the selected lyrics.');button.disabled=false;}
  });
})();
