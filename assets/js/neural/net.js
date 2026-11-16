/**
 * /assets/js/neural/net.js
 * A small real neural network, and a conductor that keeps it learning forever.
 * Pure functions and plain data: no audio, no page. The sound comes from what this computes.
 *
 * The network is feed-forward: input -> hidden 1 -> hidden 2 -> output. Each hidden layer can use a different
 * activation function. It learns by stochastic gradient descent (backpropagation) toward a target that keeps
 * changing, so it is never finished, and what it is doing keeps changing too.
 * Individual neurons can be muted or frozen, and individual weights can be edited or cut.
 */
import { mulberry32 } from '../experiments/rng.js';

export const SIZES = [6, 10, 8, 8];                 // inputs, hidden 1, hidden 2, outputs (7 scale degrees and a gate)
export const DEGREES = 7;
export const MAX_HIDDEN = [16, 12];

/** Activation functions: f(z) is the neuron's output, df(z) is its slope, which backpropagation needs. */
export const ACTIVATIONS = {
  tanh: { label: 'tanh', range: '-1 to +1', f: z => Math.tanh(z), df: z => { const t = Math.tanh(z); return 1 - t * t; },
    about: 'A smooth S-shaped curve. Strong inputs saturate toward -1 or +1; weak inputs pass almost unchanged. Centred on zero, which suits learning.' },
  softsign: { label: 'softsign', range: '-1 to +1', f: z => z / (1 + Math.abs(z)), df: z => 1 / ((1 + Math.abs(z)) ** 2),
    about: 'Like tanh but it approaches its limits slowly, so it saturates less and keeps learning signals alive for large inputs.' },
  relu: { label: 'leaky ReLU', range: '-0.05z to z', f: z => (z > 0 ? z : 0.05 * z), df: z => (z > 0 ? 1 : 0.05),
    about: 'Passes positive values straight through and nearly blocks negative ones. Cheap, and the standard choice in large networks. It is unbounded, so the sound code limits it.' },
  sine: { label: 'sine', range: '-1 to +1', f: z => Math.sin(z), df: z => Math.cos(z),
    about: 'A periodic function: the output rises, falls and rises again as the input grows. Rare in practice, but it makes the neuron respond in rhythmic bands, which is easy to hear.' },
};
export const ACTIVATION_NAMES = Object.keys(ACTIVATIONS);

const gauss = rng => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** A new network with weights drawn the usual way (Xavier). `M` marks which connections exist. */
export function createNet(seed = 1, sizes = SIZES) {
  const rng = mulberry32(seed), W = [], B = [], M = [];
  for (let l = 0; l < sizes.length - 1; l++) {
    const [nin, nout] = [sizes[l], sizes[l + 1]], s = Math.sqrt(2 / (nin + nout));
    W.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => gauss(rng) * s)));
    B.push(Array.from({ length: nout }, () => 0));
    M.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => 1)));
  }
  const flags = () => sizes.map(n => Array.from({ length: n }, () => false));
  return { sizes: sizes.slice(), W, B, M, act: sizes.slice(1).map(() => 'tanh'), mute: flags(), frozen: flags(), z: null };
}

const actOf = (net, l) => ACTIVATIONS[l === net.W.length - 1 ? 'tanh' : net.act[l]] || ACTIVATIONS.tanh;      // the output layer is always tanh

/** Runs the network forward. Returns the activations of every layer, input first. The pre-activations are kept in net.z. */
export function forward(net, x) {
  const acts = [x.map((v, i) => (net.mute[0][i] ? 0 : v))], zs = [null];
  for (let l = 0; l < net.W.length; l++) {
    const a = acts[l], f = actOf(net, l).f, z = net.W[l].map((row, j) => { let s = net.B[l][j]; for (let i = 0; i < row.length; i++) s += row[i] * net.M[l][j][i] * a[i]; return s; });
    acts.push(z.map((v, j) => (net.mute[l + 1][j] ? 0 : f(v)))); zs.push(z);
  }
  net.z = zs; return acts;
}

