/**
 * /assets/js/vault/vault-crypto.js
 *
 * Key system v2: keys that only the user can unlock. The server stores the
 * "bundle" below and never receives the passphrase, the recovery key or any
 * unwrapped key.
 *
 *   passphrase --Argon2id--> KEK ---wraps---> content key (MCK)
 *   recovery key --HKDF----> KEK2 --wraps---> content key (MCK)   (second way in)
 *   MCK ---encrypts---> identity private keys (ECDH P-256 + ECDSA P-256)
 *
 * Everything the user saves is encrypted with the MCK (AES-256-GCM).
 * Anything sent to another person is sealed to their ECDH public key
 * (ephemeral-static ECDH + HKDF + AES-GCM) and can be signed with the
 * sender's ECDSA key.
 *
 * Bundle (JSON, safe to store on the server):
 * {
 *   v: 2,
 *   kdf: { alg:'argon2id', m, t, p, salt },
 *   content_key:  { iv, ct },            // MCK wrapped by the passphrase key
 *   recovery:     { salt, iv, ct },      // MCK wrapped by the recovery key
 *   identity:     { iv, ct },            // private JWKs, encrypted with MCK
 *   public:       { enc: JWK, sign: JWK },
 *   fingerprint:  "12345 67890 ..."      // safety code of the public keys
 * }
 *
 * All blobs are bound with AES-GCM additional data to the user id and their
 * purpose, so a server cannot move a blob to another user or role.
 */
import { argon2id } from './argon2.js';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const VAULT_VERSION = 2;

/** Default Argon2id cost: 64 MiB, 3 passes, 1 lane (about 1 s on a recent phone). */
export const DEFAULT_KDF = Object.freeze({ alg: 'argon2id', m: 65536, t: 3, p: 1 });
/** Anything weaker is refused when unlocking, except in tests. */
export const MIN_KDF = Object.freeze({ m: 19456, t: 2, p: 1 });
const MAX_KDF = Object.freeze({ m: 262144, t: 12, p: 8 });

export class VaultError extends Error {
  constructor(code, message) { super(message || code); this.name = 'VaultError'; this.code = code; }
}

// ── small helpers ───────────────────────────────────────
export function b64e(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64d(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const wipe = u => { try { u.fill(0); } catch { /* best effort */ } };
const aad = (...parts) => te.encode(['sil-v2', ...parts].join('|'));

async function aeadSeal(key, bytes, additional) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additional }, key, bytes);
  return { iv: b64e(iv), ct: b64e(ct) };
}
async function aeadOpen(key, blob, additional) {
  return new Uint8Array(await subtle.decrypt(
    { name: 'AES-GCM', iv: b64d(blob.iv), additionalData: additional }, key, b64d(blob.ct)));
}
const aesKey = (raw, usages, extractable = false) =>
  subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, usages);

// ── passphrase policy ───────────────────────────────────
const COMMON = ['password', 'passwort', '12345678', 'qwertz', 'qwerty', 'letmein', 'iloveyou', 'admin', 'welcome'];

export function normalizePassphrase(p) {
  return String(p ?? '').normalize('NFKC').trim();
}

/**
 * @param {string} passphrase
 * @param {string[]} [avoid] personal strings (email, name) it must not contain
 * @returns {{ok:boolean, issues:string[], length:number}}
 */
export function checkPassphrase(passphrase, avoid = []) {
  const s = normalizePassphrase(passphrase);
  const lower = s.toLowerCase();
  const issues = [];
  if (s.length < 12) issues.push('Use at least 12 characters. A short sentence of unrelated words works well.');
  if (new Set(s).size < 6) issues.push('Use a wider variety of characters.');
  if (COMMON.some(c => lower.includes(c))) issues.push('Avoid common passwords.');
  for (const a of avoid) {
    const x = String(a || '').toLowerCase().split('@')[0];
    if (x.length >= 4 && lower.includes(x)) { issues.push('Do not include your name or email.'); break; }
  }
  return { ok: issues.length === 0, issues, length: s.length };
}

// ── key derivation ──────────────────────────────────────
function checkKdf(kdf, allowWeak) {
  if (!kdf || kdf.alg !== 'argon2id') throw new VaultError('unsupported-kdf', 'Unsupported key derivation.');
  const { m, t, p } = kdf;
  if (![m, t, p].every(Number.isInteger)) throw new VaultError('bad-kdf', 'Invalid key derivation settings.');
  if (m > MAX_KDF.m || t > MAX_KDF.t || p > MAX_KDF.p || m < 8 || t < 1 || p < 1) throw new VaultError('bad-kdf', 'Key derivation settings out of range.');
  if (!allowWeak && (m < MIN_KDF.m || t < MIN_KDF.t)) throw new VaultError('weak-kdf', 'Key derivation settings are too weak.');
}

