/**
 * /assets/js/vault/migrate-legacy.js
 * One-time upgrade of entries saved under the old server-held key to the user's new
 * passphrase-protected key. Safe to interrupt and run again.
 *
 * For every old-format row (payload ends in "v":1}):
 *   1. decrypt with the old key           2. encrypt with the new key
 *   3. decrypt the new ciphertext and check it matches the original text
 *   4. only then overwrite the row, and only if it has not changed in the meantime
 * Rows that fail any step are left exactly as they were and counted.
 */
import { importLegacyKey, decryptWithKey } from './vault-crypto.js';
import { API_BASE } from '../api.js';

export const TARGETS = [
  { table: 'worksheets',      column: 'content' },
  { table: 'journal_entries', column: 'content' },
  { table: 'checkins',        column: 'notes'   },
];
const OLD_FORMAT = '%"v":1}';
const PAGE = 25;

/** How many old-format rows does this user have? */
export async function countLegacy(sb, userId) {
  let total = 0;
  for (const { table, column } of TARGETS) {
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true })
      .eq('user_id', userId).like(column, OLD_FORMAT);
    if (error) throw new Error(`Could not check ${table}: ${error.message}`);
    total += count || 0;
  }
  return total;
}

async function* legacyRows(sb, userId, { table, column }) {
  let last = null;
  for (;;) {
    let q = sb.from(table).select(`id, ${column}`).eq('user_id', userId).like(column, OLD_FORMAT)
      .order('id', { ascending: true }).limit(PAGE);
    if (last) q = q.gt('id', last);
    const { data, error } = await q;
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    if (!data || !data.length) return;
    for (const row of data) yield row;
    last = data[data.length - 1].id;
    if (data.length < PAGE) return;
  }
}

/** Fetches the old key from the server. Only called for users who actually have one. */
export async function fetchLegacyKey(sb) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('No active session');
  const res = await fetch(`${API_BASE}/.netlify/functions/get-or-create-vault-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error('Could not fetch your old key: ' + await res.text());
  return (await res.json()).key;
}

/**
 * @param {object} o
 * @param {object} o.sb        supabase client
 * @param {string} o.userId
 * @param {object} o.session   unlocked vault session (new key)
 * @param {string} o.legacyKey base64 old key
 * @param {(done:number)=>void} [o.onProgress]
 * @param {boolean} [o.collect] decrypt only and return the plain text, to build a backup
 * @returns {{upgraded:number, failed:number, backup?:object}}
 */
export async function migrateLegacy({ sb, userId, session, legacyKey, onProgress, collect = false }) {
  const old = await importLegacyKey(legacyKey);
  let upgraded = 0, failed = 0;
  const backup = {};
  for (const target of TARGETS) {
    for await (const row of legacyRows(sb, userId, target)) {
      const oldValue = row[target.column];
      try {
        const plain = await decryptWithKey(old, oldValue);
        if (collect) { (backup[target.table] ||= []).push({ id: row.id, [target.column]: plain }); continue; }
        const fresh = await session.encrypt(plain);
        if ((await session.decrypt(fresh)) !== plain) throw new Error('verify');
        const { data, error } = await sb.from(target.table).update({ [target.column]: fresh })
          .eq('id', row.id).eq('user_id', userId).eq(target.column, oldValue).select('id');
        if (error || !data || data.length !== 1) throw new Error(error?.message || 'row changed');
        upgraded++; onProgress?.(upgraded);
      } catch { failed++; }
    }
  }
  return collect ? { backup, failed } : { upgraded, failed };
}

/** After an upgrade: asks the server to erase the old key (it refuses to serve it again). Best effort. */
export async function retireLegacyKey(sb) {
  try { await fetchLegacyKey(sb); } catch { /* 410 = already retired; anything else is retried next time */ }
}
