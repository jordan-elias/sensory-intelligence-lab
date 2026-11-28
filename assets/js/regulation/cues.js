/**
 * /assets/js/regulation/cues.js
 * The measurable musical cues of each state, in one table, and the rules for moving between two states.
 * Pure and seeded (no Web Audio), so the same numbers drive the drone, the voice and the pulse, and so they can be tested.
 *
 * The cues are the ones music-emotion research measures: tempo, how regular or loose the timing is, syncopation, rests, loudness,
 * attack, register, brightness, roughness (beating between near-identical pitches), tremolo, distortion, mode and echo.
 * The numbers are starting hypotheses to be tuned by ear, not findings. Nothing here claims an effect on the body.
 *
 * Moving between two states changes one group of cues at a time (WINDOWS), in the order a listener can follow:
 * the pulse first, then loudness and attack, then texture and register, and the pitch set last, through shared notes.
 */
const c01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
export const lerp = (a, b, t) => a + (b - a) * c01(t);
export const smooth = t => { t = c01(t); return t * t * (3 - 2 * t); };
/** 0 before a, 1 after b, a smooth step between. */
export const win = (p, a, b) => smooth((p - a) / (b - a));

/** When each group of cues moves, as [start, end] of the journey (0-1). Before the first start, nothing moves: the music meets you where you are. */
export const WINDOWS = { tempo: [0.04, 0.6], dyn: [0.12, 0.7], tex: [0.25, 0.8], space: [0.2, 0.85], harm: [0.5, 0.92] };
export const windows = p => { const o = {}; for (const k in WINDOWS) o[k] = win(p, WINDOWS[k][0], WINDOWS[k][1]); return o; };

/** Tonic (Hz) of each state's drone. */
export const TONIC = { overwhelmed: 82.4, anxious: 110, tired: 82.4, angry: 73.4, overstim: 65.4, calm: 82.4, alert: 110, grounded: 55, energized: 110 };

/**
 * Pulse and feel. lvl: overall level, set from measured renders so that calm, tired and grounded are clearly softer than angry or anxious (about 0.25 against 1.0). bpm: the pulse; jit: how far notes wander from it (fraction of a beat); sync: chance a note lands off the beat;
 * rest: chance a whole bar is silent; rough: 0-1 beating between near-identical drone pitches; trem: depth 0-1 and tremHz of tremolo on the voice;
 * drive: 0-1 distortion on the voice; pulse: level of the pulse layer; accent: how much the off-beat notes are pushed.
 */
export const CUES = {
  overwhelmed: { lvl: 0.86, bpm: 118, jit: 0.32, sync: 0.5, rest: 0.08, rough: 0.75, trem: 0.25, tremHz: 5.5, drive: 0.45, pulse: 0.8, accent: 0.2 },
  anxious: { lvl: 0.67, bpm: 104, jit: 0.24, sync: 0.45, rest: 0.22, rough: 0.55, trem: 0.45, tremHz: 6.5, drive: 0.1, pulse: 0.7, accent: 0.35 },
  tired: { lvl: 0.24, bpm: 54, jit: 0.2, sync: 0.15, rest: 0.2, rough: 0.1, trem: 0, tremHz: 0.3, drive: 0, pulse: 0.35, accent: 0 },
  angry: { lvl: 1.0, bpm: 132, jit: 0.08, sync: 0.55, rest: 0, rough: 0.9, trem: 0, tremHz: 0.3, drive: 0.9, pulse: 1.3, accent: 0.6 },
  overstim: { lvl: 0.96, bpm: 126, jit: 0.3, sync: 0.5, rest: 0, rough: 0.7, trem: 0.15, tremHz: 7.5, drive: 0.35, pulse: 0.9, accent: 0.2 },
  calm: { lvl: 0.22, bpm: 52, jit: 0.18, sync: 0.2, rest: 0.1, rough: 0.08, trem: 0, tremHz: 0.2, drive: 0, pulse: 0.3, accent: 0 },
  alert: { lvl: 0.69, bpm: 88, jit: 0.1, sync: 0.25, rest: 0, rough: 0.25, trem: 0, tremHz: 0.3, drive: 0.05, pulse: 0.8, accent: 0.15 },
  grounded: { lvl: 0.22, bpm: 46, jit: 0.15, sync: 0.05, rest: 0.25, rough: 0.03, trem: 0, tremHz: 0.2, drive: 0, pulse: 0.4, accent: 0 },
  energized: { lvl: 0.83, bpm: 118, jit: 0.08, sync: 0.4, rest: 0, rough: 0.3, trem: 0, tremHz: 0.3, drive: 0.3, pulse: 1.0, accent: 0.3 },
};
export const STATES = Object.keys(CUES);

