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
  function validForm(name, song, note) { return !!song && trim(name).length > 0 && trim(name).length <= 80 && String(note || '').length <= 300 && !/[<>]/.test(String(name) + String(note || '')); }
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
  var busy = false, loading = false, uncertain = false, limit = 30, timer = null, resetTimer = null, pending = null;
  var base = 'https://firestore.googleapis.com/v1/projects/' + policy.projectId + '/databases/(default)/documents';
  function el(id) { return document.getElementById(id); }
  function notice(text, ok) { el('notice').textContent = text; el('notice').className = ok ? 'notice ok' : 'notice'; }
  function ready() {
    el('fields').disabled = !view || !view.enabled || busy || uncertain;
    el('send').disabled = !view || !view.enabled || busy || loading || uncertain || !validForm(el('singerName').value, selected, el('note').value);
    el('refresh').disabled = busy || loading;
  }
  function renderSongs() {
    var matches = filterSongs(songs, el('songSearch').value), container = el('songResults'), i;
    while (container.firstChild) { container.removeChild(container.firstChild); }
    function add(song) {
      var button = document.createElement('button'), title = document.createElement('strong'), artist = document.createElement('span');
      button.type = 'button'; button.className = 'song' + (selected && selected.id === song.id ? ' selected' : '');
      button.setAttribute('aria-pressed', selected && selected.id === song.id ? 'true' : 'false');
      title.textContent = song.title; artist.textContent = song.artist; button.appendChild(title); button.appendChild(artist);
      button.onclick = function () { selected = song; el('selection').textContent = 'SELECTED: ' + song.title + '\n' + song.artist; renderSongs(); ready(); };
      container.appendChild(button);
    }
    for (i = 0; i < Math.min(matches.length, limit); i += 1) { add(matches[i]); }
    el('resultCount').textContent = matches.length ? 'Showing ' + Math.min(matches.length, limit) + ' of ' + matches.length + ' songs. Tap one to select.' : 'No matching songs. Try another title or artist.';
    el('moreSongs').hidden = matches.length <= limit;
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
    if (!tokenValid(token)) { view = null; notice('KIOSK LINK REQUIRED\nPlease ask the host to open the current sign-up link.'); ready(); return; }
    loading = true; ready();
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
        el('selection').textContent = selected ? 'SELECTED: ' + selected.title + '\n' + selected.artist : 'Song list changed. Please choose a song.';
      }
      el('listTitle').textContent = view.displayTitle || view.venue || view.setlistName || "Tonight's song list";
      if (!uncertain) { notice(view.enabled ? 'Choose your song. Requests go straight to Billy.' : 'SIGN-UP CLOSED\nPlease ask the host.', view.enabled); }
      el('refresh').textContent = 'REFRESH SONG LIST'; if (changed) { renderSongs(); } ready(); schedule();
    });
  }
  function resetForm() {
    el('singerName').value = ''; el('note').value = ''; el('songSearch').value = ''; selected = null; pending = null; uncertain = false; limit = 30;
    el('selection').textContent = 'No song selected'; el('songResults').scrollTop = 0; renderSongs(); ready();
  }
  el('signupForm').onsubmit = function (event) {
    event.preventDefault();
    if (busy || loading || uncertain || !view || !view.enabled || !validForm(el('singerName').value, selected, el('note').value)) { return; }
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
      resetForm(); el('signupForm').hidden = true; el('success').hidden = false;
      notice('REQUEST SENT', true); window.scrollTo(0, 0);
      resetTimer = setTimeout(function () { el('success').hidden = true; el('signupForm').hidden = false; load(); }, 4000);
    });
  };
  el('singerName').oninput = el('note').oninput = ready;
  el('songSearch').oninput = function () { limit = 30; el('songResults').scrollTop = 0; renderSongs(); };
  el('clearSearch').onclick = function () { el('songSearch').value = ''; limit = 30; renderSongs(); };
  el('moreSongs').onclick = function () { limit += 30; renderSongs(); };
  el('refresh').onclick = function () {
    if (uncertain) {
      if (!window.confirm('Please check with Billy whether the request arrived before starting again. Clear this form?')) { return; }
      resetForm();
    }
    load();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); } else { load(); } });
  window.addEventListener('pagehide', function () { clearTimeout(timer); clearTimeout(resetTimer); resetForm(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { el('success').hidden = true; el('signupForm').hidden = false; load(); } });
  load();
}(typeof window !== 'undefined' ? window : this));
