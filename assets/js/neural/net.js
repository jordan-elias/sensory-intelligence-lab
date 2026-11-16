/**
 * /assets/js/neural/net.js
 * A small real neural network, and a conductor that keeps it learning forever.
 * Pure functions and plain data: no audio, no page. The sound comes from what this computes.
 *
 * The network is a feed-forward network with tanh units: input -> hidden 1 -> hidden 2 -> output.
 * It learns by stochastic gradient descent (backpropagation) toward a target that keeps changing,
 * so it is never finished, and what it is doing keeps changing too.
 */
import { mulberry32 } from '../experiments/rng.js';

export const SIZES = [6, 10, 8, 8];                 // inputs, hidden 1, hidden 2, outputs (7 scale degrees and a gate)
export const DEGREES = 7;

const gauss = rng => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** A new network with weights drawn the usual way (Xavier). `mask` marks which connections exist. */
export function createNet(seed = 1, sizes = SIZES) {
  const rng = mulberry32(seed), W = [], B = [], M = [];
  for (let l = 0; l < sizes.length - 1; l++) {
    const [nin, nout] = [sizes[l], sizes[l + 1]], s = Math.sqrt(2 / (nin + nout));
    W.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => gauss(rng) * s)));
    B.push(Array.from({ length: nout }, () => 0));
    M.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => 1)));
  }
  return { sizes: sizes.slice(), W, B, M };
}

/** Runs the network forward. Returns the activations of every layer, input first. */
export function forward(net, x) {
  const acts = [x.slice()];
  for (let l = 0; l < net.W.length; l++) {
    const a = acts[l], out = net.W[l].map((row, j) => { let s = net.B[l][j]; for (let i = 0; i < row.length; i++) s += row[i] * net.M[l][j][i] * a[i]; return Math.tanh(s); });
    acts.push(out);
  }
  return acts;
}

export const loss = (out, target) => out.reduce((s, o, i) => s + (o - target[i]) ** 2, 0) / out.length;

/** One step of gradient descent on one example. Returns the loss before the step. */
export function train(net, x, target, lr = 0.05) {
  const acts = forward(net, x), L = net.W.length, out = acts[L], before = loss(out, target);
  let delta = out.map((o, i) => (2 / out.length) * (o - target[i]) * (1 - o * o));
  for (let l = L - 1; l >= 0; l--) {
    const a = acts[l], prev = a.map(() => 0);
    for (let j = 0; j < net.W[l].length; j++) {
      for (let i = 0; i < a.length; i++) { prev[i] += net.W[l][j][i] * net.M[l][j][i] * delta[j]; net.W[l][j][i] -= lr * delta[j] * a[i] * net.M[l][j][i]; }
      net.B[l][j] -= lr * delta[j];
    }
    if (l > 0) delta = prev.map((p, i) => p * (1 - a[i] * a[i]));
  }
  return before;
}

/** Adds noise to every weight: heat. */
export function perturb(net, rng, amount) { for (const layer of net.W) for (const row of layer) for (let i = 0; i < row.length; i++) row[i] += gauss(rng) * amount; }

/** Prunes the weakest live connections of one layer and regrows the same number elsewhere. Returns how many moved. */
export function rewire(net, rng, layer = Math.floor(rng() * net.W.length), count = 3) {
  const live = [], dead = [];
  net.W[layer].forEach((row, j) => row.forEach((w, i) => (net.M[layer][j][i] ? live : dead).push({ j, i, a: Math.abs(w) })));
  live.sort((p, q) => p.a - q.a);
  const n = Math.min(count, live.length - Math.ceil(live.length * 0.4));           // never thin a layer below 40% of its connections
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const kill = live[k]; net.M[layer][kill.j][kill.i] = 0;
    const pool = dead.filter(d => d.j !== kill.j || d.i !== kill.i), grow = pool.length ? pool[Math.floor(rng() * pool.length)] : kill;
    net.M[layer][grow.j][grow.i] = 1; net.W[layer][grow.j][grow.i] = gauss(rng) * 0.4; moved++;
  }
  return moved;
}

export function softmax(v, beta = 1) { const m = Math.max(...v), e = v.map(x => Math.exp((x - m) * beta)), s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); }

/** The mean of absolute weights of each layer: how strongly connected the network is. */
export const weightStrength = net => net.W.map((layer, l) => { let s = 0, n = 0; layer.forEach((row, j) => row.forEach((w, i) => { if (net.M[l][j][i]) { s += Math.abs(w); n++; } })); return n ? s / n : 0; });

