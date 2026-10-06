(() => {
  "use strict";

  function makeLink(base,{file,key,label,icon}){
    const link=document.createElement("a");
    link.href=new URL(file,base).href;
    link.dataset.sidebarNav=key;
    link.innerHTML=`<span class="suite-nav-icon"><svg aria-hidden="true"><use href="#${icon}"></use></svg></span><span class="suite-nav-label">${label}</span><span class="suite-nav-chevron">›</span>`;
    if((location.pathname.split("/").pop()||"").toLowerCase()===file.toLowerCase())link.classList.add("active");
    return link;
  }

  function addLiveKaraokeAdminLinks(){
    const nav=document.getElementById("sidebarBrandLiveKaraoke");
    if(!nav)return;

    nav.querySelectorAll('[data-sidebar-nav="live-karaoke-reviews"],[data-sidebar-nav="live-karaoke-website-settings"]').forEach(node=>node.remove());

    const base=window.__ls26SidebarAdminBase||new URL("./",location.href).href;
    const website=[...nav.querySelectorAll("a")].find(a=>a.querySelector(".suite-nav-label")?.textContent.trim().toLowerCase()==="website");
    if(!website)return;

    const reviews=makeLink(base,{file:"live-karaoke-reviews.html",key:"live-karaoke-reviews",label:"Live Karaoke Reviews",icon:"lsi-message"});
    const settings=makeLink(base,{file:"live-karaoke-website-settings.html",key:"live-karaoke-website-settings",label:"Website Settings",icon:"lsi-settings"});

    website.insertAdjacentElement("afterend",reviews);
    reviews.insertAdjacentElement("afterend",settings);
  }

  window.addEventListener("ls26:sidebar-ready",addLiveKaraokeAdminLinks);
  if(document.getElementById("sidebarBrandLiveKaraoke"))addLiveKaraokeAdminLinks();
})();
