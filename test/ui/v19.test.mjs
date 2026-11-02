// 1.9.0 in the browser simulation: comfort settings, join links, handbook, feedback comparison, coach tips, moments, class QR.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/index.js';
import { makeWorld, mount, sleep, adminToken, a11yProblems, closeAll } from './helpers.mjs';

test.after(closeAll);

const guestIn = async (page) => {
  await page.until(() => page.btn('Guest'), 'auth screen');
  page.btn('Guest').click();
  await sleep();
  page.btn('Play as a guest').click();
  await page.until(() => page.$$('.dcard').length === 12, 'the town');
  await sleep(150);
};
const intro = async (page) => {
  for (let i = 0; i < 3; i++) {
    page.$('dialog.intro .btn').click();
    await sleep();
  }
};
const onlyMode1 = (world) => world.db.prepare('UPDATE questions SET active = 0 WHERE mode != 1').run();
const goMe = async (page) => {
  page.$$('nav.bottomnav button').find((b) => b.textContent.startsWith('Me')).click();
  await sleep(100);
};
const api = async (world, path, body, token) => (await worker.fetch(new Request('http://x/api' + path, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) }), world.env, {})).json();

test('comfort settings: text size, spacing, contrast and calm mode apply at once, are saved to the account, and calm silences sound and the timer', async () => {
  const world = makeWorld();
  const page = mount(world, 'index.html');
  await guestIn(page);
  await intro(page);
  const html = page.w.document.documentElement;
  assert.equal(html.getAttribute('data-text'), 'm');
  await goMe(page);
  assert.ok(page.$('section[aria-labelledby=comfort-h]'), 'a Comfort panel under Me');
  page.exact('Large').click();
  assert.equal(html.getAttribute('data-text'), 'l');
  await goMe(page).catch(() => {});
  const box = (label) => [...page.$$('.comfort-row')].find((r) => r.textContent.includes(label)).querySelector('input');
  box('Extra spacing').click();
  assert.equal(html.getAttribute('data-spacing'), 'wide');
  box('High contrast').click();
  assert.equal(html.getAttribute('data-contrast'), 'high');
  box('Calm mode').click();
  assert.equal(html.getAttribute('data-calm'), 'on');
  await sleep(600); // saved a moment after the last change
  const pid = world.db.prepare('SELECT id FROM pupils ORDER BY id DESC LIMIT 1').get().id;
  const saved = JSON.parse(world.db.prepare('SELECT prefs FROM pupil_prefs WHERE pupil_id = ?').get(pid).prefs);
  assert.deepEqual({ text: saved.text, spacing: saved.spacing, contrast: saved.contrast, calm: saved.calm }, { text: 'l', spacing: true, contrast: true, calm: true });
  assert.ok(page.$('#soundbtn').disabled, 'calm mode keeps the sound button off');
  assert.equal(page.w.DashSfx.enabled(), false);
  assert.deepEqual(a11yProblems(page), []);
  // a route in calm mode shows no delivery clock
  page.$$('nav.bottomnav button')[0].click();
  await sleep(100);
  page.btn('Start').click();
  await page.until(() => page.$('#strip'), 'the route');
  assert.ok(!page.$('#clockfill'), 'no timer in calm mode');
  assert.deepEqual(page.errors, []);
});

test('the server only accepts known comfort values', async () => {
  const world = makeWorld();
  const tok = (await (await worker.fetch(new Request('http://x/api/guest', { method: 'POST' }), world.env, {})).json()).token;
  const put = async (b) => worker.fetch(new Request('http://x/api/prefs', { method: 'PUT', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }), world.env, {});
  assert.equal((await put({ text: 'xl', calm: true })).status, 200);
  assert.equal((await put({ text: 'huge' })).status, 400);
  assert.equal((await put({ calm: 'yes' })).status, 400);
  const me = await (await worker.fetch(new Request('http://x/api/me', { headers: { authorization: 'Bearer ' + tok } }), world.env, {})).json();
  assert.equal(me.prefs.text, 'xl');
  assert.equal(me.prefs.calm, true);
});

