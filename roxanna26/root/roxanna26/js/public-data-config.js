/* Staged migration: enable an act only after its owner-published catalogue and
 * all host/singer consumers have been verified. No automatic legacy fallback. */
window.LK_PUBLIC_CATALOGUE_V1 = Object.freeze({
  'live-karaoke':false,
  'billy-lee':false,
  'roxanna':false
});
