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
const M = await import('../../assets/js/messages/store.js');

async function person(id) {
  const { session, bundle } = await createVault({ passphrase: 'correct horse battery staple 42', userId: id, kdf: { alg: 'argon2id', m: 1024, t: 1, p: 1 }, allowWeak: true });
  return { session, pub: bundle.public };
}
// In-memory stand-in for the messages table, enforcing "only parties see a row".
function fakeSb() {
  const rows = [];
  const mk = viewer => ({
    from() {
      let f = [];
      const api = {
        insert: async r => { rows.push({ read_at: null, created_at: new Date(Date.now() + rows.length).toISOString(), ...r }); return { error: null }; },
        select() { return api; }, eq(c, v) { f.push(r => r[c] === v); return api; },
        order() { return api; },
        then(res) { res({ data: rows.filter(r => (r.sender_id === viewer || r.recipient_id === viewer) && f.every(g => g(r))), error: null }); },
      };
      return api;
    },
  });
  return { rows, as: mk };
}

test('a message round-trips between client and therapist and nobody else can read it', async () => {
  const client = await person('c1'), th = await person('t1'), other = await person('x1');
  const sb = fakeSb();
  await M.sendMessage({ sb: sb.as('c1'), session: client.session, linkId: 'L', other: { id: 't1', public_enc: th.pub.enc }, text: 'Hello, I slept badly' });
  assert.ok(!JSON.stringify(sb.rows[0]).includes('slept'), 'the stored row has no plaintext');
  const got = await M.loadConversation({ sb: sb.as('t1'), session: th.session, linkId: 'L', otherSignKey: client.pub.sign });
  assert.equal(got[0].text, 'Hello, I slept badly'); assert.equal(got[0].verified, true); assert.equal(got[0].mine, false);
  const mine = await M.loadConversation({ sb: sb.as('c1'), session: client.session, linkId: 'L', otherSignKey: th.pub.sign });
  assert.equal(mine[0].text, 'Hello, I slept badly'); assert.equal(mine[0].mine, true); assert.equal(mine[0].verified, true);
  const stranger = await M.loadConversation({ sb: sb.as('x1'), session: other.session, linkId: 'L', otherSignKey: null });
  assert.equal(stranger.length, 0);
  // even if a stranger were handed the row, they hold no key for it
  await assert.rejects(other.session.open(sb.rows[0].sealed, { context: `msg:L:${sb.rows[0].id}` }));
});

test('a tampered or re-attributed message is flagged', async () => {
  const client = await person('c1'), th = await person('t1'), mallory = await person('m1');
  const sb = fakeSb();
  await M.sendMessage({ sb: sb.as('c1'), session: client.session, linkId: 'L', other: { id: 't1', public_enc: th.pub.enc }, text: 'real' });
  // verifying against the wrong sender key fails
  const bad = await M.loadConversation({ sb: sb.as('t1'), session: th.session, linkId: 'L', otherSignKey: mallory.pub.sign });
  assert.equal(bad[0].verified, false);
  // changing the signed fields (here the link) breaks it
  sb.rows[0].signature = sb.rows[0].signature.slice(0, -4) + 'AAAA';
  const forged = await M.loadConversation({ sb: sb.as('t1'), session: th.session, linkId: 'L', otherSignKey: client.pub.sign });
  assert.equal(forged[0].verified, false);
});

test('a message cannot be moved to another conversation', async () => {
  const client = await person('c1'), th = await person('t1');
  const sb = fakeSb();
  await M.sendMessage({ sb: sb.as('c1'), session: client.session, linkId: 'L', other: { id: 't1', public_enc: th.pub.enc }, text: 'x' });
  sb.rows[0].link_id = 'OTHER';
  const got = await M.loadConversation({ sb: sb.as('t1'), session: th.session, linkId: 'OTHER', otherSignKey: client.pub.sign });
  assert.equal(got[0].text, null, 'sealed to the original link, so it will not open elsewhere');
});

