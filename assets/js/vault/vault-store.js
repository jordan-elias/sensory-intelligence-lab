/**
 * /assets/js/vault/vault-store.js
 * The only place the vault talks to Supabase. Stores the user's key bundle
 * (already wrapped by their passphrase and recovery key; the server never
 * sees either).
 */
import { VaultError } from './vault-crypto.js';

export function whenAuthReady() {
  return new Promise(resolve => {
    if (window._currentUser && window._supabase) return resolve();
    window.addEventListener('authReady', () => resolve(), { once: true });
  });
}
export async function client() { await whenAuthReady(); return window._supabase; }

export async function currentUserId() {
  await whenAuthReady();
  if (window._currentUser?.id) return window._currentUser.id;
  const sb = await client();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new VaultError('no-session', 'You are signed out.');
  return session.user.id;
}

/** @returns {Promise<{user_id, bundle, updated_at, recovery_acknowledged_at}|null>} */
export async function fetchKeys(userId) {
  const sb = await client();
  const { data, error } = await sb.from('user_keys')
    .select('user_id, bundle, updated_at, recovery_acknowledged_at')
    .eq('user_id', userId).maybeSingle();
  if (error) throw new VaultError('network', 'Could not reach your key store: ' + error.message);
  return data || null;
}

export async function insertKeys(userId, bundle) {
  const sb = await client();
  const now = new Date().toISOString();
  const { data, error } = await sb.from('user_keys').insert({
    user_id: userId, bundle,
    public_enc: bundle.public.enc, public_sign: bundle.public.sign,
    fingerprint: bundle.fingerprint, recovery_acknowledged_at: now,
  }).select('user_id, bundle, updated_at, recovery_acknowledged_at');
  if (error) {
    if (error.code === '23505') throw new VaultError('exists', 'A vault already exists for this account.');
    throw new VaultError('network', 'Could not save your keys: ' + error.message);
  }
  return Array.isArray(data) ? data[0] : data;
}

/** Update only if nobody else changed the row since we read it. */
export async function updateBundle(userId, bundle, expectedUpdatedAt, extra = {}) {
  const sb = await client();
  const { data, error } = await sb.from('user_keys')
    .update({ bundle, ...extra })
    .eq('user_id', userId).eq('updated_at', expectedUpdatedAt)
    .select('user_id, bundle, updated_at, recovery_acknowledged_at');
  if (error) throw new VaultError('network', 'Could not save your keys: ' + error.message);
  if (!data || !data.length) throw new VaultError('conflict', 'Your vault was changed on another device. Reload this page and try again.');
  return data[0];
}
