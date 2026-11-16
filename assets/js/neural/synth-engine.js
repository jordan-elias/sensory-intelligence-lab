/**
 * /assets/js/neural/synth-engine.js
 * Instrument mode. The network is the oscillator: an AudioWorklet runs it once per sample, with the phase of the wave
 * as its input, and plays what comes out. The main thread keeps the same network (the one on screen), sends a packed
 * copy to the worklet a few times a second, and draws one cycle of the output and its harmonics.
 */
import { Conductor } from './net.js';
import { makeInstrument, scaleAll, renderCycle, harmonics, dcOf, inputsAt, teachWave, pack } from './synth.js';
import { forward } from './net.js';
import { mulberry32 } from '../experiments/rng.js';

export class InstrumentEngine {
  constructor({ seed = 1, volume = 0.6, onFrame = () => {} } = {}) {
    this.conductor = new Conductor(seed, {}); this.reset(seed);
    this.volume = volume; this.onFrame = onFrame; this.ctx = null; this.node = null; this.running = false; this.timer = null;
    this.freq = 220; this.gate = false; this.hold = false; this.a = 0; this.b = 0; this.wob = 0; this.wobRate = 3; this.phase = 0; this.sweep = true; this.rng = mulberry32(seed + 7);
    this.teaching = null; this.harm = []; this.dc = 0; this.last = null; this.tickNow();
  }
  get state() { return this.conductor; }
  reset(seed = (Math.random() * 1e6) | 0) { const c = this.conductor; c.net = makeInstrument(seed); c.sizes = c.net.sizes; c.lastActs = forward(c.net, inputsAt(0, 0, 0)); c.target = null; c.lossNow = 0; c.hold = true; c.lockKey = true; }
  set({ volume }) { if (volume != null) { this.volume = volume; if (this.master) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05); } }
  setLevel() {}
  scale(f) { scaleAll(this.conductor.net, f); }
  async start() {
    if (this.ctx) { await this.ctx.resume(); this.running = true; return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.audioWorklet.addModule('/assets/js/neural/nn-worklet.js');
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    this.node = new AudioWorkletNode(ctx, 'nn-osc', { numberOfInputs: 0, outputChannelCount: [2] }); this.node.connect(this.master);
    this.running = true; this._push(true);
    this.timer = setInterval(() => this._tick(), 50);
  }
  async pause() { this.running = false; this.noteOff(); if (this.ctx) await this.ctx.suspend(); }
  resume() { return this.start(); }
  reseed(seed) { this.reset(seed); this.teaching = null; this._push(true); }
  noteOn(freq) { if (freq) this.freq = freq; this.gate = true; this._push(); }
  noteOff() { if (!this.hold) { this.gate = false; this._push(); } }
  setHold(v) { this.hold = v; if (v) { this.gate = true; } else this.gate = false; this._push(); }
  setPitch(freq) { this.freq = freq; this._push(); }
  setKnobs({ a, b, wob, wobRate }) { if (a != null) this.a = a; if (b != null) this.b = b; if (wob != null) this.wob = wob; if (wobRate != null) this.wobRate = wobRate; this._push(); }
  _push(withNet = false) {
    if (!this.node) return;
    this.node.port.postMessage({ type: 'play', freq: this.freq, gate: this.gate ? 1 : 0, a: this.a, b: this.b, wob: this.wob, wobRate: this.wobRate, level: 0.3 });
    if (withNet) this.node.port.postMessage({ type: 'net', p: pack(this.conductor.net) });
  }
  /** Start teaching the network a wave for the current knobs. Runs in small chunks so the page stays responsive. */
  teach(wave, { rounds = 160, lr = 0.08 } = {}) { this.teaching = { wave, rounds, done: 0, lr, loss: null, first: null }; }
  stopTeaching() { this.teaching = null; }
  _tick() {
    const c = this.conductor, net = c.net;
    if (this.teaching) {
      const t = this.teaching, l = teachWave(net, t.wave, this.a, this.b, t.lr, 60, this.rng); t.loss = l; if (t.first == null) t.first = l; t.done++;
      c.lossNow = l; if (t.done >= t.rounds) this.teaching = null;
    }
    if (this.sweep) this.phase = (this.phase + 0.012) % 1;
    this.tickNow(); this._push(true); this.onFrame(this.last);
  }
  /** Recomputes what is drawn (one cycle, its harmonics, the neurons' values at the current phase) without touching the audio. */
  tickNow() {
    const c = this.conductor, net = c.net;
    this.cycle = renderCycle(net, this.a, this.b, 256); this.dc = dcOf(this.cycle); this.harm = harmonics(this.cycle, 24);
    c.lastActs = forward(net, inputsAt(this.phase, this.a, this.b));
    this.last = { acts: c.lastActs, cycle: this.cycle, harm: this.harm, dc: this.dc, phase: this.phase, teaching: this.teaching };
  }
}
