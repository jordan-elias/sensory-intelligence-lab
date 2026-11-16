/**
 * /assets/js/experiments/notebook.js
 * Turns what a person recorded in the course into a plain-text notebook they can keep or print.
 * Pure: it takes the saved values and returns text. Nothing is sent anywhere.
 */
const VERDICTS = { yes: 'Supported', partly: 'Partly supported', no: 'Not supported', unclear: 'Could not tell' };

/** `saved(id)` returns { pred, trials, concl } for an experiment. Only experiments with something recorded or marked done are included. */
export function buildNotebook({ course, units, done, saved }) {
  const out = [`# ${course}: my notebook`, ''];
  let n = 0;
  for (const u of units) {
    const parts = [];
    for (const e of u.experiments) {
      const s = saved(e.id) || {}, trials = (s.trials || {}), rows = e.trials.map((t, i) => trials[i] && (trials[i].text || trials[i].score) ? `- ${t}: ${trials[i].text || ''}${trials[i].score ? ` (surprise ${trials[i].score}/5)` : ''}` : null).filter(Boolean);
      const c = s.concl || {}, has = (s.pred && s.pred.trim()) || rows.length || c.verdict || (c.text && c.text.trim());
      if (!has && !done.has(e.id)) continue;
      n++;
      const lines = [`### ${e.title}${done.has(e.id) ? ' (done)' : ''}`];
      if (s.pred && s.pred.trim()) lines.push(`Prediction: ${s.pred.trim()}`);
      if (rows.length) lines.push('Record:', ...rows);
      if (c.verdict || (c.text && c.text.trim())) lines.push(`Conclusion: ${[VERDICTS[c.verdict], c.text && c.text.trim()].filter(Boolean).join('. ')}`);
      parts.push(lines.join('\n'));
    }
    if (parts.length) out.push(`## Unit ${u.number}: ${u.title}`, '', parts.join('\n\n'), '');
  }
  if (!n) out.push('Nothing recorded yet. Your predictions, records and conclusions will appear here.');
  return out.join('\n').trimEnd() + '\n';
}
