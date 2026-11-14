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
