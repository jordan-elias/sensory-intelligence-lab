/**
 * /assets/js/seq/groove.js
 * The rhythm rules the sequencer uses, as plain functions: Euclidean patterns, swing, and which tracks are audible
 * with mute and solo. Kept separate from the page so they can be tested without a browser or any audio.
 */

/** Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`, rotated by `rotate` steps to the right. Returns booleans. */
export function euclid(pulses, steps = 16, rotate = 0) {
  const p = Math.max(0, Math.min(steps, Math.round(pulses))), out = Array(steps).fill(false);
  for (let i = 0; i < steps; i++) out[(((i + rotate) % steps) + steps) % steps] = p > 0 && (i * p) % steps < p;   // evenly spaced; always starts on a hit
  return out;
}

/** How late to play a step, in seconds. Every second sixteenth is delayed; `amount` 0..1 reaches half a sixteenth (a little past triplet feel at about 0.67). */
export const swingOffset = (step, amount, stepSeconds) => (step % 2 === 1 ? Math.max(0, Math.min(1, amount)) * stepSeconds * 0.5 : 0);

/** Whether a track makes sound: if any track is soloed only soloed tracks do, otherwise every track that is not muted. */
export const audible = (i, muted, soloed) => (soloed.some(Boolean) ? !!soloed[i] : !muted[i]);

/* ── Step velocity, chance and per-track length ── */
const c01 = v => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 1);
/** The levels a step cycles through when tapped in Velocity or Chance mode. */
export const LEVELS = [1, 0.75, 0.5, 0.25];
/** The next level after `v` (1 → 0.75 → 0.5 → 0.25 → 1). Anything in between counts as the nearest level below it. */
export const nextLevel = v => { const x = c01(v); let i = LEVELS.findIndex(l => x >= l - 1e-6); if (i < 0) i = LEVELS.length - 1; return LEVELS[(i + 1) % LEVELS.length]; };
/** Loudness for a step: velocity 1 is the track's normal level, 0.25 is quiet but still clearly heard. */
export const velocityVol = (base, v) => base * (0.2 + 0.8 * c01(v));
/** Whether a step with this chance sounds this time. `rand` is a number in [0,1); chance 1 always sounds, 0 never. */
export const plays = (chance, rand) => { const c = c01(chance); return c >= 1 || rand < c; };
/** A usable track length: a whole number from 1 to `max`. */
export const clampLen = (n, max = 16) => { n = Math.round(Number(n)); return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : max; };
/** Which step a track of length `len` plays at a running count `tick` (a length of 12 against 16 gives a 12-step cycle that drifts against the others). */
export const trackStep = (tick, len, max = 16) => { const L = clampLen(len, max); return ((Math.floor(tick) % L) + L) % L; };
