/**
 * /assets/js/intake/intake.js
 * The short intake form a therapist can ask a client to fill in.
 * It is sealed in the client's browser for the client and that therapist only. The platform keeps only the
 * fact that it exists (so the therapist's list can say "received"), never the contents.
 */
import { seal } from '../vault/vault-crypto.js';

export const INTAKE_CATEGORY = 'intake';
export const INTAKE_FIELDS = [
  { key: 'name', label: 'The name you would like to be called', short: 'Name', hint: 'Use only the name you want your therapist to use. Your legal name, birth name or any former name is not required.', type: 'text', max: 120 },
  { key: 'pronouns', label: 'Pronouns', hint: 'For example she/her, he/him, they/them, or your own.', type: 'text', max: 60 },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'contact', label: 'Contact information', hint: 'A phone number, and anything else you want your therapist to have.', type: 'textarea', max: 500 },
  { key: 'emergency', label: 'Emergency contact', short: 'Emergency contact', hint: 'Optional. Someone to contact if you were in danger: their name, relationship and phone number.', type: 'textarea', max: 500 },
  { key: 'reason', label: 'What brings you to therapy', short: 'Reason for therapy', hint: 'In your own words, as much or as little as you like.', type: 'textarea', max: 3000 },
  { key: 'medications', label: 'Medications', short: 'Medications', hint: 'What you take now, if anything.', type: 'textarea', max: 1500 },
  { key: 'medical', label: 'Physical health', short: 'Physical health', hint: 'Anything about your body or health your therapist should know.', type: 'textarea', max: 2000 },
  { key: 'history', label: 'Mental health history', short: 'Mental health history', hint: 'Anything you want your therapist to know. Share as much or as little as you like.', type: 'textarea', max: 5000 },
  { key: 'therapy_before', label: 'Therapy you have had before', short: 'Previous therapy', hint: 'What helped, and what did not.', type: 'textarea', max: 3000 },
  { key: 'sound', label: 'Music and sound', short: 'Music and sound', hint: 'Music or sounds that calm you, and anything that overwhelms you.', type: 'textarea', max: 2000 },
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
    const dt = doc.createElement('dt'); dt.textContent = f.short || f.label;
    const dd = doc.createElement('dd'); dd.textContent = v; dd.style.whiteSpace = 'pre-wrap';
    dl.append(dt, dd);
  }
  return dl;
}
