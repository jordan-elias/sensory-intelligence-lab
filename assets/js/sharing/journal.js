/**
 * /assets/js/sharing/journal.js
 * Sharing ONE journal entry with your therapist. Nothing is shared unless you press "Share" on that entry, and there is no
 * switch that shares more than one. The therapist receives a copy of the title, the date and the text, encrypted in this
 * browser for you and your therapist only. Not sent: the soundscape, the prompt, the timer and word counts.
 * A journal entry cannot be edited after it is saved, so the copy never needs refreshing.
 */
import { seal } from '../vault/vault-crypto.js';

export const JOURNAL_CATEGORY = 'journal';
const ctx = (linkId, id) => `share:${linkId}:${JOURNAL_CATEGORY}:${id}`;

/** What the therapist receives. */
export function journalPayload({ id, title, text, created_at }) {
  return JSON.stringify({ v: 1, id, kind: 'journal', title: title || '', text: text || '', created_at: created_at || null, shared_at: new Date().toISOString() });
}

export async function sharedJournalIds(sb) {
  const { data, error } = await sb.from('shared_copies').select('source_id').eq('category', JOURNAL_CATEGORY);
  if (error) throw new Error(error.message);
  return new Set((data || []).map(r => r.source_id));
}

export async function shareJournalEntry({ sb, session, target, entry }) {
  const sealed = await seal(journalPayload(entry),
    [{ id: target.therapist_id, encPublicJwk: target.public_enc }, { id: session.userId, encPublicJwk: session.publicKeys.enc }],
    { context: ctx(target.link_id, entry.id) });
  const { error } = await sb.from('shared_copies').insert({
    link_id: target.link_id, client_id: session.userId, therapist_id: target.therapist_id, category: JOURNAL_CATEGORY,
    source_id: entry.id, source_created_at: entry.created_at || new Date().toISOString(), sealed });
  if (error) throw new Error(error.message);
}

/** Takes the copy back from the platform (possible while connected). The therapist keeps nothing from it afterwards on the platform. */
export async function unshareJournalEntry(sb, id) {
  const { error } = await sb.from('shared_copies').delete().eq('category', JOURNAL_CATEGORY).eq('source_id', id);
  if (error) throw new Error(error.message);
}

/** Withdraws the shared copy of a journal entry that is being deleted. Never throws. */
export async function afterJournalDelete(sb, id) {
  try { await unshareJournalEntry(sb, id); } catch (e) { console.warn('[sharing] could not withdraw deleted journal entry:', e.message); }
}
