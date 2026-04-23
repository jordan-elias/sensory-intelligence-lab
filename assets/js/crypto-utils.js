/**
 * /assets/js/crypto-utils.js
 *
 * Client-side encryption for the Sensory Intelligence Lab.
 *
 * Architecture overview
 * ─────────────────────
 * Each user has a single AES-256-GCM content key (the "user key").
 * This key is generated once and never stored in plaintext anywhere.
 * It is stored in two encrypted forms in the database:
 *
 *   1. encryption_key_enc — wrapped with a key derived from the user's
 *      password via PBKDF2. Used for normal login/session access.
 *
 *   2. encryption_key_recovery_enc — wrapped with a random recovery key
 *      shown to the user once on first login. Used if the password is
 *      forgotten and the account needs to be recovered.
 *
 * The user key itself is held in memory only (module-level variable).
 * It is never written to localStorage, sessionStorage, or any
 * persistent store.
 *
 * All content encryption uses AES-256-GCM with a random 96-bit IV
 * per operation. The IV is stored alongside the ciphertext.
 *
 * For therapist sharing, items are re-encrypted with the therapist's
 * RSA-OAEP public key (2048-bit). This allows the therapist to decrypt
 * shared items using their private key without ever having access to
 * the user's AES key.
 *
 * Public API
 * ──────────
 * Key management:
 *   generateUserKey()
 *   deriveWrappingKey(password, salt)
 *   generateRecoveryKey()
 *   wrapKey(userKey, wrappingKey)
 *   unwrapKey(wrapped, wrappingKey)
 *   wrapKeyWithRecovery(userKey, recoveryKey)
 *   unwrapKeyWithRecovery(wrapped, recoveryKey)
 *   setUserKey(key)
 *   getUserKey()
 *   clearUserKey()
 *   hasUserKey()
 *
 * Content encryption:
 *   encrypt(plaintext)
 *   decrypt(payload)
 *
 * Therapist sharing:
 *   encryptForTherapist(plaintext, therapistPublicKeyJwk)
 *   decryptAsTherapist(payload, therapistPrivateKey)
 *   generateTherapistKeypair()
 *   wrapTherapistPrivateKey(privateKey, wrappingKey)
 *   unwrapTherapistPrivateKey(wrapped, wrappingKey)
 *   exportPublicKeyAsJwk(publicKey)
 *   importPublicKeyFromJwk(jwk)
 *
 * Utilities:
 *   generateSalt()
 *   bufferToBase64(buffer)
 *   base64ToBuffer(base64)
 *
 * All async functions return Promises and throw on failure.
 * Callers should always use try/catch.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 310_000;  // OWASP 2023 recommendation for SHA-256
const PBKDF2_HASH      = 'SHA-256';
const AES_ALGORITHM    = 'AES-GCM';
const AES_KEY_LENGTH   = 256;        // bits
const IV_LENGTH        = 12;         // bytes — 96 bits, optimal for AES-GCM
const SALT_LENGTH      = 16;         // bytes
const RSA_ALGORITHM    = 'RSA-OAEP';
const RSA_KEY_LENGTH   = 2048;       // bits
const RSA_HASH         = 'SHA-256';

// Recovery key character set — unambiguous alphanumeric, uppercase only
const RECOVERY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_KEY_LENGTH = 24;


// ─────────────────────────────────────────────────────────────
// IN-MEMORY KEY STORE
// The user key lives only here — never in any persistent store.
// ─────────────────────────────────────────────────────────────

let _userKey = null;  // CryptoKey (AES-256-GCM)


// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Convert an ArrayBuffer or Uint8Array to a base64 string.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to a Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a cryptographically random salt for PBKDF2.
 * @returns {Uint8Array}
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV for AES-GCM.
 * @returns {Uint8Array}
 */
function generateIV() {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}


// ─────────────────────────────────────────────────────────────
// KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Generate a new AES-256-GCM content key for a user.
 * Called once on account creation. The returned key must be
 * immediately wrapped and stored — it cannot be recovered if lost.
 *
 * @returns {Promise<CryptoKey>}
 */
