/**
 * /assets/js/oramics/music.js
 * Pitch maths shared by the page, the sound engine and the tests: exponential height-to-frequency, scales, and snapping to a scale.
 */
export const SCALES = {
  'major pentatonic': [0, 2, 4, 7, 9], 'minor pentatonic': [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], 'whole tone': [0, 2, 4, 6, 8, 10], blues: [0, 3, 5, 6, 7, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const midiOf = hz => 69 + 12 * Math.log2(hz / 440), hzOfMidi = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = v => Math.max(0, Math.min(1, v));

/** Height on the canvas (0 top … 1 bottom) → a frequency in range {lo, hi}. Equal distances are equal musical intervals. */
export const hzAt = (n, r) => r.lo * Math.pow(r.hi / r.lo, 1 - clamp01(n));
export const heightOf = (hz, r) => 1 - clamp01(Math.log(hz / r.lo) / Math.log(r.hi / r.lo));

/** The scale's notes (MIDI numbers) between lo and hi Hz. */
export function scaleNotes(root, scale, lo, hi) {
  const set = SCALES[scale] || SCALES['major pentatonic'], a = Math.floor(midiOf(lo)), b = Math.ceil(midiOf(hi)), out = [];
  for (let m = a; m <= b; m++) if (set.includes((((m - root) % 12) + 12) % 12)) out.push(m);
  return out;
}
/** The nearest note of the scale to a frequency, in Hz. */
export function snapHz(hz, root = 0, scale = 'major pentatonic') {
  const m = midiOf(hz); let best = null, d = Infinity;
  for (let n = Math.floor(m) - 12; n <= Math.ceil(m) + 12; n++) {
    if (!(SCALES[scale] || SCALES['major pentatonic']).includes((((n - root) % 12) + 12) % 12)) continue;
    const e = Math.abs(n - m); if (e < d) { d = e; best = n; }
  }
  return best === null ? hz : hzOfMidi(best);
}
