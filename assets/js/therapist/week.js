/**
 * /assets/js/therapist/week.js
 * One short page for a therapist: what a client chose to share in the last seven days. Pure: it takes the items already opened
 * on the therapist's device and returns numbers, titles and a plain-text version. Nothing is stored or sent.
 */
import { summarize } from './clients.js';
import { worksheetLabel } from './doc-render.js';

const DAY = 86400000;
/** The moment an item counts from: when it was shared, else when it was last changed, else when it was made. */
const stamp = i => Date.parse(i.shared_at || i.updated_at || i.created_at || '') || 0;

/** @param {object[]} items opened copies (category checkins | worksheets | journal)   @param {number} now ms */
export function weekSummary(items, now = Date.now(), days = 7) {
  const from = now - days * DAY, inWeek = items.filter(i => { const t = stamp(i); return t >= from && t <= now + DAY; });
  const checkins = inWeek.filter(i => i.category === 'checkins'), docs = inWeek.filter(i => i.category === 'worksheets'), journal = inWeek.filter(i => i.category === 'journal');
  const prev = items.filter(i => i.category === 'checkins' && stamp(i) >= from - days * DAY && stamp(i) < from);
  const s = summarize(checkins), p = summarize(prev);
  const delta = k => (s[k] != null && p[k] != null) ? Math.round((s[k] - p[k]) * 10) / 10 : null;
  return {
    from: new Date(from).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10),
    checkins: { count: s.count, arousal: s.arousal, valence: s.valence, sensory_load: s.sensory_load, top_emotions: s.top_emotions, with_notes: s.with_notes, vsLastWeek: { arousal: delta('arousal'), valence: delta('valence'), sensory_load: delta('sensory_load'), hadLastWeek: p.count > 0 } },
    worksheets: docs.map(d => ({ label: worksheetLabel(d.type), at: d.updated_at || d.created_at || d.shared_at || null })).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    journal: journal.map(j => ({ title: j.title || 'Untitled entry', shared_at: j.shared_at || j.created_at || null })),
    empty: !inWeek.length,
  };
}

const sign = n => n == null ? '' : (n > 0 ? ' (+' + n + ')' : n < 0 ? ' (' + n + ')' : ' (same)');
/** The page as plain text, for pasting into the therapist's own notes. */
export function weekText(name, w) {
  const out = [`${name}: shared ${w.from} to ${w.to}`, ''];
  if (w.empty) return out.concat('Nothing shared in this time.').join('\n');
  const c = w.checkins;
  out.push(c.count ? `Check-ins: ${c.count}. Energy ${c.arousal ?? '–'}${sign(c.vsLastWeek.arousal)}, mood ${c.valence ?? '–'}${sign(c.vsLastWeek.valence)}, sensory load ${c.sensory_load ?? '–'}${sign(c.vsLastWeek.sensory_load)} (out of 10).${c.top_emotions.length ? ' Most used: ' + c.top_emotions.map(t => `${t.word} (${t.n})`).join(', ') + '.' : ''}` : 'Check-ins: none.');
  out.push(w.worksheets.length ? 'Worksheets: ' + w.worksheets.map(x => x.label).join(', ') + '.' : 'Worksheets: none.');
  out.push(w.journal.length ? `Journal entries: ${w.journal.length} (${w.journal.map(j => j.title).join('; ')}).` : 'Journal entries: none.');
  return out.join('\n');
}
