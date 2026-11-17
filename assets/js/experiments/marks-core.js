/** Pure helpers for the marks and subtract tools. */
export const fmtClock = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Sections from marks (sorted start times). The last section ends at `end`, or 10 seconds after its start when the piece has no end yet. */
export function sectionsFrom(marks, end = null) {
  const m = marks.slice().sort((a, b) => a.t - b.t);
  return m.map((x, i) => ({ start: x.t, end: i + 1 < m.length ? m[i + 1].t : (end != null && end > x.t ? end : x.t + 10), label: x.label || '' }));
}
export const textFromSections = S => S.map((s, i) => `${fmtClock(s.start)}  ${s.label || 'Section ' + (i + 1)}  (${Math.round(s.end - s.start)} s)`).join('\n') + (S.length ? `\nTotal ${fmtClock(S[S.length - 1].end)}` : '');
/** Half of n, rounded up: the number of parts to remove. */
export const halfOf = n => Math.ceil(n / 2);
