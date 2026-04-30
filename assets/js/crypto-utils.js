/**
 * /assets/js/crypto-utils.js
 *
 * Client-side encryption for the Sensory Intelligence Lab.
 *
 * ── Architecture ────────────────────────────────────────────
 *
 * Each user has a single AES-256-GCM content key (the "user key").
 * This key is generated server-side by the get-or-create-vault-key
 * Netlify function on the user's first visit to a protected page.
 *
 * The key is stored in profiles.encryption_key_enc encrypted with
 * a wrapping key derived from a platform secret + the user's ID
 * using HKDF. The platform secret lives only in Netlify environment
 * variables and never touches the database.
 *
 * On each session, the Netlify function verifies the user's JWT,
 * derives the wrapping key, decrypts the vault key, and returns
 * the plaintext AES key bytes (base64) to the authenticated client
 * over HTTPS. The client imports it as a non-extractable CryptoKey
 * and holds it in memory only.
 *
 * On logout clearUserKey() is called and the key is gone from memory.
 *
 * ── What this means in practice ─────────────────────────────
 *
 * - Supabase database contains only ciphertext
 * - A database breach alone cannot decrypt user content
 * - The platform operator can theoretically decrypt content
 *   if the Netlify environment secret is also compromised
 * - This is clearly disclosed in the privacy policy
 * - A future upgrade path to user-passphrase wrapping (true E2E)
 *   can be layered on without changing encrypted content
 *
 * ── Therapist sharing ────────────────────────────────────────
 *
 * When a user explicitly shares an item, it is re-encrypted with
 * the practice's RSA-OAEP public key. This is genuinely E2E
 * regardless of how the vault key is protected.
 *
 * ── Public API ───────────────────────────────────────────────
 *
 * Memory key store:
 *   loadUserKeyFromBase64(base64Key)  → Promise<void>
 *   setUserKey(key)
 *   getUserKey()                      → CryptoKey|null
 *   clearUserKey()
 *   hasUserKey()                      → boolean
 *
 * Content encryption:
 *   encrypt(plaintext)                → Promise<string>
 *   decrypt(payload)                  → Promise<string>
 *   decryptSafe(payload)              → Promise<string|null>
 *   isEncrypted(value)                → boolean
 *
 * Practice sharing (RSA-OAEP hybrid):
 *   encryptForPractice(plaintext, practicePublicKeyJwk) → Promise<string>
 *   decryptAsPractice(payload, practicePrivateKey)      → Promise<string>
 *
 * Practice keypair management:
 *   generatePracticeKeypair()                     → Promise<CryptoKeyPair>
 *   exportPublicKeyAsJwk(publicKey)               → Promise<string>
 *   importPublicKeyFromJwk(jwkJson)               → Promise<CryptoKey>
 *   wrapPracticePrivateKey(privateKey, password)  → Promise<string>
 *   unwrapPracticePrivateKey(wrappedJson, password) → Promise<CryptoKey>
 *
 * Utilities:
 *   bufferToBase64(buffer)   → string
 *   base64ToBuffer(base64)   → Uint8Array
 *   generateSalt()           → Uint8Array
 *
 * FUTURE (not yet called anywhere — upgrade path to true E2E):
 *   generateRecoveryKey()
 *   wrapCurrentKeyWithPassphrase(passphrase)
 *   unlockKeyWithPassphrase(wrappedJson, passphrase)
 */

'use strict';


// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const AES_ALGORITHM   = 'AES-GCM';
const AES_KEY_LENGTH  = 256;
const IV_LENGTH       = 12;
const SALT_LENGTH     = 16;
const RSA_ALGORITHM   = 'RSA-OAEP';
const RSA_KEY_LENGTH  = 2048;
const RSA_HASH        = 'SHA-256';

// FUTURE: PBKDF2 settings for passphrase upgrade path
const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_HASH       = 'SHA-256';

const RECOVERY_CHARSET    = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_KEY_LENGTH = 24;


// ─────────────────────────────────────────────────────────────
// IN-MEMORY KEY STORE
// ─────────────────────────────────────────────────────────────

let _userKey = null;


// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────

export function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

function _generateIV() {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}


// ─────────────────────────────────────────────────────────────
// MEMORY KEY STORE
// ─────────────────────────────────────────────────────────────