/** Scale of each state as semitones above its tonic. */
export const SCALE = {
  overwhelmed: [0, 1, 3, 6, 7, 10],
  anxious: [0, 1, 3, 5, 6, 8, 10],
  tired: [0, 3, 5, 7, 10],
  angry: [0, 1, 3, 5, 7, 8, 10],           // phrygian: dark, with a hard step above the tonic
  overstim: [0, 2, 4, 6, 8, 10],
  calm: [0, 2, 4, 7, 9],
  alert: [0, 2, 4, 6, 7, 9, 11],
  grounded: [0, 7, 12],
  energized: [0, 2, 4, 7, 9, 10],
};

/** The cues at a point in the journey (progress 0-1). */
export function cuesAt(cur, tgt, p) {
  const w = windows(p), a = CUES[cur], b = CUES[tgt], o = { w };
  o.bpm = lerp(a.bpm, b.bpm, w.tempo);
  for (const k of ['jit', 'sync', 'rest', 'accent', 'pulse']) o[k] = lerp(a[k], b[k], k === 'pulse' ? w.dyn : w.tex);
  for (const k of ['rough', 'trem', 'tremHz', 'drive']) o[k] = lerp(a[k], b[k], w.tex);
  o.drive = lerp(a.drive, b.drive, w.dyn);
  o.lvl = lerp(a.lvl, b.lvl, w.dyn);
  return o;
}

/** The tonic at a point in the journey. It only moves in the harmony window, and then as one slow glide the voice follows, so notes never leave the drone's key. */
export const tonicAt = (cur, tgt, p) => lerp(TONIC[cur], TONIC[tgt], win(p, WINDOWS.harm[0], WINDOWS.harm[1]));

/** Strength (0-1.5) of each of the 12 pitch classes in a state: the tonic and fifth lead. */
export function pitchWeights(state) {
  const w = new Array(12).fill(0);
  for (const s of SCALE[state]) { const pc = s % 12; w[pc] = pc === 0 ? 1.5 : pc === 7 ? 1.2 : 1; }
  return w;
}
/** The pitch set in use at a point in the journey: shared notes stay, notes of the old state fade out and notes of the new one fade in. */
export function weightsAt(cur, tgt, p) {
  const a = pitchWeights(cur), b = pitchWeights(tgt), m = win(p, WINDOWS.harm[0], WINDOWS.harm[1]);
  return a.map((v, i) => lerp(v, b[i], m));
}

/** The beats of the pulse: the tempo glides between the two states and the beat itself drifts a little, so it is felt, not clocked. */
export function pulseBeats(rng, cur, tgt, dur = 300, { start = 2, end = 10 } = {}) {
  const out = []; let t = start + rng() * 0.4, x = 0;
  while (t < dur - end && out.length < 1200) {
    const c = cuesAt(cur, tgt, t / dur); out.push(t);
    x = x * 0.94 + (rng() - 0.5) * 0.03 * (0.5 + c.jit * 2);
    t += (60 / Math.max(20, c.bpm)) * (1 + x);
  }
  return out;
}

/** The soft pulse layer: one hit per beat (a little off the grid), plus lighter ticks between beats where the state is syncopated. */
export function pulseHits(rng, cur, tgt, dur, beats) {
  const out = [];
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i], p = t / dur, c = cuesAt(cur, tgt, p), next = beats[i + 1] ?? t + 60 / c.bpm, ib = next - t;
    const g = (rng() + rng() + rng() - 1.5) / 1.5;
    const strong = i % 4 === 0 ? 1.15 : i % 2 === 0 ? 1 : 0.85;
    out.push({ t: Math.max(0.1, t + g * c.jit * 0.25 * ib), amp: c.pulse * strong, kind: 'thump', p });
    if (rng() < c.sync * 0.8) out.push({ t: t + ib * (0.5 + g * c.jit * 0.15), amp: c.pulse * (0.35 + c.accent * 0.5), kind: 'tick', p });
  }
  return out;
}

/** Beating rate (Hz) for a roughness value: a slow shimmer near 0.1 Hz, a rough buzz in the tens of Hz. */
export const beatHz = r => 0.1 * Math.pow(350, c01(r));