async function passphraseKek(passphrase, kdf, { allowWeak = false } = {}) {
  checkKdf(kdf, allowWeak);
  const raw = await argon2id({
    password: te.encode(normalizePassphrase(passphrase)),
    salt: b64d(kdf.salt), memoryKiB: kdf.m, iterations: kdf.t, parallelism: kdf.p, hashLength: 32,
  });
  try { return await aesKey(raw, ['encrypt', 'decrypt']); } finally { wipe(raw); }
}

// ── recovery key ────────────────────────────────────────
const RK_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I, O, 0, 1
const RK_BYTES = 20;                                 // 160 bits = 32 symbols

function b32(bytes) {
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += RK_CHARS[(acc >> (bits - 5)) & 31]; bits -= 5; }
    acc &= (1 << bits) - 1; // keep only unread bits so the integer never overflows
  }
  return out;
}
function unb32(str) {
  let bits = 0, acc = 0; const out = [];
  for (const ch of str) {
    const v = RK_CHARS.indexOf(ch);
    if (v < 0) throw new VaultError('bad-recovery-key', 'That recovery key is not valid.');
    acc = (acc << 5) | v; bits += 5;
    if (bits >= 8) { out.push((acc >> (bits - 8)) & 255); bits -= 8; }
    acc &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}
async function rkCheck(bytes) {
  const h = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return RK_CHARS[h[0] & 31] + RK_CHARS[h[1] & 31];
}
async function formatRecoveryKey(bytes) {
  const s = b32(bytes) + await rkCheck(bytes);
  return s.match(/.{1,4}/g).join('-');
}
async function parseRecoveryKey(text) {
  const s = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 34) throw new VaultError('bad-recovery-key', 'That recovery key is not valid.');
  const bytes = unb32(s.slice(0, 32));
  if (bytes.length !== RK_BYTES || (await rkCheck(bytes)) !== s.slice(32)) {
    throw new VaultError('bad-recovery-key', 'That recovery key has a typo. Check it and try again.');
  }
  return bytes;
}
async function recoveryKek(bytes, salt) {
  const base = await subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('sil-v2|recovery') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ── safety codes ────────────────────────────────────────
async function digits(text) {
  const h = new Uint8Array(await subtle.digest('SHA-256', te.encode(text)));
  let n = 0n;
  for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(h[i]);
  const d = (n % (10n ** 30n)).toString().padStart(30, '0');
  return d.match(/.{5}/g).join(' ');
}
const pick = (j, fields) => fields.map(f => j[f]).join('.');

/** Safety code for one person's public keys (30 digits, shown as 6 groups). */
export function fingerprintOf(pub) {
  return digits('sil-v2|fp|' + pick(pub.enc, ['crv', 'x', 'y']) + '|' + pick(pub.sign, ['crv', 'x', 'y']));
}
/** One code both people see; identical regardless of who is "A". */
export function pairSafetyCode(fpA, fpB) {
  return digits('sil-v2|pair|' + [fpA, fpB].sort().join('|'));
}

// ── session ─────────────────────────────────────────────
function pubOnly(jwk) { return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }; }
function pubOnlyPair(p) { return { enc: pubOnly(p.enc), sign: pubOnly(p.sign) }; }

