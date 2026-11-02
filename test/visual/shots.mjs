// Real-browser screenshots (Chromium via Playwright) at phone, tablet and laptop sizes, light and dark.
//   node test/visual/shots.mjs            compare with the saved baselines (exit 1 on a large difference)
//   node test/visual/shots.mjs --update   save the current pictures as the new baselines
//   node test/visual/shots.mjs --only=town,typed   only these scenes
// Baselines are made on one machine's fonts and rendering, so re-make them (--update) after changing the look
// on purpose, and expect small differences on other computers. It is not part of `npm test`.
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer, SECRETS } from './server.mjs';
import { loadPlaywright } from './pw.mjs';

const DIR = fileURLToPath(new URL('./', import.meta.url));
const BASE = DIR + 'baseline/';
const OUT = DIR + 'out/';
const UPDATE = process.argv.includes('--update');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const AUDIT = !process.argv.includes('--no-audit');
const MAX_DIFF = 0.01;
const NO_DIFF = new Set(['spot', 'spot-picked']); // the question served varies from run to run: audited and saved, not compared // fail when more than 1% of pixels differ

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'laptop', width: 1366, height: 768, mobile: false },
];
const SCHEMES = ['light', 'dark'];

const { chromium } = loadPlaywright();
let compare = null;
try {
  const { PNG } = await import('pngjs');
  const pixelmatch = (await import('pixelmatch')).default;
  compare = (a, b) => {
    const A = PNG.sync.read(a);
    const B = PNG.sync.read(b);
    if (A.width !== B.width || A.height !== B.height) return { ratio: 1, diff: null, note: `size changed ${A.width}x${A.height} → ${B.width}x${B.height}` };
    const d = new PNG({ width: A.width, height: A.height });
    const n = pixelmatch(A.data, B.data, d.data, A.width, A.height, { threshold: 0.12 });
    return { ratio: n / (A.width * A.height), diff: PNG.sync.write(d) };
  };
} catch {
  console.warn('pngjs/pixelmatch not installed: pictures are saved but not compared. Run: npm i -D pngjs pixelmatch');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(BASE, { recursive: true });

const srv = await startServer();
const j = async (path, opts = {}, token) => {
  const r = await fetch(srv.url + path, { ...opts, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  return r.json();
};
const adminTok = (await j('/api/teacher/login', { method: 'POST', body: JSON.stringify({ username: SECRETS.teacher_user, password: SECRETS.teacher_password }) })).token;
const cls = (await j('/api/t/classes', { method: 'POST', body: JSON.stringify({ name: 'Class 5 Honesty' }) }, adminTok)).class;
await j('/api/t/classes/' + cls.id + '/pupils', { method: 'POST', body: JSON.stringify({ pupils: [{ name: 'Amy Tan', username: 'amytan' }, { name: 'Ben Lim', username: 'benlim' }, { name: 'Cara Ng', username: 'caran' }] }) }, adminTok);
srv.db.prepare("INSERT INTO meta (k, v) VALUES ('open_districts', 1) ON CONFLICT(k) DO UPDATE SET v = 1").run();

const newTeacher = await j('/api/t/teachers', { method: 'POST', body: JSON.stringify({ name: 'Ms Lee', username: 'mslee', classes: [] }) }, adminTok);

const browser = await chromium.launch();
const results = [];
const want = (n) => !ONLY.length || ONLY.includes(n);

// On touch screens every button, tab, field and switch should be at least 44 x 44 px (inline text links are exempt).
async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, input, select, textarea, [role=button], [role=tab], [role=checkbox], [role=radio], summary, a.btn')) {
      if (el.closest('[hidden], dialog:not([open])') || el.disabled && el.type === 'hidden') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label')) {
        const lr = el.closest('label').getBoundingClientRect();
        if (lr.height >= 43.5 && lr.width >= 43.5) continue;
      }
      // words and gaps in "spot the error" sit inside a sentence, so they can only be as wide as the word (WCAG's inline exception)
      if (el.matches('.tok')) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' "' + (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 20) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    return out;
  });
}

