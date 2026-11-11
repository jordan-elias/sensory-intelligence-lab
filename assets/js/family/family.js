/**
 * /assets/js/family/family.js
 * An optional family history: a private quick reference for names, relationships and the significant
 * points of someone's story, for when therapy turns to family or childhood.
 *
 * Private by default. It is encrypted in the browser with the person's own key before it is saved; the
 * server keeps only the owner and the time. A person can choose to send a snapshot to their connected
 * therapist, sealed to that therapist and themselves only, and can take it back at any time.
 */
import { seal } from '../vault/vault-crypto.js';

export const FAMILY_CATEGORY = 'family';
export const RELATIONSHIPS = ['Mother', 'Father', 'Other parent', 'Stepparent', 'Sibling', 'Half-sibling', 'Grandparent', 'Aunt or uncle', 'Cousin',
  'Partner', 'Former partner', 'Child', 'Caregiver', 'Friend', 'Other'];
export const STATUSES = ['Living', 'Deceased', 'Not in contact', 'Unknown'];
export const LIMITS = { members: 60, overview: 4000, name: 80, born: 40, description: 1500, history: 3000, impact: 1500 };
export const familyCtx = linkId => `share:${linkId}:${FAMILY_CATEGORY}:${linkId}`;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export function blankMember() {
  return { id: newId(), name: '', relationship: '', status: '', born: '', description: '', history: '', impact: '' };
}

/** Keeps only known fields, trimmed and limited. A person with no name and nothing else is dropped. */
export function cleanMember(m = {}) {
  const out = {
    id: str(m.id, 64) || newId(),
    name: str(m.name, LIMITS.name),
    relationship: RELATIONSHIPS.includes(m.relationship) ? m.relationship : str(m.relationship, 40),
    status: STATUSES.includes(m.status) ? m.status : '',
    born: str(m.born, LIMITS.born),
    description: str(m.description, LIMITS.description),
    history: str(m.history, LIMITS.history),
    impact: str(m.impact, LIMITS.impact),
  };
  return out.name || out.description || out.history || out.impact ? out : null;
}

export function cleanFamily(doc = {}) {
  const members = (Array.isArray(doc.members) ? doc.members : []).map(cleanMember).filter(Boolean).slice(0, LIMITS.members);
  return { v: 1, overview: str(doc.overview, LIMITS.overview), members };
}
export const isEmpty = doc => !doc.overview && !doc.members.length;

// ── private copy (own key only) ─────────────────────────────────────
export async function loadFamily({ sb, session, uid }) {
  const { data, error } = await sb.from('family_history').select('payload, updated_at').eq('user_id', uid).limit(1);
  if (error) throw new Error(error.message);
  if (!data || !data.length) return { doc: cleanFamily({}), updated_at: null };
  return { doc: cleanFamily(JSON.parse(await session.decrypt(data[0].payload))), updated_at: data[0].updated_at };
}

export async function saveFamily({ sb, session, uid, doc }) {
  const clean = cleanFamily(doc);
  const payload = await session.encrypt(JSON.stringify(clean));
  const { error } = await sb.from('family_history').upsert({ user_id: uid, payload, key_version: 2, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return clean;
}

// ── optional snapshot for the therapist ─────────────────────────────
export async function sealFamily(session, target, doc) {
  return seal(JSON.stringify({ v: 1, doc: cleanFamily(doc), sent_at: new Date().toISOString() }),
    [{ id: target.therapist_id, encPublicJwk: target.public_enc }, { id: session.userId, encPublicJwk: session.publicKeys.enc }],
    { context: familyCtx(target.link_id) });
}

export async function sharedFamilyInfo(sb, linkId) {
  const { data, error } = await sb.from('shared_copies').select('updated_at, source_created_at').eq('category', FAMILY_CATEGORY).eq('link_id', linkId).limit(1);
  if (error) throw new Error(error.message);
  return data && data.length ? { sent_at: data[0].updated_at || data[0].source_created_at } : null;
}

export async function sendFamily({ sb, session, target, doc }) {
  const clean = cleanFamily(doc);
  if (isEmpty(clean)) throw new Error('Add something first.');
  const sealed = await sealFamily(session, target, clean), now = new Date().toISOString();
  const existing = await sharedFamilyInfo(sb, target.link_id);
  const { error } = existing
    ? await sb.from('shared_copies').update({ sealed, updated_at: now }).eq('category', FAMILY_CATEGORY).eq('link_id', target.link_id)
    : await sb.from('shared_copies').insert({ link_id: target.link_id, client_id: session.userId, therapist_id: target.therapist_id,
        category: FAMILY_CATEGORY, source_id: target.link_id, source_created_at: now, sealed });
  if (error) throw new Error(error.message);
}

export async function withdrawFamily(sb, linkId) {
  const { error } = await sb.from('shared_copies').delete().eq('category', FAMILY_CATEGORY).eq('link_id', linkId);
  if (error) throw new Error(error.message);
}

export async function openFamily(session, copy) {
  const p = JSON.parse(await session.open(copy.sealed, { context: familyCtx(copy.link_id) }));
  return { doc: cleanFamily(p.doc), sent_at: p.sent_at || null };
}

/** Read-only view as safe DOM (client text goes in as text, never as HTML). */
export function renderFamily(d, { doc }) {
  const root = d.createElement('div'); root.className = 'th-family';
  const add = (tag, text, cls) => { const n = d.createElement(tag); if (cls) n.className = cls; n.textContent = text; return n; };
  if (doc.overview) { root.append(add('h3', 'Childhood and family overview', 'th-h2'), Object.assign(add('p', doc.overview), { style: 'white-space:pre-wrap' })); }
  for (const m of doc.members) {
    const card = d.createElement('div'); card.className = 'th-family-card';
    card.append(add('h3', [m.name || 'Unnamed', m.relationship].filter(Boolean).join(' · '), 'th-h2'));
    const meta = [m.status, m.born && `born ${m.born}`].filter(Boolean).join(' · '); if (meta) card.append(add('p', meta, 'th-muted'));
    for (const [k, label] of [['description', 'Who they are'], ['history', 'History'], ['impact', 'Why they matter in my story']]) {
      if (m[k]) { card.append(add('strong', label)); card.append(Object.assign(add('p', m[k]), { style: 'white-space:pre-wrap' })); }
    }
    root.append(card);
  }
  return root;
}
