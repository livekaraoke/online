/* ES5 only. No SDK, storage of customer data, realtime listeners or requests
 * on keystrokes. The queue write and private token receipt commit atomically. */
(function (root) {
  'use strict';
  function trim(value) { return String(value || '').replace(/^\s+|\s+$/g, ''); }
  function param(name, query) {
    var parts = String(query || '').replace(/^\?/, '').split('&'), i, pair;
    for (i = 0; i < parts.length; i += 1) {
      pair = parts[i].split('=');
      if (pair[0] === name) { try { return decodeURIComponent((pair[1] || '').replace(/\+/g, ' ')); } catch (ignore) { return ''; } }
    }
    return '';
  }
  function tokenValid(token) { return /^[a-f0-9]{64}$/.test(token); }
  function decode(value) {
    var out, key, i, rows;
    if (value.stringValue !== undefined) { return value.stringValue; }
    if (value.booleanValue !== undefined) { return value.booleanValue; }
    if (value.integerValue !== undefined) { return Number(value.integerValue); }
    if (value.timestampValue !== undefined) { return value.timestampValue; }
    if (value.mapValue) {
      out = {}; rows = value.mapValue.fields || {};
      for (key in rows) { if (Object.prototype.hasOwnProperty.call(rows, key)) { Object.defineProperty(out, key, {value: decode(rows[key]), enumerable: true}); } }
      return out;
    }
    if (value.arrayValue) {
      rows = value.arrayValue.values || []; out = [];
      for (i = 0; i < rows.length; i += 1) { out.push(decode(rows[i])); }
      return out;
    }
    return null;
  }
  function encode(fields) {
    var out = {}, key;
    for (key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) { out[key] = {stringValue: String(fields[key])}; }
    }
    return out;
  }
  function songsFrom(view) {
    var rows = [], key, song, source = view.songs || {};
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        song = source[key];
        if (song && typeof song.title === 'string' && typeof song.artist === 'string') {
          rows.push({id: key, title: song.title, artist: song.artist});
        }
      }
    }
    rows.sort(function (a, b) { return a.title.toLowerCase().localeCompare(b.title.toLowerCase()); });
    return rows;
  }
  function filterSongs(songs, query) {
    var text = trim(query).toLowerCase();
    return songs.filter(function (song) { return (song.title + ' ' + song.artist).toLowerCase().indexOf(text) !== -1; });
  }
  function validForm(name, song, note) { return !!song && trim(name).length >= 3 && trim(name).length <= 80 && String(note || '').length <= 300 && !/[<>]/.test(String(name) + String(note || '')); }
  function randomId() {
    var crypto = root.crypto || root.msCrypto, bytes, result = '', i;
    if (!crypto || !crypto.getRandomValues) { throw new Error('Secure request IDs are unavailable. Please ask the host.'); }
    bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    for (i = 0; i < bytes.length; i += 1) { result += ('0' + bytes[i].toString(16)).slice(-2); }
    return 'kiosk_' + result;
  }
  function commitBody(project, id, token, view, song, name, note) {
    if (!tokenValid(token) || !/^kiosk_[a-f0-9]{32}$/.test(id) || !validForm(name, song, note)) { throw new Error('Enter your name and choose a song.'); }
    var base = 'projects/' + project + '/databases/(default)/documents/';
    var request = {
      source: 'signup-kiosk', requestType: 'karaoke-song-request', status: 'pending',
      sessionId: view.sessionId, publicSetlistId: view.setlistId, publicSetlistName: view.setlistName,
      kioskRevision: view.revision, venue: view.venue, songId: song.id,
      songTitle: song.title, songArtist: song.artist, singerName: trim(name), note: trim(note)
    };
    function write(path, data) {
      return {update: {name: base + path, fields: encode(data)}, currentDocument: {exists: false},
        updateTransforms: [{fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME'}]};
    }
    return {writes: [write('publicSongRequests/' + id, request), write('signupKioskReceipts/' + id, {token: token})]};
  }
  function xhr(method, url, data, done) {
    var request = new XMLHttpRequest(), completed = false;
    function finish(error, result) { if (!completed) { completed = true; done(error, result); } }
    request.open(method, url, true); request.timeout = 15000;
    if (data) { request.setRequestHeader('Content-Type', 'application/json'); }
    request.onreadystatechange = function () {
      var parsed;
      if (request.readyState !== 4) { return; }
      if (request.status >= 200 && request.status < 300) {
        try { parsed = JSON.parse(request.responseText); } catch (ignore) { finish({status: 0}); return; }
        finish(null, parsed);
      } else { finish({status: request.status}); }
    };
    request.onerror = request.ontimeout = function () { finish({status: 0}); };
    request.send(data ? JSON.stringify(data) : null);
  }
  var api = {trim: trim, param: param, tokenValid: tokenValid, decode: decode, encode: encode, songsFrom: songsFrom,
    filterSongs: filterSongs, validForm: validForm, commitBody: commitBody, randomId: randomId};
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  root.LKSignup = api;
  if (!root.document || !document.getElementById('signupForm')) { return; }
  var policy = root.LKSignupPolicy || {}, token = param('k', location.search), view = null, songs = [], selected = null;
  var discover = !tokenValid(token);
  var busy = false, loading = false, uncertain = false, timer = null, resetTimer = null, pending = null, songButtons = [];
  var focusedName = false, dialogAction = null;
  var unavailable = {}, localBlocked = {}, availabilitySession = '', availabilityVersion = 0;
  var base = 'https://firestore.googleapis.com/v1/projects/' + policy.projectId + '/databases/(default)/documents';
  function el(id) { return document.getElementById(id); }
  function notice(text, ok) {
    el('notice').textContent = text;
    el('notice').hidden = !!ok;
    el('refresh').hidden = !!ok;
    layoutSongScreen();
  }
  function nameValid() {
    var name = trim(el('singerName').value);
    return name.length >= 3 && name.length <= 80 && !/[<>]/.test(name);
  }
  /* The song step has viewport-anchored geometry on its first paint. Only
   * the inner song list receives an explicit height (iOS 9 Safari). */
  function layoutSongScreen() {
    var form = el('signupForm'), step = el('songStep'), bottom = el('songBottom');
    var list = el('songResults'), hint = el('resultCount'), kiosk = el('kiosk');
    var header = kiosk.getElementsByTagName('header')[0], top, listTop, available;
    if (step.hidden || form.hidden) { return; }
    top = Math.ceil(header.getBoundingClientRect().bottom - kiosk.getBoundingClientRect().top);
    if (!el('notice').hidden) { top += el('notice').offsetHeight + 8; }
    if (!el('refresh').hidden) { top += el('refresh').offsetHeight + 8; }
    form.style.top = top + 'px';
    form.style.height = '';
    el('fields').style.height = '100%';
    step.style.height = '100%';
    listTop = Math.ceil(hint.getBoundingClientRect().bottom - step.getBoundingClientRect().top + 7);
    available = step.clientHeight - listTop - bottom.offsetHeight - 8;
    list.style.top = listTop + 'px';
    list.style.height = Math.max(40, Math.floor(available)) + 'px';
  }
  function focusName() {
    if (el('nameStep').hidden || el('fields').disabled || el('signupForm').hidden || !el('refreshDialog').hidden) { return; }
    try { el('singerName').focus(); } catch (ignore) {}
  }
  function showStep(which) {
    el('nameStep').hidden = which !== 'name';
    el('songStep').hidden = which !== 'song';
    el('signupForm').className = which === 'song' ? 'song-active' : '';
    if (which === 'song') {
      el('singerDisplay').textContent = trim(el('singerName').value);
      layoutSongScreen();
    } else {
      el('signupForm').style.top = '';
      el('signupForm').style.height = '';
      el('fields').style.height = '';
      el('songStep').style.height = '';
      if (!el('fields').disabled) { focusName(); }
    }
  }
  function ready() {
    var available = !!view && !!view.enabled && !busy && !loading && !uncertain;
    el('fields').disabled = !available;
    el('next').disabled = !available || !nameValid();
    el('send').disabled = !available || !validForm(el('singerName').value, selected, el('note').value) ||
      !!(selected && songUnavailable(selected.id));
    if (available && !el('nameStep').hidden && !focusedName) {
      focusedName = true;
      setTimeout(focusName, 0);
    }
    el('refresh').disabled = busy || loading;
    el('pageRefresh').disabled = busy;
  }
  function statusLabel(value) {
    value = trim(value).toLowerCase();
    if (value === 'played' || value === 'completed' || value === 'finished') { return 'PLAYED'; }
    if (value === 'active' || value === 'pending' || value === 'waiting' || value === 'queued' ||
        value === 'accepted' || value === 'playing' || value === 'requested') { return 'REQUESTED'; }
    return '';
  }
  function songUnavailable(id) {
    return localBlocked[id] || unavailable[id] || '';
  }
  function showSelection() {
    el('selection').textContent = selected ? 'SELECTED: ' + selected.title + ' - ' + selected.artist : 'Select a song from the list';
  }
  function updateSongStates() {
    var box = el('songResults'), i, row, reason, active;
    if (selected && songUnavailable(selected.id)) { selected = null; showSelection(); }
    box.className = selected ? 'songs has-selection' : 'songs';
    for (i = 0; i < songButtons.length; i += 1) {
      row = songButtons[i];
      reason = songUnavailable(row.song.id);
      active = !!(selected && selected.id === row.song.id);
      row.button.disabled = !!reason;
      row.button.className = 'song' + (active ? ' selected' : '') + (reason ? ' unavailable' : '');
      row.button.setAttribute('aria-pressed', active ? 'true' : 'false');
      row.button.setAttribute('aria-disabled', reason ? 'true' : 'false');
      row.symbol.textContent = active ? '\u2713' : '+';
      row.status.textContent = reason;
    }
    ready();
  }
  /* Existing public live view and a session-scoped, field-limited request
   * projection: only songId/status are fetched, never singer names/notes.
   * No new Firestore listeners, caches or writes. */
  function loadAvailability() {
    var session = view && view.sessionId, version, next = {}, remaining = 2;
    if (!view || !view.enabled || !session) { return; }
    if (availabilitySession !== session) {
      unavailable = {}; localBlocked = {}; availabilitySession = session;
    }
    version = ++availabilityVersion;
    function record(id, status) {
      var label = statusLabel(status);
      if (!id || !label) { return; }
      if (label === 'PLAYED' || next[id] !== 'PLAYED') { next[id] = label; }
    }
    function finish() {
      remaining -= 1;
      if (remaining || version !== availabilityVersion || !view || view.sessionId !== session) { return; }
      unavailable = next;
      updateSongStates();
    }
    xhr('GET', base + '/publicSites/live-karaoke/views/live', null, function (error, result) {
      var data, items, i;
      if (!error && result && result.fields) {
        data = decode({mapValue: {fields: result.fields}});
        if (data.schemaVersion === 1 && data.act === 'live-karaoke' && data.sessionId === session &&
            (!data.expiresAt || Date.parse(data.expiresAt) > Date.now())) {
          items = data.availability || [];
          for (i = 0; i < items.length; i += 1) { record(items[i].songId, items[i].status); }
        }
      }
      finish();
    });
    xhr('POST', base + ':runQuery', {structuredQuery: {
      from: [{collectionId: 'publicSongRequests'}],
      select: {fields: [{fieldPath: 'songId'}, {fieldPath: 'status'}]},
      where: {fieldFilter: {field: {fieldPath: 'sessionId'}, op: 'EQUAL', value: {stringValue: session}}},
      limit: 500
    }}, function (error, records) {
      var i, item;
      if (!error && Object.prototype.toString.call(records) === '[object Array]') {
        for (i = 0; i < records.length; i += 1) {
          if (!records[i].document) { continue; }
          item = decode({mapValue: {fields: records[i].document.fields || {}}});
          record(item.songId, item.status);
        }
      }
      finish();
    });
  }
  function filterVisibleSongs() {
    var term = trim(el('songSearch').value).toLowerCase(), count = 0, i, row, match;
    for (i = 0; i < songButtons.length; i += 1) {
      row = songButtons[i];
      match = (row.song.title + ' ' + row.song.artist).toLowerCase().indexOf(term) !== -1;
      row.button.style.display = match ? 'block' : 'none';
      if (match) { count += 1; }
    }
    el('resultCount').textContent = count ? 'Showing all ' + count + ' matching songs. Tap one to select.' : 'No matching songs. Try another title or artist.';
  }
  function renderSongs() {
    var container = el('songResults'), fragment = document.createDocumentFragment(), i, oldScroll = container.scrollTop;
    while (container.firstChild) { container.removeChild(container.firstChild); }
    songButtons = [];
    function add(song) {
      var button = document.createElement('button'), title = document.createElement('strong');
      var artist = document.createElement('span'), symbol = document.createElement('span');
      var blocked = document.createElement('span');
      button.type = 'button';
      button.className = 'song';
      title.textContent = song.title; artist.textContent = song.artist;
      symbol.className = 'song-symbol'; symbol.setAttribute('aria-hidden', 'true');
      blocked.className = 'song-unavailable';
      button.appendChild(title); button.appendChild(artist); button.appendChild(symbol); button.appendChild(blocked);
      button.onclick = function () {
        if (songUnavailable(song.id)) { return; }
        selected = song; updateSongStates();
      };
      songButtons.push({song: song, button: button, symbol: symbol, status: blocked});
      fragment.appendChild(button);
    }
    for (i = 0; i < songs.length; i += 1) { add(songs[i]); }
    container.appendChild(fragment);
    container.scrollTop = oldScroll;
    filterVisibleSongs();
    updateSongStates();
  }
  function schedule() {
    clearTimeout(timer);
    if (!document.hidden && !el('success').hidden) { return; }
    if (!document.hidden) { timer = setTimeout(load, 60000); }
  }
  function load() {
    if (busy || loading || !el('success').hidden) { return; }
    clearTimeout(timer);
    if (policy.rulesVerified !== true) { view = null; notice('HOST SETUP REQUIRED\nSecure kiosk access must be enabled by the host before sign-up opens.'); ready(); return; }
    loading = true; ready();
    if (discover) {
      xhr('GET', base + '/karaokeControl/signupKioskPublic', null, function (error, data) {
        var current;
        if (error) {
          loading = false; view = null; ready();
          notice(error.status === 403 || error.status === 404 ? 'SIGN-UP NOT OPEN YET\nPlease ask the host to enable sign-up.' : 'NO CONNECTION\nPLEASE ASK THE HOST');
          schedule(); return;
        }
        current = decode({mapValue: {fields: data.fields || {}}});
        if (current.schemaVersion !== 1 || current.enabled !== true || !tokenValid(current.token)) {
          loading = false; view = null; ready(); notice('SIGN-UP CLOSED\nPlease ask the host.'); schedule(); return;
        }
        token = current.token; loadView();
      });
    } else { loadView(); }
  }
  function loadView() {
    xhr('GET', base + '/signupKioskViews/' + token, null, function (error, data) {
      var next, match, i, changed;
      loading = false;
      if (error) {
        view = null; ready();
        notice(error.status === 403 || error.status === 404 ? 'SIGN-UP UNAVAILABLE\nThe kiosk is closed or this link has expired. Please ask the host.' : 'NO CONNECTION\nPLEASE ASK THE HOST\nUse RETRY when Wi-Fi is available.');
        el('refresh').textContent = 'RETRY'; schedule(); return;
      }
      next = decode({mapValue: {fields: data.fields || {}}});
      if (next.schemaVersion !== 1 || !next.sessionId || !next.revision || !next.songs) { view = null; notice('SONG LIST UNAVAILABLE\nPlease ask the host to refresh the kiosk setup.'); ready(); schedule(); return; }
      if (view && view.sessionId !== next.sessionId) { resetForm(); }
      changed = !view || view.revision !== next.revision; view = next; songs = songsFrom(view);
      if (selected) {
        match = null; for (i = 0; i < songs.length; i += 1) { if (songs[i].id === selected.id) { match = songs[i]; break; } }
        selected = match;
        showSelection();
      }
      if (!uncertain) { notice(view.enabled ? 'Requests go straight to the host.' : 'SIGN-UP CLOSED\nPlease ask the host.', view.enabled); }
      el('refresh').textContent = 'RETRY / REFRESH SONG LIST'; if (changed) { renderSongs(); } ready(); schedule();
      if (view.enabled) { loadAvailability(); }
    });
  }
  function resetForm() {
    el('singerName').value = ''; el('note').value = ''; el('songSearch').value = '';
    el('note').hidden = true; el('noteToggle').setAttribute('aria-expanded', 'false');
    selected = null; pending = null; uncertain = false; focusedName = false;
    showStep('name'); showSelection(); el('songResults').scrollTop = 0; renderSongs(); ready();
  }
  el('signupForm').onsubmit = function (event) {
    event.preventDefault();
    if (busy || loading || uncertain || !view || !view.enabled ||
        !validForm(el('singerName').value, selected, el('note').value) ||
        (selected && songUnavailable(selected.id))) { return; }
    try { pending = commitBody(policy.projectId, randomId(), token, view, selected, el('singerName').value, el('note').value); }
    catch (error) { notice(error.message); return; }
    busy = true; clearTimeout(timer); ready(); notice('SENDING REQUEST…');
    xhr('POST', base + ':commit', pending, function (error, data) {
      busy = false;
      if (error || !data || !data.writeResults || data.writeResults.length !== 2) {
        // A lost response may still have committed. Never retry with a new ID or
        // claim success; host must check the queue before the customer retries.
        uncertain = true; ready(); notice('REQUEST NOT CONFIRMED\nPLEASE ASK THE HOST before trying again. Your request may have arrived.');
        return;
      }
      if (selected) { localBlocked[selected.id] = 'REQUESTED'; }
      resetForm(); el('signupForm').hidden = true; el('success').hidden = false;
      notice('REQUEST SENT', true); window.scrollTo(0, 0);
      resetTimer = setTimeout(function () { el('success').hidden = true; el('signupForm').hidden = false; load(); }, 4000);
    });
  };
  el('singerName').oninput = el('note').oninput = ready;
  el('next').onclick = function () {
    if (el('next').disabled || !nameValid()) { return; }
    if (el('singerName').blur) { el('singerName').blur(); }
    showStep('song'); el('songResults').scrollTop = 0;
  };
  el('back').onclick = function () { if (!busy && !uncertain) { showStep('name'); } };
  el('cancel').onclick = function () { if (!busy && !uncertain) { resetForm(); } };
  el('songSearch').oninput = function () { el('songResults').scrollTop = 0; filterVisibleSongs(); };
  el('clearSearch').onclick = function () { el('songSearch').value = ''; filterVisibleSongs(); };
  el('noteToggle').onclick = function () {
    el('note').hidden = !el('note').hidden;
    el('noteToggle').setAttribute('aria-expanded', el('note').hidden ? 'false' : 'true');
    layoutSongScreen();
  };
  function closeRefreshDialog() {
    el('refreshDialog').hidden = true;
    dialogAction = null;
  }
  function openRefreshDialog(message, confirmLabel, action) {
    el('refreshMessage').textContent = message;
    el('refreshConfirm').textContent = confirmLabel;
    dialogAction = action;
    el('refreshDialog').hidden = false;
    el('refreshCancel').focus();
  }
  el('refreshCancel').onclick = closeRefreshDialog;
  el('refreshConfirm').onclick = function () {
    var action = dialogAction;
    closeRefreshDialog();
    if (action) { action(); }
  };
  el('pageRefresh').onclick = function () {
    if (busy) { return; }
    if (uncertain) {
      openRefreshDialog('Your last request may have been sent. Please check with the host before refreshing.',
        'REFRESH ANYWAY', function () { root.location.reload(); });
    } else if (trim(el('singerName').value) || selected || trim(el('note').value)) {
      openRefreshDialog('Refreshing will clear the name and song currently being entered.',
        'REFRESH PAGE', function () { root.location.reload(); });
    } else { root.location.reload(); }
  };
  el('refresh').onclick = function () {
    if (uncertain) {
      openRefreshDialog('Your last request may already be in the queue. Check with the host before clearing this form.',
        'CLEAR FORM', function () { resetForm(); load(); });
      return;
    }
    load();
  };
  root.addEventListener('resize', layoutSongScreen);
  root.addEventListener('orientationchange', layoutSongScreen);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { load(); } });
  window.addEventListener('pagehide', function () { clearTimeout(timer); clearTimeout(resetTimer); resetForm(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { el('success').hidden = true; el('signupForm').hidden = false; load(); } });
  showStep('name');
  load();
}(typeof window !== 'undefined' ? window : this));
