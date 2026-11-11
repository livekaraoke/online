(() => {
  "use strict";

  const FAVOURITES_KEY = "billylee26.favouriteSongIds.v1";
  const style = document.createElement("style");
  style.id = "billy-request-ui-extras-style";
  style.textContent = `/* BillyLee26 request-song card refinements. Loaded after style.css. */
.request-browser .request-category-grid{
  display:flex!important;
  flex-wrap:nowrap!important;
  align-items:stretch!important;
  justify-content:flex-start!important;
  gap:7px!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  max-width:100%!important;
  padding:1px 1px 5px!important;
  scrollbar-width:thin;
  overscroll-behavior-inline:contain;
}
.request-browser .request-category-grid > button:not(.artist-search-card){
  flex:0 0 var(--request-category-size,82px)!important;
  width:var(--request-category-size,82px)!important;
  min-width:var(--request-category-size,82px)!important;
  height:82px!important;
  min-height:82px!important;
  aspect-ratio:auto!important;
}
.request-browser .request-category-grid > button span{
  white-space:nowrap!important;
}
.request-browser .request-category-grid .artist-search-card{
  flex:0 0 calc((var(--request-category-size,82px) * 2) + 7px)!important;
  width:calc((var(--request-category-size,82px) * 2) + 7px)!important;
  min-width:calc((var(--request-category-size,82px) * 2) + 7px)!important;
  height:82px!important;
  min-height:82px!important;
  aspect-ratio:auto!important;
  grid-column:auto!important;
}
.request-browser .request-category-grid .artist-search-card strong{
  white-space:normal!important;
}
.request-category-grid .request-favs-card{
  border-color:rgba(203,126,244,.55)!important;
  background:linear-gradient(160deg,rgba(64,26,78,.9),rgba(13,20,30,.96))!important;
}
.request-category-grid .request-favs-card strong{
  color:#f2d8ff!important;
}
.request-category-grid .request-favs-card.active{
  border-color:#dd8cff!important;
  background:linear-gradient(160deg,#542365,#16212d)!important;
  box-shadow:0 0 20px rgba(213,119,255,.18)!important;
}
#songResults [data-favs-filtered-hidden],
#requestAlphabetRow [data-favs-alpha-hidden]{
  display:none!important;
}
.request-favs-empty{
  min-height:110px;
  display:grid;
  place-items:center;
  padding:20px!important;
}
@media(max-width:620px){
  .request-browser .request-category-grid > button:not(.artist-search-card),
  .request-browser .request-category-grid .artist-search-card{
    height:78px!important;
    min-height:78px!important;
  }
  .request-browser .request-category-grid .artist-search-card{
    flex-basis:calc((var(--request-category-size,78px) * 2) + 7px)!important;
    width:calc((var(--request-category-size,78px) * 2) + 7px)!important;
    min-width:calc((var(--request-category-size,78px) * 2) + 7px)!important;
  }
}
`;
  document.head.appendChild(style);

  let favouritesMode = false;
  let applying = false;
  let resettingForFavourites = false;

  function favouriteIds(){
    try{
      const parsed = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    }catch{
      return new Set();
    }
  }

  function grid(){ return document.getElementById("requestCategoryGrid"); }
  function results(){ return document.getElementById("songResults"); }

  function ensureFavouritesCard(){
    const host = grid();
    if(!host || host.hidden) return;
    let button = host.querySelector("[data-favourites-category]");
    if(!button){
      button = document.createElement("button");
      button.type = "button";
      button.className = "request-favs-card";
      button.dataset.favouritesCategory = "1";
      button.innerHTML = "<strong>FAVS</strong><span>Favourites</span>";
      button.setAttribute("aria-label", "Show favourite songs");
    }
    button.classList.toggle("active", favouritesMode);
    const artist = host.querySelector(".artist-search-card");
    if(artist){
      if(button.nextElementSibling !== artist) host.insertBefore(button, artist);
    }else if(button.parentElement !== host || button !== host.lastElementChild){
      host.appendChild(button);
    }
  }

  function clearFilteredRows(){
    document.querySelectorAll("#songResults [data-favs-filtered-hidden]").forEach(row => row.removeAttribute("data-favs-filtered-hidden"));
    document.getElementById("requestFavsEmpty")?.remove();
    document.querySelectorAll("#requestAlphabetRow [data-favs-alpha-hidden]").forEach(button => {
      button.removeAttribute("data-favs-alpha-hidden");
      button.hidden = false;
    });
  }

  function applyFavouritesFilter(){
    if(!favouritesMode || applying) return;
    const list = results();
    if(!list) return;
    applying = true;
    try{
      const ids = favouriteIds();
      const rows = [...list.querySelectorAll(".song-row[data-song-row-id]")];
      let visible = 0;
      const letters = new Set();
      rows.forEach(row => {
        const show = ids.has(String(row.dataset.songRowId || ""));
        if(show){
          row.removeAttribute("data-favs-filtered-hidden");
          visible += 1;
          const alpha = String(row.dataset.alpha || "").toUpperCase();
          if(alpha) letters.add(alpha);
        }else{
          row.setAttribute("data-favs-filtered-hidden", "1");
        }
      });

      let empty = document.getElementById("requestFavsEmpty");
      if(!visible){
        if(!empty){
          empty = document.createElement("div");
          empty.id = "requestFavsEmpty";
          empty.className = "empty-box request-favs-empty";
          list.appendChild(empty);
        }
        empty.textContent = ids.size ? "No favourite songs match your search." : "No favourite songs yet. Tap ♡ beside a song to add it here.";
      }else{
        empty?.remove();
      }

      document.querySelectorAll("#requestAlphabetRow [data-alpha-jump]").forEach(button => {
        const letter = String(button.dataset.alphaJump || "").toUpperCase();
        const hide = !letters.has(letter);
        button.toggleAttribute("data-favs-alpha-hidden", hide);
        button.hidden = hide;
      });

      const clear = document.getElementById("clearSongCategoryBtn");
      if(clear) clear.hidden = false;
      const notice = document.getElementById("requestNotice");
      if(notice) notice.textContent = visible === 1 ? "1 favourite song." : `${visible} favourite songs.`;
      ensureFavouritesCard();
    }finally{
      applying = false;
    }
  }

  function deactivateFavourites({refreshNotice = false} = {}){
    if(!favouritesMode) return;
    favouritesMode = false;
    clearFilteredRows();
    ensureFavouritesCard();
    if(refreshNotice){
      const clear = document.getElementById("clearSongCategoryBtn");
      if(clear) clear.click();
    }
  }

  function activateFavourites(){
    favouritesMode = true;
    const clear = document.getElementById("clearSongCategoryBtn");
    if(clear){
      resettingForFavourites = true;
      clear.click();
      resettingForFavourites = false;
    }
    queueMicrotask(() => {
      ensureFavouritesCard();
      applyFavouritesFilter();
    });
  }

  document.addEventListener("click", event => {
    const favCard = event.target.closest?.("[data-favourites-category]");
    if(favCard){
      event.preventDefault();
      if(favouritesMode) deactivateFavourites({refreshNotice:true});
      else activateFavourites();
      return;
    }

    if(event.target.closest?.("[data-song-category]")){
      deactivateFavourites();
      return;
    }

    if(event.target.closest?.("#clearSongCategoryBtn")){
      if(!resettingForFavourites) deactivateFavourites();
      return;
    }

    if(event.target.closest?.("[data-toggle-favourite]")){
      setTimeout(() => {
        ensureFavouritesCard();
        if(favouritesMode) applyFavouritesFilter();
      }, 0);
    }
  });

  document.getElementById("requestDialog")?.addEventListener("close", () => {
    favouritesMode = false;
    clearFilteredRows();
  });

  const categoryGrid = grid();
  if(categoryGrid){
    new MutationObserver(() => ensureFavouritesCard()).observe(categoryGrid, {childList:true});
    ensureFavouritesCard();
  }

  const songResults = results();
  if(songResults){
    new MutationObserver(() => {
      if(favouritesMode) queueMicrotask(applyFavouritesFilter);
    }).observe(songResults, {childList:true});
  }
})();