/** Chord targets: tones in the output layer's "scale degree" units, +0.9 where the chord has a tone, -0.9 elsewhere. */
const CHORDS = [[0, 2, 4], [1, 3, 5], [2, 4, 6], [3, 5, 0], [4, 6, 1], [5, 0, 2], [0, 3, 4], [1, 4, 5], [0, 2, 5], [2, 3, 6]];
export function chordTarget(degrees, gate) {
  const t = Array.from({ length: DEGREES + 1 }, () => -0.9);
  for (const d of degrees) t[d % DEGREES] = 0.9;
  t[DEGREES] = gate; return t;
}

/**
 * Keeps the network learning and changing, on several time scales:
 *   every few seconds   a chord change: one or two tones of the target move (voice leading)
 *   every minute or so  a new episode: a fresh target, a burst of heat, and the connections are rewired
 *   every few minutes   the key moves to a new root and sometimes a new mode
 *   always              the input wanders along a path that never repeats, and the target drifts a little
 * `tick(dt)` advances time by dt seconds, trains the network a few steps, and reports what happened.
 */
export const MODES = ['major pentatonic', 'natural minor', 'dorian', 'mixolydian', 'lydian'];
export class Conductor {
  constructor(seed = 1, { learn = 0.05, wild = 0.5 } = {}) {
    this.seed = seed; this.rng = mulberry32(seed ^ 0x9e3779b9); this.net = createNet(seed);
    this.learn = learn; this.wild = wild; this.t = 0;
    this.phases = Array.from({ length: SIZES[0] }, () => this.rng() * 6.283);
    this.freqs = Array.from({ length: SIZES[0] }, (_, i) => 0.031 + 0.047 * (i + 1) * (0.6 + this.rng() * 0.8));
    this.walk = Array.from({ length: SIZES[0] }, () => 0);
    this.chord = CHORDS[Math.floor(this.rng() * CHORDS.length)].slice(); this.gate = 0.3;
    this.target = chordTarget(this.chord, this.gate); this.logit = this.target.slice();
    this.nextChord = 6 + this.rng() * 6; this.nextEpisode = 45 + this.rng() * 40; this.nextKey = 110 + this.rng() * 80;
    this.root = 0; this.mode = 'natural minor'; this.episode = 0; this.lossNow = 1; this.density = 0.5;
    this.lastActs = forward(this.net, this.input());
  }
  input() {
    return this.phases.map((p, i) => Math.tanh(1.2 * Math.sin(p + this.t * this.freqs[i] * 6.283) + this.walk[i]));
  }
  tick(dt) {
    const events = []; this.t += dt;
    for (let i = 0; i < this.walk.length; i++) this.walk[i] = this.walk[i] * (1 - 0.04 * dt) + (this.rng() - 0.5) * 0.12 * Math.sqrt(dt) * (0.5 + this.wild);
    // slow macro-cycle: density breathes over about five minutes
    this.density = 0.5 + 0.4 * Math.sin(this.t / 47) * Math.cos(this.t / 131 + 1);
    if ((this.nextChord -= dt) <= 0) {
      const k = 1 + (this.rng() < 0.4 ? 1 : 0);
      for (let m = 0; m < k; m++) this.chord[Math.floor(this.rng() * 3)] = Math.floor(this.rng() * DEGREES);
      this.nextChord = (5 + this.rng() * 9) / (0.6 + this.wild); events.push('chord');
    }
    if ((this.nextEpisode -= dt) <= 0) {
      this.chord = CHORDS[Math.floor(this.rng() * CHORDS.length)].slice(); this.episode++;
      perturb(this.net, this.rng, 0.04 + 0.12 * this.wild);
      rewire(this.net, this.rng, undefined, 2 + Math.floor(this.rng() * 4));
      this.nextEpisode = (50 + this.rng() * 50) / (0.5 + this.wild); events.push('episode');
    }
    if ((this.nextKey -= dt) <= 0) {
      this.root = (this.root + [7, 5, 2, 9, 3][Math.floor(this.rng() * 5)]) % 12;
      if (this.rng() < 0.5) this.mode = MODES[Math.floor(this.rng() * MODES.length)];
      this.nextKey = 120 + this.rng() * 100; events.push('key');
    }
    // the target drifts a little all the time, so the network is always chasing it
    this.gate = Math.max(-0.4, Math.min(0.95, this.gate + (this.rng() - 0.5) * 0.12 * dt + (this.density - 0.5) * 0.02 * dt));
    this.target = chordTarget(this.chord, this.gate);
    const steps = Math.max(1, Math.round(dt * 20));
    let l = 0; for (let s = 0; s < steps; s++) l = train(this.net, this.input(), this.target, this.learn);
    this.lossNow = l; this.lastActs = forward(this.net, this.input());
    return { events, loss: l, acts: this.lastActs, input: this.lastActs[0], target: this.target, root: this.root, mode: this.mode, density: this.density };
  }
}