async function buildSession(mckKey, bundle, userId) {
  let jwks;
  try {
    jwks = JSON.parse(td.decode(await aeadOpen(mckKey, bundle.identity, aad(userId, 'identity'))));
  } catch { throw new VaultError('corrupt', 'Your key data could not be read.'); }
  // Never trust the public half the server returns: it must match our own private keys,
  // otherwise a server could swap in a key of its own and be sent messages meant for us.
  const pub = bundle.public;
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.crv === b.crv;
  if (!same(pub && pub.enc, jwks.enc) || !same(pub && pub.sign, jwks.sign)) {
    throw new VaultError('corrupt', 'Your public keys do not match your private keys.');
  }
  const encPrivateKey = await subtle.importKey('jwk', jwks.enc, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const signPrivateKey = await subtle.importKey('jwk', jwks.sign, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return {
    userId,
    contentKey: mckKey,
    encPrivateKey, signPrivateKey,
    publicKeys: pubOnlyPair(pub),
    fingerprint: await fingerprintOf(pub),
    encrypt: text => encryptWithKey(mckKey, text),
    decrypt: payload => decryptWithKey(mckKey, payload),
    sign: data => signData(signPrivateKey, data),
    open: (sealed, opts) => open(sealed, { id: userId, encPrivateKey }, opts),
  };
}

async function unwrapRaw(bundle, credential, userId, opts) {
  if (credential.passphrase !== undefined) {
    const kek = await passphraseKek(credential.passphrase, bundle.kdf, opts);
    try { return await aeadOpen(kek, bundle.content_key, aad(userId, 'content-key', 'passphrase')); }
    catch { throw new VaultError('wrong-passphrase', 'That passphrase is not correct.'); }
  }
  if (credential.recoveryKey !== undefined) {
    const bytes = await parseRecoveryKey(credential.recoveryKey);
    const kek = await recoveryKek(bytes, b64d(bundle.recovery.salt));
    wipe(bytes);
    try { return await aeadOpen(kek, bundle.recovery, aad(userId, 'content-key', 'recovery')); }
    catch { throw new VaultError('wrong-recovery-key', 'That recovery key is not correct.'); }
  }
  throw new VaultError('no-credential', 'A passphrase or recovery key is required.');
}

async function sessionFromRaw(raw, bundle, userId) {
  const key = await aesKey(raw, ['encrypt', 'decrypt'], false);
  wipe(raw);
  return buildSession(key, bundle, userId);
}

// ── public API: lifecycle ───────────────────────────────
/**
 * Create a brand-new vault.
 * @returns {{bundle, recoveryKey:string, session}}  Show recoveryKey to the user once; never store it.
 */
export async function createVault({ passphrase, userId, kdf = DEFAULT_KDF, allowWeak = false }) {
  if (!userId) throw new VaultError('no-user', 'A user id is required.');
  const policy = checkPassphrase(passphrase);
  if (!policy.ok && !allowWeak) throw new VaultError('weak-passphrase', policy.issues[0]);

  const params = { alg: 'argon2id', m: kdf.m, t: kdf.t, p: kdf.p, salt: b64e(rand(16)) };
  const kek = await passphraseKek(passphrase, params, { allowWeak });

  const raw = rand(32);
  const mckKey = await aesKey(raw, ['encrypt', 'decrypt'], false);

  const rkBytes = rand(RK_BYTES);
  const rSalt = rand(16);
  const rkKek = await recoveryKek(rkBytes, rSalt);

  const enc = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sig = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const encPriv = await subtle.exportKey('jwk', enc.privateKey);
  const sigPriv = await subtle.exportKey('jwk', sig.privateKey);
  const pub = {
    enc: pubOnly(await subtle.exportKey('jwk', enc.publicKey)),
    sign: pubOnly(await subtle.exportKey('jwk', sig.publicKey)),
  };

  const bundle = {
    v: VAULT_VERSION,
    kdf: params,
    content_key: await aeadSeal(kek, raw, aad(userId, 'content-key', 'passphrase')),
    recovery: {
      salt: b64e(rSalt),
      ...(await aeadSeal(rkKek, raw, aad(userId, 'content-key', 'recovery'))),
    },
    identity: await aeadSeal(mckKey, te.encode(JSON.stringify({ enc: encPriv, sign: sigPriv })), aad(userId, 'identity')),
    public: pub,
    fingerprint: await fingerprintOf(pub),
  };
  const recoveryKey = await formatRecoveryKey(rkBytes);
  wipe(rkBytes); wipe(raw);
  return { bundle, recoveryKey, session: await buildSession(mckKey, bundle, userId) };
}

export async function unlockWithPassphrase(bundle, passphrase, userId, opts = {}) {
  const raw = await unwrapRaw(bundle, { passphrase }, userId, opts);
  return sessionFromRaw(raw, bundle, userId);
}

export async function unlockWithRecoveryKey(bundle, recoveryKey, userId, opts = {}) {
  const raw = await unwrapRaw(bundle, { recoveryKey }, userId, opts);
  return sessionFromRaw(raw, bundle, userId);
}

/** Set a new passphrase. `credential` is { passphrase } (old) or { recoveryKey }. Returns the new bundle. */
export async function changePassphrase(bundle, credential, newPassphrase, userId, { kdf = DEFAULT_KDF, allowWeak = false } = {}) {
  const policy = checkPassphrase(newPassphrase);
  if (!policy.ok && !allowWeak) throw new VaultError('weak-passphrase', policy.issues[0]);
  const raw = await unwrapRaw(bundle, credential, userId, { allowWeak });
  const params = { alg: 'argon2id', m: kdf.m, t: kdf.t, p: kdf.p, salt: b64e(rand(16)) };
  const kek = await passphraseKek(newPassphrase, params, { allowWeak });
  const next = { ...bundle, kdf: params, content_key: await aeadSeal(kek, raw, aad(userId, 'content-key', 'passphrase')) };
  wipe(raw);
  return next;
}

/** Replace the recovery key. Returns { bundle, recoveryKey }. */
export async function newRecoveryKey(bundle, credential, userId, opts = {}) {
  const raw = await unwrapRaw(bundle, credential, userId, opts);
  const rkBytes = rand(RK_BYTES);
  const rSalt = rand(16);
  const kek = await recoveryKek(rkBytes, rSalt);
  const next = { ...bundle, recovery: { salt: b64e(rSalt), ...(await aeadSeal(kek, raw, aad(userId, 'content-key', 'recovery'))) } };
  const recoveryKey = await formatRecoveryKey(rkBytes);
  wipe(rkBytes); wipe(raw);
  return { bundle: next, recoveryKey };
}

/** True if the stored settings are weaker than today's default, so they can be upgraded at next unlock. */
export function needsKdfUpgrade(bundle) {
  const k = bundle.kdf || {};
  return !(k.m >= DEFAULT_KDF.m && k.t >= DEFAULT_KDF.t && k.p >= DEFAULT_KDF.p);
}

// ── public API: content encryption ──────────────────────
/** Same JSON shape as the legacy encrypt() ({iv, ciphertext, v}) so isEncrypted() keeps working. */
export async function encryptWithKey(key, plaintext) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(plaintext));
  return JSON.stringify({ iv: b64e(iv), ciphertext: b64e(ct), v: 2 });
}
/** Reads v1 (legacy) and v2 payloads. */
export async function decryptWithKey(key, payload) {
  const { iv, ciphertext } = JSON.parse(payload);
  return td.decode(await subtle.decrypt({ name: 'AES-GCM', iv: b64d(iv) }, key, b64d(ciphertext)));
}
/** For migration: import the legacy server-provided base64 key to decrypt old rows. */
export function importLegacyKey(base64Key) {
  return aesKey(b64d(base64Key), ['decrypt'], false);
}

