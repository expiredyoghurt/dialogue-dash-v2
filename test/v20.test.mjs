// 2.0.0: forced password change, pupil detail, dashboard v2 data, bulk question actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './helpers/d1.mjs';
import { teacherRoute } from '../src/teacher.js';
import { HttpError } from '../src/util.js';
import { ADMIN, loadWho } from '../src/accounts.js';

const SEEDS = ['questions-450.sql', 'seed-new-types.sql', 'seed-new-types-extra.sql'];
const setup = () => {
  const { db, d1 } = makeDb({ seeds: SEEDS });
  return { db, e: { DB: d1, teacher_user: 'admin', teacher_password: 'admin-pass-123' } };
};
const call = async (e, who, method, path, body) => {
  try {
    const r = await teacherRoute(new Request('http://x/api/t' + path, { method, body: body ? JSON.stringify(body) : undefined }), e, new URL('http://x/api/t' + path), who);
    return { status: r.status, body: await r.json() };
  } catch (x) {
    if (x instanceof HttpError) return { status: x.status, body: { error: x.message } };
    throw x;
  }
};
const cls = (db, name) => db.prepare('INSERT INTO classes (name, code, created_at) VALUES (?, ?, 1) RETURNING id').get(name, 'C' + name).id;
const pup = (db, c, name) => db.prepare('INSERT INTO pupils (class_id, name, username, is_guest, created_at) VALUES (?, ?, ?, 0, 1) RETURNING id').get(c, name, name.toLowerCase()).id;
const teacherWho = async (e, body) => {
  const made = (await call(e, ADMIN, 'POST', '/teachers', body)).body;
  return { made, who: await loadWho(e, { r: 't', tid: made.teacher.id, sv: 0 }) };
};

test('a new teacher must choose their own password before anything else, and the gate lifts afterwards', async () => {
  const { db, e } = setup();
  const c = cls(db, 'A');
  const { made, who } = await teacherWho(e, { name: 'Ms Tan', username: 'tan', classes: [c] });
  assert.equal(made.teacher.mustChange, true);
  assert.equal(who.mustChange, true);
  assert.equal((await call(e, who, 'GET', '/me')).body.mustChange, true, 'the console is told');
  const blocked = await call(e, who, 'GET', '/classes');
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /choose your own password/i);
  const same = await call(e, who, 'POST', '/me/password', { current: made.password, next: made.password });
  assert.equal(same.status, 400, 'not the same one again');
  assert.equal((await call(e, who, 'POST', '/me/password', { current: made.password, next: 'my-own-password' })).status, 200);
  const after = await loadWho(e, { r: 't', tid: made.teacher.id, sv: 0 });
  assert.equal(after.mustChange, false);
  assert.equal((await call(e, after, 'GET', '/classes')).status, 200);
  // a reset by the admin puts the gate back
  const rs = await call(e, ADMIN, 'POST', `/teachers/${made.teacher.id}/reset-password`);
  assert.equal(rs.status, 200);
  assert.equal((await call(e, ADMIN, 'GET', '/teachers')).body.teachers[0].mustChange, true);
  // the admin is never gated
  assert.equal((await call(e, ADMIN, 'GET', '/classes')).status, 200);
});

test('before the 2.0 migration nobody is forced to change a password and nothing breaks', async () => {
  const { db, e } = setup();
  db.exec('DROP TABLE teacher_flags');
  const c = cls(db, 'A');
  const { who } = await teacherWho(e, { name: 'Ms Tan', username: 'tan', classes: [c] });
  assert.equal(who.mustChange, false);
  assert.equal((await call(e, who, 'GET', '/classes')).status, 200);
});

test('pupil detail: level, districts, slips by rule and recent answers, for a teacher’s own class only', async () => {
  const { db, e } = setup();
  const c1 = cls(db, 'A');
  const c2 = cls(db, 'B');
  const amy = pup(db, c1, 'Amy');
  const bob = pup(db, c2, 'Bob');
  const q = db.prepare('SELECT id, mode FROM questions WHERE mode = 1 LIMIT 3').all();
  const ins = db.prepare("INSERT INTO attempts (pupil_id, class_id, question_id, mode, try_no, practice, correct, xp, answer, codes, ts) VALUES (?,?,?,?,?,0,?,?, 'x', ?, ?)");
  ins.run(amy, c1, q[0].id, 1, 1, 0, 0, '["no_comma"]', Date.now() - 1000);
  ins.run(amy, c1, q[0].id, 1, 2, 1, 10, '[]', Date.now() - 500);
  const { who } = await teacherWho(e, { name: 'Ms Tan', username: 'tan', classes: [c1] });
  await call(e, who, 'POST', '/me/password', { current: (await call(e, ADMIN, 'POST', `/teachers/${who.id}/reset-password`)).body.password, next: 'my-own-password' }).catch(() => {});
  const w2 = { ...who, mustChange: false };
  const d = await call(e, w2, 'GET', `/pupils/${amy}/detail`);
  assert.equal(d.status, 200);
  assert.equal(d.body.pupil.name, 'Amy');
  assert.equal(d.body.answers, 2);
  assert.equal(d.body.xp, 10);
  assert.equal(d.body.level, 1);
  assert.equal(d.body.districts.length >= 1, true);
  assert.ok(d.body.districts.every((x) => 'done' in x && 'total' in x && 'cleared' in x));
  assert.equal(d.body.recent.length, 2);
  assert.equal(d.body.recent[0].correct, true, 'newest first');
  assert.ok(!JSON.stringify(d.body).includes('"answer"'), 'what the pupil typed is not sent');
  assert.equal((await call(e, w2, 'GET', `/pupils/${bob}/detail`)).status, 403, 'another class is off limits');
  assert.equal((await call(e, ADMIN, 'GET', `/pupils/${bob}/detail`)).status, 200);
  assert.equal((await call(e, ADMIN, 'GET', '/pupils/9999/detail')).status, 404);
});

