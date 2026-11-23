/**
 * /assets/js/ambience/music.js
 * The generated music, as plain functions with no audio in them. Everything runs on one grid: 16 steps to a bar, four bars to
 * a phrase, one chord a bar. Because every row reads the same grid, key and chord progression, any combination fits together,
 * and tempo and key can change for all of them at once. `events` says what one row plays on one step.
 */
import { FEELS, DEFAULT_FEEL } from './catalog.js';

export const STEPS = 16, PHRASE = 4, VARIATIONS = 3;
export const MODES = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
/** Chord roots as scale degrees (0 is the first note of the scale), one per bar. */
export const PROGRESSIONS = { minor: [0, 5, 2, 6], dorian: [0, 3, 0, 6], lydian: [0, 1, 0, 4] };

export const feelOf = id => FEELS.find(f => f.id === id) || FEELS.find(f => f.id === DEFAULT_FEEL);
export const midiHz = m => 440 * 2 ** ((m - 69) / 12);

/** MIDI note of a scale degree (any integer, negative or beyond the octave), with the scale's root in the octave from C3. */
export function degreeMidi(feel, degree) {
  const scale = MODES[feel.mode], oct = Math.floor(degree / 7), i = ((degree % 7) + 7) % 7;
  return 48 + feel.root + scale[i] + 12 * oct;
}
export const chordDegree = (feel, bar) => PROGRESSIONS[feel.mode][((bar % PHRASE) + PHRASE) % PHRASE];
/** The four notes (root, third, fifth, seventh) of the bar's chord, as MIDI numbers. */
export const chordMidi = (feel, bar) => { const d = chordDegree(feel, bar); return [0, 2, 4, 6].map(k => degreeMidi(feel, d + k)); };

/** A small seeded generator: the same seed gives the same numbers. */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mix = (...n) => { let h = 2166136261; for (const x of n) { h ^= x | 0; h = Math.imul(h, 16777619); } return h >>> 0; };
const strHash = s => { let h = 5381; for (const c of String(s)) h = Math.imul(h, 33) + c.charCodeAt(0) | 0; return h; };

/** How much swing a row plays with (0 to 1). */
export const swingOf = (row, option) => (row === 'drums' && option === 'lofi' ? 0.3 : 0);

const hit = (kind, vel, extra = {}) => ({ kind, vel, ...extra });

/**
 * What a row plays on a step. Returns [{ kind, vel, midi?, dur? }] where `dur` counts steps. Kinds: kick, snare, hat, ohat,
 * bass, rhodes, pad, pluck, bell. `c` is { step, bar, feel, seed }; the variation (0 to 2) changes the pattern a little.
 */