/**
 * Import a raw AES key from the base64 string returned by the
 * vault Netlify function and hold it in memory.
 * The key is non-extractable once imported.
 *
 * @param {string} base64Key
 * @returns {Promise<void>}
 */
export async function loadUserKeyFromBase64(base64Key) {
  const keyBytes = base64ToBuffer(base64Key);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
  setUserKey(key);
}

export function setUserKey(key)  { _userKey = key; }
export function getUserKey()     { return _userKey; }
export function clearUserKey()   { _userKey = null; }
export function hasUserKey()     { return _userKey !== null; }


// ─────────────────────────────────────────────────────────────
// CONTENT ENCRYPTION
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with the in-memory user key.
 * Returns a JSON string safe to store in a Supabase TEXT column.
 *
 * @param {string} plaintext
 * @returns {Promise<string>}
 * @throws if no key in memory
 */
export async function encrypt(plaintext) {
  if (!_userKey) throw new Error('Vault not unlocked.');
  const encoder    = new TextEncoder();
  const iv         = _generateIV();
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    _userKey,
    encoder.encode(plaintext)
  );
  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    v:          1,
  });
}

/**
 * Decrypt a payload produced by encrypt().
 *
 * @param {string} payload
 * @returns {Promise<string>}
 * @throws if no key in memory or decryption fails
 */
export async function decrypt(payload) {
  if (!_userKey) throw new Error('Vault not unlocked.');
  const { iv, ciphertext } = JSON.parse(payload);
  const decoder            = new TextDecoder();
  const plainBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    _userKey,
    base64ToBuffer(ciphertext)
  );
  return decoder.decode(plainBuffer);
}

/**
 * Safely attempt to decrypt — returns null instead of throwing.
 * Use when rendering lists where one bad entry should not
 * break the whole page.
 *
 * @param {string|null} payload
 * @returns {Promise<string|null>}
 */
export async function decryptSafe(payload) {
  if (!payload) return null;
  try { return await decrypt(payload); }
  catch { return null; }
}

/**
 * Check whether a string looks like an encrypted payload.
 * Lets pages distinguish encrypted entries from any plaintext
 * that might exist (e.g. during development).
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const p = JSON.parse(value);
    return typeof p.iv === 'string' && typeof p.ciphertext === 'string';
  } catch { return false; }
}


// ─────────────────────────────────────────────────────────────
// PRACTICE SHARING — RSA-OAEP hybrid encryption
//
// When a user shares an item the content is re-encrypted with
// the practice's RSA public key. Only the practice private key
// can decrypt it. This is genuinely E2E for shared items.
//
// Hybrid strategy (avoids RSA 190-byte size limit):
//   1. Generate a one-time AES session key
//   2. Encrypt plaintext with session key (AES-GCM)
//   3. Encrypt session key with RSA public key
//   4. Store together
// ─────────────────────────────────────────────────────────────

export async function importPublicKeyFromJwk(jwkJson) {
  return crypto.subtle.importKey(
    'jwk',
    JSON.parse(jwkJson),
    { name: RSA_ALGORITHM, hash: RSA_HASH },
    false,
    ['encrypt']
  );
}

export async function exportPublicKeyAsJwk(publicKey) {
  return JSON.stringify(await crypto.subtle.exportKey('jwk', publicKey));
}

/**
 * Encrypt content for the practice to read (user-initiated sharing).
 *
 * @param {string} plaintext
 * @param {string} practicePublicKeyJwk — from practices.public_key
 * @returns {Promise<string>}
 */
export async function encryptForPractice(plaintext, practicePublicKeyJwk) {
  const pubKey  = await importPublicKeyFromJwk(practicePublicKeyJwk);
  const encoder = new TextEncoder();

  const sessionKey = await crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  const iv               = _generateIV();
  const encryptedContent = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    sessionKey,
    encoder.encode(plaintext)
  );

  const rawSessionKey       = await crypto.subtle.exportKey('raw', sessionKey);
  const encryptedSessionKey = await crypto.subtle.encrypt(
    { name: RSA_ALGORITHM },
    pubKey,
    rawSessionKey
  );

  return JSON.stringify({
    encryptedSessionKey: bufferToBase64(encryptedSessionKey),
    iv:                  bufferToBase64(iv),
    ciphertext:          bufferToBase64(encryptedContent),
    v:                   1,
  });
}

