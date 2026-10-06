(() => {
  "use strict";

  const OPEN_KEY="ls26:live-karaoke-sidebar-open";

  function makeLink(base,{file,key,label,icon,target}){
    const link=document.createElement("a");
    link.href=/^https?:/i.test(file)?file:new URL(file,base).href;
    if(key)link.dataset.sidebarNav=key;
    if(target){link.target=target;link.rel="noopener";}
    link.innerHTML=`<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#${icon}"></use></svg></span><span class="suite-nav-label">${label}</span><span class="suite-nav-chevron">${target?"↗":"›"}</span>`;
    const current=(location.pathname.split("/").pop()||"").toLowerCase();
    if(file&&!/^https?:/i.test(file)&&current===file.toLowerCase())link.classList.add("active");
    return link;
  }

  function savedOpen(){
    try{return JSON.parse(localStorage.getItem(OPEN_KEY)||"{}");}catch(_){return{};}
  }
  function saveOpen(state){try{localStorage.setItem(OPEN_KEY,JSON.stringify(state));}catch(_){}}

  function ensureStyles(){
    if(document.getElementById("lkSidebarNestedStyles"))return;
    const style=document.createElement("style");style.id="lkSidebarNestedStyles";
    style.textContent=`
      #sidebarBrandLiveKaraoke .lk-sidebar-group{display:block}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-toggle{display:grid!important;grid-template-columns:26px minmax(0,1fr) auto!important;width:100%;border:0;background:transparent;color:inherit;text-align:left}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-toggle .suite-nav-chevron{transition:transform .16s ease}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-toggle[aria-expanded="true"] .suite-nav-chevron{transform:rotate(90deg)}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-panel{margin-left:18px;padding-left:8px;border-left:1px solid rgba(127,153,170,.22)}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-panel[hidden]{display:none!important}
      #sidebarBrandLiveKaraoke .lk-sidebar-group-panel a{min-height:34px;font-size:.92em}
    `;
    document.head.appendChild(style);
  }

  function makeGroup({id,label,icon,open=false,children=[]}){
    const wrap=document.createElement("div");wrap.className="lk-sidebar-group";wrap.dataset.lkSidebarGroup=id;
    const button=document.createElement("button");button.type="button";button.className="lk-sidebar-group-toggle";button.setAttribute("aria-expanded",String(open));
    button.innerHTML=`<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#${icon}"></use></svg></span><span class="suite-nav-label">${label}</span><span class="suite-nav-chevron">›</span>`;
    const panel=document.createElement("div");panel.className="lk-sidebar-group-panel";panel.hidden=!open;children.forEach(child=>panel.appendChild(child));
    button.addEventListener("click",()=>{
      const next=button.getAttribute("aria-expanded")!=="true";button.setAttribute("aria-expanded",String(next));panel.hidden=!next;
      const state=savedOpen();state[id]=next;saveOpen(state);
    });
    wrap.append(button,panel);return wrap;
  }

  function addLiveKaraokeAdminLinks(){
    const nav=document.getElementById("sidebarBrandLiveKaraoke");
    if(!nav)return;
    ensureStyles();

    nav.querySelectorAll('.lk-sidebar-group,[data-sidebar-nav="live-karaoke-reviews"],[data-sidebar-nav="live-karaoke-website-settings"],[data-sidebar-nav="prompter-settings"]').forEach(node=>node.remove());

    const base=window.__ls26SidebarAdminBase||new URL("./",location.href).href;
    const current=(location.pathname.split("/").pop()||"").toLowerCase();
    const existing=[...nav.children];
    const lyric=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="lyric prompter");
    const website=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website");
    const venue=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="venue display");
    const facebook=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="facebook");
    const instagram=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="instagram");

    lyric?.remove();website?.remove();

    const open=savedOpen();
    const prompterOpen=Boolean(open.prompter)||current==="prompter-settings.html";
    const websiteOpen=Boolean(open.website)||["live-karaoke-reviews.html","live-karaoke-website-settings.html"].includes(current);

    const prompterGroup=makeGroup({id:"prompter",label:"Prompter",icon:"lsi-mic",open:prompterOpen,children:[
      makeLink(base,{file:"../oldadmin/host/venuekaraokelyricbook.html",label:"Open Prompter",icon:"lsi-monitor",target:"_blank"}),
      makeLink(base,{file:"prompter-settings.html",key:"prompter-settings",label:"Settings",icon:"lsi-settings"})
    ]});

    const websiteGroup=makeGroup({id:"website",label:"Website",icon:"lsi-globe",open:websiteOpen,children:[
      makeLink(base,{file:"https://livekaraoke.github.io/online/",label:"Open",icon:"lsi-globe",target:"_blank"}),
      makeLink(base,{file:"live-karaoke-reviews.html",key:"live-karaoke-reviews",label:"Reviews",icon:"lsi-message"}),
      makeLink(base,{file:"live-karaoke-website-settings.html",key:"live-karaoke-website-settings",label:"Settings",icon:"lsi-settings"})
    ]});

    nav.replaceChildren(prompterGroup);
    if(venue)nav.appendChild(venue);
    if(facebook)nav.appendChild(facebook);
    if(instagram)nav.appendChild(instagram);
    nav.appendChild(websiteGroup);

    existing.forEach(node=>{
      if(node.isConnected||node===lyric||node===website||node===venue||node===facebook||node===instagram)return;
      nav.appendChild(node);
    });
  }

  window.addEventListener("ls26:sidebar-ready",addLiveKaraokeAdminLinks);
  if(document.getElementById("sidebarBrandLiveKaraoke"))addLiveKaraokeAdminLinks();
})();