export const loss = (out, target) => out.reduce((s, o, i) => s + (o - target[i]) ** 2, 0) / out.length;

/** One step of gradient descent on one example. Returns the loss before the step. `mask` lists the outputs that count (the others are left alone). */
export function train(net, x, target, lr = 0.05, mask = null) {
  const acts = forward(net, x), zs = net.z, L = net.W.length, out = acts[L], cnt = mask ? mask.filter(Boolean).length || 1 : out.length, before = mask ? out.reduce((t, o, i) => t + (mask[i] ? (o - target[i]) ** 2 : 0), 0) / cnt : loss(out, target);
  let delta = out.map((o, i) => (net.mute[L][i] || (mask && !mask[i]) ? 0 : (2 / cnt) * (o - target[i]) * actOf(net, L - 1).df(zs[L][i])));
  for (let l = L - 1; l >= 0; l--) {
    const a = acts[l], prev = a.map(() => 0);
    for (let j = 0; j < net.W[l].length; j++) {
      const learn = !net.frozen[l + 1][j];
      for (let i = 0; i < a.length; i++) { prev[i] += net.W[l][j][i] * net.M[l][j][i] * delta[j]; if (learn) net.W[l][j][i] -= lr * delta[j] * a[i] * net.M[l][j][i]; }
      if (learn) net.B[l][j] -= lr * delta[j];
    }
    if (l > 0) { const df = actOf(net, l - 1).df; delta = prev.map((p, i) => (net.mute[l][i] ? 0 : p * df(zs[l][i]))); }
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

// ── editing one neuron or one connection, for the inspector ──
export const setWeight = (net, l, j, i, v) => { net.W[l][j][i] = Math.max(-3, Math.min(3, v)); };
export const setBias = (net, l, j, v) => { net.B[l][j] = Math.max(-3, Math.min(3, v)); };
export const toggleConnection = (net, l, j, i) => { net.M[l][j][i] = net.M[l][j][i] ? 0 : 1; return !!net.M[l][j][i]; };
export const toggleMute = (net, layer, i) => { net.mute[layer][i] = !net.mute[layer][i]; return net.mute[layer][i]; };
export const toggleFrozen = (net, layer, i) => { net.frozen[layer][i] = !net.frozen[layer][i]; return net.frozen[layer][i]; };
/** Multiplies every incoming weight of a neuron: its listening, made louder or quieter. */
export const scaleIncoming = (net, layer, j, f) => { net.W[layer - 1][j] = net.W[layer - 1][j].map(w => Math.max(-3, Math.min(3, w * f))); };
/** Gives a neuron fresh random incoming weights and a zero bias. */
export function resetNeuron(net, layer, j, rng) {
  const nin = net.sizes[layer - 1], s = Math.sqrt(2 / (nin + net.sizes[layer]));
  net.W[layer - 1][j] = net.W[layer - 1][j].map(() => gauss(rng) * s); net.B[layer - 1][j] = 0;
}
export function setActivation(net, layer, name) { if (ACTIVATIONS[name] && layer >= 1 && layer <= net.W.length - 1) net.act[layer - 1] = name; }

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
 * Settings: learn (step size), heat (how hard the network is shaken), pace (how often things change),
 * hold (stop changing the target), lockKey, and pins (force an output neuron's target).
 */
export const MODES = ['major pentatonic', 'natural minor', 'dorian', 'mixolydian', 'lydian'];
export class Conductor {
  constructor(seed = 1, { learn = 0.05, wild = 0.5, heat = wild, pace = 1, hidden = [SIZES[1], SIZES[2]] } = {}) {
    this.seed = seed; this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.sizes = [SIZES[0], hidden[0], hidden[1], SIZES[3]]; this.net = createNet(seed, this.sizes);
    this.learn = learn; this.heat = heat; this.pace = pace; this.t = 0; this.hold = false; this.lockKey = false; this.pins = {};
    this.phases = Array.from({ length: SIZES[0] }, () => this.rng() * 6.283);
    this.freqs = Array.from({ length: SIZES[0] }, (_, i) => 0.031 + 0.047 * (i + 1) * (0.6 + this.rng() * 0.8));
    this.walk = Array.from({ length: SIZES[0] }, () => 0);
    this.chord = CHORDS[Math.floor(this.rng() * CHORDS.length)].slice(); this.gate = 0.3;
    this.target = chordTarget(this.chord, this.gate);
    this.nextChord = 6 + this.rng() * 6; this.nextEpisode = 45 + this.rng() * 40; this.nextKey = 110 + this.rng() * 80;
    this.root = 0; this.mode = 'natural minor'; this.episode = 0; this.lossNow = 1; this.density = 0.5;
    this.lastActs = forward(this.net, this.input());
  }
  get wild() { return this.heat; }
  set wild(v) { this.heat = v; }
  input() { return this.phases.map((p, i) => Math.tanh(1.2 * Math.sin(p + this.t * this.freqs[i] * 6.283) + this.walk[i])); }
  setKey(root, mode) { this.root = root; if (mode) this.mode = mode; }
  tick(dt) {
    const events = []; this.t += dt;
    for (let i = 0; i < this.walk.length; i++) this.walk[i] = this.walk[i] * (1 - 0.04 * dt) + (this.rng() - 0.5) * 0.12 * Math.sqrt(dt) * (0.5 + this.heat);
    this.density = 0.5 + 0.4 * Math.sin(this.t / 47) * Math.cos(this.t / 131 + 1);
    if (!this.hold) {
      if ((this.nextChord -= dt) <= 0) {
        const k = 1 + (this.rng() < 0.4 ? 1 : 0);
        for (let m = 0; m < k; m++) this.chord[Math.floor(this.rng() * 3)] = Math.floor(this.rng() * DEGREES);
        this.nextChord = (5 + this.rng() * 9) / this.pace; events.push('chord');
      }
      if ((this.nextEpisode -= dt) <= 0) {
        this.chord = CHORDS[Math.floor(this.rng() * CHORDS.length)].slice(); this.episode++;
        perturb(this.net, this.rng, 0.04 + 0.12 * this.heat);
        rewire(this.net, this.rng, undefined, 2 + Math.floor(this.rng() * 4));
        this.nextEpisode = (50 + this.rng() * 50) / this.pace; events.push('episode');
      }
    }
    if (!this.lockKey && (this.nextKey -= dt) <= 0) {
      this.root = (this.root + [7, 5, 2, 9, 3][Math.floor(this.rng() * 5)]) % 12;
      if (this.rng() < 0.5) this.mode = MODES[Math.floor(this.rng() * MODES.length)];
      this.nextKey = (120 + this.rng() * 100) / this.pace; events.push('key');
    }
    if (!this.hold) this.gate = Math.max(-0.4, Math.min(0.95, this.gate + (this.rng() - 0.5) * 0.12 * dt + (this.density - 0.5) * 0.02 * dt));
    this.target = chordTarget(this.chord, this.gate);
    for (const [j, v] of Object.entries(this.pins)) this.target[+j] = v;
    const steps = Math.max(1, Math.round(dt * 20));
    let l = 0; for (let s = 0; s < steps; s++) l = train(this.net, this.input(), this.target, this.learn);
    this.lossNow = l; this.lastActs = forward(this.net, this.input());
    return { events, loss: l, acts: this.lastActs, input: this.lastActs[0], target: this.target, root: this.root, mode: this.mode, density: this.density };
  }
  /** Changes the size of the hidden layers: a new network of the new shape, with the old settings kept. */
  resize(h1, h2, seed = this.seed + this.episode + 1) {
    this.sizes = [SIZES[0], Math.max(2, Math.min(MAX_HIDDEN[0], h1)), Math.max(2, Math.min(MAX_HIDDEN[1], h2)), SIZES[3]];
    const old = this.net; this.net = createNet(seed, this.sizes); this.net.act = old.act.slice();
    this.lastActs = forward(this.net, this.input());
  }
}
