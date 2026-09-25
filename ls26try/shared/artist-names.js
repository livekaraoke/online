/* Shared artist presentation and search aliases. Does not modify stored records. */
(() => {
  'use strict';
  function display(value) {
    const name = String(value ?? '').trim();
    const match = name.match(/^(.+),\s*(the|an|a)$/i);
    if (!match) return name;
    const article = match[2].toLowerCase();
    return `${article[0].toUpperCase()}${article.slice(1)} ${match[1].trim()}`;
  }
  function aliases(value) {
    const name = display(value);
    const match = name.match(/^(the|an|a)\s+(.+)$/i);
    return [...new Set([name, String(value ?? '').trim(), ...(match ? [`${match[2]}, ${match[1]}`] : [])])];
  }
  function normalizeSearch(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'")
      .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function searchText(song, extra = '') {
    const title = song.title || song.songTitle || '';
    const artist = song.artist || song.songArtist || '';
    // Put every alias beside the title too, so title + artist searches still work.
    return normalizeSearch(aliases(artist).map(name => `${title} ${name} ${song.year || ''} ${extra}`).join(' | '));
  }
  const matchesSong = (song, query, extra = '') => searchText(song, extra).includes(normalizeSearch(query));
  const matchesArtist = (artist, query) => aliases(artist).some(name => normalizeSearch(name).includes(normalizeSearch(query)));
  const api = {display, aliases, normalizeSearch, searchText, matchesSong, matchesArtist};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.ArtistNames = api;
})();
