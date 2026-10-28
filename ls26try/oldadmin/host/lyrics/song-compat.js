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
  let currentRenderMode = 'legacy';
  let enabled = false;

  function replaceUrlId(id, mode = 'legacy') {
    const url = new URL(location.href);
    url.searchParams.set('id', id);
    if (mode === 'modern') url.searchParams.set('source', 'modern');
    else url.searchParams.delete('source');
    // In-place update avoids full-page reloads and preserves fullscreen.
    history.replaceState(null, '', url.href);
  }

  // The source is the same Firestore lyrics/{id} document consumed by the
  // existing Singer Screen. Reuse its section-visibility and line filtering
  // helpers rather than maintaining a second chord/lyrics parser.
  function renderModernSong(song) {
    const container = document.getElementById('lyrics-container');
    const title = document.getElementById('songTitle');
    if (!container || !title) return false;
    if (!Array.isArray(song.sections) || !window.LyricsCommon ||
        !window.LS26SingerLines) {
      throw new Error('The modern lyrics renderer or song sections are unavailable.');
    }
    const heading = document.createElement('div');
    heading.className = 'song-main-title';
    heading.textContent = song.title || 'Untitled';
    const artist = document.createElement('div');
    artist.className = 'song-artist';
    artist.textContent = song.artist || '';
    title.replaceChildren(heading, artist);

    const fragment = document.createDocumentFragment();
    let visibleLines = 0;
    for (const section of song.sections) {
      // Explicitly hidden sections must not leak chords, lyrics, or cues.
      if (!window.LyricsCommon.sectionVisibleOnSingerScreen(section)) continue;
      const rows = window.LS26SingerLines.section(section, document,
        { includeBlankLines: true })
        .filter(row => row.kind === 'lyric' || row.kind === 'cue' ||
          row.kind === 'blank');
      // Empty sections should not introduce a heading by themselves.
      if (!rows.some(row => row.kind !== 'blank')) continue;
      const group = document.createElement('div');
      group.className = 'verse modern-prompter-section';
      const isPerformanceNote = ['performancenote', 'performance-note']
        .includes(String(section.type || '').toLowerCase());
      // Performance Note is a generic editor label, not part of the cue.
      if (section.title && !isPerformanceNote) {
        const label = document.createElement('div');
        label.className = 'section modern-prompter-heading';
        label.textContent = section.title;
        group.appendChild(label);
      }
      for (const row of rows) {
        if (row.kind === 'blank') {
          // A dedicated blank line occupies vertical space without changing
          // the stored lyrics, injecting <br>, or exposing chord-only rows.
          const blank = document.createElement('div');
          blank.className = 'modern-prompter-blank';
          blank.setAttribute('aria-hidden', 'true');
          group.appendChild(blank);
          continue;
        }
        const line = document.createElement('div');
        line.className = row.kind === 'cue'
          ? 'modern-prompter-cue' : 'modern-prompter-line';
        // The shared Singer Lines helper shortens performance notes to the
        // trailing parenthetical ("wait for signal"). LyricView, however,
        // shows the complete author-entered note stored in section.text.
        // Preserve that exact text for the dedicated Prompter only.
        line.textContent = isPerformanceNote && row.kind === 'cue'
          ? (section.text || section.note || row.text) : row.text;
        group.appendChild(line);
        visibleLines++;
      }
      fragment.appendChild(group);
    }
    if (!visibleLines) {
      const empty = document.createElement('div');
      empty.className = 'modern-prompter-empty';
      empty.textContent = 'No lyrics are visible on Singer Screen for this song.';
      fragment.appendChild(empty);
    }
    container.replaceChildren(fragment);
    window.applySavedPrompterStyles?.();
    return true;
  }

  async function showModernSong(rawId) {
    const id = String(rawId || '').trim();
    if (!id || !window.firebase?.firestore) return;
    const token = ++version;
    try {
      const snap = await firebase.firestore().collection('lyrics').doc(id).get();
      if (token !== version || (enabled === false &&
          new URLSearchParams(location.search).get('source') !== 'modern')) return;
      if (!snap.exists) throw new Error('Modern lyrics not found for this song.');
      const song = snap.data() || {};
      if (!Array.isArray(song.sections)) throw new Error('Song has no valid lyrics sections.');
      if (displayedId && displayedId !== 'modern:' + id) window.stopAutoScroll?.();
      renderModernSong(song);
      replaceUrlId(id, 'modern');
      const changed = displayedId !== 'modern:' + id;
      displayedId = 'modern:' + id;
      currentRenderMode = 'modern';
      window.currentSongId = id;
      window.currentBPM = Number(song.userBpm || song.originalBpm) || 120;
      window.recalcSpeed?.();
      if (changed) window.scrollTo(0, 0);
    } catch (error) {
      if (token !== version) return;
      console.warn('Modern Prompter lyrics unavailable:', error);
      const container = document.getElementById('lyrics-container');
      if (container) {
        const message = document.createElement('p');
        message.className = 'modern-prompter-empty';
        message.textContent = error.message || 'Could not load modern lyrics.';
        container.replaceChildren(message);
      }
      // Failed requests never enter an automatic retry/navigation loop.
    }
  }

  async function showSong(rawId, metadata = {}) {
    const raw = String(rawId || '').trim();
    if (!raw) return;
    const token = ++version;
    const id = await resolveId(raw, metadata);
    if (token !== version || !id) return;
    if (displayedId === id && currentRenderMode === 'legacy') return;
    if (displayedId) window.stopAutoScroll?.();
    replaceUrlId(id, 'legacy');
    displayedId = id;
    currentRenderMode = 'legacy';
    originalLoadSong();
  }

  // The original DOMContentLoaded callback will call this wrapper once.
  window.loadSong = function () {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || '';
    if (params.get('source') === 'modern') return showModernSong(id);
    if (displayedId === id && currentRenderMode === 'legacy') return;
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
        const modern = data.prompterLyricsSource === 'modern';
        const raw = String(modern ? data.prompterSongId :
          (data.currentSongId || data.currentLyricsSongId || data.songId) || '').trim();
        if (!raw) return;
        const meta = data.song || data;
        const signature = modern
          ? ['modern', raw, String(data.prompterRequestToken || '')].join('|')
          : ['legacy', raw, value(data, 'lyricsFileId', 'lyricsFileName'),
             value(meta, 'karaokeLyrics', 'songTitle', 'title'),
             value(meta, 'songArtist', 'artist')].join('|');
        if (signature === lastHostKey) return;
        lastHostKey = signature;
        if (modern) void showModernSong(raw);
        else void showSong(raw, meta);
      }, error => console.warn('Slave Lyrics sync failed:', error));
  };

  if (document.getElementById('slaveLyricsToggle')?.checked) window.startSlaveLyrics();
})();