export function events(row, option, variation, c) {
  const { step, bar, feel, seed = 1 } = c, v = ((variation % VARIATIONS) + VARIATIONS) % VARIATIONS, pb = ((bar % PHRASE) + PHRASE) % PHRASE, out = [];
  const chord = chordMidi(feel, bar), root = chord[0];
  const at = (...s) => s.includes(step);
  if (row === 'drums') {
    if (option === 'lofi') {
      const kicks = [[0, 10], [0, 7, 10], [0, 3, 10]][v];
      if (at(...kicks)) out.push(hit('kick', step === 0 ? 0.8 : 0.55));
      if (pb === 3 && v === 2 && step === 14) out.push(hit('kick', 0.3));
      if (at(4, 12)) out.push(hit('snare', 0.55));
      if (step % 2 === 0) out.push(hit('hat', step % 4 === 0 ? 0.5 : 0.3));
      if (v === 1 && pb === 3 && step === 15) out.push(hit('ohat', 0.3));
    } else if (option === 'soft') {
      if (step === 0) out.push(hit('kick', 0.5));
      if (step === 12) out.push(hit('snare', 0.25));
      if (at(2, 6, 10, 14)) out.push(hit('hat', 0.22));
      if (v === 1 && step === 8) out.push(hit('kick', 0.3));
    } else if (option === 'heart') {
      const beats = v === 0 ? [0, 3] : [0, 3, 8, 11];
      if (at(...beats)) out.push(hit('kick', step === 0 || step === 8 ? 0.7 : 0.42));
    }
  } else if (row === 'bass') {
    const low = root - 24, fifth = chord[2] - 24;
    if (option === 'sub') {
      if (v === 0 && step === 0) out.push(hit('bass', 0.7, { midi: low, dur: 14 }));
      if (v === 1 && at(0, 8)) out.push(hit('bass', 0.65, { midi: low, dur: 7 }));
      if (v === 2) { if (step === 0) out.push(hit('bass', 0.7, { midi: low, dur: 9 })); if (step === 10) out.push(hit('bass', 0.55, { midi: fifth, dur: 5 })); }
    } else if (option === 'pulse') {
      if (at(0, 6)) out.push(hit('bass', 0.6, { midi: low, dur: 4 }));
      if (step === 10) out.push(hit('bass', 0.5, { midi: v === 1 ? chord[1] - 24 : fifth, dur: 4 }));
      if (v === 2 && step === 14) out.push(hit('bass', 0.35, { midi: low + 12, dur: 2 }));
    }
  } else if (row === 'chords') {
    if (option === 'warm') {
      if (v === 0 && step === 0) out.push(hit('rhodes', 0.5, { midi: chord, dur: 16 }));
      if (v === 1) { if (step === 0) out.push(hit('rhodes', 0.5, { midi: chord, dur: 10 })); if (step === 10) out.push(hit('rhodes', 0.3, { midi: chord.slice(2), dur: 6 })); }
      if (v === 2 && step % 4 === 0) out.push(hit('rhodes', 0.38, { midi: [chord[step / 4]], dur: 5 }));
    } else if (option === 'open') {
      const d = chordDegree(feel, bar), open = [degreeMidi(feel, d), degreeMidi(feel, d + 4), degreeMidi(feel, d + 8)];
      if (step === 0) out.push(hit('rhodes', 0.42, { midi: open, dur: v === 1 ? 8 : 16 }));
      if (v === 1 && step === 8) out.push(hit('rhodes', 0.3, { midi: open.slice(1), dur: 8 }));
      if (v === 2 && step === 6) out.push(hit('rhodes', 0.22, { midi: [open[2]], dur: 4 }));
    }
  } else if (row === 'pad') {
    if (step === 0) {
      if (option === 'air') out.push(hit('pad', 0.3, { midi: chord.map(m => m + 12), dur: 16 }));
      else out.push(hit('pad', 0.4, { midi: v === 0 ? [chord[0] - 12, chord[2] - 12] : [chord[0] - 12, chord[1] - 12, chord[2] - 12], dur: 16 }));
    }
  } else if (row === 'melody') {
    const r = rng(mix(seed, strHash(option), pb, v)), d = chordDegree(feel, bar);
    const pool = [d + 7, d + 9, d + 11, d + 8, d + 10, d + 6 + 7];
    const slots = option === 'bells' ? [0, 4, 8, 12] : [0, 2, 3, 4, 6, 8, 10, 12, 14];
    const want = option === 'bells' ? (r() < 0.7 ? 1 + (v > 0 && r() < 0.5 ? 1 : 0) : 0) : 2 + v + (r() < 0.3 ? 1 : 0);
    const chosen = []; const left = slots.slice();
    for (let k = 0; k < want && left.length; k++) chosen.push(left.splice(Math.floor(r() * left.length), 1)[0]);
    chosen.sort((a, b) => a - b);
    for (const s of chosen) { const deg = pool[Math.floor(r() * pool.length)], vel = 0.3 + r() * 0.2; if (s === step) out.push(hit(option === 'bells' ? 'bell' : 'pluck', vel, { midi: degreeMidi(feel, deg) + (option === 'bells' ? 12 : 0), dur: option === 'bells' ? 8 : 3 })); }
  }
  return out;
}

/** Every row and option, for tests and for building the page. */
export const ROWS = { drums: ['lofi', 'soft', 'heart'], bass: ['sub', 'pulse'], chords: ['warm', 'open'], melody: ['pluck', 'bells'], pad: ['air', 'deep'] };
