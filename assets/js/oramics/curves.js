/**
 * /assets/js/oramics/curves.js
 * The drawing-to-sound mapping, as pure functions so the live instrument, the WAV export and the tests all use the same one.
 * A layer is scanned once into a curve (one number per pixel column: where the marks sit, 0 at the top to 1 at the bottom, or -1 for nothing).
 */
export const PITCH = { min: 80, max: 2000 }, CUTOFF = { min: 200, max: 8000 }, FALLBACK_AMP = 0.6, DEFAULT_CUTOFF = 2000;
export const VOICE_INTERVALS = [0, 1.5, 1.2, -1.2, 1.7, -1.5];   // Hz offsets of the extra voices (a chorus, not extra notes)

const clamp01 = v => Math.max(0, Math.min(1, v));
/** 0 at the top of the film, 1 at the bottom → a value on an exponential range (so equal distances are equal musical intervals). */
export const normToRange = (n, r) => r.min * Math.pow(r.max / r.min, 1 - clamp01(n));
export const rangeToNorm = (v, r) => 1 - clamp01(Math.log(v / r.min) / Math.log(r.max / r.min));

/** Where the marks sit in one pixel column of RGBA data (alpha-weighted centre). -1 when the column is empty. */
export function columnCentre(data, width, height, x) {
  let sum = 0, weight = 0;
  for (let row = 0; row < height; row++) {
    const a = data[(row * width + x) * 4 + 3];
    if (a > 8) { const w = a / 255; sum += row * w; weight += w; }
  }
  return weight ? (sum / weight) / height : -1;
}

/** Scans columns x0..x1 (inclusive) of an ImageData-like object into curve (a Float32Array of width entries). Returns curve. */
export function scanColumns(img, curve, x0 = 0, x1 = img.width - 1) {
  const a = Math.max(0, Math.floor(x0)), b = Math.min(img.width - 1, Math.ceil(x1));
  for (let x = a; x <= b; x++) curve[x] = columnCentre(img.data, img.width, img.height, x);
  return curve;
}
export const emptyCurve = width => new Float32Array(width).fill(-1);

/** Reads a curve at a (fractional) x, without interpolating across gaps. */
export function curveAt(curve, x) { if (!curve || !curve.length) return -1; return curve[Math.max(0, Math.min(curve.length - 1, Math.round(x)))]; }

/* ── pitch snapping (optional; free glide is the default) ── */
export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9], 'minor pentatonic': [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], 'whole tone': [0, 2, 4, 6, 8, 10],
};
export const midiOf = hz => 69 + 12 * Math.log2(hz / 440), hzOfMidi = m => 440 * Math.pow(2, (m - 69) / 12);
/** The scale's notes (MIDI) that fall inside the pitch range. */
export function scaleNotes(root, scale) {
  const set = SCALES[scale] || SCALES.major, lo = Math.floor(midiOf(PITCH.min)), hi = Math.ceil(midiOf(PITCH.max)), out = [];
  for (let m = lo; m <= hi; m++) if (set.includes((((m - root) % 12) + 12) % 12)) out.push(m);
  return out;
}
/** The nearest note of the scale to a frequency, in Hz. */
export function snapHz(hz, root = 0, scale = 'major') {
  const m = midiOf(hz); let best = null, d = Infinity;
  for (const n of scaleNotes(root, scale)) { const e = Math.abs(n - m); if (e < d) { d = e; best = n; } }
  return best === null ? hz : hzOfMidi(best);
}

/**
 * What the voices should do at one moment, from the four layers' values there (each 0..1 from the top, or -1 for none).
 * opts.snap = { on, root, scale } quantises the pitch; free glide (no snapping) when off or absent.
 */
export function voiceParams({ pitch, amp, timbre, mod }, opts = {}) {
  let hz = pitch >= 0 ? normToRange(pitch, PITCH) : 0;
  if (hz && opts.snap && opts.snap.on) hz = snapHz(hz, opts.snap.root, opts.snap.scale);
  const level = amp >= 0 ? 1 - amp : (pitch >= 0 ? FALLBACK_AMP : 0), m = mod >= 0 ? 1 - mod : 0;
  return {
    hz, amp: hz ? level : 0, cutoff: timbre >= 0 ? normToRange(timbre, CUTOFF) : DEFAULT_CUTOFF, mod: m,
    vibrato: m * 25, fmDepth: m * hz * 0.08, fmRate: 2 + m * 8,
  };
}
/** The frequency of voice i for a main frequency (an extra voice is a fixed number of Hz away). */
export const voiceHz = (hz, i, count) => Math.max(20, hz + (count > 1 ? (VOICE_INTERVALS[i] || 0) * 50 : 0));
