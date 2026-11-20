/**
 * /assets/js/experiments/strings-core.js
 * Pure rules for the plucked-string tool: tunings, chord shapes, a plucked-string sound (Karplus-Strong), and the text that gets saved.
 * No audio or page code here, so it can be tested on its own.
 */
export const STANDARD = [40, 45, 50, 55, 59, 64];                  // E2 A2 D3 G3 B3 E4, string 6 (lowest) first
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = m => SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

export const clampDetune = n => Math.max(-12, Math.min(12, Math.round(Number(n)) || 0));
/** The note a string makes at a fret ('x' or null is muted). */
export function soundingNote(open, detune, fret) {
  if (fret === null || fret === undefined || fret === 'x' || fret === '') return null;
  const f = Math.max(0, Math.min(15, Math.round(Number(fret))));
  return Number.isFinite(f) ? open + clampDetune(detune) + f : null;
}
/** Notes of a whole shape, lowest string first (muted strings are null). */
export const shapeNotes = (shape, detunes = [], open = STANDARD) => open.map((o, i) => soundingNote(o, detunes[i] || 0, shape[i]));

export const emptyShape = () => Array(6).fill(null);

/** Karplus-Strong: noise burst through a decaying delay line. `rand` makes it repeatable in tests. */
export function pluck(sr, hz, secs = 1.6, rand = Math.random, damp = 0.996) {
  const n = Math.max(2, Math.round(sr / hz)), out = new Float32Array(Math.round(sr * secs)), line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = rand() * 2 - 1;
  let p = 0;
  for (let i = 0; i < out.length; i++) { const a = line[p], b = line[(p + 1) % n]; out[i] = a; line[p] = damp * 0.5 * (a + b); p = (p + 1) % n; }
  return out;
}

const dt = d => (d === 0 ? 'standard' : (d > 0 ? '+' : '') + d);
/** Plain text for the Keep shelf and the download. */
export function stringsText(detunes, shapes, open = STANDARD) {
  const lines = ['Tuning (string 6 to 1): ' + open.map((o, i) => `${noteName(o + clampDetune(detunes[i] || 0))} (${dt(clampDetune(detunes[i] || 0))})`).join(', ')];
  shapes.forEach((s, k) => {
    if (!s.some(f => f !== null && f !== 'x')) return;
    const notes = shapeNotes(s, detunes, open);
    lines.push(`Shape ${k + 1}: frets ${s.map(f => (f === null || f === 'x' ? 'x' : f)).join(' ')} sounds ${notes.filter(x => x !== null).map(noteName).join(' ')}`);
  });
  return lines.length > 1 ? lines.join('\n') : '';
}
