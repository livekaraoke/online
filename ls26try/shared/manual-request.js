/* Copyright © 2026 LiveSuite. All rights reserved.
 * Host-side manual request workflow for the shared Live Status Run Order.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const tools = () => window.LK?.sessionTools;
  const db = () => window.db || window.LK?.db || (window.firebase?.firestore ? firebase.firestore() : null);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const esc = value => window.LS26?.escape
    ? LS26.escape(value)
    : String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function toast(message) {
    if (window.LS26?.toast) LS26.toast(message);
    else console.info(message);
  }

  function injectStyles() {
    if ($('ls26ManualRequestStyles')) return;
    const style = document.createElement('style');
    style.id = 'ls26ManualRequestStyles';
    style.textContent = `
      #topStatusBar .ls26-run-add-actions{
        display:flex;
        align-items:stretch;
        gap:6px;
        margin:0 0 7px;
      }
      #topStatusBar .ls26-run-add-actions .ls26-add-song{
        flex:1 1 0;
        min-width:0;
        min-height:30px;
        margin:0!important;
        padding:6px 10px!important;
        border:1px solid #31505e!important;
        border-radius:7px!important;
        background:#081820!important;
        color:#d8edf5!important;
        font-size:9px!important;
        font-weight:900!important;
        letter-spacing:.04em!important;
        cursor:pointer;
      }
      #topStatusBar .ls26-run-add-actions .ls26-add-song:hover,
      #topStatusBar .ls26-run-add-actions .ls26-add-song:focus-visible{
        border-color:#59c9e5!important;
        background:#0a2632!important;
        color:#fff!important;
      }
      #topStatusBar #ls26AddRequest{
        border-color:#2c8051!important;
        background:#092218!important;
        color:#c9f9d9!important;
      }
      #topStatusBar #ls26AddRequest:hover,
      #topStatusBar #ls26AddRequest:focus-visible{
        border-color:#47d47b!important;
        background:#0b3220!important;
      }
      #topStatusBar #ls26AddRequest:disabled{
        opacity:.45;
        cursor:not-allowed;
      }
      .ls26-manual-request-dialog{
        width:min(720px,calc(100vw - 28px));
        max-height:min(84dvh,760px);
        overflow:auto;
      }
      .ls26-manual-request-dialog .ls26-manual-request-head{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        margin-bottom:12px;
      }
      .ls26-manual-request-dialog .ls26-manual-request-head h2{margin:2px 0 0}
      .ls26-manual-request-dialog .ls26-manual-request-head small{
        color:#6bd7ee;
        font-weight:900;
        letter-spacing:.08em;
      }
      .ls26-manual-request-dialog .ls26-manual-request-close{
        width:34px;
        height:34px;
        border:1px solid #31505e;
        border-radius:7px;
        background:#071219;
        color:#fff;
        cursor:pointer;
      }
      .ls26-manual-request-dialog .ls26-picker-search{
        width:100%;
        min-height:40px;
        margin:8px 0 10px;
      }
      .ls26-manual-request-dialog .ls26-picker-list,
      .ls26-manual-request-dialog .ls26-manual-requester-list{
        display:grid;
        gap:6px;
        max-height:52dvh;
        overflow:auto;
        padding-right:3px;
      }
      .ls26-manual-request-dialog .ls26-picker-list button,
      .ls26-manual-request-dialog .ls26-manual-requester-list button{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        width:100%;
        min-height:42px;
        padding:8px 10px;
        border:1px solid #274653;
        border-radius:7px;
        background:#07151c;
        color:#e9f4f8;
        text-align:left;
        cursor:pointer;
      }
      .ls26-manual-request-dialog .ls26-picker-list button:hover,
      .ls26-manual-request-dialog .ls26-manual-requester-list button:hover{
        border-color:#59c9e5;
        background:#0a222d;
      }
      .ls26-manual-request-dialog .ls26-picker-list button span:first-child{
        min-width:0;
        display:flex;
        flex-direction:column;
      }
      .ls26-manual-request-dialog .ls26-picker-list button small{
        margin-top:2px;
        color:#8199a5;
      }
      .ls26-manual-request-dialog .ls26-manual-requester-list .is-new{
        border-color:#2c8051;
        color:#aaf3c2;
        background:#092218;
        font-weight:900;
      }
      .ls26-manual-request-dialog .ls26-manual-selected-song{
        margin:0 0 12px;
        padding:10px 12px;
        border:1px solid #2b5668;
        border-radius:8px;
        background:#061923;
      }
      .ls26-manual-request-dialog .ls26-manual-selected-song small{
        display:block;
        color:#72b9cf;
        font-weight:850;
        letter-spacing:.05em;
      }
      .ls26-manual-request-dialog .ls26-manual-selected-song strong{
        display:block;
        margin-top:3px;
      }
      .ls26-manual-request-dialog .ls26-manual-request-status{
        min-height:18px;
        margin:10px 0 0;
        color:#91aeb9;
      }
      .ls26-manual-request-dialog .ls26-manual-back{
        margin:0 0 10px;
        border:0;
        background:transparent;
        color:#72cfe8;
        font-weight:850;
        cursor:pointer;
      }
      @media(max-width:620px){
        #topStatusBar .ls26-run-add-actions{gap:4px}
        #topStatusBar .ls26-run-add-actions .ls26-add-song{padding:6px!important;font-size:8px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function currentRequesterNames() {
    const seen = new Set();
    const names = [];
    (tools()?.getRequests?.() || []).forEach(request => {
      const name = String(request?.singerName || request?.requesterName || request?.name || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    return names.sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base'}));
  }

  async function sessionSongChoices() {
    const sessionTools = tools();
    if (!sessionTools) throw new Error('Session tools are still loading.');
    await sessionTools.ensureSongs?.();

    const allSongs = (sessionTools.getSongs?.() || []).slice();
    const session = sessionTools.getSession?.() || {};
    const publicList = sessionTools.getPublicList?.() || {};
    const setlistId = String(session.setlistId || session.publicSetlistId || publicList.setlistId || '').trim();
    let listName = String(session.setlistName || publicList.setlistName || '').trim();
    let songIds = Array.isArray(session.setlistSongIds) ? session.setlistSongIds.slice() : [];

    if (!songIds.length && setlistId) {
      try {
        const snap = await db().collection('lyricsSetlists').doc(setlistId).get();
        if (snap.exists) {
          const data = snap.data() || {};
          songIds = Array.isArray(data.songIds) ? data.songIds.slice() : [];
          listName = listName || String(data.name || '').trim();
        }
      } catch (error) {
        console.warn('Could not load current session setlist for manual request:', error);
      }
    }

    const ids = new Set(songIds.map(String));
    const songs = (ids.size ? allSongs.filter(song => ids.has(String(song.id))) : allSongs)
      .sort((a,b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, {sensitivity:'base'}));

    return {
      songs,
      listName:listName || (ids.size ? 'Session song list' : 'All songs')
    };
  }

  async function createManualRequest(song, requesterName) {
    const firestore = db();
    const sessionTools = tools();
    const sessionId = String(sessionTools?.getSessionId?.() || '').trim();
    const name = String(requesterName || '').trim().slice(0,140);
    if (!firestore) throw new Error('Firestore is unavailable.');
    if (!sessionId) throw new Error('Start a performance session before adding a request.');
    if (!song?.id) throw new Error('Choose a song first.');
    if (!name) throw new Error('Enter a requester name.');

    const session = sessionTools.getSession?.() || {};
    const requestRef = firestore.collection('publicSongRequests').doc();
    const runRef = firestore.collection('karaokeControl').doc('runOrder');
    const nowMs = Date.now();

    await firestore.runTransaction(async tx => {
      const runSnap = await tx.get(runRef);
      if (String(tools()?.getSessionId?.() || '') !== sessionId) {
        throw new Error('The active session changed. Reopen Add Request.');
      }

      const run = runSnap.exists ? (runSnap.data() || {}) : {};
      if (run.sessionId && String(run.sessionId) !== sessionId) {
        throw new Error('Run Order belongs to another session. Refresh and try again.');
      }

      const requestData = {
        sessionId,
        songId:String(song.id),
        songTitle:String(song.title || ''),
        title:String(song.title || ''),
        songArtist:String(song.artist || ''),
        artist:String(song.artist || ''),
        singerName:name,
        requesterName:name,
        name,
        note:'',
        status:'queued',
        requestType:'manual-song-request',
        source:'host-manual-request',
        sourceKey:'host-manual-request',
        manualRequest:true,
        manualRequestByHost:true,
        adminComment:'Manual request added by host',
        project:String(session.sessionType || session.type || 'LiveSuite'),
        requestedAt:stamp(),
        createdAt:stamp(),
        acceptedAt:stamp(),
        queuedAt:stamp(),
        updatedAt:stamp(),
        requestedAtMs:nowMs,
        createdAtMs:nowMs
      };

      const item = {
        id:`req_${requestRef.id}`,
        songId:String(song.id),
        songTitle:String(song.title || ''),
        artist:String(song.artist || ''),
        singerName:name,
        requesterNote:'',
        requestId:requestRef.id,
        source:'manual-request',
        manualRequest:true,
        status:'queued',
        addedAtMs:nowMs
      };

      const items = Array.isArray(run.items) ? run.items.slice() : [];
      items.push(item);
      tx.set(requestRef, requestData);
      tx.set(runRef, {
        sessionId,
        items,
        updatedAt:stamp()
      }, {merge:true});
    });

    return requestRef.id;
  }

  async function promptNewRequester() {
    if (window.LS26Dialogs?.prompt) {
      return LS26Dialogs.prompt('Enter the new requester name:','');
    }
    return window.prompt('Enter the new requester name:','');
  }

  async function openManualRequestDialog() {
    const sessionId = String(tools()?.getSessionId?.() || '').trim();
    if (!sessionId) {
      toast('Start a performance session before adding a request.');
      return;
    }

    injectStyles();
    const dialog = document.createElement('dialog');
    dialog.className = 'ls26-dialog ls26-manual-request-dialog';
    dialog.innerHTML = `
      <div class="ls26-manual-request-head">
        <div><small>RUN ORDER</small><h2>ADD REQUEST</h2></div>
        <button class="ls26-manual-request-close" type="button" aria-label="Close">✕</button>
      </div>
      <section data-manual-song-step>
        <p class="ls26-muted">Choose the song first, then choose who requested it.</p>
        <p class="ls26-muted" data-manual-list-name>Loading session song list…</p>
        <input class="ls26-picker-search" type="search" placeholder="Search songs or artists" aria-label="Search songs">
        <div class="ls26-picker-list" data-manual-song-list>Loading…</div>
      </section>
      <section data-manual-requester-step hidden>
        <button class="ls26-manual-back" type="button" data-manual-back>← CHANGE SONG</button>
        <div class="ls26-manual-selected-song" data-manual-selected-song></div>
        <h3>REQUESTER</h3>
        <p class="ls26-muted">Choose someone who already requested a song in this session, or add a new name.</p>
        <div class="ls26-manual-requester-list" data-manual-requester-list></div>
      </section>
      <p class="ls26-manual-request-status" role="status" data-manual-status></p>
    `;
    document.body.appendChild(dialog);

    const songStep = dialog.querySelector('[data-manual-song-step]');
    const requesterStep = dialog.querySelector('[data-manual-requester-step]');
    const songList = dialog.querySelector('[data-manual-song-list]');
    const requesterList = dialog.querySelector('[data-manual-requester-list]');
    const search = dialog.querySelector('.ls26-picker-search');
    const listName = dialog.querySelector('[data-manual-list-name]');
    const selectedSongBox = dialog.querySelector('[data-manual-selected-song]');
    const status = dialog.querySelector('[data-manual-status]');
    let choices = [];
    let selectedSong = null;

    const close = () => dialog.open ? dialog.close() : dialog.remove();
    dialog.querySelector('.ls26-manual-request-close').addEventListener('click', close);
    dialog.addEventListener('close', () => dialog.remove());

    function renderSongs() {
      const query = String(search.value || '').trim().toLowerCase();
      const visible = choices.filter(song => {
        if (!query) return true;
        return `${song.title || ''} ${song.artist || ''}`.toLowerCase().includes(query);
      });
      songList.innerHTML = visible.length
        ? visible.map(song => `
            <button type="button" data-manual-song="${esc(song.id)}">
              <span><strong>${esc(song.title || song.id)}</strong><small>${esc(window.ArtistNames?.display?.(song.artist || '') || song.artist || '')}</small></span>
              <span>CHOOSE ›</span>
            </button>
          `).join('')
        : '<p class="ls26-muted">No matching songs.</p>';
    }

    function showRequesterStep(song) {
      selectedSong = song;
      songStep.hidden = true;
      requesterStep.hidden = false;
      selectedSongBox.innerHTML = `<small>SELECTED SONG</small><strong>${esc(song.title || song.id)}${song.artist ? ` — ${esc(window.ArtistNames?.display?.(song.artist) || song.artist)}` : ''}</strong>`;
      const names = currentRequesterNames();
      requesterList.innerHTML = `
        <button type="button" class="is-new" data-manual-new-requester><span>＋ NEW…</span><span>ENTER NAME</span></button>
        ${names.map(name => `<button type="button" data-manual-requester="${esc(name)}"><span>${esc(name)}</span><span>CHOOSE ›</span></button>`).join('')}
      `;
    }

    async function saveForRequester(name, button) {
      const clean = String(name || '').trim();
      if (!clean || !selectedSong) return;
      status.textContent = 'Adding request…';
      dialog.querySelectorAll('button').forEach(control => control.disabled = true);
      try {
        await createManualRequest(selectedSong, clean);
        toast(`${selectedSong.title || 'Song'} added as a request for ${clean}.`);
        close();
      } catch (error) {
        status.textContent = error?.message || 'Could not add the request.';
        dialog.querySelectorAll('button').forEach(control => control.disabled = false);
        if (button) button.focus();
      }
    }

    search.addEventListener('input', renderSongs);
    dialog.addEventListener('click', async event => {
      const songButton = event.target.closest('[data-manual-song]');
      if (songButton) {
        const song = choices.find(entry => String(entry.id) === String(songButton.dataset.manualSong));
        if (song) showRequesterStep(song);
        return;
      }

      if (event.target.closest('[data-manual-back]')) {
        requesterStep.hidden = true;
        songStep.hidden = false;
        selectedSong = null;
        status.textContent = '';
        search.focus();
        return;
      }

      const requesterButton = event.target.closest('[data-manual-requester]');
      if (requesterButton) {
        await saveForRequester(requesterButton.dataset.manualRequester, requesterButton);
        return;
      }

      const newButton = event.target.closest('[data-manual-new-requester]');
      if (newButton) {
        const name = await promptNewRequester();
        if (name !== null && String(name).trim()) {
          await saveForRequester(String(name).trim(), newButton);
        }
      }
    });

    dialog.showModal();
    try {
      const result = await sessionSongChoices();
      choices = result.songs;
      listName.textContent = result.listName;
      renderSongs();
      search.focus();
    } catch (error) {
      songList.textContent = error?.message || 'Could not load songs.';
    }
  }

  function syncButtonState() {
    const button = $('ls26AddRequest');
    if (button) {
      const active = !!String(tools()?.getSessionId?.() || '').trim();
      button.disabled = !active;
      button.title = active ? 'Add a song request manually' : 'Start a session to add a request';
    }
  }

  function ensureButton() {
    const addSong = $('ls26AddSong');
    if (!addSong) return false;
    injectStyles();

    let row = $('ls26RunAddActions');
    if (!row) {
      row = document.createElement('div');
      row.id = 'ls26RunAddActions';
      row.className = 'ls26-run-add-actions';
      addSong.insertAdjacentElement('beforebegin', row);
      row.appendChild(addSong);
    } else if (addSong.parentElement !== row) {
      row.prepend(addSong);
    }

    addSong.textContent = '＋ ADD SONG';

    let button = $('ls26AddRequest');
    if (!button) {
      button = document.createElement('button');
      button.id = 'ls26AddRequest';
      button.className = 'ls26-add-song ls26-add-request';
      button.type = 'button';
      button.textContent = '＋ ADD REQUEST';
      button.addEventListener('click', openManualRequestDialog);
      row.appendChild(button);
    }

    syncButtonState();
    return true;
  }

  function init() {
    if (!ensureButton()) {
      const observer = new MutationObserver(() => {
        if (ensureButton()) observer.disconnect();
      });
      observer.observe(document.documentElement, {childList:true,subtree:true});
    }
    window.addEventListener('lk:session-updated', syncButtonState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