test('dashboard v2: a 14-day XP series and a district state for every pupil', async () => {
  const { db, e } = setup();
  const c = cls(db, 'A');
  const amy = pup(db, c, 'Amy');
  pup(db, c, 'Ben');
  const q = db.prepare('SELECT id, mode FROM questions WHERE mode = 1 LIMIT 1').get();
  const ins = db.prepare("INSERT INTO attempts (pupil_id, class_id, question_id, mode, try_no, practice, correct, xp, answer, codes, ts) VALUES (?,?,?,1,1,0,1,?, 'x', '[]', ?)");
  ins.run(amy, c, q.id, 10, Date.now() - 3600_000);
  ins.run(amy, c, q.id, 7, Date.now() - 5 * 86_400_000 - 3600_000);
  const d = (await call(e, ADMIN, 'GET', `/dashboard?class=${c}`)).body;
  assert.equal(d.xpDays.length, 14);
  assert.equal(d.xpDays[13], 10, 'today is the last bucket');
  assert.equal(d.xpDays[13 - 5], 7);
  assert.equal(d.xpDays.reduce((a, b) => a + b, 0), 17);
  const a = d.pupils.find((p) => p.name === 'Amy');
  const b = d.pupils.find((p) => p.name === 'Ben');
  assert.equal(a.districts.length, 12);
  assert.ok(a.districts.some((x) => x[0] === 1), 'Amy has started a district');
  assert.ok(b.districts.every((x) => x[0] <= 0), 'Ben has started none');
  assert.ok(a.districts.every((x) => x.length === 3));
});

test('bulk questions: remove, restore and move; teachers only touch their own class’s questions', async () => {
  const { db, e } = setup();
  const c1 = cls(db, 'A');
  const c2 = cls(db, 'B');
  const mk = (cid) => db.prepare("INSERT INTO questions (mode, class_id, public, active, data, created_at) VALUES (2, ?, 1, 1, ?, 1) RETURNING id").get(cid, JSON.stringify({ correct: 'x', faulty: 'y' })).id;
  const mine = [mk(c1), mk(c1)];
  const other = mk(c2);
  const shared = db.prepare('SELECT id FROM questions WHERE class_id IS NULL LIMIT 1').get().id;
  const { who } = await teacherWho(e, { name: 'Ms Tan', username: 'tan', classes: [c1] });
  const w = { ...who, mustChange: false };
  const rm = await call(e, w, 'POST', '/questions/bulk', { action: 'remove', ids: [...mine, other, shared] });
  assert.deepEqual(rm.body.changed.sort(), [...mine].sort());
  assert.deepEqual(rm.body.skipped.sort(), [other, shared].sort(), 'not theirs: left alone');
  const active = (id) => db.prepare('SELECT active FROM questions WHERE id = ?').get(id).active;
  assert.equal(active(mine[0]), 0);
  assert.equal(active(other), 1);
  const re = await call(e, w, 'POST', '/questions/bulk', { action: 'restore', ids: mine });
  assert.equal(re.body.changed.length, 2);
  assert.equal(active(mine[0]), 1, 'undo brings them back');
  assert.equal((await call(e, w, 'POST', '/questions/bulk', { action: 'move', ids: mine, class_id: c2 })).status, 403, 'not their class to move into');
  assert.equal((await call(e, ADMIN, 'POST', '/questions/bulk', { action: 'move', ids: mine, class_id: c2 })).status, 200);
  assert.equal(db.prepare('SELECT class_id FROM questions WHERE id = ?').get(mine[0]).class_id, c2);
  assert.equal((await call(e, ADMIN, 'POST', '/questions/bulk', { action: 'dance', ids: mine })).status, 400);
  assert.equal((await call(e, ADMIN, 'POST', '/questions/bulk', { action: 'remove', ids: [] })).status, 400);
});
