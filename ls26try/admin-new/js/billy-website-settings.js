/* Copyright © 2026 LiveSuite. All rights reserved. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const SETTINGS_DOC = () => LK.db.collection("karaokeControl").doc("billyLeeWebsiteSettings");
  const DEFAULTS = [
    {id:"80s",label:"80s",subtitle:"1980–1989",enabled:true,mode:"rule",rule:"80s",songIds:[]},
    {id:"90s",label:"90s",subtitle:"1990–1999",enabled:true,mode:"rule",rule:"90s",songIds:[]},
    {id:"rock",label:"ROCK",subtitle:"Rock songs",enabled:true,mode:"rule",rule:"rock",songIds:[]},
    {id:"pop",label:"POP",subtitle:"Pop songs",enabled:true,mode:"rule",rule:"pop",songIds:[]}
  ];
  const DEFAULT_FAQS = [
    {id:"how-request",question:"How do I request a song?",answer:"Open SONG LIST, search or browse a category, tap + on a song, add an optional note, then press SEND REQUEST."},
    {id:"after-send",question:"What happens after I send it?",answer:"Your request starts as pending. When accepted it appears in LiveSuite Run Order and MY REQUESTS shows your live queue position."},
    {id:"change-request",question:"Can I change my request?",answer:"You can edit your note while the request is still waiting or queued. You can also cancel your own request before it starts playing."},
    {id:"rejected",question:"Why was my request rejected?",answer:"If the host rejects or removes a request, MY REQUESTS shows REJECTED together with the reason supplied by the host."},
    {id:"queue",question:"Queue position",answer:"Queue positions follow LiveSuite Run Order and may change when the host reorders the performance."},
    {id:"tips",question:"Tips",answer:"Add a note if you need a different key, want to sing with someone, or want the host to know something before your turn."}
  ];
  const DEFAULT_CONTENT = {
    categoryCardSize:82,
    instagramUrl:"https://www.instagram.com/billylee.mt",
    facebookUrl:"https://www.facebook.com/billylee.mt",
    aboutShort:"Billy Lee is a Malta-based singer, guitarist and live performer with over 20 years of experience on stage. His solo performances combine guitar, vocals and live looping to build arrangements in real time, ranging from stripped-back acoustic songs to a fuller, layered sound.\n\nHaving performed at venues, concerts and festivals in Malta and the UK, Billy brings a broad repertoire and an adaptable approach to every show. Alongside his solo work, he is the frontman and guitarist of hard rock band Roxanna and also provides Live Karaoke, an interactive live music experience built around audience song requests and live performance.",
    aboutDetailed:"Billy Lee is a singer, guitarist and live performer based in Malta, with more than two decades of experience performing at venues, concerts, festivals and private events in Malta and the UK.\n\nHis solo setup is centred around guitar, vocals and live looping. Using a loop station, parts are recorded and layered live — rhythm guitar, lead parts, percussion and vocal harmonies can all be built into an arrangement in real time. This allows a solo performance to develop naturally from a simple acoustic foundation into a much fuller sound, without relying on a fixed backing arrangement.\n\nThe repertoire covers a wide range of material, with a strong foundation in rock alongside acoustic and contemporary favourites. Rather than reproducing every song in exactly the same way, arrangements can be adapted to the setting, the audience and the pace of the night. Requests and spontaneous changes are part of that approach, keeping the performance flexible and genuinely live.\n\nBilly is also behind Live Karaoke, an interactive live music experience that puts the audience at the centre of the performance. Guests choose and request songs to sing live, backed by Billy on guitar and vocals. It combines the accessibility of karaoke with the spontaneity and interaction of a live musician, allowing each performance to adapt to the singer and the room.\n\nBilly has also worked extensively in band settings. He currently fronts Roxanna, a Malta-based hard rock band formed in 2023, performing as lead vocalist and guitarist alongside Billy B on bass and backing vocals and Salvo on drums. The band draws from classic and modern hard rock, with elements of grunge and alternative rock, and also performs acoustic material in more intimate settings.\n\nWhether performing solo, hosting Live Karaoke or playing with Roxanna, the focus remains on musicianship, strong arrangements and audience connection - adapting each show to the setting and the people in the room."
  };

  let songs = [];
  let state = {
    enableLiveRequestTestMode:false,
    requestTestSessionId:"",
    showCategoryCards:true,
    showArtistSearchCard:true,
    categoryCardSize:DEFAULT_CONTENT.categoryCardSize,
    categories:DEFAULTS.map(item=>({...item})),
    faqs:DEFAULT_FAQS.map(item=>({...item})),
    instagramUrl:DEFAULT_CONTENT.instagramUrl,
    facebookUrl:DEFAULT_CONTENT.facebookUrl,
    aboutShort:DEFAULT_CONTENT.aboutShort,
    aboutDetailed:DEFAULT_CONTENT.aboutDetailed
  };
  let loaded = false;

  function esc(value){
    return String(value ?? "").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  }

  function slug(value,fallback="category"){
    const cleaned=String(value||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    return cleaned||fallback;
  }

  function genres(song){
    const values=[];
    if(song?.genre)values.push(song.genre);
    if(Array.isArray(song?.genres))values.push(...song.genres);
    if(Array.isArray(song?.tags))values.push(...song.tags);
    return values.map(value=>String(value||"").toLowerCase()).join(" ");
  }

  function defaultSongIds(rule){
    return songs.filter(song=>{
      const year=Number(song.year);
      if(rule==="80s")return Number.isFinite(year)&&year>=1980&&year<=1989;
      if(rule==="90s")return Number.isFinite(year)&&year>=1990&&year<=1999;
      const text=genres(song);
      if(rule==="rock")return /rock|grunge|metal|alternative/.test(text);
      if(rule==="pop")return /pop/.test(text);
      return false;
    }).map(song=>song.id);
  }

  function normaliseCategory(item,index){
    const fallback=DEFAULTS[index]||{};
    const rule=String(item?.rule||fallback.rule||"");
    const mode=String(item?.mode||fallback.mode||"custom");
    const rawSongIds=Array.isArray(item?.songIds)?item.songIds.map(String).filter(Boolean):[];
    return {
      id:slug(item?.id||fallback.id||`category-${index+1}`,`category-${index+1}`),
      label:String(item?.label||fallback.label||`CATEGORY ${index+1}`).trim().slice(0,24),
      subtitle:String(item?.subtitle||fallback.subtitle||"").trim().slice(0,40),
      enabled:item?.enabled!==false,
      mode,
      rule,
      songIds:mode==="custom"?Array.from(new Set(rawSongIds)):(rawSongIds.length?Array.from(new Set(rawSongIds)):(rule?defaultSongIds(rule):[]))
    };
  }

  function normaliseFaq(item,index){
    return {
      id:slug(item?.id||`faq-${index+1}`,`faq-${index+1}`),
      question:String(item?.question||"Question").trim().slice(0,120),
      answer:String(item?.answer||"").trim().slice(0,800)
    };
  }

  function normaliseSettings(data={}){
    const source=Array.isArray(data.categories)&&data.categories.length?data.categories:DEFAULTS;
    const faqSource=Array.isArray(data.faqs)&&data.faqs.length?data.faqs:DEFAULT_FAQS;
    return {
      enableLiveRequestTestMode:data.enableLiveRequestTestMode===true,
      requestTestSessionId:String(data.requestTestSessionId||""),
      showCategoryCards:data.showCategoryCards!==false,
      showArtistSearchCard:data.showArtistSearchCard!==false,
      categoryCardSize:Math.max(60,Math.min(120,Number(data.categoryCardSize)||DEFAULT_CONTENT.categoryCardSize)),
      categories:source.slice(0,8).map(normaliseCategory),
      faqs:faqSource.slice(0,20).map(normaliseFaq),
      instagramUrl:String(data.instagramUrl||DEFAULT_CONTENT.instagramUrl),
      facebookUrl:String(data.facebookUrl||DEFAULT_CONTENT.facebookUrl),
      aboutShort:String(data.aboutShort||DEFAULT_CONTENT.aboutShort),
      aboutDetailed:String(data.aboutDetailed||DEFAULT_CONTENT.aboutDetailed)
    };
  }

  function songMeta(song){
    const artist=window.ArtistNames?.display?.(song.artist||"")||song.artist||"";
    const year=String(song.year||"").trim();
    return [artist,year].filter(Boolean).join(" • ");
  }

  function categoryById(id){
    return state.categories.find(category=>category.id===id)||null;
  }

  function renderSongPicker(category,query=""){
    const q=String(query||"").trim().toLowerCase();
    const selected=new Set(category.songIds||[]);
    const visible=songs.filter(song=>{
      if(!q)return true;
      const hay=`${song.title||""} ${song.artist||""} ${song.year||""}`.toLowerCase();
      return hay.includes(q);
    });

    return visible.map(song=>`
      <label class="website-song-option">
        <input type="checkbox" data-category-song="${esc(category.id)}" value="${esc(song.id)}" ${selected.has(song.id)?"checked":""}>
        <span><strong>${esc(song.title||"Untitled")}</strong><small>${esc(songMeta(song))}</small></span>
      </label>
    `).join("") || '<p class="website-song-empty">No matching songs.</p>';
  }

  function render(){
    if($("enableLiveRequestTestMode"))$("enableLiveRequestTestMode").checked=state.enableLiveRequestTestMode===true;
    $("showCategoryCards").checked=state.showCategoryCards!==false;
    if($("showArtistSearchCard"))$("showArtistSearchCard").checked=state.showArtistSearchCard!==false;
    if($("categoryCardSize")){
      $("categoryCardSize").value=String(state.categoryCardSize||DEFAULT_CONTENT.categoryCardSize);
      $("categoryCardSizeValue").textContent=`${$("categoryCardSize").value} px`;
    }
    if($("websiteInstagramUrl"))$("websiteInstagramUrl").value=state.instagramUrl||"";
    if($("websiteFacebookUrl"))$("websiteFacebookUrl").value=state.facebookUrl||"";
    if($("websiteAboutShort"))$("websiteAboutShort").value=state.aboutShort||"";
    if($("websiteAboutDetailed"))$("websiteAboutDetailed").value=state.aboutDetailed||"";
    const container=$("websiteCategoryEditors");
    container.innerHTML=state.categories.map((category,index)=>`
      <details class="website-category-editor" data-category-editor="${esc(category.id)}" ${index===0?"open":""}>
        <summary>
          <span class="website-category-preview"><strong>${esc(category.label)}</strong><small>${esc(category.subtitle||"No subtitle")}</small></span>
          <span class="website-category-count">${category.songIds.length} song${category.songIds.length===1?"":"s"}</span>
        </summary>
        <div class="website-category-body">
          <div class="website-category-fields">
            <label>Title<input type="text" maxlength="24" data-category-field="label" data-category-id="${esc(category.id)}" value="${esc(category.label)}"></label>
            <label>Subtitle<input type="text" maxlength="40" data-category-field="subtitle" data-category-id="${esc(category.id)}" value="${esc(category.subtitle)}"></label>
            <label class="website-category-enabled"><input type="checkbox" data-category-field="enabled" data-category-id="${esc(category.id)}" ${category.enabled?"checked":""}> Show this card</label>
          </div>
          <div class="website-category-toolbar">
            <label>Find songs<input type="search" data-category-search="${esc(category.id)}" placeholder="Search title, artist or year…"></label>
            <div class="website-category-actions">
              <button type="button" data-category-select-all="${esc(category.id)}">Select shown</button>
              <button type="button" data-category-clear="${esc(category.id)}">Clear</button>
              <button type="button" data-category-up="${esc(category.id)}" ${index===0?"disabled":""}>↑</button>
              <button type="button" data-category-down="${esc(category.id)}" ${index===state.categories.length-1?"disabled":""}>↓</button>
              <button type="button" class="danger" data-category-delete="${esc(category.id)}">Delete</button>
            </div>
          </div>
          <div class="website-song-picker" data-category-song-list="${esc(category.id)}">
            ${renderSongPicker(category)}
          </div>
        </div>
      </details>
    `).join("") || '<p class="website-song-empty">No category cards. Add one to begin.</p>';

    const faqContainer=$("websiteFaqEditors");
    faqContainer.innerHTML=state.faqs.map((faq,index)=>`
      <article class="website-faq-editor" data-faq-editor="${esc(faq.id)}">
        <div class="website-faq-fields">
          <label>Question<input type="text" maxlength="120" data-faq-field="question" data-faq-id="${esc(faq.id)}" value="${esc(faq.question)}"></label>
          <label>Answer<textarea maxlength="800" rows="3" data-faq-field="answer" data-faq-id="${esc(faq.id)}">${esc(faq.answer)}</textarea></label>
        </div>
        <div class="website-faq-actions">
          <button type="button" data-faq-up="${esc(faq.id)}" ${index===0?"disabled":""}>↑ Move up</button>
          <button type="button" data-faq-down="${esc(faq.id)}" ${index===state.faqs.length-1?"disabled":""}>↓ Move down</button>
          <button type="button" class="danger" data-faq-delete="${esc(faq.id)}">Delete</button>
        </div>
      </article>
    `).join("") || '<p class="website-song-empty">No FAQ items. Add a question to begin.</p>';
  }

  function updateSummary(category){
    const editor=document.querySelector(`[data-category-editor="${CSS.escape(category.id)}"]`);
    if(!editor)return;
    const title=editor.querySelector(".website-category-preview strong");
    const subtitle=editor.querySelector(".website-category-preview small");
    const count=editor.querySelector(".website-category-count");
    if(title)title.textContent=category.label||"UNTITLED";
    if(subtitle)subtitle.textContent=category.subtitle||"No subtitle";
    if(count)count.textContent=`${category.songIds.length} song${category.songIds.length===1?"":"s"}`;
  }

  function setStatus(message,error=false){
    const el=$("billyWebsiteSaveStatus");
    if(!el)return;
    el.textContent=message||"";
    el.classList.toggle("error",!!error);
  }

  async function load(){
    $("billyWebsiteSettingsStatus").textContent="Loading songs and website settings…";
    const [songSnap,settingsSnap]=await Promise.all([
      LK.db.collection("lyrics").get(),
      SETTINGS_DOC().get()
    ]);
    songs=songSnap.docs.map(doc=>({id:doc.id,...(doc.data()||{})}))
      .filter(song=>song.title&&song.publicSongListVisible!==false)
      .sort((a,b)=>String(a.title).localeCompare(String(b.title),undefined,{sensitivity:"base"}));
    state=normaliseSettings(settingsSnap.exists?(settingsSnap.data()||{}):{});
    loaded=true;
    render();
    $("billyWebsiteSettingsStatus").textContent=`${songs.length} songs loaded · settings ready.`;
  }

  async function save(){
    if(!loaded)return;
    if(!LK.auth.currentUser){
      setStatus("Sign in to Admin before saving.",true);
      return;
    }
    const button=$("saveBillyWebsiteSettingsBtn");
    button.disabled=true;
    setStatus("Saving…");
    try{
      const testModeEnabled=$("enableLiveRequestTestMode")?.checked===true;
      state.enableLiveRequestTestMode=testModeEnabled;
      state.requestTestSessionId=testModeEnabled
        ? (state.requestTestSessionId||`billylee-test-${Date.now()}`)
        : "";
      state.showCategoryCards=$("showCategoryCards").checked;
      state.showArtistSearchCard=$("showArtistSearchCard")?.checked!==false;
      state.categoryCardSize=Math.max(60,Math.min(120,Number($("categoryCardSize")?.value)||DEFAULT_CONTENT.categoryCardSize));
      state.instagramUrl=String($("websiteInstagramUrl")?.value||"").trim();
      state.facebookUrl=String($("websiteFacebookUrl")?.value||"").trim();
      state.aboutShort=String($("websiteAboutShort")?.value||"").trim();
      state.aboutDetailed=String($("websiteAboutDetailed")?.value||"").trim();
      await SETTINGS_DOC().set({
        enableLiveRequestTestMode:state.enableLiveRequestTestMode,
        requestTestSessionId:state.requestTestSessionId,
        showCategoryCards:state.showCategoryCards,
        showArtistSearchCard:state.showArtistSearchCard,
        categoryCardSize:state.categoryCardSize,
        instagramUrl:state.instagramUrl,
        facebookUrl:state.facebookUrl,
        aboutShort:state.aboutShort,
        aboutDetailed:state.aboutDetailed,
        categories:state.categories.map(category=>({
          id:category.id,
          label:category.label,
          subtitle:category.subtitle,
          enabled:category.enabled!==false,
          mode:"custom",
          rule:category.rule||"",
          songIds:Array.from(new Set(category.songIds||[]))
        })),
        faqs:state.faqs.map(faq=>({
          id:faq.id,
          question:String(faq.question||"").trim(),
          answer:String(faq.answer||"").trim()
        })).filter(faq=>faq.question&&faq.answer),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:LK.auth.currentUser.uid
      },{merge:true});
      setStatus("Website settings saved.");
    }catch(error){
      console.error(error);
      setStatus(error.message||"Could not save website settings.",true);
    }finally{
      button.disabled=false;
    }
  }

  function addCategory(){
    if(state.categories.length>=8){
      setStatus("A maximum of 8 category cards is supported.",true);
      return;
    }
    let n=state.categories.length+1;
    let id=`category-${n}`;
    while(categoryById(id)){n++;id=`category-${n}`;}
    state.categories.push({id,label:`CATEGORY ${n}`,subtitle:"Custom songs",enabled:true,mode:"custom",rule:"",songIds:[]});
    render();
    const editor=document.querySelector(`[data-category-editor="${CSS.escape(id)}"]`);
    if(editor){editor.open=true;editor.scrollIntoView({behavior:"smooth",block:"center"});}
  }

  function resetDefaults(){
    if(!confirm("Reset all Billy Lee website settings on this page to their defaults?"))return;
    state={
      enableLiveRequestTestMode:false,
      requestTestSessionId:"",
      showCategoryCards:true,
      showArtistSearchCard:true,
      categoryCardSize:DEFAULT_CONTENT.categoryCardSize,
      categories:DEFAULTS.map((item,index)=>normaliseCategory(item,index)),
      faqs:DEFAULT_FAQS.map((item,index)=>normaliseFaq(item,index)),
      instagramUrl:DEFAULT_CONTENT.instagramUrl,
      facebookUrl:DEFAULT_CONTENT.facebookUrl,
      aboutShort:DEFAULT_CONTENT.aboutShort,
      aboutDetailed:DEFAULT_CONTENT.aboutDetailed
    };
    render();
    setStatus("Defaults loaded. Press Save Website Settings to publish them.");
  }

  function faqById(id){
    return state.faqs.find(faq=>faq.id===id)||null;
  }

  function addFaq(){
    if(state.faqs.length>=20){
      setStatus("A maximum of 20 FAQ items is supported.",true);
      return;
    }
    let n=state.faqs.length+1;
    let id=`faq-${n}`;
    while(faqById(id)){n++;id=`faq-${n}`;}
    state.faqs.push({id,question:"New question",answer:"Answer goes here."});
    render();
    document.querySelector(`[data-faq-editor="${CSS.escape(id)}"] input`)?.focus();
  }

  function moveFaq(id,direction){
    const index=state.faqs.findIndex(faq=>faq.id===id);
    const target=index+direction;
    if(index<0||target<0||target>=state.faqs.length)return;
    [state.faqs[index],state.faqs[target]]=[state.faqs[target],state.faqs[index]];
    render();
  }

  function moveCategory(id,direction){
    const index=state.categories.findIndex(category=>category.id===id);
    const target=index+direction;
    if(index<0||target<0||target>=state.categories.length)return;
    [state.categories[index],state.categories[target]]=[state.categories[target],state.categories[index]];
    render();
  }

  document.addEventListener("input",event=>{
    const field=event.target.closest("[data-category-field]");
    if(field){
      const category=categoryById(field.dataset.categoryId);
      if(!category)return;
      if(field.dataset.categoryField==="label")category.label=field.value.slice(0,24);
      if(field.dataset.categoryField==="subtitle")category.subtitle=field.value.slice(0,40);
      updateSummary(category);
      return;
    }

    const faqField=event.target.closest("[data-faq-field]");
    if(faqField){
      const faq=faqById(faqField.dataset.faqId);
      if(!faq)return;
      if(faqField.dataset.faqField==="question")faq.question=faqField.value.slice(0,120);
      if(faqField.dataset.faqField==="answer")faq.answer=faqField.value.slice(0,800);
      return;
    }

    const search=event.target.closest("[data-category-search]");
    if(search){
      const category=categoryById(search.dataset.categorySearch);
      const list=document.querySelector(`[data-category-song-list="${CSS.escape(search.dataset.categorySearch)}"]`);
      if(category&&list)list.innerHTML=renderSongPicker(category,search.value);
    }
  });

  document.addEventListener("change",event=>{
    const field=event.target.closest("[data-category-field]");
    if(field&&field.dataset.categoryField==="enabled"){
      const category=categoryById(field.dataset.categoryId);
      if(category)category.enabled=field.checked;
      return;
    }
    const song=event.target.closest("[data-category-song]");
    if(song){
      const category=categoryById(song.dataset.categorySong);
      if(!category)return;
      const selected=new Set(category.songIds||[]);
      if(song.checked)selected.add(song.value);else selected.delete(song.value);
      category.songIds=[...selected];
      updateSummary(category);
    }
  });

  document.addEventListener("click",event=>{
    const faqUp=event.target.closest("[data-faq-up]");if(faqUp){moveFaq(faqUp.dataset.faqUp,-1);return;}
    const faqDown=event.target.closest("[data-faq-down]");if(faqDown){moveFaq(faqDown.dataset.faqDown,1);return;}
    const faqDelete=event.target.closest("[data-faq-delete]");
    if(faqDelete){
      const faq=faqById(faqDelete.dataset.faqDelete);
      if(faq&&confirm(`Delete the FAQ question "${faq.question}"?`)){
        state.faqs=state.faqs.filter(item=>item.id!==faq.id);
        render();
      }
      return;
    }

    const selectAll=event.target.closest("[data-category-select-all]");
    if(selectAll){
      const id=selectAll.dataset.categorySelectAll;
      const category=categoryById(id);
      const editor=document.querySelector(`[data-category-editor="${CSS.escape(id)}"]`);
      if(category&&editor){
        editor.querySelectorAll('[data-category-song]').forEach(input=>{input.checked=true;if(!category.songIds.includes(input.value))category.songIds.push(input.value);});
        updateSummary(category);
      }
      return;
    }
    const clear=event.target.closest("[data-category-clear]");
    if(clear){
      const category=categoryById(clear.dataset.categoryClear);
      if(category){category.songIds=[];const editor=clear.closest("[data-category-editor]");editor?.querySelectorAll('[data-category-song]').forEach(input=>input.checked=false);updateSummary(category);}
      return;
    }
    const up=event.target.closest("[data-category-up]");if(up){moveCategory(up.dataset.categoryUp,-1);return;}
    const down=event.target.closest("[data-category-down]");if(down){moveCategory(down.dataset.categoryDown,1);return;}
    const del=event.target.closest("[data-category-delete]");
    if(del){
      const category=categoryById(del.dataset.categoryDelete);
      if(category&&confirm(`Delete the "${category.label}" category card?`)){
        state.categories=state.categories.filter(item=>item.id!==category.id);
        render();
      }
    }
  });

  $("enableLiveRequestTestMode")?.addEventListener("change",()=>{
    state.enableLiveRequestTestMode=$("enableLiveRequestTestMode").checked===true;
    if(!state.enableLiveRequestTestMode)state.requestTestSessionId="";
    setStatus(state.enableLiveRequestTestMode
      ?"Test mode will be enabled when you save."
      :"Test mode will be disabled when you save.");
  });
  $("showCategoryCards").addEventListener("change",()=>{state.showCategoryCards=$("showCategoryCards").checked;});
  $("showArtistSearchCard")?.addEventListener("change",()=>{state.showArtistSearchCard=$("showArtistSearchCard").checked;});
  $("categoryCardSize").addEventListener("input",()=>{
    const value=Math.max(60,Math.min(120,Number($("categoryCardSize").value)||DEFAULT_CONTENT.categoryCardSize));
    state.categoryCardSize=value;
    $("categoryCardSizeValue").textContent=`${value} px`;
  });
  $("addWebsiteCategoryBtn").addEventListener("click",addCategory);
  $("addWebsiteFaqBtn").addEventListener("click",addFaq);
  $("resetWebsiteCategoriesBtn").addEventListener("click",resetDefaults);
  $("saveBillyWebsiteSettingsBtn").addEventListener("click",save);

  LK.auth.onAuthStateChanged(user=>{
    if(user){
      window.LK?.sidebar?.loadSidebar?.().catch?.(error=>console.warn("Could not load sidebar:",error));
      load().catch(error=>{
        console.error(error);
        $("billyWebsiteSettingsStatus").textContent=error.message||"Could not load website settings.";
      });
    }else{
      $("billyWebsiteSettingsStatus").innerHTML='Sign in through <a href="admin.html">Admin</a> to manage Billy Lee website settings.';
    }
  });
})();
