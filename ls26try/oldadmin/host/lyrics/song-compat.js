(() => {
  'use strict';
  if (!/\/ls26try\/oldadmin\/host\/lyrics\/song(?:\.html)?\/?$/i.test(location.pathname)) return;

  const normalize = value => String(value || '')
    .toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  function entries() {
    return (Array.isArray(window.songs) ? window.songs : [])
      .map(song => {
        const found = String(song?.url || '').match(/[?&]id=([^&#]+)/i);
        let id = '';
        if (found) { try { id = decodeURIComponent(found[1]); } catch (_) { id = found[1]; } }
        return {
          id: String(id || song?.id || '').trim(),
          title: String(song?.title || '').trim(),
          artist: String(song?.artist || '').trim()
        };
      }).filter(item => item.id);
  }

  function value(meta, ...names) {
    for (const name of names) {
      const v = meta?.[name];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  function resolveLocal(raw, meta = {}) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    const catalog = entries();
    if (!catalog.length) return '';
    const byId = catalog.find(item => normalize(item.id) === normalize(raw));
    if (byId) return byId.id;

    // Modern IDs often combine title+artist. Check this BEFORE saved legacy
    // metadata, which might still describe the previous song.
    const titleArtist = catalog.filter(item => normalize(item.title + item.artist) === normalize(raw));
    if (titleArtist.length === 1) return titleArtist[0].id;

    const explicit = value(meta, 'lyricsFileId', 'karaokeLyrics', 'karaokeId', 'legacyId');
    const byExplicitId = catalog.find(item => normalize(item.id) === normalize(explicit));
    if (explicit && byExplicitId) return byExplicitId.id;

    const title = value(meta, 'songTitle', 'title') || value(meta.song, 'title');
    const artist = value(meta, 'songArtist', 'artist') || value(meta.song, 'artist');
    if (title) {
      const matches = catalog.filter(item => normalize(item.title) === normalize(title));
      if (artist) {
        const exactArtist = matches.filter(item => normalize(item.artist) === normalize(artist));
        if (exactArtist.length === 1) return exactArtist[0].id;
      }
      if (matches.length === 1) return matches[0].id;
    }
    const byTitle = catalog.filter(item => normalize(item.title) === normalize(raw));
    return byTitle.length === 1 ? byTitle[0].id : '';
  }

  async function resolveId(raw, meta = {}) {
    const direct = resolveLocal(raw, meta);
    if (direct) return direct;
    if (!raw || !window.firebase?.firestore) return raw;
    try {
      // Only reached for a genuinely new ID absent from the local catalog.
      const snap = await firebase.firestore().collection('lyrics').doc(String(raw)).get();
      if (snap.exists) return resolveLocal(raw, snap.data() || {}) || raw;
    } catch (error) { console.warn('Legacy lyrics ID lookup failed:', error); }
    return raw;
  }

  const originalLoadSong = window.loadSong;
  if (typeof originalLoadSong !== 'function') return;

  let unsubscribe = null;
  let version = 0;
  let displayedId = '';
  let lastHostKey = '';
  let enabled = false;

  function replaceUrlId(id) {
    const url = new URL(location.href);
    url.searchParams.set('id', id);
    // URL is updated in-place: no page navigation, no lost scrolling state.
    history.replaceState(null, '', url.href);
  }

  async function showSong(rawId, metadata = {}) {
    const raw = String(rawId || '').trim();
    if (!raw) return;
    const token = ++version;
    const id = await resolveId(raw, metadata);
    if (token !== version || !id) return;
    if (displayedId === id) return;
    if (displayedId) window.stopAutoScroll?.();
    replaceUrlId(id);
    displayedId = id;
    originalLoadSong();
  }

  // The original DOMContentLoaded callback will call this wrapper once.
  window.loadSong = function () {
    const id = new URLSearchParams(location.search).get('id') || '';
    if (displayedId === id) return;
    return showSong(id);
  };

  window.stopSlaveLyrics = function () {
    enabled = false;
    ++version;
    lastHostKey = '';
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  };

  window.startSlaveLyrics = function () {
    if (unsubscribe || !window.firebase?.firestore) return;
    enabled = true;
    unsubscribe = firebase.firestore()
      .collection('karaokeControl').doc('liveLyrics')
      .onSnapshot(snap => {
        if (!enabled || !snap.exists) return;
        const data = snap.data() || {};
        // Manual SEND LYRICS may update currentSongId while the modern
        // singer-display ID remains stale.
        const raw = String(data.currentSongId || data.currentLyricsSongId || data.songId || '').trim();
        if (!raw) return;
        const meta = data.song || data;
        const signature = [
          raw,
          value(data, 'lyricsFileId', 'lyricsFileName'),
          value(meta, 'karaokeLyrics', 'songTitle', 'title'),
          value(meta, 'songArtist', 'artist')
        ].join('|');
        if (signature === lastHostKey) return;
        lastHostKey = signature;
        void showSong(raw, meta);
      }, error => console.warn('Slave Lyrics sync failed:', error));
  };

  if (document.getElementById('slaveLyricsToggle')?.checked) window.startSlaveLyrics();
})();