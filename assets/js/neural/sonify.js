/**
 * /assets/js/neural/sonify.js
 * How the network's numbers become sound. Pure functions: numbers in, numbers out.
 * Each mapping is a choice, and the page says so. The numbers themselves are the network's real activations.
 */
import { SCALES } from '../experiments/rng.js';
import { softmax, DEGREES } from './net.js';

/** Frequency of a scale degree (0 to 6, wrapping up through octaves) above a root pitch class. */
export function degreeFreq(root, mode, degree, octave = 0, base = 110) {
  const sc = SCALES[mode] || SCALES['natural minor'], n = sc.length, d = ((degree % n) + n) % n;
  return base * Math.pow(2, (root + sc[d]) / 12 + octave + Math.floor(degree / n));
}

/** Drone partial amplitudes from the first hidden layer: the louder the neuron, the louder its harmonic. */
export const droneAmps = (acts, { floor = 0.015, scale = 0.11 } = {}) => acts.map(a => floor + scale * Math.min(1, Math.abs(a)));

/** The shimmer layer: second hidden layer neurons become inharmonic upper partials, stretched when tension is high. */
export function shimmerPartials(acts, root, tension) {
  const stretch = 1 + 0.05 * Math.min(1, Math.max(0, tension));
  return acts.map((a, i) => ({ freq: 220 * Math.pow(2, root / 12) * (2 + i * 1.5) * Math.pow(stretch, i + 1), amp: 0.004 + 0.02 * Math.min(1, Math.abs(a)), pan: Math.max(-1, Math.min(1, a)) }));
}

/** Chooses a scale degree by sampling the output layer's probabilities. Higher heat means more adventurous choices. */
export function pickDegree(out, rng, heat = 0.5) {
  const p = softmax(out.slice(0, DEGREES), 2.5 / (0.4 + heat)), r = rng();
  let acc = 0; for (let i = 0; i < p.length; i++) { acc += p[i]; if (r <= acc) return i; }
  return p.length - 1;
}

/** Whether the network "fires" a note this step: the gate neuron, scaled by the slow density cycle. */
export const fires = (gateOut, density, rng) => rng() < Math.max(0, (gateOut + 1) / 2) * (0.25 + 0.75 * Math.max(0, Math.min(1, density)));

/**
 * The strongest contributions in one layer for the current activations: weight times incoming activation.
 * Each is a "weighing" the network just did. Returns { j, i, v } sorted by size, k of them.
 */
export function strongest(net, layer, inActs, k = 2) {
  const out = [];
  net.W[layer].forEach((row, j) => row.forEach((w, i) => { if (net.M[layer][j][i]) out.push({ j, i, v: w * inActs[i] }); }));
  return out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, k);
}

/** Tension from 0 (settled) to 1 (the network is far from its target). */
export const tensionOf = loss => Math.max(0, Math.min(1, loss / 0.6));
