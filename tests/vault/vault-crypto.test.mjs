import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Load the vendored Argon2 build (a UMD bundle). The repo is "type": "module", so evaluate
// it as a CommonJS-style script, which is what the browser's script tag effectively does.
{
  const src = fs.readFileSync(new URL('../../assets/js/vendor/hash-wasm-argon2.umd.min.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  new Function('exports', 'module', src).call(mod.exports, mod.exports, mod);
  globalThis.hashwasm = mod.exports;
}

const V = await import('../../assets/js/vault/vault-crypto.js');
const FAST = { m: 1024, t: 1, p: 1 };              // test-only cost
const PASS = 'correct horse battery staple';
const UID = 'user-1';
const make = (extra = {}) => V.createVault({ passphrase: PASS, userId: UID, kdf: FAST, allowWeak: true, ...extra });
const code = async (p, c) => assert.rejects(p, e => e instanceof V.VaultError && e.code === c, `expected ${c}`);

test('vendored Argon2id matches an independent implementation (known-answer test)', async () => {
  // Expected value produced with argon2-cffi (reference C library) for the same inputs.
  const out = await globalThis.hashwasm.argon2id({
    password: new TextEncoder().encode('correct horse battery staple'),
    salt: new TextEncoder().encode('0123456789abcdef'),
    memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: 'hex',
  });
  assert.equal(out, '94c86f541abdb3d9aabfea59aa03963549483e9c0b1a79336e76b54cee6c917e');
});

test('create then unlock with the passphrase; content round-trips', async () => {
  const { bundle, session } = await make();
  const s2 = await V.unlockWithPassphrase(bundle, PASS, UID, { allowWeak: true });
  const payload = await session.encrypt('hello private world');
  assert.equal(await s2.decrypt(payload), 'hello private world');
});

test('envelope keeps the legacy shape and each encryption uses a fresh IV', async () => {
  const { session } = await make();
  const a = JSON.parse(await session.encrypt('x'));
  const b = JSON.parse(await session.encrypt('x'));
  assert.deepEqual(Object.keys(a).sort(), ['ciphertext', 'iv', 'v']);
  assert.equal(a.v, 2);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('wrong passphrase is rejected with a clear code', async () => {
  const { bundle } = await make();
  await code(V.unlockWithPassphrase(bundle, 'not the passphrase', UID, { allowWeak: true }), 'wrong-passphrase');
});

test('recovery key unlocks; wrong key and typos are rejected', async () => {
  const { bundle, recoveryKey, session } = await make();
  assert.match(recoveryKey, /^([A-Z2-9]{4}-){8}[A-Z2-9]{2}$/);
  const s = await V.unlockWithRecoveryKey(bundle, recoveryKey, UID);
  assert.equal(await s.decrypt(await session.encrypt('secret')), 'secret');
  // lower case and extra spaces are tolerated
  await V.unlockWithRecoveryKey(bundle, ' ' + recoveryKey.toLowerCase().replace(/-/g, ' ') + ' ', UID);
  // one character changed: caught by the checksum
  const chars = recoveryKey.split('');
  const i = chars.findIndex(c => c !== '-');
  chars[i] = chars[i] === 'A' ? 'B' : 'A';
  await code(V.unlockWithRecoveryKey(bundle, chars.join(''), UID), 'bad-recovery-key');
  // a different, valid key
  const other = await make();
  await code(V.unlockWithRecoveryKey(bundle, other.recoveryKey, UID), 'wrong-recovery-key');
});

test('blobs are bound to the user id', async () => {
  const { bundle } = await make();
  await code(V.unlockWithPassphrase(bundle, PASS, 'someone-else', { allowWeak: true }), 'wrong-passphrase');
});

test('tampering with stored blobs is detected', async () => {
  const { bundle } = await make();
  const flip = s => { const b = Buffer.from(s, 'base64'); b[0] ^= 1; return b.toString('base64'); };
  const bad = { ...bundle, content_key: { ...bundle.content_key, ct: flip(bundle.content_key.ct) } };
  await code(V.unlockWithPassphrase(bad, PASS, UID, { allowWeak: true }), 'wrong-passphrase');
  const bad2 = { ...bundle, identity: { ...bundle.identity, ct: flip(bundle.identity.ct) } };
  await code(V.unlockWithPassphrase(bad2, PASS, UID, { allowWeak: true }), 'corrupt');
});

test('a server cannot swap in its own public keys', async () => {
  const a = await make(); const evil = await V.createVault({ passphrase: PASS, userId: 'evil', kdf: FAST, allowWeak: true });
  const swapped = { ...a.bundle, public: evil.bundle.public, fingerprint: evil.bundle.fingerprint };
  await code(V.unlockWithPassphrase(swapped, PASS, UID, { allowWeak: true }), 'corrupt');
  // and a lying fingerprint is ignored: the session computes its own
  const lying = { ...a.bundle, fingerprint: '00000 00000 00000 00000 00000 00000' };
  const s = await V.unlockWithPassphrase(lying, PASS, UID, { allowWeak: true });
  assert.equal(s.fingerprint, a.bundle.fingerprint);
});

test('changing the passphrase keeps all data readable and the recovery key working', async () => {
  const { bundle, recoveryKey, session } = await make();
  const payload = await session.encrypt('keep me');
  const next = await V.changePassphrase(bundle, { passphrase: PASS }, 'a brand new long passphrase', UID, { kdf: FAST, allowWeak: true });
  await code(V.unlockWithPassphrase(next, PASS, UID, { allowWeak: true }), 'wrong-passphrase');
  const s = await V.unlockWithPassphrase(next, 'a brand new long passphrase', UID, { allowWeak: true });
  assert.equal(await s.decrypt(payload), 'keep me');
  assert.equal(s.fingerprint, session.fingerprint);
  await V.unlockWithRecoveryKey(next, recoveryKey, UID);
});

test('forgotten passphrase: recovery key can set a new one', async () => {
  const { bundle, recoveryKey, session } = await make();
  const payload = await session.encrypt('still here');
  const next = await V.changePassphrase(bundle, { recoveryKey }, 'another long passphrase here', UID, { kdf: FAST, allowWeak: true });
  const s = await V.unlockWithPassphrase(next, 'another long passphrase here', UID, { allowWeak: true });
  assert.equal(await s.decrypt(payload), 'still here');
});

test('rotating the recovery key invalidates the old one', async () => {
  const { bundle, recoveryKey } = await make();
  const r = await V.newRecoveryKey(bundle, { passphrase: PASS }, UID, { allowWeak: true });
  await code(V.unlockWithRecoveryKey(r.bundle, recoveryKey, UID), 'wrong-recovery-key');
  await V.unlockWithRecoveryKey(r.bundle, r.recoveryKey, UID);
});

test('Unicode normalisation: composed and decomposed passphrases are the same', async () => {
  const composed = 'café au lait und brötchen';
  const decomposed = 'café au lait und brötchen';
  const { bundle } = await V.createVault({ passphrase: composed, userId: UID, kdf: FAST, allowWeak: true });
  await V.unlockWithPassphrase(bundle, decomposed, UID, { allowWeak: true });
});

test('stored secrets never appear in the bundle', async () => {
  const { bundle, recoveryKey } = await make();
  const text = JSON.stringify(bundle);
  assert.ok(!text.includes(PASS));
  assert.ok(!text.includes(recoveryKey.replace(/-/g, '')));
  assert.ok(!/"d":/.test(text), 'no private JWK component in the clear');
});

test('keys held in the session cannot be exported', async () => {
  const { session } = await make();
  for (const k of [session.contentKey, session.encPrivateKey, session.signPrivateKey]) {
    assert.equal(k.extractable, false);
  }
});

test('weak or tampered key-derivation settings are refused', async () => {
  const { bundle } = await make();
  await code(V.unlockWithPassphrase(bundle, PASS, UID), 'weak-kdf');                // test-cost params, no allowWeak
  const huge = { ...bundle, kdf: { ...bundle.kdf, m: 99999999 } };
  await code(V.unlockWithPassphrase(huge, PASS, UID, { allowWeak: true }), 'bad-kdf');
  const other = { ...bundle, kdf: { ...bundle.kdf, alg: 'pbkdf2' } };
  await code(V.unlockWithPassphrase(other, PASS, UID, { allowWeak: true }), 'unsupported-kdf');
  const changed = { ...bundle, kdf: { ...bundle.kdf, t: 2 } };                      // different parameters derive a different key
  await code(V.unlockWithPassphrase(changed, PASS, UID, { allowWeak: true }), 'wrong-passphrase');
});

test('default settings round-trip and report their cost', async () => {
  const t0 = Date.now();
  const { bundle, session } = await V.createVault({ passphrase: PASS, userId: UID });
  const t1 = Date.now();
  const s = await V.unlockWithPassphrase(bundle, PASS, UID);
  const t2 = Date.now();
  console.log(`      default Argon2id (64 MiB, t=3): create ${t1 - t0} ms, unlock ${t2 - t1} ms (Node, not a phone)`);
  assert.equal(await s.decrypt(await session.encrypt('ok')), 'ok');
  assert.equal(V.needsKdfUpgrade(bundle), false);
});

test('KDF upgrade is reported for older, cheaper settings', async () => {
  const { bundle } = await make();
  assert.equal(V.needsKdfUpgrade(bundle), true);
});

test('passphrase policy', () => {
  assert.equal(V.checkPassphrase('short').ok, false);
  assert.equal(V.checkPassphrase('aaaaaaaaaaaaaaaa').ok, false);
  assert.equal(V.checkPassphrase('mypassword12345').ok, false);
  assert.equal(V.checkPassphrase('jordan-elias-rocks-123', ['jordan@example.com']).ok, false);
  assert.equal(V.checkPassphrase('purple tractor eats seven clouds').ok, true);
});

test('sealing: only the listed recipients can read; tampering and wrong context fail', async () => {
  const alice = await make(); const bob = await V.createVault({ passphrase: PASS, userId: 'bob', kdf: FAST, allowWeak: true });
  const carol = await V.createVault({ passphrase: PASS, userId: 'carol', kdf: FAST, allowWeak: true });
  const sealed = await V.seal('see you Thursday', [
    { id: UID, encPublicJwk: alice.bundle.public.enc },
    { id: 'bob', encPublicJwk: bob.bundle.public.enc },
  ], { context: 'link-7' });
  assert.equal(await alice.session.open(sealed, { context: 'link-7' }), 'see you Thursday');
  assert.equal(await bob.session.open(sealed, { context: 'link-7' }), 'see you Thursday');
  await code(carol.session.open(sealed, { context: 'link-7' }), 'not-a-recipient');
  await code(bob.session.open(sealed, { context: 'link-8' }), 'cannot-open');
  const flipped = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext, 'base64').map((b, i) => (i === 0 ? b ^ 1 : b)).toString('base64') };
  await code(bob.session.open(flipped, { context: 'link-7' }), 'cannot-open');
  // a key wrapped for Bob cannot be re-labelled as Alice's
  const swapped = { ...sealed, keys: [{ ...sealed.keys[1], id: UID }] };
  await code(alice.session.open(swapped, { context: 'link-7' }), 'cannot-open');
});

test('sealing: the same message sealed twice differs, and an empty recipient list is refused', async () => {
  const a = await make();
  const r = [{ id: UID, encPublicJwk: a.bundle.public.enc }];
  const s1 = await V.seal('x', r); const s2 = await V.seal('x', r);
  assert.notEqual(s1.ciphertext, s2.ciphertext);
  assert.notEqual(s1.keys[0].epk.x, s2.keys[0].epk.x);
  await code(V.seal('x', []), 'no-recipients');
});

test('signatures verify, and forgeries or edits fail', async () => {
  const a = await make(); const b = await V.createVault({ passphrase: PASS, userId: 'bob', kdf: FAST, allowWeak: true });
  const sig = await a.session.sign('{"from":"a","to":"b","n":1}');
  assert.equal(await V.verifySignature(a.bundle.public.sign, '{"from":"a","to":"b","n":1}', sig), true);
  assert.equal(await V.verifySignature(a.bundle.public.sign, '{"from":"a","to":"b","n":2}', sig), false);
  assert.equal(await V.verifySignature(b.bundle.public.sign, '{"from":"a","to":"b","n":1}', sig), false);
  assert.equal(await V.verifySignature(a.bundle.public.sign, 'x', 'not base64!!'), false);
});

test('safety codes: stable, 30 digits, unique per key set, and identical for both people', async () => {
  const a = await make(); const b = await V.createVault({ passphrase: PASS, userId: 'bob', kdf: FAST, allowWeak: true });
  assert.match(a.bundle.fingerprint, /^(\d{5} ){5}\d{5}$/);
  assert.equal(a.bundle.fingerprint, await V.fingerprintOf(a.bundle.public));
  assert.notEqual(a.bundle.fingerprint, b.bundle.fingerprint);
  assert.equal(await V.pairSafetyCode(a.bundle.fingerprint, b.bundle.fingerprint),
               await V.pairSafetyCode(b.bundle.fingerprint, a.bundle.fingerprint));
  // swapping in a different public key changes the code
  const forged = { enc: b.bundle.public.enc, sign: a.bundle.public.sign };
  assert.notEqual(await V.fingerprintOf(forged), a.bundle.fingerprint);
});

test('works with the existing crypto-utils: a session key installs and decrypts what it encrypts', async () => {
  const cu = await import('../../assets/js/crypto-utils.js');
  const { session } = await make();
  cu.setUserKey(session.contentKey);
  const payload = await cu.encrypt('via legacy api');
  assert.equal(JSON.parse(payload).v, 1);                      // legacy envelope tag stays as written by crypto-utils
  assert.equal(await session.decrypt(payload), 'via legacy api');
  assert.equal(await cu.decrypt(await session.encrypt('via v2 api')), 'via v2 api');
  assert.equal(cu.isEncrypted(await session.encrypt('z')), true);
  cu.clearUserKey();
});

test('migration helper: legacy server key decrypts old rows, new key re-encrypts', async () => {
  const cu = await import('../../assets/js/crypto-utils.js');
  const legacyRaw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const legacyB64 = Buffer.from(legacyRaw).toString('base64');
  await cu.loadUserKeyFromBase64(legacyB64);
  const oldRow = await cu.encrypt('written before the migration');
  cu.clearUserKey();
  const { session } = await make();
  const plain = await V.decryptWithKey(await V.importLegacyKey(legacyB64), oldRow);
  const newRow = await session.encrypt(plain);
  assert.equal(await session.decrypt(newRow), 'written before the migration');
  assert.equal(JSON.parse(newRow).v, 2);
});
