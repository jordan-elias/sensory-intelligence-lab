import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler as makeLink, CONSENT_VERSION } from '../../netlify/functions/link-therapist.js';
import { makeHandler as makeEnd } from '../../netlify/functions/end-therapist-link.js';

// A tiny in-memory stand-in for the parts of the Supabase client these functions use.
function fakeDb(seed, users) {
  const db = JSON.parse(JSON.stringify(seed));
  const q = (table) => {
    const s = { f: [], inn: [], lim: null, op: 'select', payload: null, one: false, maybe: false };
    const run = () => {
      let rows = (db[table] ||= []).filter(r => s.f.every(([k, v]) => r[k] === v) && s.inn.every(([k, vs]) => vs.includes(r[k])));
      if (s.op === 'insert') {
        if (table === 'client_therapists' && rows.length === 0) {
          const dup = db[table].some(r => r.client_id === s.payload.client_id && r.therapist_id === s.payload.therapist_id && ['pending', 'active'].includes(r.status));
          if (dup) return { data: null, error: { message: 'duplicate' } };
        }
        const row = { id: `${table}-${db[table].length + 1}`, ...s.payload }; db[table].push(row);
        return { data: row, error: null };
      }
      if (s.op === 'delete') { db[table] = db[table].filter(r => !rows.includes(r)); return { data: null, error: null }; }
      if (s.op === 'update') { rows.forEach(r => Object.assign(r, s.payload)); return { data: rows, error: null }; }
      if (s.lim) rows = rows.slice(0, s.lim);
      if (s.one) return { data: rows[0] ?? null, error: rows[0] || s.maybe ? null : { message: 'none' } };
      return { data: rows, error: null };
    };
    const b = {
      select() { return b; }, eq(k, v) { s.f.push([k, v]); return b; }, in(k, vs) { s.inn.push([k, vs]); return b; },
      limit(n) { s.lim = n; return b; }, maybeSingle() { s.one = true; s.maybe = true; return b; }, single() { s.one = true; return b; },
      insert(p) { s.op = 'insert'; s.payload = p; return b; }, delete() { s.op = 'delete'; return b; }, update(p) { s.op = 'update'; s.payload = p; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return { db, from: q, auth: { getUser: async (t) => (users[t] ? { data: { user: users[t] } } : { data: { user: null }, error: { message: 'bad' } }) } };
}
const call = (h, body, token = 't-client', method = 'POST') => h({ httpMethod: method, headers: token ? { authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) });
const users = { 't-client': { id: 'c1' }, 't-other': { id: 'c2' }, 't-th': { id: 'th1' }, 't-free': { id: 'c3' }, 't-lab': { id: 'c4' }, 't-lapsed': { id: 'c5' } };
const seed = () => ({
  profiles: [{ id: 'c1', subscription_tier: 'call1', subscription_status: 'active' }, { id: 'c2', subscription_tier: 'call2', subscription_status: 'trialing' }, { id: 'c5', subscription_tier: 'call2', subscription_status: 'canceled' }, { id: 'c3', subscription_tier: 'free', subscription_status: 'free' }, { id: 'c4', subscription_tier: 'lab', subscription_status: 'active' }, { id: 'th1', subscription_tier: 'call2', subscription_status: 'active' }],
  therapist_profiles: [{ user_id: 'th1', practice_id: 'p1', accepting_clients: true, is_default: true }],
  client_therapists: [],
});

test('linking: needs sign-in, the current consent text, and a therapist who is accepting', async () => {
  const d = fakeDb(seed(), users), h = makeLink(d);
  assert.equal((await call(h, {}, null)).statusCode, 401);
  assert.equal((await call(h, {}, 'nope')).statusCode, 401);
  assert.equal((await call(h, { consent_version: CONSENT_VERSION }, 't-client', 'GET')).statusCode, 405);
  assert.equal((await call(h, { consent_version: 'old' })).statusCode, 409);
  assert.equal(d.db.client_therapists.length, 0, 'nothing created for refused requests');
});
test('choosing first: a free, lab or lapsed person gets a PENDING connection that gives no access', async () => {
  for (const tok of ['t-free', 't-lab', 't-lapsed']) {
    const d = fakeDb(seed(), users);
    const r = await call(makeLink(d), { consent_version: CONSENT_VERSION }, tok);
    assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).pending, true);
    assert.equal(d.db.client_therapists[0].status, 'pending');
  }
});
test('choosing first: changing the choice before paying replaces the pending connection', async () => {
  const sd = seed(); sd.therapist_profiles.push({ user_id: 'th2', practice_id: 'p1', accepting_clients: true });
  const d = fakeDb(sd, users), h = makeLink(d);
  await call(h, { consent_version: CONSENT_VERSION, therapist_id: 'th1' }, 't-lab');
  const again = await call(h, { consent_version: CONSENT_VERSION, therapist_id: 'th1' }, 't-lab');
  assert.equal(JSON.parse(again.body).already, true);
  await call(h, { consent_version: CONSENT_VERSION, therapist_id: 'th2' }, 't-lab');
  assert.equal(d.db.client_therapists.length, 1); assert.equal(d.db.client_therapists[0].therapist_id, 'th2');
});
test('a pending choice can be withdrawn by the client and is deleted, leaving no record for the therapist', async () => {
  const d = fakeDb(seed(), users); await call(makeLink(d), { consent_version: CONSENT_VERSION }, 't-lab');
  const id = d.db.client_therapists[0].id, h = makeEnd(d);
  assert.equal((await call(h, { link_id: id }, 't-th')).statusCode, 404, 'the therapist cannot see or end it');
  assert.equal((await call(h, { link_id: id }, 't-lab')).statusCode, 200);
  assert.equal(d.db.client_therapists.length, 0);
});
test('linking: a session-tier client who agrees is linked to the default therapist, with consent recorded', async () => {
  const d = fakeDb(seed(), users), h = makeLink(d);
  const r = await call(h, { consent_version: CONSENT_VERSION });
  assert.equal(r.statusCode, 200);
  const l = d.db.client_therapists[0];
  assert.equal(l.client_id, 'c1'); assert.equal(l.therapist_id, 'th1'); assert.equal(l.status, 'active');
  assert.equal(l.consent_version, CONSENT_VERSION); assert.ok(l.consented_at);
});
test('linking: asking twice does not create a second link; a client cannot pick someone who is not accepting', async () => {
  const d = fakeDb(seed(), users), h = makeLink(d);
  await call(h, { consent_version: CONSENT_VERSION });
  const again = JSON.parse((await call(h, { consent_version: CONSENT_VERSION })).body);
  assert.equal(again.already, true); assert.equal(d.db.client_therapists.length, 1);
  const d2 = fakeDb(seed(), users); d2.db.therapist_profiles[0].accepting_clients = false;
  assert.equal((await call(makeLink(d2), { consent_version: CONSENT_VERSION })).statusCode, 503);
});
test('linking: a therapist cannot become their own client', async () => {
  const d = fakeDb(seed(), users);
  assert.equal((await call(makeLink(d), { consent_version: CONSENT_VERSION }, 't-th')).statusCode, 400);
});
test('ending: either side can end it, strangers get "not found", and it is idempotent', async () => {
  const d = fakeDb(seed(), users); await call(makeLink(d), { consent_version: CONSENT_VERSION });
  const id = d.db.client_therapists[0].id, h = makeEnd(d);
  assert.equal((await call(h, { link_id: id }, 't-other')).statusCode, 404);
  assert.equal(d.db.client_therapists[0].status, 'active');
  assert.equal((await call(h, { link_id: id }, 't-th')).statusCode, 200);
  const l = d.db.client_therapists[0];
  assert.equal(l.status, 'ended'); assert.equal(l.ended_by, 'th1'); assert.ok(l.ended_at);
  assert.equal(JSON.parse((await call(h, { link_id: id }, 't-client')).body).already, true);
  assert.equal((await call(h, {}, 't-client')).statusCode, 400);
});
test('after a link ends the client can be linked again', async () => {
  const d = fakeDb(seed(), users); const link = makeLink(d), end = makeEnd(d);
  await call(link, { consent_version: CONSENT_VERSION });
  await call(end, { link_id: d.db.client_therapists[0].id });
  assert.equal((await call(link, { consent_version: CONSENT_VERSION })).statusCode, 200);
  assert.equal(d.db.client_therapists.filter(l => l.status === 'active').length, 1);
});
