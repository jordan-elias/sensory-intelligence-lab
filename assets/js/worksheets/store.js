/**
 * /assets/js/worksheets/store.js
 * The only module that talks to Supabase for worksheet rows.
 * Payloads are encrypted client-side before they leave the browser.
 *
 * Payload envelope (before encryption):  { type, schema, data }
 *   schema 1 (default / legacy): `data` is a flat key -> value map
 *   schema 2: used by the music autobiography (chapters array)
 */
import { getSupabase, getUser, ensureVaultReady } from './core.js';
import { encrypt, decrypt, isEncrypted } from '/assets/js/crypto-utils.js';

export class ConflictError extends Error {
  constructor() { super('This entry was changed on another device.'); this.name = 'ConflictError'; }
}

const LIST_COLS = 'id, title, type, created_at';
let _hasUpdatedAt = null; // detected lazily; false until the SQL migration is run

async function userId() {
  const u = getUser();
  if (u?.id) return u.id;
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session?.user?.id;
}

/** Metadata only (no content), newest first. */
export async function list(type) {
  const sb = await getSupabase();
  const uid = await userId();
  const run = cols => sb.from('worksheets').select(cols).eq('user_id', uid).eq('type', type)
    .order('created_at', { ascending: false });

  if (_hasUpdatedAt !== false) {
    const { data, error } = await run(LIST_COLS + ', updated_at');
    if (!error) { _hasUpdatedAt = true; return data || []; }
    if (!/updated_at/.test(error.message || '')) throw error;
    _hasUpdatedAt = false;
  }
  const { data, error } = await run(LIST_COLS);
  if (error) throw error;
  return data || [];
}

/** Fetch + decrypt one entry. Returns { id, title, type, created_at, updated_at, payload }. */
export async function get(id) {
  await ensureVaultReady();
  const sb = await getSupabase();
  const uid = await userId();
  const { data: row, error } = await sb.from('worksheets')
    .select('*').eq('id', id).eq('user_id', uid).single();
  if (error || !row) throw new Error(error?.message || 'Entry not found');
  if ('updated_at' in row) _hasUpdatedAt = true;
  const plaintext = isEncrypted(row.content) ? await decrypt(row.content) : row.content;
  const payload = JSON.parse(plaintext);
  return {
    id: row.id, title: row.title, type: row.type,
    created_at: row.created_at, updated_at: row.updated_at || null,
    payload,
  };
}

async function seal(type, schema, data) {
  await ensureVaultReady();
  return encrypt(JSON.stringify({ type, schema, data }));
}

export async function create({ type, title, schema = 1, data }) {
  const sb = await getSupabase();
  const content = await seal(type, schema, data);
  const now = new Date().toISOString();
  const row = {
    user_id: await userId(), title, type, content,
    encrypted_at: now, key_version: 1,
  };
  if (_hasUpdatedAt) row.updated_at = now;
  const { data: created, error } = await sb.from('worksheets').insert(row)
    .select(_hasUpdatedAt ? 'id, updated_at' : 'id').single();
  if (error) throw error;
  return { id: created.id, updated_at: created.updated_at || null };
}

/**
 * Update an entry. When the DB has `updated_at`, the write only succeeds if
 * the row hasn't changed since `expectedUpdatedAt` (otherwise ConflictError).
 */
export async function update(id, { type, title, schema = 1, data, expectedUpdatedAt = null }) {
  const sb = await getSupabase();
  const content = await seal(type, schema, data);
  const now = new Date().toISOString();
  const patch = { title, content, encrypted_at: now };
  if (_hasUpdatedAt) patch.updated_at = now;

  let q = sb.from('worksheets').update(patch).eq('id', id).eq('user_id', await userId());
  if (_hasUpdatedAt && expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
  const { data: rows, error } = await q.select(_hasUpdatedAt ? 'id, updated_at' : 'id');
  if (error) throw error;
  if (!rows || rows.length === 0) {
    if (_hasUpdatedAt && expectedUpdatedAt) throw new ConflictError();
    throw new Error('Entry not found');
  }
  return { updated_at: rows[0].updated_at || null };
}

/** Latest updated_at for an entry (used to knowingly overwrite after a conflict). */
export async function latestUpdatedAt(id) {
  if (!_hasUpdatedAt) return null;
  const sb = await getSupabase();
  const { data, error } = await sb.from('worksheets').select('updated_at').eq('id', id).single();
  if (error) throw error;
  return data.updated_at;
}

export async function remove(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('worksheets').delete().eq('id', id).eq('user_id', await userId());
  if (error) throw error;
}
