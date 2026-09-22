/* Copyright © 2026 LiveSuite. All rights reserved.
 * Shared navigation, theme manifest, mode routing, accessible Song Inbox popup.
 * Popup DOM never navigates or scrolls the lyric page.
 */
(() => {
  'use strict';
  const root=new URL('../',document.currentScript.src);
  const url=path=>new URL(path,root).href;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  function toast(message){let el=$('ls26Toast');if(!el){el=document.createElement('div');el.id='ls26Toast';el.className='ls26-toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=message;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,5000);}
  const currentId=params.get('id')||params.get('firebaseId');
  if(location.pathname.endsWith('/lyricview.html')&&currentId) sessionStorage.setItem('ls26:lastSong',location.href);
  window.LS26={url,escape,toast,themes:{blue:{label:'Blue',logo:url('assets/livesuite-logo-hd.jpg')}},openInbox:()=>openInbox()};
  // Call synchronously from the initiating tap, before playback's async work.
  const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  async function enterFullscreen(){
    if(fullscreenElement())return;
    const element=document.documentElement;
    const request=element.requestFullscreen||element.webkitRequestFullscreen;
    if(!request){toast('Fullscreen is not supported in this browser.');return;}
    try{await request.call(element);}catch(error){toast('Fullscreen could not start. Try the fullscreen button.');}
  }
  window.LS26.enterFullscreen=enterFullscreen;
  function mountFullscreen(){
    const button=$('ls26Fullscreen');
    const supported=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);
    button.disabled=!supported;
    function sync(){
      const active=!!fullscreenElement();
      const label=!supported?'Fullscreen is not supported in this browser':active?'Exit fullscreen':'Enter fullscreen';
      button.setAttribute('aria-label',label);button.title=label;
      button.setAttribute('aria-pressed',String(active));
      button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${active?'M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3':'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5'}"/></svg>`;
    }
    button.onclick=async()=>{
      if(!fullscreenElement()){await enterFullscreen();return;}
      try{await (document.exitFullscreen||document.webkitExitFullscreen).call(document);}
      catch(error){toast('Use your browser controls to exit fullscreen.');}
    };
    document.addEventListener('fullscreenchange',sync);
    document.addEventListener('webkitfullscreenchange',sync);
    sync();
  }
  function mount(){
    if(document.body.dataset.ls26Mounted)return;document.body.dataset.ls26Mounted='true';
    const isLyric=location.pathname.endsWith('/lyricview.html');
    const isLibrary=location.pathname.endsWith('/lyricsviewer.html')||location.pathname.endsWith('/library.html');
    const tab=location.pathname.endsWith('/setlist-editor.html')?'Setlists':isLibrary?'Library':isLyric?'LyricView':location.pathname.endsWith('/requests.html')?'Requests':'';
    const nav=document.createElement('nav');nav.className='ls26-nav';nav.setAttribute('aria-label','LiveSuite navigation');
    nav.innerHTML=`<a class="ls26-brand" href="${url('library.html')}" aria-label="LiveSuite Library"><img src="${url('assets/livesuite-logo-hd.jpg')}" alt="" width="1536" height="512"></a>${[['Library','library.html','♫'],['LyricView','host/lyricview.html','▣'],['Setlists','host/setlist-editor.html','☷'],['Requests','requests.html','♟']].map(([label,path,icon])=>`<a ${label==='LyricView'?'id="ls26LyricLink"':''} class="${label===tab?'active':''}" href="${url(path)}"><span class="ls26-nav-icon" aria-hidden="true">${icon}</span>${label}</a>`).join('')}<a href="${url('admin-new/admin.html')}" aria-label="Admin dashboard">⚙</a><button id="ls26Fullscreen" type="button" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen">⛶</button><a class="ls26-host" href="${url('admin-new/admin.html')}"><span class="ls26-user-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="6"/><path d="M5 29v-4a11 11 0 0 1 22 0v4Z"/></svg></span><span>Host Mode<small>Sing. Play. Repeat.</small></span></a><button id="ls26More" type="button" aria-label="Host menu" aria-expanded="false" aria-controls="ls26HostMenu">⌄</button>`;
    let stack=$('ls26StickyHeader');
    if(!stack){stack=document.createElement('div');stack.id='ls26StickyHeader';document.body.prepend(stack);}
    stack.append(nav);const status=$('topStatusContainer');if(status)stack.append(status);
    new ResizeObserver(()=>document.documentElement.style.setProperty('--ls-header-h',stack.getBoundingClientRect().height+'px')).observe(stack);
    const menu=document.createElement('div');menu.id='ls26HostMenu';menu.hidden=true;menu.innerHTML='<button id="ls26InboxOpen" type="button">▣ Inbox</button><button id="ls26UpdatesOpen" type="button">✎ App Updates</button>';document.body.append(menu);
    function closeMenu(){menu.hidden=true;$('ls26More').setAttribute('aria-expanded','false');}
    $('ls26More').onclick=()=>{menu.hidden=!menu.hidden;$('ls26More').setAttribute('aria-expanded',String(!menu.hidden));const rect=nav.getBoundingClientRect();menu.style.top=(rect.bottom+4)+'px';if(!menu.hidden)menu.querySelector('button').focus();};
    $('ls26InboxOpen').onclick=()=>{closeMenu();openInbox();};
    $('ls26UpdatesOpen').onclick=()=>{closeMenu();window.LS26.openAppUpdates();};
    document.addEventListener('click',e=>{if(!menu.contains(e.target)&&!$('ls26More').contains(e.target))closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){closeMenu();$('ls26More').focus();}});
    window.addEventListener('resize',closeMenu);
    const notesScript=document.createElement('script');notesScript.src=url('shared/app-updates.js?v=20260922-ui');document.head.append(notesScript);
    window.LS26.openAppUpdates=()=>toast('App Updates is loading. Please try again.');
    const creator=document.querySelector('.creator-topbar');if(creator)stack.append(creator);
    mountFullscreen();
    $('ls26LyricLink').onclick=e=>{e.preventDefault();const items=window.LK?.sessionTools?.getRunOrder?.()||[];const song=items.find(i=>i.status==='playing');const target=song?.songId?url('host/lyricview.html?id='+encodeURIComponent(song.songId)+(song.requestId?'&requestId='+encodeURIComponent(song.requestId):'')):sessionStorage.getItem('ls26:lastSong');if(target)location.href=target;else toast('Choose a song in Library first.');};


    if(location.pathname.includes('/admin-new/'))document.body.classList.add('ls26-admin');
    const foot=document.createElement('footer');foot.className='ls26-footer';foot.innerHTML=`<div class="ls26-brand" role="img" aria-label="LiveSuite — Live Performance OS"><img src="${url('assets/livesuite-logo-hd.jpg')}" alt="" width="1536" height="512"></div>`;document.body.append(foot);
    if(location.pathname.endsWith('/lyricscreator.html')){LS26Data.invalidate('lyrics');const title=params.get('inboxTitle'),artist=params.get('inboxArtist');if(title&&!params.get('firebaseId')){$('songTitleInput').value=title;$('artistInput').value=artist||'';}}
    if(location.pathname.endsWith('/setlist-editor.html'))LS26Data.invalidate('lyricsSetlists');
  }
  function openInbox(){
    let dialog=$('ls26InboxDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='ls26InboxDialog';dialog.className='ls26-dialog';dialog.setAttribute('aria-labelledby','ls26InboxTitle');dialog.innerHTML=`<form id="ls26CaptureForm"><h2 id="ls26InboxTitle">Song Inbox</h2><p class="ls26-muted">A song to learn for another night.</p><label>Song title<input name="title" required maxlength="180" autocomplete="off"></label><label>Artist <small>(optional)</small><input name="artist" maxlength="140"></label><label>Requested by <small>(optional)</small><input name="requester" maxlength="140"></label><p id="ls26CaptureStatus" role="status"></p><div class="ls26-dialog-actions"><button class="primary" type="submit">Save to Inbox</button><button type="button" id="ls26CaptureClose">Close</button><a class="ls26-button" href="${url('song-inbox.html')}">Manage Song Inbox</a></div></form>`;document.body.append(dialog);$('ls26CaptureClose').onclick=()=>dialog.close();$('ls26CaptureForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;try{const input=Object.fromEntries(new FormData(form));await window.LS26Inbox.capture(input);form.reset();$('ls26CaptureStatus').textContent='Saved to Song Inbox';form.elements.title.focus();}catch(err){$('ls26CaptureStatus').textContent=err.message;}finally{button.disabled=false;}};}
    dialog.showModal();dialog.querySelector('input').focus();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