// ── public API: sharing with other people ───────────────
async function wrapFor(pubJwk, rawKey, context, id) {
  const recipient = await subtle.importKey('jwk', pubOnly(pubJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: recipient }, eph.privateKey, 256);
  const wrapKey = await hkdfAes(bits, context, id);
  return {
    id,
    epk: pubOnly(await subtle.exportKey('jwk', eph.publicKey)),
    ...(await aeadSeal(wrapKey, rawKey, aad('wrap', context, id))),
  };
}
async function hkdfAes(bits, context, id) {
  const base = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: aad('wrap-key', context, id) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt `plaintext` so only the listed recipients can read it.
 * Include the sender as a recipient to keep a readable copy.
 * @param {string} plaintext
 * @param {{id:string, encPublicJwk:object}[]} recipients
 * @param {{context?:string}} [opts] binds the message to a conversation, e.g. a link id
 */
export async function seal(plaintext, recipients, { context = '' } = {}) {
  if (!recipients || !recipients.length) throw new VaultError('no-recipients', 'At least one recipient is required.');
  const raw = rand(32);
  const key = await aesKey(raw, ['encrypt'], false);
  const body = await aeadSeal(key, te.encode(plaintext), aad('seal', context));
  const keys = [];
  for (const r of recipients) keys.push(await wrapFor(r.encPublicJwk, raw, context, r.id));
  wipe(raw);
  return { v: 2, iv: body.iv, ciphertext: body.ct, keys };
}

/** Open something sealed to `me`. @param {{id:string, encPrivateKey:CryptoKey}} me */
export async function open(sealed, me, { context = '' } = {}) {
  const entry = (sealed.keys || []).find(k => k.id === me.id);
  if (!entry) throw new VaultError('not-a-recipient', 'This was not sent to you.');
  try {
    const epk = await subtle.importKey('jwk', pubOnly(entry.epk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: epk }, me.encPrivateKey, 256);
    const wrapKey = await hkdfAes(bits, context, me.id);
    const raw = await aeadOpen(wrapKey, entry, aad('wrap', context, me.id));
    const key = await aesKey(raw, ['decrypt'], false);
    wipe(raw);
    return td.decode(await aeadOpen(key, { iv: sealed.iv, ct: sealed.ciphertext }, aad('seal', context)));
  } catch (e) {
    if (e instanceof VaultError) throw e;
    throw new VaultError('cannot-open', 'This could not be decrypted.');
  }
}

// ── public API: signatures ──────────────────────────────
const toBytes = d => (typeof d === 'string' ? te.encode(d) : d);

export async function signData(signPrivateKey, data) {
  return b64e(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signPrivateKey, toBytes(data)));
}
export async function verifySignature(signPublicJwk, data, signatureB64) {
  try {
    const key = await subtle.importKey('jwk', pubOnly(signPublicJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64d(signatureB64), toBytes(data));
  } catch { return false; }
}
