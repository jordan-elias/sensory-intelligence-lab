/**
 * /assets/js/ambience/loop.js
 * Sound made to loop without a seam, and the noises Ambience generates. All on plain Float32Arrays, so it is testable without audio.
 */
import { rng } from './music.js';

/**
 * Makes a recording loop smoothly: the last `xf` samples are blended into the first `xf` with an equal-power crossfade and then
 * dropped, so the end of the result runs straight into its start. Returns new arrays shorter by `xf` samples.
 * The crossfade is limited to a third of the recording.
 */
export function loopable(channels, xf) {
  return channels.map(src => {
    const n = src.length, x = Math.max(0, Math.min(Math.floor(xf), Math.floor(n / 3)));
    if (!x) return Float32Array.from(src);
    const out = new Float32Array(n - x); out.set(src.subarray(0, n - x));
    for (let i = 0; i < x; i++) { const t = (i + 0.5) / x, a = Math.sin(t * Math.PI / 2), b = Math.cos(t * Math.PI / 2); out[i] = src[i] * a + src[n - x + i] * b; }
    return out;
  });
}

const scale = (a, peak) => { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); if (m > 0) { const k = peak / m; for (let i = 0; i < a.length; i++) a[i] *= k; } return a; };

/** Generated noise of `n` samples, peak 0.5. kind: white, pink or brown. Seeded, so tests are repeatable. */
export function makeNoise(kind, n, seed = 1) {
  const r = rng(seed), o = new Float32Array(n);
  if (kind === 'white') for (let i = 0; i < n; i++) o[i] = r() * 2 - 1;
  else if (kind === 'brown') { let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (r() * 2 - 1)) / 1.02; o[i] = last; } }
  else { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < n; i++) { const w = r() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; o[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; } }
  return scale(o, 0.5);
}
