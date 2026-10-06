(() => {
  "use strict";

  function makeLink(base,{file,key,label,icon,target,disabled=false}){
    const link=document.createElement(disabled?"span":"a");
    if(!disabled){
      link.href=/^https?:/i.test(file)?file:new URL(file,base).href;
      if(key)link.dataset.sidebarNav=key;
      if(target){link.target=target;link.rel="noopener";}
    }else{
      link.className="lk-sidebar-disabled";
      link.setAttribute("aria-disabled","true");
    }
    link.innerHTML=`<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#${icon}"></use></svg></span><span class="suite-nav-label">${label}</span><span class="suite-nav-chevron">${target?"↗":"›"}</span>`;
    const current=(location.pathname.split("/").pop()||"").toLowerCase();
    if(!disabled&&file&&!/^https?:/i.test(file)&&current===file.toLowerCase())link.classList.add("active");
    return link;
  }

  function ensureStyles(){
    if(document.getElementById("lkSidebarNestedStyles"))return;
    const style=document.createElement("style");
    style.id="lkSidebarNestedStyles";
    style.textContent=`
      .suite-sidebar .suite-nav-section-title,
      .suite-sidebar .suite-collapsible-heading{
        text-transform:none!important;
      }
      .suite-sidebar .lk-sidebar-group{display:block}
      .suite-sidebar .lk-sidebar-group-toggle{display:grid!important;grid-template-columns:26px minmax(0,1fr) auto!important;width:100%;border:0;background:transparent;color:inherit;text-align:left}
      .suite-sidebar .lk-sidebar-group-toggle .suite-nav-chevron{transition:transform .16s ease}
      .suite-sidebar .lk-sidebar-group-toggle[aria-expanded="true"] .suite-nav-chevron{transform:rotate(90deg)}
      .suite-sidebar .lk-sidebar-group-panel{margin-left:18px;padding-left:8px;border-left:1px solid rgba(127,153,170,.22)}
      .suite-sidebar .lk-sidebar-group-panel[hidden]{display:none!important}
      .suite-sidebar .lk-sidebar-group-panel a,
      .suite-sidebar .lk-sidebar-group-panel .lk-sidebar-disabled{min-height:34px;font-size:.92em}
      .suite-sidebar .lk-sidebar-disabled{display:grid!important;grid-template-columns:26px minmax(0,1fr) auto!important;align-items:center;opacity:.5;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function makeGroup({id,label,icon,open=false,children=[]}){
    const wrap=document.createElement("div");
    wrap.className="lk-sidebar-group";
    wrap.dataset.lkSidebarGroup=id;

    const button=document.createElement("button");
    button.type="button";
    button.className="lk-sidebar-group-toggle";
    button.setAttribute("aria-expanded",String(open));
    button.innerHTML=`<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#${icon}"></use></svg></span><span class="suite-nav-label">${label}</span><span class="suite-nav-chevron">›</span>`;

    const panel=document.createElement("div");
    panel.className="lk-sidebar-group-panel";
    panel.hidden=!open;
    children.forEach(child=>panel.appendChild(child));

    button.addEventListener("click",()=>{
      const next=button.getAttribute("aria-expanded")!=="true";
      button.setAttribute("aria-expanded",String(next));
      panel.hidden=!next;
    });

    wrap.append(button,panel);
    return wrap;
  }

  function setBrandOpen(section,open){
    if(!section)return;
    const button=section.querySelector(":scope > [data-sidebar-brand-toggle]");
    const panel=section.querySelector(":scope > .suite-collapsible-panel");
    const chevron=button?.querySelector(".suite-section-chevron");
    if(button){
      button.setAttribute("aria-expanded",String(open));
      button.classList.toggle("is-open",open);
    }
    if(panel)panel.hidden=!open;
    if(chevron)chevron.textContent=open?"▾":"›";
  }

  function normaliseSidebarLabels(root){
    const replacements=[
      [".live-title > span:first-child","Live overview"],
      [".records-title","Bookings & records"],
      [".tools-title","Tools"],
      [".music-title","Music"],
      [".system-title","System"]
    ];
    replacements.forEach(([selector,label])=>{
      const node=root.querySelector(selector);
      if(node)node.textContent=label;
    });
    const liveBadge=root.querySelector("#sidebarLiveNowBadge");
    if(liveBadge)liveBadge.textContent="● Live now";

    const brandLabels={"live-karaoke":"Live Karaoke","billy-lee":"Billy Lee",roxanna:"Roxanna"};
    Object.entries(brandLabels).forEach(([key,label])=>{
      const button=root.querySelector(`[data-sidebar-brand-toggle="${key}"]`);
      const text=button?.querySelector("span:first-child");
      if(text)text.textContent=label;
    });
  }

  function buildLiveKaraokeNav(base,current){
    const nav=document.getElementById("sidebarBrandLiveKaraoke");
    if(!nav)return;

    nav.querySelectorAll('.lk-sidebar-group,[data-sidebar-nav="live-karaoke-reviews"],[data-sidebar-nav="live-karaoke-website-settings"],[data-sidebar-nav="prompter-settings"]').forEach(node=>node.remove());

    const existing=[...nav.children];
    const lyric=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="lyric prompter");
    const website=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website");
    const venue=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="venue display");
    const facebook=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="facebook");
    const instagram=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="instagram");

    lyric?.remove();
    website?.remove();

    const prompterOpen=current==="prompter-settings.html";
    const websiteOpen=["live-karaoke-reviews.html","live-karaoke-website-settings.html"].includes(current);

    const prompterGroup=makeGroup({id:"live-karaoke-prompter",label:"Prompter",icon:"lsi-mic",open:prompterOpen,children:[
      makeLink(base,{file:"../oldadmin/host/venuekaraokelyricbook.html",label:"Open Prompter",icon:"lsi-monitor",target:"_blank"}),
      makeLink(base,{file:"prompter-settings.html",key:"prompter-settings",label:"Settings",icon:"lsi-settings"})
    ]});

    const websiteGroup=makeGroup({id:"live-karaoke-website",label:"Website",icon:"lsi-globe",open:websiteOpen,children:[
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

  function buildBillyLeeNav(base,current){
    const nav=document.getElementById("sidebarBrandBillyLee");
    if(!nav)return;

    nav.querySelectorAll('.lk-sidebar-group').forEach(node=>node.remove());
    const settings=[...nav.querySelectorAll("a")].find(a=>a.dataset.sidebarNav==="billy-website-settings"||a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website settings");
    const website=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website");
    settings?.remove();
    website?.remove();

    const websiteGroup=makeGroup({id:"billy-lee-website",label:"Website",icon:"lsi-globe",open:current==="billy-website-settings.html",children:[
      makeLink(base,{file:"https://livekaraoke.github.io/online/billylee26/",label:"Open",icon:"lsi-globe",target:"_blank"}),
      makeLink(base,{file:"billy-website-settings.html",key:"billy-website-settings",label:"Settings",icon:"lsi-settings"})
    ]});
    nav.appendChild(websiteGroup);
  }

  function buildRoxannaNav(base,current){
    const nav=document.getElementById("sidebarBrandRoxanna");
    if(!nav)return;

    nav.querySelectorAll('.lk-sidebar-group').forEach(node=>node.remove());
    const website=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website");
    website?.remove();

    const websiteGroup=makeGroup({id:"roxanna-website",label:"Website",icon:"lsi-globe",open:current==="roxanna-website-settings.html",children:[
      makeLink(base,{file:"https://livekaraoke.github.io/online/roxanna/",label:"Open",icon:"lsi-globe",target:"_blank"}),
      makeLink(base,{file:"roxanna-website-settings.html",key:"roxanna-website-settings",label:"Settings",icon:"lsi-settings"})
    ]});
    nav.appendChild(websiteGroup);
  }

  function initialiseBrandState(root,current){
    root.querySelectorAll("[data-sidebar-brand]").forEach(section=>setBrandOpen(section,false));

    const currentBrand=
      ["prompter-settings.html","live-karaoke-reviews.html","live-karaoke-website-settings.html"].includes(current)?"live-karaoke":
      current==="billy-website-settings.html"?"billy-lee":
      current==="roxanna-website-settings.html"?"roxanna":"";

    if(currentBrand){
      setBrandOpen(root.querySelector(`[data-sidebar-brand="${currentBrand}"]`),true);
    }
  }

  function rebuildSidebar(){
    const root=document.getElementById("sidebarContainer");
    if(!root)return;
    ensureStyles();
    normaliseSidebarLabels(root);

    const base=window.__ls26SidebarAdminBase||new URL("./",location.href).href;
    const current=(location.pathname.split("/").pop()||"").toLowerCase();
    buildLiveKaraokeNav(base,current);
    buildBillyLeeNav(base,current);
    buildRoxannaNav(base,current);
    initialiseBrandState(root,current);
  }

  // Override the legacy single-open accordion behaviour. Each brand section now
  // toggles independently, so opening one never closes another.
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-sidebar-brand-toggle]");
    if(!button)return;
    const section=button.closest("[data-sidebar-brand]");
    if(!section)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setBrandOpen(section,button.getAttribute("aria-expanded")!=="true");
  },true);

  window.addEventListener("ls26:sidebar-ready",rebuildSidebar);
  if(document.getElementById("sidebarContainer")?.children.length)rebuildSidebar();
})();
