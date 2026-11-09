import test from 'node:test';
import assert from 'node:assert/strict';
import { therapistProblem, activatePendingLink } from '../../netlify/functions/lib/therapist-link.js';

function db(links, therapists) {
  const rows = { client_therapists: links, therapist_profiles: therapists };
  const mk = (t) => { const f = [], inn = []; let op = 'select', payload;
    const b = { select() { return b; }, eq(k, v) { f.push([k, v]); return b; }, in(k, v) { inn.push([k, v]); return b; }, limit() { return b; }, update(p) { op = 'update'; payload = p; return b; },
      then(res, rej) { const m = rows[t].filter(r => f.every(([k, v]) => r[k] === v) && inn.every(([k, v]) => v.includes(r[k])));
        if (op === 'update') m.forEach(r => Object.assign(r, payload)); return Promise.resolve({ data: m, error: null }).then(res, rej); } }; return b; };
  return { from: mk, rows };
}

test('no chosen therapist: a session plan is refused with a clear code', async () => {
  const r = await therapistProblem(db([], [{ user_id: 't1', accepting_clients: true }]), 'c1');
  assert.equal(r.statusCode, 409); assert.equal(JSON.parse(r.body).error, 'therapist_required');
});
test('chosen therapist who is accepting: allowed', async () => {
  assert.equal(await therapistProblem(db([{ client_id: 'c1', status: 'pending', therapist_id: 't1' }], [{ user_id: 't1', accepting_clients: true }]), 'c1'), null);
});
test('chosen therapist who stopped accepting: refused while pending, allowed for an existing active client', async () => {
  const th = [{ user_id: 't1', accepting_clients: false }];
  const r = await therapistProblem(db([{ client_id: 'c1', status: 'pending', therapist_id: 't1' }], th), 'c1');
  assert.equal(JSON.parse(r.body).error, 'therapist_not_accepting');
  assert.equal(await therapistProblem(db([{ client_id: 'c1', status: 'active', therapist_id: 't1' }], th), 'c1'), null);
});
test('only a paid session plan activates a pending connection', async () => {
  for (const [tier, status, want] of [['lab', 'active', 'pending'], ['free', 'free', 'pending'], ['call1', 'past_due', 'pending'], ['call1', 'active', 'active'], ['call2', 'trialing', 'active']]) {
    const d = db([{ client_id: 'c1', status: 'pending', therapist_id: 't1' }, { client_id: 'c2', status: 'pending', therapist_id: 't1' }], []);
    await activatePendingLink(d, 'c1', tier, status);
    assert.equal(d.rows.client_therapists[0].status, want, `${tier}/${status}`);
    assert.equal(d.rows.client_therapists[1].status, 'pending', 'other people are untouched');
  }
});
