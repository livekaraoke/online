(() => {
  const db = window.db;
  const params = new URLSearchParams(location.search);
  let currentFirebaseId = params.get("firebaseId") || params.get("id") || null;
  let songData = {title:"",artist:"",userBpm:"",originalBpm:"",capo:"",key:"",year:"",timeSignature:"4/4",note:"",youtubeLink:"",karaokeLyrics:"No",publicSongListVisible:false,myNotes:"",sections:[]};
  let originalSnapshot = "";
  let dirty = false;
  let draggedSectionIndex = null;
  let activeEditor = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const sectionTemplates = [
    ["VERSE","lyrics"],["CHORUS","lyrics"],["PRE-CHORUS","lyrics"],["BRIDGE","lyrics"],["INTRO","lyrics"],["OUTRO","lyrics"],["INSTRUMENTAL","lyrics"],["SOLO","lyrics"],["GUITAR TAB","tab"],["PERFORMANCE NOTE","performance-note"],["HOST NOTE","host-note"],["ENDING","lyrics"],["SEPARATOR","separator"]
  ];

  function sectionDefaults(type,title="") {
    return {
      type,
      title: title || ({lyrics:"VERSE",tab:"GUITAR TAB","performance-note":"PERFORMANCE NOTE","host-note":"HOST NOTE"}[type] || ""),
      html: "",
      collapsed: false,
      singerVisible: type !== "host-note",
      rhythmMode: type === "tab" ? "Beat Grid" : "None",
      beatLabels: type === "tab" ? ["1","&","2","&","3","&","4","&"] : [],
      style:{fontFamily:"Verdana",fontSize:18,color:"#ffffff"}
    };
  }

  function markDirty(){ dirty = true; updateEditingLabel(); }
  function snapshot(){ return JSON.stringify(songData); }
  function isDirty(){ return dirty || snapshot() !== originalSnapshot; }

  function updateEditingLabel(){
    const t = $("songTitle").value.trim();
    const a = $("artistName").value.trim();
    $("creatorEditingLabel").textContent = `Editing: ${t || "New Song"}${a ? " - " + a : ""}${isDirty() ? " • Unsaved" : ""}`;
  }

  function syncMetaFromInputs(){
    songData.title = $("songTitle").value.trim();
    songData.artist = $("artistName").value.trim();
    songData.userBpm = $("userBpm").value.trim();
    songData.originalBpm = $("originalBpm").value.trim();
    songData.key = $("songKey").value.trim();
    songData.capo = $("capoNote").value.trim();
    songData.year = $("songYear").value.trim();
    songData.timeSignature = $("timeSignature").value.trim() || "4/4";
    songData.youtubeLink = $("youtubeLink").value.trim();
    songData.note = $("songNote").value;
    songData.karaokeLyrics = $("karaokeLyrics").value || "No";
    songData.publicSongListVisible = $("publicSongListVisible").checked;
  }

  function loadMetaToInputs(){
    $("songTitle").value = songData.title || "";
    $("artistName").value = songData.artist || "";
    $("userBpm").value = songData.userBpm || "";
    $("originalBpm").value = songData.originalBpm || "";
    $("songKey").value = songData.key || "";
    $("capoNote").value = songData.capo || "";
    $("songYear").value = songData.year || "";
    $("timeSignature").value = songData.timeSignature || songData.time || "4/4";
    $("youtubeLink").value = songData.youtubeLink || "";
    $("songNote").value = songData.note || songData.songNote || "";
    $("publicSongListVisible").checked = songData.publicSongListVisible === true;
  }

  async function populateKaraokeLyrics(){
    const select = $("karaokeLyrics");
    try {
      const snap = await db.collection("lyrics").get();
      const items = snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.title).sort((a,b)=>String(a.title).localeCompare(String(b.title)));
      select.innerHTML = `<option value="No">No</option>` + items.map(s=>`<option value="${esc(s.id)}">${esc(s.title)} — ${esc(s.artist || "")}</option>`).join("");
      if (songData.karaokeLyrics && ![...select.options].some(o=>o.value===songData.karaokeLyrics)) {
        const opt=document.createElement("option"); opt.value=songData.karaokeLyrics; opt.textContent=songData.karaokeLyrics; select.appendChild(opt);
      }
      select.value = songData.karaokeLyrics || "No";
    } catch(e){ console.warn(e); }
  }

  function formatButton(label, command, title=label){ return `<button type="button" data-cmd="${command}" title="${title}">${label}</button>`; }

  function renderSections(){
    const root = $("creatorSections");
    root.innerHTML = "";
    if (!songData.sections.length) root.innerHTML = `<div class="creator-empty-state">No sections yet. Choose a section template or add Lyrics / Chords.</div>`;

    songData.sections.forEach((section,index)=>{
      if (section.type === "separator") {
        const row = document.createElement("div");
        row.className="creator-separator-card";
        row.draggable=true;
        row.dataset.index=index;
        row.innerHTML=`<span class="creator-drag">☰</span><strong>SEPARATOR</strong><button data-action="up">↑</button><button data-action="down">↓</button><button data-action="delete">✕</button>`;
        attachSectionActions(row,index);
        root.appendChild(row);
        return;
      }

      const card = document.createElement("article");
      card.className=`creator-section-card-v3 type-${section.type}`;
      card.dataset.index=index;
      card.draggable=true;
      const collapsedEditor = section.editorCollapsed === true;
      card.innerHTML = `
        <div class="creator-section-card-head">
          <span class="creator-drag" title="Drag section">☰</span>
          <button class="editor-collapse-toggle" data-action="collapse-editor" type="button">${collapsedEditor ? "▸" : "▾"}</button>
          <input class="section-title-input" value="${esc(section.title || "")}" placeholder="SECTION TITLE">
          <span class="section-type-badge-v3">${esc(section.type.replace(/-/g," ").toUpperCase())}</span>
          <label class="load-open-toggle"><input type="checkbox" class="section-load-open" ${section.collapsed !== true ? "checked" : ""}> Open by default</label>
          <button data-action="duplicate" title="Duplicate">⧉</button>
          <button data-action="up" title="Move up">↑</button>
          <button data-action="down" title="Move down">↓</button>
          <button data-action="delete" title="Delete">✕</button>
        </div>
        <div class="creator-section-card-body ${collapsedEditor ? "hidden" : ""}">
          ${renderSectionToolbar(section,index)}
          ${renderSectionEditor(section,index)}
        </div>`;
      attachSectionActions(card,index);
      root.appendChild(card);
    });
    bindEditors();
    bindDrag();
  }

  function renderSectionToolbar(section,index){
    if (["performance-note","host-note"].includes(section.type)) {
      return `<div class="section-config-strip"><label>Font <select class="section-font"><option>Verdana</option><option>Arial</option><option>Bahnschrift</option><option>Courier New</option></select></label><label>Size <select class="section-font-size">${[12,14,16,18,20,22,24,28,32,36,40].map(n=>`<option ${Number(section.style?.fontSize||18)===n?"selected":""}>${n}</option>`).join("")}</select></label></div>`;
    }
    return `<div class="rich-toolbar-v3">
      ${formatButton("B","bold")}${formatButton("I","italic")}${formatButton("U","underline")}
      <select class="section-font" title="Font name"><option>Verdana</option><option>Arial</option><option>Bahnschrift</option><option>Georgia</option><option>Courier New</option></select>
      <select class="section-font-size" title="Font size">${[12,14,16,18,20,22,24,28,32,36,40,48].map(n=>`<option ${Number(section.style?.fontSize||18)===n?"selected":""}>${n}</option>`).join("")}</select>
      <div class="text-colour-wrap"><button class="colour-menu-btn" type="button">TEXT COLOUR ▾</button><div class="colour-menu hidden">${["#ffffff","#bfc3c8","#ff4d55","#ff9e32","#ffd633","#5dff72","#21d6c7","#40a9ff","#a86cff","#ff72b7"].map(c=>`<button type="button" class="swatch" style="--swatch:${c}" data-colour="${c}"></button>`).join("")}</div></div>
      <button type="button" class="quick-style green" data-quick="#57ff67">B GREEN</button>
      <button type="button" class="quick-style yellow" data-quick="#ffd633">B YELLOW</button>
      <button type="button" class="quick-style teal" data-quick="#21d6c7">B TEAL</button>
      <button type="button" data-action="insert-chord" class="insert-chord-btn">INSERT CHORD</button>
      <button type="button" data-action="insert-tab" class="insert-tab-btn">INSERT BLANK TAB</button>
      ${section.type === "tab" ? `<label class="rhythm-mode">Rhythm <select class="section-rhythm"><option>None</option><option>Beats</option><option ${section.rhythmMode==="Beat Grid"?"selected":""}>Beat Grid</option></select></label>` : ""}
    </div>`;
  }

  function renderSectionEditor(section,index){
    const cls = section.type === "tab" ? " tab-mode" : "";
    return `<div class="creator-rich-editor-v3${cls}" contenteditable="true" spellcheck="false" data-editor-index="${index}">${section.html || ""}</div>`;
  }

  function attachSectionActions(card,index){
    card.addEventListener("click", async e=>{
      const action=e.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action==="delete") {
        const ok=await confirmCustom("Delete Section?","This section will be removed from the song."); if(!ok)return;
        songData.sections.splice(index,1); markDirty(); renderSections();
      } else if(action==="duplicate") {
        songData.sections.splice(index+1,0,JSON.parse(JSON.stringify(songData.sections[index]))); markDirty(); renderSections();
      } else if(action==="up" && index>0) { [songData.sections[index-1],songData.sections[index]]=[songData.sections[index],songData.sections[index-1]]; markDirty(); renderSections(); }
      else if(action==="down" && index<songData.sections.length-1) { [songData.sections[index+1],songData.sections[index]]=[songData.sections[index],songData.sections[index+1]]; markDirty(); renderSections(); }
      else if(action==="collapse-editor") { songData.sections[index].editorCollapsed=!songData.sections[index].editorCollapsed; renderSections(); }
      else if(action==="insert-chord") { activeEditor=card.querySelector("[contenteditable]"); openChordModal(); }
      else if(action==="insert-tab") { activeEditor=card.querySelector("[contenteditable]"); insertBlankTabAtSelection(activeEditor); syncSectionHtml(index,activeEditor); }
    });

    const title=card.querySelector(".section-title-input"); if(title) title.addEventListener("input",()=>{songData.sections[index].title=title.value;markDirty();});
    const open=card.querySelector(".section-load-open"); if(open) open.addEventListener("change",()=>{songData.sections[index].collapsed=!open.checked;markDirty();});
    const font=card.querySelector(".section-font"); if(font){font.value=songData.sections[index].style?.fontFamily||"Verdana";font.addEventListener("change",()=>{songData.sections[index].style={...(songData.sections[index].style||{}),fontFamily:font.value};card.querySelector("[contenteditable]").style.fontFamily=font.value;markDirty();});}
    const size=card.querySelector(".section-font-size"); if(size) size.addEventListener("change",()=>{songData.sections[index].style={...(songData.sections[index].style||{}),fontSize:Number(size.value)};card.querySelector("[contenteditable]").style.fontSize=size.value+"px";markDirty();});
    const rhythm=card.querySelector(".section-rhythm"); if(rhythm) rhythm.addEventListener("change",()=>{songData.sections[index].rhythmMode=rhythm.value; songData.sections[index].beatLabels=rhythm.value==="Beat Grid"?["1","&","2","&","3","&","4","&"]:[];markDirty();});
  }

  function bindEditors(){
    document.querySelectorAll(".creator-section-card-v3").forEach(card=>{
      const index=Number(card.dataset.index); const editor=card.querySelector("[contenteditable]"); if(!editor)return;
      const section=songData.sections[index];
      editor.style.fontFamily=section.style?.fontFamily||"Verdana"; editor.style.fontSize=(section.style?.fontSize||18)+"px";
      editor.addEventListener("input",()=>syncSectionHtml(index,editor));
      editor.addEventListener("focus",()=>activeEditor=editor);
      card.querySelectorAll("[data-cmd]").forEach(btn=>btn.onclick=()=>{editor.focus();document.execCommand(btn.dataset.cmd,false,null);syncSectionHtml(index,editor);});
      const colourBtn=card.querySelector(".colour-menu-btn"); const colourMenu=card.querySelector(".colour-menu"); if(colourBtn) colourBtn.onclick=()=>colourMenu.classList.toggle("hidden");
      card.querySelectorAll("[data-colour]").forEach(btn=>btn.onclick=()=>{editor.focus();document.execCommand("foreColor",false,btn.dataset.colour);colourMenu.classList.add("hidden");syncSectionHtml(index,editor);});
      card.querySelectorAll("[data-quick]").forEach(btn=>btn.onclick=()=>{editor.focus();document.execCommand("bold",false,null);document.execCommand("foreColor",false,btn.dataset.quick);syncSectionHtml(index,editor);});
    });
  }

  function syncSectionHtml(index,editor){ songData.sections[index].html=editor.innerHTML; markDirty(); }

  function createTabHtml(){
    const dash=`<span class="tab-cell dash">-</span>`.repeat(48);
    const line=l=>`<div class="tab-line"><span class="tab-fixed">${l}|</span><span class="tab-dashes" contenteditable="true">${dash}</span><span class="tab-fixed">|</span></div>`;
    return `<div class="tab-block" contenteditable="false"><div class="tab-line tab-note-line"><span class="tab-fixed">BEATS </span><span class="tab-note" contenteditable="true">1 &amp; 2 &amp; 3 &amp; 4 &amp;</span></div>${line("e")}${line("B")}${line("G")}${line("D")}${line("A")}${line("E")}</div>`;
  }

  function insertBlankTabAtSelection(editor){
    editor.focus();
    const sel=window.getSelection(); const range=sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const temp=document.createElement("div"); temp.innerHTML=createTabHtml(); const node=temp.firstElementChild;
    if(range && editor.contains(range.commonAncestorContainer)){range.deleteContents();range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);} else editor.appendChild(node);
    markDirty();
  }

  function openChordModal(){ $("chordInput").value=""; $("chordPreview").textContent="Chord preview"; $("chordModal").classList.remove("hidden"); $("chordInput").focus(); }
  function insertChord(){ const value=$("chordInput").value.trim(); if(!value||!activeEditor)return; activeEditor.focus(); document.execCommand("insertHTML",false,`<span class="chord-token" style="color:#40a9ff;font-weight:bold">${esc(value)}</span>&nbsp;`); $("chordModal").classList.add("hidden"); const idx=Number(activeEditor.dataset.editorIndex); syncSectionHtml(idx,activeEditor); }

  function addSection(type,title=""){
    const s=sectionDefaults(type,title); if(type==="tab")s.html=createTabHtml(); if(type==="performance-note")s.style={fontFamily:"Verdana",fontSize:18,color:"#4bea78"}; if(type==="host-note")s.style={fontFamily:"Verdana",fontSize:18,color:"#ffcf54"}; songData.sections.push(s); markDirty(); renderSections(); setTimeout(()=>document.querySelector(`[data-index="${songData.sections.length-1}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),50);
  }

  function bindDrag(){
    document.querySelectorAll("[data-index][draggable='true']").forEach(card=>{
      card.addEventListener("dragstart",e=>{draggedSectionIndex=Number(card.dataset.index);card.classList.add("dragging");e.dataTransfer.effectAllowed="move";});
      card.addEventListener("dragend",()=>{card.classList.remove("dragging");draggedSectionIndex=null;});
      card.addEventListener("dragover",e=>e.preventDefault());
      card.addEventListener("drop",e=>{e.preventDefault();const target=Number(card.dataset.index);if(draggedSectionIndex==null||target===draggedSectionIndex)return;const [moved]=songData.sections.splice(draggedSectionIndex,1);songData.sections.splice(target,0,moved);markDirty();renderSections();});
    });
  }

  function renderTemplateMenu(){ $("templateMenu").innerHTML=sectionTemplates.map(([name,type])=>`<button type="button" data-template-type="${type}" data-template-title="${esc(name)}">${esc(name)}</button>`).join(""); $("templateMenu").querySelectorAll("button").forEach(b=>b.onclick=()=>{$("templateMenu").classList.add("hidden");addSection(b.dataset.templateType,b.dataset.templateTitle);}); }

  async function confirmCustom(title,message){ return new Promise(resolve=>{ $("creatorConfirmTitle").textContent=title;$("creatorConfirmMessage").textContent=message;$("creatorConfirmModal").classList.remove("hidden");$("creatorConfirmYes").onclick=()=>{$("creatorConfirmModal").classList.add("hidden");resolve(true);};$("creatorConfirmNo").onclick=()=>{$("creatorConfirmModal").classList.add("hidden");resolve(false);}; }); }

  async function saveSong(){
    syncMetaFromInputs();
    if(!songData.title||!songData.artist){await confirmCustom("Missing Details","Song title and artist are required.");return;}
    const docId=currentFirebaseId || `${songData.title}${songData.artist}`.toLowerCase().replace(/[^a-z0-9]/g,"");
    const payload={...songData,id:docId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(!currentFirebaseId) payload.createdAt=firebase.firestore.FieldValue.serverTimestamp();
    await db.collection("lyrics").doc(docId).set(payload,{merge:false});
    currentFirebaseId=docId; songData.id=docId; originalSnapshot=snapshot(); dirty=false; updateEditingLabel();
    location.href=`lyricsview.html?id=${encodeURIComponent(docId)}`;
  }

  async function cancelAndLeave(){ if(isDirty()){const ok=await confirmCustom("Discard Changes?","Are you sure you want to leave? All unsaved changes will be lost.");if(!ok)return;} location.href=currentFirebaseId?`lyricsview.html?id=${encodeURIComponent(currentFirebaseId)}`:"lyricsviewer.html"; }

  async function loadSong(){
    if(!currentFirebaseId){ await populateKaraokeLyrics(); loadMetaToInputs(); renderSections(); originalSnapshot=snapshot(); dirty=false; updateEditingLabel(); return; }
    const snap=await db.collection("lyrics").doc(currentFirebaseId).get();
    if(!snap.exists){await confirmCustom("Song Not Found","The selected song could not be loaded.");return;}
    songData={...songData,...snap.data(),id:snap.id};
    songData.sections=Array.isArray(songData.sections)?songData.sections.map(s=>({ ...sectionDefaults(s.type||"lyrics",s.title||""), ...s, style:{...sectionDefaults(s.type||"lyrics").style,...(s.style||{})} })) : [];
    loadMetaToInputs(); await populateKaraokeLyrics(); renderSections(); originalSnapshot=snapshot(); dirty=false; updateEditingLabel();
  }

  function bindUi(){
    ["songTitle","artistName","userBpm","originalBpm","songKey","capoNote","songYear","timeSignature","youtubeLink","songNote","karaokeLyrics","publicSongListVisible"].forEach(id=>$(id).addEventListener("input",()=>{syncMetaFromInputs();markDirty();}));
    $("creatorBackBtn").onclick=cancelAndLeave;
    $("creatorSaveBtn").onclick=saveSong;
    $("creatorSaveMenuBtn").onclick=()=>$("creatorSaveMenu").classList.toggle("hidden");
    $("creatorCancelChangesBtn").onclick=cancelAndLeave;
    $("toggleSongDetailsBtn").onclick=()=>{$("songDetailsBody").classList.toggle("hidden");$("toggleSongDetailsBtn").textContent=$("songDetailsBody").classList.contains("hidden")?"▸":"▾";};
    document.querySelectorAll("[data-add-type]").forEach(b=>b.onclick=()=>addSection(b.dataset.addType));
    $("templateBtn").onclick=()=>$("templateMenu").classList.toggle("hidden");
    $("chordInput").addEventListener("input",()=>$("chordPreview").textContent=$("chordInput").value||"Chord preview");
    $("insertChordConfirm").onclick=insertChord; $("insertChordCancel").onclick=()=>$("chordModal").classList.add("hidden");
    window.addEventListener("beforeunload",e=>{if(isDirty()){e.preventDefault();e.returnValue="";}});
    renderTemplateMenu();
  }

  document.addEventListener("DOMContentLoaded",()=>{bindUi();loadSong().catch(async e=>{console.error(e);await confirmCustom("Load Error",e.message||"Could not load song.");});});
})();
