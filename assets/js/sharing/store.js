/**
 * /assets/js/sharing/store.js
 * Sharing check-ins with a therapist. Nothing is shared unless the client turned it on.
 *
 * A shared copy is encrypted in this browser for two people only: the therapist and the client.
 * The server keeps that sealed copy and cannot read it. Row-level rules also stop a copy being
 * written unless the link is active and the switch is on.
 *
 * Every function takes the supabase client and the unlocked vault session, so it can be tested
 * without a browser.
 */
import { seal } from '../vault/vault-crypto.js';

export const CATEGORY = 'checkins';
const BATCH = 40;

/** What a therapist can receive for one check-in. place_id is the client's own id and is left out. */
export function sharedPayload(record, { includeNotes = false } = {}) {
  const r = record || {};
  return JSON.stringify({
    v: 1,
    id: r.id, created_at: r.created_at,
    arousal: r.arousal ?? null, valence: r.valence ?? null, sensory_load: r.sensory_load ?? null,
    emotion_words: r.emotion_words || [], location_tag: r.location_tag ?? null,
    selected_notes: r.selected_notes ?? null, chord_name: r.chord_name ?? null,
    notes: includeNotes ? (r.notes ?? null) : null,
    env: r.env || null,
  });
}

const contextFor = (linkId, sourceId) => `share:${linkId}:${CATEGORY}:${sourceId}`;

export async function sealCheckin(session, target, record, { includeNotes }) {
  const recipients = [
    { id: target.therapist_id, encPublicJwk: target.public_enc },
    { id: session.userId, encPublicJwk: session.publicKeys.enc },
  ];
  return seal(sharedPayload(record, { includeNotes }), recipients, { context: contextFor(target.link_id, record.id) });
}

/** The client's own switch for this link. Defaults to off. */
export async function getPreference(sb, linkId) {
  const { data, error } = await sb.from('sharing_preferences').select('enabled, include_notes')
    .eq('link_id', linkId).eq('category', CATEGORY).maybeSingle();
  if (error) throw new Error(error.message);
  return { enabled: !!data?.enabled, include_notes: !!data?.include_notes };
}

export async function setPreference(sb, uid, linkId, { enabled, include_notes }) {
  const { data: existing, error: e1 } = await sb.from('sharing_preferences').select('link_id')
    .eq('link_id', linkId).eq('category', CATEGORY).maybeSingle();
  if (e1) throw new Error(e1.message);
  const changed_at = new Date().toISOString();
  const { error } = existing
    ? await sb.from('sharing_preferences').update({ enabled, include_notes, changed_at }).eq('link_id', linkId).eq('category', CATEGORY)
    : await sb.from('sharing_preferences').insert({ link_id: linkId, client_id: uid, category: CATEGORY, enabled, include_notes });
  if (error) throw new Error(error.message);
}

/** Public keys of the client's active therapist, or null if there is none or they have no vault yet. */
export async function therapistTarget(sb) {
  const { data, error } = await sb.from('my_therapist_keys').select('*').limit(1);
  if (error) throw new Error(error.message);
  const k = data && data[0];
  return k ? { link_id: k.link_id, therapist_id: k.therapist_id, public_enc: k.public_enc, fingerprint: k.fingerprint } : null;
}

export async function sharedSourceIds(sb, linkId) {
  const { data, error } = await sb.from('shared_copies').select('source_id').eq('link_id', linkId).eq('category', CATEGORY);
  if (error) throw new Error(error.message);
  return new Set((data || []).map(r => r.source_id));
}

/**
 * Makes the shared copies match the client's check-ins: adds missing ones, and with `refresh`
 * re-seals existing ones (used when the notes option changes).
 * Returns { added, refreshed }.
 */
export async function syncCheckins({ sb, session, target, records, includeNotes, refresh = false }) {
  const have = await sharedSourceIds(sb, target.link_id);
  const uid = session.userId;
  let added = 0, refreshed = 0;

  const fresh = records.filter(r => r.id && !have.has(r.id));
  for (let i = 0; i < fresh.length; i += BATCH) {
    const rows = [];
    for (const r of fresh.slice(i, i + BATCH)) {
      rows.push({
        link_id: target.link_id, client_id: uid, therapist_id: target.therapist_id, category: CATEGORY,
        source_id: r.id, source_created_at: r.created_at, sealed: await sealCheckin(session, target, r, { includeNotes }),
      });
    }
    const { error } = await sb.from('shared_copies').insert(rows);
    if (error) throw new Error(error.message);
    added += rows.length;
  }
  if (refresh) {
    for (const r of records.filter(r => r.id && have.has(r.id))) {
      const sealed = await sealCheckin(session, target, r, { includeNotes });
      const { error } = await sb.from('shared_copies').update({ sealed, updated_at: new Date().toISOString() })
        .eq('link_id', target.link_id).eq('category', CATEGORY).eq('source_id', r.id);
      if (error) throw new Error(error.message);
      refreshed++;
    }
  }
  return { added, refreshed };
}

/** Removes every copy the therapist holds for this link (possible only while the link is active). */
export async function withdrawAll(sb, linkId) {
  const { error } = await sb.from('shared_copies').delete().eq('link_id', linkId).eq('category', CATEGORY);
  if (error) throw new Error(error.message);
}

/** Removes the copy of one check-in, e.g. when the client deletes it. Quiet if there is none. */
export async function withdrawOne(sb, sourceId) {
  const { error } = await sb.from('shared_copies').delete().eq('source_id', sourceId).eq('category', CATEGORY);
  if (error) console.warn('[sharing] could not withdraw copy:', error.message);
}

/** Called right after a check-in is saved. Best effort: a failure never blocks the save. */
export async function shareNew({ sb, session, record }) {
  try {
    const { data } = await sb.from('sharing_preferences').select('link_id, include_notes')
      .eq('category', CATEGORY).eq('enabled', true).limit(1);
    const pref = data && data[0];
    if (!pref) return false;
    const target = await therapistTarget(sb);
    if (!target || target.link_id !== pref.link_id) return false;
    await syncCheckins({ sb, session, target, records: [record], includeNotes: !!pref.include_notes });
    return true;
  } catch (e) { console.warn('[sharing] new check-in was not shared:', e.message); return false; }
}

/** Catch-up when the vault is open: shares anything missed while it was locked or offline. */
export async function reconcile({ sb, session, records }) {
  try {
    const { data } = await sb.from('sharing_preferences').select('link_id, include_notes')
      .eq('category', CATEGORY).eq('enabled', true).limit(1);
    const pref = data && data[0];
    if (!pref) return null;
    const target = await therapistTarget(sb);
    if (!target || target.link_id !== pref.link_id) return null;
    return await syncCheckins({ sb, session, target, records, includeNotes: !!pref.include_notes });
  } catch (e) { console.warn('[sharing] catch-up skipped:', e.message); return null; }
}
