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
const F = await import('../../assets/js/family/family.js');

async function person(id) {
  const { session, bundle } = await createVault({ passphrase: 'correct horse battery staple 42', userId: id, kdf: { alg: 'argon2id', m: 1024, t: 1, p: 1 }, allowWeak: true });
  return { session, pub: bundle.public };
}
function fakeSb(rows = []) {
  const mk = () => ({
    from(name) {
      let f = [], op = null, patch = null;
      const api = {
        select() { return api; }, eq(c, v) { f.push(r => r[c] === v); return api; }, limit() { return api; },
        insert: async r => { rows.push({ ...r }); return { error: null }; },
        upsert: async r => { const i = rows.findIndex(x => x.user_id === r.user_id); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r }); return { error: null }; },
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

const doc = { overview: 'Grew up in two houses.', members: [
  { name: 'Rosa', relationship: 'Grandparent', status: 'Deceased', born: '1938', description: 'Warm, strict.', history: 'Moved cities in 1962.', impact: 'Taught me songs.' },
  { name: '', relationship: '', description: '', history: '', impact: '' }] };

test('cleaning keeps known fields, trims, limits, and drops an empty person', () => {
  const c = F.cleanFamily({ ...doc, members: [...doc.members, { name: '  Ben  ', relationship: 'Sibling', extra: 'x', description: 'y'.repeat(5000) }] });
  assert.equal(c.members.length, 2); assert.equal(c.members[1].name, 'Ben'); assert.equal(c.members[1].description.length, F.LIMITS.description);
  assert.ok(!('extra' in c.members[1])); assert.equal(F.cleanFamily({}).members.length, 0); assert.ok(F.isEmpty(F.cleanFamily({})));
});
test('saved privately: the server row holds no plaintext, and only the owner can open it', async () => {
  const me = await person('c1'), other = await person('x1'); const { rows, sb } = fakeSb();
  await F.saveFamily({ sb, session: me.session, uid: 'c1', doc });
  assert.equal(rows.length, 1); assert.ok(!JSON.stringify(rows[0]).includes('Rosa'));
  const back = await F.loadFamily({ sb, session: me.session, uid: 'c1' }); assert.equal(back.doc.members[0].name, 'Rosa');
  await assert.rejects(other.session.decrypt(rows[0].payload));
  assert.equal((await F.saveFamily({ sb, session: me.session, uid: 'c1', doc: { overview: 'changed', members: [] } })).overview, 'changed'); assert.equal(rows.length, 1);
});
test('sending seals a snapshot for the therapist and the client only, and can be taken back', async () => {
  const me = await person('c1'), th = await person('t1'), other = await person('x1'); const { rows, sb } = fakeSb();
  const target = { link_id: 'L', therapist_id: 't1', public_enc: th.pub.enc };
  await F.sendFamily({ sb, session: me.session, target, doc });
  assert.equal(rows.length, 1); assert.equal(rows[0].category, 'family'); assert.ok(!JSON.stringify(rows[0]).includes('Rosa'));
  const seen = await F.openFamily(th.session, { ...rows[0], link_id: 'L' }); assert.equal(seen.doc.members[0].impact, 'Taught me songs.');
  assert.equal((await F.openFamily(me.session, { ...rows[0], link_id: 'L' })).doc.overview, 'Grew up in two houses.');
  await assert.rejects(F.openFamily(other.session, { ...rows[0], link_id: 'L' }));
  await F.sendFamily({ sb, session: me.session, target, doc: { ...doc, overview: 'v2' } }); assert.equal(rows.length, 1);
  assert.equal((await F.openFamily(th.session, { ...rows[0], link_id: 'L' })).doc.overview, 'v2');
  await F.withdrawFamily(sb, 'L'); assert.equal(rows.length, 0);
  await assert.rejects(F.sendFamily({ sb, session: me.session, target, doc: { overview: '', members: [] } }), /Add something/);
});
test('the therapist view puts client text in as text, never as HTML', () => {
  const nodes = []; const fake = { createElement: t => { const n = { tag: t, children: [], append(...k) { this.children.push(...k); }, set textContent(v) { this._t = v; }, get textContent() { return this._t; } }; nodes.push(n); return n; } };
  F.renderFamily(fake, { doc: F.cleanFamily({ overview: '<img src=x onerror=alert(1)>', members: [{ name: '<b>Rosa</b>' }] }) });
  assert.ok(nodes.some(n => n._t === '<img src=x onerror=alert(1)>')); assert.ok(nodes.every(n => n.innerHTML === undefined));
});