async function shoot(page, vp, scheme, name) {
  if (!want(name)) return;
  await page.waitForTimeout(250);
  if (vp.mobile && scheme === 'light') {
    const small = await smallTargets(page);
    if (small.length) results.push({ file: `${name}-${vp.name}`, status: AUDIT ? 'FAIL' : 'note', note: 'small touch targets: ' + small.slice(0, 6).join('; ') + (small.length > 6 ? ` (+${small.length - 6} more)` : '') });
  }
  const file = `${name}-${vp.name}-${scheme}.png`;
  const buf = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
  writeFileSync(OUT + file, buf);
  if (NO_DIFF.has(name)) return results.push({ file, status: 'saved (not compared)' });
  const basePath = BASE + file;
  if (UPDATE || !existsSync(basePath)) {
    writeFileSync(basePath, buf);
    results.push({ file, status: UPDATE ? 'updated' : 'new baseline' });
    return;
  }
  if (!compare) return results.push({ file, status: 'saved (not compared)' });
  const r = compare(readFileSync(basePath), buf);
  if (r.diff) writeFileSync(OUT + 'diff-' + file, r.diff);
  results.push({ file, status: r.ratio > MAX_DIFF ? 'FAIL' : 'ok', note: r.note || (r.ratio * 100).toFixed(2) + '% differ' });
}

