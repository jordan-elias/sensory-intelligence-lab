/**
 * /assets/js/regulation/character.js
 * What each state sounds like, so the nine states are easy to tell apart and the journey between two of them is audible.
 * Pure and seeded (no Web Audio here), so it can be tested: given a current and a target state it returns the notes of a
 * melodic voice. The notes sit loosely around the pulse in cues.js (some early, some late, some off the beat), take their pitches
 * from a set that changes gradually through shared notes, and follow the drone's tonic. Register, speed, length, attack, tone colour
 * and echo each move in their own part of the journey. The drone and pulse layers read the same cue table.
 * Nothing here claims an effect on the body; these are musical choices.
 */
import { CUES, SCALE, TONIC, lerp, win, WINDOWS, windows, cuesAt, tonicAt, weightsAt, pulseBeats } from './cues.js';
export { SCALE, TONIC };
const c01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
export const sigmoid = t => 1 / (1 + Math.exp(-12 * (c01(t) - 0.5)));

/** Character of the voice: register (octaves above the tonic), notes a minute, note length (s), attack (s), spread of leaps (0-1), stereo width, echo (0-1), loudness. */
export const VOICE = {
  overwhelmed: { reg: 2, rate: 44, len: 0.45, att: 0.006, leap: 0.9, width: 0.9, echo: 0.1, amp: 1.6 },
  anxious: { reg: 3, rate: 38, len: 0.35, att: 0.004, leap: 0.7, width: 0.6, echo: 0.1, amp: 1.4 },
  tired: { reg: 1, rate: 5, len: 5.0, att: 0.9, leap: 0.2, width: 0.3, echo: 0.55, amp: 1.2 },
  angry: { reg: 2, rate: 60, len: 0.22, att: 0.002, leap: 0.7, width: 0.5, echo: 0.04, amp: 2.0 },
  overstim: { reg: 4, rate: 52, len: 0.25, att: 0.003, leap: 1.0, width: 1.0, echo: 0.08, amp: 1.6 },
  calm: { reg: 2, rate: 6, len: 6.0, att: 1.1, leap: 0.25, width: 0.5, echo: 0.65, amp: 1.2 },
  alert: { reg: 3, rate: 22, len: 0.9, att: 0.02, leap: 0.45, width: 0.4, echo: 0.15, amp: 1.8 },
  grounded: { reg: 1, rate: 4, len: 7.0, att: 1.4, leap: 0.15, width: 0.2, echo: 0.45, amp: 1.2 },
  energized: { reg: 3, rate: 58, len: 0.3, att: 0.004, leap: 0.55, width: 0.5, echo: 0.12, amp: 2.2 },
};

/** Strength of each harmonic of the voice's tone (index = harmonic number, index 0 unused). */
export const COLOR = {
  overwhelmed: [0, 1, 0.7, 0.6, 0.5, 0.4, 0.35, 0.3],
  anxious: [0, 1, 0.2, 0.5, 0.1, 0.35, 0.08, 0.2],
  tired: [0, 1, 0.12, 0.04, 0, 0, 0, 0],
  angry: [0, 1, 0.85, 0.75, 0.7, 0.6, 0.5, 0.45],
  overstim: [0, 1, 0.5, 0.8, 0.3, 0.7, 0.25, 0.55],
  calm: [0, 1, 0.06, 0.02, 0, 0, 0, 0],
  alert: [0, 1, 0.5, 0.3, 0.25, 0.15, 0.1, 0],
  grounded: [0, 1, 0, 0.35, 0, 0.12, 0, 0],
  energized: [0, 1, 0.65, 0.45, 0.35, 0.25, 0.18, 0.12],
};

export const blendColor = (a, b, t) => COLOR[a].map((v, i) => lerp(v, COLOR[b][i], t));
/** Which window of the journey each voice setting moves in. */
const KEYWIN = { reg: 'tex', rate: 'tempo', len: 'tempo', att: 'dyn', leap: 'tex', width: 'space', echo: 'space', amp: 'dyn' };
const mix = (a, b, k, w) => lerp(VOICE[a][k], VOICE[b][k], w[KEYWIN[k]]);