test('a join link fills in the class code, and "Not you? Switch" clears the name but keeps the code', async () => {
  const world = makeWorld();
  const t = await adminToken(world);
  const cls = (await api(world, '/t/classes', { name: '5 Honesty' }, t)).class;
  await api(world, `/t/classes/${cls.id}/pupils`, { pupils: [{ name: 'Amy Tan', username: 'amytan' }] }, t);
  const page = mount(world, 'index.html', { pre: (w) => w.history.replaceState({}, '', '/?class=' + cls.code.toLowerCase() + '&x=1') });
  await page.until(() => page.$('#c'), 'the sign-in form');
  assert.equal(page.$('#c').value, cls.code, 'class code filled in, in capitals');
  assert.equal(page.$('#u').value, '', 'no username is guessed');
  page.type(page.$('#u'), 'amytan');
  page.$('form').dispatchEvent(new page.w.Event('submit', { cancelable: true }));
  await page.until(() => page.$$('.dcard').length === 12, 'the town');
  await sleep(150);
  await intro(page);
  assert.ok(page.$('.notyou'), '"Not you?" is on the town screen');
  page.$('.notyou').click();
  await page.until(() => page.$('#c'), 'back at sign-in');
  assert.equal(page.$('#u').value, '', 'the last pupil’s name is not left behind');
  assert.equal(page.$('#c').value, cls.code, 'the class code is kept');
});

test('the handbook: one card per rule with an example, search, deep link, and Try one', async () => {
  const world = makeWorld();
  const page = mount(world, 'index.html');
  await guestIn(page);
  await intro(page);
  await goMe(page);
  page.btn('Handbook').click();
  await page.until(() => page.$('#rule-find'), 'the handbook');
  assert.equal(page.$$('.rule-card').length, 12);
  assert.ok(page.$('#rule-4'), 'every rule has an anchor');
  assert.ok([...page.$$('.rule-card')].every((c) => /Example/.test(c.textContent)));
  page.type(page.$('#rule-find'), 'comma');
  assert.ok(page.$$('.rule-card:not([hidden])').length >= 1 && page.$$('.rule-card:not([hidden])').length < 12);
  assert.match(page.$('[role=status]').textContent, /match/);
  page.type(page.$('#rule-find'), 'zzzz');
  assert.match(page.$('[role=status]').textContent, /No rule matches/);
  page.type(page.$('#rule-find'), '');
  assert.equal(page.$$('.rule-card:not([hidden])').length, 12);
  assert.ok(page.$('#rule-1').textContent.includes('Try one in'), 'an open district offers a route');
  assert.match(page.$('#rule-10').textContent, /Opens at level 20/, 'a locked one says when');
  page.$('#rule-1 .btn').click();
  await page.until(() => page.$('#strip'), 'a route started from the handbook');
  assert.deepEqual(a11yProblems(page), []);
});