const seed = () => {
  // steady "random" so questions and shuffles come out the same each run
  let s = 12345;
  Math.random = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

async function newPupilPage(ctx, who = 'amytan') {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.push({ file: 'page error', status: 'FAIL', note: e.message }));
  await page.addInitScript(seed);
  await page.goto(srv.url + '/');
  await page.locator('#u').fill(who);
  await page.locator('#c').fill(cls.code);
  await page.locator('form button[type=submit]').click();
  await page.waitForSelector('.dcard');
  await page.waitForSelector('dialog.intro[open]', { timeout: 1500 }).catch(() => {});
  for (let i = 0; i < 6 && (await page.locator('dialog.intro[open]').count()); i++) {
    await page.locator('dialog.intro[open] .btn').first().click();
    await page.waitForTimeout(80);
  }
  return page;
}
const onlyModes = (modes) => srv.db.prepare(`UPDATE questions SET active = CASE WHEN mode IN (${modes.join(',')}) THEN 1 ELSE 0 END`).run();
const allModes = () => srv.db.prepare('UPDATE questions SET active = 1').run();
async function startRoute(page) {
  const sel = '.dcard:not(.locked) button';
  for (let i = 0; i < 12; i++) {
    const starts = page.locator(sel);
    if (i >= (await starts.count())) return false;
    await starts.nth(i).click();
    try {
      await page.waitForSelector('textarea.answer, .flow, .opts, .tok, .bubble', { timeout: 4000 });
      return true;
    } catch {
      await page.goto(srv.url + '/');
      await page.waitForSelector('.dcard');
    }
  }
  return false;
}

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    // the same three pupils are used every round, so wipe what the last round saved (prefs, answers, routes)
    for (const t of ['pupil_prefs', 'attempts', 'route_runs']) srv.db.exec('DELETE FROM ' + t);
    // a fresh browser context per page, so each pupil signs in on their own and nothing is remembered
    const mk = () => browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.mobile, isMobile: vp.mobile, colorScheme: scheme, deviceScaleFactor: 1 });

    // --- pupil: town, typed question, receipt, me
    allModes();
    let page = await newPupilPage(await mk());
    await shoot(page, vp, scheme, 'town');
    onlyModes([1]);
    if (await startRoute(page)) {
      await shoot(page, vp, scheme, 'typed');
      await page.locator('textarea.answer').fill('“I am here,” said Mum.');
      await page.getByRole('button', { name: /^Check/ }).first().click();
      await shoot(page, vp, scheme, 'typed-feedback');
      for (let t = 0; t < 2; t++) {
        await page.locator('textarea.answer').fill('');
        await page.locator('textarea.answer').fill('we lost match groaned Daniel ' + t);
        await page.getByRole('button', { name: /^Check/ }).first().click();
        await page.waitForTimeout(150);
      }
      await shoot(page, vp, scheme, 'reveal');
    } else results.push({ file: `typed-${vp.name}-${scheme}`, status: 'FAIL', note: 'could not start a typed route' });
    await page.goto(srv.url + '/');
    await page.waitForSelector('.dcard');
    const me = page.getByRole('button', { name: /^(Me|My progress)/ });
    if (await me.first().isVisible()) await me.first().click();
    await page.waitForTimeout(150);
    await shoot(page, vp, scheme, 'me');
    await page.locator('.mehub').getByRole('button', { name: 'Handbook' }).click();
    await page.waitForSelector('#rule-find');
    await shoot(page, vp, scheme, 'handbook');
    // comfort: extra large text, extra spacing and high contrast together
    await page.goto(srv.url + '/');
    await page.waitForSelector('.dcard');
    if (await me.first().isVisible()) await me.first().click();
    await page.getByRole('button', { name: 'Extra large' }).click();
    await page.locator('.comfort-row', { hasText: 'Extra spacing' }).locator('input').check();
    await page.locator('.comfort-row', { hasText: 'High contrast' }).locator('input').check();
    await shoot(page, vp, scheme, 'me-comfort');
    await page.context().close();

    // --- pupil: tap question (mode 6) and choose-best (mode 4)
    page = await newPupilPage(await mk(), 'benlim');
    onlyModes([6]);
    if (await startRoute(page)) await shoot(page, vp, scheme, 'tap');
    await page.context().close();
    page = await newPupilPage(await mk(), 'caran');
    onlyModes([4]);
    if (await startRoute(page)) await shoot(page, vp, scheme, 'choose');
    await page.context().close();
    page = await newPupilPage(await mk(), 'amytan');
    onlyModes([2]);
    srv.db.exec('UPDATE questions SET active = 0 WHERE mode = 2 AND id NOT IN (SELECT id FROM questions WHERE mode = 2 ORDER BY id LIMIT 30)'); // a fixed pool keeps the picture the same each run
    if (await startRoute(page)) {
      await shoot(page, vp, scheme, 'spot');
      const toks = page.locator('.tok.word');
      if ((await toks.count()) > 2) {
        await toks.nth(1).click();
        await page.locator('.tok.gap').nth(2).click();
        await shoot(page, vp, scheme, 'spot-picked');
      }
    }
    await page.context().close();
    allModes();

    // --- teacher: dashboard and game settings
    page = await (await mk()).newPage();
    await page.addInitScript(seed);
    await page.goto(srv.url + '/teacher.html');
    await page.locator('input[type=text], input:not([type])').first().fill(SECRETS.teacher_user);
    await page.locator('input[type=password]').first().fill(SECRETS.teacher_password);
    await page.getByRole('button', { name: /Sign in/i }).first().click();
    await page.waitForSelector('[role=tab]');
    await page.waitForTimeout(500);
    await shoot(page, vp, scheme, 'dashboard');
    await page.getByRole('button', { name: 'Amy Tan' }).first().click();
    await page.waitForSelector('dialog.drawer[open] .stat');
    await page.waitForTimeout(300);
    await shoot(page, vp, scheme, 'pupil-panel');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.getByRole('tab', { name: 'Classes & pupils' }).click();
    await page.waitForTimeout(500);
    await shoot(page, vp, scheme, 'classes');
    await page.getByRole('tab', { name: 'Questions' }).click();
    await page.waitForSelector('.bulkbar', { state: 'attached' });
    await page.waitForTimeout(500);
    await shoot(page, vp, scheme, 'question-bank');
    await page.locator('table.tbl tbody input[type=checkbox]').nth(0).check();
    await page.locator('table.tbl tbody input[type=checkbox]').nth(1).check();
    await page.waitForTimeout(200);
    await shoot(page, vp, scheme, 'question-bank-selected');
    await page.getByRole('tab', { name: 'Game settings' }).click();
    await page.waitForTimeout(500);
    await shoot(page, vp, scheme, 'game-settings');
    await page.context().close();

    // --- first sign-in of a new teacher account: must choose a password
    page = await (await mk()).newPage();
    await page.addInitScript(seed);
    await page.goto(srv.url + '/teacher.html');
    await page.locator('input[type=text], input:not([type])').first().fill('mslee');
    await page.locator('input[type=password]').first().fill(newTeacher.password);
    await page.getByRole('button', { name: /Sign in/i }).first().click();
    await page.waitForSelector('dialog.forcepw[open]');
    await page.waitForTimeout(400);
    await shoot(page, vp, scheme, 'forced-password');
    await page.context().close();

    // --- style guide
    page = await (await mk()).newPage();
    await page.goto(srv.url + '/styleguide.html');
    await shoot(page, vp, scheme, 'styleguide');
    await page.context().close();
  }
}
await browser.close();
await srv.close();

const bad = results.filter((r) => r.status === 'FAIL');
for (const r of results) console.log((r.status === 'FAIL' ? 'FAIL ' : r.status.padEnd(14)) + ' ' + r.file + (r.note ? '  (' + r.note + ')' : ''));
console.log(`\n${results.length} pictures, ${bad.length} failing. Pictures are in test/visual/out/${UPDATE ? ' and the baselines were updated' : ''}.`);
process.exit(bad.length ? 1 : 0);
