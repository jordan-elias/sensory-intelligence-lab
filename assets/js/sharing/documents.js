/**
 * /assets/js/sharing/documents.js
 * Sharing a worksheet with your therapist, one document at a time.
 * Sharing a document is the choice itself: nothing is shared unless you press "Share" on it.
 * The copy is encrypted in this browser for you and your therapist only, and it is refreshed when
 * you edit the worksheet, until you stop sharing it or the connection ends.
 */
import { seal } from '../vault/vault-crypto.js';

export const DOC_CATEGORY = 'worksheets';
const ctx = (linkId, id) => `share:${linkId}:${DOC_CATEGORY}:${id}`;

/** What the therapist receives: the worksheet as the client wrote it. */
export function documentPayload(entry) {
  return JSON.stringify({
    v: 1, id: entry.id, type: entry.type, title: entry.title ?? '', schema: entry.schema ?? 1,
    data: entry.data ?? {}, created_at: entry.created_at ?? null, updated_at: new Date().toISOString(),
  });
}

export async function sealDocument(session, target, entry) {
  return seal(documentPayload(entry),
    [{ id: target.therapist_id, encPublicJwk: target.public_enc }, { id: session.userId, encPublicJwk: session.publicKeys.enc }],
    { context: ctx(target.link_id, entry.id) });
}

export async function sharedDocumentIds(sb) {
  const { data, error } = await sb.from('shared_copies').select('source_id').eq('category', DOC_CATEGORY);
  if (error) throw new Error(error.message);
  return new Set((data || []).map(r => r.source_id));
}

/** Shares (or re-shares) one document. */
export async function shareDocument({ sb, session, target, entry }) {
  const sealed = await sealDocument(session, target, entry);
  const { data: existing, error: e1 } = await sb.from('shared_copies').select('id')
    .eq('category', DOC_CATEGORY).eq('source_id', entry.id).limit(1);
  if (e1) throw new Error(e1.message);
  const { error } = existing && existing.length
    ? await sb.from('shared_copies').update({ sealed, updated_at: new Date().toISOString() }).eq('category', DOC_CATEGORY).eq('source_id', entry.id)
    : await sb.from('shared_copies').insert({
        link_id: target.link_id, client_id: session.userId, therapist_id: target.therapist_id, category: DOC_CATEGORY,
        source_id: entry.id, source_created_at: entry.created_at || new Date().toISOString(), sealed });
  if (error) throw new Error(error.message);
}

/** Stops sharing a document (possible while connected). */
export async function unshareDocument(sb, id) {
  const { error } = await sb.from('shared_copies').delete().eq('category', DOC_CATEGORY).eq('source_id', id);
  if (error) throw new Error(error.message);
}

// ── Keeping a shared copy current while the client keeps editing ──
let cache = null;   // { ids:Set, target } once primed

export async function prime(sb, getTarget) {
  try { cache = { ids: await sharedDocumentIds(sb), target: await getTarget(sb) }; }
  catch { cache = null; }
  return cache;
}
export const isShared = id => !!cache && cache.ids.has(id);
export const markShared = (id, on) => { if (cache) { on ? cache.ids.add(id) : cache.ids.delete(id); } };

/** Called after a worksheet was saved. Does nothing unless this document is shared. Never throws. */
export async function afterSave({ sb, session, entry }) {
  try {
    if (!cache || !cache.target || !cache.ids.has(entry.id)) return false;
    await shareDocument({ sb, session, target: cache.target, entry });
    return true;
  } catch (e) { console.warn('[sharing] shared worksheet was not refreshed:', e.message); return false; }
}

/** Called after a worksheet was deleted. Never throws. */
export async function afterDelete(sb, id) {
  try { if (cache && cache.ids.has(id)) { await unshareDocument(sb, id); cache.ids.delete(id); } }
  catch (e) { console.warn('[sharing] could not withdraw deleted worksheet:', e.message); }
}
