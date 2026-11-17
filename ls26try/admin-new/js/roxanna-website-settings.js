/* Owner-only settings for the standalone Roxanna website. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id),schema=window.ROXANNA_COPY_SCHEMA,db=LK.db;
  const ref=db.collection("karaokeControl").doc("roxannaWebsiteSettings");
  let page="home",values={home:{},epk:{}},original={home:{},epk:{}},lists=[],ready=false,authEpoch=0;
  const norm=v=>String(v||"").trim().toLowerCase();
  const owner=()=>typeof isOwner==="function"&&isOwner();
  const eligible=d=>norm(d.name)==="roxanna"&&[d.type,d.sessionType,d.performerType].filter(Boolean).every(x=>norm(x)==="roxanna");
  const clean=v=>v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x==="string")):{};
  const status=(message,error=false)=>{$("siteSettingsStatus").textContent=message;$("siteSettingsStatus").dataset.error=String(error);};
  const dirty=()=>JSON.stringify(values)!==JSON.stringify(original);
  function updateCount(){
    const selected=lists.find(row=>row.id===$("roxannaSetlist").value);
    $("roxannaSetlistInfo").textContent=selected?String(new Set(selected.songIds||[]).size)+" songs in the selected source list.":"Automatic selection uses the eligible live Roxanna list, otherwise the uniquely named Roxanna setlist.";
  }
  function render(){
    const needle=norm($("copySearch").value),root=$("copyFields"),groups=new Map();
    $("copyHomeTab").setAttribute("aria-pressed",String(page==="home"));$("copyEpkTab").setAttribute("aria-pressed",String(page==="epk"));
    root.replaceChildren();
    const entries=schema[page].filter(d=>!needle||norm(d.group+" "+d.default+" "+(values[page][d.key]||"")).includes(needle));
    $("copyFieldCount").textContent=entries.length+" editable fields · "+Object.keys(values[page]).filter(k=>values[page][k]).length+" customised"+(dirty()?" · Unsaved changes":"");
    for(const def of entries){
      let group=groups.get(def.group);
      if(!group){group=document.createElement("details");group.className="roxanna-copy-group";group.open=!!needle;const summary=document.createElement("summary");summary.textContent=def.group;group.append(summary);groups.set(def.group,group);root.append(group);}
      const row=document.createElement("div");row.className="roxanna-copy-field";
      const label=document.createElement("label");label.htmlFor="copy-"+def.key;label.textContent=def.kind==="dynamic"?def.key+" · "+def.default:def.default;
      const input=document.createElement(def.default.length>85?"textarea":"input");input.id=label.htmlFor;input.value=values[page][def.key]??def.default;input.maxLength=2000;
      if(input.tagName==="TEXTAREA")input.rows=Math.min(5,Math.max(2,Math.ceil(input.value.length/85)));
      const hint=document.createElement("small");hint.textContent="Default: "+def.default;
      const reset=document.createElement("button");reset.type="button";reset.textContent="Reset";reset.setAttribute("aria-label","Restore default: "+def.default);
      const targetPage=page;
      input.addEventListener("input",()=>{if(input.value.trim()&&input.value!==def.default)values[targetPage][def.key]=input.value;else delete values[targetPage][def.key];$("copyFieldCount").textContent=entries.length+" editable fields · "+(dirty()?"Unsaved changes":"All changes saved");});
      reset.addEventListener("click",()=>{delete values[targetPage][def.key];input.value=def.default;$("copyFieldCount").textContent=entries.length+" editable fields · "+(dirty()?"Unsaved changes":"All changes saved");});
      row.append(label,input,reset,hint);group.append(row);
    }
    if(!entries.length){const p=document.createElement("p");p.textContent="No matching fields.";root.append(p);}
  }
  $("copyHomeTab").onclick=()=>{page="home";render();};
  $("copyEpkTab").onclick=()=>{page="epk";render();};
  $("copySearch").oninput=render;
  $("roxannaSetlist").onchange=updateCount;
  $("resetPageCopy").onclick=()=>{if(!ready||!owner())return;if(confirm("Restore all wording on this page to the built-in defaults? Save afterwards to publish the change.")){values[page]={};render();}};
  $("repertoireForm").onsubmit=async e=>{
    e.preventDefault();if(!ready||!owner())return;
    const id=$("roxannaSetlist").value,selected=lists.find(row=>row.id===id);
    if(id&&!selected){status("Choose an eligible Roxanna setlist.",true);return;}
    const button=$("saveRoxannaSetlist");button.disabled=true;
    try{await ref.set({defaultBrowseSetlistId:id,repertoireSetlistId:id},{merge:true});status("Default Roxanna repertoire saved. Reopen the request popup to load it.");}catch(error){status(error.message,true);}finally{button.disabled=false;}
  };
  $("copyForm").onsubmit=async e=>{
    e.preventDefault();if(!ready||!owner())return;
    const button=$("saveWebsiteCopy");button.disabled=true;
    try{
      const previous=original,edits=JSON.parse(JSON.stringify(values));
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data()?.websiteCopy||{};
        const next={home:clean(current.home),epk:clean(current.epk)};
        for(const p of ["home","epk"]){
          for(const def of schema[p]){
            const before=previous[p][def.key],after=edits[p][def.key];
            if(before===after)continue;
            if(typeof after==="string"&&after.trim())next[p][def.key]=after.slice(0,2000);else delete next[p][def.key];
          }
        }
        tx.set(ref,{websiteCopy:next},{mergeFields:["websiteCopy"]});
      });
      original=JSON.parse(JSON.stringify(edits));status("Website wording saved. The public homepage and EPK will use the new text.");render();
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  };
  LK.auth.onAuthStateChanged(async user=>{
    const epoch=++authEpoch;ready=false;$("roxannaSettings").hidden=true;
    if(!user||!owner()){status("Sign in as the owner through the LiveSuite Admin dashboard to edit public website settings.");return;}
    try{
      const [all,settings]=await Promise.all([db.collection("lyricsSetlists").get(),ref.get({source:"server"})]);
      if(epoch!==authEpoch||!owner())return;
      lists=all.docs.map(d=>({...d.data(),id:d.id})).filter(eligible).sort((a,b)=>String(a.name).localeCompare(String(b.name))||a.id.localeCompare(b.id));
      const cfg=settings.data()||{},select=$("roxannaSetlist");
      select.replaceChildren(new Option("Automatic (current or uniquely named Roxanna list)",""));
      select.required=false;
      for(const list of lists)select.append(new Option((list.name||list.id)+" · "+new Set(list.songIds||[]).size+" songs"+(lists.length>1?" · "+list.id:""),list.id));
      const selected=cfg.defaultBrowseSetlistId||cfg.repertoireSetlistId||"";
      select.value=selected&&lists.some(l=>l.id===selected)?selected:"";
      values={home:clean(cfg.websiteCopy?.home),epk:clean(cfg.websiteCopy?.epk)};original=JSON.parse(JSON.stringify(values));
      updateCount();render();ready=true;$("roxannaSettings").hidden=false;
      status(selected&&!lists.some(l=>l.id===selected)?"The previous repertoire selection is no longer eligible. Select a Roxanna list and save.":"Website settings loaded.",!!selected&&!lists.some(l=>l.id===selected));
    }catch(error){status("Could not load website settings: "+error.message,true);}
  });
})();
