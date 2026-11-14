/**
 * /assets/js/experiments/notebook.js
 * Turns the notes a person wrote in the course into a plain-text notebook they can keep or print.
 * Pure: it takes the saved values and returns text. Nothing is sent anywhere.
 */

/** `saved(id)` returns the note text for an experiment. Only experiments with a note, or marked done, are included. */
export function buildNotebook({ course, units, done, saved }) {
  const out = [`# ${course}: my notebook`, ''];
  let n = 0;
  for (const u of units) {
    const parts = [];
    for (const e of u.experiments) {
      const note = String(saved(e.id) || '').trim();
      if (!note && !done.has(e.id)) continue;
      n++;
      parts.push([`### ${e.title}${done.has(e.id) ? ' (done)' : ''}`, note || '(no note)'].join('\n'));
    }
    if (parts.length) out.push(`## Unit ${u.number}: ${u.title}`, '', parts.join('\n\n'), '');
  }
  if (!n) out.push('Nothing here yet. The notes you write at the end of an experiment will appear here.');
  return out.join('\n').trimEnd() + '\n';
}
