import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import fs from 'node:fs';
{
  const src = fs.readFileSync(new URL('../../assets/js/vendor/hash-wasm-argon2.umd.min.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('exports', 'module', src).call(mod.exports, mod.exports, mod);
  globalThis.hashwasm = mod.exports;
}
const { createVault } = await import('../../assets/js/vault/vault-crypto.js');
const { sharedPayload, sealCheckin, syncCheckins, shareNew } = await import('../../assets/js/sharing/store.js');

async function person(id) {
  const { session, bundle } = await createVault({ passphrase: 'correct horse battery staple 42', userId: id, kdf: { alg: 'argon2id', m: 1024, t: 1, p: 1 }, allowWeak: true });
  return { session, pub: bundle.public.enc, fp: bundle.fingerprint };
}

// A tiny in-memory stand-in for the tables the sharing code touches.
function fakeSb({ prefs = [], keys = [], copies = [] } = {}) {
  const db = { sharing_preferences: prefs, my_therapist_keys: keys, shared_copies: copies };
  const q = table => {
    let rows = db[table], filters = [];
    const api = {
      select() { return api; },
      eq(c, v) { filters.push(r => r[c] === v); return api; },
      limit() { return api; },
      maybeSingle: async () => ({ data: rows.filter(r => filters.every(f => f(r)))[0] || null }),
      insert: async r => { (Array.isArray(r) ? r : [r]).forEach(x => db[table].push(x)); return { error: null }; },
      then(res) { res({ data: rows.filter(r => filters.every(f => f(r))), error: null }); },
    };
    return api;
  };
  return { from: q, db };
}

const rec = { id: 'c1', created_at: '2027-01-02T10:00:00Z', arousal: 3, valence: 4, sensory_load: 2, emotion_words: ['calm'],
  notes: 'private words', place_id: 'p9', env: { noise: 2 }, chord_name: 'Cmaj7' };

test('payload leaves out notes unless asked, and never the place id', () => {
  const a = JSON.parse(sharedPayload(rec)); const b = JSON.parse(sharedPayload(rec, { includeNotes: true }));
  assert.equal(a.notes, null); assert.equal(b.notes, 'private words'); assert.equal('place_id' in a, false);
});

test('only the therapist and the client can open a shared copy; a third person cannot', async () => {
  const client = await person('client-1'), th = await person('thera-1'), other = await person('other-1');
  const target = { link_id: 'L1', therapist_id: 'thera-1', public_enc: th.pub };
  const sealed = await sealCheckin(client.session, target, rec, { includeNotes: true });
  const ctx = { context: 'share:L1:checkins:c1' };
  assert.equal(JSON.parse(await th.session.open(sealed, ctx)).notes, 'private words');
  assert.equal(JSON.parse(await client.session.open(sealed, ctx)).arousal, 3);
  await assert.rejects(other.session.open(sealed, ctx));
  await assert.rejects(th.session.open(sealed, { context: 'share:L1:checkins:OTHER' }));   // bound to the record
});

test('syncCheckins adds only what is missing', async () => {
  const client = await person('client-1'), th = await person('thera-1');
  const target = { link_id: 'L1', therapist_id: 'thera-1', public_enc: th.pub };
  const sb = fakeSb({ copies: [{ link_id: 'L1', category: 'checkins', source_id: 'c1' }] });
  const r = await syncCheckins({ sb, session: client.session, target, records: [rec, { ...rec, id: 'c2' }], includeNotes: false });
  assert.equal(r.added, 1); assert.equal(sb.db.shared_copies.length, 2);
  assert.equal(sb.db.shared_copies[1].source_id, 'c2');
});

test('shareNew does nothing while sharing is off', async () => {
  const client = await person('client-1');
  const sb = fakeSb();
  assert.equal(await shareNew({ sb, session: client.session, record: rec }), false);
  assert.equal(sb.db.shared_copies.length, 0);
});

test('shareNew shares when on and the therapist has keys', async () => {
  const client = await person('client-1'), th = await person('thera-1');
  const sb = fakeSb({ prefs: [{ link_id: 'L1', category: 'checkins', enabled: true, include_notes: false }],
    keys: [{ link_id: 'L1', therapist_id: 'thera-1', public_enc: th.pub, fingerprint: th.fp }] });
  assert.equal(await shareNew({ sb, session: client.session, record: rec }), true);
  const copy = sb.db.shared_copies[0];
  assert.equal(JSON.parse(await th.session.open(copy.sealed, { context: 'share:L1:checkins:c1' })).notes, null);
});