/**
 * Decrypt a shared item as the practice (therapist dashboard).
 *
 * @param {string} payload
 * @param {CryptoKey} practicePrivateKey
 * @returns {Promise<string>}
 */
export async function decryptAsPractice(payload, practicePrivateKey) {
  const { encryptedSessionKey, iv, ciphertext } = JSON.parse(payload);
  const decoder = new TextDecoder();

  const rawSessionKey = await crypto.subtle.decrypt(
    { name: RSA_ALGORITHM },
    practicePrivateKey,
    base64ToBuffer(encryptedSessionKey)
  );

  const sessionKey = await crypto.subtle.importKey(
    'raw',
    rawSessionKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  );

  const plainBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    sessionKey,
    base64ToBuffer(ciphertext)
  );

  return decoder.decode(plainBuffer);
}


// ─────────────────────────────────────────────────────────────
// PRACTICE KEYPAIR MANAGEMENT
// Used during therapist dashboard setup (Phase 5).
// ─────────────────────────────────────────────────────────────

export async function generatePracticeKeypair() {
  return crypto.subtle.generateKey(
    {
      name:           RSA_ALGORITHM,
      modulusLength:  RSA_KEY_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash:           RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapPracticePrivateKey(privateKey, password) {
  const salt        = generateSalt();
  const wrappingKey = await _deriveKeyFromPassword(password, salt);
  const iv          = _generateIV();
  const ciphertext  = await crypto.subtle.wrapKey(
    'pkcs8', privateKey, wrappingKey, { name: AES_ALGORITHM, iv }
  );
  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    salt:       bufferToBase64(salt),
  });
}

export async function unwrapPracticePrivateKey(wrappedJson, password) {
  const { iv, ciphertext, salt } = JSON.parse(wrappedJson);
  const wrappingKey = await _deriveKeyFromPassword(
    password, base64ToBuffer(salt)
  );
  return crypto.subtle.unwrapKey(
    'pkcs8',
    base64ToBuffer(ciphertext),
    wrappingKey,
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    { name: RSA_ALGORITHM, hash: RSA_HASH },
    true,
    ['decrypt']
  );
}


// ─────────────────────────────────────────────────────────────
// INTERNAL — password key derivation (PBKDF2)
// Used for practice private key wrapping above, and kept
// for the future user-passphrase upgrade path.
// ─────────────────────────────────────────────────────────────

async function _deriveKeyFromPassword(password, salt) {
  const encoder     = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
}


// ─────────────────────────────────────────────────────────────
// FUTURE: User passphrase upgrade path
// Not called anywhere in current codebase.
// Foundation for upgrading to true E2E in a future phase.
// ─────────────────────────────────────────────────────────────

export function generateRecoveryKey() {
  const chars  = [];
  const values = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_LENGTH));
  for (let i = 0; i < RECOVERY_KEY_LENGTH; i++) {
    chars.push(RECOVERY_CHARSET[values[i] % RECOVERY_CHARSET.length]);
  }
  return chars.join('').match(/.{4}/g).join('-');
}

export async function wrapCurrentKeyWithPassphrase(passphrase) {
  if (!_userKey) throw new Error('No user key in memory.');
  const salt        = generateSalt();
  const wrappingKey = await _deriveKeyFromPassword(passphrase, salt);
  const iv          = _generateIV();
  const ciphertext  = await crypto.subtle.wrapKey(
    'raw', _userKey, wrappingKey, { name: AES_ALGORITHM, iv }
  );
  return {
    encryption_key_enc: JSON.stringify({
      iv:         bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext),
      salt:       bufferToBase64(salt),
      model:      'passphrase',
    }),
  };
}

export async function unlockKeyWithPassphrase(wrappedJson, passphrase) {
  const { iv, ciphertext, salt } = JSON.parse(wrappedJson);
  const wrappingKey = await _deriveKeyFromPassword(
    passphrase, base64ToBuffer(salt)
  );
  const key = await crypto.subtle.unwrapKey(
    'raw',
    base64ToBuffer(ciphertext),
    wrappingKey,
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
  setUserKey(key);
}
