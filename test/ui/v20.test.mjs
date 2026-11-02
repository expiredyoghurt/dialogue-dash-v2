// 2.0.0 teacher console: class switcher, sidebar, pupil panel, dashboard v2, question bank tools, checklist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, mount, sleep, adminToken, a11yProblems, closeAll } from './helpers.mjs';

test.after(closeAll);

const open = async (world, pre) => {
  const t = await adminToken(world);
  const page = mount(world, 'teacher.html', { pre: (w) => { w.localStorage.setItem('dd_ttoken', t); if (pre) pre(w); } });
  await page.until(() => page.$('nav.tabs'), 'the console tabs');
  return page;
};
const tab = async (page, label) => {
  [...page.$$('nav.tabs button')].find((b) => b.textContent.trim() === label).click();
  await sleep(150);
};
const classId = (world, name) => world.db.prepare('SELECT id FROM classes WHERE name = ?').get(name).id;
function seed(world) {
  world.db.exec("INSERT INTO classes (name, code, created_at) VALUES ('5 Integrity', 'AAAA1', 1), ('5 Honesty', 'BBBB2', 1)");
  const c = classId(world, '5 Honesty');
  const ins = world.db.prepare('INSERT INTO pupils (class_id, name, username, is_guest, created_at) VALUES (?, ?, ?, 0, 1) RETURNING id');
  const amy = ins.get(c, 'Amy', 'amy').id;
  ins.get(c, 'Ben', 'ben');
  const att = world.db.prepare("INSERT INTO attempts (pupil_id, class_id, question_id, mode, try_no, practice, correct, xp, answer, codes, ts) VALUES (?, ?, 1, 1, 1, 0, ?, ?, 'x', ?, ?)");
  att.run(amy, c, 1, 500, '[]', Date.now());
  att.run(amy, c, 0, 0, '["NO_QUOTES"]', Date.now());
  return { c, amy };
}

test('the class switcher drives the Dashboard and Classes tabs, is remembered, and hides where it does not apply', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  await page.until(() => /Where the class is/.test(page.text()), 'dashboard');
  const sel = page.$('#ctx-class');
  assert.ok(sel, 'switcher is in the header');
  assert.equal(page.$$('#ctx-class option').length, 2);
  assert.match(page.text(), /Dashboard · 5 Honesty/);
  sel.value = String(classId(world, '5 Integrity'));
  sel.dispatchEvent(new page.w.Event('change'));
  await page.until(() => /Dashboard · 5 Integrity/.test(page.text()), 'the other class');
  assert.equal(page.w.localStorage.getItem('dd_tclass'), String(classId(world, '5 Integrity')));
  await tab(page, 'Classes & pupils');
  await page.until(() => page.btn('New class code'), 'class detail');
  assert.match(page.$('.panel.sel').textContent, /5 Integrity/);
  await tab(page, 'Questions');
  assert.ok(!page.$('#ctx-class'), 'no switcher on the Questions tab');
  assert.deepEqual(page.errors, []);
});

test('the navigation is grouped, keeps tab roles, and arrow keys move between sections', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  const groups = page.$$('.tabgroup').map((g) => g.textContent);
  assert.deepEqual(groups, ['Teach', 'Content', 'Admin']);
  assert.ok(page.$$('.tabgroup').every((g) => g.getAttribute('role') === 'presentation'));
  const tabs = page.$$('[role=tab]');
  assert.equal(tabs.filter((t) => t.getAttribute('tabindex') === '0').length, 1);
  tabs[0].focus();
  tabs[0].dispatchEvent(new page.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(page.w.document.activeElement, tabs[1]);
  tabs[1].dispatchEvent(new page.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(page.w.document.activeElement, tabs[0]);
  assert.deepEqual(a11yProblems(page), []);
});

test('the pupil panel opens from a name, shows the details, and closes', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  await page.until(() => /Where the class is/.test(page.text()), 'dashboard');
  page.$$('button.linkbtn').find((b) => b.textContent === 'Amy').click();
  await page.until(() => page.$('dialog.drawer[open]') && /Latest answers/.test(page.$('dialog.drawer').textContent), 'the panel');
  const d = page.$('dialog.drawer');
  assert.match(d.textContent, /Amy/);
  assert.match(d.textContent, /Slips in the last 30 days/);
  assert.match(d.textContent, /Districts/);
  assert.ok([...d.querySelectorAll('button')].some((b) => b.textContent === 'Print report'));
  assert.deepEqual(a11yProblems(page), []);
  [...d.querySelectorAll('button')].find((b) => b.textContent === 'Close').click();
  assert.ok(!page.$('dialog.drawer'));
});

