/**
 * netlify/functions/get-or-create-vault-key.js   (LEGACY: migration only)
 *
 * Verifies the user's Supabase JWT and returns the user's OLD server-held AES-256 key,
 * wrapped with a platform HKDF secret, so the browser can convert old entries to the
 * user's own passphrase key. It never creates keys any more, and once a user has been
 * upgraded the stored old key is erased. Delete this function and VAULT_SECRET once no
 * profiles.encryption_key_enc values remain.
 *
 * Required Netlify environment variables:
 *   SUPABASE_URL              — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY — secret service role key (not publishable)
 *   VAULT_SECRET              — a long random string (used for HKDF wrapping)
 *
 * Generate VAULT_SECRET with e.g.:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'crypto';

const { subtle } = webcrypto;

// ─── Helpers ────────────────────────────────────────────────

function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

/**
 * Derive a wrapping key from the platform secret + userId using HKDF.
 * Each user gets a unique wrapping key so a compromised entry
 * doesn't expose others.
 */
async function deriveWrappingKey(platformSecret, userId) {
  const enc = new TextEncoder();

  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(platformSecret),
    'HKDF',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(userId),       // user-specific salt
      info: enc.encode('vault-key'),  // context label
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/** Encrypt (wrap) a raw AES key with the wrapping key. Returns a base64 JSON payload. */
async function wrapKey(contentKey, wrappingKey) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey('raw', contentKey, wrappingKey, {
    name: 'AES-GCM',
    iv,
  });
  return JSON.stringify({
    iv:      bufferToBase64(iv),
    wrapped: bufferToBase64(wrapped),
    v:       1,
  });
}

/** Decrypt (unwrap) a base64 JSON payload back into a CryptoKey. */
async function unwrapKey(payload, wrappingKey) {
  const { iv, wrapped } = JSON.parse(payload);
  return subtle.unwrapKey(
    'raw',
    base64ToBuffer(wrapped),
    wrappingKey,
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    { name: 'AES-GCM', length: 256 },
    true,               // extractable so we can export it for the client
    ['encrypt', 'decrypt']
  );
}

// ─── Handler ────────────────────────────────────────────────

export const handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── 1. Read env vars ──────────────────────────────────────
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAULT_SECRET } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAULT_SECRET) {
    console.error('Missing required environment variables');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  // ── 2. Verify the user's JWT ──────────────────────────────
  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { statusCode: 401, body: 'Unauthorised' };
  }

  // Use a *user-scoped* client to verify the JWT and get the user
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser(token);

  if (authError || !user) {
    console.error('Auth error:', authError?.message);
    return { statusCode: 401, body: 'Invalid or expired token' };
  }

  const userId = user.id;

  // ── 3. Service-role client for DB operations ──────────────
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── 4. Derive this user's unique wrapping key ─────────────
  let wrappingKey;
  try {
    wrappingKey = await deriveWrappingKey(VAULT_SECRET, userId);
  } catch (err) {
    console.error('HKDF error:', err);
    return { statusCode: 500, body: 'Key derivation failed' };
  }

  // ── 5. Check for an existing vault key ───────────────────
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('encryption_key_enc')
    .eq('id', userId)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    // PGRST116 = row not found — acceptable on first login
    console.error('Profile fetch error:', profileError.message);
    return { statusCode: 500, body: 'Database error' };
  }

  // ── 6a. Existing key — unwrap and return (only until the user has upgraded) ──
  if (profile?.encryption_key_enc) {
    // Once a user's entries have been upgraded to their own passphrase key the old key is
    // useless, so it is destroyed instead of being served again.
    const { data: uk } = await adminClient
      .from('user_keys').select('legacy_migrated_at').eq('user_id', userId).maybeSingle();
    if (uk?.legacy_migrated_at) {
      await adminClient.from('profiles').update({ encryption_key_enc: null }).eq('id', userId);
      return { statusCode: 410, body: 'Legacy key retired' };
    }

    let contentKey;
    try {
      contentKey = await unwrapKey(profile.encryption_key_enc, wrappingKey);
    } catch (err) {
      console.error('Unwrap error:', err);
      return { statusCode: 500, body: 'Could not unwrap vault key' };
    }

    const rawKey = await subtle.exportKey('raw', contentKey);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: bufferToBase64(rawKey) }),
    };
  }

  // ── 6b. No old key: nothing to hand out ──────────────────
  // This endpoint no longer creates keys. New content is locked with the user's own
  // passphrase-derived key, which the server never sees.
  return { statusCode: 404, body: 'No legacy key' };
};
