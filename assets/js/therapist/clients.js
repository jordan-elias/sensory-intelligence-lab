/**
 * /assets/js/therapist/clients.js
 * What a therapist sees of a client: plain labels, opening the check-ins the client shared,
 * and a short summary. Pure functions plus one loader that takes the vault session.
 */
export const TIER_LABEL = { call1: 'Lab + 1 session a month', call2: 'Lab + 2 sessions a month' };
export const INTAKE_LABEL = { not_started: 'Intake not started', in_progress: 'Intake in progress', completed: 'Intake complete', complete: 'Intake complete' };

export const tierLabel = t => TIER_LABEL[t] || 'Session plan';
export const intakeLabel = s => INTAKE_LABEL[s] || (s ? String(s).replace(/_/g, ' ') : 'Intake status not available');

const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
const nums = (items, k) => items.map(i => i[k]).filter(Number.isFinite);

/** Counts, averages and the most used feeling words over the check-ins a client shared. */
export function summarize(items) {
  const words = new Map();
  for (const i of items) for (const w of (i.emotion_words || [])) words.set(w, (words.get(w) || 0) + 1);
  const top = [...words.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([word, n]) => ({ word, n }));
  const dates = items.map(i => i.created_at).filter(Boolean).sort();
  return {
    count: items.length,
    arousal: avg(nums(items, 'arousal')), valence: avg(nums(items, 'valence')), sensory_load: avg(nums(items, 'sensory_load')),
    top_emotions: top, first: dates[0] || null, last: dates[dates.length - 1] || null,
    with_notes: items.filter(i => i.notes).length,
  };
}

/**
 * Opens the copies a client shared with this therapist. Returns { items, unreadable }.
 * A copy that cannot be opened (for example sealed to an old key) is counted, never guessed at.
 */
export async function openCopies(session, copies) {
  const items = []; let unreadable = 0;
  for (const c of copies) {
    try {
      const text = await session.open(c.sealed, { context: `share:${c.link_id}:${c.category}:${c.source_id}` });
      const p = JSON.parse(text);
      items.push({ ...p, id: c.source_id, category: c.category, created_at: p.created_at || c.source_created_at });
    } catch { unreadable++; }
  }
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { items, unreadable };
}