test('feedback: a missed typed answer shows yours and the model with changes marked, and rule links open the handbook', async () => {
  const world = makeWorld();
  onlyMode1(world);
  const page = mount(world, 'index.html');
  await guestIn(page);
  await intro(page);
  page.btn('Start').click();
  await page.until(() => page.$('textarea.answer'), 'a question');
  assert.ok(page.$('.coach'), 'first route: a tip from Dot');
  assert.match(page.$('.coach').textContent, /1\/3/);
  for (let t = 0; t < 3; t++) {
    // right words, no punctuation: the engine names the rules that were missed
    const prompt = page.$('.bubble.pre').textContent;
    const row = world.db.prepare('SELECT data FROM questions WHERE mode = 1').all().find((r) => JSON.parse(r.data).prompt === prompt);
    page.type(page.$('textarea.answer'), JSON.parse(row.data).correct.replace(/[“”".,!?]/g, '').toLowerCase());
    (page.btn('Check again') || page.btn('Check')).click();
    await page.until(() => page.$('.result.bad'), 'feedback ' + t);
    if (t === 0) {
      assert.ok(page.$('.rule-link'), 'a link to the rule');
      assert.ok(!page.$('.cmp'), 'the model is not shown until the answer is revealed');
    }
    await sleep(60);
  }
  await page.until(() => page.$('.cmp'), 'the comparison');
  assert.match(page.$('.cmp').textContent, /Yours/);
  assert.match(page.$('.cmp').textContent, /The model/);
  assert.ok(page.$('.chg-del') && page.$('.chg-add'), 'changes are marked');
  assert.ok(page.$('.chg-del .sr'), 'and described for screen readers, not only coloured');
  page.$('.rule-link').click();
  await sleep(50);
  assert.ok(page.$('dialog[aria-label="The handbook"]').hasAttribute('open'), 'the handbook opens without losing the route');
  assert.ok(page.$('#strip'), 'the route is still there');
  assert.deepEqual(page.errors, []);
});

test('coach tips can be hidden for good, and "Replay Dot’s intro" brings the intro back', async () => {
  const world = makeWorld();
  const page = mount(world, 'index.html');
  await guestIn(page);
  await intro(page);
  page.btn('Start').click();
  await page.until(() => page.$('.coach'), 'a tip');
  page.btn('Hide tips').click();
  assert.ok(!page.$('.coach'));
  page.btn('Quit').click();
  await page.until(() => page.$$('.dcard').length === 12, 'town');
  await sleep(100);
  page.btn('Start').click();
  await page.until(() => page.$('#strip'), 'a second route');
  assert.ok(!page.$('.coach'), 'stays hidden');
  page.btn('Quit').click();
  await page.until(() => page.$$('.dcard').length === 12, 'town');
  await sleep(100);
  await goMe(page);
  page.btn('Replay Dot’s intro').click();
  await page.until(() => page.$('dialog.intro'), 'the intro again');
  assert.match(page.$('dialog.intro').textContent, /Welcome to Dash Express/);
});

test('a finished route that earns a new level or district shows a one-time celebration', async () => {
  const world = makeWorld();
  onlyMode1(world);
  const page = mount(world, 'index.html');
  await guestIn(page);
  await intro(page);
  // give the pupil nearly a level so one route tips them over
  const pid = world.db.prepare('SELECT id FROM pupils ORDER BY id DESC LIMIT 1').get().id;
  world.db.prepare("INSERT INTO attempts (pupil_id, question_id, mode, try_no, correct, xp, ts) SELECT ?1, id, 2, 1, 1, 45, ?2 FROM questions WHERE mode = 2 LIMIT 1").run(pid, Date.now() - 1000 * 60 * 60 * 24 * 3);
  await page.w.DashSfx.setEnabled(false, { quiet: true });
  page.btn('Hide tips');
  page.btn('Start').click();
  for (let n = 0; n < 5; n++) {
    await page.until(() => page.$('textarea.answer'), 'question ' + n);
    const prompt = page.$('.bubble.pre').textContent;
    const row = world.db.prepare('SELECT data FROM questions WHERE mode = 1').all().find((r) => JSON.parse(r.data).prompt === prompt);
    page.type(page.$('textarea.answer'), JSON.parse(row.data).correct);
    page.btn('Check').click();
    await page.until(() => page.btn('Next stop') || page.btn('Finish route'), 'result ' + n);
    (page.btn('Next stop') || page.btn('Finish route')).click();
    await sleep(60);
  }
  await page.until(() => page.$('.receipt'), 'the receipt');
  await sleep(200);
  const dlg = page.$('dialog.moment');
  assert.ok(dlg && dlg.hasAttribute('open'), 'a celebration opens');
  let seen = '';
  for (let i = 0; i < 6 && page.$('dialog.moment'); i++) {
    seen += page.$('dialog.moment').textContent;
    page.$('dialog.moment .btn').click();
    await sleep(30);
  }
  assert.match(seen, /Level \d/);
  assert.match(seen, /New ride/);
  assert.ok(!page.$('dialog.moment'), 'tapping through closes it');
  assert.match(page.text(), /Level up!/, 'the banner stays on the receipt as a record');
  assert.deepEqual(page.errors, []);
});

test('teachers get a join link and QR code on the class sign-in cards', async () => {
  const world = makeWorld();
  const t = await adminToken(world);
  const cls = (await api(world, '/t/classes', { name: '5 Honesty' }, t)).class;
  await api(world, `/t/classes/${cls.id}/pupils`, { pupils: [{ name: 'Amy Tan', username: 'amytan' }, { name: 'Ben Lim', username: 'benlim' }] }, t);
  const page = mount(world, 'teacher.html', { pre: (w) => w.localStorage.setItem('dd_ttoken', t) });
  await page.until(() => page.$('nav.tabs'), 'console');
  [...page.$$('nav.tabs button')].find((b) => b.textContent.trim() === 'Classes & pupils').click();
  await page.until(() => page.btn('Open'), 'class list');
  page.btn('Open').click();
  await page.until(() => page.btn('Sign-in cards'), 'class page');
  page.btn('Sign-in cards').click();
  await page.until(() => page.$('.joinbox'), 'the join box');
  assert.match(page.$('.joinlink').textContent, new RegExp('/\\?class=' + cls.code));
  assert.equal(page.$$('svg.qr').length, 3, 'one QR for the class and one on each pupil card');
  assert.ok(page.$('svg.qr path').getAttribute('d').length > 200, 'the QR has real modules');
  assert.equal(page.$$('.sheet-card').length, 2);
  assert.deepEqual(a11yProblems(page), []);
  assert.deepEqual(page.errors, []);
});
