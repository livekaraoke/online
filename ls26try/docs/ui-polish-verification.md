# PR 21 verification

The PR branch has been reconciled with main at `46885271b696792a4ab060cf598d3c9d3420c9b8`.

## Browser checks

`verification/ui-polish.cjs` serves the repository locally and intercepts every
external request. Firebase is replaced with `verification/firebase-fixture.js`;
no live database changes are made. Run with Playwright installed:

```sh
node ls26try/verification/ui-polish.cjs
```

An existing Chromium executable can be selected with `CHROMIUM_EXECUTABLE_PATH`.
Optional `LS26_TEST_ARTIFACTS` specifies a folder for verification screenshots.

Passed in Chromium:

- Creator and LyricView have identical content widths and character-level line
  breaks at 768, 1024 and 1280px viewport widths, at 100% and 125% text scale.
- Bb retains its authored spelling at zero transposition.
- The performance tempo controls fit within the drawer at all three widths;
  increment/decrement controls and the karaoke checkbox still work.
- Song-note saving updates the fixture and shows its confirmation at the lower left.
- The creator return control is hidden while scrolling down, appears when
  scrolling up, and returns to the top without reappearing during its animation.
- The next-gig card excludes old unclosed bookings, displays the separate weekday,
  day, month and year, and its clock causes no additional database reads.
- Calendar toggle and the disabled dashboard status indicator behave as intended.
- Screenshots of the Creator, INFO drawer and gig rows were visually inspected.

## Other checks

- The two tests in `tests/chord-spelling.test.cjs` pass, including accidental
  spelling, zero/octave shifts, reset, negative transposition and slash bass notes.
- Modified JavaScript passes Node syntax checks and the diff passes whitespace checks.
- The existing 22-test suite has 12 passes and 10 failures, both on unmodified main
  and on this branch. The same tests fail in both runs; these are not claimed fixed.

## Review limits

Wrapping parity assumes the same viewport, font availability and text scale.
Different devices or orientation can naturally produce different line breaks.
The user's earlier marked screenshots and standalone icon attachment were not
available in this conversation. The header reuses the repository's RGBA transparent
PNG and clips it to its LS icon. The toast uses the lower-left position described
in the prior PR. Exact correspondence with those original images needs user review.
