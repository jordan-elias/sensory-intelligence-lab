import test from 'node:test'; import assert from 'node:assert/strict';
import { createProgress, forSync } from '../../assets/js/experiments/progress.js';
import { createSync, PREF } from '../../assets/js/experiments/sync.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
const vault = () => ({ encrypt: async t => JSON.stringify({ iv: 'x', ciphertext: Buffer.from(t).toString('base64') }), decrypt: async p => Buffer.from(JSON.parse(p).ciphertext, 'base64').toString() });
function db({ missing = false, row = null, failWrite = false } = {}) {
  const log = []; const state = { row };
  return { log, state, from(table) { const b = { select() { return b; }, eq() { return b; }, maybeSingle: async () => (missing ? { data: null, error: { code: '42P01', message: 'relation "course_progress" does not exist' } } : { data: state.row, error: null }),
    upsert: async (r, o) => { log.push(['upsert', table, r, o]); if (missing) return { error: { code: '42P01', message: 'x' } }; if (failWrite) return { error: { message: 'boom' } }; state.row = r; return { error: null }; } }; return b; } };
}
const mk = (o = {}) => { const progress = createProgress({ storage: mem() }); const prefs = mem(); const s = o.sb || db(); const vs = vault();
  return { progress, prefs, s, vs, sync: createSync({ progress, supabase: s, userId: 'u1', session: () => (o.locked ? null : vs), unlock: async () => (o.refuse ? null : vs), prefs }) }; };

test('sync is off until the person turns it on, and does nothing while off', async () => { const t = mk(); assert.equal(t.sync.status, 'off'); await t.sync.syncNow(); assert.equal(t.s.log.length, 0); });
test('turning it on saves only ciphertext, never the readable notes', async () => {
  const t = mk(); t.progress.setNote('dice-melody', 'A private thought about my mother.'); await t.sync.enable();
  assert.equal(t.sync.status, 'synced'); assert.equal(t.prefs.getItem(PREF), '1');
  const up = t.s.log[0][2]; assert.equal(up.user_id, 'u1'); assert.ok(!up.content.includes('private thought')); assert.ok(!Buffer.from(JSON.parse(up.content).ciphertext, 'base64').toString().includes('"kind":"audio"'));
});
test('a second device receives the first device’s progress and adds its own', async () => {
  const sb = db(); const a = mk({ sb }), b = mk({ sb });
  a.progress.markDone('x'); a.progress.setNote('x', 'from A'); await a.sync.enable();
  b.progress.markDone('y'); await b.sync.enable();
  assert.ok(b.progress.isDone('x') && b.progress.isDone('y')); assert.equal(b.progress.note('x'), 'from A');
  await a.sync.syncNow(); assert.ok(a.progress.isDone('y'));
});
test('recordings stay on the device', async () => { const t = mk(); t.progress.keep({ exp: 'a', kind: 'audio', title: 'Clip', secs: 3 }); await t.sync.enable(); const plain = Buffer.from(JSON.parse(t.s.state.row.content).ciphertext, 'base64').toString(); assert.ok(!plain.includes('Clip')); });
test('a page load never asks for the passphrase', async () => { const t = mk({ locked: true }); t.prefs.setItem(PREF, '1'); const s2 = createSync({ progress: t.progress, supabase: t.s, userId: 'u1', session: () => null, unlock: async () => { throw new Error('should not prompt'); }, prefs: t.prefs }); await s2.syncNow(); assert.equal(s2.status, 'locked'); assert.equal(t.s.log.length, 0); });
test('declining the unlock leaves sync off for now and changes nothing', async () => { const t = mk({ locked: true, refuse: true }); await t.sync.enable(); assert.equal(t.sync.status, 'locked'); assert.equal(t.prefs.getItem(PREF), null); });
test('a missing table is reported plainly and the course carries on', async () => { const t = mk({ sb: db({ missing: true }) }); t.progress.setNote('a', 'x'); await t.sync.enable(); assert.equal(t.sync.status, 'unavailable'); assert.match(t.sync.detail, /still saved on this device/); assert.equal(t.progress.note('a'), 'x'); });
test('a copy that cannot be opened is never overwritten', async () => { const t = mk({ sb: db({ row: { content: '{"iv":"x","ciphertext":"%%%"}' } }) }); t.progress.setNote('a', 'keep me'); await t.sync.enable(); assert.equal(t.sync.status, 'error'); assert.equal(t.s.log.length, 0); assert.equal(t.progress.note('a'), 'keep me'); });
test('a failed write is shown as an error, not swallowed', async () => { const t = mk({ sb: db({ failWrite: true }) }); await t.sync.enable(); assert.equal(t.sync.status, 'error'); });
test('turning it off stops syncing', async () => { const t = mk(); await t.sync.enable(); t.sync.disable(); const n = t.s.log.length; t.progress.setNote('a', 'x'); t.sync.schedule(1); await new Promise(r => setTimeout(r, 20)); assert.equal(t.s.log.length, n); assert.equal(t.sync.status, 'off'); });
test('schedule waits for the person to stop before sending', async () => { const t = mk(); await t.sync.enable(); const n = t.s.log.length; t.sync.schedule(30); t.sync.schedule(30); t.sync.schedule(30); await new Promise(r => setTimeout(r, 120)); assert.equal(t.s.log.length, n + 1); });
