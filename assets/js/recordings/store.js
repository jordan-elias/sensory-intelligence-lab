/**
 * /assets/js/recordings/store.js
 * The user's audio library. Files are encrypted in the browser before they are uploaded,
 * and the title, duration and file type travel inside an encrypted payload, so the server
 * sees only that a file of a certain size exists. Old plain recordings are encrypted in
 * place the first time the vault is open.
 *
 * Recording (as pages see it):
 *   { id, created_at, title, duration_s, mime_type, file_size, storage_path, legacy }
 * `file_size` is the size of the stored (encrypted) file and is what counts towards the quota.
 */
import { ensureVaultReady } from '/assets/js/vault/gate.js';

const BUCKET = 'recordings';

async function ctx() {
  const session = await ensureVaultReady();
  const sb = window._supabase;
  const { data: { session: auth } } = await sb.auth.getSession();
  return { session, sb, uid: auth?.user?.id || window._currentUser?.id };
}
const newPath = uid => `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.enc`;

async function uploadBlob(sb, path, bytes) {
  const attempt = type => sb.storage.from(BUCKET).upload(path, new Blob([bytes], { type }), { contentType: type, upsert: false });
  let { error } = await attempt('application/octet-stream');
  // Some storage buckets only accept audio types; the content is encrypted either way.
  if (error && /mime|content.?type|not supported/i.test(error.message || '')) ({ error } = await attempt('audio/webm'));
  if (error) throw new Error(error.message);
}

export async function list() {
  const { session, sb } = await ctx();
  const { data, error } = await sb.from(BUCKET).select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const out = [];
  for (const r of data || []) {
    if (r.payload) {
      try {
        const p = JSON.parse(await session.decrypt(r.payload));
        out.push({ id: r.id, created_at: r.created_at, title: p.title, duration_s: p.duration_s, mime_type: p.mime_type, file_size: r.file_size, storage_path: r.storage_path, legacy: false });
      } catch { out.push({ id: r.id, created_at: r.created_at, title: '(cannot be opened)', duration_s: null, file_size: r.file_size, storage_path: r.storage_path, legacy: false, unreadable: true }); }
    } else {
      out.push({ id: r.id, created_at: r.created_at, title: r.title, duration_s: r.duration_s, mime_type: r.mime_type, file_size: r.file_size, storage_path: r.storage_path, legacy: true });
    }
  }
  return out;
}

/** Encrypts and uploads a File. Returns the new recording id. */
export async function upload(file, { durationS = null, title = null } = {}) {
  const { session, sb, uid } = await ctx();
  const bytes = await session.encryptBytes(new Uint8Array(await file.arrayBuffer()));
  const path = newPath(uid);
  await uploadBlob(sb, path, bytes);
  const payload = await session.encrypt(JSON.stringify({
    v: 1, title: title || file.name.replace(/\.[^.]+$/, ''), duration_s: durationS, mime_type: file.type || null,
  }));
  const { data, error } = await sb.from(BUCKET)
    .insert({ user_id: uid, payload, storage_path: path, file_size: bytes.length, title: null, duration_s: null, mime_type: null })
    .select('id');
  if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(error.message); }
  return (Array.isArray(data) ? data[0] : data).id;
}

async function download(sb, rec) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(rec.storage_path, 600);
  if (error || !data?.signedUrl) throw new Error('Could not get a download link');
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error('Download failed (HTTP ' + res.status + ')');
  return res.arrayBuffer();
}

/** The audio file's bytes, decrypted (or as stored, for an old plain recording). */
export async function fetchAudio(rec) {
  const { session, sb } = await ctx();
  const raw = await download(sb, rec);
  return rec.legacy ? raw : session.decryptBytes(raw);
}

export async function rename(rec, title) {
  const { session, sb, uid } = await ctx();
  if (rec.legacy) {
    const { error } = await sb.from(BUCKET).update({ title }).eq('id', rec.id).eq('user_id', uid);
    if (error) throw new Error(error.message);
    return;
  }
  const payload = await session.encrypt(JSON.stringify({ v: 1, title, duration_s: rec.duration_s, mime_type: rec.mime_type }));
  const { error } = await sb.from(BUCKET).update({ payload }).eq('id', rec.id).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

export async function remove(rec) {
  const { sb, uid } = await ctx();
  if (rec.storage_path) await sb.storage.from(BUCKET).remove([rec.storage_path]);
  const { error } = await sb.from(BUCKET).delete().eq('id', rec.id).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

/**
 * Encrypts old plain recordings one by one: upload the encrypted copy, point the row at it,
 * and only then delete the plain file. A failure leaves the original exactly as it was.
 * @returns {{done:number, failed:number}}
 */
export async function secureLegacy(recs, onProgress) {
  const { session, sb, uid } = await ctx();
  let done = 0, failed = 0;
  for (const rec of recs.filter(r => r.legacy)) {
    try {
      const plain = await download(sb, rec);
      const bytes = await session.encryptBytes(new Uint8Array(plain));
      if (new Uint8Array(await session.decryptBytes(bytes)).length !== plain.byteLength) throw new Error('verify');
      const path = newPath(uid);
      await uploadBlob(sb, path, bytes);
      const payload = await session.encrypt(JSON.stringify({ v: 1, title: rec.title, duration_s: rec.duration_s, mime_type: rec.mime_type }));
      const { data, error } = await sb.from(BUCKET)
        .update({ payload, storage_path: path, file_size: bytes.length, title: null, duration_s: null, mime_type: null, file_url: null })
        .eq('id', rec.id).eq('user_id', uid).is('payload', null).select('id');
      if (error || !data?.length) { await sb.storage.from(BUCKET).remove([path]); throw new Error(error?.message || 'row changed'); }
      await sb.storage.from(BUCKET).remove([rec.storage_path]);
      done++; onProgress?.(done);
    } catch { failed++; }
  }
  return { done, failed };
}
