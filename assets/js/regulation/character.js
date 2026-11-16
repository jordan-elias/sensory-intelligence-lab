/**
 * /assets/js/regulation/character.js
 * What each state sounds like, so the nine states are easy to tell apart and the journey between two of them is audible.
 * Pure and seeded (no Web Audio here), so it can be tested: given a current and a target state it returns the notes of a
 * melodic voice, whose scale, register, speed, length, attack, tone colour and echo move from one state's character to the other's.
 * The existing drone and rhythm layers are left as they are; this adds a voice above them.
 * Nothing here claims an effect on the body; these are musical choices.
 */
const c01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
const lerp = (a, b, t) => a + (b - a) * c01(t);
export const sigmoid = t => 1 / (1 + Math.exp(-12 * (c01(t) - 0.5)));

/** Tonic (Hz) the drone of each state is built on; the melody sits on the same note. */
export const TONIC = { overwhelmed: 82.4, anxious: 110, tired: 82.4, unfocused: 98, overstim: 65.4, calm: 82.4, alert: 110, grounded: 55, energized: 110 };

/** Scale as semitones above the tonic. */
export const SCALE = {
  overwhelmed: [0, 1, 3, 6, 7, 10],        // crowded, unresolved
  anxious: [0, 1, 3, 5, 6, 8, 10],         // tense, close steps
  tired: [0, 3, 5, 7, 10],                 // minor pentatonic, low and soft
  unfocused: [0, 2, 3, 5, 7, 8, 10],       // wandering minor
  overstim: [0, 2, 4, 6, 8, 10],           // whole-tone shimmer, no resting point
  calm: [0, 2, 4, 7, 9],                   // major pentatonic, open
  alert: [0, 2, 4, 6, 7, 9, 11],           // bright, lifting
  grounded: [0, 7, 12],                    // open fifths and octaves
  energized: [0, 2, 4, 7, 9, 10],          // major with a flat seventh, driving
};

/** Character of the voice: register (octaves above the tonic), notes a minute, note length (s), attack (s), spread of leaps (0-1), stereo width, echo (0-1), loudness. */
export const VOICE = {
  overwhelmed: { reg: 2, rate: 44, len: 0.45, att: 0.006, leap: 0.9, width: 0.9, echo: 0.1, amp: 1.6 },
  anxious: { reg: 3, rate: 38, len: 0.35, att: 0.004, leap: 0.7, width: 0.6, echo: 0.1, amp: 1.4 },
  tired: { reg: 1, rate: 5, len: 5.0, att: 0.9, leap: 0.2, width: 0.3, echo: 0.55, amp: 1.2 },
  unfocused: { reg: 2, rate: 16, len: 1.6, att: 0.12, leap: 0.6, width: 0.7, echo: 0.3, amp: 1.3 },
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
  unfocused: [0, 1, 0.4, 0.15, 0.3, 0.05, 0.12, 0],
  overstim: [0, 1, 0.5, 0.8, 0.3, 0.7, 0.25, 0.55],
  calm: [0, 1, 0.06, 0.02, 0, 0, 0, 0],
  alert: [0, 1, 0.5, 0.3, 0.25, 0.15, 0.1, 0],
  grounded: [0, 1, 0, 0.35, 0, 0.12, 0, 0],
  energized: [0, 1, 0.65, 0.45, 0.35, 0.25, 0.18, 0.12],
};

export const blendColor = (a, b, t) => COLOR[a].map((v, i) => lerp(v, COLOR[b][i], t));
const mix = (a, b, k, t) => lerp(VOICE[a][k], VOICE[b][k], t);

/** Parameters of the voice at a point in the journey (progress 0-1, after the same S-curve the drone uses). */
export function voiceAt(cur, tgt, progress) {
  const ct = sigmoid(progress), o = { ct };
  for (const k of Object.keys(VOICE[cur])) o[k] = mix(cur, tgt, k, ct);
  return o;
}

/** The note after this one: mostly steps along the scale, leaps more often when `leap` is high. Stays inside `lo`..`hi` degrees. */
function walk(rng, deg, leap, lo, hi) {
  const r = rng(), size = r < leap * 0.5 ? 2 + Math.floor(rng() * 3) : 1, dir = rng() < 0.5 ? -1 : 1;
  let d = deg + dir * size; if (d < lo || d > hi) d = deg - dir * size; return Math.max(lo, Math.min(hi, d));
}

/**
 * The notes of the voice for one journey. Each note is { t, freq, dur, att, amp, pan, echo, from } where `from` is the state whose scale
 * it was taken from: early notes mostly come from the current state, late ones from the target, with a mix between.
 */
export function melodyEvents(rng, cur, tgt, dur = 300, { fadeIn = 4, fadeOut = 10 } = {}) {
  const out = []; let t = fadeIn + rng() * 2, degC = 2, degT = 2;
  while (t < dur - fadeOut - 0.5 && out.length < 900) {
    const p = t / dur, v = voiceAt(cur, tgt, p), from = rng() < v.ct ? tgt : cur, sc = SCALE[from], perOct = sc.length;
    const span = 2 * perOct, deg = walk(rng, from === tgt ? degT : degC, v.leap, 0, span);
    if (from === tgt) degT = deg; else degC = deg;
    const semis = sc[deg % perOct] + 12 * Math.floor(deg / perOct), reg = Math.max(0, Math.round(v.reg) - 2);
    const freq = TONIC[from] * Math.pow(2, (semis + 12 * reg) / 12);
    if (freq > 3200) { t += 60 / Math.max(v.rate, 1); continue; }
    const gap = 60 / Math.max(v.rate, 1), len = Math.max(0.12, v.len * (0.8 + rng() * 0.5));
    out.push({ t, freq, dur: len, att: Math.min(v.att, len * 0.6), amp: 0.04 * v.amp * (0.7 + rng() * 0.6), pan: (rng() * 2 - 1) * v.width, echo: v.echo, from });
    t += gap * (0.55 + rng() * 0.9);
  }
  return out;
}

/** Wet level of the echo over the journey (0-1). */
export const echoAt = (cur, tgt, progress) => voiceAt(cur, tgt, progress).echo;