export async function generateUserKey() {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,   // extractable — needed so we can wrap/export it
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a wrapping key from a password and salt using PBKDF2.
 * This key is used to encrypt/decrypt the user's AES content key.
 * The wrapping key itself is never stored.
 *
 * @param {string} password — the user's password (plaintext)
 * @param {Uint8Array} salt — random salt (stored in database)
 * @returns {Promise<CryptoKey>} — AES-256-GCM key for wrapping
 */
export async function deriveWrappingKey(password, salt) {
  const encoder   = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash:       PBKDF2_HASH,
    },
    keyMaterial,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,  // wrapping keys are not extractable
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Generate a human-readable recovery key.
 * This is shown to the user once and never stored by the platform.
 * It is used to unwrap the user's AES key if they lose their password.
 *
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (groups of 4 for readability)
 *
 * @returns {string}
 */
export function generateRecoveryKey() {
  const chars  = [];
  const values = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_LENGTH));
  for (let i = 0; i < RECOVERY_KEY_LENGTH; i++) {
    chars.push(RECOVERY_CHARSET[values[i] % RECOVERY_CHARSET.length]);
  }
  // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  return chars.join('').match(/.{4}/g).join('-');
}

/**
 * Derive a wrapping key from a recovery key string.
 * Uses a fixed salt derived from the recovery key itself —
 * since the recovery key is random and never stored, this is safe.
 *
 * @param {string} recoveryKey — the recovery key string (with or without dashes)
 * @returns {Promise<CryptoKey>}
 */
async function deriveRecoveryWrappingKey(recoveryKey) {
  // Strip dashes to get raw key material
  const raw     = recoveryKey.replace(/-/g, '');
  const encoder = new TextEncoder();

  // Use a fixed application-specific salt combined with the key itself
  // to produce the salt for derivation. This avoids storing any salt.
  const saltSource = encoder.encode('SIL-recovery-v1:' + raw);
  const saltHash   = await crypto.subtle.digest('SHA-256', saltSource);
  const salt       = new Uint8Array(saltHash).slice(0, SALT_LENGTH);

  return deriveWrappingKey(raw, salt);
}

/**
 * Wrap (encrypt) the user's AES key with a password-derived wrapping key.
 * The result is stored in profiles.encryption_key_enc.
 *
 * @param {CryptoKey} userKey      — the AES-256-GCM content key
 * @param {CryptoKey} wrappingKey  — derived from password via deriveWrappingKey()
 * @param {Uint8Array} salt        — the salt used to derive the wrapping key (must be stored)
 * @returns {Promise<string>}      — JSON string: { iv, ciphertext, salt }
 */
export async function wrapKey(userKey, wrappingKey, salt) {
  const iv         = generateIV();
  const ciphertext = await crypto.subtle.wrapKey(
    'raw',
    userKey,
    wrappingKey,
    { name: AES_ALGORITHM, iv }
  );

  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    salt:       bufferToBase64(salt),
  });
}

/**
 * Unwrap (decrypt) the user's AES key using a password-derived wrapping key.
 *
 * @param {string} wrappedJson    — JSON string from wrapKey()
 * @param {string} password       — the user's password
 * @returns {Promise<CryptoKey>}  — the AES-256-GCM content key
 */
export async function unwrapKey(wrappedJson, password) {
  const { iv, ciphertext, salt } = JSON.parse(wrappedJson);

  const wrappingKey = await deriveWrappingKey(
    password,
    base64ToBuffer(salt)
  );

  return crypto.subtle.unwrapKey(
    'raw',
    base64ToBuffer(ciphertext),
    wrappingKey,
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap the user's AES key with a recovery key.
 * The result is stored in profiles.encryption_key_recovery_enc.
 * No salt is stored — it is derived deterministically from the recovery key.
 *
 * @param {CryptoKey} userKey      — the AES-256-GCM content key
 * @param {string} recoveryKey     — the recovery key string
 * @returns {Promise<string>}      — JSON string: { iv, ciphertext }
 */
export async function wrapKeyWithRecovery(userKey, recoveryKey) {
  const wrappingKey = await deriveRecoveryWrappingKey(recoveryKey);
  const iv          = generateIV();

  const ciphertext  = await crypto.subtle.wrapKey(
    'raw',
    userKey,
    wrappingKey,
    { name: AES_ALGORITHM, iv }
  );

  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  });
}

/**
 * Unwrap the user's AES key using a recovery key.
 * Called during account recovery when the password is unknown.
 *
 * @param {string} wrappedJson    — JSON string from wrapKeyWithRecovery()
 * @param {string} recoveryKey    — the user's recovery key
 * @returns {Promise<CryptoKey>}  — the AES-256-GCM content key
 */