/** Parameters of the voice at a point in the journey (progress 0-1). `ct` is how far the pitch set has moved. */
export function voiceAt(cur, tgt, progress) {
  const w = windows(progress), o = { ct: w.harm, w };
  for (const k of Object.keys(VOICE[cur])) o[k] = mix(cur, tgt, k, w);
  return o;
}

/** A gaussian-ish number in about -1..1 from three uniform draws. */
const gauss = rng => (rng() + rng() + rng() - 1.5) / 1.5;

/** Pick the next pitch (in semitones above the tonic): near the last one, more often when `leap` is low, from the pitch set now in use. */
function nextPitch(rng, last, weights, lo, hi, leap) {
  const cand = []; let sum = 0;
  for (let s = Math.ceil(lo); s <= hi; s++) {
    const w = weights[((s % 12) + 12) % 12]; if (w <= 0.02) continue;
    const near = Math.exp(-Math.abs(s - last) / (1 + leap * 6)) * w; cand.push([s, near]); sum += near;
  }
  if (!cand.length) return last;
  let r = rng() * sum; for (const [s, n] of cand) { r -= n; if (r <= 0) return s; } return cand[cand.length - 1][0];
}

/**
 * The notes of the voice for one journey. Each note is { t, freq, dur, att, amp, pan, echo, from, beat } where `from` is the state whose
 * pitch set carries the note more strongly. Notes come in around the beats of a drifting pulse, early or late by the state's looseness,
 * sometimes between beats, and with whole bars of silence in some states.
 */
export function melodyEvents(rng, cur, tgt, dur = 300, { fadeIn = 4, fadeOut = 10 } = {}) {
  const out = [], beats = pulseBeats(rng, cur, tgt, dur, { start: fadeIn, end: fadeOut }); let last = 7, quiet = 0;
  for (let i = 0; i < beats.length; i++) {
    const tb = beats[i], p = tb / dur, c = cuesAt(cur, tgt, p), v = voiceAt(cur, tgt, p), ib = (beats[i + 1] ?? tb + 60 / c.bpm) - tb;
    if (i % 4 === 0) quiet = rng() < c.rest ? 4 : 0;
    if (quiet > 0) { quiet--; continue; }
    const perBeat = v.rate / Math.max(20, c.bpm), n = Math.floor(perBeat) + (rng() < perBeat - Math.floor(perBeat) ? 1 : 0);
    const weights = weightsAt(cur, tgt, p), wc = weightsAt(cur, tgt, 0), wt = weightsAt(cur, tgt, 1);
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? (rng() < c.sync ? 0.5 : 0) : Math.floor(rng() * 4) / 4 + (k === 0 ? 0 : 0.0);
      const t = tb + (off + gauss(rng) * c.jit) * ib;
      if (t < fadeIn || t >= dur - fadeOut - 0.5) continue;
      const lo = 12 * Math.max(0, v.reg - 2), hi = lo + 24, tonic = tonicAt(cur, tgt, t / dur);
      const sem = nextPitch(rng, Math.max(lo, Math.min(hi, last)), weights, lo, hi, v.leap); last = sem;
      const freq = tonic * Math.pow(2, sem / 12); if (freq > 3200) continue;
      const pc = ((sem % 12) + 12) % 12, from = wt[pc] > wc[pc] ? tgt : wt[pc] < wc[pc] ? cur : (v.ct < 0.5 ? cur : tgt);
      const len = Math.max(0.12, v.len * (0.8 + rng() * 0.5)), off8 = off === 0.5 ? 1 + c.accent : 1;
      out.push({ t, freq, dur: len, att: Math.min(v.att, len * 0.6), amp: 0.04 * v.amp * off8 * (0.7 + rng() * 0.6), pan: (rng() * 2 - 1) * v.width, echo: v.echo, from, beat: i });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Wet level of the echo over the journey (0-1). */
export const echoAt = (cur, tgt, progress) => voiceAt(cur, tgt, progress).echo;
