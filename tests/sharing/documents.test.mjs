import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
{
  const src = fs.readFileSync(new URL('../../assets/js/vendor/hash-wasm-argon2.umd.min.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('exports', 'module', src).call(mod.exports, mod.exports, mod);
  globalThis.hashwasm = mod.exports;
}
const { createVault } = await import('../../assets/js/vault/vault-crypto.js');
const D = await import('../../assets/js/sharing/documents.js');

async function person(id) {
  const { session, bundle } = await createVault({ passphrase: 'correct horse battery staple 42', userId: id, kdf: { alg: 'argon2id', m: 1024, t: 1, p: 1 }, allowWeak: true });
  return { session, pub: bundle.public };
}
function fakeSb(rows = []) {
  const mk = () => ({
    from() {
      let f = [], op = null, patch = null;
      const api = {
        select() { return api; }, eq(c, v) { f.push(r => r[c] === v); return api; }, limit() { return api; },
        insert: async r => { rows.push({ ...r }); return { error: null }; },
        update(p) { op = 'update'; patch = p; return api; }, delete() { op = 'delete'; return api; },
        then(res) {
          const hit = rows.filter(r => f.every(g => g(r)));
          if (op === 'update') hit.forEach(r => Object.assign(r, patch));
          if (op === 'delete') hit.forEach(r => rows.splice(rows.indexOf(r), 1));
          res({ data: op ? null : hit, error: null });
        },
      };
      return api;
    },
  });
  return { rows, sb: mk() };
}
const entry = { id: 'w1', type: 'coping', title: 'My plan', schema: 1, data: { q1: 'walk' }, created_at: '2027-01-01T00:00:00Z' };

test('sharing a worksheet seals it for the therapist and client only, and a stranger cannot open it', async () => {
  const client = await person('c1'), th = await person('t1'), other = await person('x1');
  const { rows, sb } = fakeSb(); const target = { link_id: 'L', therapist_id: 't1', public_enc: th.pub.enc };
  await D.shareDocument({ sb, session: client.session, target, entry });
  assert.equal(rows.length, 1); assert.equal(rows[0].category, 'worksheets');
  assert.ok(!JSON.stringify(rows[0]).includes('walk'), 'no plaintext stored');
  const ctx = { context: 'share:L:worksheets:w1' };
  assert.equal(JSON.parse(await th.session.open(rows[0].sealed, ctx)).data.q1, 'walk');
  assert.equal(JSON.parse(await client.session.open(rows[0].sealed, ctx)).title, 'My plan');
  await assert.rejects(other.session.open(rows[0].sealed, ctx));
});

test('sharing again refreshes the same copy instead of adding another', async () => {
  const client = await person('c1'), th = await person('t1');
  const { rows, sb } = fakeSb(); const target = { link_id: 'L', therapist_id: 't1', public_enc: th.pub.enc };
  await D.shareDocument({ sb, session: client.session, target, entry });
  await D.shareDocument({ sb, session: client.session, target, entry: { ...entry, data: { q1: 'swim' } } });
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(await th.session.open(rows[0].sealed, { context: 'share:L:worksheets:w1' })).data.q1, 'swim');
});

test('edits only reach the therapist for documents the client chose to share', async () => {
  const client = await person('c1'), th = await person('t1');
  const { rows, sb } = fakeSb(); const target = { link_id: 'L', therapist_id: 't1', public_enc: th.pub.enc };
  await D.prime(sb, async () => target);
  assert.equal(await D.afterSave({ sb, session: client.session, entry }), false);
  assert.equal(rows.length, 0, 'a private worksheet is never shared by saving it');
  await D.shareDocument({ sb, session: client.session, target, entry }); D.markShared('w1', true);
  assert.equal(await D.afterSave({ sb, session: client.session, entry: { ...entry, data: { q1: 'run' } } }), true);
  assert.equal(JSON.parse(await th.session.open(rows[0].sealed, { context: 'share:L:worksheets:w1' })).data.q1, 'run');
  await D.unshareDocument(sb, 'w1'); D.markShared('w1', false);
  assert.equal(rows.length, 0); assert.equal(D.isShared('w1'), false);
});

test('deleting a shared worksheet withdraws the copy', async () => {
  const client = await person('c1'), th = await person('t1');
  const { rows, sb } = fakeSb(); const target = { link_id: 'L', therapist_id: 't1', public_enc: th.pub.enc };
  await D.prime(sb, async () => target);
  await D.shareDocument({ sb, session: client.session, target, entry }); D.markShared('w1', true);
  await D.afterDelete(sb, 'w1'); assert.equal(rows.length, 0);
});