export async function unwrapKeyWithRecovery(wrappedJson, recoveryKey) {
  const { iv, ciphertext } = JSON.parse(wrappedJson);
  const wrappingKey        = await deriveRecoveryWrappingKey(recoveryKey);

  return crypto.subtle.unwrapKey(
    'raw',
    base64ToBuffer(ciphertext),
    wrappingKey,
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Store the user key in the module-level in-memory store.
 * Call this after a successful unwrapKey() on login.
 * The key is lost when the page is unloaded — this is intentional.
 *
 * @param {CryptoKey} key
 */
export function setUserKey(key) {
  _userKey = key;
}

/**
 * Retrieve the in-memory user key.
 * Returns null if the key has not been set (e.g. page reload without re-login).
 *
 * @returns {CryptoKey|null}
 */
export function getUserKey() {
  return _userKey;
}

/**
 * Clear the in-memory user key.
 * Call this on sign-out.
 */
export function clearUserKey() {
  _userKey = null;
}

/**
 * Check whether the user key is currently held in memory.
 *
 * @returns {boolean}
 */
export function hasUserKey() {
  return _userKey !== null;
}


// ─────────────────────────────────────────────────────────────
// CONTENT ENCRYPTION
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using the in-memory user key.
 * Uses AES-256-GCM with a random IV per operation.
 *
 * @param {string} plaintext — the content to encrypt
 * @returns {Promise<string>} — JSON string: { iv, ciphertext }
 *                              suitable for storage in Supabase
 *
 * @throws {Error} if no user key is in memory
 */
export async function encrypt(plaintext) {
  if (!_userKey) {
    throw new Error('No user key in memory. User must be logged in.');
  }

  const encoder    = new TextEncoder();
  const iv         = generateIV();
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    _userKey,
    encoder.encode(plaintext)
  );

  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  });
}

/**
 * Decrypt a payload encrypted with encrypt().
 *
 * @param {string} payload    — JSON string from encrypt()
 * @returns {Promise<string>} — the original plaintext
 *
 * @throws {Error} if no user key is in memory, or if decryption fails
 *                 (wrong key, tampered data, etc.)
 */
export async function decrypt(payload) {
  if (!_userKey) {
    throw new Error('No user key in memory. User must be logged in.');
  }

  const { iv, ciphertext } = JSON.parse(payload);
  const decoder            = new TextDecoder();

  const plainBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    _userKey,
    base64ToBuffer(ciphertext)
  );

  return decoder.decode(plainBuffer);
}


// ─────────────────────────────────────────────────────────────
// THERAPIST KEYPAIR (RSA-OAEP)
// ─────────────────────────────────────────────────────────────
// The therapist has an asymmetric keypair.
// The public key is stored in profiles.therapist_public_key (JWK JSON).
// The private key is stored wrapped in profiles.therapist_private_key_enc.
//
// When a user shares an item, they:
//   1. Fetch the therapist's public key from the profiles table.
//   2. Re-encrypt the plaintext content with that public key.
//   3. Store the result in shared_items.encrypted_for_therapist.
//
// The therapist decrypts shared items using their private key,
// which is unwrapped from the database using their password.

/**
 * Generate a new RSA-OAEP keypair for the therapist.
 * Called once on therapist account setup.
 *
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateTherapistKeypair() {
  return crypto.subtle.generateKey(
    {
      name:           RSA_ALGORITHM,
      modulusLength:  RSA_KEY_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),  // 65537
      hash:           RSA_HASH,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export the therapist's public key as a JWK JSON string.
 * This is stored in profiles.therapist_public_key and is
 * readable by any authenticated user.
 *
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>} — JSON string
 */
export async function exportPublicKeyAsJwk(publicKey) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
}

/**
 * Import a therapist public key from JWK JSON string.
 * Used by clients when encrypting shared items.
 *
 * @param {string} jwkJson — the value from profiles.therapist_public_key
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKeyFromJwk(jwkJson) {
  const jwk = JSON.parse(jwkJson);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: RSA_ALGORITHM, hash: RSA_HASH },
    false,  // public keys don't need to be re-exportable
    ['encrypt']
  );
}

/**
 * Wrap the therapist's RSA private key with their password-derived
 * AES wrapping key. Stored in profiles.therapist_private_key_enc.
 *
 * @param {CryptoKey} privateKey   — the RSA-OAEP private key
 * @param {CryptoKey} wrappingKey  — AES-256-GCM key from deriveWrappingKey()
 * @param {Uint8Array} salt        — salt used to derive the wrapping key
 * @returns {Promise<string>}      — JSON string: { iv, ciphertext, salt }
 */
