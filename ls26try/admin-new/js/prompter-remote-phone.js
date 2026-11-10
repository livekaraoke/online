/* The phone controller uses the LyricView remote itself, not a second
   Firestore command sender. Auth and menu handling are local to this page. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const remoteToggle=$("ls26ShowPrompterRemote");
  const login=$("phoneRemoteLogin");
  const controller=$("phoneRemoteController");
  const stages={
    idle:"Waiting for next singer",waiting:"Ready to start",
    running:"Song in progress",instrumental:"Instrumental / Hold",
    ended:"Song ended"
  };
  const displaySong=detail=>{
    const id=String(detail?.songId||"").trim();
    const title=$("phoneRemoteSongTitle"),artist=$("phoneRemoteSongArtist");
    if(title)title.textContent=id?String(detail.title||id):"No song loaded";
    if(artist)artist.textContent=id
      ?[detail.artist,detail.year].map(v=>String(v||"").trim()).filter(Boolean).join(" · ")||"Loaded on singer Prompter"
      :"Send lyrics from LyricView to prepare the singer screen.";
  };
  const displayState=detail=>{
    const target=$("phoneRemoteSongStage");
    if(!target)return;
    const mode=stages[detail?.mode]||"Waiting for singer";
    target.textContent=mode+(detail?.mode==="running"&&detail.playing?" · Scrolling":"");
  };
  window.addEventListener("ls26:prompter-remote-song",event=>displaySong(event.detail));
  window.addEventListener("ls26:prompter-remote-state",event=>displayState(event.detail));
  displaySong(window.LS26PrompterRemoteCurrentSong);
  displayState(window.LS26PrompterRemoteCurrentState);
  const menu=$("phoneMenuToggle");
  const backdrop=$("phoneMenuBackdrop");
  function showMenu(open){
    const active=Boolean(open);
    document.body.classList.toggle("phone-remote-menu-open",active);
    if(menu)menu.setAttribute("aria-expanded",String(active));
    if(backdrop)backdrop.hidden=!active;
  }
  menu?.addEventListener("click",()=>showMenu(!document.body.classList.contains("phone-remote-menu-open")));
  backdrop?.addEventListener("click",()=>showMenu(false));
  document.addEventListener("keydown",event=>{if(event.key==="Escape")showMenu(false);});

  document.addEventListener("DOMContentLoaded",()=>{
    window.LK?.sidebar?.loadSidebar?.();
  },{once:true});

  const setRemoteVisible=visible=>{
    if(remoteToggle)remoteToggle.checked=visible;
    // This is the exact visibility contract consumed by LyricView's remote.
    window.dispatchEvent(new CustomEvent("ls26:prompter-remote-visibility",{detail:{visible}}));
  };
  function applyAuth(user){
    const owner=Boolean(user && window.isOwner?.());
    if(login){
      login.hidden=owner;
      if(!owner)login.textContent=user
        ?"Prompter controls require the LiveSuite owner account. Sign in with your Admin account."
        :"Sign in to LiveSuite Admin to use this remote. No commands can be sent while signed out.";
    }
    if(controller)controller.hidden=!owner;
    setRemoteVisible(owner);
  }
  if(!window.LK?.auth?.onAuthStateChanged){
    if(login)login.textContent="Firebase is unavailable. Check your connection before using the Prompter Remote.";
    applyAuth(null);
    return;
  }
  // Firestore karaokeControl/liveLyrics writes are owner-only under current rules.
  window.LK.auth.onAuthStateChanged(applyAuth,error=>{
    console.warn("Prompter Remote authentication unavailable:",error);
    if(login)login.textContent="Could not verify your LiveSuite sign-in. Open Admin and sign in again.";
    setRemoteVisible(false);
  });
})();