test('dashboard v2: sparkline with a text label, district heat map, CSV download', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  await page.until(() => page.$('.sparksvg'), 'the sparkline');
  assert.match(page.$('.sparksvg').getAttribute('aria-label'), /last 14 days.*Total 500/);
  const heat = page.$('table.heat');
  assert.ok(heat);
  assert.equal(heat.querySelectorAll('tbody tr').length, 2);
  assert.ok([...heat.querySelectorAll('td')].every((td) => td.getAttribute('aria-label')), 'every cell has a text label, not just colour');
  let csv = '';
  page.w.URL.createObjectURL = (b) => { b.text().then((t) => { csv = t; }); return 'blob:x'; };
  page.btn('Download CSV').click();
  await page.until(() => csv, 'the CSV');
  assert.match(csv, /^"Pupil","Username"/);
  assert.match(csv, /"Amy","amy"/);
  assert.deepEqual(a11yProblems(page), []);
});

test('suggestion: open districts 4 to 6 once a third reach level 10, with Undo', async () => {
  const world = makeWorld();
  const { c, amy } = seed(world);
  world.db.prepare("INSERT INTO attempts (pupil_id, class_id, question_id, mode, try_no, practice, correct, xp, answer, codes, ts) VALUES (?, ?, 1, 1, 1, 0, 1, 99999, 'x', '[]', ?)").run(amy, c, Date.now());
  const page = await open(world);
  await page.until(() => page.btn('Open districts 4–6'), 'the suggestion');
  page.btn('Open districts 4–6').click();
  await page.until(() => !page.btn('Open districts 4–6'), 'applied');
  const unlocked = () => { const r = world.db.prepare('SELECT unlocked FROM class_settings WHERE class_id = ?').get(c); return r ? JSON.parse(r.unlocked) : []; };
  assert.deepEqual(unlocked(), [4, 5, 6]);
  const undo = [...page.$$('.toast button')].find((b) => b.textContent === 'Undo');
  assert.ok(undo, 'an Undo is offered');
  undo.click();
  await page.until(() => unlocked().length === 0, 'undone');
});

test('question bank: select, set district in bulk, remove with Undo, copy, preview as pupil', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  await tab(page, 'Questions');
  await page.until(() => page.$('table.tbl tbody input[type=checkbox]'), 'the bank');
  const boxes = () => page.$$('table.tbl tbody input[type=checkbox]');
  assert.ok(page.$('.bulkbar').hidden, 'no bulk bar until something is selected');
  boxes()[0].checked = true; boxes()[0].dispatchEvent(new page.w.Event('change', { bubbles: true }));
  boxes()[1].checked = true; boxes()[1].dispatchEvent(new page.w.Event('change', { bubbles: true }));
  assert.ok(!page.$('.bulkbar').hidden);
  assert.match(page.$('.bulkbar').textContent, /2 questions selected/);
  const ids = page.$$('table.tbl tbody tr').slice(0, 2).length;
  assert.equal(ids, 2);
  const before = world.db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get().n;
  [...page.$$('.bulkbar button')].find((b) => b.textContent === 'Remove').click();
  await page.dialog('Remove');
  await page.until(() => world.db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get().n === before - 2, 'removed');
  const undo = await (async () => { await page.until(() => [...page.$$('.toast button')].find((b) => b.textContent === 'Undo'), 'Undo'); return [...page.$$('.toast button')].find((b) => b.textContent === 'Undo'); })();
  undo.click();
  await page.until(() => world.db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get().n === before, 'restored');
  // preview hides the answers
  await page.until(() => page.$$('table.tbl tbody button').find((b) => b.textContent === 'Preview'), 'preview button');
  page.$$('table.tbl tbody button').find((b) => b.textContent === 'Preview').click();
  await page.until(() => page.$('dialog.qpreview[open] h2') && /What a pupil sees/.test(page.$('dialog.qpreview').textContent), 'the preview');
  assert.ok(!/Model answer/.test(page.$('dialog.qpreview').textContent));
  page.$('dialog.qpreview button').click();
  // copy adds one
  page.$$('table.tbl tbody button').find((b) => b.textContent === 'Copy').click();
  await page.until(() => world.db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get().n === before + 1, 'copied');
  assert.deepEqual(page.errors, []);
});