export async function wrapTherapistPrivateKey(privateKey, wrappingKey, salt) {
  const iv         = generateIV();
  const ciphertext = await crypto.subtle.wrapKey(
    'pkcs8',
    privateKey,
    wrappingKey,
    { name: AES_ALGORITHM, iv }
  );

  return JSON.stringify({
    iv:         bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
    salt:       bufferToBase64(salt),
  });
}

/**
 * Unwrap the therapist's RSA private key using their password.
 *
 * @param {string} wrappedJson  — JSON string from wrapTherapistPrivateKey()
 * @param {string} password     — the therapist's password
 * @returns {Promise<CryptoKey>}
 */
export async function unwrapTherapistPrivateKey(wrappedJson, password) {
  const { iv, ciphertext, salt } = JSON.parse(wrappedJson);

  const wrappingKey = await deriveWrappingKey(password, base64ToBuffer(salt));

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
// THERAPIST SHARING
// ─────────────────────────────────────────────────────────────

/**
 * Encrypt content for the therapist to read.
 *
 * Strategy: hybrid encryption.
 *   1. Generate a one-time AES-256-GCM key (the "session key").
 *   2. Encrypt the plaintext with the session key.
 *   3. Encrypt the session key with the therapist's RSA-OAEP public key.
 *   4. Store both together.
 *
 * This allows arbitrarily large content to be shared without RSA
 * size limits (RSA-OAEP 2048 can only encrypt ~190 bytes directly).
 *
 * @param {string} plaintext                — the content to share
 * @param {string} therapistPublicKeyJwk    — from profiles.therapist_public_key
 * @returns {Promise<string>}               — JSON string stored in
 *                                           shared_items.encrypted_for_therapist
 */
export async function encryptForTherapist(plaintext, therapistPublicKeyJwk) {
  const therapistPublicKey = await importPublicKeyFromJwk(therapistPublicKeyJwk);
  const encoder            = new TextEncoder();

  // 1. Generate a one-time session key
  const sessionKey = await crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. Encrypt the plaintext with the session key
  const iv              = generateIV();
  const encryptedContent = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    sessionKey,
    encoder.encode(plaintext)
  );

  // 3. Export the session key as raw bytes and encrypt with RSA public key
  const rawSessionKey      = await crypto.subtle.exportKey('raw', sessionKey);
  const encryptedSessionKey = await crypto.subtle.encrypt(
    { name: RSA_ALGORITHM },
    therapistPublicKey,
    rawSessionKey
  );

  return JSON.stringify({
    encryptedSessionKey: bufferToBase64(encryptedSessionKey),
    iv:                  bufferToBase64(iv),
    ciphertext:          bufferToBase64(encryptedContent),
  });
}

/**
 * Decrypt a shared item as the therapist.
 * Requires the therapist's RSA private key to be available.
 *
 * @param {string} payload             — JSON string from encrypted_for_therapist
 * @param {CryptoKey} therapistPrivateKey — the unwrapped RSA private key
 * @returns {Promise<string>}          — the original plaintext
 */
export async function decryptAsTherapist(payload, therapistPrivateKey) {
  const { encryptedSessionKey, iv, ciphertext } = JSON.parse(payload);
  const decoder = new TextDecoder();

  // 1. Decrypt the session key with RSA private key
  const rawSessionKey = await crypto.subtle.decrypt(
    { name: RSA_ALGORITHM },
    therapistPrivateKey,
    base64ToBuffer(encryptedSessionKey)
  );

  // 2. Import the raw session key
  const sessionKey = await crypto.subtle.importKey(
    'raw',
    rawSessionKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  );

  // 3. Decrypt the content
  const plainBuffer = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBuffer(iv) },
    sessionKey,
    base64ToBuffer(ciphertext)
  );

  return decoder.decode(plainBuffer);
}