test('empty, oversized and keyless sends are refused', async () => {
  const client = await person('c1'), th = await person('t1');
  const sb = fakeSb().as('c1'), o = { id: 't1', public_enc: th.pub.enc };
  await assert.rejects(M.sendMessage({ sb, session: client.session, linkId: 'L', other: o, text: '   ' }), /Write something/);
  await assert.rejects(M.sendMessage({ sb, session: client.session, linkId: 'L', other: o, text: 'a'.repeat(M.MAX_CHARS + 1) }), /up to/);
  await assert.rejects(M.sendMessage({ sb, session: client.session, linkId: 'L', other: { id: 't1' }, text: 'hi' }), /secure vault/);
});

test('the pair safety code is a readable code, the same for both people', async () => {
  const { pairSafetyCode } = await import('../../assets/js/vault/vault-crypto.js');
  const a = await pairSafetyCode('FP-A', 'FP-B'), b = await pairSafetyCode('FP-B', 'FP-A');
  assert.equal(typeof a, 'string'); assert.match(a, /\d/); assert.equal(a, b);
  assert.notEqual(a, await pairSafetyCode('FP-A', 'FP-C'));
});

test('a worksheet can be assigned along with a message; unknown worksheets are refused; the server sees nothing readable', async () => {
  const th = await person('t1'), client = await person('c1'), sb = fakeSb();
  await M.sendMessage({ sb: sb.as('t1'), session: th.session, linkId: 'L', other: { id: 'c1', public_enc: client.pub.enc }, text: 'Try this before Thursday.', assign: 'dear-man' });
  await M.sendMessage({ sb: sb.as('t1'), session: th.session, linkId: 'L', other: { id: 'c1', public_enc: client.pub.enc }, text: '', assign: 'grow' });
  const got = await M.loadConversation({ sb: sb.as('c1'), session: client.session, linkId: 'L', otherSignKey: th.pub.sign });
  assert.deepEqual(got.map(m => [m.assign, m.text, m.verified]), [['dear-man', 'Try this before Thursday.', true], ['grow', '', true]]);
  assert.ok(!/dear-man|grow|Thursday/.test(JSON.stringify(sb.rows)), 'stored sealed');
  await assert.rejects(M.sendMessage({ sb: sb.as('t1'), session: th.session, linkId: 'L', other: { id: 'c1', public_enc: client.pub.enc }, text: 'x', assign: '../evil' }), /not available/);
  assert.equal(M.cleanAssign('fast'), 'fast'); assert.equal(M.cleanAssign('nope'), null); assert.equal(M.cleanAssign({}), null);
});

test('a handover agreement is a signed message the therapist can check; a withdrawal cancels it', async () => {
  const { currentConsents } = await import('../../assets/js/messages/handover.js');
  const th = await person('t1'), client = await person('c1'), sb = fakeSb();
  const send = (text, handover) => M.sendMessage({ sb: sb.as('c1'), session: client.session, linkId: 'L', other: { id: 't1', public_enc: th.pub.enc }, text, handover });
  await send('I agree to a handover to Dr B.', { to: 'Dr B' });
  const read = () => M.loadConversation({ sb: sb.as('t1'), session: th.session, linkId: 'L', otherSignKey: client.pub.sign });
  assert.deepEqual(currentConsents(await read()).map(c => [c.to, c.verified]), [['Dr B', true]]);
  assert.ok(!/Dr B/.test(JSON.stringify(sb.rows)), 'stored sealed');
  await new Promise(r => setTimeout(r, 5)); await send('I take it back.', { to: 'dr b', withdrawn: true });
  assert.deepEqual(currentConsents(await read()), []);
  await assert.rejects(send('x', { to: '  ' }), /name of the therapist/);
  // a therapist cannot forge the client's agreement: a message from the therapist is not "from the client"
  await M.sendMessage({ sb: sb.as('t1'), session: th.session, linkId: 'L', other: { id: 'c1', public_enc: client.pub.enc }, text: 'x', handover: { to: 'Dr Evil' } });
  assert.deepEqual(currentConsents(await read(), { fromClient: m => !m.mine }).map(c => c.to), []);
});