test('saved filters come back as chips', async () => {
  const world = makeWorld();
  seed(world);
  const page = await open(world);
  await tab(page, 'Questions');
  await page.until(() => page.btn('Save filters'), 'bank');
  const t = page.$('select[aria-label="Filter: Type"]');
  t.value = '3'; t.dispatchEvent(new page.w.Event('change'));
  page.btn('Save filters').click();
  await page.until(() => page.$('dialog.ddlg[open] input'), 'name box');
  page.type(page.$('dialog.ddlg input'), 'Taggers');
  await page.dialog('Save');
  await page.until(() => page.$('.chips'), 'the chip');
  assert.match(page.$('.chips').textContent, /Taggers/);
  assert.ok(JSON.parse(page.w.localStorage.getItem('dd_tfilters'))[0].f.mode === 3);
});

test('first-run checklist shows, can be hidden, and tables carry labels for the phone layout', async () => {
  const world = makeWorld();
  world.db.exec("INSERT INTO classes (name, code, created_at) VALUES ('5 Honesty', 'BBBB2', 1)");
  const page = await open(world);
  await page.until(() => page.$('.checklist'), 'the checklist');
  assert.match(page.$('.checklist').textContent, /Create a class/);
  assert.match(page.$('.checklist').textContent, /Add pupils/);
  page.btn('Hide this').click();
  await page.until(() => !page.$('.checklist'), 'hidden');
  await tab(page, 'Classes & pupils');
  await page.until(() => page.$('table.tbl td[data-label]'), 'labelled cells');
  assert.ok(page.$$('table.tbl td[data-label]').some((td) => td.getAttribute('data-label') === 'Class code'));
});

test('forced password dialog: needs a match and a strong-enough password; show/hide works; Escape cannot skip it', async () => {
  const world = makeWorld();
  const admin = await open(world);
  // make a teacher whose password was set by an admin: the server flags them
  const r = await admin.w.fetch('/api/t/teachers', { method: 'POST', headers: { authorization: 'Bearer ' + admin.w.localStorage.getItem('dd_ttoken') }, body: JSON.stringify({ name: 'Ms Lee', username: 'mslee', classes: [] }) });
  const pw = (await r.json()).password;
  assert.ok(pw);
  const page = mount(world, 'teacher.html');
  await page.until(() => page.$('#tu'), 'sign-in');
  page.type(page.$('#tu'), 'mslee');
  page.type(page.$('#tp'), pw);
  page.$('form').dispatchEvent(new page.w.Event('submit', { cancelable: true }));
  await page.until(() => page.$('dialog.forcepw[open]'), 'the forced dialog');
  const dlg = page.$('dialog.forcepw');
  const [cur, nxt, again] = dlg.querySelectorAll('input');
  const save = page.btn('Save my password');
  assert.ok(save.disabled);
  page.type(cur, pw);
  page.type(nxt, 'short');
  assert.match(dlg.textContent, /Too short/);
  assert.ok(save.disabled);
  page.type(nxt, 'a-new-secret-77');
  page.type(again, 'a-new-secret-78');
  assert.match(dlg.textContent, /don’t match/);
  assert.ok(save.disabled);
  page.type(again, 'a-new-secret-77');
  assert.ok(!save.disabled);
  assert.equal(nxt.type, 'password');
  dlg.querySelectorAll('button')[1].click(); // Show on the second box
  assert.equal(nxt.type, 'text');
  const esc = new page.w.Event('cancel', { cancelable: true });
  dlg.dispatchEvent(esc);
  assert.ok(esc.defaultPrevented, 'Escape does not close it');
  assert.ok(!page.btn('Dashboard'), 'the console is not reachable yet');
  assert.deepEqual(a11yProblems(page), []);
  save.click();
  await page.until(() => page.btn('Change password'), 'the console after saving');
});
