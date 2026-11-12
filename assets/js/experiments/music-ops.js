/**
 * /assets/js/experiments/music-ops.js
 * Pure music functions for the piano-roll, sampler and treatment experiments.
 * No audio, no page, no network: each one takes numbers and returns numbers.
 */
import { SCALES, shuffle, int } from './rng.js';

/** MIDI note numbers for a scale across `octaves`, lowest first. The root is a pitch class 0 to 11, starting in the octave of middle C. */
export function scaleNotes(root, scale = 'major', octaves = 2, base = 60) {
  const degrees = SCALES[scale] || SCALES.major, out = [];
  for (let o = 0; o < octaves; o++) for (const d of degrees) out.push(base + root + d + 12 * o);
  out.push(base + root + 12 * octaves);
  return out;
}

/** A one-note-per-step melody grid: melody[step] is a MIDI note or null. Setting the note that is already there clears it. */
export function setStep(melody, step, note) {
  const next = melody.slice();
  next[step] = next[step] === note ? null : note;
  return next;
}

const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7) > 0) b.unshift((n & 0x7f) | 0x80); return b; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = n => [(n >> 8) & 255, n & 255];

/**
 * A Standard MIDI File (type 0) holding a melody, one note per step, each step a sixteenth note,
 * and optionally chords (arrays of MIDI notes, one per `stepsPerChord` steps) on a second channel.
 */
export function encodeMidi({ melody, chords = [], stepsPerChord = 4, bpm = 90 }) {
  const PPQ = 480, step = PPQ / 4, ev = [];                        // events: [tick, order, bytes]
  melody.forEach((n, i) => { if (n != null) { ev.push([i * step, 1, [0x90, n, 96]]); ev.push([(i + 1) * step - 10, 0, [0x80, n, 0]]); } });
  chords.forEach((c, k) => c.forEach(n => { ev.push([k * stepsPerChord * step, 1, [0x91, n, 64]]); ev.push([(k + 1) * stepsPerChord * step - 10, 0, [0x81, n, 0]]); }));
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const mpqn = Math.round(60e6 / bpm), body = [0, 0xff, 0x51, 3, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255];
  let t = 0; for (const [tick, , bytes] of ev) { body.push(...vlq(tick - t), ...bytes); t = tick; }
  body.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ), 0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]);
}

/**
 * Lanes for a one-sample beat. Each lane plays a different slice of the one sample at a different speed,
 * so that a single sound becomes a kick, a snare, a hat and a bass.
 */
export const LANE_ROLES = ['Low', 'Snap', 'Tick', 'Long'];
const RATES = { Low: [0.5, 0.6, 0.7], Snap: [1, 1.25, 1.5], Tick: [2, 2.5, 3], Long: [0.35, 0.5, 0.75] };
const LEN = { Low: [0.12, 0.2], Snap: [0.08, 0.14], Tick: [0.03, 0.06], Long: [0.3, 0.6] };
export function makeLanes(rng, duration) {
  return LANE_ROLES.map(role => {
    const [lo, hi] = LEN[role], len = Math.min(duration, lo + rng() * (hi - lo));
    return { role, start: Math.max(0, rng() * Math.max(0, duration - len)), length: len, rate: RATES[role][int(rng, 0, 2)] };
  });
}

/** Treatments to hand out when instruments are swapped. Each track gets a different one when there are enough. */
export const EFFECTS = [
  ['Low-pass filter', r => `cutoff ${[400, 800, 1600, 3200][int(r, 0, 3)]} Hz`],
  ['Reverb', r => `decay ${[1.5, 3, 6, 10][int(r, 0, 3)]} seconds, 40% wet`],
  ['Delay', r => `${['1/8', 'dotted 1/8', '1/4', '1/16'][int(r, 0, 3)]} note, 3 repeats`],
  ['Distortion', r => `drive ${[20, 40, 60, 80][int(r, 0, 3)]}%`],
  ['Chorus', r => `depth ${[30, 50, 70][int(r, 0, 2)]}%, rate 0.${int(r, 3, 9)} Hz`],
  ['Tremolo', r => `${['1/4', '1/8', '1/16'][int(r, 0, 2)]} note, depth 60%`],
  ['Bit crusher', r => `${[4, 6, 8, 10][int(r, 0, 3)]} bits`],
  ['Pitch shift', r => `${[-12, -7, 5, 7, 12][int(r, 0, 4)]} semitones, 100% wet`],
  ['Ping-pong pan', r => `${['1/4', '1/8'][int(r, 0, 1)]} note, full width`],
  ['High-pass filter', r => `cutoff ${[200, 400, 800][int(r, 0, 2)]} Hz`],
];
export function treatments(rng, names) {
  const pool = shuffle(rng, EFFECTS.slice());
  return names.map((name, i) => { const [fx, setting] = pool[i % pool.length]; return { track: name, effect: fx, setting: setting(rng) }; });
}
