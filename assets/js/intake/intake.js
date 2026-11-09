/**
 * /assets/js/intake/intake.js
 * The short intake form a therapist can ask a client to fill in.
 * It is sealed in the client's browser for the client and that therapist only. The platform keeps only the
 * fact that it exists (so the therapist's list can say "received"), never the contents.
 */
import { seal } from '../vault/vault-crypto.js';

export const INTAKE_CATEGORY = 'intake';
export const INTAKE_FIELDS = [
  { key: 'name', label: 'Name you would like to be called', hint: 'Any name you use. It does not need to be your legal or birth name.', type: 'text', max: 120 },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'pronouns', label: 'Pronouns', hint: 'For example she/her, he/him, they/them, or your own.', type: 'text', max: 60 },
  { key: 'contact', label: 'Contact information', hint: 'Phone number, and anything else you want your therapist to have.', type: 'textarea', max: 500 },
  { key: 'medications', label: 'Any medications', hint: 'What you take now, if anything.', type: 'textarea', max: 1500 },
  { key: 'history', label: 'Mental health history', hint: 'Anything you want your therapist to know. Share as much or as little as you like.', type: 'textarea', max: 5000 },
];
export const INTAKE_ctx = (linkId) => `share:${linkId}:${INTAKE_CATEGORY}:${linkId}`;

/** Keeps only known fields, trimmed and length-limited. Returns null when nothing was filled in. */
export function cleanIntake(input = {}) {
  const out = {};
  for (const f of INTAKE_FIELDS) {
    const v = String(input[f.key] ?? '').trim().slice(0, f.max || 40);
    if (v) out[f.key] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function intakePayload(fields) {
  return JSON.stringify({ v: 1, fields, submitted_at: new Date().toISOString() });
}

export async function sealIntake(session, target, fields) {
  return seal(intakePayload(fields),
    [{ id: target.therapist_id, encPublicJwk: target.public_enc }, { id: session.userId, encPublicJwk: session.publicKeys.enc }],
    { context: INTAKE_ctx(target.link_id) });
}

/** Sends (or re-sends) the form. */
export async function submitIntake({ sb, session, target, fields }) {
  const clean = cleanIntake(fields);
  if (!clean) throw new Error('Fill in at least one field first.');
  const sealed = await sealIntake(session, target, clean);
  const { data: existing, error: e1 } = await sb.from('shared_copies').select('id').eq('category', INTAKE_CATEGORY).eq('link_id', target.link_id).limit(1);
  if (e1) throw new Error(e1.message);
  const now = new Date().toISOString();
  const { error } = existing && existing.length
    ? await sb.from('shared_copies').update({ sealed, updated_at: now }).eq('category', INTAKE_CATEGORY).eq('link_id', target.link_id)
    : await sb.from('shared_copies').insert({ link_id: target.link_id, client_id: session.userId, therapist_id: target.therapist_id,
        category: INTAKE_CATEGORY, source_id: target.link_id, source_created_at: now, sealed });
  if (error) throw new Error(error.message);
}

/** Opens a sent form (for the client's own edit, or the therapist's view). Returns { fields, submitted_at } or null. */
export async function openIntake(session, copy) {
  const text = await session.open(copy.sealed, { context: INTAKE_ctx(copy.link_id) });
  const p = JSON.parse(text);
  return { fields: p.fields || {}, submitted_at: p.submitted_at || null };
}

/** The therapist's read-only view, as safe DOM (no innerHTML with client text). */
export function renderIntake(doc, intake) {
  const dl = doc.createElement('dl'); dl.className = 'th-intake';
  for (const f of INTAKE_FIELDS) {
    const v = intake.fields[f.key]; if (!v) continue;
    const dt = doc.createElement('dt'); dt.textContent = f.key === 'name' ? 'Name' : f.label.replace(/^Any /, '');
    const dd = doc.createElement('dd'); dd.textContent = v; dd.style.whiteSpace = 'pre-wrap';
    dl.append(dt, dd);
  }
  return dl;
}
