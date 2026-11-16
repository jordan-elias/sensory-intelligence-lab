/**
 * /assets/js/neural/synth.js
 * The network as a sound-making function. A waveform is a function from the position in a cycle (the phase, 0 to 1)
 * to an amplitude. A neural network is a function from numbers to numbers. So the network can be the oscillator:
 * feed it the phase, and what it outputs is the sound.
 *
 * Pure functions, shared by the page and the audio worklet's tests. Nothing here touches audio or the page.
 */
import { forward, train, createNet, SIZES } from './net.js';

export const INPUT_LABELS = ['sin φ', 'cos φ', 'sin 2φ', 'cos 2φ', 'knob A', 'knob B'];
export const OUTPUT_LABELS = ['left', 'right'];
export const TAU = Math.PI * 2;

/** The six inputs for a phase (0 to 1) and two knobs (-1 to 1). */
export const inputsAt = (phase, a = 0, b = 0) => [Math.sin(TAU * phase), Math.cos(TAU * phase), Math.sin(2 * TAU * phase), Math.cos(2 * TAU * phase), a, b];

/** The network's output over one cycle: `n` samples of the first output neuron. */
export function renderCycle(net, a = 0, b = 0, n = 256, out = 0) {
  const w = new Float32Array(n);
  for (let k = 0; k < n; k++) w[k] = forward(net, inputsAt(k / n, a, b))[net.sizes.length - 1][out];
  return w;
}

/** The loudness of the first `count` harmonics of one cycle of a waveform (harmonic 1 is the fundamental). */
export function harmonics(cycle, count = 24) {
  const n = cycle.length, mags = [];
  for (let h = 1; h <= count; h++) { let re = 0, im = 0; for (let k = 0; k < n; k++) { const a = TAU * h * k / n; re += cycle[k] * Math.cos(a); im += cycle[k] * Math.sin(a); } mags.push((2 / n) * Math.hypot(re, im)); }
  return mags;
}
/** The size of the steady (DC) part: it is silent, but it uses up headroom, so the worklet removes it. */
export const dcOf = cycle => cycle.reduce((s, v) => s + v, 0) / cycle.length;

/** Target waveforms a network can be taught. Each maps a phase 0..1 to -1..1. */
export const WAVES = {
  sine: p => Math.sin(TAU * p),
  triangle: p => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  saw: p => 2 * ((p + 0.5) % 1) - 1,
  square: p => (p < 0.5 ? 0.8 : -0.8),
  pulse: p => (p < 0.15 ? 0.8 : -0.8),
  'two bumps': p => Math.sin(TAU * p) * Math.sin(3 * TAU * p),
};
export const WAVE_NAMES = Object.keys(WAVES);

/** Teaches the network a waveform for the current knob settings: `steps` examples at random phases. Returns the mean loss. */
export function teachWave(net, wave, a, b, lr, steps, rng) {
  const f = typeof wave === 'function' ? wave : WAVES[wave], mask = Array.from({ length: net.sizes[net.sizes.length - 1] }, (_, i) => i < 2);
  let total = 0;
  for (let s = 0; s < steps; s++) {
    const p = rng(), t = Array(mask.length).fill(0), y = f(p); t[0] = y; t[1] = y;
    total += train(net, inputsAt(p, a, b), t, lr, mask);
  }
  return total / Math.max(1, steps);
}

/** A starting network for the instrument: random weights, scaled so the wave is interesting but not wild. */
export function makeInstrument(seed = 1, hidden = [SIZES[1], SIZES[2]], scale = 2.2) {
  const net = createNet(seed, [SIZES[0], hidden[0], hidden[1], SIZES[3]]);
  for (const layer of net.W) for (const row of layer) for (let i = 0; i < row.length; i++) row[i] *= scale;
  return net;
}
/** Multiplies every weight: more gain means harder-driven neurons and so more harmonics. */
export function scaleAll(net, f) { for (const layer of net.W) for (const row of layer) for (let i = 0; i < row.length; i++) row[i] = Math.max(-3, Math.min(3, row[i] * f)); }

/** The network as plain typed arrays for the audio worklet, which cannot receive objects with methods. */
export function pack(net) {
  const L = net.sizes.length - 1;
  return {
    sizes: net.sizes.slice(), act: net.act.slice(),
    W: net.W.map((layer, l) => Float32Array.from(layer.flatMap((row, j) => row.map((w, i) => (net.M[l][j][i] ? w : 0))))),
    B: net.B.map(b => Float32Array.from(b)),
    mute: net.mute.map(m => Uint8Array.from(m.map(v => (v ? 1 : 0)))),
    outputs: L,
  };
}

/** A one-sample forward pass on packed arrays. The worklet runs exactly this per sample; the test checks it against `forward`. */
export function packedForward(p, x, ACT) {
  let a = x.slice();
  for (let l = 0; l < p.sizes.length - 1; l++) {
    const nin = p.sizes[l], nout = p.sizes[l + 1], f = ACT[l === p.sizes.length - 2 ? 'tanh' : p.act[l]], out = new Array(nout);
    for (let j = 0; j < nout; j++) { let s = p.B[l][j]; const row = j * nin; for (let i = 0; i < nin; i++) s += p.W[l][row + i] * a[i]; out[j] = p.mute[l + 1][j] ? 0 : f(s); }
    a = out;
  }
  return a;
}

/** One neuron's activation across a whole cycle: shows what that neuron contributes to the wave. */
export function neuronCycle(net, layer, i, a = 0, b = 0, n = 128) {
  const w = new Float32Array(n);
  for (let k = 0; k < n; k++) w[k] = forward(net, inputsAt(k / n, a, b))[layer][i];
  return w;
}
