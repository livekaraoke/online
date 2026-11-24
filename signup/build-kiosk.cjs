/* Regenerate the standalone kiosk's embedded startup assets from their canonical
 * source files. Run: node signup/build-kiosk.cjs
 * Check for stale embedded assets: node signup/build-kiosk.cjs --check
 */
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, 'sign up.html');
const original = fs.readFileSync(target, 'utf8');
let html = original;
for (const [name, tag, file] of [
  ['CSS', 'style', 'signup.css'],
  ['POLICY', 'script', 'kiosk-policy.js'],
  ['JS', 'script', 'signup.js']
]) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8').trimEnd();
  if (new RegExp('</' + tag, 'i').test(source)) throw new Error('Unsafe closing tag in ' + file);
  const begin = '<!-- KIOSK_' + name + '_BEGIN -->';
  const end = '<!-- KIOSK_' + name + '_END -->';
  const start = html.indexOf(begin);
  const stop = html.indexOf(end);
  if (start < 0 || stop <= start || html.indexOf(begin, start + begin.length) >= 0 ||
      html.indexOf(end, stop + end.length) >= 0) throw new Error('Invalid markers for ' + file);
  html = html.slice(0, start) + begin + '\n<' + tag + '>\n' + source +
    '\n</' + tag + '>\n' + end + html.slice(stop + end.length);
}
if (process.argv.includes('--check')) {
  if (html !== original) { console.error('Kiosk assets are stale; run node signup/build-kiosk.cjs'); process.exitCode = 1; }
  else console.log('Kiosk startup assets are current.');
} else {
  fs.writeFileSync(target, html, 'utf8');
}
