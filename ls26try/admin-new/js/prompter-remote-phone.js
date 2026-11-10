/* The phone controller uses the LyricView remote itself, not a second
   Firestore command sender. Auth and menu handling are local to this page. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const remoteToggle=$("ls26ShowPrompterRemote");
  const login=$("phoneRemoteLogin");
  const controller=$("phoneRemoteController");
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