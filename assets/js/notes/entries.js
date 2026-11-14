/**
 * /assets/js/notes/entries.js
 * Puts the intake form and the family history into the same shape as session notes ({ id, date, text, source }),
 * so one record can be searched, linked and mapped. Family members become [[links]], so they join the map.
 * The text is only ever read by the therapist's own browser.
 */
const clean = s => String(s ?? '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
const day = iso => (iso ? String(iso).slice(0, 10) : '');

/** `fields` is the client's intake ({ key: text }); `defs` is INTAKE_FIELDS. Contact details and date of birth are left out of the map. */
export function intakeEntry(intake, defs, { skip = ['contact', 'emergency', 'dob', 'name', 'pronouns'] } = {}) {
  const f = intake?.fields || {}, lines = [];
  for (const d of defs || []) { if (skip.includes(d.key) || !f[d.key]) continue; lines.push(`${d.short || d.label}: ${clean(f[d.key])}`); }
  return lines.length ? { id: 'intake', date: day(intake.submitted_at), text: lines.join('\n'), source: 'intake' } : null;
}

/** `fam` is { doc: { overview, members: [...] }, sent_at }. Each person is written as [[Name]] so they appear as a node. */
export function familyEntry(fam) {
  const d = fam?.doc; if (!d) return null;
  const lines = []; if (d.overview) lines.push(`Overview: ${clean(d.overview)}`);
  for (const m of d.members || []) {
    const who = clean(m.name) || clean(m.relationship) || 'Family member';
    const head = [`[[${who}]]`, m.relationship && clean(m.name) ? `(${clean(m.relationship)})` : '', m.status ? m.status.toLowerCase() : '', m.born ? `born ${clean(m.born)}` : ''].filter(Boolean).join(', ');
    lines.push([head + '.', clean(m.description), clean(m.history), m.impact ? 'Impact: ' + clean(m.impact) : ''].filter(Boolean).join(' '));
  }
  return lines.length ? { id: 'family', date: day(fam.sent_at), text: lines.join('\n'), source: 'family' } : null;
}

/** People named in the family history, for the "insert link" chips (name, and what they are to the client). */
export function familyPeople(fam) {
  return (fam?.doc?.members || []).map(m => ({ name: clean(m.name) || clean(m.relationship), relationship: clean(m.relationship) })).filter(p => p.name);
}
