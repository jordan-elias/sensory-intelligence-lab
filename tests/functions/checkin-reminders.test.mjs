import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, buildEmail } from '../../netlify/functions/send-checkin-reminders.js';

const NOW = new Date('2026-11-10T17:00:00Z');
const db = (people, recentIds = [], peopleErr = null) => ({
  from: (t) => t === 'profiles'
    ? { select: () => ({ eq: async (col, val) => { db.filter = [col, val]; return peopleErr ? { data: null, error: peopleErr } : { data: people, error: null }; } }) }
    : { select: () => ({ eq: (c, id) => ({ gte: () => ({ limit: async () => ({ data: recentIds.includes(id) ? [{ id: 1 }] : [], error: null }) }) }) }) },
});

test('only opted-in people are asked for, and recent check-ins are skipped', async () => {
  const sent = [];
  const h = makeHandler(db([{ id: 'a', email: 'a@x' }, { id: 'b', email: 'b@x' }, { id: 'c', email: null }], ['b']), async (to) => sent.push(to), () => NOW);
  const r = await h();
  assert.deepEqual(db.filter, ['notification_preferences->>checkin_reminder', 'true']);
  assert.deepEqual(sent, ['a@x']);
  assert.deepEqual(JSON.parse(r.body), { sent: 1, skipped: 2, failed: 0 });
});

test('one failed send does not stop the rest', async () => {
  const sent = [];
  const h = makeHandler(db([{ id: 'a', email: 'a@x' }, { id: 'b', email: 'b@x' }]), async (to) => { if (to === 'a@x') throw new Error('no'); sent.push(to); }, () => NOW);
  assert.deepEqual(JSON.parse((await h()).body), { sent: 1, skipped: 0, failed: 1 });
  assert.deepEqual(sent, ['b@x']);
});

test('a database error is reported', async () => {
  const r = await makeHandler(db([], [], { message: 'boom' }), async () => {}, () => NOW)();
  assert.equal(r.statusCode, 500);
});

test('the email is generic and links to the check-in', () => {
  const e = buildEmail();
  assert.match(e.text, /\/checkin\//);
  assert.doesNotMatch(e.text + e.html, /streak|you (felt|wrote)|mood|score/i);
});
