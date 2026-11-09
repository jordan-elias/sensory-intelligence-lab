import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler, calParts, earliestSlot } from '../../netlify/functions/next-available.js';

const NOW = new Date('2026-11-10T08:00:00Z');
const supa = (rows, ok = true) => ({
  auth: { getUser: async (t) => (t === 'good' ? { data: { user: { id: 'c1' } } } : { data: { user: null }, error: { message: 'x' } }) },
  from: () => ({ select: () => ({ eq: async () => (ok ? { data: rows, error: null } : { data: null, error: { message: 'x' } }) }) }),
});
const req = (token = 'good', method = 'POST') => ({ httpMethod: method, headers: token ? { authorization: 'Bearer ' + token } : {} });

test('calParts only accepts two-part Cal.com links', () => {
  assert.deepEqual(calParts('https://cal.com/rivera/monthly'), { username: 'rivera', eventTypeSlug: 'monthly' });
  assert.equal(calParts('https://cal.com/team/x/y'), null);
  assert.equal(calParts('https://calendly.com/a/b'), null);
  assert.equal(calParts('http://cal.com/a/b'), null);
  assert.equal(calParts(null), null);
});

test('earliestSlot reads current and older shapes and ignores the past', () => {
  const cur = { data: { '2026-11-12': [{ start: '2026-11-12T10:00:00.000+01:00' }, { start: '2026-11-12T09:00:00.000+01:00' }], '2026-11-11': [{ start: '2026-11-11T15:00:00.000+01:00' }] } };
  assert.equal(earliestSlot(cur, NOW), '2026-11-11T14:00:00.000Z');
  const old = { slots: { '2026-11-12': [{ time: '2026-11-12T09:00:00Z' }] } };
  assert.equal(earliestSlot(old, NOW), '2026-11-12T09:00:00.000Z');
  assert.equal(earliestSlot({ data: { d: [{ start: '2026-11-09T09:00:00Z' }] } }, NOW), null);
  assert.equal(earliestSlot({}, NOW), null);
});

test('requires a signed-in person', async () => {
  const h = makeHandler(supa([]));
  assert.equal((await h(req('good', 'GET'))).statusCode, 405);
  assert.equal((await h(req(null))).statusCode, 401);
  assert.equal((await h(req('bad'))).statusCode, 401);
});

test('returns the next slot for Cal links and null for others or failures; caches', async () => {
  let calls = 0; const urls = [];
  const fetchFn = async (url) => { calls++; urls.push(url); if (url.includes('username=broken')) throw new Error('down'); return { ok: true, json: async () => ({ data: { '2026-11-12': [{ start: '2026-11-12T09:00:00Z' }] } }) }; };
  const h = makeHandler(supa([
    { user_id: 't1', booking_link: 'https://cal.com/rivera/monthly' },
    { user_id: 't2', booking_link: 'https://calendly.com/x/y' },
    { user_id: 't3', booking_link: 'https://cal.com/broken/monthly' },
    { user_id: 't4', booking_link: null },
  ]), fetchFn, () => NOW);
  const res = await h(req());
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.results, { t1: { next: '2026-11-12T09:00:00.000Z' }, t2: { next: null }, t3: { next: null }, t4: { next: null } });
  assert.ok(urls[0].startsWith('https://api.cal.com/v2/slots?username=rivera&eventTypeSlug=monthly&start=2026-11-10&end=2026-12-01'));
  const before = calls; await h(req());
  assert.equal(calls, before, 'second request is served from the cache');
});

test('a database error is reported', async () => {
  assert.equal((await makeHandler(supa(null, false))(req())).statusCode, 500);
});
