// 1.8.0: fonts that come from our own server, the style guide, and the dark-mode fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const P = (f) => fileURLToPath(new URL('../public/' + f, import.meta.url));
const read = (f) => readFileSync(P(f), 'utf8');

test('fonts are served from our own files: no Google links, every font file exists, licences included', () => {
  for (const page of ['index.html', 'teacher.html', 'styleguide.html']) {
    const html = read(page);
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), page + ' does not call Google');
    assert.match(html, /href="\/fonts\.css"/);
  }
  const css = read('fonts.css');
  const files = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(files.length >= 7, 'body and heading faces are all there');
  for (const f of files) {
    const path = P(f.replace(/^\//, ''));
    assert.ok(existsSync(path), f + ' exists');
    assert.ok(statSync(path).size > 5000, f + ' is a real font file');
    assert.equal(readFileSync(path).subarray(0, 4).toString('latin1'), 'wOF2', f + ' is woff2');
  }
  assert.ok(/font-display:\s*swap/.test(css), 'text shows straight away while a font loads');
  assert.ok(readdirSync(P('fonts')).filter((n) => n.endsWith('.txt')).length >= 2, 'the licences travel with the fonts');
  assert.ok(!/googleapis|gstatic/.test(read('app.css')));
});

test('the service worker keeps the fonts for offline use, and fonts are cached for a year', () => {
  const sw = read('sw.js');
  const sandbox = { self: { addEventListener() {}, location: { origin: 'https://x' } }, caches: {}, URL, fetch() {}, Response, setTimeout, clearTimeout };
  vm.runInNewContext(sw + '\n;globalThis.__SHELL = SHELL;', sandbox);
  assert.ok(sandbox.__SHELL.includes('/fonts.css'));
  const fonts = sandbox.__SHELL.filter((u) => u.startsWith('/fonts/'));
  assert.ok(fonts.length >= 7);
  for (const f of fonts) assert.ok(existsSync(P(f.replace(/^\//, ''))), f + ' exists, or the whole install would fail');
  assert.match(read('_headers'), /\/fonts\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
});

test('the style guide exists, is not linked from the apps, and carries no data', () => {
  const sg = read('styleguide.html');
  assert.match(sg, /Style guide/);
  assert.ok(!/fetch\(|\/api\//.test(sg), 'no data');
  assert.match(sg, /noindex/);
  for (const f of ['index.html', 'teacher.html', 'app.js', 'teacher.js']) assert.ok(!/styleguide/.test(read(f)), f + ' does not link to it');
  for (const part of ['btn ghost', 'btn danger', 'result good', 'result bad', 'net-fail', 'class="opt"', 'dock']) assert.ok(sg.includes(part), 'shows ' + part);
});

test('touch screens get 44px targets, and ghost and danger buttons stay readable in dark mode', () => {
  const css = read('app.css');
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
  for (const sel of ['.btn', '.tab', 'select', '.swatch']) assert.ok(coarse.includes(sel), sel + ' is covered');
  assert.match(coarse, /min-height: 44px/);
  assert.match(css, /\.btn\.ghost \{ color: var\(--ink\); \}/, 'ghost buttons use the page ink, not the yellow-button ink');
  assert.match(css, /--on-bad: #2a0b10/, 'danger text is dark on the light dark-mode red');
});