// ─────────────────────────────────────────────────────────────
// ACCOUNT SETUP HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Full key setup for a new user account.
 * Called after email confirmation, before the user reaches the dashboard.
 *
 * Returns everything needed to write to the profiles table,
 * plus the recovery key to display to the user.
 *
 * @param {string} password — the user's password
 * @returns {Promise<{
 *   encryption_key_enc: string,
 *   encryption_key_recovery_enc: string,
 *   recoveryKey: string,
 *   salt: string
 * }>}
 */
export async function setupNewUserKeys(password) {
  const userKey    = await generateUserKey();
  const salt       = generateSalt();
  const wrappingKey = await deriveWrappingKey(password, salt);
  const recoveryKey = generateRecoveryKey();

  const [keyEnc, keyRecoveryEnc] = await Promise.all([
    wrapKey(userKey, wrappingKey, salt),
    wrapKeyWithRecovery(userKey, recoveryKey),
  ]);

  // Hold the user key in memory for the current session
  setUserKey(userKey);

  return {
    encryption_key_enc:          keyEnc,
    encryption_key_recovery_enc: keyRecoveryEnc,
    recoveryKey,                 // Show to user ONCE — never store this
    salt: bufferToBase64(salt),  // Already embedded in keyEnc, included for reference
  };
}

/**
 * Unlock the user key from the database on login.
 * Call this after Supabase auth succeeds and you have the
 * profile row including encryption_key_enc.
 *
 * @param {string} encryptionKeyEnc — profiles.encryption_key_enc
 * @param {string} password         — the user's password
 * @returns {Promise<void>}
 *
 * @throws {Error} if decryption fails (wrong password, corrupted data)
 */
export async function unlockUserKey(encryptionKeyEnc, password) {
  const key = await unwrapKey(encryptionKeyEnc, password);
  setUserKey(key);
}

/**
 * Unlock the user key using the recovery key.
 * Used during password recovery flow.
 *
 * After calling this, prompt the user to set a new password
 * and call rotateUserKeyPassword() to re-wrap with the new password.
 *
 * @param {string} encryptionKeyRecoveryEnc — profiles.encryption_key_recovery_enc
 * @param {string} recoveryKey              — the user's recovery key string
 * @returns {Promise<void>}
 *
 * @throws {Error} if decryption fails (wrong recovery key)
 */
export async function unlockUserKeyWithRecovery(encryptionKeyRecoveryEnc, recoveryKey) {
  const key = await unwrapKeyWithRecovery(encryptionKeyRecoveryEnc, recoveryKey);
  setUserKey(key);
}

/**
 * Re-wrap the user key with a new password.
 * Called after a password change.
 *
 * The user key itself does not change — only the wrapping changes.
 * All encrypted content remains valid.
 *
 * @param {string} newPassword — the new password
 * @returns {Promise<{ encryption_key_enc: string, key_version: number }>}
 *          — write these values back to the profiles table
 *
 * @throws {Error} if no user key is in memory
 */
export async function rotateUserKeyPassword(newPassword) {
  if (!_userKey) {
    throw new Error('No user key in memory. Cannot rotate without the current key.');
  }

  const salt        = generateSalt();
  const wrappingKey = await deriveWrappingKey(newPassword, salt);
  const keyEnc      = await wrapKey(_userKey, wrappingKey, salt);

  return {
    encryption_key_enc: keyEnc,
    // Caller should increment key_version in the profiles update
  };
}


// ─────────────────────────────────────────────────────────────
// THERAPIST ACCOUNT SETUP
// ─────────────────────────────────────────────────────────────

/**
 * Full keypair setup for a therapist account.
 * Called once when is_therapist is first set to true.
 *
 * @param {string} password — the therapist's password
 * @returns {Promise<{
 *   therapist_public_key: string,   — store in profiles (readable by all)
 *   therapist_private_key_enc: string  — store in profiles (encrypted)
 * }>}
 */
export async function setupTherapistKeypair(password) {
  const keypair     = await generateTherapistKeypair();
  const salt        = generateSalt();
  const wrappingKey = await deriveWrappingKey(password, salt);

  const [publicKeyJwk, privateKeyEnc] = await Promise.all([
    exportPublicKeyAsJwk(keypair.publicKey),
    wrapTherapistPrivateKey(keypair.privateKey, wrappingKey, salt),
  ]);

  return {
    therapist_public_key:      publicKeyJwk,
    therapist_private_key_enc: privateKeyEnc,
  };
}
